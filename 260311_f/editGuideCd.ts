function buildBranchDiffPayload(): regType[] {
    const result: regType[] = [];
    if (!branch?.patterns?.size) return result;

    for (const pattern of branch.patterns.values()) {
        const patternChanged = pattern.patternId !== pattern.originPatternId;

        for (const arrow of pattern.arrows.values()) {
            const arrowChanged = arrow.arrowId !== arrow.originArrowId;

            // ── pattern/arrow ID 변경 검출 ──
            if (patternChanged || arrowChanged) {
                const firstOutLink = [...arrow.outLinks.values()][0];
                const outLink = firstOutLink?.outLinkId ?? 0;

                // 해당 outLink에 저장된 guideCd 조회
                const cudKey = buildCudKey(
                    regType.inLink, regType.crossType,
                    pattern.patternId, arrow.arrowId, outLink
                );

                result.push({
                    nodeId: store.node?.getNodeId() ?? 0,
                    nodeMapId: store.node?.getNodeMapId() ?? 0,
                    inLink: regType.inLink,
                    crossType: regType.crossType,
                    outLink,
                    pattern: pattern.patternId,
                    arrowId: arrow.originArrowId,
                    newArrowId: arrow.arrowId,
                    arrowCnt: Number(pattern.patternId.slice(20, 22) ?? 0),
                    circleCnt: Number(arrow.arrowId.slice(20, 22) ?? 0),
                    guideCd: guideCdMap.get(cudKey) ?? regType.guideCd,
                    guideLaneList: firstOutLink
                        ? genGuideLaneColorList(firstOutLink.lane.nums, firstOutLink.lane.color)
                        : undefined
                });
                continue;
            }

            // ── outLink 단위 변경 검출: lane/color/guideCd (outLinkEditSet 기반) ──
            for (const [outLinkKey, outLinkData] of arrow.outLinks) {
                const cudKey = buildCudKey(
                    regType.inLink, regType.crossType,
                    pattern.patternId, arrow.arrowId, outLinkKey
                );

                if (outLinkEditSet.has(cudKey)) {
                    result.push({
                        nodeId: store.node?.getNodeId() ?? 0,
                        nodeMapId: store.node?.getNodeMapId() ?? 0,
                        inLink: regType.inLink,
                        crossType: regType.crossType,
                        outLink: Number(outLinkKey),
                        pattern: pattern.patternId,
                        arrowId: arrow.arrowId,
                        newArrowId: arrow.arrowId,
                        arrowCnt: Number(pattern.patternId.slice(20, 22) ?? 0),
                        circleCnt: Number(arrow.arrowId.slice(20, 22) ?? 0),
                        guideCd: guideCdMap.get(cudKey) ?? regType.guideCd,
                        guideLaneList: genGuideLaneColorList(
                            outLinkData.lane.nums, outLinkData.lane.color
                        )
                    });
                }
            }
        }
    }

    return result;
}
