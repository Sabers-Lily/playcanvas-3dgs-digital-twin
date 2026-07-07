function cloneMetadata(metadata = {}) {
  return metadata && typeof metadata === 'object'
    ? { ...metadata }
    : {};
}

function normalizeSourceConfig(config = {}) {
  return {
    id: String(config.id || ''),
    type: config.type || 'cameraStream',
    cameraId: config.cameraId ?? 'camera1',
    streamUrl: config.streamUrl ?? '',
    videoUrl: config.videoUrl ?? '',
    enabled: config.enabled ?? true,
    metadata: cloneMetadata(config.metadata)
  };
}

export class CameraSourceRegistry {
  constructor({ logPrefix = '[CameraSourceRegistry]' } = {}) {
    this.logPrefix = logPrefix;
    this.sources = new Map();
  }

  create(config = {}) {
    const source = normalizeSourceConfig(config);
    if (!source.id) {
      throw new Error('CameraSourceRegistry.create requires source id');
    }

    this.sources.set(source.id, source);
    console.log(`${this.logPrefix} create`, {
      sourceId: source.id,
      type: source.type,
      cameraId: source.cameraId
    });
    return source;
  }

  upsert(config = {}) {
    if (!this.has(config.id)) {
      return this.create(config);
    }

    return this.update(config.id, config);
  }

  update(sourceId, patch = {}) {
    const current = this.get(sourceId);
    if (!current) {
      return this.create({
        id: sourceId,
        ...patch
      });
    }

    const next = normalizeSourceConfig({
      ...current,
      ...patch,
      metadata: {
        ...current.metadata,
        ...(patch.metadata ?? {})
      }
    });
    this.sources.set(sourceId, next);
    return next;
  }

  remove(sourceId) {
    return this.sources.delete(sourceId);
  }

  get(sourceId) {
    const source = this.sources.get(sourceId);
    return source ? normalizeSourceConfig(source) : null;
  }

  getAll() {
    return Array.from(this.sources.values()).map((source) => normalizeSourceConfig(source));
  }

  has(sourceId) {
    return this.sources.has(sourceId);
  }
}
