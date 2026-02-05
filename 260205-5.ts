import ol_interaction_Transform from 'ol-ext/interaction/Transform';
import { Map } from 'ol';
import type { Options as TransformOptions } from 'ol-ext/interaction/Transform';

/**
 * Transform Cursor 설정 인터페이스
 */
export interface TransformCursors {
  default?: string;
  select?: string;
  translate?: string;
  rotate?: string;
  scale?: string;
  scale1?: string;
  scale2?: string;
  scale3?: string;
  scalev?: string;
  scaleh?: string;
  scalev2?: string;
  scaleh2?: string;
}

/**
 * Custom Transform Interaction Options
 */
export interface CustomTransformOptions extends TransformOptions {
  /** 커서 설정 (Transform.prototype.Cursor와 동일한 구조) */
  cursors?: TransformCursors;
}

/**
 * Custom Transform Interaction with cursor management
 * Transform.prototype.Cursor를 인스턴스 레벨에서 관리
 */
class CustomTransform extends ol_interaction_Transform {
  private customCursors_: TransformCursors;
  private originalCursors_: TransformCursors;

  constructor(options: CustomTransformOptions = {}) {
    super(options);
    
    // 기본 커서 설정 저장
    this.originalCursors_ = this.getDefaultCursors_();
    
    // 사용자 정의 커서 설정
    this.customCursors_ = {
      default: 'default',
      select: 'pointer',
      translate: 'move',
      rotate: 'move',
      scale: 'nesw-resize',
      scale1: 'nwse-resize',
      scale2: 'nesw-resize',
      scale3: 'nwse-resize',
      scalev: 'ew-resize',
      scaleh: 'ns-resize',
      scalev2: 'e-resize',
      scaleh2: 's-resize',
      ...options.cursors
    };
    
    // 커서 적용
    this.applyCursors_();
  }

  /**
   * Transform의 기본 커서 가져오기
   * @private
   */
  private getDefaultCursors_(): TransformCursors {
    const Cursor = (this as any).Cursor || (ol_interaction_Transform.prototype as any).Cursor;
    return { ...Cursor };
  }

  /**
   * 커서 설정 적용
   * @private
   */
  private applyCursors_(): void {
    // Transform 인스턴스의 Cursor 객체에 직접 할당
    if (!(this as any).Cursor) {
      (this as any).Cursor = {};
    }
    
    Object.assign((this as any).Cursor, this.customCursors_);
  }

  /**
   * 커서 복원
   * @private
   */
  private restoreCursors_(): void {
    if ((this as any).Cursor) {
      Object.assign((this as any).Cursor, this.originalCursors_);
    }
  }

  /**
   * 모든 커서 설정
   * @param cursors 커서 설정 객체
   */
  public setCursors(cursors: TransformCursors): void {
    this.customCursors_ = {
      ...this.customCursors_,
      ...cursors
    };
    this.applyCursors_();
  }

  /**
   * 특정 커서 설정
   * @param type 커서 타입
   * @param cursor 커서 스타일
   */
  public setCursor(type: keyof TransformCursors, cursor: string): void {
    this.customCursors_[type] = cursor;
    if ((this as any).Cursor) {
      (this as any).Cursor[type] = cursor;
    }
  }

  /**
   * Select 커서 설정 (Transform.prototype.Cursor.select와 동일)
   * @param cursor 커서 스타일
   */
  public setSelectCursor(cursor: string): void {
    this.setCursor('select', cursor);
  }

  /**
   * Default 커서 설정
   * @param cursor 커서 스타일
   */
  public setDefaultCursor(cursor: string): void {
    this.setCursor('default', cursor);
  }

  /**
   * Translate 커서 설정
   * @param cursor 커서 스타일
   */
  public setTranslateCursor(cursor: string): void {
    this.setCursor('translate', cursor);
  }

  /**
   * Rotate 커서 설정
   * @param cursor 커서 스타일
   */
  public setRotateCursor(cursor: string): void {
    this.setCursor('rotate', cursor);
  }

  /**
   * Scale 커서 설정
   * @param cursor 커서 스타일
   */
  public setScaleCursor(cursor: string): void {
    this.setCursor('scale', cursor);
  }

  /**
   * 특정 커서 가져오기
   * @param type 커서 타입
   */
  public getCursor(type: keyof TransformCursors): string | undefined {
    return this.customCursors_[type];
  }

  /**
   * Select 커서 가져오기
   */
  public getSelectCursor(): string | undefined {
    return this.customCursors_.select;
  }

  /**
   * 모든 커서 설정 가져오기
   */
  public getCursors(): TransformCursors {
    return { ...this.customCursors_ };
  }

  /**
   * Map 설정 시 커서 적용
   */
  setMap(map: Map | null): void {
    super.setMap(map);
    
    if (map) {
      // 맵이 설정될 때 커서 재적용
      this.applyCursors_();
    }
  }

  /**
   * Active 상태 변경 시 처리
   */
  setActive(active: boolean): void {
    super.setActive(active);
    
    if (active) {
      // 활성화 시 커서 적용
      this.applyCursors_();
    } else {
      // 비활성화 시에도 커서 유지 (다음 활성화를 위해)
      this.applyCursors_();
    }
  }

  /**
   * Dispose 시 원래 커서로 복원
   */
  public dispose(): void {
    this.restoreCursors_();
    super.dispose();
  }
}

export default CustomTransform;
