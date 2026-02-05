import Transform from 'ol-ext/interaction/Transform';
import type { MapBrowserEvent } from 'ol';

class CustomTransform extends Transform {
  private lastCursor_: string | null = null;

  /**
   * pointer move 시 커서 직접 제어
   */
  handleMoveEvent(evt: MapBrowserEvent<any>): boolean {
    // 1⃣ ol-ext 기본 로직 먼저 실행
    const handled = super.handleMoveEvent(evt);

    // 2⃣ active 아닐 때는 관여 안 함
    if (!this.getActive()) {
      this.restoreCursor_();
      return handled;
    }

    const map = this.getMap();
    if (!map) return handled;

    const viewport = map.getViewport();

    // 3⃣ 현재 Transform 모드 기준 분기
    let cursor: string | null = null;

    switch (this.mode_) {
      case 'select':
        cursor = 'move'; // ⭐ select 시 원하는 커서
        break;

      case 'translate':
        cursor = 'move';
        break;

      case 'rotate':
        cursor = 'crosshair';
        break;

      case 'scale':
      case 'scale1':
      case 'scale2':
      case 'scale3':
      case 'scale4':
        cursor = 'nwse-resize';
        break;

      case 'scaleh':
      case 'scaleh2':
        cursor = 'ns-resize';
        break;

      case 'scalev':
      case 'scalev2':
        cursor = 'ew-resize';
        break;

      default:
        cursor = null;
    }

    // 4⃣ 커서 적용 (불필요한 DOM 변경 방지)
    if (cursor !== this.lastCursor_) {
      viewport.style.cursor = cursor ?? '';
      this.lastCursor_ = cursor;
    }

    return handled;
  }

  /**
   * 커서 복원
   */
  private restoreCursor_(): void {
    if (!this.lastCursor_) return;

    const map = this.getMap();
    if (!map) return;

    map.getViewport().style.cursor = '';
    this.lastCursor_ = null;
  }

  /**
   * 비활성화 시 커서 즉시 복원
   */
  setActive(active: boolean): void {
    super.setActive(active);

    if (!active) {
      this.restoreCursor_();
    }
  }

  /**
   * 인터랙션 제거 시 커서 복원
   */
  dispose(): void {
    this.restoreCursor_();
    super.dispose();
  }
}

export default CustomTransform;
