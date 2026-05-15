/**
 * ============================================================
 *  CombinedCommon — 통합분기 진출링크열 연결성 검사
 *
 *  검증 규칙:
 *   - 시작 노드와 직접 연결된 진출링크는 정확히 1개여야 함
 *   - 그 링크의 edNdId 노드에서 다음으로 이어지는 링크도 정확히 1개여야 함
 *   - 즉, 시작 노드 ~ 종료 링크까지 어느 노드에서도 분기 금지
 *   - 마지막 링크의 edNdId 에서 연결되는 다음 링크가 0개이면 종료 링크로
 *     판단하고 walk 종료. 이 시점에 outLinkIds 가 모두 방문되어야 valid.
 *
 *   원본 isConnection 의 시그니처/도엽 경계 노드 처리/메시지 텍스트 유지.
 *   기존 checkLinkChainConnectivity 는 보존 (렌더 전용 검사 등 다른 용도
 *   호출자가 있을 수 있어 시그니처 그대로 둠).
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
    reason: 'null' | 'render' | 'branch' | 'orphan' | 'no-root' | 'missing-data';
  };
}

/* ============================================================
 *  isConnection — 기존 진입점 (시그니처 유지)
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

  // ─── ② 시작 노드 분기 검사 — 기존 그대로 ────────────────────
  const outLinkIds = sortedLinks;
  const linksAssociatedWithNodes: number[] = nodeOutLinks.filter((f: number) =>
    outLinkIds.map((m) => m.id).includes(f)
  );

  /* 시작 노드와 직접 연결된 링크가 2개 이상 → 시작 노드 분기 */
  if (linksAssociatedWithNodes.length > 1) {
    return {
      isConnected: false,
      errorMessage: '유효하지 않은 진출 링크가 있습니다',
      errorMessageDetail: `시작 노드에서 분기됩니다. (직접 연결 링크 ${linksAssociatedWithNodes.length}개)`,
      failedAt: {
        index: -1,
        fromLinkId: -1,
        toLinkId: linksAssociatedWithNodes[0],
        reason: 'branch',
      },
    };
  }

  /* 시작 노드와 직접 연결된 링크가 0개 */
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
  const pLinks: (LinkData | null)[] = outLinkIds.map((m) => resolveLinkData(m.id, m.mapId));

  // ─── ④ 중간 노드 분기 금지 sequential walk ─────────────────
  return checkSequentialNoBranching(pLinks, linksAssociatedWithNodes[0], options);
}

/* ============================================================
 *  checkSequentialNoBranching — 신규
 *  시작 링크부터 edNdId 를 따라 한 칸씩 전진하면서
 *  매 단계마다 "다음 링크 후보 수" 를 검사.
 *    0개 → 종료 링크로 판단, walk 정상 종료
 *    1개 → 그 링크로 전진
 *    2개+ → 중간 분기 → invalid
 *  walk 종료 후 모든 outLinkIds 가 방문되어야 valid.
 * ============================================================ */
function checkSequentialNoBranching(
  links: (LinkData | null)[],
  rootLinkId: number,
  options: CheckChainOptions = {}
): ConnectivityResult {
  const { checkRender = false, renders = [] } = options;

  // NULL 체크 (checkLinkChainConnectivity 와 동일)
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

  // 루트 링크 결정
  const linkById = new Map<number, LinkData>(validLinks.map((l) => [l.id, l]));
  let currentLink: LinkData | undefined = linkById.get(rootLinkId);

  if (!currentLink) {
    return {
      isConnected: false,
      errorMessage: '유효하지 않은 진출 링크가 있습니다',
      errorMessageDetail: `루트 링크(id=${rootLinkId}) 데이터를 찾을 수 없습니다.`,
      failedAt: { index: -1, fromLinkId: -1, toLinkId: rootLinkId, reason: 'missing-data' },
    };
  }

  // ─── 순차 walk — 각 단계마다 edNdId 기준 분기 검사 ─────────
  const visited = new Set<number>();
  visited.add(currentLink.id);

  while (true) {
    // currentLink.edNdId 에서 출발하는 다음 링크 후보 (outLinkIds 내에서)
    const nextCandidates: LinkData[] = validLinks.filter(
      (l) =>
        l.id !== currentLink!.id &&
        !visited.has(l.id) &&
        l.stNdId === currentLink!.edNdId
    );

    // 종료 링크 — 더 이상 이어지는 링크 없음, 정상 종료
    if (nextCandidates.length === 0) {
      break;
    }

    // 중간 분기 감지 → invalid
    if (nextCandidates.length >= 2) {
      return {
        isConnected: false,
        errorMessage: '유효하지 않은 진출 링크가 있습니다',
        errorMessageDetail:
          `링크 ${currentLink.id}(edNdId=${currentLink.edNdId})에서 분기됩니다. ` +
          `다음 링크 후보 ${nextCandidates.length}개 [${nextCandidates.map((l) => l.id).join(', ')}]`,
        failedAt: {
          index: validLinks.indexOf(currentLink),
          fromLinkId: currentLink.id,
          toLinkId: nextCandidates[0].id,
          reason: 'branch',
        },
      };
    }

    // 단일 다음 링크 — 렌더 검사 (옵션) 후 전진
    const nextLink = nextCandidates[0];

    if (checkRender) {
      if (!hasRenderBetween(renders, currentLink.id, nextLink.id)) {
        return {
          isConnected: false,
          errorMessage: '유효하지 않은 진출 링크가 있습니다',
          errorMessageDetail: `링크 ${currentLink.id} -> 링크 ${nextLink.id} 사이에 렌더 정보가 없습니다.`,
          failedAt: {
            index: validLinks.indexOf(nextLink),
            fromLinkId: currentLink.id,
            toLinkId: nextLink.id,
            reason: 'render',
          },
        };
      }
    }

    currentLink = nextLink;
    visited.add(currentLink.id);
  }

  // ─── walk 종료 후 도달 못 한 링크가 있으면 invalid ────────
  if (visited.size !== validLinks.length) {
    const orphans = validLinks.filter((l) => !visited.has(l.id));
    return {
      isConnected: false,
      errorMessage: '유효하지 않은 진출 링크가 있습니다',
      errorMessageDetail:
        `종료 링크까지 walk 했지만 도달하지 못한 링크가 있습니다: ` +
        `[${orphans.map((l) => l.id).join(', ')}]`,
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
 *  checkLinkChainConnectivity — 기존 함수 보존 (다른 호출자 대비)
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

  if (checkRender && renders.length === 0) {
    return {
      isConnected: false,
      errorMessage: '유효하지 않은 진출 링크가 있습니다',
      errorMessageDetail: '렌더 검사가 요청되었지만 렌더 데이터가 제공되지 않았습니다.',
    };
  }

  for (let i: number = 0; i < links.length - 1; i++) {
    const from: LinkData = links[i]!;
    const to: LinkData = links[i + 1]!;

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
