import * as pc from 'playcanvas';

function distanceSquared(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export class PickingController {
  constructor({ app, canvas, camera, bimProxyManager, markerManager, onPick, onClear }) {
    this.app = app;
    this.canvas = canvas;
    this.camera = camera;
    this.bimProxyManager = bimProxyManager;
    this.markerManager = markerManager;
    this.onPick = onPick || null;
    this.onClear = onClear || null;

    this.pointerDown = null;
    this.clickThresholdSq = 16;

    this.app.mouse.on(pc.EVENT_MOUSEDOWN, this._onMouseDown, this);
    this.app.mouse.on(pc.EVENT_MOUSEUP, this._onMouseUp, this);
  }

  _onMouseDown(event) {
    const originalEvent = event.event;
    if (!originalEvent || originalEvent.target !== this.canvas) {
      return;
    }

    if (event.button !== pc.MOUSEBUTTON_LEFT || originalEvent.shiftKey) {
      this.pointerDown = null;
      return;
    }

    this.pointerDown = {
      x: event.x,
      y: event.y
    };
  }

  _onMouseUp(event) {
    const originalEvent = event.event;
    if (!this.pointerDown || !originalEvent || originalEvent.target !== this.canvas) {
      return;
    }

    if (event.button !== pc.MOUSEBUTTON_LEFT || originalEvent.shiftKey) {
      this.pointerDown = null;
      return;
    }

    const pointerUp = { x: event.x, y: event.y };
    if (distanceSquared(this.pointerDown, pointerUp) > this.clickThresholdSq) {
      this.pointerDown = null;
      return;
    }

    this.pointerDown = null;
    this.pick(event.x, event.y);
  }

  pick(screenX, screenY) {
    const origin = this.camera.getPosition().clone();
    const farPoint = this.camera.camera.screenToWorld(
      screenX,
      screenY,
      this.camera.camera.farClip
    );
    const direction = farPoint.sub(origin).normalize();

    const hit = this.bimProxyManager.intersectRay(origin, direction);
    if (!hit) {
      return null;
    }

    this.markerManager.placeMarker(hit.point);

    if (this.onPick) {
      this.onPick(hit);
    }

    return hit;
  }

  clearMarker() {
    this.markerManager.clearMarker();
    if (this.onClear) {
      this.onClear();
    }
  }
}
