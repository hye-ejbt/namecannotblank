interface SortResult {
  success: boolean;
  sortedLinks: LinkData[];
  errorMessage: string;
}

/**
 * 링크들이 단일 체인(1자형 경로)으로 재정렬 가능한지 확인하고 정렬
 */
function sortAndValidateChain(validLinks: LinkData[]): SortResult {
  if (validLinks.length === 0) {
    return { success: false, sortedLinks: [], errorMessage: '링크가 비어있습니다.' };
  }
  
  if (validLinks.length === 1) {
    return { success: true, sortedLinks: [...validLinks], errorMessage: '' };
  }

  // 1단계: 분기 검사 (각 노드가 몇 개의 링크와 연결되는지)
  const branchCheck = checkNoBranching(validLinks);
  if (!branchCheck.valid) {
    return {
      success: false,
      sortedLinks: [],
      errorMessage: branchCheck.errorMessage,
    };
  }

  // 2단계: 연결 컴포넌트가 1개인지 확인
  const connectivityCheck = checkSingleConnectedComponent(validLinks);
  if (!connectivityCheck.valid) {
    return {
      success: false,
      sortedLinks: [],
      errorMessage: connectivityCheck.errorMessage,
    };
  }

  // 3단계: 실제 경로 구성 (DFS)
  const startLink = findStartLink(validLinks);
  const visited = new Set<number>([startLink.id]);
  const path: LinkData[] = [startLink];

  if (dfsBuildChain(startLink, validLinks, visited, path)) {
    return {
      success: true,
      sortedLinks: path,
      errorMessage: '',
    };
  }

  return {
    success: false,
    sortedLinks: [],
    errorMessage: '링크들을 단일 체인으로 연결할 수 없습니다.',
  };
}

/**
 * 분기 검사: 어떤 노드든 3개 이상의 링크와 연결되면 분기 발생
 */
function checkNoBranching(links: LinkData[]): { valid: boolean; errorMessage: string } {
  // 각 노드별로 연결된 링크 수를 카운트
  const nodeUsage = new Map<number, number[]>(); // nodeId -> linkId[]

  for (const link of links) {
    // 이 링크가 사용하는(접근 가능한) 노드들 수집
    const nodes = new Set<number>([
      ...getOutNodes(link),
      ...getInNodes(link),
    ]);

    for (const nodeId of nodes) {
      if (!nodeUsage.has(nodeId)) {
        nodeUsage.set(nodeId, []);
      }
      nodeUsage.get(nodeId)!.push(link.id);
    }
  }

  // 같은 노드를 공유하는 링크가 3개 이상이면 분기
  for (const [nodeId, linkIds] of nodeUsage) {
    if (linkIds.length >= 3) {
      return {
        valid: false,
        errorMessage: 
          `노드 ${nodeId}에서 분기가 발생했습니다. ` +
          `${linkIds.length}개의 링크(${linkIds.join(', ')})가 이 노드를 공유합니다. ` +
          `단일 체인으로 재정렬할 수 없습니다.`,
      };
    }
  }

  return { valid: true, errorMessage: '' };
}

/**
 * 연결 컴포넌트 검사: 모든 링크가 하나로 이어지는지 (섬이 없는지)
 */
function checkSingleConnectedComponent(
  links: LinkData[]
): { valid: boolean; errorMessage: string } {
  if (links.length === 0) return { valid: true, errorMessage: '' };

  // 링크를 노드로 보고, 두 링크가 연결 가능하면 엣지가 있다고 간주한 뒤 BFS
  const visited = new Set<number>();
  const queue: LinkData[] = [links[0]];
  visited.add(links[0].id);

  while (queue.length > 0) {
    const current = queue.shift()!;

    for (const other of links) {
      if (visited.has(other.id)) continue;

      // 양방향으로 한 번이라도 연결되면 같은 컴포넌트
      if (
        isLinkTopologyConnected(current, other) ||
        isLinkTopologyConnected(other, current)
      ) {
        visited.add(other.id);
        queue.push(other);
      }
    }
  }

  if (visited.size !== links.length) {
    const unreachable = links
      .filter(l => !visited.has(l.id))
      .map(l => l.id);
    return {
      valid: false,
      errorMessage:
        `연결되지 않은 링크가 있습니다: ${unreachable.join(', ')}. ` +
        `분리된 그룹이 존재합니다.`,
    };
  }

  return { valid: true, errorMessage: '' };
}

/**
 * 시작 링크 찾기
 * - endpoint(한쪽에만 연결된 링크)가 있으면 그걸 시작점으로
 * - 없으면 (순환 등) 첫 번째 링크 반환
 */
function findStartLink(links: LinkData[]): LinkData {
  // "들어오는 연결"이 없는 링크 찾기
  for (const candidate of links) {
    const hasIncoming = links.some(
      other => other.id !== candidate.id && isLinkTopologyConnected(other, candidate)
    );
    if (!hasIncoming) {
      return candidate;
    }
  }

  // 모두 양방향 연결 가능한 경우 (순환) - 임의의 링크 반환
  return links[0];
}

/**
 * DFS로 체인 구성
 */
function dfsBuildChain(
  current: LinkData,
  allLinks: LinkData[],
  visited: Set<number>,
  path: LinkData[]
): boolean {
  if (path.length === allLinks.length) {
    return true;
  }

  for (const next of allLinks) {
    if (visited.has(next.id)) continue;
    if (!isLinkTopologyConnected(current, next)) continue;

    visited.add(next.id);
    path.push(next);

    if (dfsBuildChain(next, allLinks, visited, path)) {
      return true;
    }

    visited.delete(next.id);
    path.pop();
  }

  return false;
}
