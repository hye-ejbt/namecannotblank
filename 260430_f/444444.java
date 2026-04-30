/**
 * 시작 노드에서 출발하여 입력 링크들을 따라 진행하며
 * 도착 순서대로 번호를 부여한다.
 *
 * 다익스트라/BFS의 "최단 거리" 개념을 버리고
 * 단순히 링크열을 따라가는 순회로 단순화.
 *
 * @return Map with:
 *   - "distMap": linkId → 도착 순서 (1, 2, 3...)
 *   - "linkIds": linkId → linkMapId
 */
private Map<String, Map<Integer, Integer>> getMapIdsByNode(
        int startNodeId,
        int startNodeMapId,
        Collection<Integer> linkIds) throws IOException {

    Map<Integer, Integer> distMap       = new HashMap<>();
    Map<Integer, Integer> linkIdToMapId = new HashMap<>();
    Map<String, Map<Integer, Integer>> result = new HashMap<>();
    result.put("distMap", distMap);
    result.put("linkIds", linkIdToMapId);

    if (linkIds == null || linkIds.isEmpty()) return result;

    Set<Integer> targetLinkIds = new HashSet<>(linkIds);

    // 도엽 lazy 로딩용 메모리 인덱스
    Set<Integer> loadedMapIds = new HashSet<>();
    Map<Long, NodeVo> nodeIndex = new HashMap<>();
    Map<Long, List<LinkVo>> adjacency = new HashMap<>();
    loadMapData(startNodeMapId, loadedMapIds, nodeIndex, adjacency);

    // ─────────────────────────────────────────────────────────────
    // 단순 순회: 현재 노드 → 다음 입력 링크 → 다음 노드 → ...
    // ─────────────────────────────────────────────────────────────
    Set<Integer> visitedLinks = new HashSet<>();
    int curNodeId    = startNodeId;
    int curNodeMapId = startNodeMapId;
    int order = 0;

    // 분기가 있을 수 있으므로 BFS 큐 사용 (단, 최단거리 개념 없이 진입 순서대로)
    Deque<int[]> queue = new ArrayDeque<>();
    queue.offer(new int[]{curNodeId, curNodeMapId});

    while (!queue.isEmpty()) {
        int[] cur = queue.poll();
        curNodeId    = cur[0];
        curNodeMapId = cur[1];

        List<LinkVo> connected = adjacency.getOrDefault(
            nodeKey(curNodeId, curNodeMapId), Collections.emptyList());

        for (LinkVo link : connected) {
            int linkId    = link.getLinkId();
            int linkMapId = link.getLinkMapId();

            // 입력 링크가 아니면 무시
            if (!targetLinkIds.contains(linkId)) continue;
            // 이미 방문한 링크면 스킵
            if (!visitedLinks.add(linkId)) continue;

            // 도착 순서 부여
            distMap.put(linkId, ++order);
            linkIdToMapId.put(linkId, linkMapId);

            // 모두 찾으면 종료
            if (visitedLinks.size() == targetLinkIds.size()) {
                queue.clear();
                break;
            }

            // 반대편 노드 결정
            int oppositeNodeId = link.getStNdId() == curNodeId
                ? link.getEdNdId() : link.getStNdId();

            NodeVo oppNode = nodeIndex.get(nodeKey(oppositeNodeId, linkMapId));

            int nextNodeId, nextNodeMapId;
            if (oppNode != null
                    && oppNode.getNodeKind() != null
                    && oppNode.getNodeKind() == 7
                    && oppNode.getAdjNodeId() != null) {
                // 도엽 경계 → 짝 노드로 점프
                nextNodeId    = oppNode.getAdjNodeId();
                nextNodeMapId = oppNode.getAdjNodeMapId();
                if (!loadedMapIds.contains(nextNodeMapId)) {
                    loadMapData(nextNodeMapId, loadedMapIds, nodeIndex, adjacency);
                }
            } else {
                nextNodeId    = oppositeNodeId;
                nextNodeMapId = linkMapId;
            }

            // 다음 노드를 큐에 투입 (최단거리 체크 없음, 단순 진행)
            queue.offer(new int[]{nextNodeId, nextNodeMapId});
        }
    }

    // 못 찾은 링크 처리
    for (Integer linkId : linkIds) {
        distMap.putIfAbsent(linkId, Integer.MAX_VALUE);
        linkIdToMapId.putIfAbsent(linkId, 0);
    }

    return result;
}
