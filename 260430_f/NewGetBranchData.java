public List<CommonCombinedBranchSelVo> getBranchData(
        int nodeId, int nodeMapId, int inLinkId, int type) throws IOException {

    Map<String, Object> params = Map.of("nodeId", nodeId, "nodeMapId", nodeMapId);
    List<CommonCombinedBranchSelVo> list = dao.selectBranchData(params, type);

    // 진출 링크들만 모음 (inLinkId는 BFS 시작점이므로 시드 노드를 사용)
    Set<Integer> linkSeq = new HashSet<>();
    for (CommonCombinedBranchSelVo p : list) {
        linkSeq.add(p.getOutLinkId());
        linkSeq.add(p.getInLinkId());
    }

    // BFS hop 기반 거리/도엽 조회
    Map<String, Map<Integer, Integer>> r = getMapIdsByNode(nodeId, nodeMapId, linkSeq);
    Map<Integer, Integer> distMap = r.get("distMap");   // ← 이제 hop 수
    Map<Integer, Integer> linkIds = r.get("linkIds");

    Map<String, List<CommonCombinedBranchSelVo>> resultMap = new HashMap<>();

    list.stream().filter(vo -> {
        if (vo.getCrossType() == null) return vo.getInLinkId() == inLinkId;
        else return vo.getInLinkId() == inLinkId && vo.getCrossType() == type;
    }).peek(vo -> {
        if (vo.getCrossType() == null) vo.setCrossType(type);
        vo.setGuideCd(vo.getGuideCode() != null ? vo.getGuideCode()
                    : (vo.getVoiceCode() != null ? vo.getVoiceCode() : 0));
        vo.setServerType("server");
        try {
            vo.setList(getBranchLaneColor(
                nodeId, nodeMapId, inLinkId, vo.getOutLinkId(), type,
                vo.getPatternId(), vo.getArrowId(),
                vo.getInLinkMapId(), vo.getOutLinkMapId()
            ));
        } catch (IOException e) {
            vo.setList(new ArrayList<>());
        }

        vo.setOutLinkMapId(linkIds.get(vo.getOutLinkId()));
        vo.setInLinkMapId(linkIds.get(vo.getInLinkId()));

        // 정렬 키: BFS hop 수 (작을수록 도로망 상 가까움)
        vo.setDist(distMap.get(vo.getOutLinkId()));

        if (resultMap.get(vo.getArrowId()) != null) {
            resultMap.get(vo.getArrowId()).add(vo);
        } else {
            List<CommonCombinedBranchSelVo> inner = new ArrayList<>();
            inner.add(vo);
            resultMap.put(vo.getArrowId(), inner);
        }
    }).toList();

    List<CommonCombinedBranchSelVo> result = new ArrayList<>();
    for (String key : resultMap.keySet()) {
        Collections.sort(resultMap.get(key));   // dist(hop) 오름차순
        result.addAll(resultMap.get(key));
    }
    return result;
}
