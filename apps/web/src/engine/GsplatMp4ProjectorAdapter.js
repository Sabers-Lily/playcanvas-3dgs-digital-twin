import * as pc from 'playcanvas';

const PROJECTION_MODES = {
  CAMERA_FRUSTUM: 'cameraFrustum',
  QUAD: 'quad',
  QUAD_OVERLAY: 'quadOverlay'
};

function resolveShaderLanguage(app) {
  return app?.graphicsDevice?.isWebGPU
    ? pc.SHADERLANGUAGE_WGSL ?? 'wgsl'
    : pc.SHADERLANGUAGE_GLSL ?? 'glsl';
}

function findGsplatMaterial(app, gsplatEntity = null) {
  if (!app?.scene) {
    return null;
  }

  const entityMaterial =
    gsplatEntity?.gsplat?._instance?.material ??
    gsplatEntity?.gsplat?.instance?.material ??
    gsplatEntity?.gsplat?.material ??
    null;
  if (entityMaterial) {
    return entityMaterial;
  }

  const sceneMaterial = app.scene?.gsplat?.material ?? null;
  if (sceneMaterial) {
    return sceneMaterial;
  }

  let found = null;
  app.root?.forEach?.((node) => {
    if (found || !node.gsplat) {
      return;
    }

    found = node.gsplat.material ?? node.gsplat.instance?.material ?? node.gsplat._instance?.material ?? null;
  });

  return found;
}

function sanitizeQuadPoints(points) {
  const fallback = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
  ];

  if (!Array.isArray(points)) {
    return fallback;
  }

  return fallback.map((fallbackPoint, index) => {
    const source = points[index]?.position ?? points[index];
    if (!Array.isArray(source)) {
      return fallbackPoint;
    }

    return [
      Number.isFinite(Number(source[0])) ? Number(source[0]) : 0,
      Number.isFinite(Number(source[1])) ? Number(source[1]) : 0,
      Number.isFinite(Number(source[2])) ? Number(source[2]) : 0
    ];
  });
}

function solveLinearSystem(matrix, values) {
  const size = values.length;
  const augmented = matrix.map((row, rowIndex) => [...row, values[rowIndex]]);

  for (let pivot = 0; pivot < size; pivot += 1) {
    let maxRow = pivot;
    let maxValue = Math.abs(augmented[pivot][pivot]);

    for (let row = pivot + 1; row < size; row += 1) {
      const value = Math.abs(augmented[row][pivot]);
      if (value > maxValue) {
        maxValue = value;
        maxRow = row;
      }
    }

    if (maxValue < 1e-8) {
      return null;
    }

    if (maxRow !== pivot) {
      const temp = augmented[pivot];
      augmented[pivot] = augmented[maxRow];
      augmented[maxRow] = temp;
    }

    const pivotValue = augmented[pivot][pivot];
    for (let column = pivot; column <= size; column += 1) {
      augmented[pivot][column] /= pivotValue;
    }

    for (let row = 0; row < size; row += 1) {
      if (row === pivot) {
        continue;
      }

      const factor = augmented[row][pivot];
      if (Math.abs(factor) < 1e-8) {
        continue;
      }

      for (let column = pivot; column <= size; column += 1) {
        augmented[row][column] -= factor * augmented[pivot][column];
      }
    }
  }

  return augmented.map((row) => row[size]);
}

function computeQuadHomography(screenPoints) {
  if (!Array.isArray(screenPoints) || screenPoints.length !== 4) {
    return null;
  }

  const uvPoints = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1]
  ];

  const matrix = [];
  const values = [];

  for (let index = 0; index < 4; index += 1) {
    const [x, y] = screenPoints[index];
    const [u, v] = uvPoints[index];

    matrix.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    values.push(u);
    matrix.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    values.push(v);
  }

  const solution = solveLinearSystem(matrix, values);
  if (!solution) {
    return null;
  }

  return [
    solution[0], solution[1], solution[2],
    solution[3], solution[4], solution[5],
    solution[6], solution[7], 1
  ];
}

export class GsplatMp4ProjectorAdapter {
  constructor({
    app,
    gsplatEntity = null,
    mainCameraEntity,
    projectorEntity,
    videoAsset = null,
    videoElement = null,
    videoUrl = '',
    mode = PROJECTION_MODES.CAMERA_FRUSTUM,
    projectorFov = 45,
    projectorAspect = 16 / 9,
    projectorNear = 0.1,
    projectorFar = 1000,
    opacity = 0.85,
    softEdge = 0.05,
    flipY = false,
    quadPoints = [],
    quadPlaneTolerance = 0.25,
    replaceMode = false,
    enabledProjection = true,
    logDebug = false
  }) {
    this.app = app;
    this.gsplatEntity = gsplatEntity;
    this.mainCameraEntity = mainCameraEntity;
    this.projectorEntity = projectorEntity;
    this.videoAsset = videoAsset;
    this.externalVideoElement = videoElement;
    this.videoUrl = videoUrl;
    this.mode = mode;
    this.projectorFov = projectorFov;
    this.projectorAspect = projectorAspect;
    this.projectorNear = projectorNear;
    this.projectorFar = projectorFar;
    this.opacity = opacity;
    this.softEdge = softEdge;
    this.flipY = flipY;
    this.quadPoints = sanitizeQuadPoints(quadPoints);
    this.quadPlaneTolerance = quadPlaneTolerance;
    this.replaceMode = replaceMode;
    this.enabledProjection = enabledProjection;
    this.logDebug = logDebug;

    this.videoElement = null;
    this.videoTexture = null;
    this.sceneMaterial = null;
    this.shaderLanguage = null;
    this.shaderChunks = null;
    this._originalGsplatModifyPS = undefined;
    this._chunkInstalled = false;
    this._hasLoggedTextureBind = false;
    this._hasLoggedTextureUpload = false;
    this._hasWarnedMissingExternalVideo = false;

    this.mainProj = new pc.Mat4();
    this.mainView = new pc.Mat4();
    this.mainViewProj = new pc.Mat4();
    this.mainInvViewProj = new pc.Mat4();
    this.projectorProj = new pc.Mat4();
    this.projectorView = new pc.Mat4();
    this.projectorViewProj = new pc.Mat4();
    this.screenSizeUniform = new Float32Array(2);
    this.quadUniforms = [
      new Float32Array(3),
      new Float32Array(3),
      new Float32Array(3),
      new Float32Array(3)
    ];
    this.quadScreenUniforms = [
      new Float32Array(2),
      new Float32Array(2),
      new Float32Array(2),
      new Float32Array(2)
    ];
    this.quadUvHomographyRows = [
      new Float32Array(3),
      new Float32Array(3),
      new Float32Array(3)
    ];
  }

  initialize() {
    // PROJECTION_GOLDEN_PATH:
    // This adapter contains the currently verified 3DGS video projection path.
    // Architecture layers may call it, but this loop must not rewrite its
    // shader math, quad mapping, texture binding, or upload behavior.
    this.bindVideoElement(this.externalVideoElement);
    this.createVideoTexture();
    this.installGsplatMaterialChunk();
  }

  bindVideoElement(videoElement = null) {
    this.externalVideoElement = videoElement ?? null;

    if (videoElement) {
      this.videoElement = videoElement;
      this._hasLoggedTextureBind = false;
      this._hasLoggedTextureUpload = false;
      this._hasWarnedMissingExternalVideo = false;
      return true;
    }

    return false;
  }

  createVideoTexture() {
    if (this.videoTexture) {
      this.videoTexture.destroy();
      this.videoTexture = null;
    }

    this.videoTexture = new pc.Texture(this.app.graphicsDevice, {
      name: 'GsplatMp4ProjectorAdapterVideo',
      format: pc.PIXELFORMAT_R8_G8_B8_A8,
      mipmaps: false,
      minFilter: pc.FILTER_LINEAR,
      magFilter: pc.FILTER_LINEAR,
      addressU: pc.ADDRESS_CLAMP_TO_EDGE,
      addressV: pc.ADDRESS_CLAMP_TO_EDGE
    });

    if (this.videoElement) {
      this.videoTexture.setSource(this.videoElement);
      this.logTextureBind();
    }
  }

  logTextureBind() {
    if (this._hasLoggedTextureBind || !this.videoElement) {
      return;
    }

    this._hasLoggedTextureBind = true;
    console.log('[PlayCanvasVideoTexture] bind', {
      width: this.videoElement.videoWidth ?? 0,
      height: this.videoElement.videoHeight ?? 0
    });
  }

  installGsplatMaterialChunk() {
    if (this._chunkInstalled) {
      return true;
    }

    const material = findGsplatMaterial(this.app, this.gsplatEntity);
    if (!material?.getShaderChunks) {
      return false;
    }

    const shaderLanguage = resolveShaderLanguage(this.app);
    const chunks = material.getShaderChunks(shaderLanguage);
    if (!chunks?.set || !chunks?.get) {
      return false;
    }

    this.sceneMaterial = material;
    this.shaderLanguage = shaderLanguage;
    this.shaderChunks = chunks;
    this._originalGsplatModifyPS = chunks.get('gsplatModifyPS');
    chunks.set('gsplatModifyPS', shaderLanguage === (pc.SHADERLANGUAGE_WGSL ?? 'wgsl') ? this.buildWgslPsChunk() : this.buildGlslPsChunk());
    material.update();
    this._chunkInstalled = true;
    console.log('[GsplatMp4ProjectorAdapter] gsplatModifyPS installed:', shaderLanguage);
    return true;
  }

  buildGlslPsChunk() {
    return [
      'uniform sampler2D uProjectedVideo;',
      'uniform mat4 uMainInvViewProj;',
      'uniform mat4 uProjectorViewProj;',
      'uniform vec2 uScreenSize;',
      'uniform float uProjectionOpacity;',
      'uniform float uProjectionSoftEdge;',
      'uniform float uProjectorEnabled;',
      'uniform float uVideoFlipY;',
      'uniform float uProjectionMode;',
      'uniform float uReplaceMode;',
      'uniform vec3 uQuadP0;',
      'uniform vec3 uQuadP1;',
      'uniform vec3 uQuadP2;',
      'uniform vec3 uQuadP3;',
      'uniform vec2 uQuadScreenP0;',
      'uniform vec2 uQuadScreenP1;',
      'uniform vec2 uQuadScreenP2;',
      'uniform vec2 uQuadScreenP3;',
      'uniform vec3 uQuadUvHomographyRow0;',
      'uniform vec3 uQuadUvHomographyRow1;',
      'uniform vec3 uQuadUvHomographyRow2;',
      'uniform float uQuadPlaneTolerance;',
      'vec3 gsplatProjectorReconstructWorldPos() {',
      '  vec2 ndcXY = (gl_FragCoord.xy / uScreenSize) * 2.0 - 1.0;',
      '  vec4 ndc = vec4(ndcXY, gl_FragCoord.z * 2.0 - 1.0, 1.0);',
      '  vec4 world = uMainInvViewProj * ndc;',
      '  return world.xyz / max(world.w, 1e-6);',
      '}',
      'float gsplatProjectorBarycentricUv(vec3 p, vec3 a, vec3 b, vec3 c, vec2 uva, vec2 uvb, vec2 uvc, out vec2 uv) {',
      '  vec3 v0 = b - a;',
      '  vec3 v1 = c - a;',
      '  vec3 normal = cross(v0, v1);',
      '  float normalLen = length(normal);',
      '  if (normalLen < 1e-6) return 0.0;',
      '  vec3 n = normal / normalLen;',
      '  float planeDistance = dot(p - a, n);',
      '  if (abs(planeDistance) > uQuadPlaneTolerance) return 0.0;',
      '  vec3 q = p - n * planeDistance;',
      '  vec3 v2 = q - a;',
      '  float d00 = dot(v0, v0);',
      '  float d01 = dot(v0, v1);',
      '  float d11 = dot(v1, v1);',
      '  float d20 = dot(v2, v0);',
      '  float d21 = dot(v2, v1);',
      '  float denom = d00 * d11 - d01 * d01;',
      '  if (abs(denom) < 1e-6) return 0.0;',
      '  float v = (d11 * d20 - d01 * d21) / denom;',
      '  float w = (d00 * d21 - d01 * d20) / denom;',
      '  float u = 1.0 - v - w;',
      '  if (u < -1e-4 || v < -1e-4 || w < -1e-4) return 0.0;',
      '  uv = uva * u + uvb * v + uvc * w;',
      '  return 1.0;',
      '}',
      'float gsplatProjectorQuadUv(vec3 worldPos, out vec2 uv) {',
      '  if (gsplatProjectorBarycentricUv(worldPos, uQuadP0, uQuadP1, uQuadP2, vec2(0.0, 0.0), vec2(1.0, 0.0), vec2(1.0, 1.0), uv) > 0.5) return 1.0;',
      '  if (gsplatProjectorBarycentricUv(worldPos, uQuadP0, uQuadP2, uQuadP3, vec2(0.0, 0.0), vec2(1.0, 1.0), vec2(0.0, 1.0), uv) > 0.5) return 1.0;',
      '  return 0.0;',
      '}',
      'float gsplatProjectorFrustumUv(vec3 worldPos, out vec2 uv) {',
      '  vec4 projected = uProjectorViewProj * vec4(worldPos, 1.0);',
      '  if (projected.w <= 0.0) return 0.0;',
      '  vec3 projNdc = projected.xyz / projected.w;',
      '  if (projNdc.x < -1.0 || projNdc.x > 1.0 || projNdc.y < -1.0 || projNdc.y > 1.0 || projNdc.z < -1.0 || projNdc.z > 1.0) return 0.0;',
      '  uv = projNdc.xy * 0.5 + 0.5;',
      '  return 1.0;',
      '}',
      'vec3 gsplatProjectorBarycentric2D(vec2 p, vec2 a, vec2 b, vec2 c) {',
      '  vec2 v0 = b - a;',
      '  vec2 v1 = c - a;',
      '  vec2 v2 = p - a;',
      '  float d00 = dot(v0, v0);',
      '  float d01 = dot(v0, v1);',
      '  float d11 = dot(v1, v1);',
      '  float d20 = dot(v2, v0);',
      '  float d21 = dot(v2, v1);',
      '  float denom = d00 * d11 - d01 * d01;',
      '  if (abs(denom) < 1e-6) return vec3(-1.0);',
      '  float v = (d11 * d20 - d01 * d21) / denom;',
      '  float w = (d00 * d21 - d01 * d20) / denom;',
      '  float u = 1.0 - v - w;',
      '  return vec3(u, v, w);',
      '}',
      'float gsplatProjectorEdgeCross(vec2 a, vec2 b, vec2 p) {',
      '  vec2 edge = b - a;',
      '  vec2 toPoint = p - a;',
      '  return edge.x * toPoint.y - edge.y * toPoint.x;',
      '}',
      'float gsplatProjectorEdgeDistance(vec2 a, vec2 b, vec2 p) {',
      '  vec2 edge = b - a;',
      '  float edgeLength = length(edge);',
      '  if (edgeLength < 1e-6) return 0.0;',
      '  return abs(gsplatProjectorEdgeCross(a, b, p)) / edgeLength;',
      '}',
      'vec2 gsplatProjectorApplyQuadHomography(vec2 screenUv) {',
      '  float denom = dot(uQuadUvHomographyRow2, vec3(screenUv, 1.0));',
      '  if (abs(denom) < 1e-6) return vec2(-1.0);',
      '  float u = dot(uQuadUvHomographyRow0, vec3(screenUv, 1.0)) / denom;',
      '  float v = dot(uQuadUvHomographyRow1, vec3(screenUv, 1.0)) / denom;',
      '  return vec2(u, v);',
      '}',
      'float gsplatProjectorOverlayUv(out vec2 uv, out float edgeFactor) {',
      '  vec2 screenUv = gl_FragCoord.xy / uScreenSize;',
      '  float orientation = gsplatProjectorEdgeCross(uQuadScreenP0, uQuadScreenP1, uQuadScreenP2);',
      '  float signFactor = orientation >= 0.0 ? 1.0 : -1.0;',
      '  float c0 = signFactor * gsplatProjectorEdgeCross(uQuadScreenP0, uQuadScreenP1, screenUv);',
      '  float c1 = signFactor * gsplatProjectorEdgeCross(uQuadScreenP1, uQuadScreenP2, screenUv);',
      '  float c2 = signFactor * gsplatProjectorEdgeCross(uQuadScreenP2, uQuadScreenP3, screenUv);',
      '  float c3 = signFactor * gsplatProjectorEdgeCross(uQuadScreenP3, uQuadScreenP0, screenUv);',
      '  if (c0 < 0.0 || c1 < 0.0 || c2 < 0.0 || c3 < 0.0) return 0.0;',
      '  uv = gsplatProjectorApplyQuadHomography(screenUv);',
      '  float minEdgeDistance = min(min(gsplatProjectorEdgeDistance(uQuadScreenP0, uQuadScreenP1, screenUv), gsplatProjectorEdgeDistance(uQuadScreenP1, uQuadScreenP2, screenUv)), min(gsplatProjectorEdgeDistance(uQuadScreenP2, uQuadScreenP3, screenUv), gsplatProjectorEdgeDistance(uQuadScreenP3, uQuadScreenP0, screenUv)));',
      '  if (uProjectionSoftEdge <= 1e-4) {',
      '    edgeFactor = 1.0;',
      '  } else {',
      '    edgeFactor = smoothstep(0.0, uProjectionSoftEdge, minEdgeDistance);',
      '  }',
      '  return uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0 ? 1.0 : 0.0;',
      '}',
      'void modifySplatColor(vec2 gaussianUV, inout vec4 color) {',
      '  if (uProjectorEnabled < 0.5) return;',
      '  vec2 uv = vec2(0.0);',
      '  float softMask = 1.0;',
      '  float hit = 0.0;',
      '  if (uProjectionMode > 1.5) {',
      '    hit = gsplatProjectorOverlayUv(uv, softMask);',
      '  } else {',
      '    vec3 worldPos = gsplatProjectorReconstructWorldPos();',
      '    hit = uProjectionMode > 0.5 ? gsplatProjectorQuadUv(worldPos, uv) : gsplatProjectorFrustumUv(worldPos, uv);',
      '  }',
      '  if (hit < 0.5) return;',
      '  if (uVideoFlipY > 0.5) uv.y = 1.0 - uv.y;',
      '  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return;',
      '  if (uProjectionMode < 1.5) {',
      '    vec2 edgeDist = min(uv, 1.0 - uv);',
      '    softMask = clamp(min(edgeDist.x, edgeDist.y) / max(uProjectionSoftEdge, 1e-5), 0.0, 1.0);',
      '  }',
      '  vec4 videoColor = texture2D(uProjectedVideo, uv);',
      '  float amount = (uReplaceMode > 0.5 ? softMask : uProjectionOpacity * softMask) * videoColor.a;',
      '  color.rgb = mix(color.rgb, videoColor.rgb, amount);',
      '}'
    ].join('\n');
  }

  buildWgslPsChunk() {
    return [
      'uniform uMainInvViewProj: mat4x4f;',
      'uniform uProjectorViewProj: mat4x4f;',
      'uniform uScreenSize: vec2f;',
      'uniform uProjectionOpacity: f32;',
      'uniform uProjectionSoftEdge: f32;',
      'uniform uProjectorEnabled: f32;',
      'uniform uVideoFlipY: f32;',
      'uniform uProjectionMode: f32;',
      'uniform uReplaceMode: f32;',
      'uniform uQuadP0: vec3f;',
      'uniform uQuadP1: vec3f;',
      'uniform uQuadP2: vec3f;',
      'uniform uQuadP3: vec3f;',
      'uniform uQuadScreenP0: vec2f;',
      'uniform uQuadScreenP1: vec2f;',
      'uniform uQuadScreenP2: vec2f;',
      'uniform uQuadScreenP3: vec2f;',
      'uniform uQuadUvHomographyRow0: vec3f;',
      'uniform uQuadUvHomographyRow1: vec3f;',
      'uniform uQuadUvHomographyRow2: vec3f;',
      'uniform uQuadPlaneTolerance: f32;',
      'var uProjectedVideo: texture_2d<f32>;',
      'var uProjectedVideoSampler: sampler;',
      'fn gsplatProjectorReconstructWorldPos() -> vec3f {',
      '  let ndcXY = (pcPosition.xy / uniform.uScreenSize) * 2.0 - 1.0;',
      '  let ndc = vec4f(ndcXY, pcPosition.z * 2.0 - 1.0, 1.0);',
      '  let world = uniform.uMainInvViewProj * ndc;',
      '  return world.xyz / max(world.w, 1e-6);',
      '}',
      'fn gsplatProjectorBarycentricUv(p: vec3f, a: vec3f, b: vec3f, c: vec3f, uva: vec2f, uvb: vec2f, uvc: vec2f) -> vec3f {',
      '  let v0 = b - a;',
      '  let v1 = c - a;',
      '  let normal = cross(v0, v1);',
      '  let normalLen = length(normal);',
      '  if (normalLen < 1e-6) { return vec3f(0.0, 0.0, 0.0); }',
      '  let n = normal / normalLen;',
      '  let planeDistance = dot(p - a, n);',
      '  if (abs(planeDistance) > uniform.uQuadPlaneTolerance) { return vec3f(0.0, 0.0, 0.0); }',
      '  let q = p - n * planeDistance;',
      '  let v2 = q - a;',
      '  let d00 = dot(v0, v0);',
      '  let d01 = dot(v0, v1);',
      '  let d11 = dot(v1, v1);',
      '  let d20 = dot(v2, v0);',
      '  let d21 = dot(v2, v1);',
      '  let denom = d00 * d11 - d01 * d01;',
      '  if (abs(denom) < 1e-6) { return vec3f(0.0, 0.0, 0.0); }',
      '  let bv = (d11 * d20 - d01 * d21) / denom;',
      '  let bw = (d00 * d21 - d01 * d20) / denom;',
      '  let bu = 1.0 - bv - bw;',
      '  if (bu < -1e-4 || bv < -1e-4 || bw < -1e-4) { return vec3f(0.0, 0.0, 0.0); }',
      '  let uv = uva * bu + uvb * bv + uvc * bw;',
      '  return vec3f(1.0, uv.x, uv.y);',
      '}',
      'fn gsplatProjectorQuadUv(worldPos: vec3f) -> vec3f {',
      '  let a = gsplatProjectorBarycentricUv(worldPos, uniform.uQuadP0, uniform.uQuadP1, uniform.uQuadP2, vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0));',
      '  if (a.x > 0.5) { return a; }',
      '  return gsplatProjectorBarycentricUv(worldPos, uniform.uQuadP0, uniform.uQuadP2, uniform.uQuadP3, vec2f(0.0, 0.0), vec2f(1.0, 1.0), vec2f(0.0, 1.0));',
      '}',
      'fn gsplatProjectorFrustumUv(worldPos: vec3f) -> vec3f {',
      '  let projected = uniform.uProjectorViewProj * vec4f(worldPos, 1.0);',
      '  if (projected.w <= 0.0) { return vec3f(0.0, 0.0, 0.0); }',
      '  let projNdc = projected.xyz / projected.w;',
      '  if (projNdc.x < -1.0 || projNdc.x > 1.0 || projNdc.y < -1.0 || projNdc.y > 1.0 || projNdc.z < -1.0 || projNdc.z > 1.0) { return vec3f(0.0, 0.0, 0.0); }',
      '  let uv = projNdc.xy * 0.5 + vec2f(0.5, 0.5);',
      '  return vec3f(1.0, uv.x, uv.y);',
      '}',
      'fn gsplatProjectorBarycentric2D(p: vec2f, a: vec2f, b: vec2f, c: vec2f) -> vec3f {',
      '  let v0 = b - a;',
      '  let v1 = c - a;',
      '  let v2 = p - a;',
      '  let d00 = dot(v0, v0);',
      '  let d01 = dot(v0, v1);',
      '  let d11 = dot(v1, v1);',
      '  let d20 = dot(v2, v0);',
      '  let d21 = dot(v2, v1);',
      '  let denom = d00 * d11 - d01 * d01;',
      '  if (abs(denom) < 1e-6) { return vec3f(-1.0, -1.0, -1.0); }',
      '  let bv = (d11 * d20 - d01 * d21) / denom;',
      '  let bw = (d00 * d21 - d01 * d20) / denom;',
      '  let bu = 1.0 - bv - bw;',
      '  return vec3f(bu, bv, bw);',
      '}',
      'fn gsplatProjectorEdgeCross(a: vec2f, b: vec2f, p: vec2f) -> f32 {',
      '  let edge = b - a;',
      '  let toPoint = p - a;',
      '  return edge.x * toPoint.y - edge.y * toPoint.x;',
      '}',
      'fn gsplatProjectorEdgeDistance(a: vec2f, b: vec2f, p: vec2f) -> f32 {',
      '  let edge = b - a;',
      '  let edgeLength = length(edge);',
      '  if (edgeLength < 1e-6) { return 0.0; }',
      '  return abs(gsplatProjectorEdgeCross(a, b, p)) / edgeLength;',
      '}',
      'fn gsplatProjectorApplyQuadHomography(screenUv: vec2f) -> vec2f {',
      '  let denom = dot(uniform.uQuadUvHomographyRow2, vec3f(screenUv, 1.0));',
      '  if (abs(denom) < 1e-6) { return vec2f(-1.0, -1.0); }',
      '  let u = dot(uniform.uQuadUvHomographyRow0, vec3f(screenUv, 1.0)) / denom;',
      '  let v = dot(uniform.uQuadUvHomographyRow1, vec3f(screenUv, 1.0)) / denom;',
      '  return vec2f(u, v);',
      '}',
      'fn gsplatProjectorOverlayUv() -> vec4f {',
      '  let screenUv = pcPosition.xy / uniform.uScreenSize;',
      '  let orientation = gsplatProjectorEdgeCross(uniform.uQuadScreenP0, uniform.uQuadScreenP1, uniform.uQuadScreenP2);',
      '  let signFactor = select(-1.0, 1.0, orientation >= 0.0);',
      '  let c0 = signFactor * gsplatProjectorEdgeCross(uniform.uQuadScreenP0, uniform.uQuadScreenP1, screenUv);',
      '  let c1 = signFactor * gsplatProjectorEdgeCross(uniform.uQuadScreenP1, uniform.uQuadScreenP2, screenUv);',
      '  let c2 = signFactor * gsplatProjectorEdgeCross(uniform.uQuadScreenP2, uniform.uQuadScreenP3, screenUv);',
      '  let c3 = signFactor * gsplatProjectorEdgeCross(uniform.uQuadScreenP3, uniform.uQuadScreenP0, screenUv);',
      '  if (c0 < 0.0 || c1 < 0.0 || c2 < 0.0 || c3 < 0.0) { return vec4f(0.0, 0.0, 0.0, 0.0); }',
      '  let uv = gsplatProjectorApplyQuadHomography(screenUv);',
      '  let minEdgeDistance = min(min(gsplatProjectorEdgeDistance(uniform.uQuadScreenP0, uniform.uQuadScreenP1, screenUv), gsplatProjectorEdgeDistance(uniform.uQuadScreenP1, uniform.uQuadScreenP2, screenUv)), min(gsplatProjectorEdgeDistance(uniform.uQuadScreenP2, uniform.uQuadScreenP3, screenUv), gsplatProjectorEdgeDistance(uniform.uQuadScreenP3, uniform.uQuadScreenP0, screenUv)));',
      '  let edgeFactor = select(smoothstep(0.0, uniform.uProjectionSoftEdge, minEdgeDistance), 1.0, uniform.uProjectionSoftEdge <= 1e-4);',
      '  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { return vec4f(0.0, 0.0, 0.0, 0.0); }',
      '  return vec4f(1.0, uv.x, uv.y, edgeFactor);',
      '}',
      'fn modifySplatColor(gaussianUV: vec2f, color: ptr<function, vec4f>) {',
      '  if (uniform.uProjectorEnabled < 0.5) { return; }',
      '  var uv = vec2f(0.0, 0.0);',
      '  var softMask = 1.0;',
      '  var hit = 0.0;',
      '  if (uniform.uProjectionMode > 1.5) {',
      '    let overlay = gsplatProjectorOverlayUv();',
      '    hit = overlay.x;',
      '    uv = overlay.yz;',
      '    softMask = overlay.w;',
      '  } else {',
      '    let worldPos = gsplatProjectorReconstructWorldPos();',
      '    let sampleUv = select(gsplatProjectorFrustumUv(worldPos), gsplatProjectorQuadUv(worldPos), uniform.uProjectionMode > 0.5);',
      '    hit = sampleUv.x;',
      '    uv = sampleUv.yz;',
      '  }',
      '  if (hit < 0.5) { return; }',
      '  if (uniform.uVideoFlipY > 0.5) { uv.y = 1.0 - uv.y; }',
      '  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { return; }',
      '  if (uniform.uProjectionMode < 1.5) {',
      '    let edgeDist = min(uv, vec2f(1.0, 1.0) - uv);',
      '    softMask = clamp(min(edgeDist.x, edgeDist.y) / max(uniform.uProjectionSoftEdge, 1e-5), 0.0, 1.0);',
      '  }',
      '  let videoColor = textureSampleLevel(uProjectedVideo, uProjectedVideoSampler, uv, 0.0);',
      '  let amount = select(uniform.uProjectionOpacity * softMask, softMask, uniform.uReplaceMode > 0.5) * videoColor.a;',
      '  (*color).rgb = mix((*color).rgb, videoColor.rgb, amount);',
      '}'
    ].join('\n');
  }

  update() {
    if (!this.sceneMaterial && !this.installGsplatMaterialChunk()) {
      return;
    }

    if (!this.videoElement) {
      if (!this._hasWarnedMissingExternalVideo) {
        console.warn('[GsplatMp4ProjectorAdapter] update skipped: missing external video element');
        this._hasWarnedMissingExternalVideo = true;
      }
      this.updateUniforms();
      return;
    }

    if (!this.mainCameraEntity || !this.projectorEntity) {
      this.updateUniforms();
      return;
    }

    if (this.videoElement && this.videoTexture && this.videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      this.logTextureBind();
      this.videoTexture.upload();
      if (!this._hasLoggedTextureUpload) {
        this._hasLoggedTextureUpload = true;
        console.log('[PlayCanvasVideoTexture] upload started', {
          currentTime: this.videoElement.currentTime ?? 0
        });
      }
    }

    this.updateMatrices();
    this.updateUniforms();
  }

  updateMatrices() {
    const cameraComponent = this.mainCameraEntity.camera;
    if (!cameraComponent) {
      return;
    }

    const canvas = this.app.graphicsDevice.canvas;
    const aspect = Math.max(1e-6, canvas.clientWidth / Math.max(canvas.clientHeight, 1));

    this.mainProj.setPerspective(cameraComponent.fov, aspect, cameraComponent.nearClip, cameraComponent.farClip, false);
    this.mainView.copy(this.mainCameraEntity.getWorldTransform()).invert();
    this.mainViewProj.mul2(this.mainProj, this.mainView);
    this.mainInvViewProj.copy(this.mainViewProj).invert();

    this.projectorProj.setPerspective(this.projectorFov, this.projectorAspect, this.projectorNear, this.projectorFar, false);
    this.projectorView.copy(this.projectorEntity.getWorldTransform()).invert();
    this.projectorViewProj.mul2(this.projectorProj, this.projectorView);

    this.screenSizeUniform[0] = canvas.width;
    this.screenSizeUniform[1] = canvas.height;
  }

  updateUniforms() {
    const material = this.sceneMaterial;
    if (this.mode === PROJECTION_MODES.QUAD_OVERLAY) {
      this.updateQuadScreenPoints();
      this.updateQuadUvHomography();
    }
    material.setParameter('uProjectedVideo', this.videoTexture);
    material.setParameter('uMainInvViewProj', this.mainInvViewProj.data);
    material.setParameter('uProjectorViewProj', this.projectorViewProj.data);
    material.setParameter('uScreenSize', this.screenSizeUniform);
    material.setParameter('uProjectionOpacity', this.opacity);
    material.setParameter('uProjectionSoftEdge', this.softEdge);
    material.setParameter('uProjectorEnabled', this.enabledProjection ? 1 : 0);
    material.setParameter('uVideoFlipY', this.flipY ? 1 : 0);
    material.setParameter('uProjectionMode', this.mode === PROJECTION_MODES.QUAD_OVERLAY ? 2 : (this.mode === PROJECTION_MODES.QUAD ? 1 : 0));
    material.setParameter('uReplaceMode', this.replaceMode ? 1 : 0);
    material.setParameter('uQuadPlaneTolerance', Math.max(0.0001, Number(this.quadPlaneTolerance) || 0.25));

    this.quadPoints.forEach((point, index) => {
      this.quadUniforms[index][0] = point[0];
      this.quadUniforms[index][1] = point[1];
      this.quadUniforms[index][2] = point[2];
      material.setParameter(`uQuadP${index}`, this.quadUniforms[index]);
      material.setParameter(`uQuadScreenP${index}`, this.quadScreenUniforms[index]);
    });

    material.setParameter('uQuadUvHomographyRow0', this.quadUvHomographyRows[0]);
    material.setParameter('uQuadUvHomographyRow1', this.quadUvHomographyRows[1]);
    material.setParameter('uQuadUvHomographyRow2', this.quadUvHomographyRows[2]);
  }

  updateQuadScreenPoints() {
    const cameraComponent = this.mainCameraEntity?.camera;
    const gd = this.app?.graphicsDevice;
    if (!cameraComponent || !gd || this.quadPoints.length < 4) {
      return;
    }

    const width = Math.max(gd.width || gd.canvas?.width || 0, 1);
    const height = Math.max(gd.height || gd.canvas?.height || 0, 1);

    this.quadPoints.forEach((point, index) => {
      const world = new pc.Vec3(point[0], point[1], point[2]);
      const screen = cameraComponent.worldToScreen(world);
      this.quadScreenUniforms[index][0] = screen.x / width;
      this.quadScreenUniforms[index][1] = 1 - (screen.y / height);
    });
  }

  updateQuadUvHomography() {
    const screenPoints = this.quadScreenUniforms.map((point) => [point[0], point[1]]);
    const homography = computeQuadHomography(screenPoints);
    if (!homography) {
      return;
    }

    this.quadUvHomographyRows[0][0] = homography[0];
    this.quadUvHomographyRows[0][1] = homography[1];
    this.quadUvHomographyRows[0][2] = homography[2];
    this.quadUvHomographyRows[1][0] = homography[3];
    this.quadUvHomographyRows[1][1] = homography[4];
    this.quadUvHomographyRows[1][2] = homography[5];
    this.quadUvHomographyRows[2][0] = homography[6];
    this.quadUvHomographyRows[2][1] = homography[7];
    this.quadUvHomographyRows[2][2] = homography[8];
  }

  patch(options = {}) {
    if ('gsplatEntity' in options && options.gsplatEntity !== this.gsplatEntity) {
      this.restoreShaderChunk();
      this.sceneMaterial = null;
      this.shaderChunks = null;
      this.gsplatEntity = options.gsplatEntity;
    }
    const hasExternalVideoElementPatch = 'videoElement' in options;
    if ('videoAsset' in options) this.videoAsset = options.videoAsset;
    if (hasExternalVideoElementPatch) {
      this.bindVideoElement(options.videoElement);
    }
    if ('videoUrl' in options) this.videoUrl = options.videoUrl;
    if ('mode' in options) this.mode = options.mode || PROJECTION_MODES.CAMERA_FRUSTUM;
    if ('projectorFov' in options) this.projectorFov = options.projectorFov;
    if ('projectorAspect' in options) this.projectorAspect = options.projectorAspect;
    if ('projectorNear' in options) this.projectorNear = options.projectorNear;
    if ('projectorFar' in options) this.projectorFar = options.projectorFar;
    if ('opacity' in options) this.opacity = options.opacity;
    if ('softEdge' in options) this.softEdge = options.softEdge;
    if ('flipY' in options) this.flipY = options.flipY;
    if ('quadPoints' in options) this.quadPoints = sanitizeQuadPoints(options.quadPoints);
    if ('quadPlaneTolerance' in options) this.quadPlaneTolerance = options.quadPlaneTolerance;
    if ('replaceMode' in options) this.replaceMode = options.replaceMode;
    if ('enabledProjection' in options) this.enabledProjection = options.enabledProjection;
    if ('mainCameraEntity' in options) this.mainCameraEntity = options.mainCameraEntity;
    if ('projectorEntity' in options) this.projectorEntity = options.projectorEntity;

    if (this.logDebug) {
      console.log('[GsplatMp4ProjectorAdapter] patch', {
        mode: this.mode,
        enabledProjection: this.enabledProjection,
        replaceMode: this.replaceMode,
        quadPoints: this.quadPoints.length,
        opacity: this.opacity,
        softEdge: this.softEdge
      });
    }

    if (hasExternalVideoElementPatch && this.videoTexture && this.videoElement) {
      this.videoTexture.setSource(this.videoElement);
      this.logTextureBind();
    }
  }

  restoreShaderChunk() {
    if (!this.sceneMaterial || !this.shaderChunks || !this._chunkInstalled) {
      return;
    }

    if (this._originalGsplatModifyPS === undefined || this._originalGsplatModifyPS === null) {
      this.shaderChunks.delete?.('gsplatModifyPS');
    } else {
      this.shaderChunks.set('gsplatModifyPS', this._originalGsplatModifyPS);
    }

    this.sceneMaterial.update();
    this._chunkInstalled = false;
  }

  destroy() {
    if (this.sceneMaterial) {
      this.sceneMaterial.setParameter('uProjectorEnabled', 0);
      this.sceneMaterial.setParameter('uProjectionOpacity', 0);
      this.sceneMaterial.setParameter('uProjectedVideo', null);
      this.restoreShaderChunk();
      this.sceneMaterial = null;
      this.shaderChunks = null;
    }

    if (this.videoTexture) {
      console.log('[PlayCanvasVideoTexture] dispose');
      this.videoTexture.destroy();
      this.videoTexture = null;
    }

    this.videoElement = null;
    this.externalVideoElement = null;
  }
}
