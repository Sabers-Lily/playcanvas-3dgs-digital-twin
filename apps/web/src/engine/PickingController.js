import * as pc from 'playcanvas';

function distanceSquared(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export class PickingController {
  constructor({
    app,
    canvas,
    camera,
    bimProxyManager,
    markerManager,
    gsplatPointPicker,
    pickBusinessObject,
    onBusinessObjectPick,
    onGsplatPick,
    onFallbackPick,
    onPick,
    onClear
  }) {
    this.app = app;
    this.canvas = canvas;
    this.camera = camera;
    this.bimProxyManager = bimProxyManager;
    this.markerManager = markerManager;
    this.gsplatPointPicker = gsplatPointPicker || null;
    this.pickBusinessObject = pickBusinessObject || null;
    this.onBusinessObjectPick = onBusinessObjectPick || null;
    this.onGsplatPick = onGsplatPick || null;
    this.onFallbackPick = onFallbackPick || null;
    this.onPick = onPick || null;
    this.onClear = onClear || null;

    this.pointerDown = null;
    this.clickThresholdSq = 16;

    this.app.mouse?.on(pc.EVENT_MOUSEDOWN, this._onMouseDown, this);
    this.app.mouse?.on(pc.EVENT_MOUSEUP, this._onMouseUp, this);
    this.app.touch?.on(pc.EVENT_TOUCHSTART, this._onTouchStart, this);
    this.app.touch?.on(pc.EVENT_TOUCHEND, this._onTouchEnd, this);
  }

  destroy() {
    this.app.mouse?.off(pc.EVENT_MOUSEDOWN, this._onMouseDown, this);
    this.app.mouse?.off(pc.EVENT_MOUSEUP, this._onMouseUp, this);
    this.app.touch?.off(pc.EVENT_TOUCHSTART, this._onTouchStart, this);
    this.app.touch?.off(pc.EVENT_TOUCHEND, this._onTouchEnd, this);
  }

  _shouldIgnoreOriginalEvent(originalEvent) {
    if (!originalEvent || originalEvent.target !== this.canvas) {
      return true;
    }

    return Boolean(originalEvent.shiftKey || originalEvent.altKey || originalEvent.ctrlKey || originalEvent.metaKey);
  }

  _getCanvasPointFromClient(clientX, clientY) {
    const rect = this.canvas?.getBoundingClientRect?.();
    if (!rect) {
      return null;
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  }

  _onMouseDown(event) {
    const originalEvent = event.event;
    if (this._shouldIgnoreOriginalEvent(originalEvent)) {
      this.pointerDown = null;
      return;
    }

    if (event.button !== pc.MOUSEBUTTON_LEFT) {
      this.pointerDown = null;
      return;
    }

    const point = this._getCanvasPointFromClient(originalEvent.clientX, originalEvent.clientY);
    if (!point) {
      this.pointerDown = null;
      return;
    }

    this.pointerDown = {
      x: point.x,
      y: point.y,
      source: 'mouse'
    };
  }

  async _onMouseUp(event) {
    const originalEvent = event.event;
    if (!this.pointerDown || this.pointerDown.source !== 'mouse' || this._shouldIgnoreOriginalEvent(originalEvent)) {
      return;
    }

    if (event.button !== pc.MOUSEBUTTON_LEFT) {
      this.pointerDown = null;
      return;
    }

    const pointerUp = this._getCanvasPointFromClient(originalEvent.clientX, originalEvent.clientY);
    if (!pointerUp) {
      this.pointerDown = null;
      return;
    }

    if (distanceSquared(this.pointerDown, pointerUp) > this.clickThresholdSq) {
      this.pointerDown = null;
      return;
    }

    this.pointerDown = null;
    await this.pick(pointerUp.x, pointerUp.y);
  }

  _onTouchStart(event) {
    const touch = event.touches?.[0];
    const originalEvent = event.event;
    if (!touch || !originalEvent || originalEvent.target !== this.canvas) {
      this.pointerDown = null;
      return;
    }

    const point = this._getCanvasPointFromClient(touch.touch.clientX, touch.touch.clientY);
    if (!point) {
      this.pointerDown = null;
      return;
    }

    this.pointerDown = {
      x: point.x,
      y: point.y,
      source: 'touch'
    };
  }

  async _onTouchEnd(event) {
    const changedTouch = event.changedTouches?.[0];
    if (!this.pointerDown || this.pointerDown.source !== 'touch' || !changedTouch) {
      return;
    }

    const pointerUp = this._getCanvasPointFromClient(changedTouch.touch.clientX, changedTouch.touch.clientY);
    if (!pointerUp) {
      this.pointerDown = null;
      return;
    }

    if (distanceSquared(this.pointerDown, pointerUp) > this.clickThresholdSq) {
      this.pointerDown = null;
      return;
    }

    this.pointerDown = null;
    await this.pick(pointerUp.x, pointerUp.y);
  }

  _getRay(screenX, screenY) {
    const origin = this.camera.getPosition().clone();
    const farPoint = this.camera.camera.screenToWorld(
      screenX,
      screenY,
      this.camera.camera.farClip
    );

    return {
      origin,
      direction: farPoint.sub(origin).normalize()
    };
  }

  async pick(screenX, screenY) {
    const businessHit = this.pickBusinessObject?.(screenX, screenY) ?? null;
    if (businessHit) {
      this.onBusinessObjectPick?.(businessHit);
      return {
        type: 'business-object',
        ...businessHit
      };
    }

    console.debug(`[Pick] gsplat start: x=${screenX.toFixed(1)}, y=${screenY.toFixed(1)}`);
    const gsplatHit = await this.gsplatPointPicker?.pick?.(screenX, screenY);
    if (gsplatHit?.worldPoint) {
      this.markerManager.placeMarker(gsplatHit.worldPoint);
      this.onGsplatPick?.(gsplatHit);
      this.onPick?.({
        point: gsplatHit.worldPoint,
        localPoint: gsplatHit.localPoint,
        screen: gsplatHit.screen,
        source: 'gsplat'
      });
      return {
        type: 'gsplat',
        ...gsplatHit
      };
    }

    console.debug('[Pick] gsplat failed: no world point');

    const ray = this._getRay(screenX, screenY);
    const fallbackHit = this.bimProxyManager.intersectRay(ray.origin, ray.direction);
    if (!fallbackHit) {
      return null;
    }

    this.markerManager.placeMarker(fallbackHit.point);
    this.onFallbackPick?.(fallbackHit);
    this.onPick?.(fallbackHit);
    return {
      type: 'fallback',
      ...fallbackHit
    };
  }

  clearMarker() {
    this.markerManager.clearMarker();
    if (this.onClear) {
      this.onClear();
    }
  }
}
