/**
 * 시작 노드에서 도달 가능한 영역 안에서 주어진 링크 ID들의 도엽 ID를 찾는다.
 * (DAO 호출 1회로 링크 + 반대편 노드 정보를 동시에 가져오는 최적화 버전)
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

    // 결과 누적: linkId → linkMapId
    Map<String, Integer> linkIdToMapId = new HashMap<>();

    // 빠른 룩업용 Set (containsAll 대신 카운트 비교로 조기 종료 판단)
    Set<String> targetLinkIds = new HashSet<>(linkIds);
    int totalTargets = targetLinkIds.size();

    // BFS 자료구조
    Set<String> visitedNodes = new HashSet<>();
    Deque<NodePos> queue = new ArrayDeque<>();

    queue.offer(new NodePos(startNodeId, startNodeMapId));
    visitedNodes.add(nodeKey(startNodeId, startNodeMapId));

    // ── BFS 루프 ─────────────────────────────────────────────────
    while (!queue.isEmpty()) {
        NodePos cur = queue.poll();

        // (1) 현재 노드의 연결 링크 + 반대편 노드 정보를 한 번에 조회
        //     기존 selectLinksByNode + N회 selectNodeInfo → 1회 JOIN 쿼리로 통합
        List<LinkWithOppositeNodeVo> rows = dao.selectLinksWithOppositeNode(Map.of(
            "nodeId",    cur.nodeId,
            "nodeMapId", cur.nodeMapId
        ));

        // (2) 각 링크 처리
        for (LinkWithOppositeNodeVo row : rows) {

            String linkId    = row.getLinkId().toString();
            int    linkMapId = row.getLinkMapId();

            // 입력에 포함된 링크라면 결과에 기록
            if (targetLinkIds.contains(linkId)) {
                linkIdToMapId.putIfAbsent(linkId, linkMapId);
            }

            // (3) 다음 탐색 위치 결정 - 추가 DB 호출 없이 처리 가능
            String oppositeNodeId =
                row.getStNdId().toString().equals(cur.nodeId)
                    ? row.getEdNdId().toString()
                    : row.getStNdId().toString();

            String nextNodeId;
            String nextNodeMapId;

            // 반대편 노드의 정보가 LEFT JOIN으로 함께 들어왔으므로 즉시 판단 가능
            if (row.getOppNodeKind() != null && row.getOppNodeKind() == 7
                    && row.getOppAdjNodeId() != null) {
                // 도엽 경계 → 인접 도엽 짝 노드로 점프
                nextNodeId    = row.getOppAdjNodeId().toString();
                nextNodeMapId = row.getOppAdjNodeMapId().toString();
            } else {
                // 일반 노드 → 그대로 진행
                nextNodeId    = oppositeNodeId;
                nextNodeMapId = String.valueOf(linkMapId);
            }

            // (4) 미방문이면 큐에 추가
            String nextKey = nodeKey(nextNodeId, nextNodeMapId);
            if (visitedNodes.add(nextKey)) {
                queue.offer(new NodePos(nextNodeId, nextNodeMapId));
            }

            // (5) 모든 입력 링크를 찾았다면 조기 종료
            if (linkIdToMapId.size() == totalTargets) {
                queue.clear();
                break;
            }
        }
    }

    // 결과 구성: 못 찾은 링크는 0
    Map<String, Integer> result = new LinkedHashMap<>();
    for (String linkId : linkIds) {
        result.put(linkId, linkIdToMapId.getOrDefault(linkId, 0));
    }
    return result;
}
