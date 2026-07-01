import * as pc from 'playcanvas';

function resolveVideoUrl(videoAsset, videoUrl) {
  if (videoAsset?.getFileUrl) {
    return videoAsset.getFileUrl();
  }

  return videoUrl || '';
}

function findGsplatMaterial(app, gsplatEntity = null) {
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
  app.root.forEach((node) => {
    if (found || !node.gsplat) {
      return;
    }

    found = node.gsplat.material ?? node.gsplat.instance?.material ?? node.gsplat._instance?.material ?? null;
  });

  return found;
}

export class GsplatMp4ProjectorAdapter {
  constructor({
    app,
    gsplatEntity = null,
    mainCameraEntity,
    projectorEntity,
    videoAsset = null,
    videoUrl = '',
    projectorFov = 45,
    projectorAspect = 16 / 9,
    projectorNear = 0.1,
    projectorFar = 100,
    opacity = 0.8,
    softEdge = 0.02,
    flipY = true,
    enabledProjection = true,
    logDebug = false
  }) {
    this.app = app;
    this.gsplatEntity = gsplatEntity;
    this.mainCameraEntity = mainCameraEntity;
    this.projectorEntity = projectorEntity;
    this.videoAsset = videoAsset;
    this.videoUrl = videoUrl;
    this.projectorFov = projectorFov;
    this.projectorAspect = projectorAspect;
    this.projectorNear = projectorNear;
    this.projectorFar = projectorFar;
    this.opacity = opacity;
    this.softEdge = softEdge;
    this.flipY = flipY;
    this.enabledProjection = enabledProjection;
    this.logDebug = logDebug;

    this.videoElement = null;
    this.videoTexture = null;
    this.sceneMaterial = null;
    this.mainProj = new pc.Mat4();
    this.mainView = new pc.Mat4();
    this.mainViewProj = new pc.Mat4();
    this.mainInvViewProj = new pc.Mat4();
    this.projectorProj = new pc.Mat4();
    this.projectorView = new pc.Mat4();
    this.projectorViewProj = new pc.Mat4();
    this.screenSizeUniform = new Float32Array(2);
    this.debugLastTick = 0;
    this.originalChunks = {
      glslPs: null,
      wgslPs: null
    };
  }

  initialize() {
    this.createVideoElement(resolveVideoUrl(this.videoAsset, this.videoUrl));
    this.createVideoTexture();
    this.installGsplatMaterialChunk();
  }

  createVideoElement(resolvedVideoUrl) {
    const video = document.createElement('video');
    video.loop = true;
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';
    video.style.display = 'none';
    document.body.appendChild(video);

    if (resolvedVideoUrl) {
      video.src = resolvedVideoUrl;
    }

    video.addEventListener('canplay', () => {
      const playPromise = video.play();
      if (playPromise?.catch) {
        playPromise.catch((error) => {
          if (this.logDebug) {
            console.warn('[GsplatMp4ProjectorAdapter] video.play failed:', error);
          }
        });
      }
    });

    if (resolvedVideoUrl) {
      video.load();
    }

    this.videoElement = video;
  }

  createVideoTexture() {
    this.videoTexture = new pc.Texture(this.app.graphicsDevice, {
      name: 'GsplatMp4ProjectorAdapterVideo',
      mipmaps: false,
      minFilter: pc.FILTER_LINEAR,
      magFilter: pc.FILTER_LINEAR,
      addressU: pc.ADDRESS_CLAMP_TO_EDGE,
      addressV: pc.ADDRESS_CLAMP_TO_EDGE
    });

    if (this.videoElement) {
      this.videoTexture.setSource(this.videoElement);
    }
  }

  installGsplatMaterialChunk() {
    const sceneMat = findGsplatMaterial(this.app, this.gsplatEntity);
    if (!sceneMat) {
      if (this.logDebug) {
        console.warn('[GsplatMp4ProjectorAdapter] gsplat material not found');
      }
      return false;
    }

    this.sceneMaterial = sceneMat;
    this.originalChunks.glslPs = sceneMat.shaderChunks.glsl.get('gsplatModifyPS') || null;
    this.originalChunks.wgslPs = sceneMat.shaderChunks.wgsl.get('gsplatModifyPS') || null;

    if (this.app.graphicsDevice.isWebGPU) {
      sceneMat.shaderChunks.wgsl.set('gsplatModifyPS', this.buildWgslPsChunk());
    } else {
      sceneMat.shaderChunks.glsl.set('gsplatModifyPS', this.buildGlslPsChunk());
    }

    sceneMat.update();
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
      'vec3 gsplatProjectorReconstructWorldPos() {',
      '  vec2 ndcXY = (gl_FragCoord.xy / uScreenSize) * 2.0 - 1.0;',
      '  vec4 ndc = vec4(ndcXY, gl_FragCoord.z * 2.0 - 1.0, 1.0);',
      '  vec4 world = uMainInvViewProj * ndc;',
      '  return world.xyz / max(world.w, 1e-6);',
      '}',
      'void modifySplatColor(vec2 gaussianUV, inout vec4 color) {',
      '  if (uProjectorEnabled < 0.5) return;',
      '  vec3 worldPos = gsplatProjectorReconstructWorldPos();',
      '  vec4 projected = uProjectorViewProj * vec4(worldPos, 1.0);',
      '  if (projected.w <= 0.0) return;',
      '  vec3 projNdc = projected.xyz / projected.w;',
      '  if (projNdc.x < -1.0 || projNdc.x > 1.0 || projNdc.y < -1.0 || projNdc.y > 1.0 || projNdc.z < -1.0 || projNdc.z > 1.0) return;',
      '  vec2 uv = projNdc.xy * 0.5 + 0.5;',
      '  if (uVideoFlipY > 0.5) uv.y = 1.0 - uv.y;',
      '  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return;',
      '  vec2 edgeDist = min(uv, 1.0 - uv);',
      '  float softMask = clamp(min(edgeDist.x, edgeDist.y) / max(uProjectionSoftEdge, 1e-5), 0.0, 1.0);',
      '  vec4 videoColor = texture2D(uProjectedVideo, uv);',
      '  float amount = uProjectionOpacity * softMask * videoColor.a;',
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
      'var uProjectedVideo: texture_2d<f32>;',
      'var uProjectedVideoSampler: sampler;',
      'fn gsplatProjectorReconstructWorldPos() -> vec3f {',
      '  let ndcXY = (pcPosition.xy / uniform.uScreenSize) * 2.0 - 1.0;',
      '  let ndc = vec4f(ndcXY, pcPosition.z * 2.0 - 1.0, 1.0);',
      '  let world = uniform.uMainInvViewProj * ndc;',
      '  return world.xyz / max(world.w, 1e-6);',
      '}',
      'fn modifySplatColor(gaussianUV: vec2f, color: ptr<function, vec4f>) {',
      '  if (uniform.uProjectorEnabled < 0.5) { return; }',
      '  let worldPos = gsplatProjectorReconstructWorldPos();',
      '  let projected = uniform.uProjectorViewProj * vec4f(worldPos, 1.0);',
      '  if (projected.w <= 0.0) { return; }',
      '  let projNdc = projected.xyz / projected.w;',
      '  if (projNdc.x < -1.0 || projNdc.x > 1.0 || projNdc.y < -1.0 || projNdc.y > 1.0 || projNdc.z < -1.0 || projNdc.z > 1.0) { return; }',
      '  var uv = projNdc.xy * 0.5 + vec2f(0.5, 0.5);',
      '  if (uniform.uVideoFlipY > 0.5) { uv.y = 1.0 - uv.y; }',
      '  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { return; }',
      '  let edgeDist = min(uv, vec2f(1.0, 1.0) - uv);',
      '  let softMask = clamp(min(edgeDist.x, edgeDist.y) / max(uniform.uProjectionSoftEdge, 1e-5), 0.0, 1.0);',
      '  let videoColor = textureSampleLevel(uProjectedVideo, uProjectedVideoSampler, uv, 0.0);',
      '  let amount = uniform.uProjectionOpacity * softMask * videoColor.a;',
      '  (*color).rgb = mix((*color).rgb, videoColor.rgb, amount);',
      '}'
    ].join('\n');
  }

  update() {
    if (!this.sceneMaterial || !this.mainCameraEntity || !this.projectorEntity) {
      return;
    }

    if (this.videoElement && this.videoTexture && this.videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      this.videoTexture.setSource(this.videoElement);
      this.videoTexture.upload();
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
    this.sceneMaterial.setParameter('uProjectedVideo', this.videoTexture);
    this.sceneMaterial.setParameter('uMainInvViewProj', this.mainInvViewProj.data);
    this.sceneMaterial.setParameter('uProjectorViewProj', this.projectorViewProj.data);
    this.sceneMaterial.setParameter('uScreenSize', this.screenSizeUniform);
    this.sceneMaterial.setParameter('uProjectionOpacity', this.opacity);
    this.sceneMaterial.setParameter('uProjectionSoftEdge', this.softEdge);
    this.sceneMaterial.setParameter('uProjectorEnabled', this.enabledProjection ? 1 : 0);
    this.sceneMaterial.setParameter('uVideoFlipY', this.flipY ? 1 : 0);
  }

  patch(options = {}) {
    if ('gsplatEntity' in options) this.gsplatEntity = options.gsplatEntity;
    if ('videoAsset' in options) this.videoAsset = options.videoAsset;
    if ('videoUrl' in options) this.videoUrl = options.videoUrl;
    if ('projectorFov' in options) this.projectorFov = options.projectorFov;
    if ('projectorAspect' in options) this.projectorAspect = options.projectorAspect;
    if ('projectorNear' in options) this.projectorNear = options.projectorNear;
    if ('projectorFar' in options) this.projectorFar = options.projectorFar;
    if ('opacity' in options) this.opacity = options.opacity;
    if ('softEdge' in options) this.softEdge = options.softEdge;
    if ('flipY' in options) this.flipY = options.flipY;
    if ('enabledProjection' in options) this.enabledProjection = options.enabledProjection;
    if ('mainCameraEntity' in options) this.mainCameraEntity = options.mainCameraEntity;
    if ('projectorEntity' in options) this.projectorEntity = options.projectorEntity;

    if ('videoAsset' in options || 'videoUrl' in options) {
      this.reloadVideo();
    }
  }

  reloadVideo() {
    const resolvedVideoUrl = resolveVideoUrl(this.videoAsset, this.videoUrl);
    if (!this.videoElement) {
      this.createVideoElement(resolvedVideoUrl);
      this.createVideoTexture();
      return;
    }

    this.videoElement.pause();
    this.videoElement.src = resolvedVideoUrl;
    this.videoElement.load();
  }

  destroy() {
    if (this.sceneMaterial) {
      this.sceneMaterial.setParameter('uProjectorEnabled', 0);
      this.sceneMaterial.setParameter('uProjectionOpacity', 0);
      this.sceneMaterial.setParameter('uProjectedVideo', null);
      if (this.originalChunks.glslPs) {
        this.sceneMaterial.shaderChunks.glsl.set('gsplatModifyPS', this.originalChunks.glslPs);
      } else {
        this.sceneMaterial.shaderChunks.glsl.delete('gsplatModifyPS');
      }
      if (this.originalChunks.wgslPs) {
        this.sceneMaterial.shaderChunks.wgsl.set('gsplatModifyPS', this.originalChunks.wgslPs);
      } else {
        this.sceneMaterial.shaderChunks.wgsl.delete('gsplatModifyPS');
      }
      this.sceneMaterial.update();
      this.sceneMaterial = null;
    }

    if (this.videoTexture) {
      this.videoTexture.destroy();
      this.videoTexture = null;
    }

    if (this.videoElement) {
      this.videoElement.pause();
      this.videoElement.removeAttribute('src');
      this.videoElement.load();
      this.videoElement.remove();
      this.videoElement = null;
    }
  }
}
