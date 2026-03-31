import * as turf from '@turf/turf';
import { transform } from 'ol/proj';
import { rootStore } from '@/stores/rootStore';
import { message } from 'antd';
import i18next from 'i18next';

/**
 * MultiPolygon → 개별 Polygon Feature 배열로 분리
 */
function multiToSingle(feature: any): any[] {
  if (!feature || !feature.geometry) return [];
  if (feature.geometry.type === 'Polygon') {
    return [feature];
  }
  if (feature.geometry.type === 'MultiPolygon') {
    return feature.geometry.coordinates.map((coords: any) =>
      turf.polygon(coords)
    );
  }
  return [];
}

/**
 * 다중 폴리곤 분할
 *
 * 원리: 대상 폴리곤에서 커터 폴리곤들을 순차적으로 difference
 *  - 커터가 대상을 관통하면 → MultiPolygon (조각 분리)
 *  - 커터가 대상 가장자리만 겹치면 → Polygon (깎임만)
 *  - 커터가 대상을 완전히 덮으면 → null (남은 영역 없음)
 */
export const progressPolygonDivision = (
  targetPolygon: Place,
  polygonList: Place[]
) => {
  const { polygonModalStore: store } = rootStore;
  const eps = 0.05;

  // ── 1. 좌표 변환 (EPSG:3857 → EPSG:4326) ──
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

  // ── 2. 대상 폴리곤 준비 ──
  let base: any = turf.truncate(turf.polygon(targetCoord), {
    precision: 6,
    coordinates: 2,
  });
  base = turf.buffer(base, -eps, { units: 'meters' });

  if (!base) {
    return message.error(
      i18next.t('PolygonDivision.failed') ?? '폴리곤 분리 연산에 실패했습니다.'
    );
  }

  console.log('[Division] 대상 폴리곤 면적:', turf.area(base).toFixed(2), 'm²');

  // ── 3. 커터 폴리곤들을 순차적으로 difference ──
  for (let i = 0; i < polygonCoords.length; i++) {
    if (!base) break;

    const cutter = turf.truncate(turf.polygon(polygonCoords[i]), {
      precision: 6,
      coordinates: 2,
    });
    const pBuf = turf.buffer(cutter, -eps, { units: 'meters' });

    if (!pBuf) {
      console.warn(`[Division] 커터 ${i + 1}: buffer 실패, 건너뜀`);
      continue;
    }

    try {
      const diff = turf.difference(base, pBuf);

      if (!diff) {
        console.warn(`[Division] 커터 ${i + 1}: 대상을 완전히 덮음 → 남은 영역 없음`);
        base = null;
        break;
      }

      console.log(
        `[Division] 커터 ${i + 1}: ${base.geometry.type} → ${diff.geometry.type}`,
        diff.geometry.type === 'MultiPolygon'
          ? `(${diff.geometry.coordinates.length}개 조각)`
          : '(1개)'
      );

      base = diff;
    } catch (e) {
      console.error(`[Division] 커터 ${i + 1}: difference 에러`, e);
      continue;
    }
  }

  // ── 4. 결과 처리 ──
  if (!base) {
    return message.error(
      i18next.t('PolygonDivision.failed') ?? '폴리곤 분리 연산에 실패했습니다.'
    );
  }

  // 개별 조각으로 분리
  const singles = multiToSingle(base);
  console.log(`[Division] 최종 조각 수: ${singles.length}`);

  // 각 조각 정리 (simplify + buffer)
  const cleanedCoords: any[] = [];

  for (const piece of singles) {
    try {
      const poly = turf.polygon(piece.geometry.coordinates);
      const buffered = turf.buffer(poly, -eps, { units: 'meters' });
      if (!buffered) continue;

      const clean = turf.simplify(buffered, {
        tolerance: 0.000001,
        highQuality: true,
      });

      if (clean && turf.area(clean) > 0.01) {
        cleanedCoords.push(clean.geometry.coordinates);
      }
    } catch (e) {
      console.warn('[Division] 조각 정리 실패:', e);
    }
  }

  console.log(`[Division] 정리 후 조각 수: ${cleanedCoords.length}`);

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
