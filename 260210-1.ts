export class PgPLLinearRotateStore {
  root: IRootStore;
  mode: boolean = false;
  sObj: RotateObjectType | undefined; // 기준 객체
  tObjList: RotateObjectType[] = []; // 대상 객체

  constructor(root: any) {
    this.root = root;
  }

  /**
   * 두 점으로 이루어진 선분의 각도 계산 (라디안)
   */
  private getLineAngle(p1: [number, number], p2: [number, number]): number {
    return Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
  }

  /**
   * 기준 선분의 각도 가져오기
   */
  private getBaseLineAngle(): number | null {
    if (!this.sObj || !this.sObj.lineFeature) return null;

    const coords = this.sObj.lineFeature.getGeometry()?.getCoordinates();
    if (!coords || coords.length < 2) return null;

    const indices = this.sObj.featureLinePointIndex;
    if (indices.length < 2) return null;

    const p1 = coords[indices[0]];
    const p2 = coords[indices[1]];

    return this.getLineAngle(p1, p2);
  }

  /**
   * 대상 선분의 각도 가져오기
   */
  private getTargetLineAngle(targetObj: RotateObjectType): number | null {
    if (!targetObj.lineFeature) return null;

    const coords = targetObj.lineFeature.getGeometry()?.getCoordinates();
    if (!coords || coords.length < 2) return null;

    const indices = targetObj.featureLinePointIndex;
    if (indices.length < 2) return null;

    const p1 = coords[indices[0]];
    const p2 = coords[indices[1]];

    return this.getLineAngle(p1, p2);
  }

  /**
   * 점을 중심점 기준으로 회전
   */
  private rotatePoint(
    point: [number, number],
    center: [number, number],
    angle: number
  ): [number, number] {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    // 중심점으로 이동
    const translatedX = point[0] - center[0];
    const translatedY = point[1] - center[1];

    // 회전
    const rotatedX = translatedX * cos - translatedY * sin;
    const rotatedY = translatedX * sin + translatedY * cos;

    // 원래 위치로 복귀
    return [rotatedX + center[0], rotatedY + center[1]];
  }

  /**
   * 폴리곤의 중심점 계산
   */
  private getPolygonCenter(coords: number[][]): [number, number] {
    let sumX = 0;
    let sumY = 0;
    const len = coords.length;

    for (let i = 0; i < len; i++) {
      sumX += coords[i][0];
      sumY += coords[i][1];
    }

    return [sumX / len, sumY / len];
  }

  /**
   * 대상 폴리곤을 기준 폴리곤과 평행하게 회전
   */
  rotateTargetToParallel(targetObj: RotateObjectType): boolean {
    // 기준 선분의 각도
    const baseAngle = this.getBaseLineAngle();
    if (baseAngle === null) {
      message.error("기준 선분을 찾을 수 없습니다.");
      return false;
    }

    // 대상 선분의 각도
    const targetAngle = this.getTargetLineAngle(targetObj);
    if (targetAngle === null) {
      message.error("대상 선분을 찾을 수 없습니다.");
      return false;
    }

    // 회전해야 할 각도 계산
    const rotationAngle = baseAngle - targetAngle;

    // 대상 feature의 모든 좌표를 회전
    if (targetObj.feature) {
      const geometry = targetObj.feature.getGeometry();
      if (!geometry) return false;

      const coords = geometry.getCoordinates();
      
      // Polyline인 경우
      if (geometry.getType() === 'LineString') {
        const center = this.getPolygonCenter(coords);
        const rotatedCoords = coords.map((coord: number[]) => 
          this.rotatePoint([coord[0], coord[1]], center, rotationAngle)
        );
        geometry.setCoordinates(rotatedCoords);
      }
      // Polygon인 경우
      else if (geometry.getType() === 'Polygon') {
        const center = this.getPolygonCenter(coords[0]); // 외부 링 기준
        const rotatedCoords = coords.map((ring: number[][]) =>
          ring.map((coord: number[]) =>
            this.rotatePoint([coord[0], coord[1]], center, rotationAngle)
          )
        );
        geometry.setCoordinates(rotatedCoords);
      }

      return true;
    }

    return false;
  }

  /**
   * 모든 대상 폴리곤을 회전
   */
  rotateAllTargets(): void {
    if (!this.sObj) {
      message.error("기준 객체가 설정되지 않았습니다.");
      return;
    }

    if (this.tObjList.length === 0) {
      message.error("대상 객체가 없습니다.");
      return;
    }

    let successCount = 0;
    this.tObjList.forEach((targetObj) => {
      if (this.rotateTargetToParallel(targetObj)) {
        successCount++;
      }
    });

    message.success(`${successCount}개의 객체를 회전했습니다.`);
  }

  /**
   * 초기화
   */
  reset(): void {
    this.mode = false;
    this.sObj = undefined;
    this.tObjList = [];
  }
}
