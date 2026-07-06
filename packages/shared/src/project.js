const PROJECT_VERSION = 1;

function cloneJsonValue(value, fallback) {
  try {
    return JSON.parse(JSON.stringify(value ?? fallback));
  } catch (_error) {
    return fallback;
  }
}

function normalizeVector3(value, fallback = [0, 0, 0]) {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  return [0, 1, 2].map((index) => {
    const next = Number.parseFloat(value[index]);
    return Number.isFinite(next) ? next : fallback[index];
  });
}

function normalizeAsset(asset = {}) {
  return {
    id: asset.id,
    type: asset.type || 'other',
    name: asset.name || asset.fileName || asset.id || 'asset',
    fileName: asset.fileName || asset.name || asset.id || 'asset',
    url: typeof asset.url === 'string' ? asset.url : undefined,
    relativePath: typeof asset.relativePath === 'string' ? asset.relativePath : undefined,
    sizeBytes: Number.isFinite(Number(asset.sizeBytes)) ? Number(asset.sizeBytes) : undefined,
    status: typeof asset.status === 'string' ? asset.status : undefined,
    sourceAssetId: asset.sourceAssetId ?? null,
    runtimeType: asset.runtimeType ?? null
  };
}

function normalizeSceneObject(object = {}) {
  return {
    id: object.id,
    type: object.type || 'custom-object',
    displayName: object.displayName || object.name || object.id || 'Untitled Object',
    visible: typeof object.visible === 'boolean' ? object.visible : true,
    transform: {
      position: normalizeVector3(object.transform?.position, [0, 0, 0]),
      rotation: normalizeVector3(object.transform?.rotation, [0, 0, 0]),
      scale: normalizeVector3(object.transform?.scale, [1, 1, 1])
    },
    metadata: cloneJsonValue(object.metadata, {})
  };
}

function normalizeProjection(projection = {}) {
  return {
    id: projection.id,
    cameraObjectId: projection.cameraObjectId,
    cameraId: projection.cameraId ?? null,
    enabled: Boolean(projection.enabled),
    opacity: Number.isFinite(Number(projection.opacity)) ? Number(projection.opacity) : 1,
    anchors: Array.isArray(projection.anchors)
      ? projection.anchors.slice(0, 4).map((anchor) => normalizeVector3(anchor, [0, 0, 0]))
      : []
  };
}

function normalizeCameraConfig(camera = {}) {
  return {
    id: camera.id,
    name: camera.name || camera.id || 'camera',
    sourceType: camera.sourceType || 'none',
    cameraId: camera.cameraId ?? null,
    hlsUrl: camera.hlsUrl ?? null,
    enabled: Boolean(camera.enabled)
  };
}

export function createProjectFile(input = {}) {
  const now = new Date().toISOString();

  return {
    version: PROJECT_VERSION,
    projectId: input.projectId,
    name: input.name || 'Untitled Project',
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
    app: {
      editorVersion: input.app?.editorVersion ?? null
    },
    view: {
      target: normalizeVector3(input.view?.target, [0, 0, 0]),
      distance: Number.isFinite(Number(input.view?.distance)) ? Number(input.view.distance) : 80,
      yaw: Number.isFinite(Number(input.view?.yaw)) ? Number(input.view.yaw) : 0,
      pitch: Number.isFinite(Number(input.view?.pitch)) ? Number(input.view.pitch) : 45
    },
    assets: Array.isArray(input.assets) ? input.assets.map(normalizeAsset) : [],
    scene: {
      objects: Array.isArray(input.scene?.objects) ? input.scene.objects.map(normalizeSceneObject) : [],
      selectedObjectId: input.scene?.selectedObjectId ?? null
    },
    cameras: Array.isArray(input.cameras) ? input.cameras.map(normalizeCameraConfig) : [],
    projection: {
      fourPointProjections: Array.isArray(input.projection?.fourPointProjections)
        ? input.projection.fourPointProjections.map(normalizeProjection)
        : []
    }
  };
}

export function validateProjectFile(project) {
  if (!project || typeof project !== 'object' || Array.isArray(project)) {
    const error = new Error('Project file is invalid');
    error.code = 'PROJECT_FILE_INVALID';
    throw error;
  }

  if (project.version !== PROJECT_VERSION) {
    const error = new Error('Project version is not supported');
    error.code = 'PROJECT_VERSION_UNSUPPORTED';
    throw error;
  }

  if (!project.projectId || !project.name) {
    const error = new Error('Project file is missing required fields');
    error.code = 'PROJECT_FILE_INVALID';
    throw error;
  }

  if (!Array.isArray(project.assets) || !Array.isArray(project.scene?.objects)) {
    const error = new Error('Project file is missing assets or scene objects');
    error.code = 'PROJECT_FILE_INVALID';
    throw error;
  }

  return createProjectFile(project);
}

export function maskRtspUrl(value) {
  if (typeof value !== 'string' || !value.startsWith('rtsp://')) {
    return value ?? null;
  }

  return value.replace(/\/\/([^:/@]+):([^@]+)@/u, '//$1:***@');
}

export { PROJECT_VERSION };
