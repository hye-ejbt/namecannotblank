function alignTargetsToFirstEdge(targetList: any[]) {
  if (!targetList || targetList.length < 2) return;

  // 🔹 첫 번째 객체 대상면
  const firstEdge = targetList[0].lineFeature
    ?.getGeometry()
    ?.getCoordinates() as [Coordinate, Coordinate];

  if (!firstEdge) return;

  const anchorPoint = firstEdge[0]; // 기준점
  const firstVector = [
    firstEdge[1][0] - firstEdge[0][0],
    firstEdge[1][1] - firstEdge[0][1]
  ];
  
  // 첫 번째 대상면의 방향 벡터 정규화
  const length = Math.sqrt(firstVector[0] ** 2 + firstVector[1] ** 2);
  const unitVector = [firstVector[0] / length, firstVector[1] / length];
  
  // 수직 벡터 (법선 벡터)
  const normalVector = [-unitVector[1], unitVector[0]];

  for (let i = 1; i < targetList.length; i++) {
    const obj = targetList[i];

    const edge = obj.lineFeature
      ?.getGeometry()
      ?.getCoordinates() as [Coordinate, Coordinate];

    if (!edge) continue;

    const currentPoint = edge[0];

    // 🔥 anchorPoint에서 currentPoint로의 벡터
    const diff = [
      currentPoint[0] - anchorPoint[0],
      currentPoint[1] - anchorPoint[1]
    ];

    // 🔥 첫 번째 대상면의 방향으로의 투영 (평행 성분)
    const parallelDist = diff[0] * unitVector[0] + diff[1] * unitVector[1];
    
    // 🔥 첫 번째 대상면에 수직인 방향으로의 투영 (수직 성분)
    const perpendicularDist = diff[0] * normalVector[0] + diff[1] * normalVector[1];

    // 🔥 수직 거리만큼 이동 (같은 직선 위로)
    const dx = -perpendicularDist * normalVector[0];
    const dy = -perpendicularDist * normalVector[1];

    obj.feature.getGeometry().translate(dx, dy);
    obj.lineFeature.getGeometry().translate(dx, dy);
  }
}
