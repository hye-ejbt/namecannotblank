import ol_interaction_Transform from 'ol-ext/interaction/Transform';
import { Map } from 'ol';
import type { Options as TransformOptions } from 'ol-ext/interaction/Transform';
import { EventsKey } from 'ol/events';

export interface CustomTransformOptions extends TransformOptions {
  selectCursor?: string;
  defaultCursor?: string;
  /** 변환 중일 때 사용할 커서 */
  transformingCursor?: string;
}

class CustomTransform extends ol_interaction_Transform {
  private selectCursor_: string;
  private defaultCursor_: string;
  private transformingCursor_: string;
  private viewport_: HTMLElement | null;
  private isTransforming_: boolean;
  private eventKeys_: EventsKey[];

  constructor(options: CustomTransformOptions = {}) {
    super(options);
    
    this.selectCursor_ = options.selectCursor || 'crosshair';
    this.defaultCursor_ = options.defaultCursor || 'default';
    this.transformingCursor_ = options.transformingCursor || 'move';
    this.viewport_ = null;
    this.isTransforming_ = false;
    this.eventKeys_ = [];
    
    this.setupEventListeners_();
  }

  /**
   * ol-ext 4.0.14 이벤트 리스너 설정
   * @private
   */
  private setupEventListeners_(): void {
    // Transform 시작 이벤트
    this.on('select', () => {
      this.updateCursorForState_();
    });

    // Transform 중 이벤트
    this.on('rotating', () => {
      this.isTransforming_ = true;
      this.updateCursorForState_();
    });

    this.on('translating', () => {
      this.isTransforming_ = true;
      this.updateCursorForState_();
    });

    this.on('scaling', () => {
      this.isTransforming_ = true;
      this.updateCursorForState_();
    });

    // Transform 종료 이벤트
    this.on('rotateend', () => {
      this.isTransforming_ = false;
      this.updateCursorForState_();
    });

    this.on('translateend', () => {
      this.isTransforming_ = false;
      this.updateCursorForState_();
    });

    this.on('scaleend', () => {
      this.isTransforming_ = false;
      this.updateCursorForState_();
    });
  }

  setMap(map: Map | null): void {
    const currentMap = this.getMap();
    if (currentMap && this.viewport_) {
      this.restoreCursor_();
    }
    
    super.setMap(map);
    
    if (map) {
      this.viewport_ = map.getViewport();
      this.updateCursorForState_();
    } else {
      this.viewport_ = null;
    }
  }

  setActive(active: boolean): void {
    const wasActive = this.getActive();
    super.setActive(active);
    
    if (wasActive !== active) {
      this.updateCursorForState_();
    }
  }

  /**
   * 상태에 따라 커서 업데이트
   * @private
   */
  private updateCursorForState_(): void {
    if (!this.viewport_) {
      return;
    }

    if (!this.getActive()) {
      this.viewport_.style.cursor = this.defaultCursor_;
    } else if (this.isTransforming_) {
      this.viewport_.style.cursor = this.transformingCursor_;
    } else {
      this.viewport_.style.cursor = this.selectCursor_;
    }
  }

  private restoreCursor_(): void {
    if (this.viewport_) {
      this.viewport_.style.cursor = this.defaultCursor_;
    }
  }

  public setSelectCursor(cursor: string): void {
    this.selectCursor_ = cursor;
    if (this.getActive() && !this.isTransforming_) {
      this.updateCursorForState_();
    }
  }

  public setDefaultCursor(cursor: string): void {
    this.defaultCursor_ = cursor;
    if (!this.getActive()) {
      this.updateCursorForState_();
    }
  }

  public setTransformingCursor(cursor: string): void {
    this.transformingCursor_ = cursor;
    if (this.getActive() && this.isTransforming_) {
      this.updateCursorForState_();
    }
  }

  public getSelectCursor(): string {
    return this.selectCursor_;
  }

  public getDefaultCursor(): string {
    return this.defaultCursor_;
  }

  public getTransformingCursor(): string {
    return this.transformingCursor_;
  }

  public dispose(): void {
    this.restoreCursor_();
    this.viewport_ = null;
    this.eventKeys_.forEach(key => {
      // @ts-ignore
      this.un(key);
    });
    this.eventKeys_ = [];
    super.dispose();
  }
}

export default CustomTransform;
