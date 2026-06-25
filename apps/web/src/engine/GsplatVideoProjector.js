import * as pc from 'playcanvas';

const MAX_PROJECTORS = 4;
const DEFAULT_TEST_VIDEO_CANDIDATES = [
  '/assets/test.mp4',
  '/assets/test.MP4',
  '/assets/Test.mp4',
  '/assets/Test.MP4'
];
const DEFAULT_CALIBRATION_UVS = [
  [0, 1],
  [1, 1],
  [1, 0],
  [0, 0]
];
const SHADER_DEBUG_MODE = {
  none: 0,
  forcePurpleAll: 1,
  uvGradient: 2,
  projectVideoNoDepth: 3,
  projectVideo: 4
};

function clonePoint(point) {
  if (!point) {
    return null;
  }

  return {
    index: point.index,
    videoUv: Array.isArray(point.videoUv) ? [...point.videoUv] : null,
    worldPoint: Array.isArray(point.worldPoint) ? [...point.worldPoint] : null
  };
}

function cloneDeviceMetadata(device) {
  return {
    enabled: device.enabled,
    videoUrl: device.videoUrl,
    calibrationMode: device.calibrationMode,
    projectorFov: device.projectorFov,
    projectorAspect: device.projectorAspect,
    projectorNear: device.projectorNear,
    projectorFar: device.projectorFar,
    opacity: device.opacity,
    softEdge: device.softEdge,
    flipY: device.flipY,
    shaderDebugMode: device.shaderDebugMode,
    calibrationState: device.calibrationState,
    calibrationIndex: device.calibrationIndex,
    calibrationPoints: device.calibrationPoints.map(clonePoint),
    shaderSlot: device.shaderSlot,
    uploadFrameCount: device.uploadFrameCount,
    debugStats: {
      currentTime: device.videoElement?.currentTime ?? 0,
      readyState: device.videoElement?.readyState ?? 0,
      videoWidth: device.videoElement?.videoWidth ?? 0,
      videoHeight: device.videoElement?.videoHeight ?? 0
    }
  };
}

function vec3ToArray(value) {
  if (!value) {
    return null;
  }

  return [value.x, value.y, value.z];
}

function arrayToVec3(value, fallback = null) {
  if (!Array.isArray(value) || value.length < 3) {
    return fallback ? fallback.clone() : null;
  }

  return new pc.Vec3(value[0], value[1], value[2]);
}

function isFiniteVec3(value) {
  return value && Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}

function clamp01(value, fallback = 0) {
  const next = Number.parseFloat(value);
  if (!Number.isFinite(next)) {
    return fallback;
  }

  return Math.max(0, Math.min(1, next));
}

function readFinite(value, fallback) {
  const next = Number.parseFloat(value);
  return Number.isFinite(next) ? next : fallback;
}

function buildCalibrationPoint(index, point = null) {
  return {
    index,
    videoUv: Array.isArray(point?.videoUv) ? [...point.videoUv] : [...DEFAULT_CALIBRATION_UVS[index]],
    worldPoint: Array.isArray(point?.worldPoint) && point.worldPoint.length >= 3 ? [...point.worldPoint] : null
  };
}

function createDefaultDevice(id, name) {
  return {
    id,
    name,
    enabled: true,
    videoUrl: null,
    videoAsset: null,
    videoElement: null,
    videoTexture: null,
    calibrationMode: 'fourPoint',
    projectorEntity: null,
    projectorFov: 60,
    projectorAspect: 16 / 9,
    projectorNear: 0.1,
    projectorFar: 500,
    opacity: 1,
    softEdge: 0.05,
    flipY: false,
    shaderDebugMode: 'projectVideo',
    calibrationState: 'idle',
    calibrationIndex: 0,
    calibrationPoints: [0, 1, 2, 3].map((index) => buildCalibrationPoint(index)),
    planeOrigin: null,
    planeAxisU: null,
    planeAxisV: null,
    planeNormal: null,
    boundsU: [0, 1],
    boundsV: [0, 1],
    shaderSlot: -1,
    uploadFrameCount: 0,
    lastUploadLogTime: 0
  };
}

function makeFlatArray(vec, fallback = [0, 0, 0]) {
  if (!isFiniteVec3(vec)) {
    return fallback;
  }

  return [vec.x, vec.y, vec.z];
}

function subtractVec3Array(lhs, rhs) {
  return [
    lhs[0] - rhs[0],
    lhs[1] - rhs[1],
    lhs[2] - rhs[2]
  ];
}

function dotVec3Array(lhs, rhs) {
  return lhs[0] * rhs[0] + lhs[1] * rhs[1] + lhs[2] * rhs[2];
}

function crossVec3Array(lhs, rhs) {
  return [
    lhs[1] * rhs[2] - lhs[2] * rhs[1],
    lhs[2] * rhs[0] - lhs[0] * rhs[2],
    lhs[0] * rhs[1] - lhs[1] * rhs[0]
  ];
}

function lengthSqVec3Array(value) {
  return dotVec3Array(value, value);
}

function normalizeVec3Array(value) {
  const lengthSq = lengthSqVec3Array(value);
  if (!Number.isFinite(lengthSq) || lengthSq < 1e-12) {
    return null;
  }

  const length = Math.sqrt(lengthSq);
  return [value[0] / length, value[1] / length, value[2] / length];
}

export class GsplatVideoProjector {
  constructor({
    app,
    getGsplatEntity,
    getMainCameraEntity = null,
    onDeviceStateChange = null,
    maxProjectors = MAX_PROJECTORS
  }) {
    this.app = app;
    this.getGsplatEntity = typeof getGsplatEntity === 'function' ? getGsplatEntity : () => null;
    this.getMainCameraEntity = typeof getMainCameraEntity === 'function' ? getMainCameraEntity : () => null;
    this.onDeviceStateChange = typeof onDeviceStateChange === 'function' ? onDeviceStateChange : null;
    this.maxProjectors = Math.max(1, Math.min(MAX_PROJECTORS, maxProjectors));
    this.devices = new Map();
    this.material = null;
    this.installedMaterial = null;
    this.videoCandidates = [...DEFAULT_TEST_VIDEO_CANDIDATES];
    this.tempMat4 = new pc.Mat4();
    this.tempInvWorld = new pc.Mat4();
    this.previewEntity = null;
    this.previewMaterial = null;
    this.previewDeviceId = null;
  }

  destroy() {
    this.devices.forEach((device) => this.destroyDeviceResources(device));
    this.devices.clear();
    this.destroyPreviewPlane();
    this.material = null;
    this.installedMaterial = null;
  }

  getDevices() {
    return Array.from(this.devices.values()).map((device) => ({
      ...cloneDeviceMetadata(device),
      id: device.id,
      name: device.name
    }));
  }

  getDevice(id) {
    const device = this.devices.get(id);
    if (!device) {
      return null;
    }

    return {
      id: device.id,
      name: device.name,
      ...cloneDeviceMetadata(device)
    };
  }

  addCameraDevice(config = {}) {
    const id = config.id || `camera_${this.devices.size}`;
    const existing = this.devices.get(id);
    if (existing) {
      this.patchDevice(existing, config);
      return existing;
    }

    const device = createDefaultDevice(id, config.name || id);
    this.patchDevice(device, config);
    this.devices.set(id, device);
    this.reindexShaderSlots();
    this.emitDeviceStateChange(device, 'cameraDevice:added');
    return device;
  }

  removeCameraDevice(id) {
    const device = this.devices.get(id);
    if (!device) {
      return false;
    }

    this.destroyDeviceResources(device);
    this.devices.delete(id);
    this.reindexShaderSlots();
    this.applyToMaterial();
    return true;
  }

  enableCameraDevice(id, enabled) {
    const device = this.devices.get(id);
    if (!device) {
      return false;
    }

    device.enabled = Boolean(enabled);
    this.emitDeviceStateChange(device, 'cameraDevice:projectionUpdated');
    return true;
  }

  patchCameraDevice(id, config = {}) {
    const device = this.devices.get(id);
    if (!device) {
      return false;
    }

    this.patchDevice(device, config);
    return true;
  }

  patchDevice(device, config = {}) {
    device.name = config.name || device.name;
    device.enabled = config.enabled ?? device.enabled;
    device.calibrationMode = config.calibrationMode || device.calibrationMode;
    device.projectorFov = readFinite(config.projectorFov, device.projectorFov);
    device.projectorAspect = readFinite(config.projectorAspect, device.projectorAspect);
    device.projectorNear = readFinite(config.projectorNear, device.projectorNear);
    device.projectorFar = readFinite(config.projectorFar, device.projectorFar);
    device.opacity = clamp01(config.opacity, device.opacity);
    device.softEdge = clamp01(config.softEdge, device.softEdge);
    device.flipY = Boolean(config.flipY ?? device.flipY);
    device.shaderDebugMode = config.shaderDebugMode || device.shaderDebugMode;
    device.projectorEntity = config.projectorEntity ?? device.projectorEntity;

    if (Array.isArray(config.calibrationPoints)) {
      device.calibrationPoints = [0, 1, 2, 3].map((index) => buildCalibrationPoint(index, config.calibrationPoints[index]));
    }

    this.recomputeFourPointPlane(device);
    this.emitDeviceStateChange(device, 'cameraDevice:projectionUpdated');
  }

  setCameraProjectorEntity(id, projectorEntity) {
    const device = this.devices.get(id);
    if (!device) {
      return false;
    }

    device.projectorEntity = projectorEntity;
    this.emitDeviceStateChange(device, 'cameraDevice:projectionUpdated');
    return true;
  }

  async autoBindFirstTestVideo(cameraId = 'camera_0') {
    const found = await this.findFirstReachableVideo();
    if (!found) {
      console.warn('[GsplatVideoProjector] test.mp4 not found under /assets.');
      return null;
    }

    const device = this.addCameraDevice({
      id: cameraId,
      name: cameraId
    });
    await this.bindVideoToCameraDevice(device.id, found);
    return found;
  }

  async findFirstReachableVideo() {
    for (const candidate of this.videoCandidates) {
      try {
        const response = await fetch(candidate, {
          method: 'HEAD',
          cache: 'no-store'
        });
        if (response.ok) {
          return candidate;
        }
      } catch (_error) {
      }
    }

    return null;
  }

  async bindVideoToCameraDevice(id, videoAssetOrUrl) {
    const device = this.devices.get(id);
    if (!device) {
      throw new Error(`Camera device not found: ${id}`);
    }

    const videoUrl = typeof videoAssetOrUrl === 'string'
      ? videoAssetOrUrl
      : videoAssetOrUrl?.url;

    if (!videoUrl) {
      throw new Error(`Video url missing for ${id}`);
    }

    this.destroyDeviceResources(device);

    const videoElement = document.createElement('video');
    videoElement.src = videoUrl;
    videoElement.crossOrigin = 'anonymous';
    videoElement.loop = true;
    videoElement.muted = true;
    videoElement.autoplay = true;
    videoElement.playsInline = true;
    videoElement.preload = 'auto';
    videoElement.style.display = 'none';
    document.body.appendChild(videoElement);

    const videoTexture = new pc.Texture(this.app.graphicsDevice, {
      name: `projected-video-${id}`,
      mipmaps: false,
      minFilter: pc.FILTER_LINEAR,
      magFilter: pc.FILTER_LINEAR,
      addressU: pc.ADDRESS_CLAMP_TO_EDGE,
      addressV: pc.ADDRESS_CLAMP_TO_EDGE
    });

    device.videoUrl = videoUrl;
    device.videoAsset = videoAssetOrUrl;
    device.videoElement = videoElement;
    device.videoTexture = videoTexture;
    device.uploadFrameCount = 0;
    device.lastUploadLogTime = 0;

    videoElement.addEventListener('loadedmetadata', () => {
      if (!device.videoTexture || !device.videoElement) {
        return;
      }

      device.videoTexture.setSource(device.videoElement);
      console.log('[GsplatVideoProjector] loadedmetadata:', id, videoUrl, `${videoElement.videoWidth}x${videoElement.videoHeight}`);
      this.emitDeviceStateChange(device, 'cameraDevice:videoBound');
      this.applyToMaterial();
    });

    videoElement.addEventListener('playing', () => {
      console.log('[GsplatVideoProjector] video playing:', id, videoUrl);
    });

    videoElement.addEventListener('canplay', () => {
      const playPromise = videoElement.play();
      if (playPromise?.catch) {
        playPromise.catch((error) => {
          console.warn('[GsplatVideoProjector] autoplay blocked:', id, error);
        });
      }
    });

    videoElement.load();
    console.log('[GsplatVideoProjector] bind video:', id, videoUrl);
    this.emitDeviceStateChange(device, 'cameraDevice:videoBound');
    this.applyToMaterial();
    return true;
  }

  startFourPointCalibration(id) {
    const device = this.devices.get(id);
    if (!device) {
      return false;
    }

    if (!Array.isArray(device.calibrationPoints) || device.calibrationPoints.length !== 4) {
      device.calibrationPoints = [0, 1, 2, 3].map((index) => buildCalibrationPoint(index, device.calibrationPoints?.[index]));
    } else {
      device.calibrationPoints = [0, 1, 2, 3].map((index) => buildCalibrationPoint(index, device.calibrationPoints[index]));
    }
    device.calibrationMode = 'fourPoint';
    device.calibrationState = 'capturing';
    device.calibrationIndex = 0;
    this.emitDeviceStateChange(device, 'cameraDevice:calibrationStarted');
    return true;
  }

  setCalibrationWorldPoint(id, index, worldPoint) {
    const device = this.devices.get(id);
    if (!device) {
      return false;
    }

    const safeIndex = Number.isInteger(index) ? index : Number.parseInt(index, 10);
    if (!Number.isInteger(safeIndex) || safeIndex < 0 || safeIndex > 3) {
      console.warn('[GsplatVideoProjector] invalid calibration index:', id, index);
      return false;
    }

    if (!Array.isArray(device.calibrationPoints) || device.calibrationPoints.length !== 4) {
      device.calibrationPoints = [0, 1, 2, 3].map((pointIndex) => buildCalibrationPoint(pointIndex, device.calibrationPoints?.[pointIndex]));
    }

    const point = device.calibrationPoints[safeIndex];
    if (!point) {
      return false;
    }

    point.worldPoint = Array.isArray(worldPoint) ? [...worldPoint] : vec3ToArray(worldPoint);
    device.calibrationIndex = Math.min(4, safeIndex + 1);
    console.log('[GsplatVideoProjector] calibration world point:', id, safeIndex, point.worldPoint);
    this.emitDeviceStateChange(device, 'cameraDevice:calibrationPointSet');
    this.recomputeFourPointPlane(device);
    this.applyToMaterial();
    return true;
  }

  setCalibrationVideoUv(id, index, uv) {
    const device = this.devices.get(id);
    if (!device) {
      return false;
    }

    const point = device.calibrationPoints[index];
    if (!point) {
      return false;
    }

    point.videoUv = [clamp01(uv?.[0], point.videoUv?.[0] ?? 0), clamp01(uv?.[1], point.videoUv?.[1] ?? 0)];
    this.emitDeviceStateChange(device, 'cameraDevice:projectionUpdated');
    this.recomputeFourPointPlane(device);
    this.applyToMaterial();
    return true;
  }

  finishFourPointCalibration(id) {
    const device = this.devices.get(id);
    if (!device) {
      return false;
    }

    this.recomputeFourPointPlane(device);
    const complete = device.calibrationPoints.every((point) => Array.isArray(point.worldPoint) && point.worldPoint.length === 3);
    device.calibrationState = complete ? 'ready' : 'partial';
    device.calibrationIndex = complete ? 4 : device.calibrationIndex;
    console.log('[GsplatVideoProjector] calibration finished:', id, device.calibrationState);
    this.emitDeviceStateChange(device, 'cameraDevice:calibrationFinished');
    this.applyToMaterial();
    return complete;
  }

  clearCalibration(id) {
    const device = this.devices.get(id);
    if (!device) {
      return false;
    }

    device.calibrationState = 'idle';
    device.calibrationIndex = 0;
    device.calibrationPoints = [0, 1, 2, 3].map((index) => buildCalibrationPoint(index));
    device.planeOrigin = null;
    device.planeAxisU = null;
    device.planeAxisV = null;
    device.planeNormal = null;
    device.boundsU = [0, 1];
    device.boundsV = [0, 1];
    this.emitDeviceStateChange(device, 'cameraDevice:projectionUpdated');
    this.applyToMaterial();
    return true;
  }

  recomputeFourPointPlane(device) {
    if (!Array.isArray(device.calibrationPoints) || device.calibrationPoints.length !== 4) {
      device.planeOrigin = null;
      device.planeAxisU = null;
      device.planeAxisV = null;
      device.planeNormal = null;
      device.boundsU = [0, 1];
      device.boundsV = [0, 1];
      console.warn('[GsplatVideoProjector] calibrationPoints invalid, plane skipped:', device.id, device.calibrationPoints);
      return false;
    }

    const points = [0, 1, 2, 3].map((index) => {
      const entry = device.calibrationPoints[index];
      if (!entry || !Array.isArray(entry.worldPoint) || entry.worldPoint.length < 3) {
        return null;
      }
      const point = [
        Number(entry.worldPoint[0]),
        Number(entry.worldPoint[1]),
        Number(entry.worldPoint[2])
      ];
      return point.every((value) => Number.isFinite(value)) ? point : null;
    });

    if (points.some((point) => point === null)) {
      device.planeOrigin = null;
      device.planeAxisU = null;
      device.planeAxisV = null;
      device.planeNormal = null;
      device.boundsU = [0, 1];
      device.boundsV = [0, 1];
      console.warn('[GsplatVideoProjector] incomplete calibration points, plane skipped:', device.id, device.calibrationPoints);
      return false;
    }

    const lt = points[0];
    const rt = points[1];
    const lb = points[3];

    const axisURaw = subtractVec3Array(rt, lt);
    const axisVRaw = subtractVec3Array(lb, lt);
    if (lengthSqVec3Array(axisURaw) < 1e-8 || lengthSqVec3Array(axisVRaw) < 1e-8) {
      return false;
    }

    const normalRaw = crossVec3Array(axisURaw, axisVRaw);
    if (lengthSqVec3Array(normalRaw) < 1e-8) {
      return false;
    }

    const axisU = normalizeVec3Array(axisURaw);
    const axisV = normalizeVec3Array(axisVRaw);
    const normal = normalizeVec3Array(normalRaw);
    if (!axisU || !axisV || !normal) {
      return false;
    }

    device.planeOrigin = new pc.Vec3(lt[0], lt[1], lt[2]);
    device.planeAxisU = new pc.Vec3(axisU[0], axisU[1], axisU[2]);
    device.planeAxisV = new pc.Vec3(axisV[0], axisV[1], axisV[2]);
    device.planeNormal = new pc.Vec3(normal[0], normal[1], normal[2]);

    const localPoints = points.map((point) => {
      const offset = subtractVec3Array(point, lt);
      return {
        u: dotVec3Array(offset, axisU),
        v: dotVec3Array(offset, axisV)
      };
    });

    const uValues = localPoints.map((entry) => entry.u);
    const vValues = localPoints.map((entry) => entry.v);
    device.boundsU = [Math.min(...uValues), Math.max(...uValues)];
    device.boundsV = [Math.min(...vValues), Math.max(...vValues)];
    return true;
  }

  ensureMaterialInstalled() {
    const gsplatEntity = this.getGsplatEntity();
    const material = gsplatEntity?.gsplat?._instance?.material ?? gsplatEntity?.gsplat?.instance?.material ?? null;
    if (!material) {
      return false;
    }

    if (this.installedMaterial === material) {
      this.material = material;
      return true;
    }

    this.installedMaterial = material;
    this.material = material;

    console.log('[GsplatVideoProjector] graphics backend:', this.app.graphicsDevice.isWebGPU ? 'webgpu' : 'webgl');
    console.log('[GsplatVideoProjector] original gsplatModifyPS:', material.shaderChunks.glsl.get('gsplatModifyPS') ?? '<engine-default>');
    material.shaderChunks.glsl.set('gsplatModifyVS', this.buildModifyVsChunkGLSL());
    material.shaderChunks.glsl.set('gsplatModifyPS', this.buildModifyPsChunkGLSL());
    material.shaderChunks.wgsl.set('gsplatModifyVS', this.buildModifyVsChunkWGSL());
    material.shaderChunks.wgsl.set('gsplatModifyPS', this.buildModifyPsChunkWGSL());
    material.update();
    console.log('[GsplatVideoProjector] shader installed');
    return true;
  }

  buildModifyVsChunkGLSL() {
    return `
varying mediump vec3 vProjectedWorldCenter;
void modifySplatCenter(inout vec3 center) {
}
void modifySplatRotationScale(vec3 originalCenter, vec3 modifiedCenter, inout vec4 rotation, inout vec3 scale) {
}
void modifySplatColor(vec3 center, inout vec4 color) {
  vProjectedWorldCenter = (matrix_model * vec4(center, 1.0)).xyz;
}
`;
  }

  buildModifyPsChunkGLSL() {
    const declarations = [];
    const body = [];

    for (let index = 0; index < this.maxProjectors; index += 1) {
      declarations.push(`
uniform bool uCameraEnabled${index};
uniform int uProjectionMode${index};
uniform float uProjectionOpacity${index};
uniform float uProjectionSoftEdge${index};
uniform bool uProjectionFlipY${index};
uniform int uShaderDebugMode${index};
uniform vec3 uCalibPlaneOrigin${index};
uniform vec3 uCalibPlaneAxisU${index};
uniform vec3 uCalibPlaneAxisV${index};
uniform vec2 uCalibBoundsU${index};
uniform vec2 uCalibBoundsV${index};
uniform sampler2D uProjectedVideo${index};
`);
      body.push(`
  if (uCameraEnabled${index}) {
    if (uShaderDebugMode${index} == 1) {
      color.rgb = vec3(1.0, 0.0, 1.0);
      color.a = 1.0;
      return;
    }
    vec2 projectedUv${index};
    bool hasProjection${index} = false;
    if (uProjectionMode${index} == 1) {
      vec3 offset${index} = vProjectedWorldCenter - uCalibPlaneOrigin${index};
      float localU${index} = dot(offset${index}, uCalibPlaneAxisU${index});
      float localV${index} = dot(offset${index}, uCalibPlaneAxisV${index});
      float denomU${index} = max(abs(uCalibBoundsU${index}.y - uCalibBoundsU${index}.x), 0.0001);
      float denomV${index} = max(abs(uCalibBoundsV${index}.y - uCalibBoundsV${index}.x), 0.0001);
      projectedUv${index} = vec2(
        (localU${index} - uCalibBoundsU${index}.x) / denomU${index},
        (localV${index} - uCalibBoundsV${index}.x) / denomV${index}
      );
      hasProjection${index} = true;
    }
    if (hasProjection${index}) {
      vec2 uv${index} = projectedUv${index};
      if (uProjectionFlipY${index}) {
        uv${index}.y = 1.0 - uv${index}.y;
      }
      if (uShaderDebugMode${index} == 2) {
        if (uv${index}.x >= 0.0 && uv${index}.x <= 1.0 && uv${index}.y >= 0.0 && uv${index}.y <= 1.0) {
          color.rgb = vec3(uv${index}.x, uv${index}.y, 1.0);
          color.a = 1.0;
        }
        return;
      }
      vec2 centered${index} = abs(uv${index} * 2.0 - 1.0);
      float edge${index} = max(centered${index}.x, centered${index}.y);
      float soft${index} = max(uProjectionSoftEdge${index}, 0.0001);
      float mask${index} = 1.0 - smoothstep(1.0 - soft${index}, 1.0, edge${index});
      if (uv${index}.x >= 0.0 && uv${index}.x <= 1.0 && uv${index}.y >= 0.0 && uv${index}.y <= 1.0) {
        vec4 videoColor${index} = texture2D(uProjectedVideo${index}, uv${index});
        if (uShaderDebugMode${index} == 3) {
          color.rgb = mix(color.rgb, videoColor${index}.rgb, clamp(uProjectionOpacity${index}, 0.0, 1.0));
          color.a = 1.0;
          return;
        }
        float blendAlpha${index} = clamp(uProjectionOpacity${index}, 0.0, 1.0) * mask${index} * videoColor${index}.a;
        color.rgb = mix(color.rgb, videoColor${index}.rgb, blendAlpha${index});
        color.a = max(color.a, blendAlpha${index});
      }
    }
  }
`);
    }

    return `
varying mediump vec3 vProjectedWorldCenter;
${declarations.join('\n')}
void modifySplatColor(vec2 gaussianUV, inout vec4 color) {
${body.join('\n')}
}
`;
  }

  buildModifyVsChunkWGSL() {
    return `
varying vProjectedWorldCenter: vec3f;
fn modifySplatCenter(center: ptr<function, vec3f>) {
}
fn modifySplatRotationScale(originalCenter: vec3f, modifiedCenter: vec3f, rotation: ptr<function, vec4f>, scale: ptr<function, vec3f>) {
}
fn modifySplatColor(center: vec3f, color: ptr<function, vec4f>) {
  vProjectedWorldCenter = (uniform.matrix_model * vec4f(center, 1.0)).xyz;
}
`;
  }

  buildModifyPsChunkWGSL() {
    const declarations = [];
    const body = [];

    for (let index = 0; index < this.maxProjectors; index += 1) {
      declarations.push(`
uniform uCameraEnabled${index}: f32;
uniform uProjectionMode${index}: f32;
uniform uProjectionOpacity${index}: f32;
uniform uProjectionSoftEdge${index}: f32;
uniform uProjectionFlipY${index}: f32;
uniform uShaderDebugMode${index}: f32;
uniform uCalibPlaneOrigin${index}: vec3f;
uniform uCalibPlaneAxisU${index}: vec3f;
uniform uCalibPlaneAxisV${index}: vec3f;
uniform uCalibBoundsU${index}: vec2f;
uniform uCalibBoundsV${index}: vec2f;
var uProjectedVideo${index}: texture_2d<f32>;
var uProjectedVideo${index}Sampler: sampler;
`);
      body.push(`
  if (uniform.uCameraEnabled${index} > 0.5) {
    if (uniform.uShaderDebugMode${index} > 0.5 && uniform.uShaderDebugMode${index} < 1.5) {
      (*color).rgb = vec3f(1.0, 0.0, 1.0);
      (*color).a = 1.0;
      return;
    }
    var projectedUv${index}: vec2f;
    var hasProjection${index}: bool = false;
    if (uniform.uProjectionMode${index} > 0.5) {
      let offset${index}: vec3f = vProjectedWorldCenter - uniform.uCalibPlaneOrigin${index};
      let localU${index}: f32 = dot(offset${index}, uniform.uCalibPlaneAxisU${index});
      let localV${index}: f32 = dot(offset${index}, uniform.uCalibPlaneAxisV${index});
      let denomU${index}: f32 = max(abs(uniform.uCalibBoundsU${index}.y - uniform.uCalibBoundsU${index}.x), 0.0001);
      let denomV${index}: f32 = max(abs(uniform.uCalibBoundsV${index}.y - uniform.uCalibBoundsV${index}.x), 0.0001);
      projectedUv${index} = vec2f(
        (localU${index} - uniform.uCalibBoundsU${index}.x) / denomU${index},
        (localV${index} - uniform.uCalibBoundsV${index}.x) / denomV${index}
      );
      hasProjection${index} = true;
    }
    if (hasProjection${index}) {
      var uv${index}: vec2f = projectedUv${index};
      if (uniform.uProjectionFlipY${index} > 0.5) {
        uv${index}.y = 1.0 - uv${index}.y;
      }
      if (uniform.uShaderDebugMode${index} > 1.5 && uniform.uShaderDebugMode${index} < 2.5) {
        if (uv${index}.x >= 0.0 && uv${index}.x <= 1.0 && uv${index}.y >= 0.0 && uv${index}.y <= 1.0) {
          (*color).rgb = vec3f(uv${index}.x, uv${index}.y, 1.0);
          (*color).a = 1.0;
        }
        return;
      }
      let centered${index}: vec2f = abs(uv${index} * 2.0 - 1.0);
      let edge${index}: f32 = max(centered${index}.x, centered${index}.y);
      let soft${index}: f32 = max(uniform.uProjectionSoftEdge${index}, 0.0001);
      let mask${index}: f32 = 1.0 - smoothstep(1.0 - soft${index}, 1.0, edge${index});
      if (uv${index}.x >= 0.0 && uv${index}.x <= 1.0 && uv${index}.y >= 0.0 && uv${index}.y <= 1.0) {
        let videoColor${index}: vec4f = textureSampleLevel(uProjectedVideo${index}, uProjectedVideo${index}Sampler, uv${index}, 0.0);
        if (uniform.uShaderDebugMode${index} > 2.5 && uniform.uShaderDebugMode${index} < 3.5) {
          (*color).rgb = mix((*color).rgb, videoColor${index}.rgb, clamp(uniform.uProjectionOpacity${index}, 0.0, 1.0));
          (*color).a = 1.0;
          return;
        }
        let blendAlpha${index}: f32 = clamp(uniform.uProjectionOpacity${index}, 0.0, 1.0) * mask${index} * videoColor${index}.a;
        (*color).rgb = mix((*color).rgb, videoColor${index}.rgb, blendAlpha${index});
        (*color).a = max((*color).a, blendAlpha${index});
      }
    }
  }
`);
    }

    return `
varying vProjectedWorldCenter: vec3f;
${declarations.join('\n')}
fn modifySplatColor(gaussianUV: vec2f, color: ptr<function, vec4f>) {
${body.join('\n')}
}
`;
  }

  reindexShaderSlots() {
    let slot = 0;
    this.devices.forEach((device) => {
      device.shaderSlot = slot < this.maxProjectors ? slot : -1;
      slot += 1;
    });
    console.log('[GsplatVideoProjector] enabled camera count:', Array.from(this.devices.values()).filter((device) => device.shaderSlot >= 0).length);
  }

  emitDeviceStateChange(device, eventName) {
    const payload = {
      id: device.id,
      name: device.name,
      metadata: cloneDeviceMetadata(device)
    };
    this.onDeviceStateChange?.(payload);
    this.app?.fire?.(eventName, payload);
  }

  applyToMaterial() {
    if (!this.ensureMaterialInstalled()) {
      return false;
    }

    for (let index = 0; index < this.maxProjectors; index += 1) {
      const device = Array.from(this.devices.values()).find((entry) => entry.shaderSlot === index) ?? null;
      this.material.setParameter(`uCameraEnabled${index}`, device?.enabled && device?.videoTexture ? 1 : 0);
      this.material.setParameter(`uProjectionMode${index}`, device?.calibrationMode === 'fourPoint' ? 1 : 0);
      this.material.setParameter(`uProjectionOpacity${index}`, device?.opacity ?? 0);
      this.material.setParameter(`uProjectionSoftEdge${index}`, device?.softEdge ?? 0.05);
      this.material.setParameter(`uProjectionFlipY${index}`, device?.flipY ? 1 : 0);
      this.material.setParameter(`uShaderDebugMode${index}`, SHADER_DEBUG_MODE[device?.shaderDebugMode ?? 'none'] ?? 0);
      this.material.setParameter(`uCalibPlaneOrigin${index}`, makeFlatArray(device?.planeOrigin));
      this.material.setParameter(`uCalibPlaneAxisU${index}`, makeFlatArray(device?.planeAxisU, [1, 0, 0]));
      this.material.setParameter(`uCalibPlaneAxisV${index}`, makeFlatArray(device?.planeAxisV, [0, 1, 0]));
      this.material.setParameter(`uCalibBoundsU${index}`, device?.boundsU ?? [0, 1]);
      this.material.setParameter(`uCalibBoundsV${index}`, device?.boundsV ?? [0, 1]);
      if (device?.videoTexture) {
        this.material.setParameter(`uProjectedVideo${index}`, device.videoTexture);
      }
    }

    const activeDevice = Array.from(this.devices.values()).find((entry) => entry.shaderSlot === 0) ?? null;
    if (activeDevice) {
      console.log('[GsplatVideoProjector] material parameters after set', {
        hasUProjectedVideo0: Boolean(activeDevice.videoTexture),
        shaderDebugMode: activeDevice.shaderDebugMode,
        boundsU: activeDevice.boundsU,
        boundsV: activeDevice.boundsV
      });
    }

    return true;
  }

  update() {
    this.ensureMaterialInstalled();

    this.devices.forEach((device) => {
      if (!device.enabled || !device.videoTexture || !device.videoElement) {
        return;
      }

      if (device.videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        device.videoTexture.setSource(device.videoElement);
        device.videoTexture.upload();
        device.uploadFrameCount += 1;
        const now = performance.now();
        if (now - device.lastUploadLogTime > 1000) {
          device.lastUploadLogTime = now;
          console.log('[GsplatVideoProjector] video texture upload tick', {
            id: device.id,
            currentTime: device.videoElement.currentTime,
            readyState: device.videoElement.readyState,
            videoWidth: device.videoElement.videoWidth,
            videoHeight: device.videoElement.videoHeight,
            uploadFrameCount: device.uploadFrameCount
          });
        }
      }
    });

    this.updatePreviewPlane();
    this.applyToMaterial();
  }

  async enableVideoTexturePreview(cameraDeviceId = 'camera_0', videoUrl = null) {
    let device = this.devices.get(cameraDeviceId);
    if (!device) {
      device = this.addCameraDevice({
        id: cameraDeviceId,
        name: cameraDeviceId
      });
    }

    const resolvedVideoUrl = videoUrl || device.videoUrl || await this.findFirstReachableVideo();
    if (!device.videoTexture || (resolvedVideoUrl && resolvedVideoUrl !== device.videoUrl)) {
      await this.bindVideoToCameraDevice(cameraDeviceId, resolvedVideoUrl);
      device = this.devices.get(cameraDeviceId);
    }

    if (!device?.videoTexture) {
      throw new Error(`Video texture preview unavailable for ${cameraDeviceId}`);
    }

    this.previewDeviceId = cameraDeviceId;
    this.ensurePreviewPlane(device.videoTexture);
    this.updatePreviewPlane(true);
    console.log('[GsplatVideoProjector] preview plane enabled:', cameraDeviceId, resolvedVideoUrl);
    return {
      cameraDeviceId,
      videoUrl: resolvedVideoUrl
    };
  }

  ensurePreviewPlane(videoTexture) {
    if (this.previewEntity && this.previewMaterial) {
      this.previewMaterial.emissiveMap = videoTexture;
      this.previewMaterial.diffuseMap = videoTexture;
      this.previewMaterial.opacityMap = videoTexture;
      this.previewMaterial.update();
      this.previewEntity.enabled = true;
      return;
    }

    this.previewMaterial = new pc.StandardMaterial();
    this.previewMaterial.useLighting = false;
    this.previewMaterial.useFog = false;
    this.previewMaterial.useSkybox = false;
    this.previewMaterial.emissive = new pc.Color(1, 1, 1);
    this.previewMaterial.diffuse = new pc.Color(0, 0, 0);
    this.previewMaterial.emissiveMap = videoTexture;
    this.previewMaterial.diffuseMap = videoTexture;
    this.previewMaterial.opacityMap = videoTexture;
    this.previewMaterial.cull = pc.CULLFACE_NONE;
    this.previewMaterial.update();

    this.previewEntity = new pc.Entity('VideoTexturePreviewPlane');
    this.previewEntity.addComponent('render', {
      type: 'plane',
      castShadows: false,
      receiveShadows: false,
      material: this.previewMaterial
    });
    this.previewEntity.setLocalScale(2.4, 1.35, 1);
    this.app.root.addChild(this.previewEntity);
  }

  updatePreviewPlane(force = false) {
    if (!this.previewEntity || !this.previewDeviceId) {
      return;
    }

    const cameraEntity = this.getMainCameraEntity?.();
    if (!cameraEntity) {
      return;
    }

    const forward = cameraEntity.forward.clone().normalize();
    const up = cameraEntity.up.clone().normalize();
    const position = cameraEntity.getPosition().clone().add(forward.mulScalar(4)).add(up.mulScalar(-0.4));

    this.previewEntity.setPosition(position);
    this.previewEntity.lookAt(cameraEntity.getPosition());
    this.previewEntity.rotateLocal(0, 180, 0);
    if (force) {
      this.previewEntity.enabled = true;
    }
  }

  destroyPreviewPlane() {
    if (this.previewEntity && !this.previewEntity.destroyed) {
      this.previewEntity.destroy();
    }
    if (this.previewMaterial) {
      this.previewMaterial.destroy();
    }
    this.previewEntity = null;
    this.previewMaterial = null;
    this.previewDeviceId = null;
  }

  destroyDeviceResources(device) {
    if (device.videoElement) {
      device.videoElement.pause();
      device.videoElement.removeAttribute('src');
      device.videoElement.load();
      device.videoElement.remove();
    }

    if (device.videoTexture) {
      device.videoTexture.destroy();
    }

    device.videoElement = null;
    device.videoTexture = null;
    device.videoAsset = null;
  }
}
