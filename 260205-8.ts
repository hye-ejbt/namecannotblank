// 더 간단한 접근 - 맵의 pointermove 이벤트 직접 사용
class CustomTransform extends Transform {
  constructor(options = {}) {
    super(options);
    this.hoverCursor = options.hoverCursor || 'grab';
    this.defaultCursor = options.defaultCursor || '';
  }

  setMap(map) {
    // 기존 맵 정리
    const oldMap = this.getMap();
    if (oldMap) {
      if (this.pointerMoveKey_) {
        oldMap.un('pointermove', this.pointerMoveKey_);
      }
      const element = oldMap.getTargetElement();
      if (element) {
        element.style.cursor = this.defaultCursor;
      }
    }

    super.setMap(map);

    // 새 맵 설정
    if (map) {
      this.pointerMoveKey_ = map.on('pointermove', (evt) => {
        this.updateCursor_(evt);
      });
    }
  }

  updateCursor_(evt) {
    const map = this.getMap();
    if (!map) return;

    const element = map.getTargetElement();
    if (!element) return;

    if (!this.getActive()) {
      element.style.cursor = this.defaultCursor;
      return;
    }

    // 핸들 체크 (ol-ext 내부 프로퍼티 사용)
    if (this.mode || this.constraint_) {
      return; // 핸들 커서 유지
    }

    // 피처 체크
    let onFeature = false;
    map.forEachFeatureAtPixel(evt.pixel, (feature) => {
      if (this.addFn_(feature)) {
        onFeature = true;
        return true;
      }
    });

    element.style.cursor = onFeature ? this.hoverCursor : this.defaultCursor;
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
}

export default CustomTransform;
