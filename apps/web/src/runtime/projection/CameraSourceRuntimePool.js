import { CameraVideoRuntime } from '../../engine/CameraVideoRuntime.js';

function normalizeUrl(url = '') {
  return typeof url === 'string' ? url.trim() : '';
}

export function createCameraSourceKey(sourceConfig = {}) {
  const normalizedSourceId = normalizeUrl(sourceConfig.id || '');
  const normalizedStreamUrl = normalizeUrl(sourceConfig.streamUrl);
  const normalizedVideoUrl = normalizeUrl(sourceConfig.videoUrl);

  if (normalizedStreamUrl) {
    return `camera-source:${normalizedSourceId}:stream-url:${normalizedStreamUrl}`;
  }

  if (sourceConfig.cameraId) {
    return `camera-source:${normalizedSourceId}:camera-id:${sourceConfig.cameraId}`;
  }

  return `camera-source:${normalizedSourceId}:video-url:${normalizedVideoUrl}`;
}

function resolveSourceUrl(sourceConfig = {}) {
  return normalizeUrl(sourceConfig.streamUrl || sourceConfig.videoUrl || '');
}

function shouldLoopSource(sourceConfig = {}) {
  return sourceConfig.type !== 'cameraStream';
}

function createConsumerSet(consumers = []) {
  return new Set(Array.isArray(consumers) ? consumers : []);
}

export class CameraSourceRuntimePool {
  constructor({
    RuntimeClass = CameraVideoRuntime,
    logPrefix = '[CameraSourceRuntimePool]'
  } = {}) {
    this.RuntimeClass = RuntimeClass;
    this.logPrefix = logPrefix;
    this.entriesBySourceId = new Map();
    this.entriesBySourceKey = new Map();
  }

  acquire(sourceConfig = {}, consumerId = null) {
    const sourceId = String(sourceConfig.id || '');
    if (!sourceId) {
      throw new Error('CameraSourceRuntimePool.acquire requires source id');
    }

    const sourceKey = createCameraSourceKey(sourceConfig);
    const resolvedUrl = resolveSourceUrl(sourceConfig);
    let entry = this.entriesBySourceId.get(sourceId) ?? null;

    if (!entry) {
      const reusedEntry = this.entriesBySourceKey.get(sourceKey) ?? null;
      if (reusedEntry) {
        entry = reusedEntry;
        entry.sourceIds.add(sourceId);
        this.entriesBySourceId.set(sourceId, entry);
      }
    }

    if (!entry) {
      const runtime = new this.RuntimeClass({
        runtimeId: sourceKey
      });
      entry = {
        sourceIds: new Set([sourceId]),
        sourceKey,
        runtime,
        refCount: 0,
        consumers: new Set(),
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
        lastResolvedUrl: ''
      };
      this.entriesBySourceId.set(sourceId, entry);
      this.entriesBySourceKey.set(sourceKey, entry);
      console.log(`${this.logPrefix} create`, {
        sourceId,
        sourceKey
      });
    }

    if (consumerId) {
      entry.consumers.add(consumerId);
    }
    if (entry.sourceKey !== sourceKey) {
      this.entriesBySourceKey.delete(entry.sourceKey);
      entry.sourceKey = sourceKey;
      this.entriesBySourceKey.set(sourceKey, entry);
    }
    entry.refCount = entry.consumers.size;
    entry.lastUsedAt = Date.now();

    if (resolvedUrl && resolvedUrl !== entry.lastResolvedUrl) {
      entry.lastResolvedUrl = resolvedUrl;
      entry.runtime.load(resolvedUrl, {
        loop: shouldLoopSource(sourceConfig)
      }).catch((error) => {
        console.warn(`${this.logPrefix} runtime load failed:`, {
          sourceId,
          sourceKey,
          resolvedUrl,
          error
        });
      });
    } else if (resolvedUrl) {
      entry.runtime.play?.();
    }

    console.log(`${this.logPrefix} reuse`, {
      sourceId,
      sourceKey,
      refCount: entry.refCount
    });
    return entry;
  }

  release(sourceId, consumerId = null) {
    const entry = this.entriesBySourceId.get(sourceId) ?? null;
    if (!entry) {
      return false;
    }

    if (consumerId) {
      entry.consumers.delete(consumerId);
    }
    entry.refCount = entry.consumers.size;
    entry.lastUsedAt = Date.now();
    return true;
  }

  get(sourceId) {
    return this.entriesBySourceId.get(sourceId) ?? null;
  }

  getRuntime(sourceId) {
    return this.get(sourceId)?.runtime ?? null;
  }

  getBySourceKey(sourceKey) {
    return this.entriesBySourceKey.get(sourceKey) ?? null;
  }

  getState(sourceId) {
    const entry = this.get(sourceId);
    if (!entry) {
      return null;
    }

    return {
      ...entry.runtime.getState(),
      sourceKey: entry.sourceKey,
      refCount: entry.refCount,
      consumers: Array.from(entry.consumers)
    };
  }

  getVideoElement(sourceId) {
    return this.getRuntime(sourceId)?.getVideoElement?.() ?? null;
  }

  getEntries() {
    return Array.from(new Set(this.entriesBySourceId.values()));
  }

  update() {
    let changed = false;
    this.getEntries().forEach((entry) => {
      if (entry.runtime.update()) {
        changed = true;
      }
    });
    return changed;
  }

  disposeSource(sourceId) {
    const entry = this.entriesBySourceId.get(sourceId) ?? null;
    if (!entry) {
      return false;
    }

    entry.sourceIds.forEach((id) => {
      this.entriesBySourceId.delete(id);
    });
    this.entriesBySourceKey.delete(entry.sourceKey);
    entry.runtime.destroy();
    return true;
  }

  disposeAll() {
    this.getEntries().forEach((entry) => {
      entry.sourceIds.forEach((id) => {
        this.entriesBySourceId.delete(id);
      });
      this.entriesBySourceKey.delete(entry.sourceKey);
      entry.runtime.destroy();
    });
  }
}
