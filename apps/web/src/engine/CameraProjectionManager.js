import { FourPointVideoProjector } from './FourPointVideoProjector.js';

function cloneAnchors(anchors = []) {
  return Array.isArray(anchors)
    ? anchors.map((anchor, index) => ({
        ...(anchor ?? {}),
        index: anchor?.index ?? index,
        position: Array.isArray(anchor?.position) ? [...anchor.position] : [0, 0, 0]
      }))
    : [];
}

function areAnchorListsEqual(left = [], right = []) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((anchor, index) => {
    const leftPosition = Array.isArray(anchor?.position) ? anchor.position : [0, 0, 0];
    const rightPosition = Array.isArray(right[index]?.position) ? right[index].position : [0, 0, 0];
    return leftPosition.length === rightPosition.length
      && leftPosition.every((value, valueIndex) => Number(value) === Number(rightPosition[valueIndex]));
  });
}

function isProjectionRenderable(instance) {
  return Boolean(instance?.enabled && instance.videoElement && instance.anchors.length === 4);
}

export class CameraProjectionManager {
  constructor({ app, getVideoElement, logPrefix = '[CameraProjectionManager]' } = {}) {
    this.app = app;
    this.getVideoElement = typeof getVideoElement === 'function' ? getVideoElement : () => null;
    this.logPrefix = logPrefix;
    this.instances = new Map();
  }

  get(cameraObjectId) {
    return this.instances.get(cameraObjectId) ?? null;
  }

  getOrCreate(cameraObjectId) {
    const existing = this.instances.get(cameraObjectId);
    if (existing) {
      return existing;
    }

    const instance = {
      cameraObjectId,
      cameraId: null,
      enabled: false,
      mode: 'four-point',
      anchors: [],
      entity: null,
      meshInstance: null,
      material: null,
      videoTexture: null,
      projector: null,
      videoRuntimeId: null,
      videoElement: null,
      opacity: 1,
      flipY: false,
      lastUpdatedAt: Date.now(),
      hasLoggedTextureUpdate: false
    };

    this.instances.set(cameraObjectId, instance);
    console.log(`${this.logPrefix} create instance ${cameraObjectId}`);
    return instance;
  }

  syncProjection(cameraObjectId, projection = {}) {
    const instance = this.getOrCreate(cameraObjectId);
    const anchors = cloneAnchors(projection.quadPoints);
    const nextEnabled = Boolean(projection.enabled);
    const nextCameraId = projection.cameraId ?? null;
    const nextOpacity = Number.isFinite(Number(projection.opacity)) ? Number(projection.opacity) : 1;
    const nextFlipY = Boolean(projection.flipY);
    const nextVideoElement = this.getVideoElement(cameraObjectId, projection) ?? null;
    const previousVideoElement = instance.videoElement;
    const previousFlipY = instance.flipY;

    instance.cameraId = nextCameraId;
    instance.videoRuntimeId = nextCameraId;
    instance.mode = projection.mode === 'quad' ? 'four-point' : 'four-point';
    instance.opacity = nextOpacity;
    instance.lastUpdatedAt = Date.now();

    const anchorsChanged = !areAnchorListsEqual(instance.anchors, anchors);
    if (anchorsChanged) {
      instance.anchors = anchors;
    }

    if (!nextEnabled || anchors.length !== 4 || !nextVideoElement) {
      this.disableProjection(cameraObjectId, {
        updateState: true,
        enabled: nextEnabled,
        anchors,
        cameraId: nextCameraId,
        opacity: nextOpacity,
        flipY: nextFlipY,
        videoElement: nextVideoElement
      });
      return instance;
    }

    const needsRebuild =
      !instance.projector ||
      !instance.entity ||
      anchorsChanged ||
      previousVideoElement !== nextVideoElement ||
      previousFlipY !== nextFlipY;

    if (!instance.projector) {
      instance.projector = new FourPointVideoProjector({
        app: this.app,
        logPrefix: `[FourPointVideoProjector:${cameraObjectId}]`
      });
    }

    if (needsRebuild) {
      const applied = instance.projector.apply({
        cameraId: cameraObjectId,
        anchors,
        videoElement: nextVideoElement,
        opacity: nextOpacity,
        flipY: nextFlipY
      });
      if (!applied) {
        instance.enabled = false;
        this.syncInstanceHandles(cameraObjectId);
        console.warn(`${this.logPrefix} apply projection failed ${cameraObjectId}`);
        return instance;
      }

      console.log(`${this.logPrefix} apply projection ${cameraObjectId}`);
    } else {
      instance.entity.enabled = true;
      instance.projector.setOpacity(nextOpacity);
    }

    instance.enabled = true;
    instance.anchors = anchors;
    instance.flipY = nextFlipY;
    instance.videoElement = nextVideoElement;
    this.syncInstanceHandles(cameraObjectId);
    return instance;
  }

  disableProjection(cameraObjectId, options = {}) {
    const instance = this.get(cameraObjectId);
    if (!instance) {
      return false;
    }

    if (instance.entity) {
      instance.entity.enabled = false;
    }

    instance.enabled = false;
    if (options.updateState) {
      instance.anchors = cloneAnchors(options.anchors ?? instance.anchors);
      instance.cameraId = options.cameraId ?? instance.cameraId;
      instance.opacity = Number.isFinite(Number(options.opacity)) ? Number(options.opacity) : instance.opacity;
      instance.flipY = typeof options.flipY === 'boolean' ? options.flipY : instance.flipY;
      instance.videoElement = options.videoElement ?? instance.videoElement;
    }
    instance.lastUpdatedAt = Date.now();

    console.log(`${this.logPrefix} disable projection ${cameraObjectId}`);
    return true;
  }

  clearFourPoints(cameraObjectId) {
    const instance = this.get(cameraObjectId);
    if (!instance) {
      return false;
    }

    if (instance.projector) {
      instance.projector.clear();
    }

    instance.enabled = false;
    instance.anchors = [];
    instance.entity = null;
    instance.meshInstance = null;
    instance.material = null;
    instance.videoTexture = null;
    instance.videoElement = null;
    instance.hasLoggedTextureUpdate = false;
    instance.lastUpdatedAt = Date.now();

    console.log(`${this.logPrefix} clear points ${cameraObjectId}`);
    return true;
  }

  disposeProjection(cameraObjectId) {
    const instance = this.get(cameraObjectId);
    if (!instance) {
      return false;
    }

    instance.projector?.dispose();
    this.instances.delete(cameraObjectId);
    console.log(`${this.logPrefix} dispose projection ${cameraObjectId}`);
    return true;
  }

  disposeAll() {
    Array.from(this.instances.keys()).forEach((cameraObjectId) => {
      this.disposeProjection(cameraObjectId);
    });
  }

  update() {
    this.instances.forEach((instance) => {
      if (!isProjectionRenderable(instance) || !instance.projector) {
        return;
      }

      instance.projector.update();
      this.syncInstanceHandles(instance.cameraObjectId);

      if (!instance.hasLoggedTextureUpdate && instance.projector._hasLoggedTextureUpload) {
        instance.hasLoggedTextureUpdate = true;
        console.log(`${this.logPrefix} update texture ${instance.cameraObjectId}`);
      }
    });
  }

  syncInstanceHandles(cameraObjectId) {
    const instance = this.get(cameraObjectId);
    if (!instance?.projector) {
      return null;
    }

    instance.entity = instance.projector.entity ?? null;
    instance.meshInstance = instance.projector.meshInstance ?? null;
    instance.material = instance.projector.material ?? null;
    instance.videoTexture = instance.projector.videoTexture ?? null;
    return instance;
  }
}
