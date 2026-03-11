import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { rootStore } from "@/features/RootStore";
import { useTranslation } from "react-i18next";
import { Modal } from "@/components";
import {
    Checkbox,
    ConfigProvider,
    Image,
    Input,
    InputNumber,
    message,
    Select,
    Table
} from "antd";
import type { CheckboxChangeEvent } from "antd/es/checkbox";
import type { ChangeEvent } from "react";
import {
    BranchMappingMap,
    CrossTypeEnum,
    genCodeType,
    GetCrossTypeKey,
    guideLane,
    regType,
    respType,
    UserDateInfo,
    CudAction,
    SavePayloadItem,
    CrossTypeOption,
    parseCudKey,
    buildCudKey
} from "@/view/context/combined/CombinedTypes";
import { filteringServiceId } from "@/features";
import { TableModalButton } from "@/components/atoms/button/TableModalButton";
import {
    AiFillCloseCircle,
    AiFillMinusCircle,
    AiFillPlusCircle,
    AiFillSave
} from "react-icons/ai";
import { useCombinedService } from "@/view/context/combined/CombinedService.service";
import {
    auto3D,
    autoJCMix,
    autoNormal,
    buildBranchMappingMap,
    useBranchPatternEditor
} from "@/view/context/combined/CombinedCommon";
import styled from "styled-components";
import * as _ from "lodash";
import { Link } from "@/features/edit/model";
import { toJS } from "mobx";
import { useNodeGuideLineVoiceInsertService } from "@/view/nodeGuideLineVoice/insert";
import { showHighlightLinkNotMove } from "@/extra/SoleMap/vectorlayer/VectorLayer";
import { LayerId, LayerManager } from "@/features/edit/openlayers/layers/LayerManager";

/* ─── styled ─── */
const SelectedRow = styled.div`
    .selected-row > td {
        background-color: #e6f4ff !important;
    }
`;

/* ─── 상수 ─── */
const ID_FIXED = "";

const shortPattern: CrossTypeEnum[] = [
    CrossTypeEnum.CROSS_TYPE_SHW,
    CrossTypeEnum.CROSS_TYPE_HW_EX,
    CrossTypeEnum.CROSS_TYPE_3D,
    CrossTypeEnum.CROSS_TYPE_HW
];

/** outLink가 필요한 crossType 목록 */
const needOutLinkCrossTypes: CrossTypeEnum[] = [
    CrossTypeEnum.CROSS_TYPE_NORMAL,
    CrossTypeEnum.CROSS_TYPE_JC,
    CrossTypeEnum.CROSS_TYPE_MIX,
    CrossTypeEnum.CROSS_TYPE_3D
];

/** 22자리 코드(일반 길이) 유효성 검증 대상 */
const len22CrossTypes: CrossTypeEnum[] = [
    CrossTypeEnum.CROSS_TYPE_NORMAL,
    CrossTypeEnum.CROSS_TYPE_JC,
    CrossTypeEnum.CROSS_TYPE_NORMAL_HW,
    CrossTypeEnum.CROSS_TYPE_NORMAL_SHW,
    CrossTypeEnum.CROSS_TYPE_MIX
];

/** 교차 타입 Select 옵션 (컴포넌트 밖 상수 — 리렌더링 방지) */
const typeOpt: CrossTypeOption[] = [
    { title: "일반교차로 ILS",    value: CrossTypeEnum.CROSS_TYPE_NORMAL,     genAutomaticCode: true,  nationalCode: "KRC" },
    { title: "JC ILS",           value: CrossTypeEnum.CROSS_TYPE_JC,         genAutomaticCode: true,  nationalCode: "KRJ" },
    { title: "일반도로 고속분기",  value: CrossTypeEnum.CROSS_TYPE_NORMAL_HW,  genAutomaticCode: false, nationalCode: "KRM" },
    { title: "일반도로 연속분기",  value: CrossTypeEnum.CROSS_TYPE_NORMAL_SHW, genAutomaticCode: false, nationalCode: "KRM" },
    { title: "혼합분기 ILS",      value: CrossTypeEnum.CROSS_TYPE_MIX,        genAutomaticCode: true,  nationalCode: "KRJ" },
    { title: "고속 분기 오버패스", value: CrossTypeEnum.CROSS_TYPE_HW,         genAutomaticCode: false },
    { title: "3D 교차로",         value: CrossTypeEnum.CROSS_TYPE_3D,         genAutomaticCode: true },
    { title: "연속고속분기",       value: CrossTypeEnum.CROSS_TYPE_SHW,        genAutomaticCode: false },
    { title: "연속이중분기",       value: CrossTypeEnum.CROSS_TYPE_HW_EX,      genAutomaticCode: false }
];

/* =================================================================
   CombinedModal 컴포넌트
   ================================================================= */
const CombinedModal: React.FC = () => {
    const { combinedModalStore: store, editStore } = rootStore;
    const { t, i18n } = useTranslation();

    /* ─────────────────────────────────────────────
       1. 상태 정의
       ─ 초기값 유지: inLink = store.inLinks[0] ?? 0, crossType = 1(NORMAL)
       ───────────────────────────────────────────── */

    const [regType, setRegType] = useState<regType>({
        crossType: CrossTypeEnum.CROSS_TYPE_NORMAL,
        nodeId: store.node?.getNodeId() ?? 0,
        inLink: (store.inLinks ?? [0])[0],
        outLink: 0
    });

    // UI 상태
    const [isManualInput, setIsManualInput] = useState<boolean>(false);
    const [isShowGenCodeBtn, setIsShowGenCodeBtn] = useState<boolean>(true);
    const [crossTypeOptions, setCrossTypeOptions] = useState(typeOpt);

    // 데이터 목록
    const [allGuideCdList, setAllGuideCdList] = useState<any[]>([]);
    const [guideCdList, setGuideCdList] = useState<any[]>([]);
    const [responseBranchData, setResponseBranchData] = useState<respType[]>([]);

    // pattern / arrow 선택
    const [selectedPattern, setSelectedPattern] = useState<string>("");
    const [selectedArrow, setSelectedArrow] = useState<string>("");

    // outLink 목록
    const [outLinkIds, setOutLinkIds] = useState<number[]>([]);

    // 유도선 색상
    const [colorCodes, setColorCodes] = useState<{ colorCode: number; colorCodeName: string | boolean }[]>([]);
    const [selectedLanes, setSelectedLanes] = useState<number[]>([]);
    const [selectedColor, setSelectedColor] = useState<number>(0);

    // 사용자 날짜 정보
    const [userDate, setUserDate] = useState<UserDateInfo>({
        insertUser: "",
        insertDate: "",
        updateUser: "",
        updateDate: ""
    });

    /**
     * CUD 추적 리스트 (키 = "inLink_crossType_pattern_arrow_outLink")
     * - deleteList : 삭제 대상 기 구축 데이터 키
     * - addList    : 신규 추가 데이터 키
     */
    const [deleteList, setDeleteList] = useState<string[]>([]);
    const [addList, setAddList] = useState<string[]>([]);

    // Ref
    const prevRef = useRef({ pattern: "", arrow: "" });
    const listSelectRef = useRef<boolean>(true);

    /* ─────────────────────────────────────────────
       2. branchHook — useBranchPatternEditor (변경 금지)
       ───────────────────────────────────────────── */
    const branchHook = useBranchPatternEditor([]);

    /* ─────────────────────────────────────────────
       3. 파생 상태 (Computed / Memoized)
       ───────────────────────────────────────────── */

    /** 현재 inLink + crossType에 해당하는 branch */
    const branch: BranchMappingMap | undefined = useMemo(() => {
        return branchHook.branches.find(
            (v: BranchMappingMap) =>
                v.inLink === regType.inLink && v.crossType === regType.crossType
        );
    }, [regType.crossType, regType.inLink, branchHook.branches]);

    /** pattern 테이블 dataSource */
    const patternsDataSource = useMemo(() => {
        if (!branch) return [];
        return Array.from(branch.patterns.keys()).map((p: string) => ({
            key: p,
            patternId: p
        }));
    }, [regType.crossType, regType.inLink, branchHook.branches]);

    /** arrow 테이블 dataSource */
    const arrowsDataSource = useMemo(() => {
        if (!branch) return [];
        const pattern = branch.patterns.get(selectedPattern);
        if (!pattern) return [];
        return Array.from(pattern.arrows.keys()).map((a: string) => ({
            key: a,
            arrowId: a
        }));
    }, [regType.crossType, regType.inLink, branchHook.branches, selectedPattern]);

    /**
     * ────────────────────────────────────────────────────────
     * [핵심 로직 A] 기 구축 데이터 outLinks 필터링 (prompt.md §3.A)
     *
     *  - pattern 미선택 / arrow 미선택 → 해당 branch 전체 outLinks
     *  - pattern 선택   / arrow 미선택 → 해당 pattern 의 모든 outLinks
     *  - pattern 선택   / arrow 선택   → 해당 pattern+arrow 의 outLinks
     * ────────────────────────────────────────────────────────
     */
    const filteredExistingOutLinks = useMemo<number[]>(() => {
        if (!branch) return [];

        const collected = new Set<number>();

        if (!selectedPattern) {
            // ① pattern 미선택 → branch 전체 outLinks 수집
            for (const pat of branch.patterns.values()) {
                for (const arr of pat.arrows.values()) {
                    for (const [k] of arr.outLinks) collected.add(Number(k));
                }
            }
        } else if (selectedPattern && !selectedArrow) {
            // ② pattern 선택 / arrow 미선택 → 해당 pattern 의 모든 arrow outLinks
            const patData = branch.patterns.get(selectedPattern);
            if (patData) {
                for (const arr of patData.arrows.values()) {
                    for (const [k] of arr.outLinks) collected.add(Number(k));
                }
            }
        } else {
            // ③ pattern + arrow 모두 선택 → 해당 조합의 outLinks 만
            const patData = branch.patterns.get(selectedPattern);
            if (patData) {
                const arrData = patData.arrows.get(selectedArrow);
                if (arrData) {
                    for (const [k] of arrData.outLinks) collected.add(Number(k));
                }
            }
        }

        return Array.from(collected).sort((a, b) => b - a);
    }, [branch, selectedPattern, selectedArrow]);

    /* ─────────────────────────────────────────────
       4. 유틸리티 함수
       ───────────────────────────────────────────── */

    /** 테이블 컬럼 헬퍼 */
    const genColumns = (title: string, dataIndex: string, key: string) => {
        return [
            {
                title: title,
                dataIndex: dataIndex,
                key: key,
                render: (text: string) => <span className={"text-[12px]"}>{text}</span>
            }
        ];
    };

    /** 유도선 차선+색상 리스트 생성 (원형 유지) */
    const genGuideLaneColorList = (lanes: number[], colorCode: number) => {
        let guideLaneColor: guideLane[] = [];
        for (const lane of lanes) {
            guideLaneColor.push({ laneNo: lane, colorCode });
        }
        return guideLaneColor;
    };

    /** 하이라이트 레이어 클리어 */
    const highlightLayerClear = () => {
        const layerManager: LayerManager = LayerManager.getInstance();
        layerManager.getSource(LayerId.HIGHLIGHT_LAYER).clear();
    };

    /** 링크 하이라이트 (원형 유지) */
    const highlightLink = async (linkPropList: { linkId: number; mapId: number; color: number }[]) => {
        highlightLayerClear();

        for (const linkProp of linkPropList) {
            const res: any = await useNodeGuideLineVoiceInsertService.getLinkCoord(linkProp.linkId, linkProp.mapId);

            if (res !== null && res !== "" && res.linkXYGrs !== null) {
                let colorCode: string = "rgba(25, 25, 112, 0.8)";

                switch (linkProp.color) {
                    case 0:  colorCode = "rgba(34, 197, 94, 0.8)";   break;
                    case 1:  colorCode = "rgba(255, 192, 203, 0.8)";  break;
                    case 2:  colorCode = "rgba(200, 255, 200, 0.8)";  break;
                    case 3:  colorCode = "rgba(0, 100, 0, 0.8)";      break;
                    case 4:  colorCode = "rgba(250, 204, 21, 0.8)";   break;
                    case 5:  colorCode = "rgba(251, 146, 60, 0.8)";   break;
                    case 6:  colorCode = "rgba(59, 130, 246, 0.8)";   break;
                    case 10: colorCode = "rgba(255,255,255,0.8)";     break;
                    case 13: colorCode = "rgba(95,1,1,0.8)";          break;
                    case 14: colorCode = "rgba(185,0,253,0.8)";       break;
                    default: colorCode = "rgb(25,25,112)";
                }

                const featureProps = { strokeColor: colorCode };
                showHighlightLinkNotMove.call(rootStore.mapData.map, res.linkXYGrs, res.id, featureProps);
            }
        }
    };

    /* ─────────────────────────────────────────────
       5. 데이터 로드 함수
       ───────────────────────────────────────────── */

    const setBranchData = async () => {
        if (store.node) {
            const resp: respType[] = await useCombinedService.getBranchData(
                regType.nodeId,
                store.node.getNodeMapId(),
                regType.inLink,
                regType.crossType
            );
            setResponseBranchData(resp);

            if (resp.length === 0) return;

            const list: BranchMappingMap[] = buildBranchMappingMap(resp);
            branchHook.actions.upsertBranches(list);
        }
    };

    const setBranchLaneColor = async (patternId: string, arrowId: string) => {
        if (store.node) {
            const resp: guideLane[] = await useCombinedService.getBranchLaneColor(
                regType.nodeId,
                store.node.getNodeMapId(),
                regType.inLink,
                regType.outLink,
                regType.crossType,
                patternId,
                arrowId
            );

            if (resp.length > 0) {
                let lanes: number[] = [];
                for (const item of resp) {
                    lanes.push(item.laneNo);
                }

                const guideLaneColor: guideLane[] = genGuideLaneColorList(lanes, resp[0].colorCode);
                setSelectedLanes(lanes.sort());
                setSelectedColor(resp[0].colorCode);
                return guideLaneColor;
            }

            const { nums, color } =
                branch?.patterns
                    .get(selectedPattern)
                    ?.arrows.get(selectedArrow)
                    ?.outLinks.get(String(regType.outLink))?.lane ?? { nums: [], color: 0 };

            setSelectedLanes(nums);
            setSelectedColor(color);

            return null;
        }
    };

    const setGuideCode = (crossType: number) => {
        let guideCodes: any[] = [];
        if (crossType === CrossTypeEnum.CROSS_TYPE_3D) {
            guideCodes = allGuideCdList.filter((gc: any) => gc.type === "G");
        } else if (crossType === CrossTypeEnum.CROSS_TYPE_HW) {
            guideCodes = allGuideCdList.filter((gc: any) => gc.type === "V");
        }
        setGuideCdList(guideCodes);
    };

    /* ─────────────────────────────────────────────
       6. 이벤트 핸들러
       ───────────────────────────────────────────── */

    /** 모달 닫기 */
    const setClose = () => {
        store.setIsModal(false);
        store.setNode(undefined);
        setIsManualInput(false);
        setGuideCdList([]);
        setUserDate({ insertUser: "", insertDate: "", updateUser: "", updateDate: "" });
        setResponseBranchData([]);
        setSelectedPattern(ID_FIXED);
        setRegType({
            crossType: CrossTypeEnum.CROSS_TYPE_NORMAL,
            nodeId: 0,
            inLink: (store.inLinks ?? [0])[0],
            outLink: 0,
            pattern: ID_FIXED,
            arrowId: ID_FIXED,
            circleCnt: 1,
            arrowCnt: 0,
            guideCd: undefined
        });
        highlightLayerClear();
    };

    /** 초기화 */
    const reset = () => {
        setIsManualInput(false);
        setUserDate({ insertUser: "", insertDate: "", updateUser: "", updateDate: "" });
        setResponseBranchData(prev => {
            const result = prev.filter((item: respType) => item.outLinkId !== regType.outLink);
            return result ?? [];
        });
        setSelectedPattern(ID_FIXED);
        setRegType(prev => ({
            ...prev,
            pattern: ID_FIXED,
            arrowId: ID_FIXED,
            circleCnt: 1,
            arrowCnt: 0,
            guideCd: undefined
        }));
    };

    /** crossType 변경 */
    const OnChangeCrossType = (crossType: number) => {
        setGuideCode(crossType);

        const crossTypeOpts = typeOpt.find(o => o.value === crossType);
        setIsShowGenCodeBtn(crossTypeOpts?.genAutomaticCode ?? true);
        setIsManualInput(!(crossTypeOpts?.genAutomaticCode ?? false));

        setRegType(prev => ({
            ...prev,
            outLink: 0,
            pattern: ID_FIXED,
            arrowId: ID_FIXED,
            arrowCnt: 0,
            circleCnt: 1,
            guideLaneList: [],
            guideCd:
                crossType === CrossTypeEnum.CROSS_TYPE_3D ||
                crossType === CrossTypeEnum.CROSS_TYPE_HW
                    ? 0
                    : undefined,
            crossType
        }));

        setSelectedPattern(ID_FIXED);
        setSelectedArrow(ID_FIXED);
    };

    /**
     * ──────────────────────────────────────────────────
     * genPatternCode — 원형 100% 유지 (prompt.md §1 "genPattern 절대 수정 금지")
     *
     * [조건 A] outLinks 배열의 모든 outLink를 순회하며 각각 pattern/arrow 생성
     * [조건 B] outLinks가 비어있으면(outLink 불필요 시) 값 0 예외처리 후 생성
     * ──────────────────────────────────────────────────
     */
    const genPatternCode = async () => {
        if (!store.node) return message.error(t("CombinedModal.message.selectNode") ?? "노드를 선택 후 진행해주세요.");
        if (outLinkIds.length === 0)
            return message.error(t("CombinedModal.message.noOutLink") ?? "진출 링크를 선택 후 다시 시도해주세요.");

        let newPatternAndArrow: undefined | genCodeType = undefined;
        let newArrowCodeList: any[] = [];

        for (const outLink of outLinkIds) {
            if (outLink !== regType.inLink) {
                const outLinkInfo: any = await useCombinedService.getLinkInfo(outLink, store.node.getNodeMapId());

                if (regType.crossType === CrossTypeEnum.CROSS_TYPE_NORMAL)
                    newPatternAndArrow = await autoNormal(outLinkInfo, store.node, regType.inLink, regType.arrowCnt || 0, regType.circleCnt || 1);

                if (regType.crossType === CrossTypeEnum.CROSS_TYPE_JC)
                    newPatternAndArrow = await autoJCMix(outLinkInfo, store.node, regType.inLink, regType.arrowCnt || 0, regType.circleCnt || 1);

                if (regType.crossType === CrossTypeEnum.CROSS_TYPE_MIX)
                    newPatternAndArrow = await autoJCMix(outLinkInfo, store.node, regType.inLink, regType.arrowCnt || 0, regType.circleCnt || 1);

                if (regType.crossType === CrossTypeEnum.CROSS_TYPE_3D)
                    newPatternAndArrow = await auto3D(outLinkInfo, store.node, regType.inLink, regType.outLink, regType.guideCd);

                if (newPatternAndArrow) {
                    newArrowCodeList.push(`${newPatternAndArrow.genPattern}_${newPatternAndArrow.genArrow}_${outLink}`);
                }
            }
        }

        for (const newArrowCode of newArrowCodeList) {
            const [p, a, o] = newArrowCode.split("_");
            branchHook.actions.addOutLink(regType.inLink, regType.crossType, p, a, Number(o));
            setAddList(prev => [...prev, buildCudKey(regType.inLink, regType.crossType, p, a, o)]);
        }
    };

    /** pattern 선택 */
    const onSelectPattern = (patternId: string) => {
        const setPattern = patternId === selectedPattern ? ID_FIXED : patternId;

        setSelectedPattern(setPattern);
        setRegType(prev => ({
            ...prev,
            pattern: setPattern
        }));

        onSelectArrow(ID_FIXED);
    };

    /** arrow 선택 */
    const onSelectArrow = (arrowId: string) => {
        let arrowCnt = 0;
        let circleCnt = 0;

        if (shortPattern.includes(regType.crossType)) {
            arrowCnt = Number(regType.pattern?.slice(20, 22) ?? 0);
            circleCnt = Number(arrowId.slice(20, 22) ?? 0);
        }

        setSelectedArrow(arrowId);
        setRegType(prev => ({
            ...prev,
            arrowId: arrowId,
            arrowCnt,
            circleCnt
        }));
    };

    /** 이미지 클릭 */
    const onClickImage = (imgId: string | null) => {
        if (imgId === null)
            return message.error(
                t("GeoReferUploadForm.message.imageLoadFail") ?? "이미지 로드 실패"
            );

        store.setSrc(imgId);
        store.setIsPopupOpen(true);
    };

    /** 코드 수동 추가 */
    const addCodes = () => {
        const isNeedOutLink = needOutLinkCrossTypes.some(
            s => s === regType.crossType
        );

        if (!selectedPattern) {
            return message.error(
                t("CombinedModal.message.inputItems", { item: "Pattern" }) ??
                "Pattern을 입력해주세요."
            );
        }

        if (!selectedArrow) {
            return message.error(
                t("CombinedModal.message.inputItems", { item: "Arrow" }) ??
                "Arrow을 입력해주세요."
            );
        }

        if (isNeedOutLink && regType.outLink < 1) {
            return message.error(
                t("CombinedModal.message.noOutLink") ??
                "진출 링크를 선택 후 다시 시도해주세요."
            );
        }

        const editList = buildBranchDiffPayload();

        const edited = editList.some(
            e =>
                e.pattern === selectedPattern &&
                (e.arrowId === selectedArrow || e.newArrowId === selectedArrow)
        );

        if (!edited) {
            const setIndex = buildCudKey(regType.inLink, regType.crossType, selectedPattern, selectedArrow, regType.outLink);

            if (isNeedOutLink) {
                if (!addList.some(s => s === setIndex)) {
                    branchHook.actions.addOutLink(
                        regType.inLink,
                        regType.crossType,
                        selectedPattern,
                        selectedArrow,
                        regType.outLink
                    );
                }
            } else {
                branchHook.actions.addArrow(
                    regType.inLink,
                    regType.crossType,
                    selectedPattern,
                    selectedArrow
                );
            }

            setAddList(prev => [...prev, setIndex]);
        }
    };

    /** 코드 삭제 */
    const onDeleteCode = () => {
        if (
            needOutLinkCrossTypes.some(s => s === regType.crossType) &&
            regType.outLink === 0
        ) {
            return message.error(
                t("CombinedModal.message.noOutLink") ??
                "진출 링크를 선택 후 다시 시도해주세요."
            );
        }

        if (!selectedPattern && !selectedArrow) {
            return message.error(
                t("CombinedModal.message.selectDeleteItem") ??
                "삭제할 항목을 선택해주세요."
            );
        }

        if (selectedArrow) {
            branchHook.actions.removeArrow(
                regType.inLink,
                regType.crossType,
                selectedPattern,
                selectedArrow
            );
            onSelectArrow(ID_FIXED);
        } else if (selectedPattern) {
            if (branch) {
                const patterns = branch.patterns.get(selectedPattern);

                if (patterns && patterns.arrows.size === 0) {
                    branchHook.actions.removePattern(
                        regType.inLink,
                        regType.crossType,
                        selectedPattern
                    );
                    setSelectedPattern(ID_FIXED);
                } else if (patterns && patterns.arrows.size > 0) {
                    message.error(
                        t("CombinedModal.message.patternHasArrows") ??
                        "Pattern에 Arrow가 존재합니다. 삭제 후 다시 시도해주세요."
                    );
                } else if (!patterns) {
                    message.error(
                        t("CombinedModal.message.selectItems", { item: "Pattern" }) ??
                        "Pattern을 선택해주세요."
                    );
                }
            }
        }
    };

    /** outLink 추가 (editStore.~ 호출 최소 변경 유지) */
    const addOutLinkIds = () => {
        const addOutLinks: number[] = editStore
            .getModalOutLinkIds()
            .map(o => Number(filteringServiceId(o)));

        if (addOutLinks.length > 0) {
            setOutLinkIds(prev =>
                Array.from(new Set([...prev, ...addOutLinks]))
                    .sort()
                    .reverse()
            );
        }
    };

    /** outLink 제거 */
    const removeOutLinkIds = () => {
        const outLinkIdSet = new Set(outLinkIds);
        outLinkIdSet.delete(regType.outLink);

        setOutLinkIds(Array.from(outLinkIdSet).sort().reverse());

        const outLinkText =
            branch?.patterns
                .get(regType.pattern ?? "")
                ?.arrows.get(regType.arrowId ?? "")
                ?.outLinks.get(String(regType.outLink))?.outLinkText;

        // 서버에 존재하는 기 구축 데이터인 경우 deleteList 에 추가
        if (outLinkText?.includes("server")) {
            setDeleteList(prev => [
                ...prev,
                buildCudKey(regType.inLink, regType.crossType, regType.pattern ?? "", regType.arrowId ?? "", regType.outLink)
            ]);
        }

        // @ts-ignore
        branchHook.actions.removeOutLink(
            regType.inLink,
            regType.crossType,
            regType.pattern,
            regType.arrowId,
            regType.outLink
        );

        setRegType(prev => ({
            ...prev,
            outLink: 0
        }));
    };

    /* ─────────────────────────────────────────────
       7. 변경 감지 (buildBranchDiffPayload)
       ───────────────────────────────────────────── */

    /** branch 내에서 원본 대비 변경된 pattern/arrow 목록 추출 */
    function buildBranchDiffPayload(): regType[] {
        const result: regType[] = [];
        if (!branch) return result;

        for (const pattern of branch.patterns.values()) {
            const patternChanged = pattern.patternId !== pattern.originPatternId;

            for (const arrow of pattern.arrows.values()) {
                const arrowChanged = arrow.arrowId !== arrow.originArrowId;

                if (!patternChanged && !arrowChanged) continue;

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
            }
        }

        return result;
    }

    /* ─────────────────────────────────────────────
       8. 저장 (onSave) — prompt.md §3.B CUD 처리
       ─────────────────────────────────────────────
       등록 : arrowId === newArrowId  → INSERT
       수정 : arrowId !== newArrowId  → UPDATE (식별자 덮어쓰기)
       삭제 : newArrowId === ''       → DELETE
       충돌 : 수정 결과 arrowId가 신규 추가 arrowId와 중복 → UPDATE 병합
       부활 : 삭제된 기 구축 데이터와 동일한 신규 데이터     → UPDATE 복원
       ───────────────────────────────────────────── */
    const onSave = async () => {
        const editList = buildBranchDiffPayload();

        if (deleteList.length === 0 && addList.length === 0 && editList.length === 0) {
            return message.error(
                t("CombinedModal.message.notChange") ??
                "변경된 데이터가 존재하지 않습니다.\n데이터 변경 후 저장하시기 바랍니다."
            );
        }

        const node = store.node;
        if (!node) return;

        /* ── A. 수정(UPDATE) 목록 조립 ── */
        /** editList 의 arrowId(키맵) → 중복 확인용 */
        const editNewArrowIdSet = new Set<string>();
        const saveEditList: SavePayloadItem[] = [];

        for (const edit of editList) {
            const param: SavePayloadItem = {
                ...edit,
                nodeId: node.getNodeId(),
                nodeMapId: node.getNodeMapId(),
                action: CudAction.UPDATE,
                isExisting: true
            };
            saveEditList.push(param);
            if (edit.newArrowId) editNewArrowIdSet.add(edit.newArrowId);
        }

        /* ── B. 삭제(DELETE) 목록 조립 ── */
        const saveDeleteList: SavePayloadItem[] = [];
        /** 삭제 대상 키 Set (부활 판정용) */
        const deleteKeySet = new Set(deleteList);

        for (const delKey of deleteList) {
            const { inLink: i, crossType: c, pattern: p, arrowId: a, outLink: o } = parseCudKey(delKey);
            if (o === "0") continue;

            const { nums, color } =
                branch?.patterns.get(p)?.arrows.get(a)?.outLinks.get(o)?.lane ?? { nums: [], color: 0 };

            const param: SavePayloadItem = {
                nodeId: node.getNodeId(),
                nodeMapId: node.getNodeMapId(),
                inLink: Number(i),
                crossType: Number(c) as CrossTypeEnum,
                pattern: p,
                arrowId: a,
                newArrowId: "",             // newArrowId === '' → DELETE
                outLink: Number(o),
                guideCd: regType.guideCd,
                arrowCnt: Number(p.slice(20, 22) ?? 0),
                circleCnt: Number(a.slice(20, 22) ?? 0),
                action: CudAction.DELETE,
                isExisting: true
            };

            if (selectedColor > 0) param.guideLaneList = genGuideLaneColorList(nums, color);

            saveDeleteList.push(param);
        }

        /* ── C. 신규 등록(INSERT) 목록 조립 + 충돌/병합 처리 ── */
        const saveAddList: SavePayloadItem[] = [];

        for (const addedKey of addList) {
            const { inLink: i, crossType: c, pattern: p, arrowId: a, outLink: o } = parseCudKey(addedKey);
            if (o === "0") continue;

            const { nums, color } =
                branch?.patterns.get(p)?.arrows.get(a)?.outLinks.get(o)?.lane ?? { nums: [], color: 0 };

            /**
             * [충돌/병합 예외 처리 1]
             * 기 구축 데이터를 수정한 결과(newArrowId)가 신규 추가 arrowId 와 중복
             * → 신규 등록하지 않고 기존 수정(UPDATE) 프로세스로 병합
             */
            if (editNewArrowIdSet.has(a)) {
                continue; // editList 의 UPDATE 가 이미 처리
            }

            /**
             * [충돌/병합 예외 처리 2]
             * 삭제된 기 구축 데이터와 동일한 키를 가진 신규 데이터
             * → 새로 INSERT 하지 않고 기존 데이터를 살려 UPDATE 로 진행(부활)
             */
            if (deleteKeySet.has(addedKey)) {
                // deleteList 에서 해당 항목을 찾아 action 을 UPDATE 로 변경(부활)
                const reviveIdx = saveDeleteList.findIndex(
                    d => d.pattern === p && d.arrowId === a && String(d.outLink) === o
                );
                if (reviveIdx !== -1) {
                    saveDeleteList[reviveIdx].action = CudAction.UPDATE;
                    saveDeleteList[reviveIdx].newArrowId = a; // 원래 arrowId 복원
                }
                continue;
            }

            const param: SavePayloadItem = {
                nodeId: node.getNodeId(),
                nodeMapId: node.getNodeMapId(),
                inLink: Number(i),
                crossType: Number(c) as CrossTypeEnum,
                pattern: p,
                arrowId: a,
                newArrowId: a,              // arrowId === newArrowId → INSERT
                outLink: Number(o),
                guideCd: regType.guideCd,
                arrowCnt: Number(p.slice(20, 22) ?? 0),
                circleCnt: Number(a.slice(20, 22) ?? 0),
                action: CudAction.INSERT,
                isExisting: false
            };

            if (selectedColor > 0) param.guideLaneList = genGuideLaneColorList(nums, color);

            saveAddList.push(param);
        }

        /* ── D. 최종 페이로드 병합 및 서버 전송 ── */
        const allPayload: SavePayloadItem[] = [
            ...saveDeleteList,      // 삭제(또는 부활→UPDATE)
            ...saveEditList,        // 수정(UPDATE)
            ...saveAddList          // 신규(INSERT)
        ];

        // 서버 저장 호출
        const resp: any = await useCombinedService.setSave(allPayload);

        if (!resp.result) {
            return message.error(
                t("Comment.modal.msg.saveFail") ?? "저장에 실패했습니다."
            );
        }

        setUserDate(resp.insertInfo as UserDateInfo);

        // 저장 성공 후 CUD 추적 리스트 초기화
        setDeleteList([]);
        setAddList([]);

        return message.success(
            t("CombinedModal.message.successSave") ?? "저장에 성공했습니다."
        );
    };

    /* ─────────────────────────────────────────────
       9. 검증 (verification) — 원형 유지
       ───────────────────────────────────────────── */
    const verification = () => {
        const crossType = typeOpt.find(o => o.value === regType.crossType);
        const langKey = i18n.language as unknown as "ko" | "en";

        if (
            crossType?.nationalCode &&
            !regType.pattern?.startsWith(crossType.nationalCode)
        ) {
            return message.error(
                t("CombinedModal.message.diffNationalCode", {
                    crossType: GetCrossTypeKey[crossType.value][langKey],
                    type: "Main",
                    code: crossType.nationalCode
                }) ??
                `${GetCrossTypeKey[crossType.value][langKey]} Main 코드는 '${crossType.nationalCode}' 로 시작해야 합니다.`
            );
        }

        if (
            crossType?.nationalCode &&
            !regType.arrowId?.startsWith(crossType.nationalCode)
        ) {
            return message.error(
                t("CombinedModal.message.diffNationalCode", {
                    crossType: GetCrossTypeKey[crossType.value][langKey],
                    type: "Arrow",
                    code: crossType.nationalCode
                }) ??
                `${GetCrossTypeKey[crossType.value][langKey]} Arrow 코드는 '${crossType.nationalCode}' 로 시작해야 합니다.`
            );
        }

        if (regType.crossType === CrossTypeEnum.CROSS_TYPE_NORMAL) {
            const inLinkList = store.inLinks?.length ?? 1;

            if (inLinkList * outLinkIds.length < (regType.arrowCnt || 1)) {
                return message.error(
                    t("CombinedModal.message.arrowNumIsTooBig") ??
                    "화살표 수가 너무 큽니다."
                );
            }

            if (
                regType.pattern!.slice(4, 18) !==
                regType.arrowId!.slice(4, 18)
            ) {
                return message.error(
                    t("CombinedModal.message.diffPatternArrow") ??
                    "패턴코드와 애로우코드의 5~18자리 수는 동일해야합니다."
                );
            }
        }

        if (regType.crossType === CrossTypeEnum.CROSS_TYPE_SHW) {
            const [pattern, arrowId] = [
                regType.pattern ?? ID_FIXED,
                regType.arrowId ?? ID_FIXED
            ];

            if (pattern === ID_FIXED) return;

            const secondChar = pattern.substring(1, 2);
            const isCT = secondChar === "c" || secondChar === "t";

            if (isCT) {
                const firstArrowChar = arrowId.substring(0, 1);

                if (!["c", "r", "t"].includes(firstArrowChar)) {
                    return message.error(
                        `화살표 코드는 c, r, t 중 하나로 시작해야 합니다. (현재: ${firstArrowChar})`
                    );
                }

                if (pattern.slice(-6) !== arrowId.slice(-6)) {
                    return message.error(
                        `패턴 번호(${pattern.slice(-6)})와 화살표 번호(${arrowId.slice(-6)})가 일치하지 않습니다.`
                    );
                }
            } else {
                if (pattern.slice(-7) !== arrowId.slice(-7)) {
                    return message.error(
                        `패턴 번호(${pattern.slice(-7)})와 화살표 번호(${arrowId.slice(-7)})가 일치하지 않습니다.`
                    );
                }
            }
        }
    };

    /* ─────────────────────────────────────────────
       10. useEffect 훅
       ───────────────────────────────────────────── */

    /** branch / pattern / arrow 변경 시 outLinkIds 갱신 */
    useEffect(() => {
        setUserDate({
            insertUser: "",
            insertDate: "",
            updateUser: "",
            updateDate: ""
        } as UserDateInfo);

        if (!branch) return;

        const pattern = branch.patterns.get(selectedPattern);
        if (!pattern) return;

        const arrow = pattern.arrows.get(selectedArrow);
        if (!arrow) return;

        const outLinks = Array.from(arrow.outLinks.keys())
            .map(k => Number(k))
            .sort((a, b) => b - a);

        setOutLinkIds(outLinks);

        const outLinkSet = new Set(outLinks);

        setRegType(prev => {
            let changeRegType: Partial<regType> = {};

            if (selectedPattern)
                changeRegType.arrowCnt = Number(selectedPattern.slice(20, 22) ?? 0);

            if (selectedArrow)
                changeRegType.circleCnt = Number(selectedArrow.slice(20, 22) ?? 0);

            if (!outLinkSet.has(prev.outLink)) changeRegType.outLink = 0;

            return { ...prev, ...changeRegType };
        });

        highlightLink([
            {
                linkId: regType.inLink,
                mapId: store.node?.getNodeMapId() ?? 0,
                color: 0
            }
        ]);
    }, [branch, selectedPattern, selectedArrow]);

    /** pattern / arrow 수동 입력 변경 감지 */
    useEffect(() => {
        if (listSelectRef.current) {
            listSelectRef.current = false;
            prevRef.current = { pattern: selectedPattern, arrow: selectedArrow };
            return;
        }

        if (isManualInput) return;

        const prev = prevRef.current;

        if (needOutLinkCrossTypes.includes(regType.crossType) && regType.outLink === 0) {
            setSelectedPattern(prev.pattern);
            setSelectedArrow(prev.arrow);
            return message.error(
                t("CombinedModal.message.noOutLink") ?? "진출 링크를 선택 후 다시 시도해주세요."
            );
        }

        const validLen = len22CrossTypes.includes(regType.crossType) ? 8 : 22;

        if (selectedPattern.length !== validLen || selectedArrow.length !== validLen) return;

        const pChanged = prev.pattern !== selectedPattern;
        const aChanged = prev.arrow !== selectedArrow;

        if (needOutLinkCrossTypes.includes(regType.crossType) && regType.outLink > 0) {
            if (pChanged)
                branchHook.actions.updatePattern(
                    regType.inLink,
                    regType.crossType,
                    selectedPattern,
                    selectedPattern
                );

            if (aChanged)
                branchHook.actions.updateArrow(
                    regType.inLink,
                    regType.crossType,
                    pChanged ? selectedPattern : prev.pattern,
                    prev.arrow,
                    selectedArrow
                );
        }

        if (!needOutLinkCrossTypes.includes(regType.crossType)) {
            if (pChanged)
                branchHook.actions.updatePattern(
                    regType.inLink,
                    regType.crossType,
                    selectedPattern,
                    selectedPattern
                );

            if (aChanged)
                branchHook.actions.updateArrow(
                    regType.inLink,
                    regType.crossType,
                    pChanged ? selectedPattern : prev.pattern,
                    prev.arrow,
                    selectedArrow
                );
        }

        prevRef.current = { pattern: selectedPattern, arrow: selectedArrow };
    }, [selectedPattern, selectedArrow]);

    /** outLink 선택 시 차선/색상 및 유저 정보 로드 */
    useEffect(() => {
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

            const param = {
                ...regType,
                guideLaneList: laneColors ?? undefined,
                guideCd: gc
            } as regType;

            setRegType(param);

            const ud: UserDateInfo = await useCombinedService.getBranchUserDate({
                nodeId: regType.nodeId,
                nodeMapId: store.node?.getNodeMapId() || 0,
                inLinkId: regType.inLink,
                outLinkId: regType.outLink,
                crossType: regType.crossType,
                patternId: regType.pattern ?? ID_FIXED,
                arrowId: regType.arrowId ?? ID_FIXED,
                code: gc || 0
            });

            setUserDate(ud);
        };

        highlightLink([
            { linkId: regType.inLink, mapId: store.node?.getNodeMapId() ?? 0, color: 0 }
        ]);

        if (regType.outLink && regType.outLink > 0) {
            run();
        }
    }, [regType.outLink]);

    /** 색상 변경 시 branchHook 및 하이라이트 갱신 */
    useEffect(() => {
        if (selectedLanes.length > 0) {
            branchHook.actions.updateOutLinkLane(
                regType.inLink,
                regType.crossType,
                selectedPattern,
                selectedArrow,
                regType.outLink,
                { nums: selectedLanes, color: selectedColor }
            );

            const mapId = store.node?.getNodeMapId() ?? 0;

            highlightLink([
                { linkId: regType.inLink, mapId, color: 0 },
                { linkId: regType.outLink, mapId, color: selectedColor }
            ]);
        }
    }, [selectedColor]);

    /** 마운트 시 초기 데이터 로드 및 editStore 설정 */
    useEffect(() => {
        const setColors = async () => {
            setColorCodes(await useCombinedService.getLaneColor());
            setAllGuideCdList(await useCombinedService.getCode());

            if (store.node) {
                const crossTypeList: number[] = await useCombinedService.getCrossTypeList(
                    store.node.getNodeId(),
                    store.node.getNodeMapId()
                );

                const newOptions = typeOpt.map(o => ({
                    ...o,
                    label: (
                        <span
                            className={crossTypeList.includes(o.value) ? "text-blue-700" : ""}
                        >
                            {o.title}
                        </span>
                    )
                }));

                setCrossTypeOptions(newOptions);
            }
        };

        setColors();

        // editStore 호출 로직 — 최소 변경 유지
        editStore.setModalSelectMode("M");
        editStore.setModalInLinkId("NONE");
        editStore.setModalPageName("");

        return () => {
            editStore.clearModalInfo();

            const linkList = LayerManager.getInstance()
                .getSource(LayerId.DRAW_LAYER)
                .getFeatures()
                .filter((f: any) => f instanceof Link) as unknown as Link[];

            for (let link of linkList) {
                // @ts-ignore
                link.setField("laneInfoType", "");
            }
        };
    }, []);

    /* ─────────────────────────────────────────────
       11. 모달 옵션
       ───────────────────────────────────────────── */
    const options = {
        open: true,
        header: t("MapContextEvent.combinedBranch") ?? "통합 분기 입력",
        isDraggable: true,
        isResizable: false,
        top: "5%",
        left: "5%",
        width: 900,
        height: 750,
        modalId: "combinedModal",
        close: () => {
            setClose();
        },
        footer: (
            <div className="flex justify-end items-center h-50 text-gray-500 p-3">
                <div className="flex gap-2">
                    <TableModalButton
                        name={t("CombinedModal.label.save") ?? "저장"}
                        icon={<AiFillSave size={16} />}
                        onClick={onSave}
                    />
                    <TableModalButton
                        name={t("CombinedModal.label.remove") ?? "삭제"}
                        icon={<AiFillMinusCircle size={16} />}
                        onClick={removeOutLinkIds}
                    />
                    <TableModalButton
                        name={t("CombinedModal.label.close") ?? "종료"}
                        icon={<AiFillCloseCircle size={16} />}
                        onClick={setClose}
                    />
                </div>
            </div>
        )
    };

    /* ─────────────────────────────────────────────
       12. JSX 렌더 — UI 레이아웃 변경 최소화
       ───────────────────────────────────────────── */
    return (
        <Modal {...options}>
            <ConfigProvider
                theme={{
                    components: {
                        Select: { fontSize: 11, optionFontSize: 11 },
                        InputNumber: { fontSize: 11 }
                    }
                }}
            >
                <div className={'p-2'}>
                    {/* 상단 row */}
                    <div className={'flex justify-between'}>
                        <Select
                            className={'w-[150px]'}
                            options={crossTypeOptions}
                            value={regType?.crossType}
                            onChange={(value: number) => {
                                OnChangeCrossType(value);
                            }}
                        />

                        <div className={'flex items-center'}>
                            <Checkbox
                                onChange={(e: CheckboxChangeEvent) => {
                                    setIsManualInput(e.target.checked);
                                }}
                                className={`text-[11px] ${isShowGenCodeBtn ? '' : 'hidden'}`}
                                value={isManualInput}
                            >
                                수동입력
                            </Checkbox>

                            <TableModalButton
                                name={t('CombinedModal.label.createCode') ?? '패턴 생성'}
                                icon={<AiFillPlusCircle size={16} />}
                                addAttr={`h-[30px] ${isShowGenCodeBtn ? '' : 'hidden'}`}
                                onClick={genPatternCode}
                            />
                        </div>
                    </div>

                    {/* 중간 row */}
                    <div className={'flex justify-start mt-2 text-[12px] gap-2'}>
                        {/* Node ID */}
                        <div className={'w-1/6 pt-3 text-center'}>
                            <span className={'pb-1 font-bold'}>NODE ID</span>
                            <InputNumber
                                readOnly={true}
                                value={filteringServiceId(store.node?.getId() as string)}
                                className={'block w-full text-[12px] bg-slate-50 border-slate-100 cursor-none pointer-events-none'}
                            />
                        </div>

                        {/* 진입 링크 */}
                        <div className={'w-1/6 pt-3 text-center'}>
                            <span className={'pb-1 font-bold'}>
                                {t('TrafficLightInfoModal.inLink') ?? '진입 링크'}
                            </span>

                            <InputNumber
                                readOnly={true}
                                value={regType.inLink}
                                className={'block w-full text-[12px] mb-1 bg-slate-50 border-slate-100 cursor-none pointer-events-none'}
                            />

                            <Table
                                rowKey={'key'}
                                className={'p-0 text-[12px] h-[145px] border border-gray-300'}
                                dataSource={store.inLinks?.map((i: number) => {
                                    return { key: i, inLink: i };
                                })}
                                columns={genColumns('IN LINK', 'inLink', 'inLink')}
                                pagination={false}
                                showHeader={false}
                                size={'small'}
                                scroll={{ y: 140 }}
                                rowSelection={{
                                    type: 'radio' as const,
                                    selectedRowKeys: regType.inLink ? [regType.inLink] : [],
                                    onChange: (keys: React.Key[]) =>
                                        setRegType((prev: regType) => ({
                                            ...prev,
                                            inLink: Number(keys[0])
                                        })),
                                    columnWidth: 0,
                                    columnTitle: null as any,
                                    renderCell: () => null
                                }}
                                onRow={(record: { key: any; inLink: number }) => ({
                                    onClick: () => {
                                        setRegType((prev: regType) => ({
                                            ...prev,
                                            inLink: record.key
                                        }));
                                        setSelectedPattern('');
                                        setSelectedArrow('');
                                    }
                                })}
                            />
                        </div>

                        {/* pattern / arrow */}
                        <div className={'w-1/2 px-3 pb-1 gap-2 flex text-center border bg-slate-50'}>
                            {/* pattern */}
                            <div className={'w-1/2 pt-3 text-center'}>
                                <span className={'pb-1 font-bold'}>MAIN</span>

                                <Input
                                    readOnly={!isManualInput}
                                    value={selectedPattern}
                                    onChange={(evt: ChangeEvent<HTMLInputElement>) => {
                                        listSelectRef.current = false;
                                        setSelectedPattern(evt.target.value as string);
                                    }}
                                    className={`block w-full text-[12px] mb-1 ${
                                        isManualInput
                                            ? 'bg-slate-50 border-slate-100 cursor-none pointer-events-none'
                                            : ''
                                    }`}
                                />

                                <SelectedRow>
                                    <Table
                                        rowKey={'key'}
                                        className={'p-0 text-[12px] h-[105px] border border-gray-300'}
                                        columns={genColumns('PATTERNS', 'patternId', 'patternId')}
                                        dataSource={patternsDataSource}
                                        pagination={false}
                                        showHeader={false}
                                        size={'small'}
                                        scroll={{ y: 100, scrollToFirstRowOnChange: false }}
                                        rowClassName={(record: any) =>
                                            record.key === selectedPattern ? 'selected-row' : ''
                                        }
                                        onRow={(record: { key: any; patternId: string }) => ({
                                            onClick: () => {
                                                listSelectRef.current = true;
                                                onSelectPattern(record.key);
                                            }
                                        })}
                                    />
                                </SelectedRow>
                            </div>

                            {/* arrow */}
                            <div className={'w-1/2 pt-3 text-center'}>
                                <span className={'pb-1 font-bold'}>ARROW ID</span>

                                <Input
                                    readOnly={!isManualInput}
                                    value={selectedArrow}
                                    onChange={(evt: ChangeEvent<HTMLInputElement>) => {
                                        listSelectRef.current = false;
                                        setSelectedArrow(evt.target.value as string);
                                    }}
                                    className={`block w-full text-[12px] mb-1 ${
                                        isManualInput
                                            ? 'bg-slate-50 border-slate-100 cursor-none pointer-events-none'
                                            : ''
                                    }`}
                                />

                                <SelectedRow>
                                    <Table
                                        rowKey={'key'}
                                        className={'p-0 text-[12px] h-[105px] border border-gray-300'}
                                        columns={genColumns('ARROWS', 'arrowId', 'arrowId')}
                                        dataSource={arrowsDataSource}
                                        pagination={false}
                                        showHeader={false}
                                        size={'small'}
                                        scroll={{ y: 100, scrollToFirstRowOnChange: false }}
                                        rowClassName={(record: any) =>
                                            record.key === selectedArrow ? 'selected-row' : ''
                                        }
                                        onRow={(record: { key: any; arrowId: string }) => ({
                                            onClick: () => {
                                                listSelectRef.current = true;
                                                onSelectArrow(record.key);
                                            }
                                        })}
                                    />
                                </SelectedRow>
                            </div>
                        </div>

                        {/* 진출 링크 */}
                        <div className={'w-1/6 pt-3 text-center'}>
                            <span className={'pb-1 font-bold'}>
                                {t('TrafficLightInfoModal.outLink') ?? '진출 링크'}
                            </span>

                            <InputNumber
                                readOnly={true}
                                value={regType.outLink}
                                className={'block w-full text-[12px] mb-1 bg-slate-50 border-slate-100 cursor-none pointer-events-none'}
                            />

                            <Table
                                rowKey={'key'}
                                className={'p-0 text-[12px] h-[105px] border border-gray-300'}
                                rowClassName={(record: any) => {
                                    return branch?.patterns
                                        .get(selectedPattern)
                                        ?.arrows.get(selectedArrow)
                                        ?.outLinks.get(String(record.outLink))
                                        ?.outLinkText.includes('server')
                                        ? 'server-row'
                                        : '';
                                }}
                                dataSource={outLinkIds?.map((o: number) => {
                                    return { key: o, outLink: o };
                                })}
                                columns={genColumns('OUT LINK', 'outLink', 'outLink')}
                                pagination={false}
                                showHeader={false}
                                size={'small'}
                                scroll={{ y: 100 }}
                                rowSelection={{
                                    type: 'radio' as const,
                                    selectedRowKeys: regType.outLink ? [regType.outLink] : [],
                                    onChange: (keys: React.Key[]) =>
                                        setRegType((prev: regType) => ({
                                            ...prev,
                                            outLink: Number(keys[0])
                                        })),
                                    columnWidth: 0,
                                    columnTitle: null as any,
                                    renderCell: () => null
                                }}
                                onRow={(record: { key: any; outLink: number }) => ({
                                    onClick: () => {
                                        if (record.key !== 'invalid link') {
                                            setRegType((prev: regType) => ({
                                                ...prev,
                                                outLink: record.key
                                            }));
                                        }
                                    }
                                })}
                            />

                            <div className={'mt-1 flex w-full justify-between gap-1'}>
                                <TableModalButton
                                    name={t('CombinedModal.label.add') ?? '추가'}
                                    icon={<AiFillPlusCircle size={16} />}
                                    addAttr={'mt-1 h-[30px] min-w-[60px] w-1/2'}
                                    onClick={addOutLinkIds}
                                />

                                <TableModalButton
                                    name={t('CombinedModal.label.remove') ?? '삭제'}
                                    icon={<AiFillMinusCircle size={16} />}
                                    addAttr={'mt-1 h-[30px] min-w-[60px] w-1/2'}
                                    onClick={removeOutLinkIds}
                                />
                            </div>
                        </div>
                    </div>

                    {/* 이미지 영역 */}
                    <div className={'flex justify-around mt-4 items-center'}>
                        <div className={'flex justify-around w-3/5'}>
                            <div className={'w-[120px] h-[120px] border text-center'}>
                                {regType.pattern && regType.arrowId ? (
                                    <Image
                                        width={118}
                                        height={118}
                                        alt={'value'}
                                        src={`/api/psd/view/${regType.pattern}`}
                                        preview={false}
                                        onClick={() => onClickImage(regType.pattern ?? null)}
                                    />
                                ) : (
                                    <div className={'w-[118px] h-[118px]'}></div>
                                )}
                            </div>

                            <div className={'w-[120px] h-[120px] border text-center'}>
                                {regType.pattern && regType.arrowId ? (
                                    <Image
                                        width={118}
                                        height={118}
                                        alt={'value'}
                                        src={`/api/psd/view/${regType.arrowId}`}
                                        preview={false}
                                        onClick={() => onClickImage(regType.arrowId ?? null)}
                                    />
                                ) : (
                                    <div className={'w-[118px] h-[118px]'}></div>
                                )}
                            </div>

                            <div className={'w-[120px] h-[120px] text-center border'}>
                                {regType.pattern && regType.arrowId ? (
                                    <Image
                                        width={118}
                                        height={118}
                                        alt={'value'}
                                        src={`/api/psd/view/${regType.pattern}/${regType.arrowId}`}
                                        preview={false}
                                        onClick={() =>
                                            onClickImage(`${regType.pattern}/${regType.arrowId}`)
                                        }
                                    />
                                ) : (
                                    <div className={'w-[118px] h-[118px]'}></div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* 유도선 정보 */}
                    <p className={'text-[12px] font-bold mb-4 mt-5'}>
                        {t('CombinedModal.label.guideLaneTable') ?? '유도선 정보 테이블'}
                    </p>

                    <div className={'flex justify-start flex-wrap gap-2'}>
                        {/* 차선 */}
                        <div className={'flex-none w-[calc((100%-7*0.5rem)/8*2)]'}>
                            <span className={'block font-bold text-[11px] text-center'}>
                                {t('CombinedModal.label.lane') ?? '차선'}
                            </span>

                            <Select
                                style={{ width: '100%' }}
                                mode={'multiple'}
                                maxTagCount={'responsive'}
                                placeholder={
                                    t('CombinedModal.label.chooseLane') ?? '차선을 선택하세요.'
                                }
                                disabled={[undefined, 0].includes(regType.outLink)}
                                options={Array.from({ length: 16 }, (_, number) => ({
                                    label: number + 1 + '차선',
                                    value: number + 1
                                }))}
                                value={selectedLanes}
                                onChange={(laneNoValues: number[]) => {
                                    if (laneNoValues.length === 0) {
                                        message.error(
                                            t('CombinedModal.message.notDeleteLane') ??
                                            '한 개 이상의 차선을 선택해 주세요.'
                                        );
                                        return;
                                    }

                                    setSelectedLanes([...laneNoValues].sort());
                                }}
                            />
                        </div>

                        {/* 색상 */}
                        <div className={'flex-none w-[calc((100%-7*0.5rem)/8)]'}>
                            <span className={'block font-bold text-[11px] text-center'}>
                                {t('CombinedModal.label.color') ?? '색상'}
                            </span>

                            <Select
                                className={'w-full'}
                                options={[
                                    { label: '0.정보 없음', value: 0 },
                                    ...colorCodes.map((cc: any) => ({
                                        label: cc.colorCode + '. ' + cc.colorCodeName,
                                        value: cc.colorCode
                                    }))
                                ]}
                                disabled={
                                    [undefined, 0].includes(regType.outLink) ||
                                    selectedLanes.length === 0
                                }
                                value={selectedColor}
                                onChange={(color: number) => {
                                    if (selectedLanes.length === 0) {
                                        message.error(
                                            t('CombinedModal.message.notDeleteLane') ??
                                            '한 개 이상의 차선을 선택해 주세요.'
                                        );
                                        return;
                                    }

                                    setSelectedColor(color);
                                }}
                            />
                        </div>
                    </div>
                </div>
            </ConfigProvider>
        </Modal>
    );
};

export default CombinedModal;
