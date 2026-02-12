import Polygon from 'ol/geom/Polygon';

function orthogonalizeKeepSize(polygon) {
  const coords = polygon.getCoordinates()[0];

  if (coords.length !== 5) {
    console.warn("사각형이 아닙니다.");
    return polygon;
  }

  const p0 = coords[0];
  const p1 = coords[1];
  const p2 = coords[2];

  // 1️⃣ 첫번째 변 벡터 (기준 축)
  const v1 = [
    p1[0] - p0[0],
    p1[1] - p0[1]
  ];

  const length1 = Math.hypot(v1[0], v1[1]);

  const unitV1 = [
    v1[0] / length1,
    v1[1] / length1
  ];

  // 2️⃣ 두번째 변 길이 유지
  const v2 = [
    p2[0] - p1[0],
    p2[1] - p1[1]
  ];

  const length2 = Math.hypot(v2[0], v2[1]);

  // 3️⃣ v1에 직교하는 벡터 생성
  const perp = [
    -unitV1[1],
     unitV1[0]
  ];

  // 방향 유지 (기존 v2 방향과 같은 쪽인지 체크)
  const dot = perp[0] * v2[0] + perp[1] * v2[1];
  const direction = dot >= 0 ? 1 : -1;

  const newV2 = [
    perp[0] * length2 * direction,
    perp[1] * length2 * direction
  ];

  // 4️⃣ 새로운 좌표 구성
  const newP0 = p0;
  const newP1 = [
    p0[0] + v1[0],
    p0[1] + v1[1]
  ];
  const newP2 = [
    newP1[0] + newV2[0],
    newP1[1] + newV2[1]
  ];
  const newP3 = [
    p0[0] + newV2[0],
    p0[1] + newV2[1]
  ];

  return new Polygon([[
    newP0,
    newP1,
    newP2,
    newP3,
    newP0
  ]]);
}
