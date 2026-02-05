import ol_interaction_Transform from 'ol-ext/interaction/Transform';
import { Map } from 'ol';
import type { Options as TransformOptions } from 'ol-ext/interaction/Transform';

/**
 * Custom Transform Interaction Options
 */
export interface CustomTransformOptions extends TransformOptions {
  /** 활성화 시 사용할 커서 */
  selectCursor?: string;
  /** 비활성화 시 사용할 기본 커서 */
  defaultCursor?: string;
}

/**
 * Custom Transform Interaction with dynamic cursor management
 * @extends {ol_interaction_Transform}
 */
class CustomTransform extends ol_interaction_Transform {
  private selectCursor_: string;
  private defaultCursor_: string;
  private viewport_: HTMLElement | null;
  private previousCursor_: string | null;

  /**
   * @param {CustomTransformOptions} options Transform options
   */
  constructor(options: CustomTransformOptions = {}) {
    super(options);
    
    this.selectCursor_ = options.selectCursor || 'crosshair';
    this.defaultCursor_ = options.defaultCursor || 'default';
    this.viewport_ = null;
    this.previousCursor_ = null;
  }

  /**
   * @override
   * ol-ext 4.0.14에서 setMap은 Interaction 클래스에서 상속됨
   */
  setMap(map: Map | null): void {
    // 이전 맵에서 커서 복원
    const currentMap = this.getMap();
    if (currentMap && this.viewport_) {
      this.restoreCursor_();
    }
    
    super.setMap(map);
    
    // 새 맵에 viewport 설정
    if (map) {
      this.viewport_ = map.getViewport();
      this.updateCursor_();
    } else {
      this.viewport_ = null;
    }
  }

  /**
   * @override
   * ol-ext 4.0.14의 Transform은 Pointer 인터랙션을 상속하므로 setActive 메서드 사용 가능
   */
  setActive(active: boolean): void {
    const wasActive = this.getActive();
    super.setActive(active);
    
    // active 상태가 변경되었을 때만 커서 업데이트
    if (wasActive !== active) {
      this.updateCursor_();
    }
  }

  /**
   * 커서 업데이트
   * @private
   */
  private updateCursor_(): void {
    if (!this.viewport_) {
      return;
    }
    
    if (this.getActive()) {
      // 활성화: 커스텀 커서 적용
      this.previousCursor_ = this.viewport_.style.cursor;
      this.viewport_.style.cursor = this.selectCursor_;
    } else {
      // 비활성화: 기본 커서로 복원
      this.restoreCursor_();
    }
  }

  /**
   * 커서 복원
   * @private
   */
  private restoreCursor_(): void {
    if (this.viewport_) {
      this.viewport_.style.cursor = this.defaultCursor_;
      this.previousCursor_ = null;
    }
  }

  /**
   * Select 커서 설정
   * @param {string} cursor 커서 스타일
   */
  public setSelectCursor(cursor: string): void {
    this.selectCursor_ = cursor;
    if (this.getActive()) {
      this.updateCursor_();
    }
  }

  /**
   * 기본 커서 설정
   * @param {string} cursor 커서 스타일
   */
  public setDefaultCursor(cursor: string): void {
    this.defaultCursor_ = cursor;
    if (!this.getActive()) {
      this.updateCursor_();
    }
  }

  /**
   * 현재 select 커서 가져오기
   * @return {string}
   */
  public getSelectCursor(): string {
    return this.selectCursor_;
  }

  /**
   * 현재 기본 커서 가져오기
   * @return {string}
   */
  public getDefaultCursor(): string {
    return this.defaultCursor_;
  }

  /**
   * @override
   * ol-ext 4.0.14에서는 dispose() 메서드 사용
   */
  public dispose(): void {
    this.restoreCursor_();
    this.viewport_ = null;
    this.previousCursor_ = null;
    super.dispose();
  }
}

export default CustomTransform;
