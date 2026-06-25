import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDefaultScene, createSceneObject, createDefaultTransform } from '../../../../packages/shared/src/scene.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '../../data');
const scenesDir = path.join(dataDir, 'scenes');

function getSceneFilePath(sceneId) {
  return path.join(scenesDir, `${sceneId}.json`);
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

function normalizeScene(input = {}) {
  const fallback = createDefaultScene();

  return {
    id: input.id || fallback.id,
    name: input.name || fallback.name,
    version: Number.isInteger(input.version) ? input.version : fallback.version,
    objects: Array.isArray(input.objects)
      ? input.objects
        .filter((object) => object && typeof object === 'object' && !Array.isArray(object))
        .map((object) => createSceneObject({
          id: object.id,
          type: object.type,
          displayName: object.displayName || object.name,
          visible: typeof object.visible === 'boolean' ? object.visible : true,
          transform: normalizeTransform(object.transform ?? createDefaultTransform()),
          metadata: sanitizeMetadata(object.metadata),
          createdAt: object.createdAt
        }))
      : [],
    metadata: sanitizeMetadata(input.metadata),
    createdAt: input.createdAt || fallback.createdAt,
    updatedAt: input.updatedAt || fallback.updatedAt
  };
}

export async function ensureSceneDataDir() {
  await fs.mkdir(scenesDir, { recursive: true });
}

export async function loadScene(sceneId) {
  await ensureSceneDataDir();
  const filePath = getSceneFilePath(sceneId);

  try {
    const content = await fs.readFile(filePath, 'utf8');
    return normalizeScene(JSON.parse(content));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }

    if (error instanceof SyntaxError) {
      const invalidError = new Error('Scene file is invalid JSON');
      invalidError.code = 'SCENE_FILE_INVALID';
      throw invalidError;
    }

    throw error;
  }
}

export async function saveScene(scene) {
  await ensureSceneDataDir();
  const filePath = getSceneFilePath(scene.id);

  try {
    await fs.writeFile(filePath, JSON.stringify(normalizeScene(scene), null, 2), 'utf8');
  } catch (_error) {
    const writeError = new Error('Failed to write scene file');
    writeError.code = 'SCENE_FILE_WRITE_FAILED';
    throw writeError;
  }
}

export async function listStoredScenes() {
  await ensureSceneDataDir();

  try {
    const entries = await fs.readdir(scenesDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => entry.name.replace(/\.json$/u, ''));
  } catch (_error) {
    return [];
  }
}

export async function deleteStoredScene(sceneId) {
  await ensureSceneDataDir();
  const filePath = getSceneFilePath(sceneId);

  try {
    await fs.unlink(filePath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return false;
    }

    const deleteError = new Error('Failed to delete scene file');
    deleteError.code = 'SCENE_FILE_WRITE_FAILED';
    throw deleteError;
  }
}
