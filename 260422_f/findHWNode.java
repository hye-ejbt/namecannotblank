import java.util.*;

/**
 * =====================================================================
 * FindHWNode.java
 * 고속도로(HW) 노드 탐색 및 편집 처리 - FindHWNode 함수 포팅
 *
 * 원본: C++ CHwDataManager::FindHWNode()  (Line 2130 ~ 2320)
 * 변환: Java
 *
 * 주요 역할:
 *  - 현재 링크에서 인접 노드를 따라가며 편집 대상 노드를 탐색
 *  - 노드 타입(JCT, ICSAPA 등)에 따라 적절한 편집 함수 호출
 *  - 재귀 호출을 통해 연결로(분기)를 따라 계속 탐색
 * =====================================================================
 */

// =====================================================================
// 보조 상수 정의
// =====================================================================
interface HwObjType {
    int HIGHWAY_JCT_OBJECT    = 10; // 분기점(JCT) 객체 타입
    int HIGHWAY_ICSAPA_OBJECT = 20; // IC/SA/PA 객체 타입
    int NODE_OBJECT           = 1;
    int LINK_OBJECT           = 2;
}

/** C++ S_UPDINFO 구조체 대응: 업데이트 정보 DTO */
class SUpdInfo {
    public long stNodeId; // 시작 노드 ID
    public long edNodeId; // 끝 노드 ID
    public long linkId;   // 링크 ID
    public int btInOut;   // 진출(0) / 진입(1) 방향
}

// =====================================================================
// FindHWNode 로직을 포함하는 HwDataManager 확장
// =====================================================================
class HwDataManagerFindNode implements HwObjType {

    // ── 멤버 변수 ──────────────────────────────────────────────────────
    private int m_ErrorCheck = 0;       // 오류 횟수 카운터 (무한루프 방지용)
    private boolean m_bIsRoute = false; // 현재 처리가 Route 편집인지 여부
    private boolean m_bIsEditByMidNode = false; // 중간 노드 편집 모드 여부
    private boolean m_bIsEditByEdNode  = false; // 끝 노드 편집 모드 여부

    /** 아웃링크 임시 목록 (재귀 탐색용) */
    private List<CGeoLink> m_outLink = new ArrayList<>();

    /** JCT 업데이트 정보 맵: 노드ObjectID → SUpdInfo */
    private Map<Long, SUpdInfo> m_mapJctInfo = new HashMap<>();

    /** ICSAPA 업데이트 정보 맵: 노드ObjectID → SUpdInfo */
    private Map<Long, SUpdInfo> m_mapICSAPAInfo = new HashMap<>();

    /**
     * [Line 2130] FindHWNode()
     *
     * 주어진 링크와 노드를 기준으로 고속도로 인접 노드를 탐색하며
     * JCT / ICSAPA 등의 편집 대상을 찾아 처리함.
     *
     * 탐색 방향:
     *  - pStNode에서 출발하여 ConNode(연결 노드)를 따라 이동
     *  - GetKind() == 7 인 동안 인접 노드로 계속 이동 (일반 도로 노드 건너뜀)
     *
     * @param nObjType    탐색 대상 객체 타입 (HIGHWAY_JCT_OBJECT / HIGHWAY_ICSAPA_OBJECT)
     * @param nSpType     편집 방향 (HW_DELETE / HW_INSERT)
     * @param pStNextLink 시작점의 다음 링크 (방향 기준)
     * @param pStPreLink  시작점의 이전 링크 (방향 기준)
     * @param pStNode     탐색 시작 노드
     * @param pNode       기준 노드 (편집 대상)
     * @param pLink       현재 처리 중인 링크
     * @param nInOut      방향 구분 (0=진출, 1=진입)
     */
    public void findHWNode(
            int nObjType,
            int nSpType,
            CGeoLink pStNextLink,
            CGeoLink pStPreLink,
            CGeoNode pStNode,
            CGeoNode pNode,
            CGeoLink pLink,
            int nInOut) {

        // ── 안전 장치: 오류 횟수가 10을 초과하면 무한루프 의심 → 중단 ──
        if (m_ErrorCheck > 10) {
            return;
        }

        // ── pNode로부터 연결 노드 초기 설정 ──────────────────────────
        // pNode의 ObjID를 가져와 DC에서 해당 노드 데이터를 조회
        UnionId id = new UnionId();
        id.dwObjectID = pNode.getObjId();

        CGeoNode conNode = new CGeoNode();
        conNode.copyFrom(findObj(NODE_OBJECT, id)); // 연결 노드 조회

        // 현재 링크(pLink)를 CurLink에 복사
        CGeoLink curLink = new CGeoLink();
        curLink.copyFrom(pLink);

        // ── 연결 노드 결정: ConNode에서 CurLink의 어느 쪽 노드인지 판별 ──
        // CurLink의 시작 노드가 ConNode와 다르면 → id에 시작 노드 ID 설정
        if (!Objects.equals(conNode.getObjId(), curLink.getStNodeId())) {
            id.dwObjectID = curLink.getStNodeId();

        // CurLink의 끝 노드가 ConNode와 다르면 → id에 끝 노드 ID 설정
        } else if (!Objects.equals(conNode.getObjId(), curLink.getEdNodeId())) {
            id.dwObjectID = curLink.getEdNodeId();

        } else {
            // 양쪽 모두 일치하지 않는 비정상 케이스 → 처리 불가
            return;
        }

        // id에 해당하는 노드를 DC에서 다시 조회하여 ConNode 갱신
        conNode.copyFrom(findObj(NODE_OBJECT, id));

        // ── 인접 노드 건너뛰기: GetKind() == 7인 동안 계속 이동 ────────
        // Kind==7: 일반 도로 중간 노드 등 편집 대상이 아닌 노드를 스킵
        while (conNode.getKind() == 7) {
            // 현재 ConNode의 인접 노드(AdjNode)의 기본 객체 ID 획득
            id.dwObjectID = conNode.getAdjNode().getBaseObject().getObjectId();

            // 인접 노드의 MapID도 함께 저장 (로깅/추적용)
            // id.strMapID = String.format("%d", conNode.getAdjNode().getBaseObject().getMapId());

            // 인접 노드를 ConNode로 갱신
            conNode.copyFrom((CGeoNode) findObj(NODE_OBJECT, id));

            // ConNode의 첫 번째 PassInfo에서 진입 링크 ID로 CurLink 갱신
            id.dwObjectID = conNode.getNodePassInfo().get(0).getInLinkId();
            curLink.copyFrom((CGeoLink) findObj(LINK_OBJECT, id));

            // 새 CurLink 기준으로 ConNode 재결정
            if (!Objects.equals(conNode.getObjId(), curLink.getStNodeId())) {
                id.dwObjectID = curLink.getStNodeId();
            } else if (!Objects.equals(conNode.getObjId(), curLink.getEdNodeId())) {
                id.dwObjectID = curLink.getEdNodeId();
            }
            // ConNode를 새 id로 다시 로드
            conNode.copyFrom((CGeoNode) findObj(NODE_OBJECT, id));
        }

        // =====================================================================
        // [Line 2168] ICSAPA 섹션 처리
        // ConNode 확정 후 ICSAPA(IC/SA/PA) 링크 탐색 시작
        // =====================================================================
        CGeoLink preLink = new CGeoLink();
        preLink.copyFrom(curLink); // 이전 링크로 CurLink 보관

        // ConNode의 통행 정보 목록 순회
        List<CGeoPassInfo> passInfoList = conNode.getNodePassInfo();
        for (int i = 0; i < passInfoList.size(); i++) {
            CGeoPassInfo pPass = passInfoList.get(i);

            // 진입/진출 링크가 동일하면 유효하지 않은 통행 → 스킵
            if (pPass.getInLinkId() == pPass.getOutLinkId()) continue;

            // 톨게이트가 아닌 경우: TCode != 3이면 스킵
            // (TCode 3 = 유효한 양방향 통행 코드)
            if (pPass.getTCode() != 3) continue;

            // ConNode의 ObjID를 id에 설정
            id.dwObjectID = conNode.getObjId();

            // ── 방향에 따른 링크 결정 ────────────────────────────────
            if (nInOut == 0) {
                // 진출(출구) 방향: PreLink ObjID가 InLinkID와 달라야 함
                if (pPass.getInLinkId() != preLink.getObjId()) continue;
                // 진출 방향이면 OutLink ID를 다음 탐색 대상으로 설정
                id.dwObjectID = pPass.getOutLinkId();
            } else {
                // 진입(입구) 방향: PreLink ObjID가 OutLinkID와 달라야 함
                if (pPass.getOutLinkId() != preLink.getObjId()) continue;
                // 진입 방향이면 InLink ID를 다음 탐색 대상으로 설정
                id.dwObjectID = pPass.getInLinkId();
            }

            // 결정된 ID로 CurLink 갱신
            curLink.copyFrom((CGeoLink) findObj(LINK_OBJECT, id));

            // ── ICSAPA 톨게이트 판별 ─────────────────────────────────
            // ConNode 이름 끝 4글자가 "톨게이트"이고 TollID가 유효한 경우
            if (conNode.getName() != null
                    && conNode.getName().length() >= 4
                    && conNode.getName().substring(conNode.getName().length() - 4).equals("톨게이트")
                    && conNode.getTollId() != 0) {

                // 일반 링크와 만나는 ICSAPA 톨게이트일 때
                // EdNode 편집 모드이면서 처리 중인 경우 → 건너뜀
                if (m_bIsEditByEdNode) {
                    return;
                }
            }

            // =====================================================================
            // [Line 2208] ICSAPA 또는 Route 처리
            // =====================================================================
            if (nObjType == HIGHWAY_ICSAPA_OBJECT || m_bIsRoute) {

                // 연결로상의 노드 변경이 아닐 경우 (일반 편집)
                if (!m_bIsEditByMidNode) {
                    // 톨게이트는 진출 링크가 됨 → HWEditICSAPA 호출
                    // btDir: pStPreLink의 고속도로 시설 방향 정보를 전달
                    hwEditICSAPA(
                        nSpType,
                        pStNode,
                        conNode,
                        curLink,
                        nInOut,
                        pStPreLink.getHighwayFacilityInfo().getDirection()
                    );
                }
                return; // ICSAPA 처리 완료 후 종료
            }

            // =====================================================================
            // [Line 2219] JCT(분기점) 객체 처리
            // =====================================================================
            if (nObjType == HIGHWAY_JCT_OBJECT) {

                // CurLink가 JC 카테고리이고 고속도로인 경우
                if (curLink.getLinkCategory().isJC()
                        && curLink.getRoadCategory() == 1) {

                    // m_outLink에서 현재 CurLink가 이미 등록됐는지 확인 (중복 방지)
                    boolean alreadyExists = m_outLink.stream()
                        .anyMatch(obj -> curLink.getObjId() == obj.getObjId());

                    if (!alreadyExists) {
                        // 새로 발견된 아웃링크: 복제 후 m_outLink에 추가
                        CGeoLink pOutLinkClon = new CGeoLink();
                        pOutLinkClon.copyFrom(curLink);
                        m_outLink.add(pOutLinkClon);

                        // ID 순으로 정렬 (탐색 순서 일관성 유지)
                        m_outLink.sort(Comparator.comparingLong(CGeoLink::getObjId));

                        // 새 링크를 기준으로 재귀 탐색
                        findHWNode(
                            HIGHWAY_JCT_OBJECT,
                            nSpType,
                            pStNextLink,
                            pStPreLink,
                            pStNode,
                            conNode,   // 현재 ConNode가 다음 탐색의 pNode
                            curLink,   // 현재 CurLink가 다음 탐색의 pLink
                            nInOut
                        );
                    }

                    // TollID가 있으면 다음 통행 정보로 계속, 없으면 루프 종료
                    if (conNode.getTollId() != 0) {
                        continue;
                    } else {
                        break;
                    }

                // CurLink가 일반 도로(IsRoad)이고 고속도로인 경우
                } else if (curLink.getLinkCategory().isRoad()
                        && curLink.getRoadCategory() == 1) {

                    // 연결로상 노드 변경이 아닌 경우: JCT 편집 수행
                    if (!m_bIsEditByMidNode) {
                        hwEditJCT(nSpType, pStNode, conNode, curLink, nInOut);

                    } else {
                        // ── 연결로상의 노드 변경 시 ─────────────────────
                        // [Line 2241] JCT 업데이트 정보 수집
                        SUpdInfo sUpdInfo = new SUpdInfo();

                        if (nInOut == 0) {
                            // 진출 방향: ConNode가 끝 노드
                            sUpdInfo.edNodeId = conNode.getObjId();
                        } else {
                            // 진입 방향: ConNode가 시작 노드
                            sUpdInfo.stNodeId = conNode.getObjId();
                        }
                        sUpdInfo.linkId  = curLink.getObjId();
                        sUpdInfo.btInOut = nInOut;

                        // JCT 업데이트 맵에 삽입 (ConNode ObjectID 키)
                        m_mapJctInfo.put(conNode.getObjId(), sUpdInfo);
                        return; // 수집 완료 후 종료
                    }
                }
            }

            // =====================================================================
            // [Line 2255] ICSAPA 객체 처리 (두 번째 분기)
            // =====================================================================
            if (nObjType == HIGHWAY_ICSAPA_OBJECT) {

                // CurLink가 IC 카테고리이고 고속도로인 경우
                if (curLink.getLinkCategory().isIC()
                        && curLink.getRoadCategory() == 1) {

                    // m_outLink 중복 체크
                    boolean alreadyExists = m_outLink.stream()
                        .anyMatch(obj -> curLink.getObjId() == obj.getObjId());

                    if (!alreadyExists) {
                        // 신규 아웃링크 등록 후 재귀 탐색
                        CGeoLink pOutLinkClon = new CGeoLink();
                        pOutLinkClon.copyFrom(curLink);
                        m_outLink.add(pOutLinkClon);
                        m_outLink.sort(Comparator.comparingLong(CGeoLink::getObjId));

                        findHWNode(
                            HIGHWAY_ICSAPA_OBJECT,
                            nSpType,
                            pStNextLink,
                            pStPreLink,
                            pStNode,
                            conNode,
                            curLink,
                            nInOut
                        );
                    }

                    if (conNode.getTollId() != 0) {
                        continue;
                    } else {
                        break;
                    }
                }

                // ── [Line 2274] 도시고속과 만나는 IC 연결로 또는 도로중앙이 2 ──
                // 조건: IC가 아니고 TollID가 있거나,
                //        IC이고 RoadCategory==2(도시고속도로)이고 TollID가 있는 경우
                if ((!curLink.getLinkCategory().isIC() && conNode.getTollId() != 0)
                        || (curLink.getLinkCategory().isIC()
                            && curLink.getRoadCategory() == 2
                            && conNode.getTollId() != 0)) {

                    // 일반 링크와 만나는 ICSAPA 처리
                    if (m_bIsEditByEdNode) {
                        // 고속도로가 아닌경우 제외
                        if (curLink.getRoadCategory() != 1) {
                            continue;
                        }
                    }

                    // ── 연결로상의 노드 변경이 아닌 경우 ──────────────────
                    if (!m_bIsEditByMidNode) {

                        // 도로와 연결시 일반 도로와 연결되는 링크 결정
                        CGeoLink updLink = new CGeoLink();
                        updLink.copyFrom(preLink); // 기본: PreLink 사용

                        if (m_bIsEditByEdNode) {
                            // EdNode 편집 모드: 다음 링크(pStNextLink)를 기준으로
                            updLink.copyFrom(pStNextLink);

                            // edNode가 톨게이트이고 Route가 아닌 경우
                            if (!m_bIsRoute
                                    && pStNode.getName() != null
                                    && pStNode.getName().length() >= 4
                                    && pStNode.getName().substring(pStNode.getName().length() - 4).equals("톨게이트")
                                    && pStNode.getTollId() != 0) {

                                // ConNode와 연결된 InLink/OutLink 정보 획득
                                CGeoLink inLink = new CGeoLink();
                                CGeoLink outLink = new CGeoLink();
                                getConnetLink(conNode, inLink, outLink, preLink.getObjId());

                                // St Route 편집 수행
                                hwEditStRoute(nSpType, pStNode, conNode, inLink, outLink);
                            }
                        } else {
                            // 일반 모드: 연결로와 연결된 링크가 고속도로일 경우 업데이트 안함
                            if (curLink.getRoadCategory() == 1) {
                                continue;
                            }
                            // 이전 링크(PreLink)의 pStPreLink ObjID로 CurLink 재조회
                            curLink.copyFrom((CGeoLink) findObj(LINK_OBJECT, pStPreLink.getObjId()));
                        }

                        // ICSAPA 편집 수행 (btDir: CurLink의 고속도로 시설 방향)
                        hwEditICSAPA(
                            nSpType,
                            pStNode,
                            conNode,
                            updLink,
                            nInOut,
                            curLink.getHighwayFacilityInfo().getDirection()
                        );

                    } else {
                        // ── [Line 2306] 연결로상의 노드 변경 시: 정보 수집 ──
                        SUpdInfo sInfo = new SUpdInfo();

                        // 분선 노드: RoadCategory == 1인 경우만 수집
                        if (curLink.getRoadCategory() == 1) {
                            sInfo.stNodeId = conNode.getObjId();
                            sInfo.linkId   = curLink.getObjId();
                            // ICSAPA 업데이트 맵에 삽입
                            m_mapICSAPAInfo.put(conNode.getObjId(), sInfo);
                        }
                        return; // 수집 완료 후 종료
                    }
                }
            }
        } // for loop end (통행 정보 순회)
    }

    // =====================================================================
    // 하위 메서드 - 구현 필요 (별도 확인 필요 목록 참고)
    // =====================================================================

    /** DC(데이터 컨텍스트)에서 객체를 ID로 조회 */
    private Object findObj(int objType, UnionId id) {
        // TODO: 구현 필요 - 실제 DC 조회 로직
        return null;
    }

    /** long 타입 ObjID로 링크 객체 조회 (편의 오버로드) */
    private Object findObj(int objType, long objId) {
        UnionId id = new UnionId();
        id.dwObjectID = objId;
        return findObj(objType, id);
    }

    /** ICSAPA(IC/SA/PA) 편집 수행 */
    private void hwEditICSAPA(int nSpType, CGeoNode pStNode, CGeoNode conNode,
                              CGeoLink curLink, int nInOut, int direction) {
        // TODO: 구현 필요
    }

    /** JCT(분기점) 편집 수행 */
    private void hwEditJCT(int nSpType, CGeoNode pStNode, CGeoNode conNode,
                           CGeoLink curLink, int nInOut) {
        // TODO: 구현 필요
    }

    /** StRoute(시작 노드 Route) 편집 수행 */
    private void hwEditStRoute(int nSpType, CGeoNode pStNode, CGeoNode conNode,
                               CGeoLink inLink, CGeoLink outLink) {
        // TODO: 구현 필요
    }

    /** ConNode와 연결된 InLink/OutLink 정보 획득 */
    private void getConnetLink(CGeoNode conNode, CGeoLink inLink,
                               CGeoLink outLink, long preObjId) {
        // TODO: 구현 필요
    }
}

// =====================================================================
// 보조 클래스 (실제 구현체로 대체 필요)
// =====================================================================

/** 고속도로 시설 정보 */
class HighwayFacilityInfo {
    public int getDirection() { return 0; } // 방향 코드
}

/** CGeoLink 확장: 추가 메서드 포함 */
class CGeoLink {
    private long objId;
    private long stNodeId;
    private long edNodeId;
    private int roadCategory;

    public long getObjId()      { return objId; }
    public long getStNodeId()   { return stNodeId; }
    public long getEdNodeId()   { return edNodeId; }
    public int getRoadCategory(){ return roadCategory; }

    public CLinkCategory getLinkCategory() { return new CLinkCategory(this); }

    /** 고속도로 시설 정보 반환 (IC/JC/SA 진출입 방향 등) */
    public HighwayFacilityInfo getHighwayFacilityInfo() {
        return new HighwayFacilityInfo();
    }

    public void copyFrom(CGeoLink src) {
        if (src == null) return;
        this.objId = src.objId;
        this.stNodeId = src.stNodeId;
        this.edNodeId = src.edNodeId;
        this.roadCategory = src.roadCategory;
    }
}

/** CGeoNode 확장: 추가 메서드 포함 */
class CGeoNode {
    private long objId;
    private String name;
    private long tollId;
    private int kind;
    private List<CGeoPassInfo> passInfoList = new ArrayList<>();

    public long getObjId()   { return objId; }
    public String getName()  { return name; }
    public long getTollId()  { return tollId; }

    /**
     * 노드 종류 코드.
     * kind == 7: 일반 도로 중간 노드 (탐색 건너뜀 대상)
     */
    public int getKind() { return kind; }

    /** 인접 노드 정보 반환 (Kind==7 탐색 시 사용) */
    public AdjNodeInfo getAdjNode() { return new AdjNodeInfo(); }

    public List<CGeoPassInfo> getNodePassInfo() { return passInfoList; }

    /** pNode의 ObjID를 UnionId 형태로 반환 */
    public UnionId getObjIdAsUnion() {
        UnionId u = new UnionId();
        u.dwObjectID = this.objId;
        return u;
    }

    public void copyFrom(CGeoNode src) {
        if (src == null) return;
        this.objId = src.objId;
        this.name = src.name;
        this.tollId = src.tollId;
        this.kind = src.kind;
    }
}

/** 인접 노드 정보 (AdjNode 탐색용) */
class AdjNodeInfo {
    public BaseObject getBaseObject() { return new BaseObject(); }
}

/** 기본 객체 정보 */
class BaseObject {
    public long getObjectId() { return 0L; }
    public long getMapId()    { return 0L; }
}
