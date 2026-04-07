// 링크 데이터 구조 (업로드된 이미지 기반)
interface LinkData {
  id: number;
  mapId: number;
  stNdId: string;        // 시점 노드 ID
  edNdId: string;        // 종점 노드 ID
  oneway: number;        // 일방통행 여부
  linkXyBes?: string;    // LINESTRING geometry
  linkXyGrs?: string;
  laneNum: number;
  roadKind: number;
  // ... 기타 필드
  [key: string]: any;
}

// 렌더 정보 구조 (CGeoRender 기반)
interface LaneNoColorCode {
  laneNo: number;
  colorCode: number;
}

interface RenderData {
  inLinkId: number;
  outLinkId: number;
  arrowCode: string;
  patternCode: string;
  type: number;
  laneNoAndColorCodes: LaneNoColorCode[];
}

// 연결성 체크 결과
interface ConnectivityResult {
  isConnected: boolean;
  errorMessage: string;
  failedAt?: {
    index: number;
    fromLinkId: number;
    toLinkId: number;
    reason: 'topology' | 'render' | 'null' | 'map_mismatch';
  };
}

// 상수
const COMMON_RENDER_TYPE_ILS_MIX = 1; // 실제 값으로 대체 필요


/**
 * 두 링크가 노드를 통해 물리적으로 연결되어 있는지 확인
 * @returns true이면 fromLink -> toLink 방향으로 연결 가능
 */
function isLinkTopologyConnected(
  fromLink: LinkData | null,
  toLink: LinkData | null
): boolean {
  if (!fromLink || !toLink) {
    return false;
  }

  // 같은 맵에 속하는지 확인
  if (fromLink.mapId !== toLink.mapId) {
    return false;
  }

  // fromLink의 종점 노드 == toLink의 시점 노드
  if (fromLink.edNdId === toLink.stNdId) {
    return true;
  }

  return false;
}

/**
 * 렌더 목록에서 특정 입력/출력 링크 쌍에 해당하는 렌더 정보 찾기
 * (C++의 GetRenderFrom에 대응)
 */
function getRenderFrom(
  renders: RenderData[],
  inLinkId: number,
  outLinkId: number
): RenderData | null {
  const found = renders.find(
    (r) =>
      r.inLinkId === inLinkId &&
      r.outLinkId === outLinkId &&
      r.type === COMMON_RENDER_TYPE_ILS_MIX
  );
  return found ?? null;
}

/**
 * 두 링크 사이에 렌더 정보가 존재하는지 확인
 */
function hasRenderBetween(
  renders: RenderData[],
  inLinkId: number,
  outLinkId: number
): boolean {
  return getRenderFrom(renders, inLinkId, outLinkId) !== null;
}

interface CheckChainOptions {
  checkRender?: boolean;      // 렌더 정보까지 검사할지 여부
  renders?: RenderData[];     // checkRender가 true일 때 필요
}

/**
 * 링크 체인의 연결성을 검사
 * @param links 순서대로 이어져야 하는 링크들
 * @param options 검사 옵션
 */
function checkLinkChainConnectivity(
  links: (LinkData | null)[],
  options: CheckChainOptions = {}
): ConnectivityResult {
  const { checkRender = false, renders = [] } = options;

  // 링크가 2개 미만이면 연결성 체크 의미 없음
  if (links.length < 2) {
    return {
      isConnected: false,
      errorMessage: '링크가 2개 이상 필요합니다.',
    };
  }

  // NULL 체크
  for (let i = 0; i < links.length; i++) {
    if (!links[i]) {
      return {
        isConnected: false,
        errorMessage: `인덱스 ${i}의 링크가 null입니다.`,
        failedAt: {
          index: i,
          fromLinkId: -1,
          toLinkId: -1,
          reason: 'null',
        },
      };
    }
  }

  // checkRender가 true인데 renders가 비어있으면 경고
  if (checkRender && renders.length === 0) {
    return {
      isConnected: false,
      errorMessage: '렌더 검사가 요청되었지만 렌더 데이터가 제공되지 않았습니다.',
    };
  }

  // 연속된 링크 쌍에 대해 체크
  for (let i = 0; i < links.length - 1; i++) {
    const from = links[i]!;
    const to = links[i + 1]!;

    // 1단계: 맵 ID 일치 확인
    if (from.mapId !== to.mapId) {
      return {
        isConnected: false,
        errorMessage:
          `링크 ${from.id}와 링크 ${to.id}가 다른 맵에 속합니다. ` +
          `(mapId: ${from.mapId} vs ${to.mapId})`,
        failedAt: {
          index: i,
          fromLinkId: from.id,
          toLinkId: to.id,
          reason: 'map_mismatch',
        },
      };
    }

    // 2단계: 토폴로지 연결 확인
    if (!isLinkTopologyConnected(from, to)) {
      return {
        isConnected: false,
        errorMessage:
          `링크 ${from.id}와 링크 ${to.id}가 물리적으로 연결되어 있지 않습니다. ` +
          `(${from.id}.edNdId="${from.edNdId}", ${to.id}.stNdId="${to.stNdId}")`,
        failedAt: {
          index: i,
          fromLinkId: from.id,
          toLinkId: to.id,
          reason: 'topology',
        },
      };
    }

    // 3단계: 렌더 정보 확인 (옵션)
    if (checkRender) {
      if (!hasRenderBetween(renders, from.id, to.id)) {
        return {
          isConnected: false,
          errorMessage:
            `링크 ${from.id} -> 링크 ${to.id} 사이에 렌더 정보가 없습니다.`,
          failedAt: {
            index: i,
            fromLinkId: from.id,
            toLinkId: to.id,
            reason: 'render',
          },
        };
      }
    }
  }

  return {
    isConnected: true,
    errorMessage: '',
  };
}
