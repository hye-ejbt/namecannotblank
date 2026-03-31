import * as turf from '@turf/turf';
import { transform } from 'ol/proj';
import { rootStore } from '@/stores/rootStore';
import { message } from 'antd';
import i18next from 'i18next';

function multiToSingle(feature: any): any[] {
  if (!feature || !feature.geometry) return [];
  if (feature.geometry.type === 'Polygon') return [feature];
  if (feature.geometry.type === 'MultiPolygon') {
    return feature.geometry.coordinates.map((coords: any) =>
      turf.polygon(coords)
    );
  }
  return [];
}

function preparePolygon(coords: any[][], eps: number): any {
  const poly = turf.truncate(turf.polygon(coords), {
    precision: 6,
    coordinates: 2,
  });
  return turf.buffer(poly, -eps, { units: 'meters' });
}

function cleanPiece(piece: any, eps: number): any | null {
  try {
    const poly = turf.polygon(piece.geometry.coordinates);
    const buffered = turf.buffer(poly, -eps, { units: 'meters' });
    if (!buffered) return null;
    const clean = turf.simplify(buffered, {
      tolerance: 0.000001,
      highQuality: true,
    });
    return clean && turf.area(clean) > 0.01 ? clean : null;
  } catch {
    return null;
  }
}

export const progressPolygonDivision = (
  targetPolygon: Place,
  polygonList: Place[]
) => {
  const { polygonModalStore: store } = rootStore;
  const eps = 0.05;

  // ── 좌표 변환 (EPSG:3857 → EPSG:4326) ──
  const targetCoord = (targetPolygon.getCoordinates() as any[][]).map(
    (ring: any[]) =>
      ring.map((coord: any) => transform(coord, 'EPSG:3857', 'EPSG:4326'))
  );

  const polygonCoords = polygonList.map((polygon) =>
    (polygon.getCoordinates() as any[][]).map((ring: any[]) =>
      ring.map((coord: any) => transform(coord, 'EPSG:3857', 'EPSG:4326'))
    )
  );

  const pgKind = targetPolygon.getFields().pgKind;

  let base: any = preparePolygon(targetCoord, eps);
  if (!base) {
    return message.error(
      i18next.t('PolygonDivision.failed') ?? '폴리곤 분리 연산에 실패했습니다.'
    );
  }

  // ══════════════════════════════════════════════
  //  1단계: 첫 번째 커터로 분할 (관통 적용)
  // ══════════════════════════════════════════════
  const firstCutter = preparePolygon(polygonCoords[0], eps);
  if (!firstCutter) {
    return message.error(
      i18next.t('PolygonDivision.failed') ?? '폴리곤 분리 연산에 실패했습니다.'
    );
  }

  const beforeCount = multiToSingle(base).length;
  const diff = turf.difference(base, firstCutter);

  if (!diff) {
    return message.error(
      i18next.t('PolygonDivision.failed') ?? '폴리곤 분리 연산에 실패했습니다.'
    );
  }

  const afterCount = multiToSingle(diff).length;
  const isCrossing = afterCount > beforeCount;

  let pieces: any[] = []; // 1단계에서 확정된 앞쪽 조각들
  let lastPiece: any;     // 2단계로 넘길 마지막 조각

  if (isCrossing) {
    // 관통: diff 조각들 + intersect 조각
    const inter = turf.intersect(base, firstCutter);
    const diffPieces = multiToSingle(diff);
    const interPieces = inter ? multiToSingle(inter) : [];

    // diff 조각들 = 확정 (마지막 제외), intersect 조각 = 마지막 조각
    // 모든 조각을 합쳐서 마지막 하나를 lastPiece로
    const allFirstStep = [...diffPieces, ...interPieces];
    pieces = allFirstStep.slice(0, -1);
    lastPiece = allFirstStep[allFirstStep.length - 1];

    console.log(
      `[Division] 1단계: 관통 → diff ${diffPieces.length}개 + inter ${interPieces.length}개, 마지막 조각을 2단계로`
    );
  } else {
    // 비관통: diff만 사용
    lastPiece = diff;
    console.log('[Division] 1단계: 비관통 → diff를 그대로 2단계로');
  }

  // ══════════════════════════════════════════════
  //  2단계: 마지막 조각을 나머지 커터들로 difference
  // ══════════════════════════════════════════════
  for (let i = 1; i < polygonCoords.length; i++) {
    if (!lastPiece) break;

    const cutter = preparePolygon(polygonCoords[i], eps);
    if (!cutter) continue;

    try {
      const d = turf.difference(lastPiece, cutter);
      if (!d) {
        lastPiece = null;
        break;
      }
      console.log(
        `[Division] 2단계 커터 ${i + 1}: ${lastPiece.geometry.type} → ${d.geometry.type}`
      );
      lastPiece = d;
    } catch (e) {
      console.error(`[Division] 2단계 커터 ${i + 1}: 에러`, e);
    }
  }

  // ══════════════════════════════════════════════
  //  결과 조립: 1단계 확정 조각들 + 2단계 결과 조각들
  // ══════════════════════════════════════════════
  const allPieces = [
    ...pieces,
    ...multiToSingle(lastPiece),
  ];

  console.log(`[Division] 최종 조각 수: ${allPieces.length}`);

  if (allPieces.length < 1) {
    return message.error(
      i18next.t('PolygonDivision.failed') ?? '폴리곤 분리 연산에 실패했습니다.'
    );
  }

  // ── 조각 정리 ──
  const cleanedCoords: any[] = [];
  for (const piece of allPieces) {
    const clean = cleanPiece(piece, eps);
    if (clean) {
      cleanedCoords.push(clean.geometry.coordinates);
    }
  }

  if (cleanedCoords.length >= 1) {
    const final =
      cleanedCoords.length === 1
        ? turf.polygon(cleanedCoords[0])
        : turf.multiPolygon(cleanedCoords);

    setPlaces(final, targetPolygon, pgKind);
    store.setIsDivisionModal(false);
  } else {
    return message.error(
      i18next.t('PolygonDivision.failed') ?? '폴리곤 분리 연산에 실패했습니다.'
    );
  }
};
