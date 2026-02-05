import { MapBrowserEvent } from 'ol';
import { Pixel } from 'ol/pixel';
import Feature from 'ol/Feature';
import { Geometry } from 'ol/geom';

/**
 * Advanced Custom Transform Options
 */
export interface AdvancedCustomTransformOptions extends CustomTransformOptions {
  /** 피처 위에 호버할 때 사용할 커서 */
  hoverCursor?: string;
}

/**
 * Advanced Custom Transform with hover detection
 */
class AdvancedCustomTransform extends CustomTransform {
  private hoverCursor_: string;
  private isHovering_: boolean;

  constructor(options: AdvancedCustomTransformOptions = {}) {
    super(options);
    this.hoverCursor_ = options.hoverCursor || 'pointer';
    this.isHovering_ = false;
  }

  /**
   * 픽셀 위치에서 피처 가져오기
   * @private
   */
  private getFeatureAtPixel_(pixel: Pixel): Feature<Geometry> | null {
    const map = this.getMap();
    if (!map) return null;

    let feature: Feature<Geometry> | null = null;
    map.forEachFeatureAtPixel(pixel, (f) => {
      if (f instanceof Feature) {
        feature = f as Feature<Geometry>;
        return true;
      }
      return false;
    });

    return feature;
  }

  /**
   * Handle move event
   * @protected
   */
  protected handleMoveEvent_(evt: MapBrowserEvent<UIEvent>): boolean {
    const hit = this.getFeatureAtPixel_(evt.pixel);
    const wasHovering = this.isHovering_;
    this.isHovering_ = !!hit;
    
    const viewport = this.getMap()?.getViewport();
    
    if (this.getActive() && wasHovering !== this.isHovering_ && viewport) {
      viewport.style.cursor = this.isHovering_ 
        ? this.hoverCursor_ 
        : this.getSelectCursor();
    }
    
    // @ts-ignore - ol-ext의 타입 정의가 없을 수 있음
    return super.handleMoveEvent_(evt);
  }

  /**
   * 호버 커서 설정
   */
  public setHoverCursor(cursor: string): void {
    this.hoverCursor_ = cursor;
  }

  /**
   * 호버 커서 가져오기
   */
  public getHoverCursor(): string {
    return this.hoverCursor_;
  }
}

export { AdvancedCustomTransform };
