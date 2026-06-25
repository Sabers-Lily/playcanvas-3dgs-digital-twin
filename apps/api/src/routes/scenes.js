import {
  createScene,
  createSceneObjectRecord,
  deleteScene,
  deleteSceneObjectRecord,
  getScene,
  getSceneLoadError,
  listSceneObjects,
  listScenes,
  replaceSceneObjects,
  updateScene,
  updateSceneObjectRecord
} from '../store/memoryStore.js';
import { createApiError, createApiSuccess } from '../../../../packages/shared/src/api.js';
import { createDefaultTransform, createSceneObject } from '../../../../packages/shared/src/scene.js';

function sceneNotFound(sceneId) {
  return createApiError('SCENE_NOT_FOUND', 'Scene not found');
}

function sceneFileInvalid() {
  return createApiError('SCENE_FILE_INVALID', 'Scene file is invalid JSON');
}

function objectNotFound() {
  return createApiError('OBJECT_NOT_FOUND', 'Object not found');
}

function invalidObjectPayload() {
  return createApiError('INVALID_OBJECT_PAYLOAD', 'Invalid scene object payload');
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

function normalizeTransform(transform = {}) {
  return {
    position: normalizeVector3(transform.position, [0, 0, 0]),
    rotation: normalizeVector3(transform.rotation, [0, 0, 0]),
    scale: normalizeVector3(transform.scale, [1, 1, 1])
  };
}

function sanitizeMetadata(metadata = {}) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }

  try {
    return JSON.parse(JSON.stringify(metadata));
  } catch (_error) {
    return {};
  }
}

function normalizeSceneObjectPayload(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return null;
  }

  if (!input.id || !input.type || !input.displayName) {
    return null;
  }

  return createSceneObject({
    id: input.id,
    type: input.type,
    displayName: input.displayName,
    visible: typeof input.visible === 'boolean' ? input.visible : true,
    transform: normalizeTransform(input.transform ?? createDefaultTransform()),
    metadata: sanitizeMetadata(input.metadata)
  });
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

export async function handleScenesRoute(request, response, pathname, writeJson) {
  if (request.method === 'GET' && pathname === '/api/scenes') {
    writeJson(response, 200, createApiSuccess(listScenes()));
    return true;
  }

  const match = pathname.match(/^\/api\/scenes\/([^/]+)(?:\/objects(?:\/([^/]+))?)?$/);
  if (!match) {
    return false;
  }

  const sceneId = decodeURIComponent(match[1]);
  const objectId = match[2] ? decodeURIComponent(match[2]) : null;
  const isObjectsCollection = pathname.endsWith('/objects');
  const sceneLoadError = getSceneLoadError(sceneId);

  if (sceneLoadError?.code === 'SCENE_FILE_INVALID') {
    writeJson(response, 500, sceneFileInvalid());
    return true;
  }

  if (request.method === 'GET' && !isObjectsCollection) {
    const scene = getScene(sceneId);
    if (!scene) {
      writeJson(response, 404, sceneNotFound(sceneId));
      return true;
    }

    writeJson(response, 200, createApiSuccess(scene));
    return true;
  }

  if (request.method === 'POST' && !isObjectsCollection) {
    const body = await readBody(request);
    const scene = await createScene(body);
    writeJson(response, 201, createApiSuccess(scene));
    return true;
  }

  if (request.method === 'PUT' && !isObjectsCollection) {
    const body = await readBody(request);
    const scene = await updateScene(sceneId, body);
    if (!scene) {
      writeJson(response, 404, sceneNotFound(sceneId));
      return true;
    }

    writeJson(response, 200, createApiSuccess(scene));
    return true;
  }

  if (request.method === 'DELETE' && !isObjectsCollection) {
    const deleted = await deleteScene(sceneId);
    if (!deleted) {
      writeJson(response, 404, sceneNotFound(sceneId));
      return true;
    }

    writeJson(response, 200, createApiSuccess({ deleted: true, id: sceneId }));
    return true;
  }

  if (request.method === 'GET' && isObjectsCollection) {
    const objects = listSceneObjects(sceneId);
    if (!objects) {
      writeJson(response, 404, sceneNotFound(sceneId));
      return true;
    }

    writeJson(response, 200, createApiSuccess(objects));
    return true;
  }

  if (request.method === 'PUT' && isObjectsCollection && !objectId) {
    const body = await readBody(request);
    if (!Array.isArray(body?.objects)) {
      writeJson(response, 400, invalidObjectPayload());
      return true;
    }

    const objects = body.objects.map(normalizeSceneObjectPayload);
    if (objects.some((object) => !object)) {
      writeJson(response, 400, invalidObjectPayload());
      return true;
    }

    const result = await replaceSceneObjects(sceneId, objects);
    if (!result) {
      writeJson(response, 404, sceneNotFound(sceneId));
      return true;
    }

    writeJson(response, 200, createApiSuccess(result));
    return true;
  }

  if (request.method === 'POST' && isObjectsCollection) {
    const body = await readBody(request);
    const object = await createSceneObjectRecord(sceneId, body);
    if (!object) {
      writeJson(response, 404, sceneNotFound(sceneId));
      return true;
    }

    writeJson(response, 201, createApiSuccess(object));
    return true;
  }

  if (request.method === 'PUT' && objectId) {
    const body = await readBody(request);
    const object = await updateSceneObjectRecord(sceneId, objectId, body);
    if (object === null) {
      writeJson(response, 404, sceneNotFound(sceneId));
      return true;
    }

    if (object === undefined) {
      writeJson(response, 404, objectNotFound());
      return true;
    }

    writeJson(response, 200, createApiSuccess(object));
    return true;
  }

  if (request.method === 'DELETE' && objectId) {
    const deleted = await deleteSceneObjectRecord(sceneId, objectId);
    if (deleted === null) {
      writeJson(response, 404, sceneNotFound(sceneId));
      return true;
    }

    if (!deleted) {
      writeJson(response, 404, objectNotFound());
      return true;
    }

    writeJson(response, 200, createApiSuccess({ deleted: true, id: objectId }));
    return true;
  }

  return false;
}
