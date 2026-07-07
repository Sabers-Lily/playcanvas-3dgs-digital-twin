import * as pc from 'playcanvas';
import { getCameraStatus, getCameraStream, listCameras, startCameraStream, stopCameraStream } from '../api/cameras.js';
import { ASSET_LABELS, ASSET_PATHS } from '../config/assets.js';
import { BimAlignmentManager, DEFAULT_BIM_ALIGNMENT } from '../engine/BimAlignmentManager.js';
import { BimProxyManager } from '../engine/BimProxyManager.js';
import { CameraController } from '../engine/CameraController.js';
import { BuildingEnvelopeController } from '../engine/BuildingEnvelopeController.js';
import { CameraVideoRuntime } from '../engine/CameraVideoRuntime.js';
import { CameraProjectionManager } from '../engine/CameraProjectionManager.js';
import { GsplatPointPicker } from '../engine/GsplatPointPicker.js';
import { MarkerManager } from '../engine/MarkerManager.js';
import { ObjectTransformDragController } from '../engine/ObjectTransformDragController.js';
import { PickingController } from '../engine/PickingController.js';
import { RobotDogPatrolController } from '../engine/RobotDogPatrolController.js';
import { SelectableObjectController } from '../engine/SelectableObjectController.js';
import { TransformGizmo } from '../engine/TransformGizmo.js';
import { SceneObjectManager } from '../editor/SceneObjectManager.js';
import { SelectionManager } from '../editor/SelectionManager.js';
import { UI_FLAGS } from '../config/uiFlags.js';
import { resolveApiUrl } from '../config/apiConfig.js';
import { CAMERA_SOURCE_TYPES, CAMERA_STREAM_STATUSES } from '../../../../packages/shared/src/cameras.js';
import { CameraSourceRegistry } from './projection/CameraSourceRegistry.js';
import { CameraSourceRuntimePool } from './projection/CameraSourceRuntimePool.js';
import { ProjectionConfigRegistry } from './projection/ProjectionConfigRegistry.js';
import { ProjectionConfigCompatibilityAdapter } from './projection/ProjectionConfigCompatibilityAdapter.js';
import { ProjectionEditingController } from './projection/ProjectionEditingController.js';
import { ProjectionScheduler } from './projection/ProjectionScheduler.js';
import { GsplatProjectionRenderer } from './projection/GsplatProjectionRenderer.js';
import { ProjectionDiagnostics } from './projection/ProjectionDiagnostics.js';

const OBJECT_IDS = {
  camera: 'camera',
  debug: 'debug-helpers',
  gsplat: 'base-map',
  bim: 'bim-proxy',
  marker: 'pick-marker'
};

const BUILDING_ENVELOPE_TYPE = 'buildingEnvelope';
const BUILDING_ENVELOPE_OVERLAY_LAYER_NAME = 'BuildingEnvelopeOverlay';
const ACTIVE_EDIT_MODE = {
  TRANSFORM: 'transform',
  QUAD_VIDEO_PROJECTION: 'quadVideoProjection',
  BUILDING_ENVELOPE_DRAWING: 'buildingEnvelopeDrawing'
};
const TRANSFORM_EDITABLE_TYPES = new Set([
  'gsplat',
  'bim-proxy',
  'model',
  'glb',
  'empty',
  'robot',
  'robotDog',
  'cameraDevice',
  BUILDING_ENVELOPE_TYPE,
  'device',
  'hotspot',
  'annotation',
  'routePoint'
]);
const PICKABLE_OBJECT_TYPES = new Set([
  'bim-proxy',
  'model',
  'glb',
  'empty',
  'robot',
  'robotDog',
  'cameraDevice',
  BUILDING_ENVELOPE_TYPE,
  'device',
  'hotspot',
  'annotation',
  'routePoint'
]);
const DRAGGABLE_OBJECT_TYPES = new Set([
  'model',
  'glb',
  'empty',
  'robot',
  'robotDog',
  'cameraDevice',
  'device',
  'hotspot',
  'annotation',
  'routePoint'
]);
const RESTORABLE_OBJECT_TYPES = new Set([
  'gsplat',
  'bim-proxy',
  'glb',
  'model',
  'marker',
  'empty',
  'robot',
  'robotDog',
  'cameraDevice',
  'device',
  'hotspot',
  'annotation',
  'routePoint'
]);
const MAX_LOGS = 100;
const MAX_ACTIVE_RENDER_PROJECTIONS = 4;

const BUSINESS_OBJECT_DEFINITIONS = {
  empty: {
    idPrefix: 'empty',
    displayName: '空对象',
    typeLabel: '空对象',
    businessType: 'empty'
  },
  robot: {
    idPrefix: 'robot',
    displayName: '机器狗',
    typeLabel: '机器狗',
    businessType: 'robot'
  },
  robotDog: {
    idPrefix: 'robot_dog',
    displayName: '机器狗',
    typeLabel: '机器狗',
    businessType: 'robotDog'
  },
  cameraDevice: {
    idPrefix: 'camera_device',
    displayName: '摄像头',
    typeLabel: '摄像头',
    businessType: 'camera'
  },
  device: {
    idPrefix: 'device',
    displayName: '设备',
    typeLabel: '设备',
    businessType: 'device'
  },
  hotspot: {
    idPrefix: 'hotspot',
    displayName: '热点',
    typeLabel: '热点',
    businessType: 'hotspot'
  },
  annotation: {
    idPrefix: 'annotation',
    displayName: '标注',
    typeLabel: '标注',
    businessType: 'annotation'
  },
  routePoint: {
    idPrefix: 'route_point',
    displayName: '路线点',
    typeLabel: '路线点',
    businessType: 'routePoint'
  },
  buildingEnvelope: {
    idPrefix: 'building_envelope',
    displayName: '建筑多边体',
    typeLabel: '建筑多边体',
    businessType: 'buildingEnvelope'
  }
};

function shouldLogPerf() {
  return typeof window !== 'undefined' && Boolean(window.__MINI_EDITOR_PERF__);
}

function describeError(err) {
  if (!err) {
    return 'Unknown error';
  }

  if (typeof err.message === 'string' && err.message) {
    return err.message;
  }

  try {
    return JSON.stringify(err);
  } catch (_jsonError) {
    return String(err);
  }
}

function describeCameraStreamError(error) {
  if (error?.code === 'FFMPEG_NOT_FOUND') {
    return '未找到 ffmpeg，请安装或配置 FFMPEG_PATH';
  }

  return describeError(error);
}

function readNumberValue(value, fallback) {
  const next = Number.parseFloat(value);
  return Number.isFinite(next) ? next : fallback;
}

function cloneTransform(transform) {
  return {
    position: [...(transform?.position ?? [0, 0, 0])],
    rotation: [...(transform?.rotation ?? [0, 0, 0])],
    scale: [...(transform?.scale ?? [1, 1, 1])]
  };
}

function createDefaultTransformEditState() {
  return {
    enabled: false,
    objectId: null,
    startTransform: null,
    dragMode: 'none'
  };
}

function getTransformFromEntity(entity) {
  if (!entity) {
    return cloneTransform();
  }

  const position = entity.getLocalPosition();
  const rotation = entity.getLocalEulerAngles();
  const scale = entity.getLocalScale();

  return {
    position: [position.x, position.y, position.z],
    rotation: [rotation.x, rotation.y, rotation.z],
    scale: [scale.x, scale.y, scale.z]
  };
}

function normalizeScale(scale) {
  if (Array.isArray(scale)) {
    return scale.map((value) => {
      const next = Number.parseFloat(value);
      return Number.isFinite(next) && next > 0 ? next : 1;
    });
  }

  const next = Number.parseFloat(scale);
  const safe = Number.isFinite(next) && next > 0 ? next : 1;
  return [safe, safe, safe];
}

function sanitizeTransformInput(transform, fallbackTransform = cloneTransform()) {
  const fallback = cloneTransform(fallbackTransform);

  return {
    position: [
      readNumberValue(transform?.position?.[0], fallback.position[0]),
      readNumberValue(transform?.position?.[1], fallback.position[1]),
      readNumberValue(transform?.position?.[2], fallback.position[2])
    ],
    rotation: [
      readNumberValue(transform?.rotation?.[0], fallback.rotation[0]),
      readNumberValue(transform?.rotation?.[1], fallback.rotation[1]),
      readNumberValue(transform?.rotation?.[2], fallback.rotation[2])
    ],
    scale: normalizeScale(transform?.scale ?? fallback.scale)
  };
}

function isBlobAssetUrl(url) {
  return typeof url === 'string' && url.startsWith('blob:');
}

function isRestorableAssetUrl(url) {
  return typeof url === 'string' && (url.startsWith('/assets/') || url.startsWith('/api/assets/'));
}

function normalizeRestoredObjectPayload(object) {
  return {
    id: object?.id,
    type: object?.type,
    displayName: object?.displayName || object?.name || object?.metadata?.sourceName || 'Restored Object',
    visible: object?.visible ?? true,
    transform: sanitizeTransformInput(object?.transform),
    metadata: {
      url: object?.metadata?.url,
      sourceName: object?.metadata?.sourceName || object?.displayName || object?.name || 'asset',
      source: object?.metadata?.source,
      assetId: object?.metadata?.assetId,
      sourceAssetId: object?.metadata?.sourceAssetId,
      assetType: object?.metadata?.assetType,
      runtimeType: object?.metadata?.runtimeType,
      size: object?.metadata?.size,
      businessType: object?.metadata?.businessType,
      placedBy: object?.metadata?.placedBy,
      videoProjection: object?.metadata?.videoProjection,
      patrol: clonePatrolMetadata(object?.metadata?.patrol)
    }
  };
}

function clampMenuPosition(x, y, width = 200, height = 240) {
  const maxX = Math.max(8, window.innerWidth - width - 8);
  const maxY = Math.max(8, window.innerHeight - height - 8);
  return {
    x: Math.max(8, Math.min(x, maxX)),
    y: Math.max(8, Math.min(y, maxY))
  };
}

function createBusinessObjectId(type, prefix = 'object') {
  return `${prefix}_${type}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function formatPointLog(point) {
  return `x=${point.x.toFixed(2)}, y=${point.y.toFixed(2)}, z=${point.z.toFixed(2)}`;
}

function isPickableObjectType(type) {
  return PICKABLE_OBJECT_TYPES.has(type);
}

function isDraggableObject(object) {
  if (!object?.entity || object.protected || !object.visible) {
    return false;
  }

  return DRAGGABLE_OBJECT_TYPES.has(object.type);
}

function clonePatrolMetadata(patrol) {
  if (!patrol) {
    return undefined;
  }

  return {
    ...patrol,
    routePoints: Array.isArray(patrol.routePoints)
      ? patrol.routePoints.map((point, index) => ({
          ...point,
          index: point.index ?? index,
          position: Array.isArray(point.position) ? [...point.position] : [0, 0, 0]
        }))
      : []
  };
}

function cloneQuadPoints(points) {
  if (!Array.isArray(points)) {
    return [];
  }

  return points.map((point, index) => ({
    id: point.id ?? `quad-point-${String(index + 1).padStart(3, '0')}`,
    index: point.index ?? index,
    label: point.label ?? ['左上', '右上', '右下', '左下'][index] ?? `点 ${index + 1}`,
    position: Array.isArray(point.position) ? [...point.position] : [0, 0, 0]
  }));
}

function cloneEnvelopePoints(points) {
  if (!Array.isArray(points)) {
    return [];
  }

  return points.map((point, index) => ({
    id: point?.id ?? `p${index}`,
    index: point?.index ?? index,
    position: Array.isArray(point)
      ? [...point]
      : (Array.isArray(point?.position) ? [...point.position] : [0, 0, 0])
  }));
}

function getEnvelopeWorldCenter(envelope) {
  const points = cloneEnvelopePoints(envelope?.points);
  if (!points.length) {
    return null;
  }

  const center = new pc.Vec3();
  points.forEach((point) => {
    center.x += point.position[0];
    center.y += point.position[1];
    center.z += point.position[2];
  });
  center.mulScalar(1 / points.length);
  return center;
}

function formatEnvelopePointList(points) {
  return cloneEnvelopePoints(points)
    .map((point) => `${point.index}:${point.position.map((value) => Number(value).toFixed(2)).join(',')}`)
    .join(' | ');
}

function createDefaultEnvelopeMetadata(partial = {}) {
  const height = Math.max(0, readNumberValue(partial.height, 5));
  return {
    points: cloneEnvelopePoints(partial.points),
    closed: partial.closed ?? true,
    height,
    baseOffset: readNumberValue(partial.baseOffset, 0),
    color: typeof partial.color === 'string' ? partial.color : '#00A3FF',
    opacity: Math.max(0, Math.min(1, readNumberValue(partial.opacity, 0.25))),
    outlineVisible: partial.outlineVisible ?? true,
    fillVisible: partial.fillVisible ?? true,
    topVisible: height > 0 ? (partial.topVisible ?? true) : false,
    sideVisible: height > 0 ? (partial.sideVisible ?? true) : false,
    upAxis: partial.upAxis ?? 'z',
    displayMode: partial.displayMode === 'depth' ? 'depth' : 'overlay'
  };
}

function createDefaultVideoProjectionMetadata(id, partial = {}) {
  return {
    id,
    enabled: partial.enabled ?? false,
    sourceType: partial.sourceType ?? CAMERA_SOURCE_TYPES.CAMERA_STREAM,
    cameraId: partial.cameraId ?? 'camera1',
    streamUrl: partial.streamUrl ?? null,
    mode: partial.mode === 'cameraFrustum'
      ? 'cameraFrustum'
      : (partial.mode === 'quad' ? 'quad' : (partial.mode ?? 'quadOverlay')),
    videoUrl: partial.videoUrl ?? '',
    projectorFov: readNumberValue(partial.projectorFov, 45),
    projectorAspect: readNumberValue(partial.projectorAspect, 1.777),
    projectorNear: readNumberValue(partial.projectorNear, 0.1),
    projectorFar: readNumberValue(partial.projectorFar, 1000),
    opacity: readNumberValue(partial.opacity, 1),
    softEdge: readNumberValue(partial.softEdge, 0),
    flipY: Boolean(partial.flipY),
    replaceMode: partial.replaceMode ?? true,
    quadEditing: Boolean(partial.quadEditing),
    quadPoints: cloneQuadPoints(partial.quadPoints),
    quadPlaneTolerance: readNumberValue(partial.quadPlaneTolerance, 0.25)
  };
}

function getWebglSupportStatus(canvas) {
  const probeCanvas = canvas ?? document.createElement('canvas');

  try {
    const webgl2 = probeCanvas.getContext('webgl2');
    if (webgl2) {
      return {
        supported: true,
        hasWebgl2: true,
        hasWebgl1: true
      };
    }
  } catch (_error) {
    // Ignore probing errors and fall through to detailed result below.
  }

  let hasWebgl1 = false;
  try {
    hasWebgl1 = Boolean(
      probeCanvas.getContext('webgl')
      || probeCanvas.getContext('experimental-webgl')
    );
  } catch (_error) {
    hasWebgl1 = false;
  }

  return {
    supported: false,
    hasWebgl2: false,
    hasWebgl1
  };
}

export function createMiniEditorRuntime({ canvas, viewportElement }) {
  const webglStatus = getWebglSupportStatus(canvas);
  if (!webglStatus.supported) {
    const error = new Error(
      webglStatus.hasWebgl1
        ? 'WebGL2 is required but not available in this browser.'
        : 'WebGL is not available in this browser.'
    );
    error.code = webglStatus.hasWebgl1 ? 'WEBGL2_UNSUPPORTED' : 'WEBGL_UNSUPPORTED';
    throw error;
  }

  const app = new pc.Application(canvas, {
    graphicsDeviceOptions: {
      // Some browsers/drivers hit invalid MSAA resolve errors during gsplat rendering and picker passes.
      antialias: false
    },
    mouse: new pc.Mouse(document.body),
    touch: new pc.TouchDevice(document.body)
  });

  app.setCanvasFillMode(pc.FILLMODE_NONE);
  app.setCanvasResolution(pc.RESOLUTION_AUTO);
  app.start();

  app.scene.ambientLight = new pc.Color(0.25, 0.25, 0.25);

  let buildingEnvelopeOverlayLayer = app.scene.layers?.getLayerByName?.(BUILDING_ENVELOPE_OVERLAY_LAYER_NAME) ?? null;
  if (!buildingEnvelopeOverlayLayer) {
    buildingEnvelopeOverlayLayer = new pc.Layer({
      name: BUILDING_ENVELOPE_OVERLAY_LAYER_NAME,
      enabled: true
    });
    app.scene.layers.push(buildingEnvelopeOverlayLayer);
  }

  const camera = new pc.Entity('Camera');
  camera.addComponent('camera', {
    clearColor: new pc.Color(0.08, 0.09, 0.12),
    fov: 60,
    gammaCorrection: pc.GAMMA_SRGB,
    toneMapping: pc.TONEMAP_ACES
  });
  if (!camera.camera.layers.includes(buildingEnvelopeOverlayLayer.id)) {
    camera.camera.layers = [...camera.camera.layers, buildingEnvelopeOverlayLayer.id];
  }
  app.root.addChild(camera);

  const light = new pc.Entity('DirectionalLight');
  light.addComponent('light', {
    type: 'directional',
    color: new pc.Color(1, 1, 1),
    intensity: 1.5,
    castShadows: false
  });
  light.setLocalEulerAngles(45, 30, 0);
  app.root.addChild(light);

  const sceneObjectManager = new SceneObjectManager();
  const selectionManager = new SelectionManager(sceneObjectManager);
  const bimAlignmentManager = new BimAlignmentManager();
  const bimProxyManager = new BimProxyManager({ app });
  const markerManager = new MarkerManager({ app });
  const robotDogPatrolController = new RobotDogPatrolController({
    app,
    sceneObjectManager,
    selectionManager,
    onLog(message) {
      console.log(message);
      updateStatusMessage(message);
    }
  });
  const buildingEnvelopeController = new BuildingEnvelopeController({
    app,
    visibleLayerIds: [buildingEnvelopeOverlayLayer.id],
    pickingLayerIds: [pc.LAYERID_WORLD],
    onLog(message) {
      updateStatusMessage(message);
    }
  });
  const selectableObjectController = new SelectableObjectController({
    sceneObjectManager,
    selectionManager,
    buildingEnvelopeController,
    log(message) {
      console.log(message);
    }
  });
  const sceneRenderPicker = new pc.Picker(app, 1, 1);

  const cameraController = new CameraController({
    app,
    camera,
    canvas
  });
  const transformGizmo = new TransformGizmo({
    app,
    cameraEntity: camera
  });

  cameraController.setDefaultFocus({
    target: new pc.Vec3(0, 0, 0),
    distance: 80,
    yaw: 0,
    pitch: 45
  });
  cameraController.reset();

  if (UI_FLAGS.showDefaultCameraInHierarchy) {
    sceneObjectManager.addObject({
      id: OBJECT_IDS.camera,
      name: camera.name,
      displayName: camera.name,
      type: 'camera',
      entity: camera,
      transform: getTransformFromEntity(camera),
      visible: camera.enabled,
      status: 'active',
      canHide: false,
      protected: true,
      metadata: {}
    });
  }

  const debugEntity = bimProxyManager.createFallbackGroundProxy();
  if (!UI_FLAGS.showDebugHelpersInHierarchy) {
    debugEntity.enabled = false;
  } else {
    sceneObjectManager.addObject({
      id: OBJECT_IDS.debug,
      name: 'Debug Helpers',
      displayName: 'Debug Helpers',
      type: 'debug',
      entity: debugEntity,
      transform: getTransformFromEntity(debugEntity),
      visible: debugEntity.enabled,
      status: 'ready',
      canHide: true,
      protected: true,
      metadata: {}
    });
  }

  const statusState = {
    sog: {
      state: 'idle',
      detail: 'SOG idle'
    },
    bim: {
      state: 'idle',
      detail: 'BIM idle'
    },
    pick: {
      state: 'ready',
      detail: 'Ready'
    },
    message: 'Ready'
  };

  const assetAvailability = {
    [ASSET_PATHS.baseSog]: 'checking',
    [ASSET_PATHS.convertedSog]: 'checking',
    [ASSET_PATHS.bimProxy]: 'checking'
  };

  const state = {
    objects: sceneObjectManager.getObjectSnapshots(),
    selectedId: selectionManager.getSelectedId(),
    selectedObject: selectionManager.getSelectedSnapshot(),
    activeEditMode: null,
    alignment: bimAlignmentManager.getCurrent(),
    steps: {
      move: 1,
      rotate: 1,
      scale: 0.01
    },
    logs: ['Ready'],
    assets: [],
    cameraStreams: {
      cameras: [],
      statuses: {},
      apiStatus: 'idle'
    },
    uploadedAssets: [],
    statusMessage: 'Ready',
    statusSummary: {
      sog: statusState.sog.detail,
      bim: statusState.bim.detail,
      pick: statusState.pick.detail
    },
    transformEdit: createDefaultTransformEditState(),
    contextMenu: {
      open: false,
      objectId: null,
      x: 0,
      y: 0
    }
  };

  const listeners = new Set();
  let emitScheduled = false;

  let currentGsplatEntity = null;
  let currentAsset = null;
  let currentBlobUrl = null;
  let loadToken = 0;
  let placementMode = null;
  let activeEditMode = null;
  const transformEditState = createDefaultTransformEditState();
  let buildingEnvelopeCounter = 0;
  const quadProjectionHelpers = new Map();
  const cameraStreamStatuses = new Map();
  const cameraVideoRuntimes = new Map();
  const cameraSourceRegistry = new CameraSourceRegistry();
  const cameraSourceRuntimePool = new CameraSourceRuntimePool({
    RuntimeClass: CameraVideoRuntime
  });
  const projectionConfigRegistry = new ProjectionConfigRegistry();
  const projectionCompatibilityAdapter = new ProjectionConfigCompatibilityAdapter({
    sceneObjectManager,
    createDefaultVideoProjectionMetadata,
    sourceRegistry: cameraSourceRegistry,
    projectionRegistry: projectionConfigRegistry
  });
  const projectionEditingController = new ProjectionEditingController({
    projectionRegistry: projectionConfigRegistry,
    compatibilityAdapter: projectionCompatibilityAdapter
  });
  const projectionScheduler = new ProjectionScheduler({
    maxActive: MAX_ACTIVE_RENDER_PROJECTIONS
  });
  let lastCameraVideoRuntimeEmitAt = 0;
  const quadHelperMaterial = new pc.StandardMaterial();
  quadHelperMaterial.diffuse = new pc.Color(0.1, 0.85, 1);
  quadHelperMaterial.emissive = new pc.Color(0.05, 0.35, 0.5);
  quadHelperMaterial.update();
  const cameraProjectionManager = new CameraProjectionManager({
    app,
    getVideoElement(cameraObjectId, projection = {}) {
      const runtime = ensureCameraVideoRuntime(cameraObjectId, projection);
      return runtime?.getVideoElement?.() ?? null;
    },
    getGsplatEntity() {
      return currentGsplatEntity;
    },
    getMainCameraEntity() {
      return camera;
    },
    getProjectorEntity(cameraObjectId) {
      return sceneObjectManager.getObject(cameraObjectId)?.entity ?? null;
    }
  });
  const gsplatProjectionRenderer = new GsplatProjectionRenderer({
    app,
    getGsplatEntity: () => currentGsplatEntity,
    getMainCameraEntity: () => camera,
    getProjectorEntity: (objectId) => sceneObjectManager.getObject(objectId)?.entity ?? null,
    projectionRegistry: projectionConfigRegistry,
    sourceRegistry: cameraSourceRegistry,
    runtimePool: cameraSourceRuntimePool,
    maxSlots: MAX_ACTIVE_RENDER_PROJECTIONS
  });
  const projectionDiagnostics = new ProjectionDiagnostics({
    sourceRegistry: cameraSourceRegistry,
    runtimePool: cameraSourceRuntimePool,
    projectionRegistry: projectionConfigRegistry,
    scheduler: projectionScheduler,
    renderer: gsplatProjectionRenderer
  });

  function buildCameraStreamsSnapshot() {
    return {
      cameras: state.cameraStreams.cameras.map((cameraSource) => ({ ...cameraSource })),
      statuses: Object.fromEntries(Array.from(cameraStreamStatuses.entries()).map(([cameraId, status]) => [cameraId, { ...status }])),
      projectionRuntimes: Object.fromEntries(Array.from(cameraVideoRuntimes.entries()).map(([cameraObjectId, runtime]) => [cameraObjectId, runtime.getState()])),
      projectionDiagnostics: Object.fromEntries(
        projectionConfigRegistry.getAll().map((config) => [config.objectId, projectionDiagnostics.getProjectionDiagnostics(config.id)])
      ),
      apiStatus: state.cameraStreams.apiStatus
    };
  }

  function syncProjectionArchitectureFromSceneObjects() {
    sceneObjectManager.getObjects()
      .filter((sceneObject) => sceneObject.type === 'cameraDevice')
      .forEach((sceneObject) => {
        projectionCompatibilityAdapter.hydrateSceneObject(sceneObject);
      });
  }

  function setCameraStreamStatus(cameraId, patch = {}) {
    const current = cameraStreamStatuses.get(cameraId) ?? {
      cameraId,
      status: CAMERA_STREAM_STATUSES.IDLE,
      lastError: null,
      playUrl: null,
      absolutePlayUrl: null
    };

    cameraStreamStatuses.set(cameraId, {
      ...current,
      ...patch
    });
  }

  function getOrCreateCameraVideoRuntime(cameraObjectId) {
    syncProjectionArchitectureFromSceneObjects();
    const sourceId = projectionCompatibilityAdapter.getSourceIdForObject(cameraObjectId);
    const sourceConfig = cameraSourceRegistry.get(sourceId);
    if (sourceConfig) {
      const entry = cameraSourceRuntimePool.acquire(sourceConfig, `legacy:${cameraObjectId}`);
      if (entry?.runtime) {
        cameraVideoRuntimes.set(cameraObjectId, entry.runtime);
        return entry.runtime;
      }
    }

    const existingRuntime = cameraVideoRuntimes.get(cameraObjectId);
    if (existingRuntime) {
      return existingRuntime;
    }

    const runtime = new CameraVideoRuntime({
      runtimeId: cameraObjectId
    });
    cameraVideoRuntimes.set(cameraObjectId, runtime);
    return runtime;
  }

  function disposeCameraVideoRuntime(cameraObjectId) {
    const runtime = cameraVideoRuntimes.get(cameraObjectId);
    if (!runtime) {
      return false;
    }

    const sourceId = projectionCompatibilityAdapter.getSourceIdForObject(cameraObjectId);
    cameraSourceRuntimePool.release(sourceId, `legacy:${cameraObjectId}`);
    cameraVideoRuntimes.delete(cameraObjectId);
    return true;
  }

  function ensureCameraVideoRuntime(cameraObjectId, projection = {}) {
    const runtime = getOrCreateCameraVideoRuntime(cameraObjectId);
    const resolvedVideoUrl = resolveProjectionVideoUrl(projection);

    runtime.load(resolvedVideoUrl, {
      loop: projection.sourceType !== CAMERA_SOURCE_TYPES.CAMERA_STREAM
    }).catch((error) => {
      console.warn('[CameraVideoRuntime] load failed:', {
        cameraObjectId,
        resolvedVideoUrl,
        error
      });
      emitState();
    });

    return runtime;
  }

  function resolveProjectionVideoUrl(projection = {}) {
    if (projection.sourceType === CAMERA_SOURCE_TYPES.CAMERA_STREAM) {
      return projection.streamUrl || projection.videoUrl || '';
    }

    if (projection.sourceType === CAMERA_SOURCE_TYPES.CUSTOM_URL) {
      return projection.videoUrl || '';
    }

    return projection.videoUrl || '';
  }

  async function refreshCameraSources() {
    state.cameraStreams.apiStatus = 'loading';
    emitState();

    try {
      const cameras = await listCameras();
      state.cameraStreams.cameras = Array.isArray(cameras) ? cameras : [];
      state.cameraStreams.apiStatus = 'ready';

      await Promise.all(state.cameraStreams.cameras.map(async (cameraSource) => {
        try {
          const status = await getCameraStatus(cameraSource.id);
          setCameraStreamStatus(cameraSource.id, status);
        } catch (error) {
          console.warn('[CameraStream] status refresh failed:', cameraSource.id, error);
          setCameraStreamStatus(cameraSource.id, {
            status: CAMERA_STREAM_STATUSES.ERROR,
            lastError: describeCameraStreamError(error),
            lastErrorCode: error?.code || null
          });
        }
      }));

      console.log('[CameraStream] cameras loaded:', state.cameraStreams.cameras.map((entry) => entry.id));
    } catch (error) {
      state.cameraStreams.cameras = [];
      state.cameraStreams.apiStatus = 'error';
      console.warn('[CameraStream] cameras load failed:', error);
    }

    emitState();
  }

  async function startCameraStreamFlow(cameraSourceId) {
    setCameraStreamStatus(cameraSourceId, {
      status: CAMERA_STREAM_STATUSES.STARTING,
      lastError: null
    });
    emitState();

    const started = await startCameraStream(cameraSourceId);
    const latestStatus = await getCameraStatus(cameraSourceId);
    const nextStatus = {
      ...started,
      ...latestStatus
    };
    if (nextStatus.status === CAMERA_STREAM_STATUSES.ERROR) {
      setCameraStreamStatus(cameraSourceId, nextStatus);
      emitState();
      const error = new Error(nextStatus.lastError || `Camera stream start failed: ${cameraSourceId}`);
      error.code = nextStatus.lastErrorCode || 'CAMERA_STREAM_FAILED';
      throw error;
    }
    setCameraStreamStatus(cameraSourceId, nextStatus);
    console.log(`[CameraStream] stream started: cameraId=${cameraSourceId}`);
    emitState();
    return nextStatus;
  }

  async function stopCameraStreamFlow(cameraSourceId) {
    const stopped = await stopCameraStream(cameraSourceId);
    setCameraStreamStatus(cameraSourceId, stopped);
    console.log(`[CameraStream] stream stopped: cameraId=${cameraSourceId}`);
    emitState();
    return stopped;
  }

  async function bindCameraStreamToProjection(cameraObjectId, cameraSourceId) {
    try {
      const streamStatus = await startCameraStreamFlow(cameraSourceId);
      const streamInfo = await getCameraStream(cameraSourceId);
      const resolvedStreamUrl = streamInfo.absolutePlayUrl || resolveApiUrl(streamInfo.playUrl);
      const currentProjection = createDefaultVideoProjectionMetadata(
        cameraObjectId,
        sceneObjectManager.getObject(cameraObjectId)?.metadata?.videoProjection
      );

      updateCameraVideoProjection(cameraObjectId, {
        ...currentProjection,
        sourceType: CAMERA_SOURCE_TYPES.CAMERA_STREAM,
        cameraId: cameraSourceId,
        videoUrl: resolvedStreamUrl,
        streamUrl: resolvedStreamUrl,
        enabled: currentProjection.enabled && (currentProjection.quadPoints?.length ?? 0) === 4
      });

      setCameraStreamStatus(cameraSourceId, {
        ...streamStatus,
        ...streamInfo,
        status: CAMERA_STREAM_STATUSES.RUNNING
      });
      console.log(`[VideoProjection] camera stream bound: objectId=${cameraObjectId} cameraId=${cameraSourceId}`);
      updateStatusMessage(`Camera stream bound: ${cameraSourceId}`);
      emitState();
      return true;
    } catch (error) {
      console.warn('[VideoProjection] bind camera stream failed:', error);
      setCameraStreamStatus(cameraSourceId, {
        status: CAMERA_STREAM_STATUSES.ERROR,
        lastError: describeCameraStreamError(error),
        lastErrorCode: error?.code || null
      });
      updateStatusMessage(`Bind camera stream failed: ${describeCameraStreamError(error)}`);
      emitState();
      return false;
    }
  }

  async function ensureProjectionVideoSource(cameraObjectId, projection = null) {
    const cameraObject = sceneObjectManager.getObject(cameraObjectId);
    if (!cameraObject || cameraObject.type !== 'cameraDevice') {
      return null;
    }

    const currentProjection = createDefaultVideoProjectionMetadata(
      cameraObjectId,
      projection ?? cameraObject.metadata?.videoProjection
    );

    if (currentProjection.sourceType !== CAMERA_SOURCE_TYPES.CAMERA_STREAM) {
      return currentProjection;
    }

    if (currentProjection.streamUrl || currentProjection.videoUrl) {
      return currentProjection;
    }

    const cameraSourceId = currentProjection.cameraId ?? 'camera1';
    const bound = await bindCameraStreamToProjection(cameraObjectId, cameraSourceId);
    if (!bound) {
      console.warn('[VideoProjection] ensure source failed: bind camera stream failed', {
        cameraObjectId,
        cameraSourceId
      });
      return null;
    }

    return createDefaultVideoProjectionMetadata(
      cameraObjectId,
      sceneObjectManager.getObject(cameraObjectId)?.metadata?.videoProjection
    );
  }

  function syncCameraProjectionMetadata(cameraId, patch = {}) {
    const target = sceneObjectManager.getObject(cameraId);
    if (!target || target.type !== 'cameraDevice') {
      return null;
    }

    const nextProjection = projectionCompatibilityAdapter.updateProjectionForObject(cameraId, patch);
    syncProjectionArchitectureFromSceneObjects();

    return nextProjection;
  }

  function syncProjectionInstanceForCamera(cameraId, projection = null) {
    const cameraObject = sceneObjectManager.getObject(cameraId);
    if (!cameraObject || cameraObject.type !== 'cameraDevice') {
      return null;
    }

    const nextProjection = createDefaultVideoProjectionMetadata(
      cameraId,
      projection ?? cameraObject.metadata?.videoProjection
    );

    syncProjectionArchitectureFromSceneObjects();
    return nextProjection;
  }

  function syncAllCameraProjectionInstances() {
    syncProjectionArchitectureFromSceneObjects();
    projectionScheduler.evaluate({
      projectionConfigs: projectionConfigRegistry.getAll(),
      sourceRegistry: cameraSourceRegistry,
      runtimePool: cameraSourceRuntimePool
    });
    gsplatProjectionRenderer.syncActiveSet(projectionScheduler.getActiveSet()).catch((error) => {
      console.warn('[Projection] renderer sync failed:', error);
    });
  }

  function clearQuadProjectionHelpers(cameraId = null) {
    const entries = cameraId
      ? [[cameraId, quadProjectionHelpers.get(cameraId)]]
      : Array.from(quadProjectionHelpers.entries());

    entries.forEach(([id, helpers]) => {
      helpers?.forEach((entity) => {
        if (entity?.name?.startsWith('__quad_projection_') && !entity.destroyed) {
          entity.destroy();
        }
      });
      quadProjectionHelpers.delete(id);
    });
  }

  function clearProjectionHelperEntities() {
    const helperPrefixes = [
      '__quad_projection_',
      '__debug_projection_',
      '__helper_projection_',
      '__video_quad_',
      '__projection_overlay_'
    ];

    app.root?.forEach?.((entity) => {
      if (!helperPrefixes.some((prefix) => entity?.name?.startsWith(prefix))) {
        return;
      }

      if (!entity.destroyed) {
        entity.destroy();
      }
    });
  }

  function rebuildQuadProjectionHelpers(cameraId) {
    clearQuadProjectionHelpers(cameraId);
    const cameraObject = sceneObjectManager.getObject(cameraId);
    const points = cameraObject?.metadata?.videoProjection?.quadPoints ?? [];
    if (!points.length) {
      return;
    }

    const helpers = [];
    points.forEach((point) => {
      const entity = new pc.Entity(`__quad_projection_point_${cameraId}_${point.index}`);
      entity.addComponent('render', {
        type: 'sphere',
        castShadows: false,
        receiveShadows: false,
        material: quadHelperMaterial
      });
      entity.setLocalScale(0.22, 0.22, 0.22);
      entity.setPosition(...point.position);
      app.root.addChild(entity);
      helpers.push(entity);
    });

    quadProjectionHelpers.set(cameraId, helpers);
  }

  function getEditingQuadProjectionCameraId() {
    const selectedId = selectionManager.getSelectedId();
    const selected = selectedId ? sceneObjectManager.getObject(selectedId) : null;
    if (selected?.type === 'cameraDevice' && selected.metadata?.videoProjection?.quadEditing) {
      return selectedId;
    }

    return sceneObjectManager
      .getObjects()
      .find((object) => object.type === 'cameraDevice' && object.metadata?.videoProjection?.quadEditing)
      ?.id ?? null;
  }

  function addQuadVideoProjectionPoint(cameraId, worldPosition) {
    if (!worldPosition) {
      console.warn('[QuadVideoProjection] add point failed: no valid pick position');
      updateStatusMessage('[QuadVideoProjection] add point failed: no valid pick position');
      return false;
    }

    const cameraObject = sceneObjectManager.getObject(cameraId);
    if (!cameraObject || cameraObject.type !== 'cameraDevice') {
      updateStatusMessage('Camera device not found');
      return false;
    }

    const currentProjection = createDefaultVideoProjectionMetadata(cameraId, cameraObject.metadata?.videoProjection);
    if (!currentProjection.quadEditing || currentProjection.quadPoints.length >= 4) {
      return false;
    }

    const index = currentProjection.quadPoints.length;
    const point = {
      id: `quad-point-${String(index + 1).padStart(3, '0')}`,
      index,
      label: ['左上', '右上', '右下', '左下'][index],
      position: [worldPosition.x, worldPosition.y, worldPosition.z]
    };
    const quadPoints = [...currentProjection.quadPoints, point];
    const editingCompleted = quadPoints.length >= 4;

    const nextProjection = syncCameraProjectionMetadata(cameraId, {
      ...currentProjection,
      mode: currentProjection.mode === 'quad' ? 'quad' : 'quadOverlay',
      quadEditing: !editingCompleted,
      quadPoints
    });

    rebuildQuadProjectionHelpers(cameraId);
    console.log(`[FourPointProjection] picked world point ${index}`, {
      x: worldPosition.x,
      y: worldPosition.y,
      z: worldPosition.z
    });
    updateStatusMessage(`四点区域投影点位: ${quadPoints.length} / 4`);

    if (editingCompleted) {
      console.log(`[QuadVideoProjection] editing completed: objectId=${cameraId}`);
      updateStatusMessage(`[QuadVideoProjection] editing completed: objectId=${cameraId}`);
    }

    return true;
  }

  function clearQuadVideoProjectionPoints(cameraId) {
    const cameraObject = sceneObjectManager.getObject(cameraId);
    if (!cameraObject || cameraObject.type !== 'cameraDevice') {
      updateStatusMessage('Camera device not found');
      return false;
    }

    projectionEditingController.clear(projectionCompatibilityAdapter.getProjectionIdForObject(cameraId));
    syncCameraProjectionMetadata(cameraId, {
      ...cameraObject.metadata?.videoProjection,
      enabled: false,
      quadEditing: false,
      quadPoints: []
    });
    cameraProjectionManager.clearFourPoints(cameraId);
    clearQuadProjectionHelpers(cameraId);
    updateStatusMessage('四点区域投影点位已清空');
    return true;
  }

  function updateActiveProjectorFromProjection(cameraId, projection) {
    const target = sceneObjectManager.getObject(cameraId);
    if (!target || !projection) {
      return;
    }

    console.log('[Projection] sync active projector', {
      cameraId,
      mode: projection.mode,
      enabled: projection.enabled,
      replaceMode: projection.replaceMode,
      quadPoints: projection.quadPoints?.length ?? 0
    });
    syncProjectionArchitectureFromSceneObjects();
    projectionScheduler.evaluate({
      projectionConfigs: projectionConfigRegistry.getAll(),
      sourceRegistry: cameraSourceRegistry,
      runtimePool: cameraSourceRuntimePool
    });
    gsplatProjectionRenderer.syncActiveSet(projectionScheduler.getActiveSet()).catch((error) => {
      console.warn('[Projection] renderer sync failed:', error);
    });
  }

  function getCurrentSplatState() {
    return {
      entity: currentGsplatEntity,
      asset: currentAsset,
      blobUrl: currentBlobUrl
    };
  }

  function updateDebugHandles() {
    window.app = app;
    window.pc = pc;
    window.currentSplatEntity = currentGsplatEntity;
    window.currentSplatAsset = currentAsset;
    window.cameraController = cameraController;
    window.bimProxyManager = bimProxyManager;
    window.bimAlignmentManager = bimAlignmentManager;
    window.markerManager = markerManager;
    window.sceneObjectManager = sceneObjectManager;
    window.selectionManager = selectionManager;
    window.robotDogPatrolController = robotDogPatrolController;
    window.placementMode = placementMode;
    window.cameraProjectionManager = cameraProjectionManager;
    window.cameraVideoRuntimes = cameraVideoRuntimes;
    window.cameraSourceRegistry = cameraSourceRegistry;
    window.cameraSourceRuntimePool = cameraSourceRuntimePool;
    window.projectionConfigRegistry = projectionConfigRegistry;
    window.projectionScheduler = projectionScheduler;
    window.gsplatProjectionRenderer = gsplatProjectionRenderer;
    window.projectionDiagnostics = projectionDiagnostics;
    window.createRobotDog = createRobotDog;
    window.startRobotDogRouteEditing = startRobotDogRouteEditing;
    window.startRobotDogPatrol = startRobotDogPatrol;
    window.stopRobotDogPatrol = stopRobotDogPatrol;
    window.enableCameraVideoProjection = enableCameraVideoProjection;
    window.disableCameraVideoProjection = disableCameraVideoProjection;
    window.updateCameraVideoProjection = updateCameraVideoProjection;
    window.toggleCameraVideoProjection = toggleCameraVideoProjection;
    window.startQuadVideoProjectionEditing = startQuadVideoProjectionEditing;
    window.stopQuadVideoProjectionEditing = stopQuadVideoProjectionEditing;
    window.addQuadVideoProjectionPoint = addQuadVideoProjectionPoint;
    window.clearQuadVideoProjectionPoints = clearQuadVideoProjectionPoints;
    window.applyQuadVideoProjection = applyQuadVideoProjection;
    window.startBuildingEnvelopeDrawing = startBuildingEnvelopeDrawing;
    window.stopBuildingEnvelopeDrawing = stopBuildingEnvelopeDrawing;
    window.cancelBuildingEnvelopeDrawing = cancelBuildingEnvelopeDrawing;
    window.addBuildingEnvelopePoint = addBuildingEnvelopePoint;
    window.undoBuildingEnvelopePoint = undoBuildingEnvelopePoint;
    window.clearBuildingEnvelopeDraft = clearBuildingEnvelopeDraft;
    window.finishBuildingEnvelopeDrawing = finishBuildingEnvelopeDrawing;
    window.createBuildingEnvelopeFromPoints = createBuildingEnvelopeFromPoints;
    window.updateBuildingEnvelope = updateBuildingEnvelope;
    window.setBuildingEnvelopeHeight = setBuildingEnvelopeHeight;
    window.setBuildingEnvelopeColor = setBuildingEnvelopeColor;
    window.setBuildingEnvelopeOpacity = setBuildingEnvelopeOpacity;
    window.setBuildingEnvelopeOutlineVisible = setBuildingEnvelopeOutlineVisible;
    window.deleteBuildingEnvelope = deleteBuildingEnvelope;
  }

  function formatCameraState() {
    const next = cameraController.getState();
    return {
      target: `${next.target.x.toFixed(2)}, ${next.target.y.toFixed(2)}, ${next.target.z.toFixed(2)}`,
      distance: next.distance.toFixed(2),
      yaw: next.yaw.toFixed(1),
      pitch: next.pitch.toFixed(1)
    };
  }

  function formatAlignmentStatus(alignment) {
    return `BIM alignment applied: x=${alignment.position[0].toFixed(2)}, y=${alignment.position[1].toFixed(2)}, z=${alignment.position[2].toFixed(2)}, ry=${alignment.rotation[1].toFixed(1)}, scale=${alignment.scale[0].toFixed(2)}`;
  }

  function applyTransformToObject(objectId, transform, options = {}) {
    const object = sceneObjectManager.getObject(objectId);
    if (!object?.entity) {
      console.warn('[Transform] missing entity:', objectId);
      return false;
    }

    const fallbackTransform = object.transform ?? getTransformFromEntity(object.entity);
    const nextTransform = sanitizeTransformInput(transform, fallbackTransform);
    const [x, y, z] = nextTransform.position;
    const [rx, ry, rz] = nextTransform.rotation;
    const [sx, sy, sz] = nextTransform.scale;

    // Business objects are attached under the scene root, so keeping this
    // transform in scene state preserves the same world placement.
    object.entity.setLocalPosition(x, y, z);
    object.entity.setLocalEulerAngles(rx, ry, rz);
    object.entity.setLocalScale(sx, sy, sz);

    sceneObjectManager.updateObject(objectId, {
      transform: nextTransform
    });

    if (options.updateBimAlignment) {
      bimAlignmentManager.setCurrent(nextTransform);
    }

    if (!options.silentLog) {
      console.log('[Transform] committed:', objectId, nextTransform);
    }
    return nextTransform;
  }

  function getTransformForObject(objectId) {
    const object = sceneObjectManager.getObject(objectId);
    if (!object) {
      return null;
    }

    return cloneTransform(object.transform ?? getTransformFromEntity(object.entity));
  }

  function pushLog(message) {
    state.logs = [message, ...state.logs].slice(0, MAX_LOGS);
  }

  function buildAssetsSnapshot() {
    const builtInAssets = [
      {
        id: 'base-map',
        kind: 'gsplat',
        label: 'base.sog',
        status: assetAvailability[ASSET_PATHS.baseSog],
        sourceName: 'base.sog',
        type: 'gsplat',
        size: null,
        url: ASSET_PATHS.baseSog,
        createdAt: null
      }
    ];

    if (UI_FLAGS.showDebugAssets) {
      builtInAssets.push(
        {
          id: 'bim-proxy',
          kind: 'bim',
          label: ASSET_LABELS.bimProxy,
          status: assetAvailability[ASSET_PATHS.bimProxy],
          sourceName: ASSET_LABELS.bimProxy,
          type: 'glb',
          size: null,
          url: ASSET_PATHS.bimProxy,
          createdAt: null
        },
        {
          id: 'converted-sog',
          kind: 'gsplat',
          label: 'converted/map.sog',
          status: assetAvailability[ASSET_PATHS.convertedSog],
          sourceName: 'converted/map.sog',
          type: 'gsplat',
          size: null,
          url: ASSET_PATHS.convertedSog,
          createdAt: null
        }
      );
    }

    const uploadedAssets = state.uploadedAssets.map((asset) => ({
      id: asset.id,
      kind: asset.type,
      label: asset.sourceName,
      status: asset.status ?? 'uploaded',
      sourceName: asset.sourceName,
      type: asset.type,
      size: asset.size,
      url: asset.url,
      createdAt: asset.createdAt,
      role: asset.role,
      runtimeType: asset.runtimeType,
      sourceAssetId: asset.sourceAssetId ?? null,
      derivedAssetIds: Array.isArray(asset.derivedAssetIds) ? [...asset.derivedAssetIds] : [],
      derivedAssets: Array.isArray(asset.derivedAssets) ? asset.derivedAssets.map((derivedAsset) => ({ ...derivedAsset })) : [],
      preferredRuntimeAsset: asset.preferredRuntimeAsset ? { ...asset.preferredRuntimeAsset } : null,
      error: asset.error ?? null
    }));

    return [...builtInAssets, ...uploadedAssets];
  }

  function buildRuntimeSnapshot() {
    state.objects = sceneObjectManager.getObjectSnapshots();
    state.selectedId = selectionManager.getSelectedId();
    state.selectedObject = selectionManager.getSelectedSnapshot();
    state.activeEditMode = getCurrentEditMode();
    state.alignment = bimAlignmentManager.getCurrent();
    state.assets = buildAssetsSnapshot();
    state.cameraStreams = buildCameraStreamsSnapshot();
    state.statusMessage = statusState.message;
    state.statusSummary = {
      sog: statusState.sog.detail,
      bim: statusState.bim.detail,
      pick: statusState.pick.detail
    };
    state.transformEdit = buildTransformEditSnapshot();

    return {
      objects: state.objects,
      selectedId: state.selectedId,
      selectedObject: state.selectedObject,
      activeEditMode: state.activeEditMode,
      alignment: state.alignment,
      steps: { ...state.steps },
      logs: [...state.logs],
      assets: state.assets,
      cameraStreams: state.cameraStreams,
      statusMessage: state.statusMessage,
      statusSummary: { ...state.statusSummary },
      transformEdit: state.transformEdit,
      contextMenu: { ...state.contextMenu },
      cameraState: formatCameraState()
    };
  }

  function getCameraViewState() {
    const next = cameraController.getState();
    return {
      target: [next.target.x, next.target.y, next.target.z],
      distance: next.distance,
      yaw: next.yaw,
      pitch: next.pitch
    };
  }

  function restoreCameraView(view = null) {
    if (!view || typeof view !== 'object') {
      cameraController.reset();
      emitState();
      return false;
    }

    const target = Array.isArray(view.target) ? view.target : [0, 0, 0];
    const distance = Number.isFinite(Number(view.distance)) ? Number(view.distance) : 80;
    const yaw = Number.isFinite(Number(view.yaw)) ? Number(view.yaw) : 0;
    const pitch = Number.isFinite(Number(view.pitch)) ? Number(view.pitch) : 45;

    cameraController.focus(new pc.Vec3(target[0] ?? 0, target[1] ?? 0, target[2] ?? 0), distance, {
      yaw,
      pitch
    });
    emitState();
    return true;
  }

  function flushState() {
    const snapshot = buildRuntimeSnapshot();
    listeners.forEach((listener) => listener(snapshot));
  }

  function emitState() {
    if (emitScheduled) {
      return;
    }

    emitScheduled = true;
    requestAnimationFrame(() => {
      emitScheduled = false;
      flushState();
    });
  }

  function updateStatusMessage(message, options = {}) {
    statusState.message = message;
    if (!options.skipLog) {
      pushLog(message);
    }
    emitState();
  }

  function buildTransformEditSnapshot() {
    return {
      enabled: transformEditState.enabled,
      objectId: transformEditState.objectId,
      startTransform: transformEditState.startTransform
        ? cloneTransform(transformEditState.startTransform)
        : null,
      dragMode: transformEditState.dragMode
    };
  }

  function clearTransformEditState() {
    transformEditState.enabled = false;
    transformEditState.objectId = null;
    transformEditState.startTransform = null;
    transformEditState.dragMode = 'none';
  }

  function syncTransformEditStatusMessage() {
    if (transformEditState.enabled && transformEditState.objectId) {
      const editingObject = sceneObjectManager.getObject(transformEditState.objectId);
      const objectName = editingObject?.displayName ?? editingObject?.name ?? transformEditState.objectId;
      updateStatusMessage(`Transform edit enabled: ${objectName} | Drag: ${transformEditState.dragMode}`, {
        skipLog: true
      });
      return;
    }

    const selectedObject = selectionManager.getSelectedObject();
    if (selectedObject) {
      updateStatusMessage(`Selected: ${selectedObject.displayName ?? selectedObject.name} | Transform edit: off`, {
        skipLog: true
      });
    }
  }

  function isTransformEditSelectionBlocked(nextObjectId) {
    return Boolean(
      transformEditState.enabled &&
      transformEditState.objectId &&
      nextObjectId &&
      transformEditState.objectId !== nextObjectId
    );
  }

  function enterTransformEdit(objectId = selectionManager.getSelectedId()) {
    const selectedObject = sceneObjectManager.getObject(objectId);
    if (!selectedObject) {
      updateStatusMessage('No selection');
      return false;
    }

    if (!TRANSFORM_EDITABLE_TYPES.has(selectedObject.type)) {
      updateStatusMessage(`${selectedObject.displayName ?? selectedObject.name} transform is not editable`);
      return false;
    }

    if (getEditingQuadProjectionCameraId()) {
      updateStatusMessage('请先完成四点选择');
      return false;
    }

    if (buildingEnvelopeController.isDrawing()) {
      updateStatusMessage('请先完成当前编辑模式');
      return false;
    }

    if (robotDogPatrolController.getEditingRobotDogId()) {
      updateStatusMessage('请先完成当前编辑模式');
      return false;
    }

    transformEditState.enabled = true;
    transformEditState.objectId = selectedObject.id;
    transformEditState.startTransform = getTransformForObject(selectedObject.id);
    transformEditState.dragMode = 'none';
    console.info('[TransformEdit] enter', selectedObject.id);
    syncTransformEditStatusMessage();
    emitState();
    return true;
  }

  function commitTransformEdit(options = {}) {
    if (!transformEditState.enabled) {
      return false;
    }

    const objectId = transformEditState.objectId;
    console.info('[TransformEdit] commit', objectId);
    clearTransformEditState();

    if (!options.skipStatusMessage) {
      syncTransformEditStatusMessage();
    }

    emitState();
    return true;
  }

  function cancelTransformEdit(options = {}) {
    if (!transformEditState.enabled) {
      return false;
    }

    const objectId = transformEditState.objectId;
    const startTransform = transformEditState.startTransform;

    if (objectId && startTransform) {
      applyTransformToObject(objectId, startTransform, {
        silentLog: true
      });
    }

    console.info('[TransformEdit] cancel', objectId);
    clearTransformEditState();

    if (!options.skipStatusMessage) {
      syncTransformEditStatusMessage();
    }

    emitState();
    return true;
  }

  function setUploadedAssets(assets) {
    state.uploadedAssets = Array.isArray(assets) ? assets.map((asset) => ({ ...asset })) : [];
    emitState();
  }

  function setSogStatus(stateName, detail, message = detail) {
    statusState.sog.state = stateName;
    statusState.sog.detail = detail;
    updateStatusMessage(message);
  }

  function setBimStatus(stateName, detail, message = detail) {
    statusState.bim.state = stateName;
    statusState.bim.detail = detail;
    updateStatusMessage(message);
  }

  function setPickStatus(stateName, detail, message = detail) {
    statusState.pick.state = stateName;
    statusState.pick.detail = detail;
    updateStatusMessage(message);
  }

  function destroySplatState(nextState) {
    if (nextState.entity) {
      nextState.entity.destroy();
    }

    if (nextState.asset) {
      nextState.asset.off();
      nextState.asset.unload();
      if (app.assets.get(nextState.asset.id)) {
        app.assets.remove(nextState.asset);
      }
    }

    if (nextState.blobUrl) {
      URL.revokeObjectURL(nextState.blobUrl);
    }
  }

  function resizeViewport() {
    const rect = viewportElement.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      app.resizeCanvas(rect.width, rect.height);
    }
  }

  const resizeObserver = new ResizeObserver(() => {
    resizeViewport();
  });
  resizeObserver.observe(viewportElement);
  window.addEventListener('resize', resizeViewport);

  function getGsplatBounds(entity, asset) {
    const candidates = [
      entity?.gsplat?.instance?.meshInstance?.aabb,
      entity?.gsplat?.instance?.resource?.aabb,
      entity?.gsplat?.customAabb,
      asset?.resource?.aabb
    ];

    for (const candidate of candidates) {
      if (candidate?.center && candidate?.halfExtents) {
        return candidate.clone ? candidate.clone() : candidate;
      }
    }

    return null;
  }

  function focusLoadedMap(entity = currentGsplatEntity, asset = currentAsset) {
    const aabb = getGsplatBounds(entity, asset);
    if (aabb) {
      cameraController.focusAabb(aabb, {
        yaw: 0,
        pitch: 45,
        minDistance: 80
      });
      emitState();
      return true;
    }

    cameraController.focus(new pc.Vec3(0, 0, 0), 80, {
      yaw: 0,
      pitch: 45
    });
    emitState();
    return true;
  }

  function createGsplatEntity(name, asset) {
    const entity = new pc.Entity(name);
    entity.addComponent('gsplat', { asset });
    app.root.addChild(entity);
    return entity;
  }

  function getDefaultCreatePosition() {
    const lastPickWorldPosition = pickingController?.getLastPickWorldPosition?.();
    if (lastPickWorldPosition) {
      return [lastPickWorldPosition.x, lastPickWorldPosition.y, lastPickWorldPosition.z];
    }

    const marker = markerManager.marker;
    if (marker?.getPosition) {
      const position = marker.getPosition();
      return [position.x, position.y, position.z];
    }

    return [0, 0, 0];
  }

  function createBusinessPlaceholderEntity(type, displayName) {
    const entity = new pc.Entity(displayName);
    const material = new pc.StandardMaterial();

    switch (type) {
      case 'empty': {
        material.diffuse = new pc.Color(0.86, 0.88, 0.92);
        material.opacity = 0.25;
        material.blendType = pc.BLEND_NORMAL;
        material.update();
        entity.addComponent('render', {
          type: 'box',
          castShadows: false,
          receiveShadows: false,
          material
        });
        entity.setLocalScale(0.4, 0.4, 0.4);
        break;
      }
      case 'robot':
      case 'robotDog': {
        material.diffuse = new pc.Color(0.91, 0.63, 0.22);
        material.update();
        const body = new pc.Entity(`${displayName}-Body`);
        body.addComponent('render', {
          type: 'box',
          castShadows: false,
          receiveShadows: false,
          material
        });
        body.setLocalScale(0.9, 0.42, 1.1);
        body.setLocalPosition(0, 0.35, 0);
        entity.addChild(body);

        const noseMaterial = new pc.StandardMaterial();
        noseMaterial.diffuse = new pc.Color(0.98, 0.28, 0.16);
        noseMaterial.emissive = new pc.Color(0.45, 0.08, 0.04);
        noseMaterial.update();

        const nose = new pc.Entity(`${displayName}-Forward`);
        nose.addComponent('render', {
          type: 'cone',
          castShadows: false,
          receiveShadows: false,
          material: noseMaterial
        });
        nose.setLocalScale(0.22, 0.4, 0.22);
        nose.setLocalEulerAngles(90, 0, 0);
        nose.setLocalPosition(0, 0.35, 0.78);
        entity.addChild(nose);
        break;
      }
      case 'cameraDevice': {
        material.diffuse = new pc.Color(0.38, 0.79, 0.96);
        material.update();
        entity.addComponent('render', {
          type: 'box',
          castShadows: false,
          receiveShadows: false,
          material
        });
        entity.setLocalScale(0.45, 0.32, 0.75);
        break;
      }
      case 'device': {
        material.diffuse = new pc.Color(0.52, 0.82, 0.44);
        material.update();
        entity.addComponent('render', {
          type: 'box',
          castShadows: false,
          receiveShadows: false,
          material
        });
        entity.setLocalScale(0.45, 0.45, 0.45);
        break;
      }
      case 'hotspot': {
        material.diffuse = new pc.Color(0.94, 0.28, 0.45);
        material.emissive = new pc.Color(0.35, 0.04, 0.12);
        material.update();
        entity.addComponent('render', {
          type: 'sphere',
          castShadows: false,
          receiveShadows: false,
          material
        });
        entity.setLocalScale(0.35, 0.35, 0.35);
        break;
      }
      case 'annotation': {
        material.diffuse = new pc.Color(0.98, 0.9, 0.35);
        material.update();
        entity.addComponent('render', {
          type: 'sphere',
          castShadows: false,
          receiveShadows: false,
          material
        });
        entity.setLocalScale(0.3, 0.3, 0.3);
        break;
      }
      case 'routePoint': {
        material.diffuse = new pc.Color(0.72, 0.55, 0.96);
        material.update();
        entity.addComponent('render', {
          type: 'sphere',
          castShadows: false,
          receiveShadows: false,
          material
        });
        entity.setLocalScale(0.28, 0.28, 0.28);
        break;
      }
      default:
        return null;
    }

    app.root.addChild(entity);
    return entity;
  }

  function bindSceneObjectEntity(entity, objectId, objectType) {
    if (!entity || !objectId) {
      return false;
    }

    const visit = (node) => {
      node.tags?.add?.('selectable');
      if (objectType) {
        node.tags?.add?.(objectType);
      }
      node._sceneObjectId = objectId;
      node._sceneObjectType = objectType ?? null;
      node.render?.meshInstances?.forEach?.((meshInstance) => {
        meshInstance._sceneObjectId = objectId;
        meshInstance._sceneObjectType = objectType ?? null;
      });
      node.children?.forEach?.(visit);
    };

    visit(entity);
    return true;
  }

  function createBusinessSceneObject(type, options = {}) {
    const definition = BUSINESS_OBJECT_DEFINITIONS[type];
    if (!definition) {
      updateStatusMessage(`Unsupported object type: ${type}`);
      return null;
    }

    const id = options.id || createBusinessObjectId(type, definition.idPrefix);
    const displayName = options.displayName || definition.displayName;
    const entity = createBusinessPlaceholderEntity(type, displayName);
    if (!entity) {
      updateStatusMessage(`Create object failed: ${displayName}`);
      return null;
    }

    const transform = sanitizeTransformInput(options.transform, {
      position: getDefaultCreatePosition(),
      rotation: [0, 0, 0],
      scale: [1, 1, 1]
    });

    entity.setLocalPosition(...transform.position);
    entity.setLocalEulerAngles(...transform.rotation);
    entity.setLocalScale(...transform.scale);
    bindSceneObjectEntity(entity, id, type);

    const projectionMetadata = type === 'cameraDevice'
      ? createDefaultVideoProjectionMetadata(id, options.metadata?.videoProjection)
      : null;
    const patrolMetadata = type === 'robotDog'
      ? clonePatrolMetadata(options.metadata?.patrol ?? robotDogPatrolController.buildRobotDogMetadata().patrol)
      : undefined;

    sceneObjectManager.addObject({
      id,
      name: displayName,
      displayName,
      type,
      typeLabel: definition.typeLabel,
      entity,
      transform: getTransformFromEntity(entity),
      visible: options.visible ?? true,
      status: options.status ?? 'active',
      metadata: {
        ...(options.metadata ?? {}),
        businessType: options.metadata?.businessType ?? definition.businessType,
        source: options.metadata?.source ?? 'editor-created',
        placedBy: options.metadata?.placedBy,
        videoProjection: projectionMetadata,
        patrol: patrolMetadata
      }
    });

    if (options.visible === false) {
      sceneObjectManager.setVisible(id, false);
    }

    if (type === 'cameraDevice' && projectionMetadata) {
      syncProjectionInstanceForCamera(id, projectionMetadata);
    }

    selectionManager.select(id);
    if (type === 'robotDog') {
      robotDogPatrolController.syncExistingRobotDogs();
    }
    updateStatusMessage(`Added scene object: ${displayName}`);
    return { id, type, entity };
  }

  function getNextBuildingEnvelopeName() {
    buildingEnvelopeCounter += 1;
    return `建筑多边体 ${String(buildingEnvelopeCounter).padStart(3, '0')}`;
  }

  function getBuildingEnvelopeObject(objectId) {
    const sceneObject = sceneObjectManager.getObject(objectId);
    if (!sceneObject || sceneObject.type !== BUILDING_ENVELOPE_TYPE) {
      return null;
    }

    return sceneObject;
  }

  function syncBuildingEnvelopeVisualState(objectId) {
    return selectableObjectController.refreshObjectVisualState(objectId);
  }

  function setBuildingEnvelopeHover(objectId) {
    return selectableObjectController.setHoveredObject(objectId);
  }

  function clearBuildingEnvelopeHover() {
    return selectableObjectController.clearHoveredObject();
  }

  function isSelectableHoverBlocked() {
    return Boolean(
      buildingEnvelopeController.isDrawing()
      || getEditingQuadProjectionCameraId()
      || robotDogPatrolController.getEditingRobotDogId()
    );
  }

  function refreshTransformGizmo() {
    const selectedObject = selectionManager.getSelectedObject();
    const isTransformEditingSelection = Boolean(
      transformEditState.enabled &&
      transformEditState.objectId &&
      transformEditState.objectId === selectedObject?.id
    );

    if (!selectedObject || !isTransformEditingSelection || isSelectableHoverBlocked() || !isDraggableObject(selectedObject)) {
      transformGizmo.hide();
      return;
    }

    transformGizmo.showFor(selectedObject);
  }

  function createBuildingEnvelopeFromPoints(points, options = {}) {
    const envelope = createDefaultEnvelopeMetadata({
      ...options,
      points,
      height: options.height ?? options.metadata?.envelope?.height ?? 5,
      topVisible: options.metadata?.envelope?.topVisible ?? true,
      sideVisible: options.metadata?.envelope?.sideVisible ?? true,
      displayMode: options.metadata?.envelope?.displayMode ?? 'overlay'
    });

    if (envelope.points.length < 3) {
      console.warn('[BuildingEnvelope] create failed: needs at least 3 points');
      updateStatusMessage('[BuildingEnvelope] create failed: needs at least 3 points');
      return null;
    }

    const displayName = options.displayName || getNextBuildingEnvelopeName();
    const entity = buildingEnvelopeController.createEnvelopeEntity(displayName, envelope);
    if (!entity) {
      console.error('[BuildingEnvelope] create failed: entity build returned null');
      updateStatusMessage('[BuildingEnvelope] create failed: entity build returned null');
      return null;
    }

    app.root.addChild(entity);
    const id = options.id || createBusinessObjectId(BUILDING_ENVELOPE_TYPE, 'building_envelope');
    buildingEnvelopeController.bindEnvelopeEntity(entity, id, envelope);
    sceneObjectManager.addObject({
      id,
      name: displayName,
      displayName,
      type: BUILDING_ENVELOPE_TYPE,
      typeLabel: BUSINESS_OBJECT_DEFINITIONS[BUILDING_ENVELOPE_TYPE].typeLabel,
      entity,
      transform: getTransformFromEntity(entity),
      visible: options.visible ?? true,
      status: options.status ?? 'ready',
      metadata: {
        ...(options.metadata ?? {}),
        businessType: BUSINESS_OBJECT_DEFINITIONS[BUILDING_ENVELOPE_TYPE].businessType,
        source: options.metadata?.source ?? 'editor-created',
        placedBy: options.metadata?.placedBy ?? 'building-envelope-drawing',
        envelope
      }
    });
    const envelopeCenter = getEnvelopeWorldCenter(envelope);
    console.log('[BuildingEnvelope] create payload', {
      objectId: id,
      center: envelopeCenter ? [envelopeCenter.x, envelopeCenter.y, envelopeCenter.z] : null,
      height: envelope.height,
      upAxis: envelope.upAxis,
      points: cloneEnvelopePoints(envelope.points),
      entityEnabled: entity.enabled,
      childCount: entity.children.length
    });
    selectionManager.select(id);
    selectableObjectController.refreshObjectVisualState(id);
    console.log(`[BuildingEnvelope] created: objectId=${id} height=${envelope.height}`);
    updateStatusMessage(`[BuildingEnvelope] created: objectId=${id} height=${envelope.height}`);
    return { id, entity };
  }

  function updateBuildingEnvelope(objectId, patch = {}) {
    const sceneObject = getBuildingEnvelopeObject(objectId);
    if (!sceneObject?.entity) {
      console.warn('[BuildingEnvelope] update failed: object not found', { objectId });
      return false;
    }

    const currentEnvelope = createDefaultEnvelopeMetadata(sceneObject.metadata?.envelope ?? {});
    const nextEnvelope = createDefaultEnvelopeMetadata({
      ...currentEnvelope,
      ...patch,
      points: patch.points ?? currentEnvelope.points
    });

    // Preserve the serialized source of truth and rebuild the render entity from it.
    buildingEnvelopeController.rebuildEnvelopeEntity(sceneObject.entity, nextEnvelope);
    buildingEnvelopeController.bindEnvelopeEntity(sceneObject.entity, objectId, nextEnvelope);
    sceneObjectManager.updateObject(objectId, {
      transform: getTransformFromEntity(sceneObject.entity),
      metadata: {
        ...sceneObject.metadata,
        envelope: nextEnvelope
      }
    });
    selectableObjectController.refreshObjectVisualState(objectId);
    console.log(`[BuildingEnvelope] updated: objectId=${objectId}`);
    updateStatusMessage(`[BuildingEnvelope] updated: objectId=${objectId}`);
    return true;
  }

  function setBuildingEnvelopeHeight(objectId, height) {
    const nextHeight = Math.max(0, readNumberValue(height, 0));
    const sceneObject = getBuildingEnvelopeObject(objectId);
    if (!sceneObject) {
      console.warn('[BuildingEnvelope] height changed failed: object not found', { objectId });
      return false;
    }

    const currentEnvelope = createDefaultEnvelopeMetadata(sceneObject.metadata?.envelope ?? {});
    const shouldPromoteVolumeFaces = currentEnvelope.height <= 0 && nextHeight > 0;
    const changed = updateBuildingEnvelope(objectId, {
      ...currentEnvelope,
      height: nextHeight,
      // Envelopes are created at height 0 with top/side hidden, so the first height increase
      // should reveal the actual volume instead of keeping an invisible ground-only footprint.
      topVisible: nextHeight <= 0 ? false : (shouldPromoteVolumeFaces ? true : currentEnvelope.topVisible !== false),
      sideVisible: nextHeight <= 0 ? false : (shouldPromoteVolumeFaces ? true : currentEnvelope.sideVisible !== false)
    });
    if (!changed) {
      return false;
    }

    const nextObject = getBuildingEnvelopeObject(objectId);
    const envelopeCenter = getEnvelopeWorldCenter(nextObject?.metadata?.envelope);
    console.log('[BuildingEnvelope] height changed', {
      objectId,
      height: nextHeight,
      center: envelopeCenter ? [envelopeCenter.x, envelopeCenter.y, envelopeCenter.z] : null
    });
    updateStatusMessage(`[BuildingEnvelope] height changed: objectId=${objectId} height=${nextHeight}`);
    return true;
  }

  function setBuildingEnvelopeColor(objectId, color) {
    return updateBuildingEnvelope(objectId, { color });
  }

  function setBuildingEnvelopeOpacity(objectId, opacity) {
    const changed = updateBuildingEnvelope(objectId, { opacity });
    if (changed) {
      console.log(`[BuildingEnvelope] opacity changed: objectId=${objectId} opacity=${opacity}`);
    }
    return changed;
  }

  function setBuildingEnvelopeOutlineVisible(objectId, visible) {
    return updateBuildingEnvelope(objectId, { outlineVisible: Boolean(visible) });
  }

  function deleteBuildingEnvelope(objectId) {
    const sceneObject = getBuildingEnvelopeObject(objectId);
    if (!sceneObject) {
      return false;
    }

    if (selectableObjectController.getHoveredObjectId() === objectId) {
      clearBuildingEnvelopeHover();
    }

    const deleted = deleteSceneObject(objectId);
    if (deleted) {
      console.log(`[BuildingEnvelope] deleted: objectId=${objectId}`);
    }
    return deleted;
  }

  function getSelectedRobotDogId() {
    const selectedId = selectionManager.getSelectedId();
    const object = selectedId ? sceneObjectManager.getObject(selectedId) : null;
    return object?.type === 'robotDog' ? object.id : null;
  }

  function resolveRobotDogId(robotDogId = null) {
    return robotDogId || getSelectedRobotDogId();
  }

  function createRobotDog(options = {}) {
    const transform = sanitizeTransformInput(options.transform, {
      position: getDefaultCreatePosition(),
      rotation: [0, 0, 0],
      scale: [1, 1, 1]
    });
    const result = createBusinessSceneObject('robotDog', {
      id: options.id,
      displayName: options.displayName || '机器狗',
      transform,
      visible: options.visible ?? true,
      status: options.status ?? 'ready',
      metadata: {
        ...(options.metadata ?? {}),
        businessType: 'robotDog',
        source: options.metadata?.source ?? 'editor-created',
        placedBy: options.metadata?.placedBy ?? 'toolbar',
        patrol: robotDogPatrolController.buildRobotDogMetadata(options.metadata).patrol
      }
    });

    if (!result) {
      return null;
    }

    const robotDogId = result.id;
    console.log(`[RobotDogPatrol] robot dog created: robotDogId=${robotDogId}`);
    updateStatusMessage(`[RobotDogPatrol] robot dog created: robotDogId=${robotDogId}`);
    return result;
  }

  function startRobotDogRouteEditing(robotDogId = null) {
    const resolvedId = resolveRobotDogId(robotDogId);
    if (!resolvedId) {
      console.log('[RobotDogPatrol] route editing failed: selected object is not robotDog');
      updateStatusMessage('[RobotDogPatrol] route editing failed: selected object is not robotDog');
      return false;
    }

    clearBuildingEnvelopeHover();
    selectionManager.select(resolvedId);
    return robotDogPatrolController.startRouteEditing(resolvedId);
  }

  function stopRobotDogRouteEditing(robotDogId = null) {
    const resolvedId = resolveRobotDogId(robotDogId) ?? robotDogPatrolController.getEditingRobotDogId();
    if (!resolvedId) {
      return false;
    }

    return robotDogPatrolController.stopRouteEditing(resolvedId);
  }

  function addRobotDogRoutePoint(robotDogId, worldPosition) {
    if (!worldPosition) {
      console.warn('[RobotDogPatrol] add waypoint failed: no valid pick position');
      updateStatusMessage('[RobotDogPatrol] add waypoint failed: no valid pick position');
      return false;
    }

    return robotDogPatrolController.addRoutePoint(robotDogId, worldPosition);
  }

  function clearRobotDogRoute(robotDogId = null) {
    const resolvedId = resolveRobotDogId(robotDogId);
    if (!resolvedId) {
      return false;
    }

    return robotDogPatrolController.clearRoute(resolvedId);
  }

  function startRobotDogPatrol(robotDogId = null) {
    const resolvedId = resolveRobotDogId(robotDogId);
    if (!resolvedId) {
      return false;
    }

    return robotDogPatrolController.startPatrol(resolvedId);
  }

  function pauseRobotDogPatrol(robotDogId = null) {
    const resolvedId = resolveRobotDogId(robotDogId);
    if (!resolvedId) {
      return false;
    }

    return robotDogPatrolController.pausePatrol(resolvedId);
  }

  function resumeRobotDogPatrol(robotDogId = null) {
    const resolvedId = resolveRobotDogId(robotDogId);
    if (!resolvedId) {
      return false;
    }

    return robotDogPatrolController.resumePatrol(resolvedId);
  }

  function stopRobotDogPatrol(robotDogId = null) {
    const resolvedId = resolveRobotDogId(robotDogId);
    if (!resolvedId) {
      return false;
    }

    return robotDogPatrolController.stopPatrol(resolvedId);
  }

  function setRobotDogPatrolSpeed(robotDogId = null, speed = 2) {
    const resolvedId = resolveRobotDogId(robotDogId);
    if (!resolvedId) {
      return false;
    }

    return robotDogPatrolController.setPatrolSpeed(resolvedId, speed);
  }

  function setRobotDogPatrolLoop(robotDogId = null, loop = false) {
    const resolvedId = resolveRobotDogId(robotDogId);
    if (!resolvedId) {
      return false;
    }

    return robotDogPatrolController.setPatrolLoop(resolvedId, loop);
  }

  function getRobotDogPatrolState(robotDogId = null) {
    const resolvedId = resolveRobotDogId(robotDogId);
    if (!resolvedId) {
      return null;
    }

    return robotDogPatrolController.getPatrolState(resolvedId);
  }

  function startPlacementMode(type) {
    const definition = BUSINESS_OBJECT_DEFINITIONS[type];
    if (!definition) {
      updateStatusMessage(`Unsupported object type: ${type}`);
      return false;
    }

    placementMode = {
      type,
      label: definition.displayName
    };
    console.debug(`[Placement] mode started: ${type}`);
    updateStatusMessage(`Placement mode: ${definition.displayName}, click map to place`);
    return true;
  }

  function cancelPlacementMode() {
    if (!placementMode) {
      return false;
    }

    placementMode = null;
    console.debug('[Placement] mode cancelled');
    updateStatusMessage('Placement cancelled');
    return true;
  }

  function getCurrentEditMode() {
    if (transformEditState.enabled) {
      return ACTIVE_EDIT_MODE.TRANSFORM;
    }

    if (getEditingQuadProjectionCameraId()) {
      return ACTIVE_EDIT_MODE.QUAD_VIDEO_PROJECTION;
    }

    if (buildingEnvelopeController.isDrawing()) {
      return ACTIVE_EDIT_MODE.BUILDING_ENVELOPE_DRAWING;
    }

    return activeEditMode;
  }

  function resolveEnvelopePickPosition(worldPosition = null) {
    if (worldPosition) {
      return worldPosition.clone?.() ?? worldPosition;
    }

    const lastPickSource = pickingController?.getLastPickSource?.();
    if (lastPickSource && lastPickSource !== 'gsplat') {
      return null;
    }

    const lastPickWorldPosition = pickingController?.getLastPickWorldPosition?.();
    if (lastPickWorldPosition) {
      return lastPickWorldPosition;
    }

    return null;
  }

  function startBuildingEnvelopeDrawing(options = {}) {
    const currentEditMode = getCurrentEditMode();
    if (currentEditMode && currentEditMode !== ACTIVE_EDIT_MODE.BUILDING_ENVELOPE_DRAWING) {
      console.warn('[BuildingEnvelope] drawing failed: another edit mode is active');
      updateStatusMessage('[BuildingEnvelope] drawing failed: another edit mode is active');
      return false;
    }

    clearBuildingEnvelopeHover();
    activeEditMode = ACTIVE_EDIT_MODE.BUILDING_ENVELOPE_DRAWING;
    cancelPlacementMode();
    buildingEnvelopeController.startDrawing(options);
    updateDebugHandles();
    return true;
  }

  function stopBuildingEnvelopeDrawing() {
    const stopped = buildingEnvelopeController.stopDrawing();
    if (stopped && activeEditMode === ACTIVE_EDIT_MODE.BUILDING_ENVELOPE_DRAWING) {
      activeEditMode = null;
    }
    updateDebugHandles();
    return stopped;
  }

  function cancelBuildingEnvelopeDrawing() {
    const cancelled = buildingEnvelopeController.cancelDrawing();
    if (cancelled && activeEditMode === ACTIVE_EDIT_MODE.BUILDING_ENVELOPE_DRAWING) {
      activeEditMode = null;
    }
    updateDebugHandles();
    return cancelled;
  }

  function clearBuildingEnvelopeDraft() {
    buildingEnvelopeController.clearDraft();
    return true;
  }

  function addBuildingEnvelopePoint(worldPosition = null) {
    if (!buildingEnvelopeController.isDrawing()) {
      return false;
    }

    const resolvedWorldPosition = resolveEnvelopePickPosition(worldPosition);
    if (!resolvedWorldPosition) {
      const lastPickSource = pickingController?.getLastPickSource?.() ?? 'unknown';
      console.warn(`[BuildingEnvelope] add point failed: requires gsplat pick, last source=${lastPickSource}`);
      updateStatusMessage(`[BuildingEnvelope] add point failed: requires gsplat pick, last source=${lastPickSource}`);
      return false;
    }

    return buildingEnvelopeController.addPoint(resolvedWorldPosition);
  }

  function undoBuildingEnvelopePoint() {
    return buildingEnvelopeController.undoLastPoint();
  }

  function finishBuildingEnvelopeDrawing(options = {}) {
    const envelope = buildingEnvelopeController.finishDrawing();
    if (!envelope) {
      return null;
    }

    if (activeEditMode === ACTIVE_EDIT_MODE.BUILDING_ENVELOPE_DRAWING) {
      activeEditMode = null;
    }

    return createBuildingEnvelopeFromPoints(envelope.points, {
      ...options,
      metadata: {
        ...(options.metadata ?? {}),
        envelope: {
          ...envelope,
          ...options.metadata?.envelope,
          height: options.metadata?.envelope?.height ?? 5,
          topVisible: options.metadata?.envelope?.topVisible ?? true,
          sideVisible: options.metadata?.envelope?.sideVisible ?? true,
          displayMode: options.metadata?.envelope?.displayMode ?? 'overlay'
        }
      },
      color: envelope.color,
      opacity: envelope.opacity
    });
  }

  function placeBusinessObjectAt(type, worldPoint) {
    if (!worldPoint) {
      return null;
    }

    const definition = BUSINESS_OBJECT_DEFINITIONS[type];
    if (!definition) {
      updateStatusMessage(`Unsupported object type: ${type}`);
      return null;
    }

    const result = createBusinessSceneObject(type, {
      transform: {
        position: [worldPoint.x, worldPoint.y, worldPoint.z],
        rotation: [0, 0, 0],
        scale: [1, 1, 1]
      },
      metadata: {
        businessType: definition.businessType,
        source: 'editor-created',
        placedBy: 'gsplat-pick'
      }
    });

    if (!result) {
      return null;
    }

    placementMode = null;
    console.debug(`[Placement] placed on gsplat: ${type} at ${formatPointLog(worldPoint)}`);
    updateStatusMessage(`Placed ${definition.displayName} at ${formatPointLog(worldPoint)}`);
    return result;
  }

  function resolveSceneObjectIdFromMeshPick(meshInstance) {
    if (meshInstance?._sceneObjectId) {
      return meshInstance._sceneObjectId;
    }

    let node = meshInstance?.node ?? null;
    while (node) {
      if (node._sceneObjectId) {
        return node._sceneObjectId;
      }
      node = node.parent ?? null;
    }

    return null;
  }

  function pickRenderableBusinessObject(screenX, screenY) {
    if (!sceneRenderPicker || !app?.scene || !camera?.camera || !canvas) {
      return null;
    }

    const width = Math.max(1, Math.floor(canvas.clientWidth || canvas.width || 1));
    const height = Math.max(1, Math.floor(canvas.clientHeight || canvas.height || 1));
    sceneRenderPicker.resize?.(width, height);

    const worldLayer = app.scene.layers?.getLayerByName?.('World');
    if (worldLayer) {
      sceneRenderPicker.prepare(camera.camera, app.scene, [worldLayer]);
    } else {
      sceneRenderPicker.prepare(camera.camera, app.scene);
    }

    const selection = sceneRenderPicker.getSelection?.(Math.floor(screenX), Math.floor(screenY), 1, 1) ?? [];
    for (const meshInstance of selection) {
      const objectId = resolveSceneObjectIdFromMeshPick(meshInstance);
      if (!objectId) {
        continue;
      }

      const object = sceneObjectManager.getObject(objectId);
      if (!object || !isPickableObjectType(object.type) || !object.visible) {
        continue;
      }

      return {
        objectId,
        object,
        distanceSq: 0
      };
    }

    return null;
  }

  function getEnvelopeUpAxisVector(upAxis = 'z') {
    return upAxis === 'y' ? new pc.Vec3(0, 1, 0) : new pc.Vec3(0, 0, 1);
  }

  function projectWorldPointToScreen(worldPosition) {
    const point = camera.camera.worldToScreen(worldPosition);
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || point.z < 0 || point.z > 1) {
      return null;
    }

    return {
      x: point.x,
      y: point.y,
      z: point.z
    };
  }

  function isPointInsideScreenPolygon(point, polygon) {
    let inside = false;
    for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
      const currentPoint = polygon[index];
      const previousPoint = polygon[previous];
      const intersects = ((currentPoint.y > point.y) !== (previousPoint.y > point.y))
        && (point.x < ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) / ((previousPoint.y - currentPoint.y) || 1e-6) + currentPoint.x);
      if (intersects) {
        inside = !inside;
      }
    }

    return inside;
  }

  function getDistanceToSegmentSquared(point, start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    if (Math.abs(dx) <= 1e-6 && Math.abs(dy) <= 1e-6) {
      const pointDx = point.x - start.x;
      const pointDy = point.y - start.y;
      return pointDx * pointDx + pointDy * pointDy;
    }

    const t = Math.max(0, Math.min(1, (((point.x - start.x) * dx) + ((point.y - start.y) * dy)) / ((dx * dx) + (dy * dy))));
    const closestX = start.x + (dx * t);
    const closestY = start.y + (dy * t);
    const pointDx = point.x - closestX;
    const pointDy = point.y - closestY;
    return pointDx * pointDx + pointDy * pointDy;
  }

  function getProjectedEnvelopePoints(envelope) {
    const baseWorldPoints = cloneEnvelopePoints(envelope?.points);
    if (baseWorldPoints.length < 3) {
      return null;
    }

    const height = Math.max(0, readNumberValue(envelope?.height, 0));
    const upAxisVector = getEnvelopeUpAxisVector(envelope?.upAxis ?? 'z');
    const baseScreenPoints = [];
    const topScreenPoints = [];

    for (let index = 0; index < baseWorldPoints.length; index += 1) {
      const sourcePoint = baseWorldPoints[index];
      const worldPoint = new pc.Vec3(
        sourcePoint.position?.[0] ?? 0,
        sourcePoint.position?.[1] ?? 0,
        sourcePoint.position?.[2] ?? 0
      );
      const projectedBasePoint = projectWorldPointToScreen(worldPoint);
      if (!projectedBasePoint) {
        return null;
      }
      baseScreenPoints.push(projectedBasePoint);

      if (height > 0.0001) {
        const projectedTopPoint = projectWorldPointToScreen(worldPoint.clone().add(upAxisVector.clone().mulScalar(height)));
        if (!projectedTopPoint) {
          return null;
        }
        topScreenPoints.push(projectedTopPoint);
      }
    }

    return {
      baseScreenPoints,
      topScreenPoints,
      hasVolume: height > 0.0001
    };
  }

  function getBuildingEnvelopePickHit(object, screenX, screenY) {
    const envelope = object?.metadata?.envelope;
    if (!envelope) {
      return null;
    }

    const projectedEnvelope = getProjectedEnvelopePoints(envelope);
    if (!projectedEnvelope) {
      return null;
    }

    const point = { x: screenX, y: screenY };
    const edgeThresholdSq = 18 * 18;
    let bestDistanceSq = Number.POSITIVE_INFINITY;
    let insideVisibleFace = false;

    const collectEdgeDistance = (polygon) => {
      for (let index = 0; index < polygon.length; index += 1) {
        const nextIndex = (index + 1) % polygon.length;
        bestDistanceSq = Math.min(
          bestDistanceSq,
          getDistanceToSegmentSquared(point, polygon[index], polygon[nextIndex])
        );
      }
    };

    if (envelope.outlineVisible !== false) {
      collectEdgeDistance(projectedEnvelope.baseScreenPoints);
      if (projectedEnvelope.hasVolume && envelope.topVisible !== false) {
        collectEdgeDistance(projectedEnvelope.topScreenPoints);
      }
      if (projectedEnvelope.hasVolume && envelope.sideVisible !== false) {
        for (let index = 0; index < projectedEnvelope.baseScreenPoints.length; index += 1) {
          bestDistanceSq = Math.min(
            bestDistanceSq,
            getDistanceToSegmentSquared(
              point,
              projectedEnvelope.baseScreenPoints[index],
              projectedEnvelope.topScreenPoints[index]
            )
          );
        }
      }
    }

    if (envelope.fillVisible !== false) {
      if (!projectedEnvelope.hasVolume) {
        insideVisibleFace = isPointInsideScreenPolygon(point, projectedEnvelope.baseScreenPoints);
      } else {
        if (envelope.topVisible !== false) {
          insideVisibleFace = insideVisibleFace || isPointInsideScreenPolygon(point, projectedEnvelope.topScreenPoints);
        }

        if (!insideVisibleFace && envelope.sideVisible !== false) {
          for (let index = 0; index < projectedEnvelope.baseScreenPoints.length; index += 1) {
            const nextIndex = (index + 1) % projectedEnvelope.baseScreenPoints.length;
            const sideQuad = [
              projectedEnvelope.baseScreenPoints[index],
              projectedEnvelope.baseScreenPoints[nextIndex],
              projectedEnvelope.topScreenPoints[nextIndex],
              projectedEnvelope.topScreenPoints[index]
            ];
            if (isPointInsideScreenPolygon(point, sideQuad)) {
              insideVisibleFace = true;
              break;
            }
          }
        }
      }
    }

    if (!insideVisibleFace && bestDistanceSq > edgeThresholdSq) {
      return null;
    }

    return {
      objectId: object.id,
      object,
      distanceSq: insideVisibleFace ? 0 : bestDistanceSq
    };
  }

  function pickBusinessObject(screenX, screenY) {
    const renderHit = pickRenderableBusinessObject(screenX, screenY);
    if (renderHit) {
      console.debug(`[Pick] render business object hit: ${renderHit.objectId}`);
      return renderHit;
    }

    let closest = null;

    sceneObjectManager.getObjects()
      .filter((object) => isPickableObjectType(object.type) && object.visible)
      .forEach((object) => {
        if (!object.entity) {
          return;
        }

        if (object.type === BUILDING_ENVELOPE_TYPE) {
          const envelopeHit = getBuildingEnvelopePickHit(object, screenX, screenY);
          if (!envelopeHit) {
            return;
          }

          if (!closest || envelopeHit.distanceSq < closest.distanceSq) {
            closest = envelopeHit;
          }
          return;
        }

        const screenPoint = camera.camera.worldToScreen(object.entity.getPosition());
        if (!Number.isFinite(screenPoint.x) || !Number.isFinite(screenPoint.y) || screenPoint.z < 0 || screenPoint.z > 1) {
          return;
        }

        const dx = screenPoint.x - screenX;
        const dy = screenPoint.y - screenY;
        const distanceSq = dx * dx + dy * dy;
        const thresholdSq = 24 * 24;

        if (distanceSq > thresholdSq) {
          return;
        }

        if (!closest || distanceSq < closest.distanceSq) {
          closest = {
            objectId: object.id,
            object,
            distanceSq
          };
        }
      });

    if (closest) {
      console.debug(`[Pick] business object hit: ${closest.objectId}`);
    }

    return closest;
  }

  function releaseFailedAsset(asset, failedBlobUrl) {
    asset.off();
    asset.unload();
    if (app.assets.get(asset.id)) {
      app.assets.remove(asset);
    }

    if (failedBlobUrl) {
      URL.revokeObjectURL(failedBlobUrl);
    }
  }

  function loadSplatTransactional({ displayName, url, filename, size, failedBlobUrl = null, detailUrl = filename }) {
    return new Promise((resolve, reject) => {
      loadToken += 1;
      const token = loadToken;
      const previousState = getCurrentSplatState();

      const asset = new pc.Asset(displayName, 'gsplat', {
        url,
        filename,
        ...(typeof size === 'number' ? { size } : {})
      });

      app.assets.add(asset);
      setSogStatus('loading', `SOG loading: ${detailUrl}`);

      asset.on('progress', (receivedBytes, totalBytes) => {
        if (token !== loadToken || totalBytes <= 0) {
          return;
        }

        const percent = ((receivedBytes / totalBytes) * 100).toFixed(1);
        statusState.sog.state = 'loading';
        statusState.sog.detail = `SOG loading ${percent}%: ${detailUrl}`;
        emitState();
      });

      asset.once('load', () => {
        if (token !== loadToken) {
          releaseFailedAsset(asset, failedBlobUrl);
          reject(new Error(`SOG load superseded: ${displayName}`));
          return;
        }

        try {
          const entity = createGsplatEntity(displayName, asset);
          currentGsplatEntity = entity;
          currentAsset = asset;
          currentBlobUrl = failedBlobUrl;
          sceneObjectManager.addObject({
            id: OBJECT_IDS.gsplat,
            name: displayName,
            displayName,
            type: 'gsplat',
            entity,
            asset,
            transform: getTransformFromEntity(entity),
            visible: entity.enabled,
            status: 'loaded',
            metadata: {
              url: detailUrl,
              source: url.startsWith('blob:') ? 'local' : 'public',
              sourceName: filename
            }
          });
          updateDebugHandles();
          syncAllCameraProjectionInstances();

          destroySplatState(previousState);

          requestAnimationFrame(() => {
            focusLoadedMap(entity, asset);
            selectionManager.select(OBJECT_IDS.gsplat);
            setSogStatus('loaded', `SOG loaded: ${displayName}`);
            resolve({
              id: OBJECT_IDS.gsplat,
              entity,
              asset
            });
          });
        } catch (error) {
          console.error(error);
          releaseFailedAsset(asset, failedBlobUrl);
          currentGsplatEntity = previousState.entity;
          currentAsset = previousState.asset;
          currentBlobUrl = previousState.blobUrl;
          updateDebugHandles();
          setSogStatus(
            'failed',
            `SOG failed: ${describeError(error)}`,
            `SOG failed: ${describeError(error)} | Previous map preserved`
          );
          reject(error);
        }
      });

      asset.once('error', (err) => {
        if (token !== loadToken) {
          releaseFailedAsset(asset, failedBlobUrl);
          reject(new Error(`SOG load superseded: ${displayName}`));
          return;
        }

        const message = describeError(err);
        console.error(err, asset);
        releaseFailedAsset(asset, failedBlobUrl);
        currentGsplatEntity = previousState.entity;
        currentAsset = previousState.asset;
        currentBlobUrl = previousState.blobUrl;
        updateDebugHandles();
        setSogStatus(
          'failed',
          `SOG failed: ${message}`,
          `SOG failed: ${message} | Previous map preserved`
        );
        reject(err instanceof Error ? err : new Error(message));
      });

      app.assets.load(asset);
    });
  }

  function loadSogFile(file) {
    const blobUrl = URL.createObjectURL(file);
    return loadSplatTransactional({
      displayName: file.name,
      url: blobUrl,
      filename: file.name,
      size: file.size,
      failedBlobUrl: blobUrl,
      detailUrl: file.name
    });
  }

  async function probeAsset(url) {
    const requestOptions = { cache: 'no-store' };

    try {
      const headResponse = await fetch(url, {
        ...requestOptions,
        method: 'HEAD'
      });

      if (headResponse.ok) {
        return true;
      }

      console.warn(`HEAD probe returned ${headResponse.status} for ${url}, falling back to GET probe.`);
    } catch (error) {
      console.warn(`HEAD request failed for ${url}`, error);
    }

    try {
      const getResponse = await fetch(url, {
        ...requestOptions,
        method: 'GET',
        headers: {
          Range: 'bytes=0-0'
        }
      });
      return getResponse.ok || getResponse.status === 206;
    } catch (error) {
      console.warn(`GET probe failed for ${url}`, error);
      return false;
    }
  }

  async function checkAssetAvailability(url, label) {
    assetAvailability[url] = 'checking';
    emitState();
    const available = await probeAsset(url);
    assetAvailability[url] = available ? 'available' : 'missing';
    console.info(`${label}: ${assetAvailability[url]} (${url})`);
    emitState();
    return available;
  }

  async function ensureRemoteAssetAvailable(url, missingMessage) {
    const available = await checkAssetAvailability(url, url);
    if (!available) {
      throw new Error(missingMessage);
    }
  }

  async function loadRemoteSog({ path, filename, missingMessage, missingStatusMessage = missingMessage }) {
    try {
      await ensureRemoteAssetAvailable(path, missingMessage);
    } catch (error) {
      const message = describeError(error);
      console.error(error);
      setSogStatus('failed', `SOG failed: ${message}`, `${missingStatusMessage} | Current map preserved`);
      return false;
    }

    await loadSplatTransactional({
      displayName: filename,
      url: path,
      filename,
      detailUrl: path
    });
    return true;
  }

  function releaseContainerAsset(asset) {
    if (!asset) {
      return;
    }

    asset.off();
    asset.unload();
    if (app.assets.get(asset.id)) {
      app.assets.remove(asset);
    }
  }

  function loadContainerSceneObject({ id, type, displayName, url, sourceName, transform, visible }) {
    return new Promise((resolve, reject) => {
      const asset = new pc.Asset(sourceName || displayName, 'container', {
        url,
        filename: sourceName || displayName
      });

      app.assets.add(asset);

      asset.once('load', () => {
        try {
          const entity = asset.resource.instantiateRenderEntity({
            castShadows: false,
            receiveShadows: false
          });

          entity.name = displayName;
          app.root.addChild(entity);
          bindSceneObjectEntity(entity, id, type);

          sceneObjectManager.addObject({
            id,
            name: displayName,
            displayName,
            type,
            entity,
            asset,
            transform: getTransformFromEntity(entity),
            visible: entity.enabled,
            status: 'loaded',
            metadata: {
              url,
              sourceName: sourceName || displayName
            }
          });

          applyTransformToObject(id, transform);
          sceneObjectManager.setVisible(id, visible);
          resolve({ id, entity, asset });
        } catch (error) {
          releaseContainerAsset(asset);
          reject(error);
        }
      });

      asset.once('error', (err) => {
        releaseContainerAsset(asset);
        reject(err instanceof Error ? err : new Error(describeError(err)));
      });

      app.assets.load(asset);
    });
  }

  async function loadModelAssetSceneObject({
    id,
    type = 'glb',
    displayName,
    url,
    sourceName,
    transform = cloneTransform(),
    visible = true,
    metadata = {}
  }) {
    await ensureRemoteAssetAvailable(
      url,
      `Cannot load ${sourceName || displayName || url}`
    );

    return loadContainerSceneObject({
      id,
      type,
      displayName,
      url,
      sourceName,
      transform,
      visible
    }).then((result) => {
      sceneObjectManager.updateObject(id, {
        typeLabel: '模型',
        metadata: {
          url,
          sourceName: sourceName || displayName,
          assetId: metadata.assetId,
          sourceAssetId: metadata.sourceAssetId,
          assetType: metadata.assetType ?? type,
          runtimeType: metadata.runtimeType ?? type,
          size: metadata.size
        }
      });

      selectionManager.select(id);
      updateStatusMessage(`Added model to scene: ${displayName}`);
      return result;
    });
  }

  async function addAssetToScene(asset) {
    if (!asset?.id) {
      throw new Error('Asset is invalid');
    }

    const runtimeAsset = asset.preferredRuntimeAsset ?? asset;
    const normalizedType = String(runtimeAsset?.type || '').toLowerCase();
    const normalizedStatus = String(runtimeAsset?.status || '').toLowerCase();
    const displayName = runtimeAsset?.sourceName || runtimeAsset?.label || runtimeAsset?.id || asset.sourceName || asset.id;
    const sourceName = runtimeAsset?.sourceName || displayName;

    if (!runtimeAsset?.url) {
      throw new Error(`Asset is not runtime-ready: ${asset.sourceName || asset.id}`);
    }

    if (!['sog', 'gsplat', 'glb', 'gltf'].includes(normalizedType)) {
      throw new Error(`Asset type not supported yet: ${normalizedType || 'unknown'}`);
    }

    if (normalizedStatus && !['ready', 'available'].includes(normalizedStatus)) {
      throw new Error(`Asset is not ready: ${displayName} (${runtimeAsset.status})`);
    }

    if (Number(runtimeAsset.size ?? 0) <= 0) {
      throw new Error(`Asset is not ready: ${displayName}`);
    }

    console.log('[Asset] add to scene started:', asset.id, displayName);
    if (asset.id !== runtimeAsset.id) {
      console.log('[Asset] using derived asset:', runtimeAsset.id, runtimeAsset.sourceName || runtimeAsset.id);
    }

    const metadata = {
      assetId: runtimeAsset.id,
      url: runtimeAsset.url,
      sourceName,
      sourceAssetId: runtimeAsset.sourceAssetId ?? null,
      assetType: normalizedType,
      runtimeType: normalizedType === 'gltf' ? 'glb' : normalizedType,
      size: runtimeAsset.size
    };

    if (normalizedType === 'sog' || normalizedType === 'gsplat') {
      await ensureRemoteAssetAvailable(runtimeAsset.url, `Cannot load ${displayName}`);
      await loadSplatTransactional({
        displayName,
        url: runtimeAsset.url,
        filename: sourceName,
        detailUrl: runtimeAsset.url
      });
      sceneObjectManager.updateObject(OBJECT_IDS.gsplat, {
        metadata
      });
      selectionManager.select(OBJECT_IDS.gsplat);
      updateStatusMessage(`Added SOG to scene: ${displayName}`);
      return { id: OBJECT_IDS.gsplat, type: 'gsplat' };
    }

    if (normalizedType === 'glb' || normalizedType === 'gltf') {
      const objectId = `asset-${normalizedType}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      return loadModelAssetSceneObject({
        id: objectId,
        type: 'glb',
        displayName,
        url: runtimeAsset.url,
        sourceName,
        transform: cloneTransform(),
        visible: true,
        metadata
      });
    }
  }

  async function restoreGsplatObject(object) {
    await ensureRemoteAssetAvailable(
      object.metadata.url,
      `Cannot restore ${object.metadata.sourceName || object.displayName}`
    );
    await loadSplatTransactional({
      displayName: object.displayName,
      url: object.metadata.url,
      filename: object.metadata.sourceName || object.displayName,
      detailUrl: object.metadata.url
    });
    applyTransformToObject(OBJECT_IDS.gsplat, object.transform);
    sceneObjectManager.setVisible(OBJECT_IDS.gsplat, object.visible);
    sceneObjectManager.updateObject(OBJECT_IDS.gsplat, {
      displayName: object.displayName,
      name: object.displayName,
      metadata: {
        url: object.metadata.url,
        sourceName: object.metadata.sourceName || object.displayName,
        assetId: object.metadata.assetId,
        sourceAssetId: object.metadata.sourceAssetId,
        assetType: object.metadata.assetType,
        runtimeType: object.metadata.runtimeType ?? 'gsplat',
        size: object.metadata.size
      }
    });
  }

  async function restoreBimObject(object) {
    await ensureRemoteAssetAvailable(
      object.metadata.url,
      `Cannot restore ${object.metadata.sourceName || object.displayName}`
    );

    if (object.metadata.url === ASSET_PATHS.bimProxy) {
      await loadBim();
      applyAlignment(object.transform, formatAlignmentStatus(object.transform));
      sceneObjectManager.updateObject(OBJECT_IDS.bim, {
        displayName: object.displayName,
        name: object.displayName,
        metadata: {
          url: object.metadata.url,
          sourceName: object.metadata.sourceName || object.displayName,
          assetId: object.metadata.assetId,
          sourceAssetId: object.metadata.sourceAssetId,
          assetType: object.metadata.assetType,
          runtimeType: object.metadata.runtimeType ?? 'glb',
          size: object.metadata.size
        }
      });
      sceneObjectManager.setVisible(OBJECT_IDS.bim, object.visible);
      return;
    }

    await loadContainerSceneObject({
      id: object.id || `restored-bim-${Date.now()}`,
      type: 'bim-proxy',
      displayName: object.displayName,
      url: object.metadata.url,
      sourceName: object.metadata.sourceName,
      transform: object.transform,
      visible: object.visible
    });
  }

  function restoreMarkerObject(object) {
    const [x, y, z] = object.transform.position;
    const entity = markerManager.placeMarker(new pc.Vec3(x, y - 0.2, z));
    sceneObjectManager.addObject({
      id: OBJECT_IDS.marker,
      name: object.displayName,
      displayName: object.displayName,
      type: 'marker',
      entity,
      asset: null,
      transform: getTransformFromEntity(entity),
      visible: entity.enabled,
      status: 'active',
      metadata: {
        position: `${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}`
      }
    });
    applyTransformToObject(OBJECT_IDS.marker, object.transform);
    sceneObjectManager.setVisible(OBJECT_IDS.marker, object.visible);
  }

  function restoreBusinessObject(object) {
    return createBusinessSceneObject(object.type, {
      id: object.id,
      displayName: object.displayName,
      transform: object.transform,
      visible: object.visible,
      status: object.status ?? 'active',
      metadata: {
        ...(object.metadata ?? {}),
        businessType: object.metadata.businessType,
        source: object.metadata.source || 'editor-created',
        placedBy: object.metadata.placedBy,
        videoProjection: object.metadata.videoProjection,
        patrol: clonePatrolMetadata(object.metadata.patrol)
      }
    });
  }

  function getRestorableObjectIds() {
    return sceneObjectManager.getObjectSnapshots()
      .filter((object) => RESTORABLE_OBJECT_TYPES.has(object.type) && !object.protected)
      .map((object) => object.id);
  }

  function clearRestorableSceneObjects() {
    const ids = getRestorableObjectIds();
    ids.forEach((objectId) => {
      deleteSceneObject(objectId, { suppressLog: true, suppressStatusMessage: true });
    });
    selectionManager.clear();
    closeContextMenu();
    emitState();
  }

  function clearSceneForProjectOpen() {
    clearRestorableSceneObjects();
    gsplatProjectionRenderer.destroy();
    cameraProjectionManager.disposeAll();
    Array.from(cameraVideoRuntimes.keys()).forEach((cameraObjectId) => {
      disposeCameraVideoRuntime(cameraObjectId);
    });
    if (markerManager.marker) {
      markerManager.clearMarker();
    }
    cancelPlacementMode();
    cancelBuildingEnvelopeDrawing();
    stopRobotDogRouteEditing();
    commitTransformEdit({
      skipStatusMessage: true
    });
    cameraController.reset();
    updateStatusMessage('Project scene cleared');
    return true;
  }

  async function restoreSceneObjectsFromPayload(objects) {
    const payloadList = Array.isArray(objects) ? objects.map(normalizeRestoredObjectPayload) : [];
    let restoredCount = 0;
    const missingAssets = [];

    pushLog('Restore scene started');
    clearRestorableSceneObjects();

    for (const payload of payloadList) {
      if (!RESTORABLE_OBJECT_TYPES.has(payload.type)) {
        continue;
      }

      const assetUrl = payload.metadata.url;
      if (isBlobAssetUrl(assetUrl)) {
        const skippedMessage = `Skipped local blob asset: ${payload.displayName}`;
        console.warn('[Restore] skipped local blob asset:', payload.displayName);
        pushLog(skippedMessage);
        continue;
      }

      try {
        if (payload.type === 'gsplat') {
          if (!isRestorableAssetUrl(assetUrl)) {
            throw new Error(`Unsupported gsplat url: ${assetUrl || 'missing'}`);
          }
          await restoreGsplatObject(payload);
        } else if (payload.type === 'bim-proxy') {
          if (!isRestorableAssetUrl(assetUrl)) {
            throw new Error(`Unsupported bim url: ${assetUrl || 'missing'}`);
          }
          await restoreBimObject(payload);
        } else if (payload.type === 'glb' || payload.type === 'model') {
          if (!isRestorableAssetUrl(assetUrl)) {
            throw new Error(`Unsupported model url: ${assetUrl || 'missing'}`);
          }
          await loadModelAssetSceneObject({
            id: payload.id || `restored-${payload.type}-${Date.now()}-${restoredCount}`,
            type: payload.type,
            displayName: payload.displayName,
            url: assetUrl,
            sourceName: payload.metadata.sourceName,
            transform: payload.transform,
            visible: payload.visible,
            metadata: {
              assetId: payload.metadata.assetId,
              sourceAssetId: payload.metadata.sourceAssetId,
              assetType: payload.metadata.assetType,
              runtimeType: payload.metadata.runtimeType,
              size: payload.metadata.size
            }
          });
        } else if (payload.type === 'marker') {
          restoreMarkerObject(payload);
        } else if (BUSINESS_OBJECT_DEFINITIONS[payload.type]) {
          restoreBusinessObject(payload);
        }

        restoredCount += 1;
        console.log('[Restore] restored object:', payload.displayName);
      } catch (error) {
        const message = `Restore failed for ${payload.displayName}: ${describeError(error)}`;
        console.warn('[Restore] object restore failed:', payload.displayName, error);
        if (payload.metadata?.assetId || payload.metadata?.url || payload.metadata?.sourceName) {
          missingAssets.push({
            assetId: payload.metadata?.assetId ?? null,
            fileName: payload.metadata?.sourceName || payload.displayName || payload.metadata?.url || payload.id
          });
        }
        pushLog(message);
      }
    }

    syncAllCameraProjectionInstances();

    pushLog(`Restore scene ok: ${restoredCount} objects`);
    updateStatusMessage(`Restore scene ok: ${restoredCount} objects`);
    return { restoredCount, missingAssets };
  }

  function getEntityWorldAabb(entity) {
    if (!entity) {
      return null;
    }

    const renderComponents = entity.findComponents('render');
    let result = null;
    renderComponents.forEach((renderComponent) => {
      renderComponent.meshInstances.forEach((meshInstance) => {
        if (!result) {
          result = meshInstance.aabb.clone();
        } else {
          result.add(meshInstance.aabb);
        }
      });
    });

    return result;
  }

  function focusBim() {
    if (!bimProxyManager.isLoaded()) {
      setBimStatus('idle', 'BIM not loaded');
      return false;
    }

    const entity = bimProxyManager.getRootEntity();
    const aabb = getEntityWorldAabb(entity);
    if (aabb) {
      cameraController.focusAabb(aabb, {
        yaw: 0,
        pitch: 35,
        minDistance: 10
      });
    } else {
      cameraController.focus(entity.getPosition(), 30, {
        yaw: 0,
        pitch: 35
      });
    }

    setBimStatus('loaded', statusState.bim.detail, 'Focused BIM');
    return true;
  }

  function focusSceneObject(objectId) {
    const object = sceneObjectManager.getObject(objectId);
    if (!object) {
      updateStatusMessage('No selection');
      return false;
    }

    if (object.type === 'gsplat') {
      const focused = focusLoadedMap();
      if (focused) {
        updateStatusMessage('Focused map');
      }
      return focused;
    }

    if (object.type === 'bim-proxy') {
      return focusBim();
    }

    if (!object.entity) {
      updateStatusMessage(`${object.displayName ?? object.name} is not available`);
      return false;
    }

    if (object.type === BUILDING_ENVELOPE_TYPE) {
      const envelopeCenter = getEnvelopeWorldCenter(object.metadata?.envelope);
      if (envelopeCenter) {
        console.log('[BuildingEnvelope] focus target', {
          objectId,
          center: [envelopeCenter.x, envelopeCenter.y, envelopeCenter.z],
          entityPosition: object.entity?.getPosition ? [
            object.entity.getPosition().x,
            object.entity.getPosition().y,
            object.entity.getPosition().z
          ] : null
        });
        cameraController.focus(envelopeCenter, 18, {
          yaw: 0,
          pitch: 35
        });
        updateStatusMessage(`Focused: ${object.displayName ?? object.name}`);
        return true;
      }
    }

    const aabb = getEntityWorldAabb(object.entity);
    if (aabb) {
      cameraController.focusAabb(aabb, {
        yaw: 0,
        pitch: 35,
        minDistance: 6
      });
    } else {
      cameraController.focus(object.entity.getPosition(), 12, {
        yaw: 0,
        pitch: 35
      });
    }

    updateStatusMessage(`Focused: ${object.displayName ?? object.name}`);
    return true;
  }

  async function copyAlignmentJson() {
    const json = JSON.stringify(bimAlignmentManager.getCurrent(), null, 2);

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(json);
        setBimStatus('loaded', 'Alignment JSON copied');
        return true;
      }

      console.log(json);
      setBimStatus('loaded', 'Alignment JSON copied');
      return true;
    } catch (error) {
      console.error(error);
      setBimStatus('failed', `Copy failed: ${describeError(error)}`);
      return false;
    }
  }

  function applyAlignment(alignment, message) {
    const sanitized = bimAlignmentManager.setCurrent(alignment);
    const next = applyTransformToObject(OBJECT_IDS.bim, sanitized, {
      updateBimAlignment: true
    });

    if (!next) {
      setBimStatus('idle', 'BIM not loaded');
      return false;
    }

    selectionManager.select(OBJECT_IDS.bim);
    setBimStatus('loaded', formatAlignmentStatus(next), message ?? formatAlignmentStatus(next));
    return true;
  }

  function setAlignmentFromUi(payload) {
    const targetObject = sceneObjectManager.getObject(selectionManager.getSelectedId());
    if (!targetObject) {
      return false;
    }

    if (!TRANSFORM_EDITABLE_TYPES.has(targetObject.type)) {
      updateStatusMessage(`${targetObject.displayName ?? targetObject.name} transform is not editable`);
      return false;
    }

    const next = sanitizeTransformInput(payload, targetObject.transform ?? getTransformFromEntity(targetObject.entity));

    if (targetObject.type === 'bim-proxy') {
      return applyAlignment(next);
    }

    const applied = applyTransformToObject(targetObject.id, next);
    if (!applied) {
      return false;
    }

    console.log(`[ObjectTransformInspector] update ${targetObject.id}`, {
      transform: next
    });
    updateStatusMessage(`${targetObject.displayName ?? targetObject.name} transform updated`);
    return true;
  }

  function nudgeAlignment(kind, axis, direction) {
    const targetObject = sceneObjectManager.getObject(selectionManager.getSelectedId());
    if (!targetObject) {
      return false;
    }

    if (!TRANSFORM_EDITABLE_TYPES.has(targetObject.type)) {
      updateStatusMessage(`${targetObject.displayName ?? targetObject.name} transform is not editable`);
      return false;
    }

    const next = targetObject.type === 'bim-proxy'
      ? bimAlignmentManager.getCurrent()
      : getTransformForObject(targetObject.id);
    const factor = direction === 'minus' ? -1 : 1;

    if (kind === 'position') {
      next.position[axis] += factor * state.steps.move;
    } else if (kind === 'rotation') {
      next.rotation[axis] += factor * state.steps.rotate;
    } else if (kind === 'scale') {
      const value = Math.max(0.001, next.scale[0] + factor * state.steps.scale);
      next.scale = [value, value, value];
    }

    if (targetObject.type === 'bim-proxy') {
      return applyAlignment(next);
    }

    const applied = applyTransformToObject(targetObject.id, next);
    if (!applied) {
      return false;
    }

    updateStatusMessage(`${targetObject.displayName ?? targetObject.name} transform updated`);
    return true;
  }

  function resetAlignment() {
    const next = bimAlignmentManager.reset();
    if (!bimProxyManager.resetTransform()) {
      setBimStatus('idle', 'BIM not loaded');
      emitState();
      return false;
    }

    setBimStatus('loaded', formatAlignmentStatus(next));
    return true;
  }

  function loadSavedAlignment({ silent = false } = {}) {
    try {
      const saved = bimAlignmentManager.load();
      const next = saved ?? bimAlignmentManager.setCurrent(DEFAULT_BIM_ALIGNMENT);

      if (!saved && !silent) {
        setBimStatus('idle', 'BIM alignment reset to default');
      } else {
        emitState();
      }

      return next;
    } catch (error) {
      console.warn('Ignoring invalid BIM alignment in localStorage.', error);
      const next = bimAlignmentManager.reset();
      if (!silent) {
        setBimStatus('idle', 'BIM alignment load warning');
      } else {
        emitState();
      }
      return next;
    }
  }

  function saveAlignment(alignment) {
    const next = bimAlignmentManager.setCurrent(alignment);
    bimAlignmentManager.save(next);
    setBimStatus('loaded', 'BIM alignment saved');
  }

  async function loadBim() {
    if (bimProxyManager.isLoaded()) {
      setBimStatus('loaded', `BIM loaded: ${ASSET_LABELS.bimProxy}`, 'BIM already loaded');
      return true;
    }

    statusState.bim.state = 'loading';
    statusState.bim.detail = `BIM loading: ${ASSET_LABELS.bimProxy}`;
    emitState();

    try {
      await ensureRemoteAssetAvailable(
        ASSET_PATHS.bimProxy,
        `Cannot load ${decodeURI(ASSET_PATHS.bimProxy)}`
      );
      const entity = await bimProxyManager.load(ASSET_PATHS.bimProxy);
      sceneObjectManager.addObject({
        id: OBJECT_IDS.bim,
        name: ASSET_LABELS.bimProxy,
        displayName: ASSET_LABELS.bimProxy,
        type: 'bim-proxy',
        entity,
        asset: bimProxyManager.bimAsset,
        transform: getTransformFromEntity(entity),
        visible: entity.enabled,
        status: 'loaded',
        metadata: {
          url: ASSET_PATHS.bimProxy,
          sourceName: ASSET_LABELS.bimProxy
        }
      });
      const savedAlignment = loadSavedAlignment({ silent: true });
      selectionManager.select(OBJECT_IDS.bim);
      applyAlignment(savedAlignment, formatAlignmentStatus(savedAlignment));
      return true;
    } catch (error) {
      console.error(error);
      setBimStatus('failed', `BIM failed: ${describeError(error)}`);
      return false;
    }
  }

  function toggleObjectVisibility(objectId) {
    const object = sceneObjectManager.getObject(objectId);
    if (!object || !object.canHide) {
      return false;
    }

    if (!object.entity) {
      updateStatusMessage(`${object.name} is not available`);
      return false;
    }

    const changed = sceneObjectManager.toggleVisible(objectId);
    if (!changed) {
      return false;
    }

    const nextObject = sceneObjectManager.getObject(objectId);
    if (nextObject?.type === BUILDING_ENVELOPE_TYPE && nextObject.entity) {
      nextObject.entity.enabled = nextObject.visible;
    }
    if (nextObject?.type === 'robotDog') {
      robotDogPatrolController.setRouteVisible(objectId, nextObject.visible);
    }
    updateStatusMessage(`${nextObject.name} ${nextObject.visible ? 'visible' : 'hidden'}`);
    return true;
  }

  function openContextMenu(objectId, x, y) {
    const object = sceneObjectManager.getObject(objectId);
    if (!object) {
      return;
    }

    selectionManager.select(objectId);
    const nextPosition = clampMenuPosition(x, y);
    state.contextMenu = {
      open: true,
      objectId,
      x: nextPosition.x,
      y: nextPosition.y
    };
    emitState();
  }

  function closeContextMenu() {
    if (!state.contextMenu.open) {
      return;
    }

    state.contextMenu = {
      open: false,
      objectId: null,
      x: 0,
      y: 0
    };
    emitState();
  }

  function deleteSceneObject(objectId, options = {}) {
    const object = sceneObjectManager.getObject(objectId);
    if (!object) {
      return false;
    }

    if (object.protected) {
      console.warn('[SceneObjectManager] protected object cannot be deleted:', object.id);
      updateStatusMessage(`${object.displayName ?? object.name} cannot be deleted`);
      return false;
    }

    const suppressLog = Boolean(options.suppressLog);
    const suppressStatusMessage = Boolean(options.suppressStatusMessage);

    if (!suppressLog) {
      console.log('[ContextMenu] delete object:', object.id, object.displayName ?? object.name);
    }

    if (transformEditState.enabled && transformEditState.objectId === object.id) {
      clearTransformEditState();
    }

    if (object.id === OBJECT_IDS.marker) {
      markerManager.clearMarker();
    }

    if (object.id === OBJECT_IDS.gsplat) {
      destroySplatState(getCurrentSplatState());
      currentGsplatEntity = null;
      currentAsset = null;
      currentBlobUrl = null;
      updateDebugHandles();
      syncAllCameraProjectionInstances();
    }

    if (object.id === OBJECT_IDS.bim) {
      bimProxyManager.unload();
    }

    if (object.type === 'cameraDevice') {
      gsplatProjectionRenderer.deactivate(projectionCompatibilityAdapter.getProjectionIdForObject(object.id));
      cameraProjectionManager.disposeProjection(object.id);
      disposeCameraVideoRuntime(object.id);
      projectionCompatibilityAdapter.removeObject(object.id);
      clearQuadProjectionHelpers(object.id);
    }

    if (object.type === 'robotDog') {
      robotDogPatrolController.removeRobotDog(object.id);
    }

    if (
      object.id !== OBJECT_IDS.bim &&
      (object.type === 'glb' || object.type === 'model' || object.type === 'bim-proxy') &&
      object.asset
    ) {
      releaseContainerAsset(object.asset);
    }

    const removed = sceneObjectManager.removeObject(objectId);
    if (!removed) {
      updateStatusMessage(`Delete failed: ${object.displayName ?? object.name}`);
      return false;
    }

    if (selectionManager.getSelectedId() === objectId) {
      selectionManager.clear();
    }

    if (object.id === OBJECT_IDS.gsplat) {
      statusState.sog.state = 'idle';
      statusState.sog.detail = 'SOG removed from scene';
    }

    if (object.id === OBJECT_IDS.bim) {
      statusState.bim.state = 'idle';
      statusState.bim.detail = 'BIM removed from scene';
    }

    closeContextMenu();
    if (!suppressStatusMessage) {
      updateStatusMessage(`${object.displayName ?? object.name} removed from scene`);
    } else {
      emitState();
    }
    return true;
  }

  function renameSelectedObject(nextName) {
    const selectedId = selectionManager.getSelectedId();
    if (!selectedId) {
      updateStatusMessage('未选择对象');
      return false;
    }

    const object = sceneObjectManager.getObject(selectedId);
    const trimmed = nextName.trim();
    if (!object) {
      return false;
    }

    if (!trimmed) {
      updateStatusMessage('名称不能为空');
      return false;
    }

    const previousName = object.displayName ?? object.name;
    sceneObjectManager.updateObject(selectedId, {
      displayName: trimmed,
      name: trimmed
    });

    const currentObject = sceneObjectManager.getObject(selectedId);
    if (currentObject?.entity) {
      currentObject.entity.name = trimmed;
    }

    updateStatusMessage(`已重命名: ${previousName} -> ${trimmed}`);
    return true;
  }

  async function enableCameraVideoProjection(cameraId = 'camera_0', options = {}) {
    let cameraObject = sceneObjectManager.getObject(cameraId);
    if (!cameraObject) {
      createBusinessSceneObject('cameraDevice', {
        id: cameraId,
        displayName: cameraId
      });
      cameraObject = sceneObjectManager.getObject(cameraId);
    }

    const sourceType = options.sourceType ?? cameraObject.metadata?.videoProjection?.sourceType ?? CAMERA_SOURCE_TYPES.CAMERA_STREAM;
    const videoUrl = options.videoUrl || cameraObject.metadata?.videoProjection?.videoUrl || '';
    let projection = createDefaultVideoProjectionMetadata(cameraId, {
      ...cameraObject.metadata?.videoProjection,
      ...options,
      enabled: true,
      sourceType,
      videoUrl,
      streamUrl: options.streamUrl ?? cameraObject.metadata?.videoProjection?.streamUrl ?? null,
      cameraId: options.cameraId ?? cameraObject.metadata?.videoProjection?.cameraId ?? 'camera1',
      mode: options.mode ?? cameraObject.metadata?.videoProjection?.mode ?? 'quadOverlay',
      opacity: readNumberValue(options.opacity, cameraObject.metadata?.videoProjection?.opacity ?? 1),
      softEdge: readNumberValue(options.softEdge, cameraObject.metadata?.videoProjection?.softEdge ?? 0),
      flipY: options.flipY ?? cameraObject.metadata?.videoProjection?.flipY ?? false,
      replaceMode: options.replaceMode ?? cameraObject.metadata?.videoProjection?.replaceMode ?? true,
      quadPoints: options.quadPoints ?? cameraObject.metadata?.videoProjection?.quadPoints ?? [],
      quadPlaneTolerance: readNumberValue(options.quadPlaneTolerance, cameraObject.metadata?.videoProjection?.quadPlaneTolerance ?? 0.25)
    });

    const resolvedProjection = await ensureProjectionVideoSource(cameraId, projection);
    if (!resolvedProjection) {
      updateStatusMessage(`Projection enable failed: missing stream binding for ${projection.cameraId ?? 'camera1'}`);
      return {
        cameraId,
        projector: projection,
        error: 'STREAM_NOT_BOUND'
      };
    }
    projection = createDefaultVideoProjectionMetadata(cameraId, {
      ...projection,
      ...resolvedProjection
    });

    syncCameraProjectionMetadata(cameraId, projection);
    updateActiveProjectorFromProjection(cameraId, projection);

    console.log('[Projection] enableCameraVideoProjection', {
      cameraId,
      resolvedVideoUrl: resolveProjectionVideoUrl(projection)
    });
    updateStatusMessage(`Projection enabled: ${cameraId}`);
    return {
      cameraId,
      projector: projection
    };
  }

  function disableCameraVideoProjection(cameraId = 'camera_0') {
    const cameraObject = sceneObjectManager.getObject(cameraId);
    if (!cameraObject || cameraObject.type !== 'cameraDevice') {
      updateStatusMessage('Camera device not found');
      return false;
    }

    syncCameraProjectionMetadata(cameraId, {
      ...cameraObject.metadata?.videoProjection,
      enabled: false
    });
    cameraProjectionManager.disableProjection(cameraId);
    clearQuadProjectionHelpers(cameraId);
    updateStatusMessage(`Projection disabled: ${cameraId}`);
    return true;
  }

  function updateCameraVideoProjection(cameraId = 'camera_0', patch = {}) {
    const cameraObject = sceneObjectManager.getObject(cameraId);
    if (!cameraObject || cameraObject.type !== 'cameraDevice') {
      updateStatusMessage('Camera device not found');
      return null;
    }

    const nextProjection = syncCameraProjectionMetadata(cameraId, patch);
    updateActiveProjectorFromProjection(cameraId, nextProjection);
    rebuildQuadProjectionHelpers(cameraId);
    updateStatusMessage('Projection updated');
    return nextProjection;
  }

  function toggleCameraVideoProjection(cameraId = 'camera_0') {
    const cameraObject = sceneObjectManager.getObject(cameraId);
    const nextEnabled = !cameraObject?.metadata?.videoProjection?.enabled;
    if (nextEnabled) {
      return enableCameraVideoProjection(cameraId);
    }

    return disableCameraVideoProjection(cameraId);
  }

  function setVideoProjectionMode(cameraId, mode) {
    const nextMode = mode === 'quad' ? 'quad' : (mode === 'quadOverlay' ? 'quadOverlay' : 'cameraFrustum');
    const cameraObject = sceneObjectManager.getObject(cameraId);
    if (!cameraObject || cameraObject.type !== 'cameraDevice') {
      updateStatusMessage('Camera device not found');
      return null;
    }

    const nextProjection = updateCameraVideoProjection(cameraId, {
      ...cameraObject.metadata?.videoProjection,
      mode: nextMode
    });
    updateStatusMessage(`投影模式: ${nextMode}`);
    return nextProjection;
  }

  function startQuadVideoProjectionEditing(cameraId) {
    const cameraObject = sceneObjectManager.getObject(cameraId);
    if (!cameraObject || cameraObject.type !== 'cameraDevice') {
      updateStatusMessage('请先选中摄像头对象');
      return false;
    }

    const editingCameraId = getEditingQuadProjectionCameraId();
    if (editingCameraId && editingCameraId !== cameraId) {
      updateStatusMessage('请先完成或取消当前摄像头四点选择');
      return false;
    }

    if (transformEditState.enabled) {
      commitTransformEdit({
        skipStatusMessage: true
      });
    }

    clearBuildingEnvelopeHover();
    selectionManager.select(cameraId);
    projectionEditingController.start(projectionCompatibilityAdapter.getProjectionIdForObject(cameraId));
    syncCameraProjectionMetadata(cameraId, {
      ...cameraObject.metadata?.videoProjection,
      enabled: false,
      mode: 'quadOverlay',
      quadEditing: true,
      quadPoints: []
    });
    cameraProjectionManager.disableProjection(cameraId);
    clearQuadProjectionHelpers(cameraId);
    console.log('[FourPointProjection] start selecting', {
      cameraId
    });
    updateStatusMessage('开始选择四点区域投影');
    return true;
  }

  function stopQuadVideoProjectionEditing(cameraId) {
    const cameraObject = sceneObjectManager.getObject(cameraId);
    if (!cameraObject || cameraObject.type !== 'cameraDevice') {
      updateStatusMessage('Camera device not found');
      return false;
    }

    projectionEditingController.stop();
    syncCameraProjectionMetadata(cameraId, {
      ...cameraObject.metadata?.videoProjection,
      quadEditing: false
    });
    rebuildQuadProjectionHelpers(cameraId);
    updateStatusMessage('停止选择四点区域投影');
    return true;
  }

  async function applyQuadVideoProjection(cameraId) {
    const cameraObject = sceneObjectManager.getObject(cameraId);
    let projection = createDefaultVideoProjectionMetadata(cameraId, cameraObject?.metadata?.videoProjection);
    if (!cameraObject || cameraObject.type !== 'cameraDevice') {
      updateStatusMessage('Camera device not found');
      return false;
    }

    if ((projection?.quadPoints?.length ?? 0) !== 4) {
      updateStatusMessage('四点区域投影需要 4 个点');
      return false;
    }

    const resolvedProjection = await ensureProjectionVideoSource(cameraId, projection);
    if (!resolvedProjection) {
      updateStatusMessage(`四点投影失败：请先绑定摄像头流 ${projection.cameraId ?? 'camera1'}`);
      return false;
    }
    projection = createDefaultVideoProjectionMetadata(cameraId, {
      ...projection,
      ...resolvedProjection
    });

    projectionEditingController.apply(projectionCompatibilityAdapter.getProjectionIdForObject(cameraId));
    updateCameraVideoProjection(cameraId, {
      ...projection,
      enabled: true,
      mode: 'quadOverlay',
      quadEditing: false,
      quadPoints: projection.quadPoints,
      quadPlaneTolerance: projection.quadPlaneTolerance,
      opacity: readNumberValue(projection.opacity, 1),
      softEdge: readNumberValue(projection.softEdge, 0),
      flipY: projection.flipY,
      replaceMode: projection.replaceMode ?? true
    });
    console.log('[FourPointProjection] apply world anchors', {
      cameraId,
      anchors: projection.quadPoints.map((point) => point.position)
    });
    updateStatusMessage('四点区域投影已应用');
    return true;
  }

  function syncSteps(nextSteps) {
    state.steps.move = Math.max(0.001, readNumberValue(nextSteps.move, state.steps.move));
    state.steps.rotate = Math.max(0.001, readNumberValue(nextSteps.rotate, state.steps.rotate));
    state.steps.scale = Math.max(0.001, readNumberValue(nextSteps.scale, state.steps.scale));
    emitState();
  }

  function addSceneObjectByType(type) {
    if (type === BUILDING_ENVELOPE_TYPE) {
      return startBuildingEnvelopeDrawing();
    }

    if (type === 'empty') {
      return createBusinessSceneObject(type);
    }

    if (type === 'robotDog') {
      return createRobotDog();
    }

    startPlacementMode(type);
    return null;
  }

  async function handleToolbarAction(action, payload = null) {
    switch (action) {
      case 'load-base':
        await loadRemoteSog({
          path: ASSET_PATHS.baseSog,
          filename: ASSET_LABELS.baseSog,
          missingMessage: `Cannot load ${ASSET_PATHS.baseSog}`
        });
        return;
      case 'load-converted':
        await loadRemoteSog({
          path: ASSET_PATHS.convertedSog,
          filename: ASSET_LABELS.convertedSog,
          missingMessage: `Converted SOG missing: ${ASSET_PATHS.convertedSog}`,
          missingStatusMessage: `Converted SOG missing: ${ASSET_PATHS.convertedSog}`
        });
        return;
      case 'load-bim':
        await loadBim();
        return;
      case 'toggle-bim':
        if (!sceneObjectManager.getObject(OBJECT_IDS.bim)) {
          setBimStatus('idle', 'BIM Proxy not loaded');
          return;
        }
        toggleObjectVisibility(OBJECT_IDS.bim);
        return;
      case 'debug-bim': {
        const object = sceneObjectManager.getObject(OBJECT_IDS.debug);
        if (!object) {
          updateStatusMessage('Debug Helpers not available');
          return;
        }
        toggleObjectVisibility(OBJECT_IDS.debug);
        return;
      }
      case 'clear-marker':
        pickingController.clearMarker();
        return;
      case 'reset-camera':
        cameraController.reset();
        updateStatusMessage('Camera reset');
        return;
      case 'create-robot-dog':
        createRobotDog();
        return;
      case 'start-quad-video-projection-editing':
        startQuadVideoProjectionEditing(selectionManager.getSelectedId());
        return;
      case 'apply-quad-video-projection':
        applyQuadVideoProjection(selectionManager.getSelectedId());
        return;
      case 'load-local-sog':
        if (payload) {
          loadSogFile(payload);
        }
        return;
      case 'hierarchy-delete': {
        const selectedId = selectionManager.getSelectedId();
        if (!selectedId) {
          updateStatusMessage('No selection');
          return;
        }
        deleteSceneObject(selectedId);
        return;
      }
      case 'hierarchy-duplicate':
        updateStatusMessage('Duplicate not implemented');
        return;
      case 'hierarchy-more':
        updateStatusMessage('More menu not implemented');
        return;
      default:
        updateStatusMessage(`${action} not implemented`);
    }
  }

  function handleHierarchySelect(objectId) {
    const selected = sceneObjectManager.getObject(objectId);
    if (!selected) {
      return false;
    }

    if (isTransformEditSelectionBlocked(objectId)) {
      console.info('[TransformEdit] blocked selection while editing');
      updateStatusMessage('请先完成或取消当前编辑');
      return false;
    }

    console.log('[Hierarchy] select object:', objectId, selected.displayName ?? selected.name, selected.type);
    selectionManager.select(objectId);
    syncTransformEditStatusMessage();
    return true;
  }

  function handleAssetSelect(assetId) {
    if (assetId === 'converted-sog' && assetAvailability[ASSET_PATHS.convertedSog] !== 'available') {
      updateStatusMessage(`Converted SOG missing: ${ASSET_PATHS.convertedSog}`);
      return false;
    }

    if (assetId === OBJECT_IDS.gsplat && sceneObjectManager.getObject(OBJECT_IDS.gsplat)) {
      return selectionManager.select(OBJECT_IDS.gsplat);
    }

    if (assetId === OBJECT_IDS.bim && sceneObjectManager.getObject(OBJECT_IDS.bim)) {
      return selectionManager.select(OBJECT_IDS.bim);
    }

    return false;
  }

  function selectSceneObject(objectId) {
    return handleHierarchySelect(objectId);
  }

  function handleContextMenuAction(action) {
    const objectId = state.contextMenu.objectId;
    if (!objectId) {
      closeContextMenu();
      return;
    }

    if (action === 'toggle-visible') {
      toggleObjectVisibility(objectId);
      closeContextMenu();
      return;
    }

    if (action === 'delete-object') {
      deleteSceneObject(objectId);
      return;
    }

    closeContextMenu();
  }

  function handleInspectorAction(action, payload = null) {
    switch (action) {
      case 'enter-transform-edit':
        enterTransformEdit(payload?.objectId ?? selectionManager.getSelectedId());
        return;
      case 'commit-transform-edit':
        commitTransformEdit();
        return;
      case 'cancel-transform-edit':
        cancelTransformEdit();
        return;
      case 'rename':
        renameSelectedObject(payload ?? '');
        return;
      case 'set-steps':
        syncSteps(payload ?? {});
        return;
      case 'apply-alignment':
        if (selectionManager.getSelectedId() && getBuildingEnvelopeObject(selectionManager.getSelectedId())) {
          updateStatusMessage('建筑多边体暂不支持在此面板直接编辑 Transform');
          return;
        }
        setAlignmentFromUi(payload ?? {});
        return;
      case 'reset-alignment':
        resetAlignment();
        return;
      case 'save-alignment':
        saveAlignment(payload ?? bimAlignmentManager.getCurrent());
        return;
      case 'load-alignment': {
        const next = loadSavedAlignment();
        if (bimProxyManager.isLoaded()) {
          applyAlignment(next, 'BIM alignment loaded');
        } else {
          setBimStatus('idle', 'BIM not loaded');
        }
        return;
      }
      case 'focus-bim':
        focusBim();
        return;
      case 'focus-map':
        focusLoadedMap();
        updateStatusMessage('Focused map');
        return;
      case 'focus-selected': {
        const selectedId = selectionManager.getSelectedId();
        if (!selectedId) {
          updateStatusMessage('No selection');
          return;
        }
        focusSceneObject(selectedId);
        return;
      }
      case 'copy-alignment-json':
        copyAlignmentJson();
        return;
      case 'clear-marker':
        pickingController.clearMarker();
        return;
      case 'focus-marker':
        if (!markerManager.marker) {
          updateStatusMessage('Marker not available');
          return;
        }
        cameraController.focus(markerManager.marker.getPosition(), 12, {
          yaw: 0,
          pitch: 35
        });
        updateStatusMessage('Focused marker');
        return;
      case 'reset-camera':
        cameraController.reset();
        updateStatusMessage('Camera reset');
        return;
      case 'toggle-debug':
        toggleObjectVisibility(OBJECT_IDS.debug);
        return;
      case 'nudge-position':
        nudgeAlignment('position', payload.axis, payload.direction);
        return;
      case 'nudge-rotation':
        nudgeAlignment('rotation', payload.axis, payload.direction);
        return;
      case 'nudge-scale':
        nudgeAlignment('scale', 0, payload.direction);
        return;
      case 'delete-selected': {
        const selectedId = selectionManager.getSelectedId();
        if (selectedId) {
          deleteSceneObject(selectedId);
        }
        return;
      }
      case 'create-robot-dog':
        createRobotDog(payload ?? {});
        return;
      case 'start-building-envelope-drawing':
        startBuildingEnvelopeDrawing(payload ?? {});
        return;
      case 'stop-building-envelope-drawing':
        stopBuildingEnvelopeDrawing();
        return;
      case 'cancel-building-envelope-drawing':
        cancelBuildingEnvelopeDrawing();
        return;
      case 'undo-building-envelope-point':
        undoBuildingEnvelopePoint();
        return;
      case 'finish-building-envelope-drawing':
        finishBuildingEnvelopeDrawing(payload ?? {});
        return;
      case 'set-building-envelope-height':
        setBuildingEnvelopeHeight(payload?.objectId ?? selectionManager.getSelectedId(), payload?.height);
        return;
      case 'set-building-envelope-color':
        setBuildingEnvelopeColor(payload?.objectId ?? selectionManager.getSelectedId(), payload?.color);
        return;
      case 'set-building-envelope-opacity':
        setBuildingEnvelopeOpacity(payload?.objectId ?? selectionManager.getSelectedId(), payload?.opacity);
        return;
      case 'set-building-envelope-display-mode':
        updateBuildingEnvelope(payload?.objectId ?? selectionManager.getSelectedId(), { displayMode: payload?.displayMode });
        return;
      case 'set-building-envelope-outline-visible':
        setBuildingEnvelopeOutlineVisible(payload?.objectId ?? selectionManager.getSelectedId(), payload?.visible);
        return;
      case 'set-building-envelope-fill-visible':
        updateBuildingEnvelope(payload?.objectId ?? selectionManager.getSelectedId(), { fillVisible: payload?.visible });
        return;
      case 'set-building-envelope-top-visible':
        updateBuildingEnvelope(payload?.objectId ?? selectionManager.getSelectedId(), { topVisible: payload?.visible });
        return;
      case 'set-building-envelope-side-visible':
        updateBuildingEnvelope(payload?.objectId ?? selectionManager.getSelectedId(), { sideVisible: payload?.visible });
        return;
      case 'delete-building-envelope':
        deleteBuildingEnvelope(payload?.objectId ?? selectionManager.getSelectedId());
        return;
      case 'robot-dog-start-edit':
        startRobotDogRouteEditing(payload?.robotDogId);
        return;
      case 'robot-dog-stop-edit':
        stopRobotDogRouteEditing(payload?.robotDogId);
        return;
      case 'robot-dog-clear-route':
        clearRobotDogRoute(payload?.robotDogId);
        return;
      case 'robot-dog-start-patrol':
        startRobotDogPatrol(payload?.robotDogId);
        return;
      case 'robot-dog-pause-patrol':
        pauseRobotDogPatrol(payload?.robotDogId);
        return;
      case 'robot-dog-resume-patrol':
        resumeRobotDogPatrol(payload?.robotDogId);
        return;
      case 'robot-dog-stop-patrol':
        stopRobotDogPatrol(payload?.robotDogId);
        return;
      case 'robot-dog-set-speed':
        setRobotDogPatrolSpeed(payload?.robotDogId, payload?.speed);
        return;
      case 'robot-dog-set-loop':
        setRobotDogPatrolLoop(payload?.robotDogId, payload?.loop);
        return;
      case 'reload-base':
        loadRemoteSog({
          path: ASSET_PATHS.baseSog,
          filename: ASSET_LABELS.baseSog,
          missingMessage: `Cannot load ${ASSET_PATHS.baseSog}`
        });
        return;
      case 'start-camera-stream': {
        const cameraSourceId = payload?.cameraId;
        if (!cameraSourceId) {
          updateStatusMessage('Camera source not selected');
          return;
        }
        startCameraStreamFlow(cameraSourceId)
          .then(() => {
            updateStatusMessage(`Camera stream started: ${cameraSourceId}`);
          })
          .catch((error) => {
            console.warn('[CameraStream] stream start failed:', error);
            setCameraStreamStatus(cameraSourceId, {
              status: CAMERA_STREAM_STATUSES.ERROR,
              lastError: describeCameraStreamError(error),
              lastErrorCode: error?.code || null
            });
            updateStatusMessage(`Camera stream start failed: ${describeCameraStreamError(error)}`);
            emitState();
          });
        return;
      }
      case 'stop-camera-stream': {
        const cameraSourceId = payload?.cameraId;
        if (!cameraSourceId) {
          updateStatusMessage('Camera source not selected');
          return;
        }
        stopCameraStreamFlow(cameraSourceId)
          .then(() => {
            updateStatusMessage(`Camera stream stopped: ${cameraSourceId}`);
          })
          .catch((error) => {
            console.warn('[CameraStream] stream stop failed:', error);
            setCameraStreamStatus(cameraSourceId, {
              status: CAMERA_STREAM_STATUSES.ERROR,
              lastError: describeError(error)
            });
            updateStatusMessage(`Camera stream stop failed: ${describeError(error)}`);
            emitState();
          });
        return;
      }
      case 'bind-camera-stream': {
        const selectedId = selectionManager.getSelectedId();
        const cameraSourceId = payload?.cameraId;
        if (!selectedId) {
          updateStatusMessage('No selection');
          return;
        }
        if (!cameraSourceId) {
          updateStatusMessage('Camera source not selected');
          return;
        }
        bindCameraStreamToProjection(selectedId, cameraSourceId);
        return;
      }
      case 'toggle-projection-enabled': {
        const selectedId = selectionManager.getSelectedId();
        if (!selectedId) {
          updateStatusMessage('No selection');
          return;
        }
        const target = sceneObjectManager.getObject(selectedId);
        const nextEnabled = !target?.metadata?.videoProjection?.enabled;
        const currentProjection = createDefaultVideoProjectionMetadata(selectedId, target?.metadata?.videoProjection);

        if (nextEnabled && (currentProjection.quadPoints?.length ?? 0) !== 4) {
          updateStatusMessage('四点覆盖投影需要先选择 4 个世界锚点');
          return;
        }

        if (nextEnabled) {
          enableCameraVideoProjection(selectedId, {
            ...currentProjection,
            enabled: true,
            mode: currentProjection.mode === 'quad' ? 'quad' : 'quadOverlay',
            replaceMode: currentProjection.replaceMode ?? true,
            opacity: readNumberValue(currentProjection.opacity, 1),
            softEdge: readNumberValue(currentProjection.softEdge, 0)
          });
          return;
        }

        updateCameraVideoProjection(selectedId, {
          ...currentProjection,
          enabled: false,
          mode: currentProjection.mode === 'quad' ? 'quad' : 'quadOverlay',
          replaceMode: currentProjection.replaceMode ?? true,
          opacity: readNumberValue(currentProjection.opacity, 1),
          softEdge: readNumberValue(currentProjection.softEdge, 0)
        });
        updateStatusMessage(`${target?.displayName ?? selectedId} projection disabled`);
        return;
      }
      case 'start-quad-video-projection-editing': {
        startQuadVideoProjectionEditing(selectionManager.getSelectedId());
        return;
      }
      case 'stop-quad-video-projection-editing': {
        stopQuadVideoProjectionEditing(selectionManager.getSelectedId());
        return;
      }
      case 'clear-quad-video-projection-points': {
        clearQuadVideoProjectionPoints(selectionManager.getSelectedId());
        return;
      }
      case 'apply-quad-video-projection': {
        applyQuadVideoProjection(selectionManager.getSelectedId());
        return;
      }
      case 'update-video-projection': {
        const selectedId = selectionManager.getSelectedId();
        if (!selectedId) {
          updateStatusMessage('No selection');
          return;
        }
        const target = sceneObjectManager.getObject(selectedId);
        const currentEnabled = target?.metadata?.videoProjection?.enabled ?? false;
        const nextProjection = syncCameraProjectionMetadata(selectedId, {
          ...(payload ?? {}),
          enabled: payload && Object.prototype.hasOwnProperty.call(payload, 'enabled')
            ? payload.enabled
            : currentEnabled,
          mode: payload?.mode === 'cameraFrustum'
            ? 'cameraFrustum'
            : (payload?.mode === 'quad' ? 'quad' : 'quadOverlay'),
          sourceType: payload?.sourceType ?? CAMERA_SOURCE_TYPES.CAMERA_STREAM,
          replaceMode: payload?.replaceMode ?? target?.metadata?.videoProjection?.replaceMode ?? true
        });
        if (!target || !nextProjection) {
          updateStatusMessage('Camera device not found');
          return;
        }
        updateActiveProjectorFromProjection(selectedId, nextProjection);
        rebuildQuadProjectionHelpers(selectedId);
        updateStatusMessage('Projection updated');
        return;
      }
      default:
        updateStatusMessage(`${action} not implemented`);
    }
  }

  const gsplatPointPicker = new GsplatPointPicker({
    app,
    cameraEntity: camera,
    getSplatEntity: () => currentGsplatEntity,
    pickerScale: 1,
    logResult: false
  });

  new ObjectTransformDragController({
    app,
    canvas,
    cameraEntity: camera,
    selectionManager,
    cameraController,
    pickBusinessObject,
    transformGizmo,
    applyTransformToObject,
    shouldBlock: () => Boolean(
      buildingEnvelopeController.isDrawing()
      || getEditingQuadProjectionCameraId()
      || robotDogPatrolController.getEditingRobotDogId()
    ),
    canDragObject: isDraggableObject,
    isTransformEditEnabled: () => transformEditState.enabled,
    getTransformEditObjectId: () => transformEditState.objectId,
    onDragStateChange: (dragMode) => {
      transformEditState.dragMode = dragMode;
      if (transformEditState.enabled) {
        syncTransformEditStatusMessage();
        emitState();
      }
    },
    log(message) {
      console.log(message);
    }
  });

  const pickingController = new PickingController({
    app,
    canvas,
    camera,
    bimProxyManager,
    markerManager,
    gsplatPointPicker,
    shouldPrioritizeScenePick: () => Boolean(
      robotDogPatrolController.getEditingRobotDogId() ||
      getEditingQuadProjectionCameraId() ||
      buildingEnvelopeController.isDrawing()
    ),
    pickBusinessObject,
    shouldTrackHover: () => !isSelectableHoverBlocked(),
    hoverBusinessObject: pickBusinessObject,
    onBusinessObjectPick: (hit) => {
      if (buildingEnvelopeController.isDrawing()) {
        return;
      }
      if (isTransformEditSelectionBlocked(hit.objectId)) {
        console.info('[TransformEdit] blocked selection while editing');
        updateStatusMessage('请先完成或取消当前编辑');
        return;
      }
      clearBuildingEnvelopeHover();
      selectionManager.select(hit.objectId);
      syncTransformEditStatusMessage();
    },
    onBusinessObjectHover: (hit) => {
      canvas.style.cursor = 'pointer';
      selectableObjectController.setHoveredObject(hit.objectId);
    },
    onBusinessObjectHoverClear: () => {
      canvas.style.cursor = 'default';
      selectableObjectController.clearHoveredObject();
    },
    onGsplatPick: (hit) => {
      if (buildingEnvelopeController.isDrawing()) {
        addBuildingEnvelopePoint(hit.worldPoint);
        return;
      }

      const editingQuadCameraId = getEditingQuadProjectionCameraId();
      if (editingQuadCameraId) {
        addQuadVideoProjectionPoint(editingQuadCameraId, hit.worldPoint);
        selectionManager.select(editingQuadCameraId);
        return;
      }

      const markerEntity = markerManager.marker;
      if (markerEntity) {
        sceneObjectManager.addObject({
          id: OBJECT_IDS.marker,
          name: markerEntity.name,
          displayName: markerEntity.name,
          type: 'marker',
          entity: markerEntity,
          asset: null,
          visible: markerEntity.enabled,
          status: 'active',
          metadata: {
            position: `${hit.worldPoint.x.toFixed(2)}, ${hit.worldPoint.y.toFixed(2)}, ${hit.worldPoint.z.toFixed(2)}`
          }
        });
      }

      if (placementMode?.type) {
        placeBusinessObjectAt(placementMode.type, hit.worldPoint);
        return;
      }

      const editingRobotDogId = robotDogPatrolController.getEditingRobotDogId();
      if (editingRobotDogId) {
        addRobotDogRoutePoint(editingRobotDogId, hit.worldPoint);
        return;
      }

      console.debug(`[Pick] gsplat success: ${formatPointLog(hit.worldPoint)}`);
      setPickStatus('picked', `GSplat point picked: ${formatPointLog(hit.worldPoint)}`);
    },
    onFallbackPick: (hit) => {
      if (buildingEnvelopeController.isDrawing()) {
        console.warn('[BuildingEnvelope] add point failed: fallback plane pick is not allowed', {
          point: hit.point ? [hit.point.x, hit.point.y, hit.point.z] : null
        });
        updateStatusMessage('[BuildingEnvelope] add point failed: fallback plane pick is not allowed');
        return;
      }

      const editingQuadCameraId = getEditingQuadProjectionCameraId();
      if (editingQuadCameraId) {
        addQuadVideoProjectionPoint(editingQuadCameraId, hit.point);
        selectionManager.select(editingQuadCameraId);
        return;
      }

      const markerEntity = markerManager.marker;
      if (markerEntity) {
        sceneObjectManager.addObject({
          id: OBJECT_IDS.marker,
          name: markerEntity.name,
          displayName: markerEntity.name,
          type: 'marker',
          entity: markerEntity,
          asset: null,
          visible: markerEntity.enabled,
          status: 'active',
          metadata: {
            position: `${hit.point.x.toFixed(2)}, ${hit.point.y.toFixed(2)}, ${hit.point.z.toFixed(2)}`
          }
        });
      }

      console.debug(`[Pick] fallback plane used: ${formatPointLog(hit.point)}`);
      const editingRobotDogId = robotDogPatrolController.getEditingRobotDogId();
      if (editingRobotDogId) {
        addRobotDogRoutePoint(editingRobotDogId, hit.point);
        return;
      }

      if (placementMode?.type) {
        console.debug('[Placement] requires gsplat pick, fallback ignored');
        setPickStatus('warning', `Fallback plane picked: ${formatPointLog(hit.point)}`, 'Placement requires gsplat pick, fallback ignored');
      } else {
        setPickStatus('picked', `Fallback plane picked: ${formatPointLog(hit.point)}`);
      }
    },
    onClear: () => {
      sceneObjectManager.removeObject(OBJECT_IDS.marker);
      setPickStatus('ready', 'Ready');
    }
  });

  sceneObjectManager.subscribe(() => {
    const hoveredObjectId = selectableObjectController.getHoveredObjectId();
    if (hoveredObjectId && !sceneObjectManager.getObject(hoveredObjectId)) {
      selectableObjectController.clearHoveredObject();
      canvas.style.cursor = 'default';
    }
    selectableObjectController.refreshAllVisualStates();
    syncProjectionArchitectureFromSceneObjects();
    emitState();
  });

  selectionManager.subscribe((selectionId, selected) => {
    selectableObjectController.handleSelectionChanged(selectionId);

    if (selected) {
      console.log(`[ObjectSelection] selected ${selectionId} ${selected.type}`);
      pushLog(`Selected: ${selected.name}`);
    }
    if (!selectionId) {
      console.log('[ObjectSelection] cleared');
    }
    const editingRobotDogId = robotDogPatrolController.getEditingRobotDogId();
    if (editingRobotDogId && selectionId && editingRobotDogId !== selectionId) {
      robotDogPatrolController.stopRouteEditing(editingRobotDogId, { silent: true });
    }
    if (!selectionId) {
      refreshTransformGizmo();
      closeContextMenu();
      emitState();
      return;
    }
    if (!transformEditState.enabled) {
      syncTransformEditStatusMessage();
    }
    syncProjectionArchitectureFromSceneObjects();
    refreshTransformGizmo();
    emitState();
  });

  document.addEventListener('keydown', (event) => {
    const active = document.activeElement;
    const tag = active?.tagName?.toLowerCase();
    const isEditingText =
      tag === 'input' ||
      tag === 'textarea' ||
      active?.isContentEditable;

    if (transformEditState.enabled && !isEditingText) {
      if (event.key === 'Escape') {
        cancelTransformEdit();
        return;
      }

      if (event.key === 'Enter') {
        commitTransformEdit();
        return;
      }
    }

    if (event.key === 'Escape') {
      if (cancelBuildingEnvelopeDrawing()) {
        return;
      }
      if (stopRobotDogRouteEditing()) {
        return;
      }
      if (cancelPlacementMode()) {
        return;
      }
      closeContextMenu();
      return;
    }

    if (event.key !== 'Delete') {
      return;
    }

    if (isEditingText) {
      return;
    }

    if (buildingEnvelopeController.isDrawing()) {
      return;
    }

    const selectedId = selectionManager.getSelectedId();
    if (!selectedId) {
      return;
    }

    const object = sceneObjectManager.getObject(selectedId);
    if (!object || object.protected) {
      return;
    }

    deleteSceneObject(selectedId);
  });

  window.addEventListener('resize', closeContextMenu);
  window.addEventListener('scroll', closeContextMenu, true);
  document.addEventListener('pointerdown', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      closeContextMenu();
      return;
    }

    if (!target.closest('.context-menu')) {
      closeContextMenu();
    }

  });

  const assetChecks = [checkAssetAvailability(ASSET_PATHS.baseSog, ASSET_LABELS.baseSog)];
  if (UI_FLAGS.showDebugAssets) {
    assetChecks.push(
      checkAssetAvailability(ASSET_PATHS.convertedSog, 'converted/map.sog'),
      checkAssetAvailability(ASSET_PATHS.bimProxy, ASSET_LABELS.bimProxy)
    );
  }

  Promise.all(assetChecks).then((results) => {
    const [baseAvailable, convertedAvailable = false, bimAvailable = false] = results;
    if (UI_FLAGS.showDebugAssets) {
      console.info(
        `Asset availability summary: base.sog=${baseAvailable ? 'available' : 'missing'}, converted/map.sog=${convertedAvailable ? 'available' : 'missing'}, ${ASSET_LABELS.bimProxy}=${bimAvailable ? 'available' : 'missing'}`
      );
    } else {
      console.info(`Asset availability summary: base.sog=${baseAvailable ? 'available' : 'missing'}`);
    }
    updateStatusMessage('Asset checks complete');
  });

  app.on('update', (dt) => {
    let shouldEmitCameraRuntimeState = false;
    const runtimesToUpdate = new Set([
      ...cameraVideoRuntimes.values(),
      ...cameraSourceRuntimePool.getEntries().map((entry) => entry.runtime)
    ]);
    runtimesToUpdate.forEach((runtime) => {
      if (runtime.update()) {
        shouldEmitCameraRuntimeState = true;
      }
    });

    gsplatProjectionRenderer.update();
    robotDogPatrolController.update(dt ?? 0);
    refreshTransformGizmo();
    transformGizmo.update();

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (shouldEmitCameraRuntimeState && now - lastCameraVideoRuntimeEmitAt > 250) {
      lastCameraVideoRuntimeEmitAt = now;
      emitState();
    }
  });

  if (UI_FLAGS.createDefaultCameraDevice && !sceneObjectManager.getObject('camera_0')) {
    createBusinessSceneObject('cameraDevice', {
      id: 'camera_0',
      displayName: 'camera_0'
    });
  }

  loadSavedAlignment({ silent: true });
  robotDogPatrolController.syncExistingRobotDogs();
  refreshCameraSources().catch((error) => {
    console.warn('[CameraStream] initial refresh failed:', error);
  });
  syncProjectionArchitectureFromSceneObjects();
  updateDebugHandles();
  resizeViewport();
  flushState();

  return {
    subscribe(listener) {
      listeners.add(listener);
      listener(buildRuntimeSnapshot());
      return () => listeners.delete(listener);
    },
    getSnapshot() {
      return buildRuntimeSnapshot();
    },
    getCameraViewState,
    restoreCameraView,
    clearSceneForProjectOpen,
    selectSceneObject,
    getSceneObjectSnapshots() {
      return sceneObjectManager.getObjectSnapshots();
    },
    setUploadedAssets,
    restoreSceneObjectsFromPayload,
    addSceneObjectByType,
    createRobotDog,
    startRobotDogRouteEditing,
    stopRobotDogRouteEditing,
    addRobotDogRoutePoint,
    clearRobotDogRoute,
    startRobotDogPatrol,
    pauseRobotDogPatrol,
    resumeRobotDogPatrol,
    stopRobotDogPatrol,
    setRobotDogPatrolSpeed,
    getRobotDogPatrolState,
    OBJECT_IDS,
    handleToolbarAction,
    handleHierarchySelect,
    handleAssetSelect,
    handleInspectorAction,
    handleContextMenuAction,
    addAssetToScene,
    toggleObjectVisibility,
    openContextMenu,
    closeContextMenu,
    enableCameraVideoProjection,
    disableCameraVideoProjection,
    updateCameraVideoProjection,
    toggleCameraVideoProjection,
    startQuadVideoProjectionEditing,
    stopQuadVideoProjectionEditing,
    addQuadVideoProjectionPoint,
    clearQuadVideoProjectionPoints,
    applyQuadVideoProjection,
    startBuildingEnvelopeDrawing,
    stopBuildingEnvelopeDrawing,
    cancelBuildingEnvelopeDrawing,
    addBuildingEnvelopePoint,
    undoBuildingEnvelopePoint,
    clearBuildingEnvelopeDraft,
    finishBuildingEnvelopeDrawing,
    createBuildingEnvelopeFromPoints,
    updateBuildingEnvelope,
    setBuildingEnvelopeHeight,
    setBuildingEnvelopeColor,
    setBuildingEnvelopeOpacity,
    setBuildingEnvelopeOutlineVisible,
    deleteBuildingEnvelope,
    loadBim,
    loadRemoteSog,
    loadSogFile
  };
}
