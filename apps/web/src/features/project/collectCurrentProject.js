import { createProjectFile, maskRtspUrl } from '../../../../../packages/shared/src/project.js';

function sanitizeAssetType(type) {
  const normalizedType = String(type || '').toLowerCase();
  if (['sog', 'gsplat', 'glb', 'gltf', 'image', 'video', 'obj', 'ply'].includes(normalizedType)) {
    return normalizedType === 'gsplat' ? 'sog' : normalizedType;
  }

  return 'other';
}

function cloneJsonValue(value, fallback) {
  try {
    return JSON.parse(JSON.stringify(value ?? fallback));
  } catch (_error) {
    return fallback;
  }
}

function toProjectAsset(asset) {
  return {
    id: asset.id,
    type: sanitizeAssetType(asset.type ?? asset.kind),
    name: asset.sourceName || asset.label || asset.id,
    fileName: asset.sourceName || asset.label || asset.id,
    url: asset.url,
    relativePath: asset.storagePath ?? null,
    sizeBytes: asset.size ?? null,
    status: asset.status ?? null,
    sourceAssetId: asset.sourceAssetId ?? null,
    runtimeType: asset.runtimeType ?? null
  };
}

function sanitizeObjectMetadata(metadata = {}) {
  const nextMetadata = cloneJsonValue(metadata, {});

  if (typeof nextMetadata.rtspUrl === 'string') {
    nextMetadata.rtspUrl = maskRtspUrl(nextMetadata.rtspUrl);
  }

  if (typeof nextMetadata.streamUrl === 'string' && nextMetadata.streamUrl.startsWith('rtsp://')) {
    nextMetadata.streamUrl = maskRtspUrl(nextMetadata.streamUrl);
  }

  if (nextMetadata.videoProjection && typeof nextMetadata.videoProjection === 'object') {
    nextMetadata.videoProjection = {
      ...nextMetadata.videoProjection,
      streamUrl: typeof nextMetadata.videoProjection.streamUrl === 'string' && nextMetadata.videoProjection.streamUrl.startsWith('rtsp://')
        ? maskRtspUrl(nextMetadata.videoProjection.streamUrl)
        : nextMetadata.videoProjection.streamUrl
    };
  }

  return nextMetadata;
}

function toProjectSceneObject(object) {
  return {
    id: object.id,
    type: object.type,
    displayName: object.displayName || object.name || object.id,
    visible: object.visible ?? true,
    transform: cloneJsonValue(object.transform, {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1]
    }),
    metadata: sanitizeObjectMetadata(object.metadata)
  };
}

function collectCameraConfigs(objects = []) {
  return objects
    .filter((object) => object.type === 'cameraDevice')
    .map((object) => {
      const projection = object.metadata?.videoProjection ?? {};

      return {
        id: object.id,
        name: object.displayName || object.name || object.id,
        sourceType: projection.sourceType === 'cameraStream' ? 'backend-camera-stream' : (projection.sourceType || 'none'),
        cameraId: projection.cameraId ?? null,
        hlsUrl: projection.streamUrl ?? projection.videoUrl ?? null,
        enabled: Boolean(projection.enabled)
      };
    });
}

function collectProjectionConfigs(objects = []) {
  return objects
    .filter((object) => object.type === 'cameraDevice')
    .map((object) => {
      const projection = object.metadata?.videoProjection ?? {};
      const quadPoints = Array.isArray(projection.quadPoints) ? projection.quadPoints : [];

      if (quadPoints.length !== 4) {
        return null;
      }

      return {
        id: projection.id ?? `${object.id}_quad_projection`,
        cameraObjectId: object.id,
        cameraId: projection.cameraId ?? null,
        enabled: Boolean(projection.enabled),
        opacity: projection.opacity ?? 1,
        anchors: quadPoints.map((point) => Array.isArray(point.position) ? [...point.position] : [0, 0, 0])
      };
    })
    .filter(Boolean);
}

export function collectCurrentProject({
  snapshot,
  runtimeSnapshot,
  projectId,
  projectName,
  createdAt
}) {
  const objects = Array.isArray(snapshot?.objects) ? snapshot.objects.map(toProjectSceneObject) : [];
  const assets = Array.isArray(snapshot?.assets) ? snapshot.assets.map(toProjectAsset) : [];
  const cameraView = runtimeSnapshot?.cameraView ?? {
    target: [0, 0, 0],
    distance: 80,
    yaw: 0,
    pitch: 45
  };

  return createProjectFile({
    projectId,
    name: projectName,
    createdAt,
    updatedAt: new Date().toISOString(),
    app: {
      editorVersion: '0.1.0'
    },
    view: cameraView,
    assets,
    scene: {
      objects,
      selectedObjectId: snapshot?.selectedId ?? null
    },
    cameras: collectCameraConfigs(objects),
    projection: {
      fourPointProjections: collectProjectionConfigs(objects)
    }
  });
}
