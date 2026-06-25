import { SYNCABLE_OBJECT_TYPES, createDefaultTransform } from '../../../../packages/shared/src/scene.js';

const syncableObjectTypes = new Set(SYNCABLE_OBJECT_TYPES);

export function isSyncableSceneObject(object) {
  return Boolean(object && syncableObjectTypes.has(object.type));
}

function normalizeVector3(value, fallback) {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  return [0, 1, 2].map((index) => {
    const next = Number.parseFloat(value[index]);
    return Number.isFinite(next) ? next : fallback[index];
  });
}

export function normalizeTransform(transform = {}) {
  const fallback = createDefaultTransform();

  return {
    position: normalizeVector3(transform.position, fallback.position),
    rotation: normalizeVector3(transform.rotation, fallback.rotation),
    scale: normalizeVector3(transform.scale, fallback.scale)
  };
}

export function sanitizeMetadata(metadata = {}) {
  try {
    return JSON.parse(JSON.stringify(metadata ?? {}));
  } catch (_error) {
    return {};
  }
}

export function sceneObjectToApiPayload(object) {
  return {
    id: object.id,
    type: object.type,
    displayName: object.displayName || object.name || 'Untitled Object',
    visible: object.visible ?? true,
    transform: normalizeTransform(object.transform),
    metadata: sanitizeMetadata(object.metadata)
  };
}
