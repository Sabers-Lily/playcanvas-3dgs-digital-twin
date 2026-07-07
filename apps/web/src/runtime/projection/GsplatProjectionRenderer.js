import * as pc from 'playcanvas';
import { GsplatMp4ProjectorAdapter } from '../../engine/GsplatMp4ProjectorAdapter.js';

const DEFAULT_MAX_SLOTS = 4;

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

function createSlotState(slotIndex) {
  return {
    slotIndex,
    projectionId: null,
    objectId: null,
    sourceId: null,
    sourceKey: null,
    runtime: null,
    videoElement: null,
    projectorEntity: null,
    texture: null,
    enabled: false,
    mode: PROJECTION_MODES.QUAD_OVERLAY,
    opacity: 1,
    softEdge: 0,
    flipY: false,
    replaceMode: true,
    quadPlaneTolerance: 0.25,
    projectorFov: 45,
    projectorAspect: 16 / 9,
    projectorNear: 0.1,
    projectorFar: 1000,
    quadPoints: sanitizeQuadPoints([]),
    projectorView: new pc.Mat4(),
    projectorProj: new pc.Mat4(),
    projectorViewProj: new pc.Mat4(),
    quadUniforms: [
      new Float32Array(3),
      new Float32Array(3),
      new Float32Array(3),
      new Float32Array(3)
    ],
    quadScreenUniforms: [
      new Float32Array(2),
      new Float32Array(2),
      new Float32Array(2),
      new Float32Array(2)
    ],
    quadUvHomographyRows: [
      new Float32Array(3),
      new Float32Array(3),
      new Float32Array(3)
    ],
    boundVideoElement: null,
    hasLoggedTextureBind: false,
    firstUploadLogged: false,
    textureUploading: false
  };
}

function canBindVideoToTexture(videoElement) {
  if (!videoElement) {
    return false;
  }

  const width = Number(videoElement.videoWidth ?? 0);
  const height = Number(videoElement.videoHeight ?? 0);
  return width > 0 && height > 0 && videoElement.readyState >= HTMLMediaElement.HAVE_METADATA;
}

function createFallbackTexture(app) {
  const texture = new pc.Texture(app.graphicsDevice, {
    name: 'GsplatProjectionRendererFallback',
    format: pc.PIXELFORMAT_R8_G8_B8_A8,
    mipmaps: false,
    minFilter: pc.FILTER_LINEAR,
    magFilter: pc.FILTER_LINEAR,
    addressU: pc.ADDRESS_CLAMP_TO_EDGE,
    addressV: pc.ADDRESS_CLAMP_TO_EDGE
  });

  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext('2d');
  context.fillStyle = 'rgba(0, 0, 0, 0)';
  context.fillRect(0, 0, 1, 1);
  texture.setSource(canvas);
  return texture;
}

function buildGlslSlotFunction(slotIndex) {
  return [
    `vec4 applyProjectionSlot${slotIndex}(vec4 baseColor, vec3 worldPos) {`,
    `  if (uProjectionEnabled${slotIndex} < 0.5) return baseColor;`,
    '  vec2 uv = vec2(0.0);',
    '  float softMask = 1.0;',
    '  float hit = 0.0;',
    `  if (uProjectionMode${slotIndex} > 1.5) {`,
    `    hit = gsplatProjectorOverlayUv(uProjectionQuad${slotIndex}ScreenP0, uProjectionQuad${slotIndex}ScreenP1, uProjectionQuad${slotIndex}ScreenP2, uProjectionQuad${slotIndex}ScreenP3, uProjectionQuad${slotIndex}UvHomographyRow0, uProjectionQuad${slotIndex}UvHomographyRow1, uProjectionQuad${slotIndex}UvHomographyRow2, uProjectionSoftEdge${slotIndex}, uv, softMask);`,
    '  } else {',
    `    hit = uProjectionMode${slotIndex} > 0.5`,
    `      ? gsplatProjectorQuadUv(worldPos, uProjectionQuad${slotIndex}P0, uProjectionQuad${slotIndex}P1, uProjectionQuad${slotIndex}P2, uProjectionQuad${slotIndex}P3, uProjectionQuadPlaneTolerance${slotIndex}, uv)`,
    `      : gsplatProjectorFrustumUv(worldPos, uProjectorViewProj${slotIndex}, uv);`,
    '  }',
    '  if (hit < 0.5) return baseColor;',
    `  if (uProjectionFlipY${slotIndex} > 0.5) uv.y = 1.0 - uv.y;`,
    '  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return baseColor;',
    `  if (uProjectionMode${slotIndex} < 1.5) {`,
    '    vec2 edgeDist = min(uv, 1.0 - uv);',
    `    softMask = clamp(min(edgeDist.x, edgeDist.y) / max(uProjectionSoftEdge${slotIndex}, 1e-5), 0.0, 1.0);`,
    '  }',
    `  vec4 videoColor = texture2D(uProjectedVideo${slotIndex}, uv);`,
    `  float amount = (uProjectionReplaceMode${slotIndex} > 0.5 ? softMask : uProjectionOpacity${slotIndex} * softMask) * videoColor.a;`,
    '  baseColor.rgb = mix(baseColor.rgb, videoColor.rgb, amount);',
    '  return baseColor;',
    '}'
  ].join('\n');
}

function buildWgslSlotFunction(slotIndex) {
  return [
    `fn applyProjectionSlot${slotIndex}(baseColor: vec4f, worldPos: vec3f) -> vec4f {`,
    `  if (uniform.uProjectionEnabled${slotIndex} < 0.5) { return baseColor; }`,
    '  var uv = vec2f(0.0, 0.0);',
    '  var softMask = 1.0;',
    '  var hit = 0.0;',
    `  if (uniform.uProjectionMode${slotIndex} > 1.5) {`,
    `    let overlay = gsplatProjectorOverlayUv(uniform.uProjectionQuad${slotIndex}ScreenP0, uniform.uProjectionQuad${slotIndex}ScreenP1, uniform.uProjectionQuad${slotIndex}ScreenP2, uniform.uProjectionQuad${slotIndex}ScreenP3, uniform.uProjectionQuad${slotIndex}UvHomographyRow0, uniform.uProjectionQuad${slotIndex}UvHomographyRow1, uniform.uProjectionQuad${slotIndex}UvHomographyRow2, uniform.uProjectionSoftEdge${slotIndex});`,
    '    hit = overlay.x;',
    '    uv = overlay.yz;',
    '    softMask = overlay.w;',
    '  } else {',
    `    let sampleUv = select(gsplatProjectorFrustumUv(worldPos, uniform.uProjectorViewProj${slotIndex}), gsplatProjectorQuadUv(worldPos, uniform.uProjectionQuad${slotIndex}P0, uniform.uProjectionQuad${slotIndex}P1, uniform.uProjectionQuad${slotIndex}P2, uniform.uProjectionQuad${slotIndex}P3, uniform.uProjectionQuadPlaneTolerance${slotIndex}), uniform.uProjectionMode${slotIndex} > 0.5);`,
    '    hit = sampleUv.x;',
    '    uv = sampleUv.yz;',
    '  }',
    '  if (hit < 0.5) { return baseColor; }',
    `  if (uniform.uProjectionFlipY${slotIndex} > 0.5) { uv.y = 1.0 - uv.y; }`,
    '  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { return baseColor; }',
    `  if (uniform.uProjectionMode${slotIndex} < 1.5) {`,
    '    let edgeDist = min(uv, vec2f(1.0, 1.0) - uv);',
    `    softMask = clamp(min(edgeDist.x, edgeDist.y) / max(uniform.uProjectionSoftEdge${slotIndex}, 1e-5), 0.0, 1.0);`,
    '  }',
    `  let videoColor = textureSampleLevel(uProjectedVideo${slotIndex}, uProjectedVideo${slotIndex}Sampler, uv, 0.0);`,
    `  let amount = select(uniform.uProjectionOpacity${slotIndex} * softMask, softMask, uniform.uProjectionReplaceMode${slotIndex} > 0.5) * videoColor.a;`,
    '  var color = baseColor;',
    '  color.rgb = mix(color.rgb, videoColor.rgb, amount);',
    '  return color;',
    '}'
  ].join('\n');
}

export class GsplatProjectionRenderer {
  constructor({
    app,
    getGsplatEntity,
    getMainCameraEntity,
    getProjectorEntity,
    projectionRegistry,
    sourceRegistry,
    runtimePool,
    maxSlots = DEFAULT_MAX_SLOTS,
    logPrefix = '[GsplatProjectionRenderer]'
  } = {}) {
    this.app = app;
    this.getGsplatEntity = typeof getGsplatEntity === 'function' ? getGsplatEntity : () => null;
    this.getMainCameraEntity = typeof getMainCameraEntity === 'function' ? getMainCameraEntity : () => null;
    this.getProjectorEntity = typeof getProjectorEntity === 'function' ? getProjectorEntity : () => null;
    this.projectionRegistry = projectionRegistry;
    this.sourceRegistry = sourceRegistry;
    this.runtimePool = runtimePool;
    this.maxSlots = Math.max(1, Number(maxSlots) || DEFAULT_MAX_SLOTS);
    this.logPrefix = logPrefix;

    this.activeProjectionIds = [];
    this.rendererState = new Map();
    this.sceneMaterial = null;
    this.shaderLanguage = null;
    this.shaderChunks = null;
    this._originalGsplatModifyPS = undefined;
    this._chunkInstalled = false;
    this.fallbackTexture = createFallbackTexture(app);
    this.legacyProjector = null;
    this.legacyProjectionId = null;
    this.legacySourceId = null;
    this.legacyRuntime = null;

    this.mainProj = new pc.Mat4();
    this.mainView = new pc.Mat4();
    this.mainViewProj = new pc.Mat4();
    this.mainInvViewProj = new pc.Mat4();
    this.screenSizeUniform = new Float32Array(2);
    this.slots = Array.from({ length: this.maxSlots }, (_value, slotIndex) => createSlotState(slotIndex));
  }

  async syncActiveSet(activeProjectionIds = []) {
    const nextIds = Array.isArray(activeProjectionIds)
      ? activeProjectionIds.slice(0, this.maxSlots)
      : [];

    if (nextIds.length <= 1) {
      this.clearAllSlots();
      this.restoreShaderChunk();
      if (nextIds[0]) {
        await this.syncLegacyProjection(nextIds[0]);
      } else {
        this.deactivateLegacyProjection();
      }
      this.activeProjectionIds = nextIds;
      return this.getRendererState();
    }

    this.deactivateLegacyProjection();

    for (let slotIndex = 0; slotIndex < this.maxSlots; slotIndex += 1) {
      const projectionId = nextIds[slotIndex] ?? null;
      if (!projectionId) {
        this.clearSlot(slotIndex);
        continue;
      }

      const config = this.projectionRegistry.get(projectionId);
      const source = config ? this.sourceRegistry.get(config.sourceId) : null;
      if (!config || !source) {
        this.clearSlot(slotIndex);
        continue;
      }

      this.updateSlot(slotIndex, {
        projectionId,
        config,
        source
      });
    }

    this.activeProjectionIds = nextIds;
    return this.getRendererState();
  }

  clearAllSlots() {
    for (let slotIndex = 0; slotIndex < this.maxSlots; slotIndex += 1) {
      if (this.slots[slotIndex]?.projectionId || this.slots[slotIndex]?.texture) {
        this.clearSlot(slotIndex);
      }
    }
  }

  async syncLegacyProjection(projectionId) {
    const config = this.projectionRegistry.get(projectionId);
    if (!config) {
      this.deactivateLegacyProjection();
      return false;
    }

    const source = this.sourceRegistry.get(config.sourceId);
    if (!source) {
      this.deactivateLegacyProjection();
      return false;
    }

    const consumerId = `projection:${projectionId}`;
    const reuseLegacyRuntime = this.legacyProjector
      && this.legacyProjectionId === projectionId
      && this.legacySourceId === source.id
      && this.legacyRuntime;
    const runtimeEntry = reuseLegacyRuntime
      ? { runtime: this.legacyRuntime, sourceKey: null }
      : this.runtimePool.acquire(source, consumerId);
    const runtime = runtimeEntry?.runtime ?? null;
    const videoElement = runtime?.getVideoElement?.() ?? null;
    const gsplatEntity = this.getGsplatEntity();
    const mainCameraEntity = this.getMainCameraEntity();
    const projectorEntity = this.getProjectorEntity(config.objectId) ?? null;

    if (this.legacyProjectionId && this.legacyProjectionId !== projectionId) {
      this.deactivateLegacyProjection();
    }

    if (!this.legacyProjector) {
      this.legacyProjector = new GsplatMp4ProjectorAdapter({
        app: this.app,
        gsplatEntity,
        mainCameraEntity,
        projectorEntity,
        videoElement,
        mode: config.mode ?? PROJECTION_MODES.QUAD_OVERLAY,
        opacity: Number(config.opacity ?? 1),
        softEdge: Number(config.softEdge ?? 0),
        flipY: Boolean(config.flipY),
        quadPoints: config.quadPoints,
        quadPlaneTolerance: Number(config.quadPlaneTolerance ?? 0.25),
        replaceMode: config.replaceMode ?? true,
        enabledProjection: Boolean(config.enabled),
        logDebug: false
      });
      this.legacyProjector.initialize();
    }

    this.legacyProjector.patch({
      gsplatEntity,
      mainCameraEntity,
      projectorEntity,
      videoElement,
      mode: config.mode ?? PROJECTION_MODES.QUAD_OVERLAY,
      opacity: Number(config.opacity ?? 1),
      softEdge: Number(config.softEdge ?? 0),
      flipY: Boolean(config.flipY),
      quadPoints: config.quadPoints,
      quadPlaneTolerance: Number(config.quadPlaneTolerance ?? 0.25),
      replaceMode: config.replaceMode ?? true,
      enabledProjection: Boolean(config.enabled)
    });

    this.legacyProjectionId = projectionId;
    this.legacySourceId = source.id;
    this.legacyRuntime = runtime;
    this.rendererState.set(projectionId, {
      slotIndex: 0,
      active: true,
      bound: Boolean(videoElement),
      textureBound: Boolean(this.legacyProjector.videoTexture),
      textureUploading: Boolean(this.legacyProjector._hasLoggedTextureUpload),
      shaderInstalled: Boolean(this.legacyProjector._chunkInstalled),
      error: null
    });
    return true;
  }

  deactivateLegacyProjection() {
    if (this.legacySourceId && this.legacyProjectionId) {
      this.runtimePool.release(this.legacySourceId, `projection:${this.legacyProjectionId}`);
    }

    if (this.legacyProjectionId) {
      this.rendererState.set(this.legacyProjectionId, {
        slotIndex: 0,
        active: false,
        bound: false,
        textureBound: false,
        textureUploading: false,
        shaderInstalled: false,
        error: null
      });
    }

    this.legacyProjector?.destroy();
    this.legacyProjector = null;
    this.legacyProjectionId = null;
    this.legacySourceId = null;
    this.legacyRuntime = null;
  }

  updateSlot(slotIndex, activeEntry) {
    const slot = this.slots[slotIndex];
    const { projectionId, config, source } = activeEntry;
    const consumerId = `projection:${projectionId}`;

    if (slot.projectionId && slot.projectionId !== projectionId) {
      this.clearSlot(slotIndex);
    }

    const canReuseRuntime =
      slot.projectionId === projectionId
      && slot.sourceId === source.id
      && slot.runtime;
    const runtimeEntry = canReuseRuntime
      ? { runtime: slot.runtime, sourceKey: slot.sourceKey }
      : this.runtimePool.acquire(source, consumerId);
    const runtime = runtimeEntry?.runtime ?? null;
    const videoElement = runtime?.getVideoElement?.() ?? null;
    const projectorEntity = this.getProjectorEntity(config.objectId) ?? null;

    slot.projectionId = projectionId;
    slot.objectId = config.objectId;
    slot.sourceId = source.id;
    slot.sourceKey = runtimeEntry?.sourceKey ?? null;
    slot.runtime = runtime;
    slot.videoElement = videoElement;
    slot.projectorEntity = projectorEntity;
    slot.enabled = Boolean(config.enabled);
    slot.mode = config.mode ?? PROJECTION_MODES.QUAD_OVERLAY;
    slot.opacity = Number(config.opacity ?? 1);
    slot.softEdge = Number(config.softEdge ?? 0);
    slot.flipY = Boolean(config.flipY);
    slot.replaceMode = config.replaceMode ?? true;
    slot.quadPlaneTolerance = Number(config.quadPlaneTolerance ?? 0.25);
    slot.projectorFov = Number(config.projectorFov ?? 45);
    slot.projectorAspect = Number(config.projectorAspect ?? (16 / 9));
    slot.projectorNear = Number(config.projectorNear ?? 0.1);
    slot.projectorFar = Number(config.projectorFar ?? 1000);
    slot.quadPoints = sanitizeQuadPoints(config.quadPoints);

    this.ensureSlotTexture(slot);
    console.log(`${this.logPrefix} activate`, {
      slotIndex,
      projectionId,
      sourceId: source.id
    });
    this.rendererState.set(projectionId, {
      slotIndex,
      active: true,
      bound: Boolean(videoElement),
      textureBound: Boolean(slot.texture),
      textureUploading: slot.textureUploading,
      shaderInstalled: this._chunkInstalled,
      error: null
    });
  }

  ensureSlotTexture(slot) {
    if (!slot.texture) {
      slot.texture = new pc.Texture(this.app.graphicsDevice, {
        name: `GsplatProjectionRendererSlot${slot.slotIndex}`,
        format: pc.PIXELFORMAT_R8_G8_B8_A8,
        mipmaps: false,
        minFilter: pc.FILTER_LINEAR,
        magFilter: pc.FILTER_LINEAR,
        addressU: pc.ADDRESS_CLAMP_TO_EDGE,
        addressV: pc.ADDRESS_CLAMP_TO_EDGE
      });
    }

    if (slot.videoElement && canBindVideoToTexture(slot.videoElement)) {
      slot.texture.setSource(slot.videoElement);
      slot.boundVideoElement = slot.videoElement;
      if (!slot.hasLoggedTextureBind) {
        slot.hasLoggedTextureBind = true;
        console.log('[PlayCanvasVideoTexture] bind', {
          slotIndex: slot.slotIndex,
          width: slot.videoElement.videoWidth ?? 0,
          height: slot.videoElement.videoHeight ?? 0
        });
      }
    }
  }

  clearSlot(slotIndex) {
    const slot = this.slots[slotIndex];
    if (slot.sourceId && slot.projectionId) {
      this.runtimePool.release(slot.sourceId, `projection:${slot.projectionId}`);
    }

    if (slot.projectionId) {
      console.log(`${this.logPrefix} deactivate`, {
        projectionId: slot.projectionId,
        slotIndex
      });
      this.rendererState.set(slot.projectionId, {
        slotIndex,
        active: false,
        bound: false,
        textureBound: false,
        textureUploading: false,
        shaderInstalled: this._chunkInstalled,
        error: null
      });
    }

    if (slot.texture) {
      slot.texture.destroy();
      slot.texture = null;
    }

    const nextState = createSlotState(slotIndex);
    this.slots[slotIndex] = nextState;
  }

  ensureShaderChunkInstalled() {
    const gsplatEntity = this.getGsplatEntity();
    const material = findGsplatMaterial(this.app, gsplatEntity);
    if (!material?.getShaderChunks) {
      return false;
    }

    if (this.sceneMaterial && this.sceneMaterial !== material) {
      this.restoreShaderChunk();
    }

    if (this._chunkInstalled && this.sceneMaterial === material) {
      return true;
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
    chunks.set(
      'gsplatModifyPS',
      shaderLanguage === (pc.SHADERLANGUAGE_WGSL ?? 'wgsl')
        ? this.buildWgslPsChunk()
        : this.buildGlslPsChunk()
    );
    material.update();
    this._chunkInstalled = true;
    return true;
  }

  buildGlslPsChunk() {
    const uniformLines = [
      'uniform mat4 uMainInvViewProj;',
      'uniform vec2 uScreenSize;'
    ];

    for (let slotIndex = 0; slotIndex < this.maxSlots; slotIndex += 1) {
      uniformLines.push(`uniform sampler2D uProjectedVideo${slotIndex};`);
      uniformLines.push(`uniform mat4 uProjectorViewProj${slotIndex};`);
      uniformLines.push(`uniform float uProjectionEnabled${slotIndex};`);
      uniformLines.push(`uniform float uProjectionOpacity${slotIndex};`);
      uniformLines.push(`uniform float uProjectionSoftEdge${slotIndex};`);
      uniformLines.push(`uniform float uProjectionFlipY${slotIndex};`);
      uniformLines.push(`uniform float uProjectionMode${slotIndex};`);
      uniformLines.push(`uniform float uProjectionReplaceMode${slotIndex};`);
      uniformLines.push(`uniform float uProjectionQuadPlaneTolerance${slotIndex};`);
      for (let pointIndex = 0; pointIndex < 4; pointIndex += 1) {
        uniformLines.push(`uniform vec3 uProjectionQuad${slotIndex}P${pointIndex};`);
        uniformLines.push(`uniform vec2 uProjectionQuad${slotIndex}ScreenP${pointIndex};`);
      }
      uniformLines.push(`uniform vec3 uProjectionQuad${slotIndex}UvHomographyRow0;`);
      uniformLines.push(`uniform vec3 uProjectionQuad${slotIndex}UvHomographyRow1;`);
      uniformLines.push(`uniform vec3 uProjectionQuad${slotIndex}UvHomographyRow2;`);
    }

    const slotFunctions = [];
    for (let slotIndex = 0; slotIndex < this.maxSlots; slotIndex += 1) {
      slotFunctions.push(buildGlslSlotFunction(slotIndex));
    }

    const applyLines = ['  vec4 projectedColor = color;'];
    for (let slotIndex = 0; slotIndex < this.maxSlots; slotIndex += 1) {
      applyLines.push(`  projectedColor = applyProjectionSlot${slotIndex}(projectedColor, worldPos);`);
    }
    applyLines.push('  color = projectedColor;');

    return [
      ...uniformLines,
      'vec3 gsplatProjectorReconstructWorldPos() {',
      '  vec2 ndcXY = (gl_FragCoord.xy / uScreenSize) * 2.0 - 1.0;',
      '  vec4 ndc = vec4(ndcXY, gl_FragCoord.z * 2.0 - 1.0, 1.0);',
      '  vec4 world = uMainInvViewProj * ndc;',
      '  return world.xyz / max(world.w, 1e-6);',
      '}',
      'float gsplatProjectorBarycentricUv(vec3 p, vec3 a, vec3 b, vec3 c, vec2 uva, vec2 uvb, vec2 uvc, float planeTolerance, out vec2 uv) {',
      '  vec3 v0 = b - a;',
      '  vec3 v1 = c - a;',
      '  vec3 normal = cross(v0, v1);',
      '  float normalLen = length(normal);',
      '  if (normalLen < 1e-6) return 0.0;',
      '  vec3 n = normal / normalLen;',
      '  float planeDistance = dot(p - a, n);',
      '  if (abs(planeDistance) > planeTolerance) return 0.0;',
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
      'float gsplatProjectorQuadUv(vec3 worldPos, vec3 p0, vec3 p1, vec3 p2, vec3 p3, float planeTolerance, out vec2 uv) {',
      '  if (gsplatProjectorBarycentricUv(worldPos, p0, p1, p2, vec2(0.0, 0.0), vec2(1.0, 0.0), vec2(1.0, 1.0), planeTolerance, uv) > 0.5) return 1.0;',
      '  if (gsplatProjectorBarycentricUv(worldPos, p0, p2, p3, vec2(0.0, 0.0), vec2(1.0, 1.0), vec2(0.0, 1.0), planeTolerance, uv) > 0.5) return 1.0;',
      '  return 0.0;',
      '}',
      'float gsplatProjectorFrustumUv(vec3 worldPos, mat4 projectorViewProj, out vec2 uv) {',
      '  vec4 projected = projectorViewProj * vec4(worldPos, 1.0);',
      '  if (projected.w <= 0.0) return 0.0;',
      '  vec3 projNdc = projected.xyz / projected.w;',
      '  if (projNdc.x < -1.0 || projNdc.x > 1.0 || projNdc.y < -1.0 || projNdc.y > 1.0 || projNdc.z < -1.0 || projNdc.z > 1.0) return 0.0;',
      '  uv = projNdc.xy * 0.5 + 0.5;',
      '  return 1.0;',
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
      'vec2 gsplatProjectorApplyQuadHomography(vec2 screenUv, vec3 row0, vec3 row1, vec3 row2) {',
      '  float denom = dot(row2, vec3(screenUv, 1.0));',
      '  if (abs(denom) < 1e-6) return vec2(-1.0);',
      '  float u = dot(row0, vec3(screenUv, 1.0)) / denom;',
      '  float v = dot(row1, vec3(screenUv, 1.0)) / denom;',
      '  return vec2(u, v);',
      '}',
      'float gsplatProjectorOverlayUv(vec2 s0, vec2 s1, vec2 s2, vec2 s3, vec3 row0, vec3 row1, vec3 row2, float softEdge, out vec2 uv, out float edgeFactor) {',
      '  vec2 screenUv = gl_FragCoord.xy / uScreenSize;',
      '  float orientation = gsplatProjectorEdgeCross(s0, s1, s2);',
      '  float signFactor = orientation >= 0.0 ? 1.0 : -1.0;',
      '  float c0 = signFactor * gsplatProjectorEdgeCross(s0, s1, screenUv);',
      '  float c1 = signFactor * gsplatProjectorEdgeCross(s1, s2, screenUv);',
      '  float c2 = signFactor * gsplatProjectorEdgeCross(s2, s3, screenUv);',
      '  float c3 = signFactor * gsplatProjectorEdgeCross(s3, s0, screenUv);',
      '  if (c0 < 0.0 || c1 < 0.0 || c2 < 0.0 || c3 < 0.0) return 0.0;',
      '  uv = gsplatProjectorApplyQuadHomography(screenUv, row0, row1, row2);',
      '  float minEdgeDistance = min(min(gsplatProjectorEdgeDistance(s0, s1, screenUv), gsplatProjectorEdgeDistance(s1, s2, screenUv)), min(gsplatProjectorEdgeDistance(s2, s3, screenUv), gsplatProjectorEdgeDistance(s3, s0, screenUv)));',
      '  if (softEdge <= 1e-4) {',
      '    edgeFactor = 1.0;',
      '  } else {',
      '    edgeFactor = smoothstep(0.0, softEdge, minEdgeDistance);',
      '  }',
      '  return uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0 ? 1.0 : 0.0;',
      '}',
      ...slotFunctions,
      'void modifySplatColor(vec2 gaussianUV, inout vec4 color) {',
      '  vec3 worldPos = gsplatProjectorReconstructWorldPos();',
      ...applyLines,
      '}'
    ].join('\n');
  }

  buildWgslPsChunk() {
    const uniformLines = [
      'uniform uMainInvViewProj: mat4x4f;',
      'uniform uScreenSize: vec2f;'
    ];
    const textureLines = [];

    for (let slotIndex = 0; slotIndex < this.maxSlots; slotIndex += 1) {
      uniformLines.push(`uniform uProjectorViewProj${slotIndex}: mat4x4f;`);
      uniformLines.push(`uniform uProjectionEnabled${slotIndex}: f32;`);
      uniformLines.push(`uniform uProjectionOpacity${slotIndex}: f32;`);
      uniformLines.push(`uniform uProjectionSoftEdge${slotIndex}: f32;`);
      uniformLines.push(`uniform uProjectionFlipY${slotIndex}: f32;`);
      uniformLines.push(`uniform uProjectionMode${slotIndex}: f32;`);
      uniformLines.push(`uniform uProjectionReplaceMode${slotIndex}: f32;`);
      uniformLines.push(`uniform uProjectionQuadPlaneTolerance${slotIndex}: f32;`);
      for (let pointIndex = 0; pointIndex < 4; pointIndex += 1) {
        uniformLines.push(`uniform uProjectionQuad${slotIndex}P${pointIndex}: vec3f;`);
        uniformLines.push(`uniform uProjectionQuad${slotIndex}ScreenP${pointIndex}: vec2f;`);
      }
      uniformLines.push(`uniform uProjectionQuad${slotIndex}UvHomographyRow0: vec3f;`);
      uniformLines.push(`uniform uProjectionQuad${slotIndex}UvHomographyRow1: vec3f;`);
      uniformLines.push(`uniform uProjectionQuad${slotIndex}UvHomographyRow2: vec3f;`);
      textureLines.push(`var uProjectedVideo${slotIndex}: texture_2d<f32>;`);
      textureLines.push(`var uProjectedVideo${slotIndex}Sampler: sampler;`);
    }

    const slotFunctions = [];
    for (let slotIndex = 0; slotIndex < this.maxSlots; slotIndex += 1) {
      slotFunctions.push(buildWgslSlotFunction(slotIndex));
    }

    const applyLines = ['  var projectedColor = *color;'];
    for (let slotIndex = 0; slotIndex < this.maxSlots; slotIndex += 1) {
      applyLines.push(`  projectedColor = applyProjectionSlot${slotIndex}(projectedColor, worldPos);`);
    }
    applyLines.push('  *color = projectedColor;');

    return [
      ...uniformLines,
      ...textureLines,
      'fn gsplatProjectorReconstructWorldPos() -> vec3f {',
      '  let ndcXY = (pcPosition.xy / uniform.uScreenSize) * 2.0 - 1.0;',
      '  let ndc = vec4f(ndcXY, pcPosition.z * 2.0 - 1.0, 1.0);',
      '  let world = uniform.uMainInvViewProj * ndc;',
      '  return world.xyz / max(world.w, 1e-6);',
      '}',
      'fn gsplatProjectorBarycentricUv(p: vec3f, a: vec3f, b: vec3f, c: vec3f, uva: vec2f, uvb: vec2f, uvc: vec2f, planeTolerance: f32) -> vec3f {',
      '  let v0 = b - a;',
      '  let v1 = c - a;',
      '  let normal = cross(v0, v1);',
      '  let normalLen = length(normal);',
      '  if (normalLen < 1e-6) { return vec3f(0.0, 0.0, 0.0); }',
      '  let n = normal / normalLen;',
      '  let planeDistance = dot(p - a, n);',
      '  if (abs(planeDistance) > planeTolerance) { return vec3f(0.0, 0.0, 0.0); }',
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
      'fn gsplatProjectorQuadUv(worldPos: vec3f, p0: vec3f, p1: vec3f, p2: vec3f, p3: vec3f, planeTolerance: f32) -> vec3f {',
      '  let a = gsplatProjectorBarycentricUv(worldPos, p0, p1, p2, vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0), planeTolerance);',
      '  if (a.x > 0.5) { return a; }',
      '  return gsplatProjectorBarycentricUv(worldPos, p0, p2, p3, vec2f(0.0, 0.0), vec2f(1.0, 1.0), vec2f(0.0, 1.0), planeTolerance);',
      '}',
      'fn gsplatProjectorFrustumUv(worldPos: vec3f, projectorViewProj: mat4x4f) -> vec3f {',
      '  let projected = projectorViewProj * vec4f(worldPos, 1.0);',
      '  if (projected.w <= 0.0) { return vec3f(0.0, 0.0, 0.0); }',
      '  let projNdc = projected.xyz / projected.w;',
      '  if (projNdc.x < -1.0 || projNdc.x > 1.0 || projNdc.y < -1.0 || projNdc.y > 1.0 || projNdc.z < -1.0 || projNdc.z > 1.0) { return vec3f(0.0, 0.0, 0.0); }',
      '  let uv = projNdc.xy * 0.5 + vec2f(0.5, 0.5);',
      '  return vec3f(1.0, uv.x, uv.y);',
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
      'fn gsplatProjectorApplyQuadHomography(screenUv: vec2f, row0: vec3f, row1: vec3f, row2: vec3f) -> vec2f {',
      '  let denom = dot(row2, vec3f(screenUv, 1.0));',
      '  if (abs(denom) < 1e-6) { return vec2f(-1.0, -1.0); }',
      '  let u = dot(row0, vec3f(screenUv, 1.0)) / denom;',
      '  let v = dot(row1, vec3f(screenUv, 1.0)) / denom;',
      '  return vec2f(u, v);',
      '}',
      'fn gsplatProjectorOverlayUv(s0: vec2f, s1: vec2f, s2: vec2f, s3: vec2f, row0: vec3f, row1: vec3f, row2: vec3f, softEdge: f32) -> vec4f {',
      '  let screenUv = pcPosition.xy / uniform.uScreenSize;',
      '  let orientation = gsplatProjectorEdgeCross(s0, s1, s2);',
      '  let signFactor = select(-1.0, 1.0, orientation >= 0.0);',
      '  let c0 = signFactor * gsplatProjectorEdgeCross(s0, s1, screenUv);',
      '  let c1 = signFactor * gsplatProjectorEdgeCross(s1, s2, screenUv);',
      '  let c2 = signFactor * gsplatProjectorEdgeCross(s2, s3, screenUv);',
      '  let c3 = signFactor * gsplatProjectorEdgeCross(s3, s0, screenUv);',
      '  if (c0 < 0.0 || c1 < 0.0 || c2 < 0.0 || c3 < 0.0) { return vec4f(0.0, 0.0, 0.0, 0.0); }',
      '  let uv = gsplatProjectorApplyQuadHomography(screenUv, row0, row1, row2);',
      '  let minEdgeDistance = min(min(gsplatProjectorEdgeDistance(s0, s1, screenUv), gsplatProjectorEdgeDistance(s1, s2, screenUv)), min(gsplatProjectorEdgeDistance(s2, s3, screenUv), gsplatProjectorEdgeDistance(s3, s0, screenUv)));',
      '  let edgeFactor = select(smoothstep(0.0, softEdge, minEdgeDistance), 1.0, softEdge <= 1e-4);',
      '  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { return vec4f(0.0, 0.0, 0.0, 0.0); }',
      '  return vec4f(1.0, uv.x, uv.y, edgeFactor);',
      '}',
      ...slotFunctions,
      'fn modifySplatColor(gaussianUV: vec2f, color: ptr<function, vec4f>) {',
      '  let worldPos = gsplatProjectorReconstructWorldPos();',
      ...applyLines,
      '}'
    ].join('\n');
  }

  update() {
    if (this.legacyProjector) {
      this.legacyProjector.patch({
        gsplatEntity: this.getGsplatEntity(),
        mainCameraEntity: this.getMainCameraEntity(),
        projectorEntity: this.getProjectorEntity(this.legacyProjectionId ? this.projectionRegistry.get(this.legacyProjectionId)?.objectId : null) ?? null
      });
      this.legacyProjector.update();
      if (this.legacyProjectionId) {
        this.rendererState.set(this.legacyProjectionId, {
          slotIndex: 0,
          active: true,
          bound: Boolean(this.legacyProjector.videoElement),
          textureBound: Boolean(this.legacyProjector.videoTexture),
          textureUploading: Boolean(this.legacyProjector._hasLoggedTextureUpload),
          shaderInstalled: Boolean(this.legacyProjector._chunkInstalled),
          error: null
        });
      }
      return true;
    }

    if (!this.ensureShaderChunkInstalled()) {
      return false;
    }

    this.updateMatrices();
    this.updateSlots();
    this.updateUniforms();
    return true;
  }

  updateMatrices() {
    const mainCameraEntity = this.getMainCameraEntity();
    const cameraComponent = mainCameraEntity?.camera;
    if (!cameraComponent) {
      return;
    }

    const canvas = this.app.graphicsDevice.canvas;
    const aspect = Math.max(1e-6, canvas.clientWidth / Math.max(canvas.clientHeight, 1));
    this.mainProj.setPerspective(cameraComponent.fov, aspect, cameraComponent.nearClip, cameraComponent.farClip, false);
    this.mainView.copy(mainCameraEntity.getWorldTransform()).invert();
    this.mainViewProj.mul2(this.mainProj, this.mainView);
    this.mainInvViewProj.copy(this.mainViewProj).invert();
    this.screenSizeUniform[0] = canvas.width;
    this.screenSizeUniform[1] = canvas.height;
  }

  updateSlots() {
    const mainCameraEntity = this.getMainCameraEntity();
    const cameraComponent = mainCameraEntity?.camera;
    const gd = this.app?.graphicsDevice;

    this.slots.forEach((slot) => {
      if (!slot.enabled) {
        return;
      }

      slot.projectorEntity = this.getProjectorEntity(slot.objectId) ?? slot.projectorEntity;
      if (!slot.projectorEntity) {
        return;
      }

      slot.projectorProj.setPerspective(
        slot.projectorFov,
        slot.projectorAspect,
        slot.projectorNear,
        slot.projectorFar,
        false
      );
      slot.projectorView.copy(slot.projectorEntity.getWorldTransform()).invert();
      slot.projectorViewProj.mul2(slot.projectorProj, slot.projectorView);

      slot.quadPoints.forEach((point, index) => {
        slot.quadUniforms[index][0] = point[0];
        slot.quadUniforms[index][1] = point[1];
        slot.quadUniforms[index][2] = point[2];
      });

      if (cameraComponent && gd && slot.quadPoints.length >= 4) {
        const width = Math.max(gd.width || gd.canvas?.width || 0, 1);
        const height = Math.max(gd.height || gd.canvas?.height || 0, 1);

        slot.quadPoints.forEach((point, index) => {
          const world = new pc.Vec3(point[0], point[1], point[2]);
          const screen = cameraComponent.worldToScreen(world);
          slot.quadScreenUniforms[index][0] = screen.x / width;
          slot.quadScreenUniforms[index][1] = 1 - (screen.y / height);
        });

        const homography = computeQuadHomography(
          slot.quadScreenUniforms.map((point) => [point[0], point[1]])
        );
        if (homography) {
          slot.quadUvHomographyRows[0][0] = homography[0];
          slot.quadUvHomographyRows[0][1] = homography[1];
          slot.quadUvHomographyRows[0][2] = homography[2];
          slot.quadUvHomographyRows[1][0] = homography[3];
          slot.quadUvHomographyRows[1][1] = homography[4];
          slot.quadUvHomographyRows[1][2] = homography[5];
          slot.quadUvHomographyRows[2][0] = homography[6];
          slot.quadUvHomographyRows[2][1] = homography[7];
          slot.quadUvHomographyRows[2][2] = homography[8];
        }
      }

      if (
        slot.videoElement
        && slot.texture
        && canBindVideoToTexture(slot.videoElement)
        && slot.boundVideoElement !== slot.videoElement
      ) {
        slot.texture.setSource(slot.videoElement);
        slot.boundVideoElement = slot.videoElement;
        if (!slot.hasLoggedTextureBind) {
          slot.hasLoggedTextureBind = true;
          console.log('[PlayCanvasVideoTexture] bind', {
            slotIndex: slot.slotIndex,
            width: slot.videoElement.videoWidth ?? 0,
            height: slot.videoElement.videoHeight ?? 0
          });
        }
      }

      if (
        slot.videoElement
        && slot.texture
        && slot.boundVideoElement === slot.videoElement
        && slot.videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
      ) {
        slot.texture.upload();
        slot.textureUploading = true;
        if (!slot.firstUploadLogged) {
          slot.firstUploadLogged = true;
          console.info(`${this.logPrefix} first texture upload`, {
            slotIndex: slot.slotIndex,
            projectionId: slot.projectionId,
            sourceKey: slot.sourceKey
          });
        }
      }

      if (slot.projectionId) {
        this.rendererState.set(slot.projectionId, {
          slotIndex: slot.slotIndex,
          active: true,
          bound: Boolean(slot.videoElement),
          textureBound: Boolean(slot.texture),
          textureUploading: slot.textureUploading,
          shaderInstalled: this._chunkInstalled,
          error: null
        });
      }
    });
  }

  updateUniforms() {
    if (!this.sceneMaterial) {
      return;
    }

    this.sceneMaterial.setParameter('uMainInvViewProj', this.mainInvViewProj.data);
    this.sceneMaterial.setParameter('uScreenSize', this.screenSizeUniform);

    this.slots.forEach((slot, slotIndex) => {
      this.sceneMaterial.setParameter(`uProjectedVideo${slotIndex}`, slot.texture ?? this.fallbackTexture);
      this.sceneMaterial.setParameter(`uProjectorViewProj${slotIndex}`, slot.projectorViewProj.data);
      this.sceneMaterial.setParameter(`uProjectionEnabled${slotIndex}`, slot.enabled ? 1 : 0);
      this.sceneMaterial.setParameter(`uProjectionOpacity${slotIndex}`, slot.opacity);
      this.sceneMaterial.setParameter(`uProjectionSoftEdge${slotIndex}`, slot.softEdge);
      this.sceneMaterial.setParameter(`uProjectionFlipY${slotIndex}`, slot.flipY ? 1 : 0);
      this.sceneMaterial.setParameter(`uProjectionMode${slotIndex}`, slot.mode === PROJECTION_MODES.QUAD_OVERLAY ? 2 : (slot.mode === PROJECTION_MODES.QUAD ? 1 : 0));
      this.sceneMaterial.setParameter(`uProjectionReplaceMode${slotIndex}`, slot.replaceMode ? 1 : 0);
      this.sceneMaterial.setParameter(`uProjectionQuadPlaneTolerance${slotIndex}`, Math.max(0.0001, Number(slot.quadPlaneTolerance) || 0.25));

      for (let pointIndex = 0; pointIndex < 4; pointIndex += 1) {
        this.sceneMaterial.setParameter(`uProjectionQuad${slotIndex}P${pointIndex}`, slot.quadUniforms[pointIndex]);
        this.sceneMaterial.setParameter(`uProjectionQuad${slotIndex}ScreenP${pointIndex}`, slot.quadScreenUniforms[pointIndex]);
      }
      this.sceneMaterial.setParameter(`uProjectionQuad${slotIndex}UvHomographyRow0`, slot.quadUvHomographyRows[0]);
      this.sceneMaterial.setParameter(`uProjectionQuad${slotIndex}UvHomographyRow1`, slot.quadUvHomographyRows[1]);
      this.sceneMaterial.setParameter(`uProjectionQuad${slotIndex}UvHomographyRow2`, slot.quadUvHomographyRows[2]);
    });
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

  deactivate(projectionId) {
    const slotIndex = this.slots.findIndex((slot) => slot.projectionId === projectionId);
    if (slotIndex < 0) {
      return false;
    }

    this.clearSlot(slotIndex);
    this.activeProjectionIds = this.activeProjectionIds.filter((id) => id !== projectionId);
    return true;
  }

  getRendererState() {
    return Object.fromEntries(Array.from(this.rendererState.entries()));
  }

  destroy() {
    this.deactivateLegacyProjection();
    for (let slotIndex = 0; slotIndex < this.maxSlots; slotIndex += 1) {
      this.clearSlot(slotIndex);
    }
    this.restoreShaderChunk();
    this.sceneMaterial = null;
    this.shaderChunks = null;
    this.fallbackTexture?.destroy?.();
    this.fallbackTexture = null;
    this.activeProjectionIds = [];
    this.rendererState.clear();
  }
}
