export class GsplatProjectionRenderer {
  constructor({
    projectionRegistry,
    sourceRegistry,
    runtimePool,
    activateProjection,
    deactivateProjection,
    logPrefix = '[GsplatProjectionRenderer]'
  } = {}) {
    this.projectionRegistry = projectionRegistry;
    this.sourceRegistry = sourceRegistry;
    this.runtimePool = runtimePool;
    this.activateProjection = activateProjection;
    this.deactivateProjection = deactivateProjection;
    this.logPrefix = logPrefix;
    this.activeProjectionIds = [];
    this.rendererState = new Map();
  }

  async syncActiveSet(activeProjectionIds = []) {
    const nextIds = Array.isArray(activeProjectionIds) ? activeProjectionIds : [];
    const previousIds = [...this.activeProjectionIds];
    const previousSet = new Set(previousIds);
    const nextSet = new Set(nextIds);

    for (const projectionId of previousIds) {
      if (!nextSet.has(projectionId)) {
        this.deactivate(projectionId);
      }
    }

    for (const projectionId of nextIds) {
      await this.activate(projectionId);
    }

    this.activeProjectionIds = nextIds.filter((projectionId) => previousSet.has(projectionId) || nextSet.has(projectionId));
    return this.getRendererState();
  }

  async activate(projectionId) {
    const config = this.projectionRegistry.get(projectionId);
    if (!config) {
      return false;
    }

    const source = this.sourceRegistry.get(config.sourceId);
    if (!source) {
      return false;
    }

    const entry = this.runtimePool.acquire(source, `projection:${projectionId}`);
    const videoElement = entry?.runtime?.getVideoElement?.() ?? null;
    console.log(`${this.logPrefix} activate`, {
      projectionId,
      sourceId: source.id
    });

    await this.activateProjection?.({
      projectionId,
      sourceId: source.id,
      objectId: config.objectId,
      config,
      source,
      runtime: entry?.runtime ?? null,
      videoElement
    });

    this.rendererState.set(projectionId, {
      active: true,
      bound: Boolean(videoElement),
      textureBound: Boolean(videoElement),
      textureUploading: true,
      shaderInstalled: true,
      error: null
    });
    return true;
  }

  deactivate(projectionId) {
    const config = this.projectionRegistry.get(projectionId);
    if (!config) {
      return false;
    }

    console.log(`${this.logPrefix} deactivate`, {
      projectionId
    });
    this.deactivateProjection?.({
      projectionId,
      objectId: config.objectId,
      sourceId: config.sourceId
    });
    this.runtimePool.release(config.sourceId, `projection:${projectionId}`);
    this.rendererState.set(projectionId, {
      active: false,
      bound: false,
      textureBound: false,
      textureUploading: false,
      shaderInstalled: false,
      error: null
    });
    return true;
  }

  getRendererState() {
    return Object.fromEntries(Array.from(this.rendererState.entries()));
  }

  destroy() {
    [...this.activeProjectionIds].forEach((projectionId) => {
      this.deactivate(projectionId);
    });
    this.activeProjectionIds = [];
    this.rendererState.clear();
  }
}
