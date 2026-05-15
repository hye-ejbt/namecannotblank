/**
 * ============================================================
 *  통합분기(Y자/T자) 진출링크 유효성 검사 — checkData 재작성
 *
 *  원본(checkData) 의 흐름은 유지:
 *   ① 시작 노드가 도엽 경계(nodeKind === 7 || adjNodeId > 0) 면
 *     인접 노드 속성을 한 번 조회 → (pLink, tmpNode) 캐싱
 *   ② guidLineVoiceListRef.current 를 (inLinkId, pathId) 별 그룹핑
 *      ※ editType === 2 인 항목은 제외
 *   ③ 각 그룹마다:
 *       - selectNodeInfo / passInfoSet 초기화
 *       - 그룹 내 outLink 가 passInfoSet 에 하나도 없으면
 *         (pLink, tmpNode) fallback 적용
 *       - 진출링크열을 따라 walk 하며 outLinkSet 채움
 *       - 그룹 모두 채워지면 다음 그룹, 아니면 invalid → return false
 *
 *  변경 핵심:
 *   - 원본은 `outWhile + nested for` 로 한 번에 한 outLink 만
 *     매칭 → 다음 라운드 (선형 walk).
 *   - 본 버전은 BFS 로 "현재 노드 passInfoSet 에 매칭되는
 *     모든 outLink 를 한 라운드에서 처리" → Y자/T자 분기 자연 지원.
 *   - 사이클 방지: visitedNodeIds 로 같은 노드 큐 재진입 차단
 * ============================================================
 */

interface NodeInfo {
  id: number;
  mapId: number;
  adjNodeId: number;
  adjNodeMapId: number;
  nodeKind: number;
  passInfo: Set<number>;
}

interface LinkInfo {
  id: number;
  mapId: number;
  stNdId: number;
  edNdId: number;
}

interface AttrInfo {
  adjNodeAttr: NodeInfo | null;
  linkAttr: { linkId: number } | null;
}

interface PassInfo {
  inLinkId: number;
}

interface LaneNoAndColorCode {
  editType: number;
}

interface NodeGuideLineVoiceInsert {
  inLinkId: number;
  pathId: number;
  outLinkId: number;
  laneNoAndColorCode: LaneNoAndColorCode[];
}

interface NodeGuideLineService {
  getLinkInfo(linkId: number, mapId: number): Promise<LinkInfo | null>;
  getNodeInfo(nodeId: number, mapId: number): Promise<NodeInfo | null>;
  getAttribute(nodeId: number, mapId: number): Promise<AttrInfo>;
  getPassInfo(nodeId: number, mapId: number): Promise<PassInfo[]>;
}

/**
 * 통합분기 유효성 검사 — Promise<boolean>
 * 원본 checkData 와 동일한 시그니처/반환값을 유지.
 *
 * 호출 예시 (React 컴포넌트 내부):
 *   const checkData = (): Promise<boolean> =>
 *     checkCombinedBranchData(
 *       nodeInfo,
 *       guidLineVoiceListRef.current,
 *       useNodeGuideLineVoiceInsertSerivce,
 *       (key, fallback) => t({ key }) ?? fallback
 *     );
 */
const checkCombinedBranchData = async (
  nodeInfo: NodeInfo,
  guidLineVoiceList: NodeGuideLineVoiceInsert[],
  service: NodeGuideLineService,
  translate: (key: string, fallback: string) => string = (_, fb) => fb
): Promise<boolean> => {
  // ─── ① 시작 노드의 인접 노드 정보 캐싱 ───────────────────────
  let tmpNode: NodeInfo | null = null;
  let pLink: number = 0;

  // 인접 노드
  if (nodeInfo.adjNodeId > 0 || nodeInfo.nodeKind === 7) {
    const attribute: AttrInfo = await service.getAttribute(
      nodeInfo.adjNodeId,
      nodeInfo.adjNodeMapId
    );

    if (attribute.adjNodeAttr != null && attribute.linkAttr != null) {
      pLink = attribute.linkAttr.linkId;
      tmpNode = attribute.adjNodeAttr;
    }
  }

  // ─── ② inLinkId-pathId 그룹화 ────────────────────────────────
  const groupGuideLineVoiceMap: Map<string, NodeGuideLineVoiceInsert[]> =
    guidLineVoiceList
      .filter((data: NodeGuideLineVoiceInsert) =>
        data.laneNoAndColorCode.some((item: LaneNoAndColorCode) => item.editType !== 2)
      )
      .reduce(
        (map: Map<string, NodeGuideLineVoiceInsert[]>, item: NodeGuideLineVoiceInsert) => {
          // 키 생성
          const key: string = `${item.inLinkId}-${item.pathId}`;
          if (!map.has(key)) {
            map.set(key, []);
          }
          map.get(key)!.push(item);
          return map;
        },
        new Map<string, NodeGuideLineVoiceInsert[]>()
      );

  // ─── ③ 그룹별 유효성 검사 ────────────────────────────────────
  for (const [, voiceList] of groupGuideLineVoiceMap) {
    // 선택된 노드 정보
    let selectNodeInfo: NodeInfo = nodeInfo;
    let passInfoSet: Set<number> = nodeInfo.passInfo;

    // 그룹 내 outLink 가 passInfoSet 에 없으면 인접 노드 fallback
    if (passInfoSet.size > 0) {
      const hasCommonId: boolean = voiceList.some(
        (data: NodeGuideLineVoiceInsert) => passInfoSet.has(data.outLinkId)
      );

      if (!hasCommonId && pLink && tmpNode) {
        passInfoSet = new Set([pLink]);
        selectNodeInfo = tmpNode;
      }
    }

    // ─── BFS 로 진출링크열을 트리 탐색 (분기 지원) ─────────────
    const outLinkSet: Set<number> = new Set<number>();
    const visitedNodeIds: Set<number> = new Set<number>([selectNodeInfo.id]);
    const queue: { passInfo: Set<number>; node: NodeInfo }[] = [
      { passInfo: passInfoSet, node: selectNodeInfo },
    ];

    bfs: while (queue.length > 0) {
      const { passInfo: currentPassInfo, node: currentNode } = queue.shift()!;

      // 현재 노드 passInfoSet 과 매칭되는 모든 outLink — 분기점이면 2개 이상
      const matchedVoiceData: NodeGuideLineVoiceInsert[] = voiceList.filter(
        (data: NodeGuideLineVoiceInsert) =>
          currentPassInfo.has(data.outLinkId) && !outLinkSet.has(data.outLinkId)
      );

      if (matchedVoiceData.length === 0) {
        continue; // 다음 큐 항목으로
      }

      // 분기된 각 outLink 를 모두 처리
      for (const voiceData of matchedVoiceData) {
        // 진출 링크 데이터 세팅
        outLinkSet.add(voiceData.outLinkId);

        // 링크 조회
        const outLinkInfo: LinkInfo | null = await service.getLinkInfo(
          voiceData.outLinkId,
          currentNode.mapId
        );
        if (!outLinkInfo) {
          // 한 갈래 실패해도 다른 갈래는 계속 (원본은 break outWhile 였음)
          continue;
        }

        // 반대편 노드 ID
        const tmpNodeId: number =
          outLinkInfo.stNdId === currentNode.id ? outLinkInfo.edNdId : outLinkInfo.stNdId;

        // 노드 조회
        const adjNodeInfo: NodeInfo | null = await service.getNodeInfo(
          tmpNodeId,
          currentNode.mapId
        );
        if (!adjNodeInfo) {
          continue;
        }

        // 다음 라운드 상태 결정
        let nextPassInfo: Set<number>;
        let nextNode: NodeInfo;

        // 인접 노드 (도엽 경계)
        if (adjNodeInfo.adjNodeId > 0 || adjNodeInfo.nodeKind === 7) {
          const attribute: AttrInfo = await service.getAttribute(
            tmpNodeId,
            adjNodeInfo.adjNodeMapId
          );

          if (attribute.adjNodeAttr != null && attribute.linkAttr != null) {
            nextPassInfo = new Set([attribute.linkAttr.linkId]);
            nextNode = attribute.adjNodeAttr;
          } else {
            continue; // 한 갈래만 실패 처리
          }
        } else {
          // 일반 노드 — 다음 통과 정보 조회
          const adjNodePassInfos: PassInfo[] = await service.getPassInfo(
            adjNodeInfo.id,
            adjNodeInfo.mapId
          );

          nextPassInfo = new Set(
            adjNodePassInfos
              .map((adjNodePassInfo: PassInfo) => adjNodePassInfo.inLinkId)
              .sort((a: number, b: number) => a - b)
          );
          nextNode = adjNodeInfo;
        }

        // 사이클 방지 — 이미 큐에 들어간 노드는 재진입 안 함
        if (!visitedNodeIds.has(nextNode.id)) {
          visitedNodeIds.add(nextNode.id);
          queue.push({ passInfo: nextPassInfo, node: nextNode });
        }

        // 그룹 전체 진출링크 확인 완료
        if (outLinkSet.size === voiceList.length) {
          break bfs;
        }
      }
    }

    // ─── 유도선 정보 음성 안내 데이터에 추가되었는지 확인 ──────
    const invalidLinks: NodeGuideLineVoiceInsert[] = voiceList.filter(
      (data: NodeGuideLineVoiceInsert) => !outLinkSet.has(data.outLinkId)
    );

    if (invalidLinks.length > 0) {
      message.destroy();
      message.info(
        translate(
          'NodeGuideLineVoiceInsertModal.msg.hasInvalidLink2',
          '유효하지 않은 진출 링크가 있습니다.\n진입링크에 설정된 Path ID와 진출 링크를 확인 하세요.'
        )
      );
      return false;
    }
  }

  return true;
};

/* ============================================================
 * 컴포넌트 내부 사용 예시 (drop-in replacement)
 * ============================================================
 *
 * // 유효하지 않은 진출링크 확인
 * const checkData = async (): Promise<boolean> => {
 *   return checkCombinedBranchData(
 *     nodeInfo,
 *     guidLineVoiceListRef.current,
 *     useNodeGuideLineVoiceInsertSerivce,
 *     (key, fallback) => t({ key }) ?? fallback
 *   );
 * };
 *
 * ============================================================
 * 분기 동작 설명 (지도 우측 하단 케이스)
 * ============================================================
 *
 *   진입링크 ──▶  [노드 A]
 *                   │
 *                   ├──▶ outLink#1 ──▶ [노드 B] ──▶ outLink#2 ...
 *                   │
 *                   └──▶ outLink#3 ──▶ [노드 C] ──▶ outLink#4 ...
 *
 *   원본 checkData : passInfoSet 매칭에서 outLink#1 처리 후
 *                    selectNodeInfo 가 [노드 B] 로 바뀌어
 *                    outLink#3 매칭이 영원히 안 됨 → invalid
 *
 *   본 버전(BFS) : [노드 A] 라운드에서 outLink#1, outLink#3 모두 매칭
 *                   → 큐에 (B의 passInfo, B), (C의 passInfo, C) 둘 다 push
 *                   → 각 갈래를 독립적으로 끝까지 추적 → valid
 * ============================================================
 */
