/** branch / pattern / arrow / outLink 변경 시 통합 처리 */
    useEffect(() => {
        // ── 1. userDate 초기화 ──
        setUserDate({
            insertUser: "",
            insertDate: "",
            updateUser: "",
            updateDate: ""
        } as UserDateInfo);

        // ── 2. branch → pattern → arrow 유효성 확인 및 outLinkIds 갱신 ──
        let effectiveOutLink = regType.outLink;

        if (branch?.patterns?.size) {
            const pattern = branch.patterns.get(selectedPattern);
            const arrow = pattern?.arrows.get(selectedArrow);

            if (arrow) {
                const outLinks = Array.from(arrow.outLinks.keys())
                    .map(k => Number(k))
                    .sort((a, b) => b - a);

                setOutLinkIds(outLinks);

                const outLinkSet = new Set(outLinks);

                // outLink가 현재 outLinks에 없으면 0으로 리셋
                if (!outLinkSet.has(regType.outLink)) {
                    effectiveOutLink = 0;
                }

                setRegType(prev => {
                    let changeRegType: Partial<regType> = {};

                    if (selectedPattern)
                        changeRegType.arrowCnt = Number(selectedPattern.slice(20, 22) ?? 0);
                    if (selectedArrow)
                        changeRegType.circleCnt = Number(selectedArrow.slice(20, 22) ?? 0);
                    if (!outLinkSet.has(prev.outLink))
                        changeRegType.outLink = 0;

                    return { ...prev, ...changeRegType };
                });
            }
        }

        // ── 3. 하이라이트 ──
        highlightLink([
            { linkId: regType.inLink, mapId: store.node?.getNodeMapId() ?? 0, color: 0 }
        ]);

        // ── 4. outLink > 0이면 상세 데이터(차선/색상/유저정보) 로드 ──
        if (effectiveOutLink > 0) {
            const run = async () => {
                let laneColors: any = null;

                if (regType.pattern && regType.arrowId) {
                    laneColors = await setBranchLaneColor(regType.pattern, regType.arrowId);
                }

                let gc: number | undefined | null = undefined;
                const resp = responseBranchData.find(r => r.arrowId === regType.arrowId);

                if (resp) {
                    gc =
                        regType.crossType === CrossTypeEnum.CROSS_TYPE_3D
                            ? resp.guideCode
                            : regType.crossType === CrossTypeEnum.CROSS_TYPE_HW
                                ? resp.voiceCode
                                : undefined;
                }

                setRegType(prev => ({
                    ...prev,
                    guideLaneList: laneColors ?? undefined,
                    guideCd: gc
                }));

                const ud: UserDateInfo = await useCombinedService.getBranchUserDate({
                    nodeId: regType.nodeId,
                    nodeMapId: store.node?.getNodeMapId() || 0,
                    inLinkId: regType.inLink,
                    outLinkId: effectiveOutLink,
                    crossType: regType.crossType,
                    patternId: regType.pattern ?? ID_FIXED,
                    arrowId: regType.arrowId ?? ID_FIXED,
                    code: gc || 0
                });

                setUserDate(ud);
            };

            run();
        }
    }, [branch, selectedPattern, selectedArrow, regType.outLink]);
