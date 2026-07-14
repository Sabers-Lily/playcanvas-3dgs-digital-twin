function cloneQuadPoints(points = []) {
  return Array.isArray(points)
    ? points.map((point, index) => ({
        ...(point ?? {}),
        index: point?.index ?? index,
        position: Array.isArray(point?.position) ? [...point.position] : [0, 0, 0]
      }))
    : [];
}

function normalizeProjectionConfig(config = {}) {
  return {
    id: String(config.id || ''),
    objectId: config.objectId ?? null,
    sourceId: config.sourceId ?? null,
    enabled: config.enabled ?? false,
    mode: 'quadOverlay',
    quadPoints: cloneQuadPoints(config.quadPoints),
    opacity: Number.isFinite(Number(config.opacity)) ? Number(config.opacity) : 1,
    softEdge: Number.isFinite(Number(config.softEdge)) ? Number(config.softEdge) : 0,
    flipY: Boolean(config.flipY),
    replaceMode: config.replaceMode ?? true,
    quadPlaneTolerance: Number.isFinite(Number(config.quadPlaneTolerance))
      ? Number(config.quadPlaneTolerance)
      : 0.25,
    projectorFov: Number.isFinite(Number(config.projectorFov)) ? Number(config.projectorFov) : 45,
    projectorAspect: Number.isFinite(Number(config.projectorAspect)) ? Number(config.projectorAspect) : 1.777,
    projectorNear: Number.isFinite(Number(config.projectorNear)) ? Number(config.projectorNear) : 0.1,
    projectorFar: Number.isFinite(Number(config.projectorFar)) ? Number(config.projectorFar) : 1000,
    quadEditing: Boolean(config.quadEditing),
    priority: Number.isFinite(Number(config.priority)) ? Number(config.priority) : 50,
    pinned: Boolean(config.pinned),
    tags: Array.isArray(config.tags) ? [...config.tags] : []
  };
}

export class ProjectionConfigRegistry {
  constructor({ logPrefix = '[ProjectionConfigRegistry]' } = {}) {
    this.logPrefix = logPrefix;
    this.configs = new Map();
  }

  create(config = {}) {
    const projection = normalizeProjectionConfig(config);
    if (!projection.id) {
      throw new Error('ProjectionConfigRegistry.create requires projection id');
    }

    this.configs.set(projection.id, projection);
    console.log(`${this.logPrefix} create`, {
      projectionId: projection.id,
      objectId: projection.objectId,
      sourceId: projection.sourceId
    });
    return projection;
  }

  upsert(config = {}) {
    if (!this.has(config.id)) {
      return this.create(config);
    }

    return this.update(config.id, config);
  }

  update(projectionId, patch = {}) {
    const current = this.get(projectionId);
    if (!current) {
      return this.create({
        id: projectionId,
        ...patch
      });
    }

    const next = normalizeProjectionConfig({
      ...current,
      ...patch
    });
    this.configs.set(projectionId, next);
    return next;
  }

  remove(projectionId) {
    return this.configs.delete(projectionId);
  }

  get(projectionId) {
    const config = this.configs.get(projectionId);
    return config ? normalizeProjectionConfig(config) : null;
  }

  getAll() {
    return Array.from(this.configs.values()).map((config) => normalizeProjectionConfig(config));
  }

  has(projectionId) {
    return this.configs.has(projectionId);
  }
}
