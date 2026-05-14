/**
 * ============================================================
 *  분기(Y자/T자) 진출링크열 연결성 유효성 검사
 * ============================================================
 *  기존 isConnection / checkLinkChainConnectivity 는
 *  - 노드에 직접 연결된 링크가 2개 이상이면 무조건 invalid
 *  - 링크들을 선형(linear) 체인으로만 검사
 *  하기 때문에 "하나의 노드에서 진출링크가 여러 갈래로 분기"
 *  되는 케이스(지도 우측 하단)를 처리하지 못한다.
 *
 *  본 함수는 진출링크열을 "노드를 루트로 하는 트리" 로 모델링하여
 *  - 루트(노드)에 직접 연결된 링크가 1개 이상이면 시작점으로 인정
 *  - 각 링크의 edNdId == 다음 링크의 stNdId 인 관계로 자식 결정
 *  - DFS 로 트리 전체 순회하면서 사이클/고립/렌더정보 누락 검출
 *  - 모든 링크가 루트로부터 도달 가능해야 valid
 * ============================================================
 */

interface LinkData {
  id: number;
  mapId: number;
  stNdId?: number; // 링크 시작 노드 ID
  edNdId?: number; // 링크 끝 노드 ID
}

interface RenderData {
  fromLinkId: number;
  toLinkId: number;
}

interface CheckChainOptions {
  checkRender?: boolean;
  renders?: RenderData[];
  /** 한 링크의 자식이 N개 이상이면 경고 (기본: 무제한) */
  maxBranchPerLink?: number;
  /** 트리의 최대 깊이 제한 (기본: 무제한) */
  maxDepth?: number;
}

interface ConnectivityResult {
  isConnected: boolean;
  errorMessage: string;
  errorMessageDetail: string;
  failedAt?: {
    index: number;
    fromLinkId: number;
    toLinkId: number;
    reason: 'null' | 'render' | 'cycle' | 'orphan' | 'no-root' | 'multi-root-invalid';
  };
  /** 디버깅용: 트리 순회 결과 */
  traversalInfo?: {
    rootLinkIds: number[];
    visitedLinkIds: number[];
    branchPoints: { nodeId: number; childLinkIds: number[] }[];
  };
}

/**
 * 분기를 허용하는 진출링크열 연결성 검사
 *
 * @param links   진출링크열 (정렬되어 있을 필요 없음)
 * @param node    기준 노드 (진입링크가 도착하는 노드)
 * @param options 옵션 (렌더 검사, 분기 제한 등)
 */
function checkBranchingOutLinkConnectivity(
  links: (LinkData | null)[],
  node: Node,
  options: CheckChainOptions = {}
): ConnectivityResult {
  const {
    checkRender = false,
    renders = [],
    maxBranchPerLink = Infinity,
    maxDepth = Infinity,
  } = options;

  // ─── 1단계: NULL 체크 ───────────────────────────────────────
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

  if (validLinks.length === 0) {
    return {
      isConnected: false,
      errorMessage: '유효하지 않은 진출 링크가 있습니다',
      errorMessageDetail: '진출링크열이 비어있습니다.',
    };
  }

  if (checkRender && renders.length === 0) {
    return {
      isConnected: false,
      errorMessage: '유효하지 않은 진출 링크가 있습니다',
      errorMessageDetail: '렌더 검사가 요청되었지만 렌더 데이터가 제공되지 않았습니다.',
    };
  }

  // ─── 2단계: 노드에 직접 연결된 링크 ID 수집 ─────────────────
  // 인접 노드(nodeKind === 7) 포함 — 기존 isConnection 동일 로직
  const nodeOutLinks: number[] = [...node.getLinkID(false)];

  if (node.getFields().nodeKind === 7) {
    const transNodes: Node[] = LayerManager.getInstance()
      .getSource(LayerId.DRAW_LAYER)
      .getFeatures()
      .filter((i: Feature<Geometry>) =>
        i instanceof Node &&
        i.getFields().nodeXyGrs == node.getFields().nodeXyGrs &&
        i.getNodeId() !== node.getNodeId()
      ) as Node[];

    for (const tNode of transNodes) {
      nodeOutLinks.push(...tNode.getLinkID(false));
    }
  }

  // ─── 3단계: 루트 링크(노드와 직접 연결된 링크) 결정 ─────────
  // 분기 허용 → 루트가 1개 이상이면 OK (기존엔 2개 이상 불가)
  const linkById = new Map<number, LinkData>(
    validLinks.map(l => [l.id, l])
  );

  const rootLinks: LinkData[] = validLinks.filter(l =>
    nodeOutLinks.includes(l.id)
  );

  if (rootLinks.length === 0) {
    return {
      isConnected: false,
      errorMessage: '유효하지 않은 진출 링크가 있습니다',
      errorMessageDetail: '노드와 직접 연결된 시작 링크가 없습니다.',
      failedAt: { index: -1, fromLinkId: -1, toLinkId: -1, reason: 'no-root' },
    };
  }

  // ─── 4단계: 인접 리스트(트리 구조) 구성 ─────────────────────
  // from.edNdId === to.stNdId 면 to 가 from 의 자식
  const childrenOf = new Map<number, LinkData[]>();
  for (const from of validLinks) {
    const children = validLinks.filter(to =>
      to.id !== from.id &&
      from.edNdId !== undefined &&
      to.stNdId !== undefined &&
      from.edNdId === to.stNdId
    );
    childrenOf.set(from.id, children);
  }

  // ─── 5단계: 분기 제한 체크 (옵션) ───────────────────────────
  const branchPoints: { nodeId: number; childLinkIds: number[] }[] = [];
  for (const [linkId, children] of childrenOf.entries()) {
    if (children.length >= 2) {
      const fromLink = linkById.get(linkId)!;
      branchPoints.push({
        nodeId: fromLink.edNdId ?? -1,
        childLinkIds: children.map(c => c.id),
      });
    }
    if (children.length > maxBranchPerLink) {
      return {
        isConnected: false,
        errorMessage: '유효하지 않은 진출 링크가 있습니다',
        errorMessageDetail:
          `링크 ${linkId} 의 분기 수(${children.length})가 허용치(${maxBranchPerLink})를 초과합니다.`,
        failedAt: {
          index: validLinks.findIndex(l => l.id === linkId),
          fromLinkId: linkId,
          toLinkId: children[0].id,
          reason: 'multi-root-invalid',
        },
      };
    }
  }

  // ─── 6단계: DFS 로 트리 순회 + 검증 ─────────────────────────
  const visited = new Set<number>();
  const stack: { link: LinkData; parent: LinkData | null; depth: number }[] =
    rootLinks.map(l => ({ link: l, parent: null, depth: 0 }));

  while (stack.length > 0) {
    const { link, parent, depth } = stack.pop()!;

    // 사이클 검출
    if (visited.has(link.id)) {
      // 이미 방문 — 다른 루트에서도 도달 가능한 케이스라 무시할 수도 있지만
      // 진출링크열은 트리여야 하므로 cycle 로 간주
      return {
        isConnected: false,
        errorMessage: '유효하지 않은 진출 링크가 있습니다',
        errorMessageDetail: `링크 ${link.id} 가 두 개 이상의 경로에서 도달됩니다 (사이클/중복 경로).`,
        failedAt: {
          index: validLinks.findIndex(l => l.id === link.id),
          fromLinkId: parent?.id ?? -1,
          toLinkId: link.id,
          reason: 'cycle',
        },
      };
    }
    visited.add(link.id);

    if (depth > maxDepth) {
      return {
        isConnected: false,
        errorMessage: '유효하지 않은 진출 링크가 있습니다',
        errorMessageDetail: `링크 체인 깊이(${depth})가 허용치(${maxDepth})를 초과합니다.`,
        failedAt: {
          index: validLinks.findIndex(l => l.id === link.id),
          fromLinkId: parent?.id ?? -1,
          toLinkId: link.id,
          reason: 'orphan',
        },
      };
    }

    // 렌더 정보 확인
    if (checkRender && parent) {
      if (!hasRenderBetween(renders, parent.id, link.id)) {
        return {
          isConnected: false,
          errorMessage: '유효하지 않은 진출 링크가 있습니다',
          errorMessageDetail:
            `링크 ${parent.id} -> 링크 ${link.id} 사이에 렌더 정보가 없습니다.`,
          failedAt: {
            index: validLinks.findIndex(l => l.id === link.id),
            fromLinkId: parent.id,
            toLinkId: link.id,
            reason: 'render',
          },
        };
      }
    }

    const kids = childrenOf.get(link.id) ?? [];
    for (const c of kids) {
      stack.push({ link: c, parent: link, depth: depth + 1 });
    }
  }

  // ─── 7단계: 고립된 링크 검출 ────────────────────────────────
  // 루트로부터 도달 불가능한 링크가 있으면 invalid
  if (visited.size !== validLinks.length) {
    const orphans = validLinks.filter(l => !visited.has(l.id));
    return {
      isConnected: false,
      errorMessage: '유효하지 않은 진출 링크가 있습니다',
      errorMessageDetail:
        `루트(노드)로부터 도달 불가능한 링크: [${orphans.map(l => l.id).join(', ')}]`,
      failedAt: {
        index: validLinks.findIndex(l => l.id === orphans[0].id),
        fromLinkId: -1,
        toLinkId: orphans[0].id,
        reason: 'orphan',
      },
    };
  }

  // ─── 검증 완료 ──────────────────────────────────────────────
  return {
    isConnected: true,
    errorMessage: '진출링크열 분기 연결성 확인',
    errorMessageDetail:
      `노드-링크 연결성 확인 (루트 ${rootLinks.length}개, 분기점 ${branchPoints.length}개, 총 ${visited.size}개 링크)`,
    traversalInfo: {
      rootLinkIds: rootLinks.map(l => l.id),
      visitedLinkIds: Array.from(visited),
      branchPoints,
    },
  };
}

/**
 * 기존 hasRenderBetween 가 있다면 그것을 재사용.
 * 여기서는 시그니처만 명시.
 */
declare function hasRenderBetween(
  renders: RenderData[],
  fromLinkId: number,
  toLinkId: number
): boolean;

/* ============================================================
 * 사용 예시 (sortLinksByConnectivity 호출부 수정)
 * ============================================================ */
//
// } else {
//   // 분기를 허용하므로 정렬 결과 길이 비교는 생략하거나
//   // sortedLinks.length === 0 만 체크
//   const sortOutLinksResult = sortLinksByConnectivity(
//     addOutLinks,
//     String(store.node?.getNodeId() || '0')
//   );
//
//   if (sortOutLinksResult.sortedLinks.length === 0) {
//     return message.error('유효하지 않은 진출링크입니다.');
//   }
//
//   const sortedLinks: LinkData[] = sortOutLinksResult.sortedLinks;
//
//   const result = checkBranchingOutLinkConnectivity(sortedLinks, store.node!);
//
//   if (!result.isConnected) {
//     console.log('통합분기 진출링크 유효성 검사 결과 :', result.errorMessageDetail);
//     return message.error('유효하지 않은 진출링크입니다.');
//   }
//
//   // ... 이후 genPatternCode / addPatternInputCode 호출
// }
