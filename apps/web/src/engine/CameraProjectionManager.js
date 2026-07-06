import { GsplatMp4ProjectorAdapter } from './GsplatMp4ProjectorAdapter.js';

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
  return Boolean(
    instance?.enabled &&
    instance?.projector &&
    instance.mainCameraEntity &&
    instance.projectorEntity &&
    instance.gsplatEntity &&
    instance.videoElement
  );
}

export class CameraProjectionManager {
  constructor({
    app,
    getVideoElement,
    getGsplatEntity,
    getMainCameraEntity,
    getProjectorEntity,
    logPrefix = '[CameraProjectionManager]'
  } = {}) {
    this.app = app;
    this.getVideoElement = typeof getVideoElement === 'function' ? getVideoElement : () => null;
    this.getGsplatEntity = typeof getGsplatEntity === 'function' ? getGsplatEntity : () => null;
    this.getMainCameraEntity = typeof getMainCameraEntity === 'function' ? getMainCameraEntity : () => null;
    this.getProjectorEntity = typeof getProjectorEntity === 'function' ? getProjectorEntity : () => null;
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
      mode: 'quadOverlay',
      anchors: [],
      material: null,
      videoTexture: null,
      projector: null,
      videoRuntimeId: null,
      videoElement: null,
      gsplatEntity: null,
      mainCameraEntity: null,
      projectorEntity: null,
      opacity: 1,
      softEdge: 0,
      flipY: false,
      replaceMode: true,
      quadPlaneTolerance: 0.25,
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
    const nextSoftEdge = Number.isFinite(Number(projection.softEdge)) ? Number(projection.softEdge) : 0;
    const nextFlipY = Boolean(projection.flipY);
    const nextReplaceMode = projection.replaceMode ?? true;
    const nextQuadPlaneTolerance = Number.isFinite(Number(projection.quadPlaneTolerance))
      ? Number(projection.quadPlaneTolerance)
      : 0.25;
    const nextMode = projection.mode === 'quad'
      ? 'quad'
      : (projection.mode === 'cameraFrustum' ? 'cameraFrustum' : 'quadOverlay');
    const nextVideoElement = this.getVideoElement(cameraObjectId, projection) ?? null;
    const nextGsplatEntity = this.getGsplatEntity() ?? null;
    const nextMainCameraEntity = this.getMainCameraEntity() ?? null;
    const nextProjectorEntity = this.getProjectorEntity(cameraObjectId) ?? null;
    const previousVideoElement = instance.videoElement;
    const previousFlipY = instance.flipY;

    instance.cameraId = nextCameraId;
    instance.videoRuntimeId = nextCameraId;
    instance.mode = nextMode;
    instance.opacity = nextOpacity;
    instance.softEdge = nextSoftEdge;
    instance.replaceMode = nextReplaceMode;
    instance.quadPlaneTolerance = nextQuadPlaneTolerance;
    instance.gsplatEntity = nextGsplatEntity;
    instance.mainCameraEntity = nextMainCameraEntity;
    instance.projectorEntity = nextProjectorEntity;
    instance.lastUpdatedAt = Date.now();

    const anchorsChanged = !areAnchorListsEqual(instance.anchors, anchors);
    if (anchorsChanged) {
      instance.anchors = anchors;
    }

    if (!instance.projector) {
      instance.projector = new GsplatMp4ProjectorAdapter({
        app: this.app,
        gsplatEntity: nextGsplatEntity,
        mainCameraEntity: nextMainCameraEntity,
        projectorEntity: nextProjectorEntity,
        videoElement: nextVideoElement,
        mode: nextMode,
        opacity: nextOpacity,
        softEdge: nextSoftEdge,
        flipY: nextFlipY,
        quadPoints: anchors,
        quadPlaneTolerance: nextQuadPlaneTolerance,
        replaceMode: nextReplaceMode,
        enabledProjection: nextEnabled,
        logDebug: false
      });
      instance.projector.initialize();
    }

    instance.projector.patch({
      gsplatEntity: nextGsplatEntity,
      mainCameraEntity: nextMainCameraEntity,
      projectorEntity: nextProjectorEntity,
      videoElement: nextVideoElement,
      mode: nextMode,
      opacity: nextOpacity,
      softEdge: nextSoftEdge,
      flipY: nextFlipY,
      quadPoints: anchors,
      quadPlaneTolerance: nextQuadPlaneTolerance,
      replaceMode: nextReplaceMode,
      enabledProjection: nextEnabled
    });

    if (!nextEnabled || anchors.length !== 4 || !nextVideoElement || !nextGsplatEntity || !nextMainCameraEntity || !nextProjectorEntity) {
      this.disableProjection(cameraObjectId, {
        updateState: true,
        enabled: nextEnabled,
        anchors,
        cameraId: nextCameraId,
        opacity: nextOpacity,
        softEdge: nextSoftEdge,
        flipY: nextFlipY,
        replaceMode: nextReplaceMode,
        quadPlaneTolerance: nextQuadPlaneTolerance,
        videoElement: nextVideoElement
      });
      return instance;
    }

    const needsRebuild =
      anchorsChanged ||
      previousVideoElement !== nextVideoElement ||
      previousFlipY !== nextFlipY;

    if (needsRebuild) {
      console.log(`${this.logPrefix} apply projection ${cameraObjectId}`);
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

    instance.enabled = false;
    if (options.updateState) {
      instance.anchors = cloneAnchors(options.anchors ?? instance.anchors);
      instance.cameraId = options.cameraId ?? instance.cameraId;
      instance.opacity = Number.isFinite(Number(options.opacity)) ? Number(options.opacity) : instance.opacity;
      instance.softEdge = Number.isFinite(Number(options.softEdge)) ? Number(options.softEdge) : instance.softEdge;
      instance.flipY = typeof options.flipY === 'boolean' ? options.flipY : instance.flipY;
      instance.replaceMode = typeof options.replaceMode === 'boolean' ? options.replaceMode : instance.replaceMode;
      instance.quadPlaneTolerance = Number.isFinite(Number(options.quadPlaneTolerance))
        ? Number(options.quadPlaneTolerance)
        : instance.quadPlaneTolerance;
      instance.videoElement = options.videoElement ?? instance.videoElement;
    }
    instance.projector?.patch({
      enabledProjection: false,
      quadPoints: instance.anchors,
      opacity: instance.opacity,
      softEdge: instance.softEdge,
      flipY: instance.flipY,
      replaceMode: instance.replaceMode,
      quadPlaneTolerance: instance.quadPlaneTolerance
    });
    instance.lastUpdatedAt = Date.now();

    console.log(`${this.logPrefix} disable projection ${cameraObjectId}`);
    return true;
  }

  clearFourPoints(cameraObjectId) {
    const instance = this.get(cameraObjectId);
    if (!instance) {
      return false;
    }

    instance.enabled = false;
    instance.anchors = [];
    instance.material = null;
    instance.videoTexture = null;
    instance.videoElement = null;
    instance.projector?.patch({
      enabledProjection: false,
      quadPoints: []
    });
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

      instance.projector.patch({
        gsplatEntity: this.getGsplatEntity() ?? instance.gsplatEntity,
        mainCameraEntity: this.getMainCameraEntity() ?? instance.mainCameraEntity,
        projectorEntity: this.getProjectorEntity(instance.cameraObjectId) ?? instance.projectorEntity,
        videoElement: instance.videoElement,
        quadPoints: instance.anchors,
        enabledProjection: instance.enabled,
        mode: instance.mode,
        opacity: instance.opacity,
        softEdge: instance.softEdge,
        flipY: instance.flipY,
        replaceMode: instance.replaceMode,
        quadPlaneTolerance: instance.quadPlaneTolerance
      });
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

    instance.material = instance.projector.sceneMaterial ?? null;
    instance.videoTexture = instance.projector.videoTexture ?? null;
    return instance;
  }
}
