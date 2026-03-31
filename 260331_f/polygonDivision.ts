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

function countPieces(feature: any): number {
  if (!feature) return 0;
  return multiToSingle(feature).length;
}

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

  // ── 3. 순차 분할 ──
  const collectedPieces: any[] = []; // 관통 시 수집된 intersect 조각들

  for (let i = 0; i < polygonCoords.length; i++) {
    if (!base) break;

    const cutter = turf.truncate(turf.polygon(polygonCoords[i]), {
      precision: 6,
      coordinates: 2,
    });
    const pBuf = turf.buffer(cutter, -eps, { units: 'meters' });
    if (!pBuf) continue;

    try {
      const beforeCount = countPieces(base);
      const diff = turf.difference(base, pBuf);

      if (!diff) {
        // 커터가 대상을 완전히 덮음
        base = null;
        break;
      }

      const afterCount = countPieces(diff);

      // 관통 판별: 조각 수가 늘어났으면 커터가 관통한 것
      if (afterCount > beforeCount) {
        const inter = turf.intersect(base, pBuf);
        if (inter) {
          // intersect 결과를 개별 조각으로 수집
          multiToSingle(inter).forEach((p: any) => collectedPieces.push(p));
          console.log(
            `[Division] 커터 ${i + 1}: 관통 → ${beforeCount}조각 → ${afterCount}조각, intersect ${multiToSingle(inter).length}개 수집`
          );
        }
      } else {
        console.log(
          `[Division] 커터 ${i + 1}: 비관통 (깎임만), ${afterCount}조각 유지`
        );
      }

      base = diff;
    } catch (e) {
      console.error(`[Division] 커터 ${i + 1}: 에러`, e);
    }
  }

  // ── 4. 최종 조각 조립: difference 결과 + 수집된 intersect 조각 ──
  const allPieces: any[] = [
    ...multiToSingle(base),   // diff로 남은 조각들
    ...collectedPieces,        // 관통 시 수집된 교차 조각들
  ];

  console.log(
    `[Division] 최종: diff ${countPieces(base)}개 + intersect ${collectedPieces.length}개 = ${allPieces.length}개`
  );

  if (allPieces.length < 1) {
    return message.error(
      i18next.t('PolygonDivision.failed') ?? '폴리곤 분리 연산에 실패했습니다.'
    );
  }

  // ── 5. 각 조각 정리 ──
  const cleanedCoords: any[] = [];

  for (const piece of allPieces) {
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
