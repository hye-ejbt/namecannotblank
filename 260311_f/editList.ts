function buildBranchDiffPayload(): regType[] {
        const result: regType[] = [];
        if (!branch?.patterns?.size) return result;

        for (const pattern of branch.patterns.values()) {
            const patternChanged = pattern.patternId !== pattern.originPatternId;

            for (const arrow of pattern.arrows.values()) {
                const arrowChanged = arrow.arrowId !== arrow.originArrowId;

                // pattern/arrow ID 변경 → 기존 로직 유지
                if (patternChanged || arrowChanged) {
                    const firstOutLink = [...arrow.outLinks.values()][0];
                    const outLink = firstOutLink?.outLinkId ?? 0;

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
                        guideCd: undefined,
                        guideLaneList: undefined
                    });
                    continue;
                }

                // lane/color 변경 → laneEditSet에 등록된 outLink만 검출
                for (const [outLinkKey, outLinkData] of arrow.outLinks) {
                    const cudKey = buildCudKey(
                        regType.inLink, regType.crossType,
                        pattern.patternId, arrow.arrowId, outLinkKey
                    );

                    if (laneEditSet.has(cudKey)) {
                        result.push({
                            nodeId: store.node?.getNodeId() ?? 0,
                            nodeMapId: store.node?.getNodeMapId() ?? 0,
                            inLink: regType.inLink,
                            crossType: regType.crossType,
                            outLink: Number(outLinkKey),
                            pattern: pattern.patternId,
                            arrowId: arrow.arrowId,
                            newArrowId: arrow.arrowId,   // ID 변경 없음
                            arrowCnt: Number(pattern.patternId.slice(20, 22) ?? 0),
                            circleCnt: Number(arrow.arrowId.slice(20, 22) ?? 0),
                            guideCd: undefined,
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
