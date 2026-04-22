import java.util.ArrayList;
import java.util.List;

/**
 * =====================================================================
 * HwNodeEdit.java
 * 고속도로(HW) 노드 편집 관련 클래스 모음
 *
 * 원본: C++ CDlgHwInfo / CHwDataManager
 * 변환: Java
 *
 * 주요 기능:
 *  - 노드 정보 업데이트 (OnUpdateAll)
 *  - 노드 메시지 편집 처리 (hwEditNodeMsg)
 *  - 노드 편집 타입 결정 (getNodeEditType)
 * =====================================================================
 */

// =====================================================================
// 상수 정의 (C++ enum/define → Java 인터페이스 상수)
// =====================================================================
interface HwEditType {
    int HW_EDIT_NONE      = 0;  // 편집 없음
    int HW_EDIT_MIDNODE   = 1;  // 중간 노드 편집
    int HW_EDIT_EDNODE    = 2;  // 끝 노드 편집
    int HW_EDIT_STNODE    = 3;  // 시작 노드 편집
    int HW_EDIT_STNODE_SA = 4;  // SA(Service Area) 연결 시작 노드 편집
    int HW_EDIT_TOLLGATE  = 5;  // 톨게이트 편집
}

interface HwSpType {
    int HW_DELETE = 0;  // 삭제 타입
    int HW_INSERT = 1;  // 삽입 타입
}

interface WmType {
    int WM_HW_EDIT_BY_DT = 100; // 데이터에 의한 편집 메시지 타입
}

interface NodeType {
    int NODE_OBJECT = 1; // 노드 오브젝트 타입
    int SELECT_ATTR_ALL = 0xFF; // 전체 속성 선택
}

// =====================================================================
// 데이터 모델 클래스 (C++ 구조체/클래스 대응)
// =====================================================================

/** C++ CGeoNode 대응: 지리 노드 정보 */
class CGeoNode {
    private long objId;
    private String name;
    private long tollId;
    private List<CGeoPassInfo> passInfoList = new ArrayList<>();

    public void setObjId(long objId) { this.objId = objId; }
    public long getObjId() { return objId; }
    public String getName() { return name; }
    public long getTollId() { return tollId; }

    /** 통행 정보 목록 반환 */
    public List<CGeoPassInfo> getNodePassInfo() { return passInfoList; }

    /** 다른 노드의 데이터를 복사 */
    public void copyFrom(CGeoNode source) {
        this.objId = source.objId;
        this.name = source.name;
        this.tollId = source.tollId;
        // passInfoList 깊은 복사 필요 시 별도 처리
    }
}

/** C++ CGeoLink 대응: 지리 링크(도로 구간) 정보 */
class CGeoLink {
    private long objId;
    private int roadCategory; // 도로 카테고리 (1 = 고속도로 등)

    public long getObjId() { return objId; }
    public int getRoadCategory() { return roadCategory; }

    /** 링크 카테고리 정보 반환 (IC, JC, SA, Road 여부 판단용) */
    public CLinkCategory getLinkCategory() {
        return new CLinkCategory(this);
    }

    public void copyFrom(CGeoLink source) {
        this.objId = source.objId;
        this.roadCategory = source.roadCategory;
    }

    public void copyFrom(CGeoLink source, boolean dummy) {
        copyFrom(source);
    }
}

/** 링크 카테고리 판별 클래스 (C++ GetLinkCategory()-> 메서드 대응) */
class CLinkCategory {
    private CGeoLink link;

    public CLinkCategory(CGeoLink link) {
        this.link = link;
    }

    /** IC(나들목) 여부 */
    public boolean isIC() { /* 실제 판별 로직 필요 */ return false; }
    /** JC(분기점) 여부 */
    public boolean isJC() { /* 실제 판별 로직 필요 */ return false; }
    /** SA(휴게소) 여부 */
    public boolean isSA() { /* 실제 판별 로직 필요 */ return false; }
    /** 일반 도로 여부 */
    public boolean isRoad() { /* 실제 판별 로직 필요 */ return false; }
    /** IC 또는 JC 여부 */
    public boolean isIC_Or_JC() { return isIC() || isJC(); }
}

/** C++ CGeoPassInfo 대응: 통과 정보 (교차점 진입/진출 링크) */
class CGeoPassInfo {
    private long inLinkId;   // 진입 링크 ID
    private long outLinkId;  // 진출 링크 ID
    private int tCode;       // 통행 코드 (3 = 양방향 등)

    public long getInLinkId() { return inLinkId; }
    public long getOutLinkId() { return outLinkId; }
    public int getTCode() { return tCode; }
}

/** C++ UNIONID 대응: 복합 객체 ID */
class UnionId {
    public long dwObjectID;
}

// =====================================================================
// CDlgHwInfo 대응 클래스 - 다이얼로그 UI 로직
// =====================================================================
class DlgHwInfo {

    private DCManager m_pDCManager;      // DC(데이터 컨텍스트) 매니저
    private HwDataManager m_pHWManager;  // HW(고속도로) 데이터 매니저
    private long m_objId;                // 현재 선택된 객체 ID

    /**
     * [Image 1 - Line 189] OnUpdateAll()
     * 다이얼로그의 모든 데이터를 갱신하는 메서드.
     * UI에서 "전체 업데이트" 이벤트 발생 시 호출됨.
     */
    public void onUpdateAll() {
        // 필수 매니저 null 체크 - 초기화 전 호출 방지
        if (m_pDCManager == null || m_pHWManager == null) {
            return;
        }

        // UI 컨트롤과 멤버 변수 동기화 (C++ UpdateData()에 해당)
        updateData();

        // 현재 시각 문자열 조회 (변경 이력 기록용)
        String strTime = m_pDCManager.getTime();

        // 편집 대상 노드 생성 및 설정
        CGeoNode node = new CGeoNode();
        node.setObjId(m_objId);

        // DC 매니저로부터 노드 속성 전체 조회
        // nObjType = NODE_OBJECT, nSpType = SELECT_ATTR_ALL
        m_pDCManager.getAttribute(NodeType.NODE_OBJECT, NodeType.SELECT_ATTR_ALL, node);

        // 편집 메시지 전송용 배열 구성
        // [0] = 원본 노드(삭제 기준), [1] = 편집 노드(삽입 기준)
        List<CGeoNode> arrObj = new ArrayList<>();
        arrObj.add(node); // 인덱스 0: 원본 노드
        arrObj.add(node); // 인덱스 1: 편집 노드 (동일 참조 - 실제로는 복사본일 수 있음)

        // HW 매니저에 노드 편집 메시지 전송
        m_pHWManager.hwEditNodeMsg(WmType.WM_HW_EDIT_BY_DT, arrObj, strTime);

        // 배열 초기화 (C++ RemoveAll)
        arrObj.clear();
    }

    // 하위 메서드 (구현 필요)
    private void updateData() { /* UI ↔ 멤버변수 동기화 */ }
}

// =====================================================================
// CHwDataManager 대응 클래스 - 고속도로 데이터 관리 로직
// =====================================================================
class HwDataManager implements HwEditType, HwSpType {

    private String m_strCurrentTime;            // 현재 처리 시각
    private List<CGeoNode> m_NodeTable2;        // 노드 임시 테이블 (편집 작업용)
    private List<CGeoLink> m_LinkTable2;        // 링크 임시 테이블 (편집 작업용)
    private boolean m_bIsRoute;                 // 현재 처리가 Route 편집인지 여부

    /**
     * [Image 2 - Line 1603] HwEditNodeMsg()
     * 노드 편집 메시지를 수신하여 실제 편집 작업을 수행.
     *
     * @param nSpType 편집 타입 (WM_HW_EDIT_BY_DT 등)
     * @param pArr    편집 대상 노드 배열 [0]=원본노드, [1]=편집노드
     * @param strTime 편집 발생 시각 문자열
     */
    public void hwEditNodeMsg(int nSpType, List<CGeoNode> pArr, String strTime) {
        // 배열에서 원본 노드(삭제 기준)와 편집 노드(삽입 기준) 추출
        CGeoNode pOriNode  = (CGeoNode) pArr.get(0); // 인덱스 0: 원본
        CGeoNode pEditNode = (CGeoNode) pArr.get(1); // 인덱스 1: 편집본

        // null 체크 - 유효하지 않은 노드면 즉시 종료
        if (pOriNode == null || pEditNode == null) {
            return;
        }

        // 현재 편집 시각 저장 (이후 로직에서 이력 기록에 사용)
        m_strCurrentTime = strTime;

        // 임시 테이블 초기화 (이전 편집 잔여 데이터 제거)
        initRoad(m_NodeTable2, m_LinkTable2);

        int nType = HW_EDIT_NONE;
        // nSpType == WM_HW_EDIT_BY_DT 일 때의 처리 (주석 처리된 조건 참고)
        {
            /*
             * 분선위의 링크부터 탐색하기 때문에 현재 노드의 상태를 유지해야 함.
             * → 원본 노드를 힙에 복사하여 m_NodeTable2에 보관
             */
            CGeoNode pMidNode = new CGeoNode();
            pMidNode.copyFrom(pOriNode); // 원본 노드 상태 보존을 위해 복사
            m_NodeTable2.add(pMidNode); // 임시 테이블에 추가

            // ── 삭제 처리 ──────────────────────────────────────────
            // 원본 노드 기준으로 편집 타입 결정 후 삭제 편집 수행
            nType = getNodeEditType(HW_DELETE, pOriNode, null);
            hwEditByNode(nType, HW_DELETE, pOriNode);

            // ── 삽입 처리 ──────────────────────────────────────────
            // 편집 노드의 데이터를 임시 노드에 복사 후 삽입 편집 수행
            pMidNode.copyFrom(pEditNode);
            nType = getNodeEditType(HW_INSERT, pEditNode, null);
            hwEditByNode(nType, HW_INSERT, pEditNode);
        }

        // 편집 완료 후 다이얼로그 UI 갱신
        updateDlg();
    }

    /**
     * [Image 3~6 - Line 1659] GetNodeEditType()
     * 주어진 노드와 링크 정보를 분석하여 어떤 종류의 편집이 필요한지 결정.
     *
     * @param nSp      편집 방향 (HW_DELETE or HW_INSERT)
     * @param pNode    대상 노드
     * @param pSelLink 선택된 링크 (null 가능, 링크 삭제 시 연관 경우만 처리)
     * @return         편집 타입 (HW_EDIT_NONE, HW_EDIT_TOLLGATE, HW_EDIT_MIDNODE 등)
     */
    public int getNodeEditType(int nSp, CGeoNode pNode, CGeoLink pSelLink) {
        int nRet = HW_EDIT_NONE; // 기본값: 편집 없음

        // ── 톨게이트(요금소) 정보 업데이트 ────────────────────────
        // 노드 이름 끝 4글자가 "톨게이트"이고 TollID가 유효하면 톨게이트 편집
        if (pNode.getName() != null
                && pNode.getName().length() >= 4
                && pNode.getName().substring(pNode.getName().length() - 4).equals("톨게이트")
                && pNode.getTollId() != 0) {

            nRet = HW_EDIT_TOLLGATE;

            // 통행 정보 목록을 순회하며 해당 톨게이트 링크 편집
            List<CGeoPassInfo> passList = pNode.getNodePassInfo();
            for (int i = 0; i < passList.size(); i++) {
                CGeoPassInfo pPass = passList.get(i);
                if (pPass == null) continue;

                // 진입/진출 링크가 동일하면 유효하지 않은 통행 정보 → 스킵
                if (pPass.getInLinkId() == pPass.getOutLinkId()) continue;

                // TCode가 3이 아닌 경우 해당 통행 정보 스킵
                // (TCode 3 = 양방향 통행 가능한 경우 등, 별도 확인 필요)
                if (pPass.getTCode() != 3) continue;

                // 톨게이트 링크 편집 수행
                hwEditTollGate(nSp, pNode, pPass.getInLinkId(), pPass.getOutLinkId());
                break; // 첫 번째 유효한 통행 정보만 처리
            }
        }

        // ── 통행 정보 목록 재순회: 노드 편집 타입 결정 ────────────
        List<CGeoPassInfo> passList = pNode.getNodePassInfo();
        for (int i = 0; i < passList.size(); i++) {
            CGeoPassInfo pPass = passList.get(i);
            if (pPass == null) continue;

            // 진입/진출 링크가 동일하면 스킵
            if (pPass.getInLinkId() == pPass.getOutLinkId()) continue;

            // TCode가 3이 아닌 경우 스킵
            if (pPass.getTCode() != 3) continue;

            // 링크 삭제 시: 선택된 링크와 연관된 경우만 수행
            if (pSelLink != null) {
                if (pPass.getInLinkId() != pSelLink.getObjId()
                        && pPass.getOutLinkId() != pSelLink.getObjId()) {
                    continue;
                }
            }

            // 통행 정보로부터 진입/진출 링크 객체 조회
            UnionId id = pNode.getObjIdAsUnion();

            id.dwObjectID = pPass.getInLinkId();
            CGeoLink inLink = new CGeoLink();
            inLink.copyFrom(findObj(LinkType.LINK_OBJECT, id)); // DC에서 링크 조회

            id.dwObjectID = pPass.getOutLinkId();
            CGeoLink outLink = new CGeoLink();
            outLink.copyFrom(findObj(LinkType.LINK_OBJECT, id));

            // 선택 링크가 있을 경우 해당 링크로 교체 (최신 상태 반영)
            if (pSelLink != null) {
                if (pPass.getInLinkId() == pSelLink.getObjId()) {
                    inLink.copyFrom(pSelLink);
                } else {
                    outLink.copyFrom(pSelLink);
                }
            }

            // ── 편집 타입 결정 로직 ────────────────────────────────
            int nEditType = HW_EDIT_NONE;

            /*
             * [중간 노드] MidNode 판별:
             * InLink와 OutLink 모두 JC(분기점) 카테고리이고
             * 두 링크 모두 고속도로(RoadCategory==1)인 경우
             */
            if (inLink.getLinkCategory().isJC()
                    && outLink.getLinkCategory().isJC()
                    && inLink.getRoadCategory() == 1
                    && outLink.getRoadCategory() == 1) {
                nEditType = HW_EDIT_MIDNODE;
                nRet = HW_EDIT_MIDNODE;

            /*
             * [중간 노드 - 톨게이트 특수 케이스]
             * 톨게이트이면서 InLink/OutLink 모두 IC(나들목)이고 고속도로인 경우
             */
            } else if (nRet == HW_EDIT_TOLLGATE
                    && inLink.getLinkCategory().isIC()
                    && outLink.getLinkCategory().isIC()
                    && inLink.getRoadCategory() == 1
                    && outLink.getRoadCategory() == 1) {
                nEditType = HW_EDIT_MIDNODE;
                nRet = HW_EDIT_MIDNODE;

            /*
             * [끝 노드] EdNode 판별:
             * InLink가 IC이고 고속도로, OutLink가 비고속도로인 경우 (나들목 진출)
             */
            } else if (inLink.getLinkCategory().isIC()
                    && inLink.getRoadCategory() == 1
                    && outLink.getRoadCategory() != 1) {
                nEditType = HW_EDIT_EDNODE;

            /*
             * OutLink가 IC이고 고속도로, InLink가 비고속도로인 경우 (나들목 진입)
             */
            } else if (outLink.getLinkCategory().isIC()
                    && outLink.getRoadCategory() == 1
                    && inLink.getRoadCategory() != 1) {
                nEditType = HW_EDIT_EDNODE;

            /*
             * InLink가 JC이고 고속도로, OutLink가 비고속도로 + IsRoad인 경우
             */
            } else if (inLink.getLinkCategory().isJC()
                    && inLink.getRoadCategory() == 1
                    && outLink.getRoadCategory() != 1
                    && outLink.getLinkCategory().isRoad()) {
                nEditType = HW_EDIT_EDNODE;

            /*
             * OutLink가 JC이고 고속도로, InLink가 비고속도로 + IsRoad인 경우
             */
            } else if (outLink.getLinkCategory().isJC()
                    && outLink.getRoadCategory() == 1
                    && inLink.getRoadCategory() != 1
                    && inLink.getLinkCategory().isRoad()) {
                nEditType = HW_EDIT_EDNODE;

            /*
             * [시작 노드] StNode 판별:
             * 두 링크 모두 고속도로이고, IsRoad, 도로 번호가 다른 경우 (분기 구간)
             */
            } else if (inLink.getRoadCategory() == 1
                    && outLink.getRoadCategory() == 1
                    && inLink.getLinkCategory().isRoad()
                    && outLink.getLinkCategory().isRoad()
                    && inLink.getRoadNo() != outLink.getRoadNo()) {
                nEditType = HW_EDIT_STNODE;

            /*
             * InLink가 IC이고 고속도로, OutLink도 고속도로 + IsRoad인 경우
             */
            } else if (inLink.getLinkCategory().isIC()
                    && inLink.getRoadCategory() == 1
                    && outLink.getRoadCategory() == 1
                    && outLink.getLinkCategory().isRoad()) {
                nEditType = HW_EDIT_STNODE;

            /*
             * OutLink가 IC이고 고속도로, InLink도 고속도로 + IsRoad인 경우
             */
            } else if (outLink.getLinkCategory().isIC()
                    && outLink.getRoadCategory() == 1
                    && inLink.getRoadCategory() == 1
                    && inLink.getLinkCategory().isRoad()) {
                nEditType = HW_EDIT_STNODE;

            /*
             * InLink가 JC이고 고속도로, OutLink도 고속도로 + IsRoad인 경우
             */
            } else if (inLink.getLinkCategory().isJC()
                    && inLink.getRoadCategory() == 1
                    && outLink.getRoadCategory() == 1
                    && outLink.getLinkCategory().isRoad()) {
                nEditType = HW_EDIT_STNODE;

            /*
             * OutLink가 JC이고 고속도로, InLink도 고속도로 + IsRoad인 경우
             */
            } else if (outLink.getLinkCategory().isJC()
                    && outLink.getRoadCategory() == 1
                    && inLink.getRoadCategory() == 1
                    && inLink.getLinkCategory().isRoad()) {
                nEditType = HW_EDIT_STNODE;

            /*
             * 톨게이트 조건:
             * CheckRoute(pNode) == true이고
             * TollID가 유효하고 양쪽 링크가 모두 고속도로인 경우 (또는 한쪽이 IsRoad인 경우)
             */
            } else if (checkRoute(pNode)
                    && ((pNode.getTollId() != 0
                            && inLink.getRoadCategory() == 1
                            && outLink.getRoadCategory() == 1
                            && outLink.getLinkCategory().isRoad())
                         || (pNode.getTollId() != 0
                            && outLink.getRoadCategory() == 1
                            && inLink.getRoadCategory() == 1
                            && inLink.getLinkCategory().isRoad()))) {
                nEditType = HW_EDIT_STNODE;

            // ── Route 업데이트 판별 ──────────────────────────────────

            /*
             * [SA 연결 시작 노드] StNode_SA:
             * InLink가 SA 카테고리이고 고속도로, OutLink도 고속도로 + IsRoad인 경우
             */
            } else if (inLink.getLinkCategory().isSA()
                    && inLink.getRoadCategory() == 1
                    && outLink.getRoadCategory() == 1
                    && outLink.getLinkCategory().isRoad()) {
                nEditType = HW_EDIT_STNODE_SA;

            /*
             * OutLink가 SA이고 고속도로, InLink도 고속도로 + IsRoad인 경우
             */
            } else if (outLink.getLinkCategory().isSA()
                    && outLink.getRoadCategory() == 1
                    && inLink.getRoadCategory() == 1
                    && inLink.getLinkCategory().isRoad()) {
                nEditType = HW_EDIT_STNODE_SA;

            /*
             * [강경구 2009-12-08 코멘트]
             * 진입 일반 도로 → 전출 고속도로 분선일 경우:
             * InLink가 비고속도로, OutLink가 고속도로 + IsRoad인 경우
             */
            } else if (inLink.getRoadCategory() != 1
                    && outLink.getRoadCategory() == 1
                    && outLink.getLinkCategory().isRoad()) {
                nEditType = HW_EDIT_STNODE;
            }

            // ── nEditType이 결정되지 않은 경우 예외 Route 처리 ──────
            if (nEditType == HW_EDIT_NONE
                    && !inLink.getLinkCategory().isRoad()
                    && !outLink.getLinkCategory().isRoad()
                    && inLink.getRoadCategory() != 1
                    && outLink.getRoadCategory() != 1) {

                // 전입 링크: 고속도로 분선 → 고속도로 본선 아닌 도로 전출 링크: 연결로일 경우 Route 작성
                if (checkExceptionRoute(pNode)) {
                    m_bIsRoute = true;
                    hwEditExceptionRoute(nSp, pNode, inLink, outLink);
                    m_bIsRoute = false;
                }
            }

            // ── StNode 또는 SA StNode인 경우 Route 정보도 함께 업데이트 ─
            if (nEditType == HW_EDIT_STNODE
                    || nEditType == HW_EDIT_STNODE_SA
                    || nRet == HW_EDIT_TOLLGATE) {

                // 분선과 연결된 경우 Route 정보 업데이트
                if ((inLink.getRoadCategory() == 1 && inLink.getLinkCategory().isRoad())
                        || (outLink.getRoadCategory() == 1 && outLink.getLinkCategory().isRoad())) {

                    m_bIsRoute = true;
                    hwEditStRoute(nSp, pNode, inLink, outLink);
                    m_bIsRoute = false;
                }

                // SA 타입은 nRet에 반영하지 않음 (HW_EDIT_NONE으로 리셋)
                if (nEditType == HW_EDIT_STNODE_SA) {
                    nEditType = HW_EDIT_NONE;
                }
            }

            // ── 최종 nRet 결정 ──────────────────────────────────────
            // 톨게이트가 아닌 유효한 편집 타입이면 nRet에 반영
            if (nEditType != HW_EDIT_NONE && nRet != HW_EDIT_TOLLGATE) {
                nRet = nEditType;
            }
        } // for loop end

        return nRet;
    }

    // =====================================================================
    // 하위 메서드 - 구현 필요 (별도 확인 필요 목록 참고)
    // =====================================================================

    /** 임시 도로 테이블 초기화 */
    private void initRoad(List<CGeoNode> nodeTable, List<CGeoLink> linkTable) {
        // TODO: 구현 필요 - nodeTable, linkTable 초기화 로직
    }

    /** 노드 타입에 따른 실제 편집 수행 */
    private void hwEditByNode(int nType, int nSpType, CGeoNode pNode) {
        // TODO: 구현 필요 - 편집 타입별 분기 처리
    }

    /** 톨게이트 링크 편집 수행 */
    private void hwEditTollGate(int nSp, CGeoNode pNode, long inLinkId, long outLinkId) {
        // TODO: 구현 필요
    }

    /** 시작 노드 Route 편집 수행 */
    private void hwEditStRoute(int nSp, CGeoNode pNode, CGeoLink inLink, CGeoLink outLink) {
        // TODO: 구현 필요
    }

    /** 예외 Route 편집 수행 (일반도로→고속도로 연결로 케이스) */
    private void hwEditExceptionRoute(int nSp, CGeoNode pNode, CGeoLink inLink, CGeoLink outLink) {
        // TODO: 구현 필요
    }

    /** Route 여부 체크 */
    private boolean checkRoute(CGeoNode pNode) {
        // TODO: 구현 필요 - pNode가 Route에 속하는지 판별
        return false;
    }

    /** 예외 Route 여부 체크 */
    private boolean checkExceptionRoute(CGeoNode pNode) {
        // TODO: 구현 필요
        return false;
    }

    /** DC(데이터 컨텍스트)에서 링크 객체 조회 */
    private CGeoLink findObj(int linkType, UnionId id) {
        // TODO: 구현 필요 - DC로부터 실제 링크 데이터 조회
        return new CGeoLink();
    }

    /** 다이얼로그 UI 갱신 */
    private void updateDlg() {
        // TODO: 구현 필요
    }
}

// =====================================================================
// 플레이스홀더 클래스 (실제 구현체로 대체 필요)
// =====================================================================
class DCManager {
    public String getTime() { return ""; }
    public void getAttribute(int objType, int spType, CGeoNode node) {}
}

interface LinkType {
    int LINK_OBJECT = 2;
}
