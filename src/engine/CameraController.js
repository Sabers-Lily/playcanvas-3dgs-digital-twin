import * as pc from 'playcanvas';

const DRAG_NONE = 'none';
const DRAG_ORBIT = 'orbit';
const DRAG_PAN = 'pan';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function isEditableElement(target) {
  if (!target || !(target instanceof HTMLElement)) {
    return false;
  }

  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    tag === 'BUTTON' ||
    target.isContentEditable
  );
}

export class CameraController {
  constructor({ app, camera, canvas, keyboardTarget = window }) {
    this.app = app;
    this.camera = camera;
    this.canvas = canvas;
    this.keyboardTarget = keyboardTarget;

    this.enabled = true;
    this.keyboardActive = false;
    this.dragMode = DRAG_NONE;
    this.keys = new Set();

    this.target = new pc.Vec3(0, 0, 0);
    this.distance = 80;
    this.yaw = 0;
    this.pitch = 45;

    this.minDistance = 0.2;
    this.maxDistance = 10000;
    this.minPitch = -85;
    this.maxPitch = 85;
    this.rotateSensitivity = 0.2;
    this.panSensitivity = 0.0018;
    this.zoomSensitivity = 0.0015;

    this.defaultFocus = {
      target: new pc.Vec3(0, 0, 0),
      distance: 80,
      yaw: 0,
      pitch: 45
    };

    this._forward = new pc.Vec3();
    this._right = new pc.Vec3();
    this._worldUp = new pc.Vec3(0, 1, 0);
    this._moveDelta = new pc.Vec3();
    this._panDelta = new pc.Vec3();

    this._bindEvents();
    this._applyCameraTransform();
  }

  _bindEvents() {
    this.canvas.setAttribute('tabindex', '0');
    this.canvas.addEventListener('contextmenu', (event) => {
      event.preventDefault();
    });

    this.canvas.addEventListener('pointerdown', () => {
      this.keyboardActive = true;
      this.canvas.focus();
    });

    document.addEventListener('pointerdown', (event) => {
      if (event.target !== this.canvas && !this.canvas.contains(event.target)) {
        this.keyboardActive = false;
      }
    });

    this.app.mouse.on(pc.EVENT_MOUSEDOWN, this._onMouseDown, this);
    this.app.mouse.on(pc.EVENT_MOUSEUP, this._onMouseUp, this);
    this.app.mouse.on(pc.EVENT_MOUSEMOVE, this._onMouseMove, this);
    this.app.mouse.on(pc.EVENT_MOUSEWHEEL, this._onMouseWheel, this);

    this.keyboardTarget.addEventListener('keydown', this._onKeyDown);
    this.keyboardTarget.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._clearTransientState);

    this.app.on('update', this._onUpdate, this);
  }

  _onMouseDown(event) {
    if (!this.enabled) {
      return;
    }

    const originalEvent = event.event;
    if (!originalEvent || originalEvent.target !== this.canvas) {
      return;
    }

    const wantsPan =
      event.button === pc.MOUSEBUTTON_MIDDLE ||
      event.button === pc.MOUSEBUTTON_RIGHT ||
      (event.button === pc.MOUSEBUTTON_LEFT && originalEvent.shiftKey);

    if (wantsPan) {
      this.dragMode = DRAG_PAN;
    } else if (event.button === pc.MOUSEBUTTON_LEFT) {
      this.dragMode = DRAG_ORBIT;
    }
  }

  _onMouseUp(event) {
    if (
      event.button === pc.MOUSEBUTTON_LEFT ||
      event.button === pc.MOUSEBUTTON_MIDDLE ||
      event.button === pc.MOUSEBUTTON_RIGHT
    ) {
      this.dragMode = DRAG_NONE;
    }
  }

  _onMouseMove(event) {
    if (!this.enabled || this.dragMode === DRAG_NONE) {
      return;
    }

    if (this.dragMode === DRAG_ORBIT) {
      this.yaw -= event.dx * this.rotateSensitivity;
      this.pitch = clamp(
        this.pitch - event.dy * this.rotateSensitivity,
        this.minPitch,
        this.maxPitch
      );
    } else if (this.dragMode === DRAG_PAN) {
      const panScale = Math.max(0.01, this.distance * this.panSensitivity);
      const right = this.camera.right.clone().mulScalar(-event.dx * panScale);
      const up = this.camera.up.clone().mulScalar(event.dy * panScale);

      this._panDelta.copy(right).add(up);
      this.target.add(this._panDelta);
    }

    this._applyCameraTransform();
  }

  _onMouseWheel(event) {
    if (!this.enabled) {
      return;
    }

    if (event.event) {
      event.event.preventDefault();
    }

    const adaptiveFactor = Math.max(1, this.distance * 0.1);
    const zoomScale = Math.exp(event.wheel * this.zoomSensitivity * adaptiveFactor);

    this.distance = clamp(this.distance * zoomScale, this.minDistance, this.maxDistance);
    this._applyCameraTransform();
  }

  _onKeyDown = (event) => {
    const relevant = [
      'KeyW',
      'KeyA',
      'KeyS',
      'KeyD',
      'KeyQ',
      'KeyE',
      'ShiftLeft',
      'ShiftRight',
      'AltLeft',
      'AltRight',
      'ControlLeft',
      'ControlRight'
    ];

    if (!relevant.includes(event.code)) {
      return;
    }

    if (!this.keyboardActive || isEditableElement(event.target)) {
      return;
    }

    this.keys.add(event.code);
    event.preventDefault();
  };

  _onKeyUp = (event) => {
    this.keys.delete(event.code);
  };

  _clearTransientState = () => {
    this.dragMode = DRAG_NONE;
    this.keys.clear();
    this.keyboardActive = false;
  };

  _onUpdate(dt) {
    if (!this.enabled || !this.keyboardActive) {
      return;
    }

    const hasMoveInput =
      this.keys.has('KeyW') ||
      this.keys.has('KeyA') ||
      this.keys.has('KeyS') ||
      this.keys.has('KeyD') ||
      this.keys.has('KeyQ') ||
      this.keys.has('KeyE');

    if (!hasMoveInput) {
      return;
    }

    this._moveDelta.set(0, 0, 0);

    this._forward.copy(this.camera.forward).normalize();
    this._right.copy(this.camera.right).normalize();

    if (this.keys.has('KeyW')) {
      this._moveDelta.add(this._forward);
    }
    if (this.keys.has('KeyS')) {
      this._moveDelta.sub(this._forward);
    }
    if (this.keys.has('KeyD')) {
      this._moveDelta.add(this._right);
    }
    if (this.keys.has('KeyA')) {
      this._moveDelta.sub(this._right);
    }
    if (this.keys.has('KeyE')) {
      this._moveDelta.add(this._worldUp);
    }
    if (this.keys.has('KeyQ')) {
      this._moveDelta.sub(this._worldUp);
    }

    if (this._moveDelta.lengthSq() === 0) {
      return;
    }

    this._moveDelta.normalize();

    let speed = Math.max(1, this.distance * 0.5);

    if (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) {
      speed *= 3;
    }

    if (
      this.keys.has('AltLeft') ||
      this.keys.has('AltRight') ||
      this.keys.has('ControlLeft') ||
      this.keys.has('ControlRight')
    ) {
      speed *= 0.25;
    }

    this._moveDelta.mulScalar(speed * dt);
    this.target.add(this._moveDelta);
    this._applyCameraTransform();
  }

  _applyCameraTransform() {
    const pitchRad = pc.math.DEG_TO_RAD * this.pitch;
    const yawRad = pc.math.DEG_TO_RAD * this.yaw;
    const cosPitch = Math.cos(pitchRad);
    const sinPitch = Math.sin(pitchRad);
    const cosYaw = Math.cos(yawRad);
    const sinYaw = Math.sin(yawRad);

    const position = new pc.Vec3(
      this.target.x + this.distance * cosPitch * sinYaw,
      this.target.y + this.distance * sinPitch,
      this.target.z + this.distance * cosPitch * cosYaw
    );

    this.camera.setPosition(position);
    this.camera.lookAt(this.target);
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) {
      this._clearTransientState();
    }
  }

  setDefaultFocus({ target, distance, yaw, pitch }) {
    if (target) {
      this.defaultFocus.target.copy(target);
    }
    if (typeof distance === 'number') {
      this.defaultFocus.distance = distance;
    }
    if (typeof yaw === 'number') {
      this.defaultFocus.yaw = yaw;
    }
    if (typeof pitch === 'number') {
      this.defaultFocus.pitch = pitch;
    }
  }

  focus(target, distance, options = {}) {
    this.target.copy(target);
    this.distance = clamp(distance, this.minDistance, this.maxDistance);

    if (typeof options.yaw === 'number') {
      this.yaw = options.yaw;
    }

    if (typeof options.pitch === 'number') {
      this.pitch = clamp(options.pitch, this.minPitch, this.maxPitch);
    }

    this._applyCameraTransform();
  }

  focusAabb(aabb, options = {}) {
    if (!aabb) {
      this.reset();
      return;
    }

    const center = aabb.center.clone();
    const radius = Math.max(aabb.halfExtents.length(), 1);
    const fov = this.camera.camera?.fov ?? 60;
    const fovRad = pc.math.DEG_TO_RAD * fov;
    const fittedDistance = radius / Math.tan(fovRad * 0.5);
    const distance = Math.max(options.minDistance ?? 80, fittedDistance * 1.35);

    this.focus(center, distance, {
      yaw: options.yaw ?? this.defaultFocus.yaw,
      pitch: options.pitch ?? this.defaultFocus.pitch
    });
  }

  reset() {
    this.focus(this.defaultFocus.target, this.defaultFocus.distance, {
      yaw: this.defaultFocus.yaw,
      pitch: this.defaultFocus.pitch
    });
  }

  getState() {
    return {
      target: this.target.clone(),
      distance: this.distance,
      yaw: this.yaw,
      pitch: this.pitch
    };
  }
}
