import * as pc from 'playcanvas';

function distanceSquared(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function intersectRayWithPlane(ray, plane) {
  const denominator = plane.normal.dot(ray.direction);
  if (Math.abs(denominator) <= 1e-6) {
    return null;
  }

  const t = -(plane.normal.dot(ray.origin) + plane.constant) / denominator;
  if (t < 0) {
    return null;
  }

  return ray.origin.clone().add(ray.direction.clone().mulScalar(t));
}

export class ObjectTransformDragController {
  constructor({
    app,
    canvas,
    cameraEntity,
    selectionManager,
    cameraController,
    pickBusinessObject,
    applyTransformToObject,
    shouldBlock,
    canDragObject,
    log
  }) {
    this.app = app;
    this.canvas = canvas;
    this.cameraEntity = cameraEntity;
    this.selectionManager = selectionManager;
    this.cameraController = cameraController;
    this.pickBusinessObject = pickBusinessObject || null;
    this.applyTransformToObject = applyTransformToObject || null;
    this.shouldBlock = shouldBlock || null;
    this.canDragObject = canDragObject || null;
    this.log = typeof log === 'function' ? log : () => {};

    this.dragThresholdSq = 16;
    this.pendingSession = null;

    this.app.mouse?.on(pc.EVENT_MOUSEDOWN, this._onMouseDown, this);
    this.app.mouse?.on(pc.EVENT_MOUSEMOVE, this._onMouseMove, this);
    this.app.mouse?.on(pc.EVENT_MOUSEUP, this._onMouseUp, this);
  }

  destroy() {
    this.app.mouse?.off(pc.EVENT_MOUSEDOWN, this._onMouseDown, this);
    this.app.mouse?.off(pc.EVENT_MOUSEMOVE, this._onMouseMove, this);
    this.app.mouse?.off(pc.EVENT_MOUSEUP, this._onMouseUp, this);
    this.pendingSession = null;
  }

  _shouldIgnoreOriginalEvent(originalEvent) {
    if (!originalEvent || originalEvent.target !== this.canvas) {
      return true;
    }

    return Boolean(originalEvent.shiftKey || originalEvent.altKey || originalEvent.ctrlKey || originalEvent.metaKey);
  }

  _getCanvasPoint(originalEvent) {
    const rect = this.canvas?.getBoundingClientRect?.();
    if (!rect) {
      return null;
    }

    return {
      x: originalEvent.clientX - rect.left,
      y: originalEvent.clientY - rect.top
    };
  }

  _getRay(screenX, screenY) {
    const origin = this.cameraEntity.getPosition().clone();
    const farPoint = this.cameraEntity.camera.screenToWorld(
      screenX,
      screenY,
      this.cameraEntity.camera.farClip
    );

    return {
      origin,
      direction: farPoint.sub(origin).normalize()
    };
  }

  _createDragPlane(position) {
    const normal = new pc.Vec3(0, 1, 0);
    return {
      normal,
      constant: -normal.dot(position)
    };
  }

  _clearSession() {
    this.pendingSession = null;
    this.cameraController?.setEnabled(true);
  }

  _onMouseDown(event) {
    const originalEvent = event.event;
    if (this._shouldIgnoreOriginalEvent(originalEvent) || event.button !== pc.MOUSEBUTTON_LEFT) {
      this.pendingSession = null;
      return;
    }

    if (this.shouldBlock?.()) {
      this.pendingSession = null;
      return;
    }

    const point = this._getCanvasPoint(originalEvent);
    if (!point) {
      this.pendingSession = null;
      return;
    }

    const hit = this.pickBusinessObject?.(point.x, point.y) ?? null;
    if (!hit?.object?.entity || !this.canDragObject?.(hit.object)) {
      this.pendingSession = null;
      return;
    }

    const objectPosition = hit.object.entity.getPosition().clone();
    const ray = this._getRay(point.x, point.y);
    const dragPlane = this._createDragPlane(objectPosition);
    const startHitPoint = intersectRayWithPlane(ray, dragPlane);

    if (!startHitPoint) {
      this.pendingSession = null;
      return;
    }

    this.selectionManager.select(hit.objectId);
    this.cameraController?.setEnabled(false);
    this.pendingSession = {
      objectId: hit.objectId,
      objectName: hit.object.displayName ?? hit.object.name ?? hit.objectId,
      pointerDown: point,
      dragPlane,
      startHitPoint,
      startObjectPosition: objectPosition,
      active: false
    };
  }

  _onMouseMove(event) {
    if (!this.pendingSession) {
      return;
    }

    const originalEvent = event.event;
    const point = this._getCanvasPoint(originalEvent);
    if (!point) {
      return;
    }

    if (!this.pendingSession.active) {
      if (distanceSquared(this.pendingSession.pointerDown, point) <= this.dragThresholdSq) {
        return;
      }

      this.pendingSession.active = true;
      this.canvas.style.cursor = 'grabbing';
      console.log(`[ObjectTransformDrag] start ${this.pendingSession.objectId}`);
    }

    const ray = this._getRay(point.x, point.y);
    const currentHitPoint = intersectRayWithPlane(ray, this.pendingSession.dragPlane);
    if (!currentHitPoint) {
      return;
    }

    const delta = currentHitPoint.clone().sub(this.pendingSession.startHitPoint);
    const nextPosition = this.pendingSession.startObjectPosition.clone().add(delta);
    const object = this.selectionManager.getSelectedObject();

    if (!object || object.id !== this.pendingSession.objectId) {
      this._clearSession();
      return;
    }

    const nextTransform = {
      ...(object.transform ?? {}),
      position: [nextPosition.x, nextPosition.y, nextPosition.z]
    };

    this.applyTransformToObject?.(this.pendingSession.objectId, nextTransform, {
      silentLog: true
    });
  }

  _onMouseUp(event) {
    if (!this.pendingSession || event.button !== pc.MOUSEBUTTON_LEFT) {
      return;
    }

    const completedSession = this.pendingSession;
    this._clearSession();

    if (!completedSession.active) {
      return;
    }

    const selectedObject = this.selectionManager.getSelectedObject();
    const position = selectedObject?.transform?.position ?? null;
    console.log(`[ObjectTransformDrag] end ${completedSession.objectId}`, {
      position
    });

    if (this.canvas?.style) {
      this.canvas.style.cursor = 'pointer';
    }

    this.log(`[ObjectTransformDrag] completed: objectId=${completedSession.objectId} name=${completedSession.objectName}`);
  }
}
