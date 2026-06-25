import { randomUUID } from 'node:crypto';
import { createDefaultScene, createSceneObject } from '../../../../packages/shared/src/scene.js';
import {
  deleteStoredScene,
  ensureSceneDataDir,
  listStoredScenes,
  loadScene,
  saveScene
} from './fileSceneStore.js';

const scenes = new Map();
const sceneLoadErrors = new Map();

function cloneScene(scene) {
  return {
    ...scene,
    objects: scene.objects.map((object) => ({ ...object }))
  };
}

function ensureDefaultScene() {
  if (!scenes.has('local-scene-001')) {
    scenes.set('local-scene-001', createDefaultScene());
  }
}

ensureDefaultScene();

async function persistScene(scene) {
  await saveScene(scene);
}

export async function initializeSceneStore() {
  await ensureSceneDataDir();

  const storedSceneIds = await listStoredScenes();
  scenes.clear();
  sceneLoadErrors.clear();

  for (const sceneId of storedSceneIds) {
    try {
      const scene = await loadScene(sceneId);
      if (scene) {
        scenes.set(scene.id, scene);
      }
    } catch (error) {
      sceneLoadErrors.set(sceneId, error);
    }
  }

  if (!scenes.has('local-scene-001')) {
    const defaultScene = createDefaultScene();
    scenes.set(defaultScene.id, defaultScene);
    await persistScene(defaultScene);
  }
}

export function getSceneLoadError(sceneId) {
  return sceneLoadErrors.get(sceneId) ?? null;
}

export function listScenes() {
  ensureDefaultScene();
  return Array.from(scenes.values()).map((scene) => ({
    id: scene.id,
    name: scene.name,
    version: scene.version,
    objectCount: scene.objects.length
  }));
}

export function getScene(sceneId) {
  ensureDefaultScene();
  const scene = scenes.get(sceneId);
  return scene ? cloneScene(scene) : null;
}

export async function createScene(input = {}) {
  ensureDefaultScene();
  const now = new Date().toISOString();
  const scene = {
    id: input.id ?? randomUUID(),
    name: input.name || 'Untitled Scene',
    version: Number.isInteger(input.version) ? input.version : 1,
    objects: [],
    metadata: input.metadata || {},
    createdAt: input.createdAt || now,
    updatedAt: now
  };

  scenes.set(scene.id, scene);
  await persistScene(scene);
  return cloneScene(scene);
}

export async function updateScene(sceneId, input = {}) {
  ensureDefaultScene();
  const scene = scenes.get(sceneId);
  if (!scene) {
    return null;
  }

  if (typeof input.name === 'string') {
    scene.name = input.name;
  }

  if (input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata)) {
    scene.metadata = {
      ...(scene.metadata || {}),
      ...input.metadata
    };
  }

  if (Number.isInteger(input.version)) {
    scene.version = input.version;
  }

  scene.updatedAt = new Date().toISOString();
  await persistScene(scene);
  return cloneScene(scene);
}

export async function deleteScene(sceneId) {
  ensureDefaultScene();
  const deleted = scenes.delete(sceneId);
  if (!deleted) {
    return false;
  }

  await deleteStoredScene(sceneId);
  return true;
}

export function listSceneObjects(sceneId) {
  ensureDefaultScene();
  const scene = scenes.get(sceneId);
  return scene ? scene.objects.map((object) => ({ ...object })) : null;
}

export async function createSceneObjectRecord(sceneId, input = {}) {
  ensureDefaultScene();
  const scene = scenes.get(sceneId);
  if (!scene) {
    return null;
  }

  const object = createSceneObject({
    ...input,
    id: input.id ?? randomUUID()
  });

  scene.objects.push(object);
  scene.updatedAt = new Date().toISOString();
  await persistScene(scene);
  return { ...object };
}

export async function updateSceneObjectRecord(sceneId, objectId, input = {}) {
  ensureDefaultScene();
  const scene = scenes.get(sceneId);
  if (!scene) {
    return null;
  }

  const object = scene.objects.find((entry) => entry.id === objectId);
  if (!object) {
    return undefined;
  }

  if (typeof input.displayName === 'string') {
    object.displayName = input.displayName;
  }

  if (typeof input.visible === 'boolean') {
    object.visible = input.visible;
  }

  if (input.transform && typeof input.transform === 'object' && !Array.isArray(input.transform)) {
    object.transform = {
      ...object.transform,
      ...input.transform
    };
  }

  if (input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata)) {
    object.metadata = {
      ...object.metadata,
      ...input.metadata
    };
  }

  object.updatedAt = new Date().toISOString();
  scene.updatedAt = object.updatedAt;
  await persistScene(scene);
  return { ...object };
}

export async function deleteSceneObjectRecord(sceneId, objectId) {
  ensureDefaultScene();
  const scene = scenes.get(sceneId);
  if (!scene) {
    return null;
  }

  const nextObjects = scene.objects.filter((object) => object.id !== objectId);
  if (nextObjects.length === scene.objects.length) {
    return false;
  }

  scene.objects = nextObjects;
  scene.updatedAt = new Date().toISOString();
  await persistScene(scene);
  return true;
}

export async function replaceSceneObjects(sceneId, objects) {
  ensureDefaultScene();
  const scene = scenes.get(sceneId);
  if (!scene) {
    return null;
  }

  scene.objects = objects.map((object) => ({ ...object }));
  scene.updatedAt = new Date().toISOString();
  await persistScene(scene);

  return {
    sceneId,
    objectCount: scene.objects.length
  };
}
