/**
 * ============================================================
 *  CombinedCommon — 통합분기 진출링크열 연결성 검사
 *
 *  기존 isConnection / checkLinkChainConnectivity 의 시그니처와
 *  보조 로직을 유지한 채, "노드와 직접 연결된 진출링크가 2개 이상
 *  이면 무조건 invalid" 처리 부분만 분기 트리 BFS 검사로 교체한다.
 *
 *  교체 전:
 *    if (linksAssociatedWithNodes.length > 1) return invalid;
 *
 *  교체 후:
 *    - 1개  → 기존 선형 체인 검사 (checkLinkChainConnectivity)
 *    - 2개+ → 분기 트리 검사 (checkBranchingTreeConnectivity)
 *            : 노드를 루트, 각 진출링크를 자식으로 두는 트리를 BFS
 *              순회하며, 모든 링크가 도달 가능하고 사이클/렌더 누락이
 *              없는지 확인. 각 갈래 내부 체인은 기존
 *              checkLinkChainConnectivity 로 위임.
 * ============================================================
 */

interface LinkData {
  id: number;
  mapId: number;
  stNdId: number; // 링크 시작 노드 ID
  edNdId: number; // 링크 끝 노드 ID
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
    reason: 'null' | 'render' | 'cycle' | 'orphan' | 'no-root';
  };
}

/* ============================================================
 *  isConnection — 기존 진입점 (시그니처 유지)
 * ============================================================
 *  호출부에서 sortedLinks: {id, mapId}[] 만 넘기는 패턴은
 *  분기 검증에 필요한 stNdId/edNdId 가 없어 한계가 있으므로,
 *  내부에서 LayerManager 로 full LinkData 를 조회해 보강한다.
 *  (호출부 코드는 그대로 두어도 됨)
 * ============================================================ */
export function isConnection(
  sortedLinks: { id: number; mapId: number }[],
  node: Node,
  options: CheckChainOptions = {}
): ConnectivityResult {
  // ─── ① 노드(+인접노드)의 진출링크 ID 풀 — 기존 로직 유지 ───
  const nodeOutLinks: number[] = [...node.getLinkID(false)];

  /* 인접 노드인 경우 인접노드의 진출링크열 추가 */
  if (node.getFields().nodeKind === 7) {
    const transNode: Node[] = LayerManager.getInstance()
      .getSource(LayerId.DRAW_LAYER)
      .getFeatures()
      .filter(
        (i: Feature<Geometry>) =>
          i instanceof Node &&
          i.getFields().nodeXyGrs == node.getFields().nodeXyGrs &&
          i.getNodeId() !== node.getNodeId()
      ) as Node[];

    for (const item of transNode) {
      nodeOutLinks.push(...item.getLinkID(false));
    }
  }

  // ─── ② 노드와 직접 연결된 진출링크 (= 트리 루트) ────────────
  const outLinkIds = sortedLinks;
  const linksAssociatedWithNodes: number[] = nodeOutLinks.filter((f: number) =>
    outLinkIds.map((m) => m.id).includes(f)
  );

  /* 노드에 연결된 진출링크가 0개 — 기존 메시지 그대로 */
  if (linksAssociatedWithNodes.length === 0) {
    return {
      isConnected: false,
      errorMessage: '유효하지 않은 진출 링크가 있습니다',
      errorMessageDetail: '노드와 연결된 링크가 아닙니다.',
      failedAt: { index: -1, fromLinkId: -1, toLinkId: -1, reason: 'no-root' },
    };
  }

  /* 노드에 연결된 진출링크가 1개 + 전체도 1개 — 기존 short-circuit 유지 */
  if (linksAssociatedWithNodes.length === 1 && outLinkIds.length === 1) {
    return {
      isConnected: true,
      errorMessage: '노드-링크 연결성 확인',
      errorMessageDetail: '노드-링크 연결성 확인',
    };
  }

  // ─── ③ Lightweight {id, mapId} → full LinkData 보강 ────────
  // checkLinkChainConnectivity / 분기 검사 모두 stNdId/edNdId 필요
  const pLinks: (LinkData | null)[] = outLinkIds.map((m) => resolveLinkData(m.id, m.mapId));

  /* 노드에 연결된 진출링크가 1개 (전체는 N개) — 기존 선형 체인 검사 */
  if (linksAssociatedWithNodes.length === 1) {
    return checkLinkChainConnectivity(pLinks, options);
  }

  // ─── ④ 노드에 연결된 진출링크가 2개 이상 — 분기 트리 검사 ──
  // 기존엔 여기서 무조건 invalid 였음.
  return checkBranchingTreeConnectivity(pLinks, linksAssociatedWithNodes, node, options);
}

/* ============================================================
 *  checkLinkChainConnectivity — 기존 함수 (선형 체인 검사) 유지
 * ============================================================ */
export function checkLinkChainConnectivity(
  links: (LinkData | null)[],
  options: CheckChainOptions = {}
): ConnectivityResult {
  const { checkRender = false, renders = [] } = options;

  // NULL 체크
  for (let i: number = 0; i < links.length; i++) {
    if (!links[i]) {
      return {
        isConnected: false,
        errorMessage: '유효하지 않은 진출 링크가 있습니다',
        errorMessageDetail: `인덱스 ${i}의 링크가 null입니다.`,
        failedAt: { index: i, fromLinkId: -1, toLinkId: -1, reason: 'null' },
      };
    }
  }

  // checkRender가 true인데 renders가 비어있으면 경고
  if (checkRender && renders.length === 0) {
    return {
      isConnected: false,
      errorMessage: '유효하지 않은 진출 링크가 있습니다',
      errorMessageDetail: '렌더 검사가 요청되었지만 렌더 데이터가 제공되지 않았습니다.',
    };
  }

  // 연속된 링크 쌍에 대해 체크
  for (let i: number = 0; i < links.length - 1; i++) {
    const from: LinkData = links[i]!;
    const to: LinkData = links[i + 1]!;

    // 3단계: 렌더 정보 확인 (옵션)
    if (checkRender) {
      if (!hasRenderBetween(renders, from.id, to.id)) {
        return {
          isConnected: false,
          errorMessage: '유효하지 않은 진출 링크가 있습니다',
          errorMessageDetail: `링크 ${from.id} -> 링크 ${to.id} 사이에 렌더 정보가 없습니다.`,
          failedAt: { index: i, fromLinkId: from.id, toLinkId: to.id, reason: 'render' },
        };
      }
    }
  }

  return {
    isConnected: true,
    errorMessage: '노드-링크 연결성 확인',
    errorMessageDetail: '노드-링크 연결성 확인',
  };
}

/* ============================================================
 *  checkBranchingTreeConnectivity — 신규
 *  노드에 직접 연결된 진출링크가 2개 이상일 때 (Y자/T자 분기)
 *  진출링크열을 트리로 보고 BFS 로 도달성 검사
 * ============================================================ */
function checkBranchingTreeConnectivity(
  links: (LinkData | null)[],
  rootLinkIds: number[],
  startNode: Node,
  options: CheckChainOptions = {}
): ConnectivityResult {
  const { checkRender = false, renders = [] } = options;

  // ─── NULL 체크 (checkLinkChainConnectivity 와 동일) ────────
  for (let i: number = 0; i < links.length; i++) {
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

  // ─── 인접 리스트 구성 ─────────────────────────────────────
  // from.edNdId === to.stNdId 면 to 가 from 의 자식
  const linkById = new Map<number, LinkData>(validLinks.map((l) => [l.id, l]));
  const childrenOf = new Map<number, LinkData[]>();
  for (const from of validLinks) {
    const children = validLinks.filter(
      (to) => to.id !== from.id && from.edNdId === to.stNdId
    );
    childrenOf.set(from.id, children);
  }

  // ─── 루트 결정 — 노드 ID 기준으로 시작 방향 판정 ──────────
  // startNode 와 직접 연결된 링크들 중에서, "노드를 시작점으로 갖는"
  // 쪽 (link.stNdId === startNodeId) 을 우선 루트로 본다.
  // (양방향 데이터 안전을 위해 edNdId 일치 케이스도 허용)
  const startNodeId = startNode.getNodeId();
  const rootLinks: LinkData[] = rootLinkIds
    .map((id) => linkById.get(id))
    .filter((l): l is LinkData => l !== undefined);

  if (rootLinks.length === 0) {
    return {
      isConnected: false,
      errorMessage: '유효하지 않은 진출 링크가 있습니다',
      errorMessageDetail: '루트 링크 데이터를 찾을 수 없습니다.',
      failedAt: { index: -1, fromLinkId: -1, toLinkId: -1, reason: 'no-root' },
    };
  }

  // ─── BFS 트리 순회 ────────────────────────────────────────
  const visited = new Set<number>();
  const stack: { link: LinkData; parent: LinkData | null; index: number }[] =
    rootLinks.map((l) => ({ link: l, parent: null, index: validLinks.indexOf(l) }));

  while (stack.length > 0) {
    const { link, parent, index } = stack.pop()!;

    // 사이클/중복 도달 — 진출링크열은 트리여야 함
    if (visited.has(link.id)) {
      return {
        isConnected: false,
        errorMessage: '유효하지 않은 진출 링크가 있습니다',
        errorMessageDetail: `링크 ${link.id} 가 두 개 이상의 경로에서 도달됩니다 (사이클/중복).`,
        failedAt: {
          index,
          fromLinkId: parent?.id ?? -1,
          toLinkId: link.id,
          reason: 'cycle',
        },
      };
    }
    visited.add(link.id);

    // 렌더 정보 확인 (옵션) — 부모-자식 사이
    if (checkRender && parent) {
      if (!hasRenderBetween(renders, parent.id, link.id)) {
        return {
          isConnected: false,
          errorMessage: '유효하지 않은 진출 링크가 있습니다',
          errorMessageDetail: `링크 ${parent.id} -> 링크 ${link.id} 사이에 렌더 정보가 없습니다.`,
          failedAt: { index, fromLinkId: parent.id, toLinkId: link.id, reason: 'render' },
        };
      }
    }

    // 자식 push
    const kids = childrenOf.get(link.id) ?? [];
    for (const c of kids) {
      stack.push({ link: c, parent: link, index: validLinks.indexOf(c) });
    }
  }

  // ─── 고립된 링크 검출 ────────────────────────────────────
  if (visited.size !== validLinks.length) {
    const orphans = validLinks.filter((l) => !visited.has(l.id));
    return {
      isConnected: false,
      errorMessage: '유효하지 않은 진출 링크가 있습니다',
      errorMessageDetail: `루트로부터 도달 불가능한 링크: [${orphans
        .map((l) => l.id)
        .join(', ')}]`,
      failedAt: {
        index: validLinks.indexOf(orphans[0]),
        fromLinkId: -1,
        toLinkId: orphans[0].id,
        reason: 'orphan',
      },
    };
  }

  // ─── 검증 완료 — 기존과 동일한 메시지 ─────────────────────
  return {
    isConnected: true,
    errorMessage: '노드-링크 연결성 확인',
    errorMessageDetail: '노드-링크 연결성 확인',
  };
}

/* ============================================================
 *  resolveLinkData — {id, mapId} → full LinkData
 *  LayerManager 에서 LinkData 를 조회 (프로젝트 헬퍼가 있다면 그것으로 교체)
 * ============================================================ */
function resolveLinkData(linkId: number, mapId: number): LinkData | null {
  const features = LayerManager.getInstance()
    .getSource(LayerId.DRAW_LAYER)
    .getFeatures();

  const link = features.find(
    (f: Feature<Geometry>) =>
      f instanceof Link && (f as Link).getLinkId() === linkId && (f as Link).getMapId() === mapId
  ) as Link | undefined;

  if (!link) return null;

  return {
    id: linkId,
    mapId: mapId,
    stNdId: link.getFields().stNdId,
    edNdId: link.getFields().edNdId,
  };
}

/**
 * hasRenderBetween — 기존 프로젝트 함수 재사용
 */
declare function hasRenderBetween(
  renders: RenderData[],
  fromLinkId: number,
  toLinkId: number
): boolean;
