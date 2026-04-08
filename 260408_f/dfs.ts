interface SortResult {
  success: boolean;
  sortedLinks: LinkData[];
  errorMessage: string;
  unusedLinks?: LinkData[]; // 정렬에 포함되지 못한 링크들
}

/**
 * 순서 없는 링크들을 연결성 기준으로 순차 정렬
 * @param links 정렬할 링크 배열 (순서 무관)
 * @returns 연결 순서대로 정렬된 링크 배열
 */
function sortLinksByConnectivity(links: LinkData[]): SortResult {
  // 엣지 케이스
  if (links.length === 0) {
    return {
      success: false,
      sortedLinks: [],
      errorMessage: '링크가 비어있습니다.',
    };
  }

  if (links.length === 1) {
    return {
      success: true,
      sortedLinks: [...links],
      errorMessage: '',
    };
  }

  // NULL 체크
  const validLinks = links.filter((l): l is LinkData => l != null);
  if (validLinks.length !== links.length) {
    return {
      success: false,
      sortedLinks: [],
      errorMessage: 'null인 링크가 포함되어 있습니다.',
    };
  }

  // 1. 시작점 후보 찾기: "들어오는 연결이 없는" 링크 우선
  const startCandidates = findStartCandidates(validLinks);

  // 2. 각 시작점에서 DFS로 전체 경로 탐색
  for (const startLink of startCandidates) {
    const visited = new Set<number>([startLink.id]);
    const path: LinkData[] = [startLink];

    if (dfsBuildChain(startLink, validLinks, visited, path)) {
      return {
        success: true,
        sortedLinks: path,
        errorMessage: '',
      };
    }
  }

  // 3. 완전한 정렬에 실패한 경우, 부분 정렬이라도 시도
  const partialResult = findLongestChain(validLinks);
  const usedIds = new Set(partialResult.map((l) => l.id));
  const unused = validLinks.filter((l) => !usedIds.has(l.id));

  return {
    success: false,
    sortedLinks: partialResult,
    errorMessage:
      `모든 링크를 연결할 수 없습니다. ` +
      `최대 ${partialResult.length}/${validLinks.length}개 연결됨. ` +
      `미사용: ${unused.map((l) => l.id).join(', ')}`,
    unusedLinks: unused,
  };
}

/**
 * 시작점 후보 찾기
 * - "다른 어떤 링크에서도 진입되지 않는" 링크가 자연스러운 시작점
 * - 그런 링크가 없으면 모든 링크를 시작점 후보로 반환
 */
function findStartCandidates(links: LinkData[]): LinkData[] {
  const candidates: LinkData[] = [];

  for (const candidate of links) {
    // 다른 어떤 링크가 candidate로 진입할 수 있는지 확인
    const hasIncoming = links.some(
      (other) =>
        other.id !== candidate.id &&
        isLinkTopologyConnected(other, candidate)
    );

    if (!hasIncoming) {
      candidates.push(candidate);
    }
  }

  // 시작 후보가 없다면 (순환이거나 모두 양방향) 모든 링크를 시도
  return candidates.length > 0 ? candidates : [...links];
}

/**
 * DFS 백트래킹으로 모든 링크를 사용하는 경로 탐색
 */
function dfsBuildChain(
  current: LinkData,
  allLinks: LinkData[],
  visited: Set<number>,
  path: LinkData[]
): boolean {
  // 종료 조건: 모든 링크를 방문했으면 성공
  if (path.length === allLinks.length) {
    return true;
  }

  // current와 연결 가능한 다음 링크 후보들 탐색
  for (const next of allLinks) {
    if (visited.has(next.id)) continue;
    if (!isLinkTopologyConnected(current, next)) continue;

    // 선택
    visited.add(next.id);
    path.push(next);

    // 재귀 탐색
    if (dfsBuildChain(next, allLinks, visited, path)) {
      return true;
    }

    // 백트래킹
    visited.delete(next.id);
    path.pop();
  }

  return false;
}

/**
 * 모든 링크를 연결할 수 없을 때, 가능한 가장 긴 체인을 찾기
 */
function findLongestChain(links: LinkData[]): LinkData[] {
  let longest: LinkData[] = [];

  for (const start of links) {
    const visited = new Set<number>([start.id]);
    const path: LinkData[] = [start];
    const result = dfsLongestChain(start, links, visited, path, [...path]);

    if (result.length > longest.length) {
      longest = result;
    }
  }

  return longest;
}

function dfsLongestChain(
  current: LinkData,
  allLinks: LinkData[],
  visited: Set<number>,
  path: LinkData[],
  bestSoFar: LinkData[]
): LinkData[] {
  let best = path.length > bestSoFar.length ? [...path] : bestSoFar;

  for (const next of allLinks) {
    if (visited.has(next.id)) continue;
    if (!isLinkTopologyConnected(current, next)) continue;

    visited.add(next.id);
    path.push(next);

    best = dfsLongestChain(next, allLinks, visited, path, best);

    visited.delete(next.id);
    path.pop();
  }

  return best;
}
