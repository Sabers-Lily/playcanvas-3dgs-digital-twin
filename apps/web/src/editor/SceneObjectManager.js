const TYPE_ORDER = {
  camera: 1,
  debug: 2,
  gsplat: 3,
  'bim-proxy': 4,
  marker: 5,
  empty: 6,
  robot: 7,
  robotDog: 8,
  cameraDevice: 9,
  device: 10,
  hotspot: 11,
  annotation: 12,
  routePoint: 13,
  model: 14,
  glb: 15
};

const TYPE_LABELS = {
  gsplat: '高斯地图',
  'bim-proxy': 'BIM模型',
  marker: 'Marker',
  empty: '空对象',
  robot: '机器狗',
  robotDog: '机器狗',
  cameraDevice: '摄像头',
  device: '设备',
  hotspot: '热点',
  annotation: '标注',
  routePoint: '路线点',
  camera: 'Camera',
  debug: 'Debug',
  model: '模型',
  glb: '模型'
};

let emitCount = 0;
let lastEmitReport = typeof performance !== 'undefined' ? performance.now() : Date.now();

function shouldLogPerf() {
  return typeof window !== 'undefined' && Boolean(window.__MINI_EDITOR_PERF__);
}

function cloneTransform(transform) {
  return transform
    ? {
        position: [...(transform.position ?? [0, 0, 0])],
        rotation: [...(transform.rotation ?? [0, 0, 0])],
        scale: [...(transform.scale ?? [1, 1, 1])]
      }
    : undefined;
}

function clonePatrolMetadata(patrol) {
  if (!patrol) {
    return undefined;
  }

  return {
    ...patrol,
    routePoints: Array.isArray(patrol.routePoints)
      ? patrol.routePoints.map((point) => ({
          ...point,
          position: Array.isArray(point.position) ? [...point.position] : [0, 0, 0]
        }))
      : []
  };
}

function cloneMetadata(metadata) {
  if (!metadata) {
    return {};
  }

  return {
    ...metadata,
    videoProjection: metadata.videoProjection
      ? { ...metadata.videoProjection }
      : undefined,
    patrol: clonePatrolMetadata(metadata.patrol)
  };
}

function cloneObject(object) {
  return {
    ...object,
    metadata: cloneMetadata(object.metadata),
    transform: cloneTransform(object.transform)
  };
}

function toSceneObjectSnapshot(object) {
  return {
    id: object.id,
    name: object.name,
    type: object.type,
    typeLabel: object.typeLabel,
    displayName: object.displayName,
    visible: object.visible,
    status: object.status,
    canHide: object.canHide,
    protected: object.protected,
    transform: cloneTransform(object.transform),
    metadata: {
      url: object.metadata?.url,
      sourceName: object.metadata?.sourceName,
      source: object.metadata?.source,
      position: object.metadata?.position,
      assetId: object.metadata?.assetId,
      sourceAssetId: object.metadata?.sourceAssetId,
      assetType: object.metadata?.assetType,
      runtimeType: object.metadata?.runtimeType,
      size: object.metadata?.size,
      businessType: object.metadata?.businessType,
      videoProjection: object.metadata?.videoProjection
        ? { ...object.metadata.videoProjection }
        : undefined,
      patrol: clonePatrolMetadata(object.metadata?.patrol)
    }
  };
}

function sortObjects(a, b) {
  const orderA = TYPE_ORDER[a.type] ?? 999;
  const orderB = TYPE_ORDER[b.type] ?? 999;
  if (orderA !== orderB) {
    return orderA - orderB;
  }

  return (a.name ?? '').localeCompare(b.name ?? '');
}

export class SceneObjectManager {
  constructor() {
    this.objects = new Map();
    this.listeners = new Set();
  }

  addObject(object) {
    if (!object?.id) {
      return null;
    }

    const normalized = {
      asset: null,
      displayName: object.name,
      entity: null,
      visible: true,
      status: 'idle',
      metadata: {},
      transform: object.transform,
      typeLabel: TYPE_LABELS[object.type] ?? object.type,
      canHide: true,
      protected: false,
      ...object
    };

    normalized.displayName = normalized.displayName ?? normalized.name ?? normalized.entity?.name ?? normalized.id;
    normalized.name = normalized.name ?? normalized.displayName;
    normalized.typeLabel = normalized.typeLabel ?? TYPE_LABELS[normalized.type] ?? normalized.type;
    normalized.metadata = cloneMetadata(normalized.metadata);

    if (normalized.entity) {
      normalized.visible = normalized.entity.enabled;
    }

    this.objects.set(normalized.id, normalized);
    this.emitChange();
    return cloneObject(normalized);
  }

  updateObject(id, patch) {
    const current = this.objects.get(id);
    if (!current) {
      return null;
    }

    const next = {
      ...current,
      ...patch,
      metadata: cloneMetadata({
        ...(current.metadata ?? {}),
        ...(patch.metadata ?? {})
      })
    };

    next.displayName = next.displayName ?? next.name ?? current.displayName;
    next.name = next.name ?? next.displayName ?? current.name;
    next.typeLabel = next.typeLabel ?? TYPE_LABELS[next.type] ?? next.type;

    if (next.entity) {
      next.visible = next.entity.enabled;
    }

    this.objects.set(id, next);
    this.emitChange();
    return cloneObject(next);
  }

  removeObject(id) {
    const current = this.objects.get(id);
    if (!current) {
      return false;
    }

    if (current.protected) {
      return false;
    }

    if (current.entity && !current.entity.destroyed) {
      current.entity.destroy();
    }

    this.objects.delete(id);
    this.emitChange();
    return true;
  }

  getObject(id) {
    const object = this.objects.get(id);
    return object ? cloneObject(object) : null;
  }

  getObjectSnapshot(id) {
    const object = this.objects.get(id);
    return object ? toSceneObjectSnapshot(object) : null;
  }

  getObjects() {
    return Array.from(this.objects.values())
      .map(cloneObject)
      .sort(sortObjects);
  }

  getObjectSnapshots() {
    return Array.from(this.objects.values())
      .map(toSceneObjectSnapshot)
      .sort(sortObjects);
  }

  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emitChange() {
    if (shouldLogPerf()) {
      emitCount += 1;

      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (now - lastEmitReport > 1000) {
        console.log('[Perf] SceneObjectManager emitChange per second:', emitCount);
        emitCount = 0;
        lastEmitReport = now;
      }
    }

    const snapshot = this.getObjectSnapshots();
    this.listeners.forEach((listener) => listener(snapshot));
  }

  subscribe(listener) {
    return this.onChange(listener);
  }

  emit() {
    this.emitChange();
  }

  get(id) {
    return this.getObject(id);
  }

  getAll() {
    return this.getObjectSnapshots();
  }

  update(id, patch) {
    return this.updateObject(id, patch);
  }

  setEntity(id, entity) {
    return this.updateObject(id, { entity });
  }

  setStatus(id, status) {
    return this.updateObject(id, { status });
  }

  setVisible(id, visible) {
    const current = this.objects.get(id);
    if (!current) {
      return false;
    }

    const nextVisible = Boolean(visible);
    if (current.entity) {
      current.entity.enabled = nextVisible;
    }

    current.visible = nextVisible;
    this.objects.set(id, current);
    this.emitChange();
    return true;
  }

  setMetadata(id, metadata) {
    return this.updateObject(id, { metadata });
  }

  setTransform(id, transform) {
    return this.updateObject(id, {
      transform: cloneTransform(transform)
    });
  }

  toggleVisible(id) {
    const current = this.objects.get(id);
    if (!current) {
      return false;
    }

    return this.setVisible(id, !current.visible);
  }
}
