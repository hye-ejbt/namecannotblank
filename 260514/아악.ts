/**
 * ============================================================
 *  CombinedCommon — 통합분기 진출링크열 연결성 검사
 *
 *  데이터 모델 가정:
 *   - 노드는 nodeXyGrs (물리 좌표) 로 동치 그룹을 형성한다.
 *     같은 nodeXyGrs 의 노드들은 같은 교차로로 본다 (도엽 경계 포함).
 *   - 링크의 stNdId/edNdId 는 그 그룹의 어느 한 노드 ID 일 뿐이고,
 *     "그 그룹과 연결" 되어 있다는 게 본질이다.
 *   - 따라서 노드 ID 가 아니라 nodeXyGrs 를 키로 incidence/연결성을
 *     판정해야 정확하다.
 *
 *  검증 규칙:
 *   - validLinks 의 어느 노드(=nodeXyGrs 그룹)도 incidence ≥ 3 이면
 *     분기 → invalid (직선/루프는 모두 ≤ 2)
 *   - 시작 노드의 nodeXyGrs 그룹에서 출발해 BFS, 모든 validLinks 가
 *     도달되어야 valid
 * ============================================================
 */

interface LinkData {
  id: number;
  mapId: number;
  stNdId: number;
  edNdId: number;
}

interface RenderData {
  fromLinkId: number;
  toLinkId: number;
}

interface CheckChainOptions {
  checkRender?: boolean;
  renders?: RenderData[];
}

interface ConnectivityResult {
  isConnected: boolean;
  errorMessage: string;
  errorMessageDetail: string;
  failedAt?: {
    index: number;
    fromLinkId: number;
    toLinkId: number;
    reason: 'null' | 'render' | 'branch' | 'orphan' | 'no-root' | 'missing-data';
  };
}

/* ============================================================
 *  isConnection — 진입점 (시그니처 유지)
 * ============================================================ */
export function isConnection(
  sortedLinks: { id: number; mapId: number }[],
  node: Node,
  options: CheckChainOptions = {}
): ConnectivityResult {
  if (sortedLinks.length === 0) {
    return {
      isConnected: false,
      errorMessage: '유효하지 않은 진출 링크가 있습니다',
      errorMessageDetail: '진출 링크가 비어 있습니다.',
      failedAt: { index: -1, fromLinkId: -1, toLinkId: -1, reason: 'no-root' },
    };
  }

  // ─── full LinkData 보강 ────────────────────────────────────
  const pLinks: (LinkData | null)[] = sortedLinks.map((m) => resolveLinkData(m.id, m.mapId));

  // 단일 링크 short-circuit (기존 동작 유지)
  if (sortedLinks.length === 1) {
    if (!pLinks[0]) {
      return {
        isConnected: false,
        errorMessage: '유효하지 않은 진출 링크가 있습니다',
        errorMessageDetail: '인덱스 0의 링크가 null입니다.',
        failedAt: { index: 0, fromLinkId: -1, toLinkId: -1, reason: 'null' },
      };
    }
    // 시작 노드와 연결 여부 확인 (nodeXyGrs 기준)
    if (!isLinkAtNode(pLinks[0]!.id, node)) {
      return {
        isConnected: false,
        errorMessage: '유효하지 않은 진출 링크가 있습니다',
        errorMessageDetail: '노드와 연결된 링크가 아닙니다.',
        failedAt: { index: 0, fromLinkId: -1, toLinkId: pLinks[0]!.id, reason: 'no-root' },
      };
    }
    return {
      isConnected: true,
      errorMessage: '노드-링크 연결성 확인',
      errorMessageDetail: '노드-링크 연결성 확인',
    };
  }

  // ─── 분기 금지 + 연결성 검사 (nodeXyGrs 기반) ──────────────
  return checkNoBranchingByXY(pLinks, node, options);
}

/* ============================================================
 *  checkNoBranchingByXY — 신규 (nodeXyGrs 기반)
 *
 *  알고리즘:
 *   ① null 체크
 *   ② validLinks 의 각 링크 양 끝 (stNdId, edNdId) 의 nodeXyGrs 를 조회.
 *      nodeXyGrs 를 키로 "그 위치에 닿는 link id 집합" 맵 (xyToLinks) 빌드.
 *   ③ xyToLinks 의 어느 위치든 incidence ≥ 3 → 분기 invalid
 *   ④ 시작 노드의 nodeXyGrs 그룹에서 BFS — link 그래프에서 (양 끝 위치를
 *      통해) 인접한 link 로 전파. 모든 validLinks 가 방문되어야 valid.
 *   ⑤ (옵션) checkRender 인 경우 BFS 트래버스 시 부모-자식 사이 렌더 검사.
 * ============================================================ */
function checkNoBranchingByXY(
  links: (LinkData | null)[],
  startNode: Node,
  options: CheckChainOptions = {}
): ConnectivityResult {
  const { checkRender = false, renders = [] } = options;

  // ① null 체크
  for (let i = 0; i < links.length; i++) {
    if (!links[i]) {
      return {
        isConnected: false,
        errorMessage: '유효하지 않은 진출 링크가 있습니다',
        errorMessageDetail: `인덱스 ${i}의 링크가 null입니다.`,
        failedAt: { index: i, fromLinkId: -1, toLinkId: -1, reason: 'null' },
      };
    }
  }
  const validLinks = links as LinkData[];

  if (checkRender && renders.length === 0) {
    return {
      isConnected: false,
      errorMessage: '유효하지 않은 진출 링크가 있습니다',
      errorMessageDetail: '렌더 검사가 요청되었지만 렌더 데이터가 제공되지 않았습니다.',
    };
  }

  // ② nodeXyGrs → link id 집합
  // 각 링크의 stNdId/edNdId 노드를 조회해 그 노드의 nodeXyGrs 를 키로 사용
  const xyToLinks = new Map<string, Set<number>>();
  // 각 링크의 양 끝 위치 (디버깅/탐색용)
  const linkEndsXY = new Map<number, { stXY: string | null; edXY: string | null }>();

  for (const link of validLinks) {
    const stXY = getNodeXY(link.stNdId);
    const edXY = getNodeXY(link.edNdId);
    linkEndsXY.set(link.id, { stXY, edXY });

    if (stXY === null || edXY === null) {
      return {
        isConnected: false,
        errorMessage: '유효하지 않은 진출 링크가 있습니다',
        errorMessageDetail:
          `링크 ${link.id} 의 노드(stNdId=${link.stNdId} / edNdId=${link.edNdId}) 위치 정보를 찾을 수 없습니다.`,
        failedAt: {
          index: validLinks.indexOf(link),
          fromLinkId: -1,
          toLinkId: link.id,
          reason: 'missing-data',
        },
      };
    }

    if (!xyToLinks.has(stXY)) xyToLinks.set(stXY, new Set());
    if (!xyToLinks.has(edXY)) xyToLinks.set(edXY, new Set());
    xyToLinks.get(stXY)!.add(link.id);
    xyToLinks.get(edXY)!.add(link.id);
  }

  // ③ 어느 위치든 incidence ≥ 3 이면 분기
  for (const [xy, linkIds] of xyToLinks) {
    if (linkIds.size >= 3) {
      return {
        isConnected: false,
        errorMessage: '유효하지 않은 진출 링크가 있습니다',
        errorMessageDetail:
          `위치 ${xy} 에서 ${linkIds.size}개 링크가 분기됩니다. ` +
          `[${[...linkIds].join(', ')}]`,
        failedAt: {
          index: -1,
          fromLinkId: -1,
          toLinkId: [...linkIds][0],
          reason: 'branch',
        },
      };
    }
  }

  // ④ 시작 노드의 nodeXyGrs 그룹에서 BFS
  const startXY = sid(startNode.getFields().nodeXyGrs);
  const startLinks = xyToLinks.get(startXY);

  if (!startLinks || startLinks.size === 0) {
    return {
      isConnected: false,
      errorMessage: '유효하지 않은 진출 링크가 있습니다',
      errorMessageDetail: `시작 노드(id=${startNode.getNodeId()}, xy=${startXY}) 위치에 연결된 진출 링크가 없습니다.`,
      failedAt: { index: -1, fromLinkId: -1, toLinkId: -1, reason: 'no-root' },
    };
  }

  const visited = new Set<number>();
  const parentOf = new Map<number, number>(); // for render 검사
  const queue: number[] = [];

  for (const id of startLinks) {
    visited.add(id);
    queue.push(id);
  }

  while (queue.length > 0) {
    const linkId = queue.shift()!;
    const ends = linkEndsXY.get(linkId)!;

    for (const xy of [ends.stXY, ends.edXY]) {
      if (!xy) continue;
      const adjLinks = xyToLinks.get(xy);
      if (!adjLinks) continue;
      for (const adjId of adjLinks) {
        if (visited.has(adjId)) continue;

        // 렌더 검사 (옵션)
        if (checkRender) {
          if (!hasRenderBetween(renders, linkId, adjId)) {
            return {
              isConnected: false,
              errorMessage: '유효하지 않은 진출 링크가 있습니다',
              errorMessageDetail: `링크 ${linkId} -> 링크 ${adjId} 사이에 렌더 정보가 없습니다.`,
              failedAt: {
                index: validLinks.findIndex((l) => l.id === adjId),
                fromLinkId: linkId,
                toLinkId: adjId,
                reason: 'render',
              },
            };
          }
        }

        visited.add(adjId);
        parentOf.set(adjId, linkId);
        queue.push(adjId);
      }
    }
  }

  // ⑤ 도달 못 한 링크 검사
  if (visited.size !== validLinks.length) {
    const orphans = validLinks.filter((l) => !visited.has(l.id));
    return {
      isConnected: false,
      errorMessage: '유효하지 않은 진출 링크가 있습니다',
      errorMessageDetail:
        `시작 노드에서 도달 불가능한 링크가 있습니다: [${orphans.map((l) => l.id).join(', ')}]`,
      failedAt: {
        index: validLinks.indexOf(orphans[0]),
        fromLinkId: -1,
        toLinkId: orphans[0].id,
        reason: 'orphan',
      },
    };
  }

  return {
    isConnected: true,
    errorMessage: '노드-링크 연결성 확인',
    errorMessageDetail: '노드-링크 연결성 확인',
  };
}

/* ============================================================
 *  헬퍼들
 * ============================================================ */

/* ============================================================
 *  ID 정규화 — getNodeId() / stNdId / edNdId / nodeXyGrs 가
 *  number / string 어느 쪽으로 와도 같으면 같다고 비교되도록
 *  모든 식별자는 String 으로 coerce 해서 사용한다.
 * ============================================================ */
const sid = (v: unknown): string => String(v ?? '');

/** 노드 ID → nodeXyGrs (문자열로 정규화) */
function getNodeXY(nodeId: unknown): string | null {
  const target = sid(nodeId);
  const features = LayerManager.getInstance().getSource(LayerId.DRAW_LAYER).getFeatures();
  const node = features.find(
    (f: Feature<Geometry>) => f instanceof Node && sid((f as Node).getNodeId()) === target
  ) as Node | undefined;
  if (!node) return null;
  return sid(node.getFields().nodeXyGrs);
}

/** 링크가 노드의 nodeXyGrs 위치에 연결되어 있는가 */
function isLinkAtNode(linkId: number, node: Node): boolean {
  const link = resolveLinkData(linkId, /* mapId 무시 */ -1);
  if (!link) return false;
  const targetXY = sid(node.getFields().nodeXyGrs);
  const stXY = getNodeXY(link.stNdId);
  const edXY = getNodeXY(link.edNdId);
  return stXY === targetXY || edXY === targetXY;
}

/** {id, mapId} → full LinkData (LayerManager 조회) */
function resolveLinkData(linkId: number, mapId: number): LinkData | null {
  const targetLinkId = sid(linkId);
  const targetMapId = sid(mapId);
  const features = LayerManager.getInstance().getSource(LayerId.DRAW_LAYER).getFeatures();
  const link = features.find(
    (f: Feature<Geometry>) =>
      f instanceof Link &&
      sid((f as Link).getLinkId()) === targetLinkId &&
      (mapId === -1 || sid((f as Link).getMapId()) === targetMapId)
  ) as Link | undefined;
  if (!link) return null;
  return {
    id: linkId,
    mapId,
    stNdId: link.getFields().stNdId,
    edNdId: link.getFields().edNdId,
  };
}

declare function hasRenderBetween(
  renders: RenderData[],
  fromLinkId: number,
  toLinkId: number
): boolean;
