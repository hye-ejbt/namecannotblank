private Map<String, Map<Integer, Integer>> getMapIdsByNode(
        int startNodeId,
        int startNodeMapId,
        Collection<Integer> linkIds) throws IOException {

    Map<Integer, Integer> distMap       = new HashMap<>();
    Map<Integer, Integer> linkIdToMapId = new HashMap<>();
    Map<String, Map<Integer, Integer>> result = new HashMap<>();
    result.put("distMap", distMap);
    result.put("linkIds", linkIdToMapId);

    if (linkIds == null || linkIds.isEmpty()) {
        return result;
    }

    Set<Integer> targetLinkIds = new HashSet<>(linkIds);

    // ─────────────────────────────────────────────────────────────
    // (1) 후보 도엽 식별 (입력 링크가 분포한 도엽만 추림)
    //     IN 절 2,100개 제한 대비: 청크 분할 호출
    // ─────────────────────────────────────────────────────────────
    Set<Integer> candidateMapIds = new HashSet<>();
    for (List<Integer> chunk : chunked(new ArrayList<>(linkIds), 1000)) {
        candidateMapIds.addAll(
            dao.selectMapIdsByLinkIds(Map.of("linkIds", chunk))
        );
    }
    candidateMapIds.add(startNodeMapId);  // 시작 도엽 보장

    // ─────────────────────────────────────────────────────────────
    // (2) 그래프 데이터를 메모리로 일괄 로딩
    // ─────────────────────────────────────────────────────────────
    List<LinkVo> allLinks = dao.selectLinksByMapIds(
        Map.of("mapIds", candidateMapIds));
    List<NodeVo> allNodes = dao.selectNodesByMapIds(
        Map.of("mapIds", candidateMapIds));

    // ─────────────────────────────────────────────────────────────
    // (3) 메모리 인덱스 구성 - O(1) 룩업용
    // ─────────────────────────────────────────────────────────────

    // 노드 위치(node+map) → 노드 정보
    Map<Long, NodeVo> nodeIndex = new HashMap<>(allNodes.size() * 2);
    for (NodeVo n : allNodes) {
        nodeIndex.putIfAbsent(nodeKey(n.getNodeId(), n.getNodeMapId()), n);
    }

    // 노드 위치 → 연결된 링크 리스트 (인접 리스트)
    Map<Long, List<LinkVo>> adjacency = new HashMap<>(allLinks.size());
    for (LinkVo l : allLinks) {
        adjacency.computeIfAbsent(nodeKey(l.getStNdId(), l.getLinkMapId()),
                                  k -> new ArrayList<>()).add(l);
        adjacency.computeIfAbsent(nodeKey(l.getEdNdId(), l.getLinkMapId()),
                                  k -> new ArrayList<>()).add(l);
    }

    // ─────────────────────────────────────────────────────────────
    // (4) BFS 실행 - hop 수 기록
    // ─────────────────────────────────────────────────────────────
    Set<Long> visited = new HashSet<>();
    Deque<long[]> queue = new ArrayDeque<>();   // [nodeId, mapId, hop]

    long startKey = nodeKey(startNodeId, startNodeMapId);
    queue.offer(new long[]{startNodeId, startNodeMapId, 0});
    visited.add(startKey);

    while (!queue.isEmpty()) {
        long[] cur = queue.poll();
        int curNodeId    = (int) cur[0];
        int curNodeMapId = (int) cur[1];
        int curHop       = (int) cur[2];

        List<LinkVo> connected = adjacency.getOrDefault(
            nodeKey(curNodeId, curNodeMapId), Collections.emptyList());

        for (LinkVo link : connected) {
            int linkId    = link.getLinkId();
            int linkMapId = link.getLinkMapId();
            int nextHop   = curHop + 1;

            // 입력 링크면 결과 기록 (먼저 도달한 hop 우선 = 더 가까운 경로)
            if (targetLinkIds.contains(linkId)) {
                distMap.putIfAbsent(linkId, nextHop);
                linkIdToMapId.putIfAbsent(linkId, linkMapId);

                // 모든 입력 링크 찾으면 조기 종료
                if (linkIdToMapId.size() == targetLinkIds.size()) {
                    queue.clear();
                    break;
                }
            }

            // 반대편 노드 결정
            int oppositeNodeId = link.getStNdId() == curNodeId
                ? link.getEdNdId() : link.getStNdId();

            // 반대편 노드 정보 룩업 (도엽 경계 여부 확인)
            NodeVo oppNode = nodeIndex.get(nodeKey(oppositeNodeId, linkMapId));

            int nextNodeId;
            int nextNodeMapId;

            if (oppNode != null
                    && oppNode.getNodeKind() != null
                    && oppNode.getNodeKind() == 7
                    && oppNode.getAdjNodeId() != null) {
                // 도엽 경계 → 인접 도엽의 짝 노드로 점프
                nextNodeId    = oppNode.getAdjNodeId();
                nextNodeMapId = oppNode.getAdjNodeMapId();
            } else {
                // 일반 노드 → 그대로 진행
                nextNodeId    = oppositeNodeId;
                nextNodeMapId = linkMapId;
            }

            long nextKey = nodeKey(nextNodeId, nextNodeMapId);
            if (visited.add(nextKey)) {
                queue.offer(new long[]{nextNodeId, nextNodeMapId, nextHop});
            }
        }
    }

    // ─────────────────────────────────────────────────────────────
    // (5) 못 찾은 입력 링크 처리
    //     - distMap에 큰 값을 넣어 정렬 시 맨 뒤로 보냄
    //     - linkMapId는 0으로 표기
    // ─────────────────────────────────────────────────────────────
    for (Integer linkId : linkIds) {
        distMap.putIfAbsent(linkId, Integer.MAX_VALUE);
        linkIdToMapId.putIfAbsent(linkId, 0);
    }

    return result;
}

// ─────────────────────────────────────────────────────────────
// 보조 유틸리티
// ─────────────────────────────────────────────────────────────

/** 노드 위치 키 (nodeId 32bit + mapId 32bit를 long 1개로 합쳐 GC 부담 절감) */
private static long nodeKey(int nodeId, int mapId) {
    return ((long) nodeId << 32) | (mapId & 0xFFFFFFFFL);
}

/** 리스트를 size 단위로 청크 분할 */
private static <T> List<List<T>> chunked(List<T> list, int size) {
    List<List<T>> chunks = new ArrayList<>();
    for (int i = 0; i < list.size(); i += size) {
        chunks.add(list.subList(i, Math.min(i + size, list.size())));
    }
    return chunks;
}
