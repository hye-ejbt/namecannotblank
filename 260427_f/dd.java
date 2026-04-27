/**
 * 시작 노드에서 출발하여 링크 시퀀스를 따라가며 각 링크의 도엽 ID를 반환한다.
 *
 * 처리 흐름:
 *  1. 현재 위치(curNodeId, curMapId)에서 nextLinkId와 매칭되는 링크 검색
 *     - 같은 도엽 안에서 "현재 노드에 연결된 링크 중 LINK_ID 일치"를 시도
 *  2. 매칭되면 그 링크의 LINK_MAP_ID를 결과에 추가
 *  3. 링크의 반대편 노드로 이동
 *     - 반대편 노드가 NODE_KIND=7(도엽 경계)이면 인접 도엽의 짝 노드로 점프
 *     - 일반 노드면 그대로 다음 위치로 갱신
 *  4. 다음 링크에 대해 1~3 반복
 *
 * @param startNodeId    시작 노드 ID
 * @param startNodeMapId 시작 노드 도엽 ID
 * @param linkSeq        따라갈 링크 ID 목록 (순서대로)
 * @return 각 링크의 도엽 ID 목록 (linkSeq와 동일 순서)
 */
private List<Integer> getMapIdsByNode(
        String startNodeId,
        String startNodeMapId,
        List<String> linkSeq) throws IOException {

    List<Integer> resultMapIds = new ArrayList<>();

    // 현재 위치 추적용 (반복문이 진행되며 갱신됨)
    String curNodeId    = startNodeId;
    String curNodeMapId = startNodeMapId;

    for (String nextLinkId : linkSeq) {

        // (1) 현재 노드에 연결된 링크 중 nextLinkId와 매칭되는 링크 조회
        //     RTM_LINK에서 LINK_ID = nextLinkId
        //                AND LINK_MAP_ID = curNodeMapId
        //                AND (ST_ND_ID = curNodeId OR ED_ND_ID = curNodeId)
        CombinedLinkInfoVo matchedLink = dao.selectLinkByNodeAndLinkId(Map.of(
            "nodeId",    curNodeId,
            "nodeMapId", curNodeMapId,
            "linkId",    nextLinkId
        ));

        if (matchedLink == null) {
            // 매칭 실패: 데이터 불일치 또는 경로 단절
            //  → 0으로 채우고 더 이상 진행 불가하므로 중단
            resultMapIds.add(0);
            break;
        }

        // (2) 매칭된 링크의 도엽 ID를 결과에 추가
        resultMapIds.add(Integer.parseInt(matchedLink.getLinkMapId().toString()));

        // (3) 반대편 노드로 이동 준비
        //     반대편 노드 = 현재 노드(curNodeId)가 아닌 쪽
        String oppositeNodeId =
            matchedLink.getStNdId().toString().equals(curNodeId)
                ? matchedLink.getEdNdId().toString()
                : matchedLink.getStNdId().toString();

        // (4) 반대편 노드 정보 조회 (도엽 경계 여부 확인용)
        CombinedNodeInfoVo oppositeNode = dao.selectNodeInfo(Map.of(
            "nodeId",    oppositeNodeId,
            "nodeMapId", matchedLink.getLinkMapId().toString()
        ));

        // (5) 반대편 노드가 도엽 경계 노드면 인접 도엽의 짝 노드로 점프
        if (oppositeNode != null && oppositeNode.getNodeKind() == 7) {
            curNodeId    = oppositeNode.getAdjNodeId().toString();
            curNodeMapId = oppositeNode.getAdjNodeMapId().toString();
        } else {
            // 일반 노드: 그대로 다음 위치로 갱신
            curNodeId    = oppositeNodeId;
            curNodeMapId = matchedLink.getLinkMapId().toString();
        }
    }

    return resultMapIds;
}
