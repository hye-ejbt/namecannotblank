/** 전체 삭제: branch 내 모든 server 기 구축 데이터를 deleteList로 이동 */
const removeAllServerData = () => {
    if (!branch) return;

    const serverKeys: string[] = [];

    // branch 전체 순회: pattern → arrow → outLink
    for (const [patternId, pattern] of branch.patterns) {
        for (const [arrowId, arrow] of pattern.arrows) {
            for (const [outLinkKey, outLinkData] of arrow.outLinks) {
                // server 표시된 기 구축 데이터만 수집
                if (outLinkData.outLinkText?.includes("server")) {
                    const cudKey = buildCudKey(
                        regType.inLink, regType.crossType, patternId, arrowId, outLinkKey
                    );
                    // addList에 있으면 상쇄, 없으면 deleteList에 추가
                    if (addList.includes(cudKey)) {
                        setAddList(prev => prev.filter(k => k !== cudKey));
                    } else {
                        serverKeys.push(cudKey);
                    }
                }
            }
        }
    }

    if (serverKeys.length === 0) {
        return message.info(
            t("CombinedModal.message.noServerData") ?? "삭제할 기 구축 데이터가 없습니다."
        );
    }

    // deleteList에 일괄 추가 (중복 제거)
    setDeleteList(prev => Array.from(new Set([...prev, ...serverKeys])));

    // branch 상태에서 server 데이터 제거 → 빈 arrow/pattern 연쇄 정리
    for (const [patternId, pattern] of branch.patterns) {
        for (const [arrowId, arrow] of pattern.arrows) {
            for (const [outLinkKey, outLinkData] of arrow.outLinks) {
                if (outLinkData.outLinkText?.includes("server")) {
                    // @ts-ignore
                    branchHook.actions.removeOutLink(
                        regType.inLink, regType.crossType, patternId, arrowId, Number(outLinkKey)
                    );
                }
            }
            // arrow가 비었으면 삭제
            if (arrow.outLinks.size === 0) {
                branchHook.actions.removeArrow(
                    regType.inLink, regType.crossType, patternId, arrowId
                );
            }
        }
        // pattern이 비었으면 삭제
        if (pattern.arrows.size === 0) {
            branchHook.actions.removePattern(
                regType.inLink, regType.crossType, patternId
            );
        }
    }

    // outLinkIds에서도 server 데이터에 해당하는 outLink 제거
    const deletedOutLinks = new Set(serverKeys.map(k => Number(parseCudKey(k).outLink)));
    setOutLinkIds(prev => prev.filter(id => !deletedOutLinks.has(id)));

    // UI 선택 상태 초기화
    setSelectedPattern(ID_FIXED);
    setSelectedArrow(ID_FIXED);
    setRegType(prev => ({
        ...prev,
        outLink: 0,
        pattern: ID_FIXED,
        arrowId: ID_FIXED,
        arrowCnt: 0,
        circleCnt: 1
    }));

    message.success(
        t("CombinedModal.message.deleteAllServer") ?? 
        `기 구축 데이터 ${serverKeys.length}건이 삭제 목록에 추가되었습니다.`
    );
};
