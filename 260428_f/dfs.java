/**
 * 시작 노드에서 도달 가능한 영역 안에서 주어진 링크 ID들의 도엽 ID를 찾는다.
 * 입력 linkIds의 순서는 무관하며, 시작점과 직접 연결되어 있지 않아도
 * 도엽 경계를 따라 확장되는 범위 내에서 모두 탐색된다.
 *
 * 처리 흐름:
 *  1. 시작 노드에서 BFS로 도달 가능한 (노드, 도엽) 위치를 모두 수집
 *     - 일반 노드 → 연결된 링크의 반대편 노드로 확장
 *     - 도엽 경계 노드(NODE_KIND=7) → 인접 도엽의 짝 노드로 점프하여 확장
 *  2. 탐색 중 마주친 모든 링크를 (linkId → linkMapId) 맵에 누적
 *  3. 입력된 linkIds를 이 맵에서 룩업하여 결과 반환
 *
 * @param startNodeId    시작 노드 ID
 * @param startNodeMapId 시작 노드 도엽 ID
 * @param linkIds        도엽 ID를 알고 싶은 링크 ID 목록 (순서 무관)
 * @return linkId → linkMapId 매핑 (찾지 못한 링크는 0)
 */
private Map<String, Integer> getMapIdsByNode(
        String startNodeId,
        String startNodeMapId,
        Collection<String> linkIds) throws IOException {

    // ── 탐색 결과 누적 ───────────────────────────────────────────
    // linkId → linkMapId 매핑 (BFS 도중 마주친 모든 링크 기록)
    Map<String, Integer> linkIdToMapId = new HashMap<>();

    // ── BFS 자료구조 ─────────────────────────────────────────────
    // 방문한 (노드, 도엽) 조합 추적 → 무한 루프 방지
    Set<String> visitedNodes = new HashSet<>();
    // 탐색 대기열
    Deque<NodePos> queue = new ArrayDeque<>();

    // 시작 위치를 큐에 투입
    queue.offer(new NodePos(startNodeId, startNodeMapId));
    visitedNodes.add(nodeKey(startNodeId, startNodeMapId));

    // ── BFS 루프 ─────────────────────────────────────────────────
    while (!queue.isEmpty()) {
        NodePos cur = queue.poll();

        // (1) 현재 노드에 연결된 모든 링크 조회
        List<CombinedLinkInfoVo> connectedLinks = dao.selectLinksByNode(Map.of(
            "nodeId",    cur.nodeId,
            "nodeMapId", cur.nodeMapId
        ));

        // (2) 각 링크를 결과 맵에 기록하고, 반대편 노드를 큐에 추가
        for (CombinedLinkInfoVo link : connectedLinks) {

            String linkId    = link.getLinkId().toString();
            int    linkMapId = Integer.parseInt(link.getLinkMapId().toString());

            // 입력된 linkIds 안에 있는 링크라면 결과에 기록
            // (이미 다른 도엽에서 먼저 찾았다면 덮어쓰지 않음 - 시작점에 더 가까운 결과 우선)
            linkIdToMapId.putIfAbsent(linkId, linkMapId);

            // 반대편 노드 결정
            String oppositeNodeId =
                link.getStNdId().toString().equals(cur.nodeId)
                    ? link.getEdNdId().toString()
                    : link.getStNdId().toString();

            // (3) 반대편 노드 정보 조회 (도엽 경계 여부 확인)
            CombinedNodeInfoVo oppositeNode = dao.selectNodeInfo(Map.of(
                "nodeId",    oppositeNodeId,
                "nodeMapId", String.valueOf(linkMapId)
            ));

            if (oppositeNode == null) continue;

            // (4) 다음 탐색 위치 결정
            String nextNodeId;
            String nextNodeMapId;

            if (oppositeNode.getNodeKind() == 7) {
                // 도엽 경계 노드 → 인접 도엽의 짝 노드로 점프
                nextNodeId    = oppositeNode.getAdjNodeId().toString();
                nextNodeMapId = oppositeNode.getAdjNodeMapId().toString();
            } else {
                // 일반 노드 → 그대로 다음 위치
                nextNodeId    = oppositeNodeId;
                nextNodeMapId = String.valueOf(linkMapId);
            }

            // (5) 미방문 노드만 큐에 투입
            String nextKey = nodeKey(nextNodeId, nextNodeMapId);
            if (visitedNodes.add(nextKey)) {
                queue.offer(new NodePos(nextNodeId, nextNodeMapId));
            }

            // (6) 모든 입력 링크를 다 찾았다면 조기 종료 (성능 최적화)
            if (linkIdToMapId.keySet().containsAll(linkIds)) {
                queue.clear();
                break;
            }
        }
    }

    // ── 결과 구성: 입력된 linkIds 모두에 대해 결과 보장 ──────────
    Map<String, Integer> result = new LinkedHashMap<>();
    for (String linkId : linkIds) {
        result.put(linkId, linkIdToMapId.getOrDefault(linkId, 0));
    }
    return result;
}

// ── 보조 클래스 / 유틸리티 ──────────────────────────────────────────

/** BFS 큐에 들어가는 (노드 ID, 도엽 ID) 묶음 */
private static class NodePos {
    final String nodeId;
    final String nodeMapId;

    NodePos(String nodeId, String nodeMapId) {
        this.nodeId = nodeId;
        this.nodeMapId = nodeMapId;
    }
}

/** 방문 체크용 키 생성 */
private static String nodeKey(String nodeId, String nodeMapId) {
    return nodeId + "|" + nodeMapId;
}
