import Polygon from 'ol/geom/Polygon';
import { getCenter } from 'ol/extent';

function orthogonalizeStable(polygon) {
  const coords = polygon.getCoordinates()[0];

  if (coords.length !== 5) return polygon;

  // 1️⃣ 중심 구하기
  const center = getCenter(polygon.getExtent());
  const cx = center[0];
  const cy = center[1];

  // 2️⃣ 로컬 좌표로 변환 (큰 숫자 제거)
  const local = coords.slice(0,4).map(p => [
    p[0] - cx,
    p[1] - cy
  ]);

  const p0 = local[0];
  const p1 = local[1];
  const p2 = local[2];

  // 3️⃣ 첫 변 벡터
  const v1 = [
    p1[0] - p0[0],
    p1[1] - p0[1]
  ];

  const len1 = Math.hypot(v1[0], v1[1]);
  const unitV1 = [v1[0]/len1, v1[1]/len1];

  // 4️⃣ 두 번째 변 길이 유지
  const v2 = [
    p2[0] - p1[0],
    p2[1] - p1[1]
  ];
  const len2 = Math.hypot(v2[0], v2[1]);

  // 5️⃣ 직교 벡터
  const perp = [-unitV1[1], unitV1[0]];

  const dot = perp[0]*v2[0] + perp[1]*v2[1];
  const dir = dot >= 0 ? 1 : -1;

  const newV2 = [
    perp[0] * len2 * dir,
    perp[1] * len2 * dir
  ];

  // 6️⃣ 새 좌표 생성 (로컬)
  const newLocal = [
    p0,
    [p0[0] + v1[0], p0[1] + v1[1]],
    [p0[0] + v1[0] + newV2[0], p0[1] + v1[1] + newV2[1]],
    [p0[0] + newV2[0], p0[1] + newV2[1]]
  ];

  // 7️⃣ 다시 글로벌 좌표 복원
  const finalCoords = newLocal.map(p => [
    p[0] + cx,
    p[1] + cy
  ]);

  finalCoords.push(finalCoords[0]);

  return new Polygon([finalCoords]);
}
