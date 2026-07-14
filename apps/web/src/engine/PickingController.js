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
    shouldPrioritizeScenePick,
    pickBusinessObject,
    shouldTrackHover,
    hoverBusinessObject,
    onBusinessObjectPick,
    onBusinessObjectHover,
    onBusinessObjectHoverClear,
    onWorldPointPick,
    onWorldPointerMove,
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
    this.shouldPrioritizeScenePick = shouldPrioritizeScenePick || null;
    this.pickBusinessObject = pickBusinessObject || null;
    this.shouldTrackHover = shouldTrackHover || null;
    this.hoverBusinessObject = hoverBusinessObject || pickBusinessObject || null;
    this.onBusinessObjectPick = onBusinessObjectPick || null;
    this.onBusinessObjectHover = onBusinessObjectHover || null;
    this.onBusinessObjectHoverClear = onBusinessObjectHoverClear || null;
    this.onWorldPointPick = onWorldPointPick || null;
    this.onWorldPointerMove = onWorldPointerMove || null;
    this.onGsplatPick = onGsplatPick || null;
    this.onFallbackPick = onFallbackPick || null;
    this.onPick = onPick || null;
    this.onClear = onClear || null;

    this.pointerDown = null;
    this.clickThresholdSq = 16;
    this.lastPickWorldPosition = null;
    this.lastPickSource = null;
    this.hoveredBusinessObjectId = null;

    this.app.mouse?.on(pc.EVENT_MOUSEDOWN, this._onMouseDown, this);
    this.app.mouse?.on(pc.EVENT_MOUSEMOVE, this._onMouseMove, this);
    this.app.mouse?.on(pc.EVENT_MOUSEUP, this._onMouseUp, this);
    this.app.touch?.on(pc.EVENT_TOUCHSTART, this._onTouchStart, this);
    this.app.touch?.on(pc.EVENT_TOUCHEND, this._onTouchEnd, this);
    this.canvas?.addEventListener?.('mouseleave', this._handleMouseLeave);
  }

  destroy() {
    this.app.mouse?.off(pc.EVENT_MOUSEDOWN, this._onMouseDown, this);
    this.app.mouse?.off(pc.EVENT_MOUSEMOVE, this._onMouseMove, this);
    this.app.mouse?.off(pc.EVENT_MOUSEUP, this._onMouseUp, this);
    this.app.touch?.off(pc.EVENT_TOUCHSTART, this._onTouchStart, this);
    this.app.touch?.off(pc.EVENT_TOUCHEND, this._onTouchEnd, this);
    this.canvas?.removeEventListener?.('mouseleave', this._handleMouseLeave);
  }

  _handleMouseLeave = () => {
    this.clearHover();
  };

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

  _onMouseMove(event) {
    const originalEvent = event.event;
    if (this._shouldIgnoreOriginalEvent(originalEvent)) {
      this.clearHover();
      return;
    }

    if (originalEvent?.buttons) {
      return;
    }

    const point = this._getCanvasPointFromClient(originalEvent.clientX, originalEvent.clientY);
    if (!point) {
      this.clearHover();
      return;
    }

    if (this.onWorldPointerMove?.(point.x, point.y)) {
      this.clearHover();
      return;
    }

    this.updateHover(point.x, point.y);
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
    const prioritizeScenePick = Boolean(this.shouldPrioritizeScenePick?.());
    if (!prioritizeScenePick) {
      const businessHit = this.pickBusinessObject?.(screenX, screenY) ?? null;
      if (businessHit) {
        this.onBusinessObjectPick?.(businessHit);
        return {
          type: 'business-object',
          ...businessHit
        };
      }
    }

    const worldHit = await this.pickWorldPoint(screenX, screenY);
    if (worldHit && this.onWorldPointPick?.(worldHit)) {
      return worldHit;
    }

    if (!worldHit) {
      return null;
    }

    if (worldHit.type === 'gsplat') {
      this.lastPickWorldPosition = worldHit.worldPoint.clone?.() ?? worldHit.worldPoint;
      this.lastPickSource = 'gsplat';
      this.markerManager.placeMarker(worldHit.worldPoint);
      this.onGsplatPick?.(worldHit);
      this.onPick?.({
        point: worldHit.worldPoint,
        localPoint: worldHit.localPoint,
        screen: worldHit.screen,
        source: 'gsplat'
      });
      return worldHit;
    }

    if (worldHit.type === 'fallback') {
      this.lastPickWorldPosition = worldHit.point.clone?.() ?? worldHit.point;
      this.lastPickSource = 'fallback';
      this.markerManager.placeMarker(worldHit.point);
      this.onFallbackPick?.(worldHit);
      this.onPick?.(worldHit);
      return worldHit;
    }

    return worldHit;
  }

  async pickWorldPoint(screenX, screenY, options = {}) {
    if (options.log !== false) {
      console.debug(`[Pick] gsplat start: x=${screenX.toFixed(1)}, y=${screenY.toFixed(1)}`);
    }
    const gsplatHit = await this.gsplatPointPicker?.pick?.(screenX, screenY);
    if (gsplatHit?.worldPoint) {
      return {
        type: 'gsplat',
        ...gsplatHit
      };
    }

    if (options.log !== false) {
      console.debug('[Pick] gsplat failed: no world point');
    }

    const ray = this._getRay(screenX, screenY);
    const fallbackHit = this.bimProxyManager.intersectRay(ray.origin, ray.direction);
    if (!fallbackHit) {
      return null;
    }

    return {
      type: 'fallback',
      ...fallbackHit
    };
  }

  updateHover(screenX, screenY) {
    if (this.shouldTrackHover && !this.shouldTrackHover()) {
      this.clearHover();
      return null;
    }

    const businessHit = this.hoverBusinessObject?.(screenX, screenY) ?? null;
    const nextHoveredId = businessHit?.objectId ?? null;
    if (nextHoveredId === this.hoveredBusinessObjectId) {
      return businessHit;
    }

    this.hoveredBusinessObjectId = nextHoveredId;
    if (businessHit) {
      this.onBusinessObjectHover?.(businessHit);
      return businessHit;
    }

    this.onBusinessObjectHoverClear?.();
    return null;
  }

  clearHover() {
    if (!this.hoveredBusinessObjectId) {
      return;
    }

    this.hoveredBusinessObjectId = null;
    this.onBusinessObjectHoverClear?.();
  }

  clearMarker() {
    this.lastPickWorldPosition = null;
    this.lastPickSource = null;
    this.markerManager.clearMarker();
    if (this.onClear) {
      this.onClear();
    }
  }

  getLastPickWorldPosition() {
    return this.lastPickWorldPosition?.clone?.() ?? this.lastPickWorldPosition ?? null;
  }

  getLastPickSource() {
    return this.lastPickSource ?? null;
  }
}
