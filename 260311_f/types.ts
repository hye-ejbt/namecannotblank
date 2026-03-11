/**
 * CUD 동작 열거형 — prompt.md §3.B 저장 로직에 매핑
 *  INSERT : arrowId === newArrowId  (신규 등록)
 *  UPDATE : arrowId !== newArrowId  (식별자 변경 수정)
 *  DELETE : newArrowId === ''       (삭제)
 */
export enum CudAction {
    INSERT = "INSERT",
    UPDATE = "UPDATE",
    DELETE = "DELETE"
}

/** 저장 페이로드 단일 항목 */
export interface SavePayloadItem extends regType {
    action: CudAction;
    /** 서버에 이미 존재하는 기 구축 데이터 여부 */
    isExisting: boolean;
}

/** 필터 모드 (prompt.md §3.A) */
export type OutLinkFilterMode = "all" | "byPattern" | "byPatternAndArrow";

/** 교차 타입 Select 옵션 */
export interface CrossTypeOption {
    title: string;
    value: CrossTypeEnum;
    genAutomaticCode: boolean;
    nationalCode?: string;
    label?: React.ReactNode;
}

/** CUD 키 파싱 결과 ("inLink_crossType_pattern_arrow_outLink") */
export interface ParsedCudKey {
    inLink: string;
    crossType: string;
    pattern: string;
    arrowId: string;
    outLink: string;
}

/** CUD 키 문자열 → 구조체 파싱 유틸 */
export function parseCudKey(key: string): ParsedCudKey {
    const [inLink, crossType, pattern, arrowId, outLink] = key.split("_");
    return { inLink, crossType, pattern, arrowId, outLink };
}

/** CUD 키 문자열 생성 유틸 */
export function buildCudKey(
    inLink: number | string,
    crossType: number | string,
    pattern: string,
    arrowId: string,
    outLink: number | string
): string {
    return `${inLink}_${crossType}_${pattern}_${arrowId}_${outLink}`;
}