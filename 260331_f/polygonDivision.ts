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

  // ══════════════════════════════════════════════════════════
  //  반복 분할: 각 커터마다 관통 판별 후 마지막 조각을 다음으로
  // ══════════════════════════════════════════════════════════
  //
  //  관통 시:
  //    diff  → [A, B]     inter → [C]
  //    확정: [C(inter), A(diff 앞쪽)]
  //    다음 커터로: B(diff 마지막)
  //
  //  비관통 시:
  //    diff → 깎인 결과
  //    확정 없음, 다음 커터로: diff 결과 그대로
  //
  const confirmedPieces: any[] = [];
  let current: any = base;

  for (let i = 0; i < polygonCoords.length; i++) {
    if (!current) break;

    const cutter = preparePolygon(polygonCoords[i], eps);
    if (!cutter) continue;

    try {
      const beforeCount = countPieces(current);
      const diff = turf.difference(current, cutter);

      if (!diff) {
        console.warn(`[Division] 커터 ${i + 1}: 대상을 완전히 덮음`);
        current = null;
        break;
      }

      const afterCount = countPieces(diff);

      if (afterCount > beforeCount) {
        // ── 관통: intersect 수집 + diff 마지막 조각만 다음으로 ──
        const inter = turf.intersect(current, cutter);
        const interPieces = inter ? multiToSingle(inter) : [];
        const diffPieces = multiToSingle(diff);

        // inter 조각들 → 확정
        confirmedPieces.push(...interPieces);
        // diff 앞쪽 조각들 → 확정
        confirmedPieces.push(...diffPieces.slice(0, -1));
        // diff 마지막 조각 → 다음 커터로 전달
        current = diffPieces[diffPieces.length - 1];

        console.log(
          `[Division] 커터 ${i + 1}: 관통 → inter ${interPieces.length}개 + diff ${diffPieces.length}개 확정, 마지막 조각 계속`
        );
      } else {
        // ── 비관통: 깎임만, 다음으로 ──
        current = diff;
        console.log(`[Division] 커터 ${i + 1}: 비관통 (깎임만)`);
      }
    } catch (e) {
      console.error(`[Division] 커터 ${i + 1}: 에러`, e);
    }
  }

  // ── 마지막 current도 결과에 포함 ──
  if (current) {
    confirmedPieces.push(...multiToSingle(current));
  }

  console.log(`[Division] 최종 조각 수: ${confirmedPieces.length}`);

  if (confirmedPieces.length < 1) {
    return message.error(
      i18next.t('PolygonDivision.failed') ?? '폴리곤 분리 연산에 실패했습니다.'
    );
  }

  // ── 조각 정리 ──
  const cleanedCoords: any[] = [];
  for (const piece of confirmedPieces) {
    const clean = cleanPiece(piece, eps);
    if (clean) {
      cleanedCoords.push(clean.geometry.coordinates);
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
