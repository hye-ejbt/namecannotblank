/** 코드 삭제
 *  - outLink 선택됨 (≠ 0): 해당 pattern/arrow의 선택된 outLink만 삭제
 *  - outLink 미선택 (= 0): 해당 pattern/arrow의 모든 outLink 삭제
 */
const onDeleteCode = () => {
    if (!selectedPattern && !selectedArrow) {
        return message.error(
            t("CombinedModal.message.selectDeleteItem") ??
            "삭제할 항목을 선택해주세요."
        );
    }

    const isNeedOutLink = needOutLinkCrossTypes.includes(regType.crossType);

    if (selectedArrow) {
        const arrowData = branch?.patterns
            .get(selectedPattern)
            ?.arrows.get(selectedArrow);

        if (!arrowData) return;

        if (regType.outLink !== 0 && isNeedOutLink) {
            // ── 선택된 단일 outLink만 삭제 ──
            const outLinkData = arrowData.outLinks.get(String(regType.outLink));
            const cudKey = buildCudKey(
                regType.inLink, regType.crossType,
                selectedPattern, selectedArrow, regType.outLink
            );

            if (addList.includes(cudKey)) {
                setAddList(prev => prev.filter(k => k !== cudKey));
            } else if (outLinkData?.outLinkText?.includes("server")) {
                setDeleteList(prev =>
                    prev.includes(cudKey) ? prev : [...prev, cudKey]
                );
            }

            // @ts-ignore
            branchHook.actions.removeOutLink(
                regType.inLink, regType.crossType,
                selectedPattern, selectedArrow, regType.outLink
            );

            // 연쇄 삭제: outLink 제거 후 arrow가 비면 arrow → pattern 순 정리
            if (arrowData.outLinks.size === 0) {
                branchHook.actions.removeArrow(
                    regType.inLink, regType.crossType,
                    selectedPattern, selectedArrow
                );
                onSelectArrow(ID_FIXED);

                const patternData = branch?.patterns.get(selectedPattern);
                if (patternData && patternData.arrows.size === 0) {
                    branchHook.actions.removePattern(
                        regType.inLink, regType.crossType, selectedPattern
                    );
                    setSelectedPattern(ID_FIXED);
                }
            }

            setRegType(prev => ({ ...prev, outLink: 0 }));

        } else {
            // ── outLink 미선택(0) 또는 outLink 불필요: 모든 outLink 삭제 ──
            for (const [outLinkKey, outLinkData] of arrowData.outLinks) {
                const cudKey = buildCudKey(
                    regType.inLink, regType.crossType,
                    selectedPattern, selectedArrow, outLinkKey
                );
                if (addList.includes(cudKey)) {
                    setAddList(prev => prev.filter(k => k !== cudKey));
                } else if (outLinkData.outLinkText?.includes("server")) {
                    setDeleteList(prev =>
                        prev.includes(cudKey) ? prev : [...prev, cudKey]
                    );
                }
            }

            branchHook.actions.removeArrow(
                regType.inLink, regType.crossType,
                selectedPattern, selectedArrow
            );
            onSelectArrow(ID_FIXED);

            // arrow 삭제 후 pattern도 비었으면 연쇄 삭제
            const patternData = branch?.patterns.get(selectedPattern);
            if (patternData && patternData.arrows.size === 0) {
                branchHook.actions.removePattern(
                    regType.inLink, regType.crossType, selectedPattern
                );
                setSelectedPattern(ID_FIXED);
            }

            setRegType(prev => ({ ...prev, outLink: 0 }));
        }

    } else if (selectedPattern) {
        if (!branch) return;
        const patternData = branch.patterns.get(selectedPattern);
        if (!patternData) {
            return message.error(
                t("CombinedModal.message.selectItems", { item: "Pattern" }) ??
                "Pattern을 선택해주세요."
            );
        }

        // pattern 하위 모든 arrow → outLink의 server 데이터를 deleteList에 등록
        for (const [arrowId, arrow] of patternData.arrows) {
            for (const [outLinkKey, outLinkData] of arrow.outLinks) {
                const cudKey = buildCudKey(
                    regType.inLink, regType.crossType,
                    selectedPattern, arrowId, outLinkKey
                );
                if (addList.includes(cudKey)) {
                    setAddList(prev => prev.filter(k => k !== cudKey));
                } else if (outLinkData.outLinkText?.includes("server")) {
                    setDeleteList(prev =>
                        prev.includes(cudKey) ? prev : [...prev, cudKey]
                    );
                }
            }
        }

        // 하위 arrow 일괄 삭제 후 pattern 삭제
        for (const [arrowId] of patternData.arrows) {
            branchHook.actions.removeArrow(
                regType.inLink, regType.crossType,
                selectedPattern, arrowId
            );
        }
        branchHook.actions.removePattern(
            regType.inLink, regType.crossType, selectedPattern
        );
        setSelectedPattern(ID_FIXED);
        onSelectArrow(ID_FIXED);
        setRegType(prev => ({ ...prev, outLink: 0 }));
    }
};
