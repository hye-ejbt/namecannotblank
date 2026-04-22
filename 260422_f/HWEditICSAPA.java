import java.util.*;

/**
 * =====================================================================
 * HwEditICSAPA.java
 * IC/SA/PA 편집 관련 클래스 및 함수 포팅
 *
 * 원본 C++ 파일:
 *  - CGeoLinkCategory::IsIC()       (Image 1)
 *  - class CGeoAdjNode              (Image 2)
 *  - class CGeoBaseObject           (Image 3)
 *  - CHwDataManager::HWEditICSAPA() (Image 4~6, Line 1355~1432)
 *
 * 주요 기능:
 *  - 링크 카테고리 비트 플래그 판별 (IsIC 등)
 *  - 인접 노드 / 기본 객체 모델 정의
 *  - IC/SA/PA 노드에 대한 편집 데이터 구성 및 중복 검사
 * =====================================================================
 */


// =====================================================================
// [Image 1] CGeoLinkCategory - 링크 카테고리 비트 판별 클래스
// =====================================================================
/**
 * 링크의 종류를 비트 플래그로 관리하는 클래스.
 *
 * m_wLinkCategory의 각 비트가 링크 종류를 나타냄:
 *
 *   Bit 3 (0x0008) = IC (나들목, Interchange)
 *   Bit ? (0x????) = JC (분기점, Junction) - 별도 확인 필요
 *   Bit ? (0x????) = SA (휴게소, Service Area) - 별도 확인 필요
 *   Bit ? (0x????) = IsRoad (일반 도로) - 별도 확인 필요
 */
class CGeoLinkCategory {

    /** 링크 카테고리 비트 필드 (C++ WORD = 16비트 unsigned) */
    private int m_wLinkCategory;

    public CGeoLinkCategory(int categoryBits) {
        this.m_wLinkCategory = categoryBits;
    }

    /**
     * [Image 1] IsIC() - IC(나들목) 여부 판별
     *
     * 비트 마스크: 0x0008 = 0000 0000 0000 1000
     * → 비트 3번이 1이면 IC
     *
     * C++ 원본: return (m_wLinkCategory & 0x0008) >> 3;
     * Java:     비트 AND 후 3비트 우측 시프트 → 1이면 true
     */
    public boolean isIC() {
        return ((m_wLinkCategory & 0x0008) >> 3) == 1;
    }

    /**
     * IsJC() - JC(분기점) 여부 판별
     * TODO: 실제 비트 마스크 값 확인 필요
     */
    public boolean isJC() {
        // 예시: 비트 4번이 JC라면 0x0010
        return ((m_wLinkCategory & 0x0010) >> 4) == 1; // 확인 필요
    }

    /**
     * IsSA() - SA(휴게소) 여부 판별
     * TODO: 실제 비트 마스크 값 확인 필요
     */
    public boolean isSA() {
        return ((m_wLinkCategory & 0x0020) >> 5) == 1; // 확인 필요
    }

    /**
     * IsRoad() - 일반 도로 여부 판별
     * TODO: 실제 비트 마스크 값 확인 필요
     */
    public boolean isRoad() {
        return ((m_wLinkCategory & 0x0001)) == 1; // 확인 필요
    }
}


// =====================================================================
// [Image 3] CGeoBaseObject - 지리 객체의 기본 식별 정보
// =====================================================================
/**
 * 모든 지리 객체(노드, 링크 등)의 기반 클래스.
 * MapID(지도 ID)와 ObjectID(객체 ID)를 보유.
 *
 * C++ DWORD = Java long (32비트 unsigned → Java는 long으로 표현)
 */
class CGeoBaseObject {

    /** 지도 ID (Map ID) */
    private long m_dwMapID;

    /** 객체 ID (Object ID) */
    private long m_dwObjectID;

    // ── 생성자 ─────────────────────────────────────────────────────
    public CGeoBaseObject() {}

    public CGeoBaseObject(CGeoBaseObject pObj) {
        if (pObj != null) {
            copyFrom(pObj);
        }
    }

    // ── 공개 메서드 ────────────────────────────────────────────────

    /** 지도 ID 설정 */
    public void setMapID(long dwMapID) {
        this.m_dwMapID = dwMapID;
    }

    /** 지도 ID 반환 */
    public long getMapID() {
        return m_dwMapID;
    }

    /** 객체 ID 설정 */
    public void setObjectID(long dwObjectID) {
        this.m_dwObjectID = dwObjectID;
    }

    /** 객체 ID 반환 */
    public long getObjectID() {
        return m_dwObjectID;
    }

    /**
     * 동등 비교
     * @param pInfo 비교 대상 객체
     */
    public boolean isEqual(CGeoBaseObject pInfo) {
        if (pInfo == null) return false;
        return this.m_dwMapID == pInfo.m_dwMapID
            && this.m_dwObjectID == pInfo.m_dwObjectID;
    }

    /** 현재 객체의 복사본 반환 */
    public CGeoBaseObject clone() {
        CGeoBaseObject copy = new CGeoBaseObject();
        copy.m_dwMapID = this.m_dwMapID;
        copy.m_dwObjectID = this.m_dwObjectID;
        return copy;
    }

    /**
     * UNIONID 형태로 반환 (MapID + ObjectID 복합 식별자)
     * C++ UNIONID 구조체 대응
     */
    public UnionId getUnionId() {
        UnionId uid = new UnionId();
        uid.dwObjectID = m_dwObjectID;
        // uid.strMapID = String.valueOf(m_dwMapID); // 필요 시 추가
        return uid;
    }

    // ── 내부 메서드 ────────────────────────────────────────────────

    /** 내부 상태 초기화 */
    private void clear() {
        m_dwMapID = 0;
        m_dwObjectID = 0;
    }

    /**
     * 다른 객체로부터 데이터 복사
     * @param pEnt 복사 원본
     */
    private boolean copyFrom(CGeoBaseObject pEnt) {
        if (pEnt == null) return false;
        this.m_dwMapID = pEnt.m_dwMapID;
        this.m_dwObjectID = pEnt.m_dwObjectID;
        return true;
    }
}


// =====================================================================
// [Image 2] CGeoAdjNode - 인접 노드 정보 클래스
// =====================================================================
/**
 * 노드와 인접한 다른 노드로의 참조 정보.
 * GetKind()==7 인 노드 탐색 시 다음 노드로 이동하는 데 사용됨.
 *
 * C++ 원본: class CGeoAdjNode
 *   - m_BaseObject: CGeoBaseObject (MapID + ObjectID 보관)
 */
class CGeoAdjNode {

    /** 인접 노드의 기본 식별 정보 (MapID, ObjectID) */
    protected CGeoBaseObject m_BaseObject;

    // ── 생성자 ─────────────────────────────────────────────────────

    public CGeoAdjNode() {
        m_BaseObject = new CGeoBaseObject();
    }

    public CGeoAdjNode(CGeoAdjNode pObj) {
        m_BaseObject = new CGeoBaseObject();
        if (pObj != null) {
            copyFrom(pObj);
        }
    }

    // ── 공개 메서드 ────────────────────────────────────────────────

    /**
     * 기본 객체 설정
     * @param baseObject 설정할 CGeoBaseObject
     */
    public void setBaseObject(CGeoBaseObject baseObject) {
        this.m_BaseObject = baseObject;
    }

    /**
     * 기본 객체 참조 반환
     * C++ 반환형이 참조(&)이므로 Java에서는 직접 객체 반환
     */
    public CGeoBaseObject getBaseObject() {
        return m_BaseObject;
    }

    /**
     * 다른 CGeoAdjNode로부터 데이터 복사
     * @param pEnt 복사 원본
     * @return 성공 여부
     */
    public boolean copyFrom(CGeoAdjNode pEnt) {
        if (pEnt == null) return false;
        this.m_BaseObject = pEnt.m_BaseObject.clone();
        return true;
    }

    /**
     * 현재 객체의 복사본 반환
     */
    public CGeoAdjNode clone() {
        CGeoAdjNode copy = new CGeoAdjNode();
        copy.copyFrom(this);
        return copy;
    }

    /**
     * 동등 비교
     * @param pInfo 비교 대상
     */
    public boolean isEqual(CGeoAdjNode pInfo) {
        if (pInfo == null) return false;
        return this.m_BaseObject.isEqual(pInfo.m_BaseObject);
    }
}


// =====================================================================
// ICSAPA 편집 데이터 구조체 (C++ S_HWICSAPA 대응)
// =====================================================================

/** HW 공통 객체 식별 정보 (C++ S_HWOBJECT 대응) */
class SHwObject {
    public byte   m_btDir;          // 방향 코드 (btDir)
    public long   m_lICNo;          // IC 번호 (TollID)
    public long   m_dwMapID1;       // 노드 MapID
    public long   m_dwObjID1;       // 노드 ObjectID (ConNode)
    public long   m_dwObjID2;       // 링크 ObjectID (NextLink)
    public char[] m_strCurrentTime = new char[30]; // 현재 처리 시각 (30자)
}

/** IC/SA/PA 편집 데이터 패킷 (C++ S_HWICSAPA 대응) */
class SHwICSAPA {
    public byte      m_btInOutAttr; // 진출입 속성 (1=진출, 2=진입)
    public SHwObject m_sHwObject = new SHwObject();
}


// =====================================================================
// [Image 4~6] HWEditICSAPA - ICSAPA 편집 처리 클래스
// =====================================================================
class HwEditICSAPAManager {

    // ── 멤버 변수 ──────────────────────────────────────────────────────
    private boolean m_bIsEditByEdNode  = false; // 끝 노드 편집 모드 여부
    private boolean m_bIsEditByTollNode = false; // 톨게이트 노드 편집 여부
    private String  m_strCurrentTime   = "";    // 현재 처리 시각

    /** ICSAPA 편집 정보 목록 (중복 체크 및 누적 저장) */
    private List<SHwICSAPA> m_vecICSAPAInfo = new ArrayList<>();

    /** 오류 카운터 (중복 감지 시 증가) */
    private int m_nErrorCheck = 0;

    /** 마지막으로 처리된 톨게이트 노드 */
    private CGeoNode m_TollGateNode = new CGeoNode();

    // ── MainFrame 참조 (UI 로그 출력용) ───────────────────────────────
    private MainFrame pFrame; // AfxGetMainWnd() 대응

    /**
     * [Image 4, Line 1355] HWEditICSAPA()
     *
     * IC/SA/PA 노드에 대한 편집 데이터를 구성하고
     * m_vecICSAPAInfo에 등록 (중복 시 오류 카운터 증가).
     *
     * @param nSpType  편집 방향 (HW_DELETE / HW_INSERT)
     * @param pStNode  시작 노드 (고속도로 본선 기준 노드)
     * @param pConNode 연결 노드 (IC/SA 진출입 노드)
     * @param pLink    현재 처리 링크
     * @param nInOut   방향 구분 (0=진출, 1=진입)
     * @param btDir    고속도로 시설 방향 코드
     */
    public void hwEditICSAPA(
            int nSpType,
            CGeoNode pStNode,
            CGeoNode pConNode,
            CGeoLink pLink,
            int nInOut,
            byte btDir) {

        // ── 로컬 변수 초기화 ────────────────────────────────────────
        CGeoLink nextLink = new CGeoLink();
        nextLink.copyFrom(pLink);       // 현재 링크를 NextLink로 복사

        CGeoNode conNode = new CGeoNode();
        conNode.copyFrom(pConNode);     // 연결 노드 로컬 복사

        CGeoNode stNode = new CGeoNode();
        stNode.copyFrom(pStNode);       // 시작 노드 로컬 복사

        // UI 작업 다이얼로그 텍스트용 버퍼
        String strText = "";

        // ── [Line 1368] 일반도로에서 검색 시: ConNode/stNode 역할 교환 ──
        // EdNode 편집 모드일 때 진입/진출 방향이 반전됨
        if (m_bIsEditByEdNode) {
            CGeoNode temp = new CGeoNode();
            temp.copyFrom(conNode);
            conNode.copyFrom(stNode);  // ConNode ← pStNode
            stNode.copyFrom(temp);     // stNode  ← pConNode
        }

        // ── [Line 1373] 진출입 속성 결정 ───────────────────────────
        // nInOutAttr: 실제 DB 저장용 진출입 코드
        //   1 = 진출 (출구), 2 = 진입 (입구)
        int nInOutAttr = 0;

        if (nInOut == 0) {
            // nInOut == 0: 진출 방향
            if (m_bIsEditByEdNode) {
                nInOutAttr = 1; // EdNode 편집 모드에서 진출 = 코드 1
            } else {
                nInOutAttr = 2; // 일반 모드에서 진출 = 코드 2
            }
        } else {
            // nInOut == 1: 진입 방향
            if (m_bIsEditByEdNode) {
                nInOutAttr = 2; // EdNode 편집 모드에서 진입 = 코드 2
            } else {
                nInOutAttr = 1; // 일반 모드에서 진입 = 코드 1
            }
        }

        // ── [Line 1387] 톨 타입별 로그 문자열 구성 ─────────────────
        // pStNode의 톨 타입에 따라 어떤 케이스인지 분류하여 로그 기록

        if ((nInOut == 0 && pStNode.getTollType().getTicket() == 1)
                || (nInOut == 1 && pStNode.getTollType().getAccount() == 1)) {
            // 케이스 1-1: 폐쇄형 입/출구 & 개방형 출구
            strText = String.format(
                "1-1 node ID %d link_id %d / nInOut : %d / ticket : %d / account : %d / Inout : %d",
                conNode.getObjId(), nextLink.getObjId(), nInOut,
                pStNode.getTollType().getTicket(),
                pStNode.getTollType().getAccount(),
                pStNode.getTollType().getInOut()
            );

        } else if (nInOut == 0 && pStNode.getTollType().getInOut() == 1) {
            // 케이스 1-2: 개방형의 입구
            strText = String.format(
                "1-2 node ID %d link_id %d / nInOut : %d / ticket : %d / account : %d / Inout : %d",
                conNode.getObjId(), nextLink.getObjId(), nInOut,
                pStNode.getTollType().getTicket(),
                pStNode.getTollType().getAccount(),
                pStNode.getTollType().getInOut()
            );

        } else if (!m_bIsEditByTollNode) {
            // 케이스 1-3: 일반 IC - 톨 노드 편집이 아닌 경우
            strText = String.format(
                "1-3 ic-normal case node ID %d link_id %d / nInOut : %d / ticket : %d / account : %d / Inout : %d",
                conNode.getObjId(), nextLink.getObjId(), nInOut,
                pStNode.getTollType().getTicket(),
                pStNode.getTollType().getAccount(),
                pStNode.getTollType().getInOut()
            );

        } else {
            // 케이스 1-4: 그 외 (톨 노드 편집 등 예외 케이스)
            strText = String.format(
                "1-4 node ID %d link_id %d / nInOut : %d / ticket : %d / account : %d / Inout : %d",
                conNode.getObjId(), nextLink.getObjId(), nInOut,
                pStNode.getTollType().getTicket(),
                pStNode.getTollType().getAccount(),
                pStNode.getTollType().getInOut()
            );

            // 케이스 1-4는 처리 불가 케이스 → UI에 표시 후 종료
            if (pFrame != null) {
                pFrame.setWorkDlgText(strText);
            }
            return;
        }

        // 케이스 1-1 ~ 1-3: UI 다이얼로그에 진행 상황 텍스트 표시
        if (pFrame != null) {
            pFrame.setWorkDlgText(strText);
        }

        // ── [Line 1403] S_HWICSAPA 데이터 패킷 구성 ────────────────
        SHwICSAPA sICSAP = new SHwICSAPA();

        // 진출입 속성 설정
        sICSAP.m_btInOutAttr = (byte) nInOutAttr;

        // 고속도로 방향 코드 (btDir: pStPreLink의 시설 방향)
        sICSAP.m_sHwObject.m_btDir = btDir;

        // IC 번호 = ConNode의 TollID
        sICSAP.m_sHwObject.m_lICNo = conNode.getTollId();

        // MapID1: ConNode의 MapID (문자열 → long 변환)
        // C++: _ttol(& ConNode.GetObjID().strMapID)
        sICSAP.m_sHwObject.m_dwMapID1 = conNode.getMapId();

        // ObjID1: ConNode의 ObjectID
        sICSAP.m_sHwObject.m_dwObjID1 = conNode.getObjId();

        // ObjID2: NextLink(= 처리 링크)의 ObjectID
        sICSAP.m_sHwObject.m_dwObjID2 = nextLink.getObjId();

        // 현재 처리 시각 복사 (최대 30자, C++ memcpy 대응)
        char[] timeChars = m_strCurrentTime.toCharArray();
        int copyLen = Math.min(timeChars.length, 30);
        System.arraycopy(timeChars, 0, sICSAP.m_sHwObject.m_strCurrentTime, 0, copyLen);

        // ── [Line 1414] 중복 체크: m_vecICSAPAInfo에서 동일 항목 탐색 ─
        int nCnt = 0;
        for (int nIdx = 0; nIdx < m_vecICSAPAInfo.size(); nIdx++) {
            SHwICSAPA existing = m_vecICSAPAInfo.get(nIdx);

            // 6개 필드가 모두 일치하면 중복으로 판정
            if (sICSAP.m_btInOutAttr              == existing.m_btInOutAttr
                    && sICSAP.m_sHwObject.m_btDir      == existing.m_sHwObject.m_btDir
                    && sICSAP.m_sHwObject.m_lICNo      == existing.m_sHwObject.m_lICNo
                    && sICSAP.m_sHwObject.m_dwMapID1   == existing.m_sHwObject.m_dwMapID1
                    && sICSAP.m_sHwObject.m_dwObjID1   == existing.m_sHwObject.m_dwObjID1
                    && sICSAP.m_sHwObject.m_dwObjID2   == existing.m_sHwObject.m_dwObjID2) {
                nCnt++; // 중복 발견
            }
        }

        if (nCnt > 0) {
            // 중복 항목이 이미 존재: 오류 카운터 증가 (무한루프 방지에 활용)
            ++m_nErrorCheck;
        } else {
            // 중복 없음: 새 항목으로 목록에 추가
            m_vecICSAPAInfo.add(sICSAP);
        }

        // ── [Line 1431] 처리된 ConNode를 TollGateNode로 저장 ────────
        // 다음 처리 시 톨게이트 노드 참조용
        m_TollGateNode.copyFrom(conNode);
    }
}


// =====================================================================
// 보조 클래스 (실제 구현체로 대체 필요)
// =====================================================================

/** 톨 타입 정보 (C++ TollType 대응) */
class TollType {
    /** 티켓형 여부 (1=폐쇄형) */
    public int getTicket()  { return 0; } // TODO
    /** 정산형 여부 (1=개방형 출구) */
    public int getAccount() { return 0; } // TODO
    /** 진출입 타입 (1=개방형 입구) */
    public int getInOut()   { return 0; } // TODO
}

/** CGeoNode 확장 */
class CGeoNode {
    private long   objId;
    private long   mapId;
    private String name;
    private long   tollId;
    private int    kind;
    private List<CGeoPassInfo> passInfoList = new ArrayList<>();

    public long   getObjId()  { return objId; }
    public long   getMapId()  { return mapId; }
    public String getName()   { return name; }
    public long   getTollId() { return tollId; }
    public int    getKind()   { return kind; }

    /** 톨 타입 정보 반환 */
    public TollType getTollType() { return new TollType(); }

    public CGeoAdjNode getAdjNode() { return new CGeoAdjNode(); }
    public List<CGeoPassInfo> getNodePassInfo() { return passInfoList; }

    public UnionId getObjIdAsUnion() {
        UnionId u = new UnionId();
        u.dwObjectID = this.objId;
        return u;
    }

    public void copyFrom(CGeoNode src) {
        if (src == null) return;
        this.objId  = src.objId;
        this.mapId  = src.mapId;
        this.name   = src.name;
        this.tollId = src.tollId;
        this.kind   = src.kind;
    }
}

/** CGeoLink 확장 */
class CGeoLink {
    private long objId;
    private long stNodeId;
    private long edNodeId;
    private int  roadCategory;
    private int  categoryBits;

    public long getObjId()       { return objId; }
    public long getStNodeId()    { return stNodeId; }
    public long getEdNodeId()    { return edNodeId; }
    public int  getRoadCategory(){ return roadCategory; }

    public CGeoLinkCategory getLinkCategory() {
        return new CGeoLinkCategory(categoryBits);
    }

    public HighwayFacilityInfo getHighwayFacilityInfo() {
        return new HighwayFacilityInfo();
    }

    public void copyFrom(CGeoLink src) {
        if (src == null) return;
        this.objId         = src.objId;
        this.stNodeId      = src.stNodeId;
        this.edNodeId      = src.edNodeId;
        this.roadCategory  = src.roadCategory;
        this.categoryBits  = src.categoryBits;
    }
}

/** 고속도로 시설 방향 정보 */
class HighwayFacilityInfo {
    public byte getDirection() { return 0; } // TODO
}

/** UI 작업 다이얼로그 (C++ CMainFrame 대응) */
class MainFrame {
    public void setWorkDlgText(String text) {
        System.out.println("[WorkDlg] " + text);
    }
}

/** 복합 객체 식별자 */
class UnionId {
    public long dwObjectID;
}

/** 통과 정보 */
class CGeoPassInfo {
    private long inLinkId;
    private long outLinkId;
    private int  tCode;

    public long getInLinkId()  { return inLinkId; }
    public long getOutLinkId() { return outLinkId; }
    public int  getTCode()     { return tCode; }
}
