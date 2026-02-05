import Transform from 'ol-ext/interaction/Transform';

class CustomTransform extends Transform {
  constructor(options = {}) {
    super(options);

    this.hoverCursor = options.hoverCursor || 'grab';
    this.defaultCursor = options.defaultCursor || '';
    
    // 맵에 추가될 때 pointermove 리스너 등록
    this.on('setMap', () => {
      const map = this.getMap();
      if (map) {
        this.pointerMoveHandler_ = this.handlePointerMove_.bind(this);
        map.on('pointermove', this.pointerMoveHandler_);
      }
    });
  }

  /**
   * 포인터 이동 처리
   */
  handlePointerMove_(evt) {
    const map = evt.map;
    if (!map) return;

    const element = map.getTargetElement();
    if (!element) return;

    // Transform 비활성화 상태
    if (!this.getActive()) {
      element.style.cursor = this.defaultCursor;
      return;
    }

    // 현재 모드 확인 (rotate, scale, translate 등)
    // this.get('rotate'), this.get('translate'), this.get('scale') 등으로 확인
    const mode = this.getMode_();
    
    // 핸들 위에 있을 때는 커서 변경 X
    if (mode) {
      return;
    }

    // 객체 위 hover 확인
    const feature = this.getFeatureAtPixel_(evt.pixel);
    
    if (feature) {
      element.style.cursor = this.hoverCursor;
    } else {
      element.style.cursor = this.defaultCursor;
    }
  }

  /**
   * 현재 모드 확인 (핸들 위에 있는지)
   */
  getMode_() {
    // ol-ext Transform 내부 상태 확인
    // 버전에 따라 다를 수 있음
    return this.mode || null;
  }

  /**
   * 픽셀 위치의 피처 확인
   */
  getFeatureAtPixel_(pixel) {
    const map = this.getMap();
    if (!map) return null;

    let foundFeature = null;
    
    map.forEachFeatureAtPixel(pixel, (feature) => {
      // Transform 대상 피처인지 확인
      if (this.features_) {
        // VectorSource가 아닌 features collection 사용 시
        const features = this.features_.getArray();
        if (features.includes(feature)) {
          foundFeature = feature;
          return true;
        }
      } else if (this.source_) {
        // VectorSource 사용 시
        const features = this.source_.getFeatures();
        if (features.includes(feature)) {
          foundFeature = feature;
          return true;
        }
      }
    });

    return foundFeature;
  }

  setActive(active) {
    super.setActive(active);

    if (!active) {
      const map = this.getMap();
      if (map) {
        const element = map.getTargetElement();
        if (element) {
          element.style.cursor = this.defaultCursor;
        }
      }
    }
  }

  setMap(map) {
    // 이전 맵에서 리스너 제거
    const oldMap = this.getMap();
    if (oldMap && this.pointerMoveHandler_) {
      oldMap.un('pointermove', this.pointerMoveHandler_);
      const element = oldMap.getTargetElement();
      if (element) {
        element.style.cursor = this.defaultCursor;
      }
    }

    super.setMap(map);

    // 새 맵에 리스너 등록
    if (map && this.pointerMoveHandler_) {
      map.on('pointermove', this.pointerMoveHandler_);
    }
  }
}

export default CustomTransform;
