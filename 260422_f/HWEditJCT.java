import java.util.*;

/**
 * =====================================================================
 * HwEditJCT.java
 * JCT(분기점) 편집 처리 포팅
 *
 * 원본: C++ CHwDataManager::HWEditJCT() (Line 1434 ~ 1489)
 *
 * 주요 역할:
 *  - pStNode의 통행 정보에서 JCT 이전 링크(pPreLink)를 탐색
 *  - 역방향(nInOut==1) 처리 시 노드/링크 역할 교환
 *  - 도로 번호가 같으면 편집 불필요 → return
 *  - S_HWJCTINFO 데이터 패킷 구성 후 m_vecJCTInfo에 등록
 * =====================================================================
 */

// =====================================================================
// JCT 편집 데이터 구조체 (C++ S_HWJCTINFO 대응)
// =====================================================================

/**
 * JCT 편집 정보 패킷.
 *
 * C++ 구조:
 *   S_HWOBJECT m_sHwObject  → 시작 노드(StNode) 기준 정보
 *   long       m_lICNo2     → 연결 노드(ConNode) TollID
 *   long       m_dwManageNosun2 → 다음 링크 도로 번호
 *   byte       m_btDir2     → 다음 링크 방향 코드
 *   (MapID2, ObjID2 는 m_sHwObject 의 두 번째 세트로 관리)
 */
class SHwJCTInfo {
    // ── 시작 노드(StNode) 기준 정보 ──────────────────────────────
    public SHwObject m_sHwObject = new SHwObject();
    // m_sHwObject.m_lICNo       : updStNode.TollID
    // m_sHwObject.m_dwMapID1    : updStNode MapID  (문자열 → long)
    // m_sHwObject.m_dwObjID1    : updStNode ObjectID
    // m_sHwObject.m_lManageNosun: updPreLink.RoadNo
    // m_sHwObject.m_btDir       : updPreLink 방향 코드

    // ── 연결 노드(ConNode) 기준 정보 ─────────────────────────────
    public long m_lICNo2;           // updNode(ConNode) TollID
    public long m_dwMapID2;         // updNode MapID    (문자열 → long)
    public long m_dwObjID2;         // updNode ObjectID
    public long m_dwManageNosun2;   // updNextLink.RoadNo
    public byte m_btDir2;           // updNextLink 방향 코드
}

/** HW 공통 객체 식별 정보 (C++ S_HWOBJECT 대응, 재사용) */
class SHwObject {
    public long   m_lICNo;           // IC/톨게이트 번호 (TollID)
    public long   m_dwMapID1;        // 노드 MapID  (숫자 문자열 → long)
    public long   m_dwObjID1;        // 노드 ObjectID
    public long   m_lManageNosun;    // 도로 관리 번호 (RoadNo)
    public byte   m_btDir;           // 고속도로 방향 코드
    public long   m_dwMapID2;        // 두 번째 노드 MapID
    public long   m_dwObjID2;        // 두 번째 노드 ObjectID
    public char[] m_strCurrentTime = new char[30]; // 처리 시각 (30자)
}


// =====================================================================
// HWEditJCT 로직을 포함하는 매니저 클래스
// =====================================================================
class HwEditJCTManager {

    // ── 멤버 변수 ──────────────────────────────────────────────────────
    private String m_strCurrentTime = ""; // 현재 처리 시각

    /** JCT 편집 정보 목록 */
    private List<SHwJCTInfo> m_vecJCTInfo = new ArrayList<>();

    /**
     * [Line 1434] HWEditJCT()
     *
     * JCT(분기점) 노드에 대한 편집 데이터를 구성하고
     * m_vecJCTInfo에 등록.
     *
     * 처리 흐름:
     *  1. pStNode의 통행 정보에서 진출/진입 방향 링크 ID 결정
     *  2. 해당 링크를 pPreLink(JCT 이전 링크)로 조회
     *  3. 역방향(nInOut==1)이면 노드/링크 역할 교환
     *  4. 양쪽 도로 번호가 같으면 편집 불필요 → return
     *  5. S_HWJCTINFO 패킷 구성 후 목록에 추가
     *
     * @param nSpType   편집 방향 (HW_DELETE / HW_INSERT)
     * @param pStNode   시작 노드 (JCT 기준 노드)
     * @param pConNode  연결 노드 (JCT 반대편 노드)
     * @param pNextLink 다음 링크 (JCT 이후 본선 링크)
     * @param nInOut    방향 구분 (0=진출, 1=진입/역방향)
     */
    public void hwEditJCT(
            int nSpType,
            CGeoNode pStNode,
            CGeoNode pConNode,
            CGeoLink pNextLink,
            int nInOut) {

        // ── [Line 1435] 통행 정보에서 JCT 이전 링크 ID 결정 ─────────
        // pStNode의 ObjID를 기반으로 탐색 시작
        UnionId id = new UnionId();
        id.dwObjectID = pStNode.getObjId();

        // pStNode의 NodePassInfo 순회
        List<CGeoPassInfo> passList = pStNode.getNodePassInfo();
        for (int k = 0; k < passList.size(); k++) {
            CGeoPassInfo pPass = passList.get(k);

            // TCode != 3이면 유효하지 않은 통행 정보 → 스킵
            if (pPass.getTCode() != 3) continue;

            if (nInOut == 0) {
                // 진출(출구) 방향: InLinkID가 이전 링크
                id.dwObjectID = pPass.getInLinkId();
            } else {
                // 진입(입구) 방향: OutLinkID가 이전 링크
                id.dwObjectID = pPass.getOutLinkId();
            }
            break; // 첫 번째 유효한 통행 정보만 사용
        }

        // ── [Line 1450] JCT의 이전 링크 조회 ───────────────────────
        // 결정된 id로 LINK_OBJECT를 DC에서 조회
        CGeoLink pPreLink = (CGeoLink) findObj(LinkObjectType.LINK_OBJECT, id);

        // ── [Line 1452] 업데이트용 로컬 복사본 생성 ─────────────────
        CGeoNode updNode = new CGeoNode();
        updNode.copyFrom(pConNode);      // ConNode 복사

        CGeoNode updStNode = new CGeoNode();
        updStNode.copyFrom(pStNode);     // StNode 복사

        CGeoLink updNextLink = new CGeoLink();
        updNextLink.copyFrom(pNextLink); // NextLink 복사

        CGeoLink updPreLink = new CGeoLink();
        updPreLink.copyFrom(pPreLink);   // PreLink 복사

        // ── [Line 1461] 역방향 처리: nInOut == 1일 때 역할 교환 ──────
        // 진입 방향은 시작/연결 노드와 이전/다음 링크가 반전됨
        if (nInOut == 1) {
            // updNode ↔ updStNode 교환
            CGeoNode tempNode = new CGeoNode();
            tempNode.copyFrom(updNode);
            updNode.copyFrom(updStNode);        // updNode    ← pStNode
            updStNode.copyFrom(tempNode);       // updStNode  ← pConNode

            // updNextLink ↔ updPreLink 교환
            CGeoLink tempLink = new CGeoLink();
            tempLink.copyFrom(updNextLink);
            updNextLink.copyFrom(updPreLink);   // updNextLink ← pPreLink
            updPreLink.copyFrom(tempLink);      // updPreLink  ← pNextLink
        }

        // ── [Line 1469] 도로 번호 동일 시 편집 불필요 → return ───────
        // 이전 링크와 다음 링크의 도로 번호가 같으면 분기가 없는 것 → 처리 안 함
        if (updPreLink.getRoadNo() == updNextLink.getRoadNo()) {
            return;
        }

        // ── [Line 1472] S_HWJCTINFO 데이터 패킷 구성 ────────────────
        SHwJCTInfo sJCT = new SHwJCTInfo();

        // ── 시작 노드(updStNode) 기준 정보 ───────────────────────────

        // IC 번호 = updStNode의 TollID
        sJCT.m_sHwObject.m_lICNo = updStNode.getTollId();

        // ConNode(updNode)의 TollID → 두 번째 IC 번호
        sJCT.m_lICNo2 = updNode.getTollId();

        // MapID1: updStNode의 MapID 문자열 → long 변환
        // C++: _ttol(& updStNode.GetObjID().strMapID)
        // MapID는 "12340000" 같은 순수 숫자 문자열이므로 Long.parseLong() 사용
        sJCT.m_sHwObject.m_dwMapID1 = parseMapId(updStNode.getMapIdStr());

        // ObjID1: updStNode의 ObjectID
        sJCT.m_sHwObject.m_dwObjID1 = updStNode.getObjId();

        // 도로 관리 번호1: updPreLink의 RoadNo
        sJCT.m_sHwObject.m_lManageNosun = updPreLink.getRoadNo();

        // 방향 코드1: updPreLink의 고속도로 시설 방향
        sJCT.m_sHwObject.m_btDir = updPreLink.getHighwayFacilityInfo().getDirection();

        // ── 연결 노드(updNode) 기준 정보 ─────────────────────────────

        // MapID2: updNode의 MapID 문자열 → long 변환
        sJCT.m_dwMapID2 = parseMapId(updNode.getMapIdStr());

        // ObjID2: updNode의 ObjectID
        sJCT.m_dwObjID2 = updNode.getObjId();

        // 도로 관리 번호2: updNextLink의 RoadNo
        sJCT.m_dwManageNosun2 = updNextLink.getRoadNo();

        // 방향 코드2: updNextLink의 고속도로 시설 방향
        sJCT.m_btDir2 = updNextLink.getHighwayFacilityInfo().getDirection();

        // ── 현재 처리 시각 복사 (최대 30자, C++ memcpy 대응) ─────────
        char[] timeChars = m_strCurrentTime.toCharArray();
        int copyLen = Math.min(timeChars.length, 30);
        System.arraycopy(timeChars, 0, sJCT.m_sHwObject.m_strCurrentTime, 0, copyLen);

        // ── [Line 1488] 완성된 패킷을 JCT 정보 목록에 추가 ──────────
        m_vecJCTInfo.add(sJCT);
    }

    // =====================================================================
    // 유틸리티 메서드
    // =====================================================================

    /**
     * MapID 문자열 → long 변환
     *
     * MapID는 "12340000", "22220000" 처럼 순수 숫자 문자열만 사용.
     * 예외 없이 숫자로만 구성되므로 Long.parseLong() 으로 안전하게 변환.
     *
     * C++ 원본: _ttol(& node.GetObjID().strMapID)
     *
     * @param mapIdStr MapID 문자열 (예: "12340000")
     * @return long 변환된 MapID 값
     */
    private long parseMapId(String mapIdStr) {
        if (mapIdStr == null || mapIdStr.isEmpty()) return 0L;
        return Long.parseLong(mapIdStr); // 순수 숫자 보장 → parseLong 안전
    }

    // ── 하위 메서드 (구현 필요) ────────────────────────────────────────

    /** DC에서 객체 조회 */
    private Object findObj(int objType, UnionId id) {
        // TODO: 구현 필요
        return null;
    }
}

// =====================================================================
// 보조 상수 및 모델 (실제 구현체로 대체 필요)
// =====================================================================

interface LinkObjectType {
    int LINK_OBJECT = 2;
}

class CGeoNode {
    private long   objId;
    private String mapIdStr; // MapID 문자열 (예: "12340000")
    private long   tollId;
    private int    kind;
    private List<CGeoPassInfo> passInfoList = new ArrayList<>();

    public long   getObjId()    { return objId; }
    public String getMapIdStr() { return mapIdStr; }
    public long   getTollId()   { return tollId; }
    public int    getKind()     { return kind; }
    public List<CGeoPassInfo> getNodePassInfo() { return passInfoList; }

    public void copyFrom(CGeoNode src) {
        if (src == null) return;
        this.objId     = src.objId;
        this.mapIdStr  = src.mapIdStr;
        this.tollId    = src.tollId;
        this.kind      = src.kind;
    }
}

class CGeoLink {
    private long objId;
    private long stNodeId;
    private long edNodeId;
    private int  roadCategory;
    private long roadNo;        // 도로 번호 (RoadNo)
    private int  categoryBits;

    public long getObjId()        { return objId; }
    public long getStNodeId()     { return stNodeId; }
    public long getEdNodeId()     { return edNodeId; }
    public int  getRoadCategory() { return roadCategory; }
    public long getRoadNo()       { return roadNo; } // 도로 관리 번호

    public CGeoLinkCategory getLinkCategory() {
        return new CGeoLinkCategory(categoryBits);
    }

    public HighwayFacilityInfo getHighwayFacilityInfo() {
        return new HighwayFacilityInfo();
    }

    public void copyFrom(CGeoLink src) {
        if (src == null) return;
        this.objId        = src.objId;
        this.stNodeId     = src.stNodeId;
        this.edNodeId     = src.edNodeId;
        this.roadCategory = src.roadCategory;
        this.roadNo       = src.roadNo;
        this.categoryBits = src.categoryBits;
    }
}

class CGeoPassInfo {
    private long inLinkId;
    private long outLinkId;
    private int  tCode;

    public long getInLinkId()  { return inLinkId; }
    public long getOutLinkId() { return outLinkId; }
    public int  getTCode()     { return tCode; }
}

class CGeoLinkCategory {
    private int bits;
    public CGeoLinkCategory(int bits) { this.bits = bits; }
    public boolean isIC()   { return ((bits & 0x0008) >> 3) == 1; }
    public boolean isJC()   { return ((bits & 0x0002) >> 2) == 1; } 
    public boolean isSA()   { return ((bits & 0x0010) >> 4) == 1; } 
    public boolean isRoad() { return  (bits & 0x0001)        == 1; } 
}

class HighwayFacilityInfo {
    public byte getDirection() { return 0; }
}

class UnionId {
    public long dwObjectID;
}
