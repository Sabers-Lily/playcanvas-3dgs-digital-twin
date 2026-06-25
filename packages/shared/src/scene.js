export const SCENE_OBJECT_TYPES = {
  EMPTY: 'empty',
  ROBOT: 'robot',
  CAMERA_DEVICE: 'cameraDevice',
  DEVICE: 'device',
  HOTSPOT: 'hotspot',
  ANNOTATION: 'annotation',
  ROUTE_POINT: 'routePoint',
  GSPLAT: 'gsplat',
  BIM_PROXY: 'bim-proxy',
  GLB: 'glb',
  MODEL: 'model',
  MARKER: 'marker',
  CAMERA: 'camera',
  DEBUG: 'debug'
};

export const SYNCABLE_OBJECT_TYPES = [
  'empty',
  'robot',
  'cameraDevice',
  'device',
  'hotspot',
  'annotation',
  'routePoint',
  'gsplat',
  'bim-proxy',
  'glb',
  'model',
  'marker',
  'route'
];

export function createDefaultTransform() {
  return {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1]
  };
}

export function createDefaultScene() {
  const now = new Date().toISOString();

  return {
    id: 'local-scene-001',
    name: 'Local Digital Twin Scene',
    version: 1,
    objects: [],
    createdAt: now,
    updatedAt: now
  };
}

export function createSceneObject(input = {}) {
  const now = new Date().toISOString();

  return {
    id: input.id,
    type: input.type,
    displayName: input.displayName || input.name || 'Untitled Object',
    visible: input.visible ?? true,
    transform: input.transform || createDefaultTransform(),
    metadata: input.metadata || {},
    createdAt: input.createdAt || now,
    updatedAt: now
  };
}
