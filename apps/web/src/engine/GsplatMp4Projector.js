/*
Editor usage:
1. Attach this script to an empty Entity.
2. Assign `mainCameraEntity` to the active scene camera.
3. Create another empty Entity as the virtual projector and assign it to `projectorEntity`.
4. Upload an MP4 and assign it to `videoAsset`, or fill `videoUrl`.
5. Adjust the projector Entity transform together with `projectorFov` / `projectorAspect`.
6. Run the scene. The video will be projected onto the 3DGS / Gaussian Splat surface like a projector camera.
7. TODO: current version does not solve projection occlusion / bleed-through. Use proxy mesh + projector depth map later.
*/

/* global pc */

var GsplatMp4Projector = pc.createScript('gsplatMp4Projector');

GsplatMp4Projector.attributes.add('mainCameraEntity', {
  type: 'entity',
  title: 'Main Camera Entity'
});

GsplatMp4Projector.attributes.add('projectorEntity', {
  type: 'entity',
  title: 'Projector Entity'
});

GsplatMp4Projector.attributes.add('videoAsset', {
  type: 'asset',
  assetType: 'binary',
  title: 'Video Asset'
});

GsplatMp4Projector.attributes.add('videoUrl', {
  type: 'string',
  default: '',
  title: 'Video URL'
});

GsplatMp4Projector.attributes.add('projectorFov', {
  type: 'number',
  default: 45,
  title: 'Projector FOV'
});

GsplatMp4Projector.attributes.add('projectorAspect', {
  type: 'number',
  default: 16 / 9,
  title: 'Projector Aspect'
});

GsplatMp4Projector.attributes.add('projectorNear', {
  type: 'number',
  default: 0.1,
  title: 'Projector Near'
});

GsplatMp4Projector.attributes.add('projectorFar', {
  type: 'number',
  default: 100,
  title: 'Projector Far'
});

GsplatMp4Projector.attributes.add('opacity', {
  type: 'number',
  default: 0.8,
  title: 'Opacity'
});

GsplatMp4Projector.attributes.add('softEdge', {
  type: 'number',
  default: 0.02,
  title: 'Soft Edge'
});

GsplatMp4Projector.attributes.add('flipY', {
  type: 'boolean',
  default: true,
  title: 'Flip Y'
});

GsplatMp4Projector.attributes.add('enabledProjection', {
  type: 'boolean',
  default: true,
  title: 'Enabled Projection'
});

GsplatMp4Projector.attributes.add('logDebug', {
  type: 'boolean',
  default: false,
  title: 'Log Debug'
});

GsplatMp4Projector.prototype.initialize = function () {
  this.videoElement = null;
  this.videoTexture = null;
  this.sceneMaterial = null;
  this.originalGlslChunk = null;
  this.originalWgslChunk = null;
  this.originalGlslVsChunk = null;
  this.originalWgslVsChunk = null;

  this.mainProj = new pc.Mat4();
  this.mainView = new pc.Mat4();
  this.mainViewProj = new pc.Mat4();
  this.mainInvViewProj = new pc.Mat4();
  this.projectorProj = new pc.Mat4();
  this.projectorView = new pc.Mat4();
  this.projectorViewProj = new pc.Mat4();

  this.screenSizeUniform = new Float32Array(2);
  this.debugLastTick = 0;

  this._onDestroy = this.destroyProjection.bind(this);
  this.entity.on('destroy', this._onDestroy);

  var resolvedVideoUrl = this.resolveVideoUrl();
  this.createVideoElement(resolvedVideoUrl);
  this.createVideoTexture();
  this.installGsplatMaterialChunk();
};

GsplatMp4Projector.prototype.resolveVideoUrl = function () {
  if (this.videoAsset && this.videoAsset.getFileUrl) {
    return this.videoAsset.getFileUrl();
  }

  return this.videoUrl || '';
};

GsplatMp4Projector.prototype.createVideoElement = function (resolvedVideoUrl) {
  var video = document.createElement('video');
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

  var self = this;
  video.addEventListener('canplay', function () {
    var playPromise = video.play();
    if (playPromise && playPromise.catch) {
      playPromise.catch(function (error) {
        if (self.logDebug) {
          console.warn('[GsplatMp4Projector] video.play failed:', error);
        }
      });
    }
  });

  if (resolvedVideoUrl) {
    video.load();
  } else if (this.logDebug) {
    console.warn('[GsplatMp4Projector] no video url resolved');
  }

  this.videoElement = video;
};

GsplatMp4Projector.prototype.createVideoTexture = function () {
  this.videoTexture = new pc.Texture(this.app.graphicsDevice, {
    name: 'GsplatMp4ProjectorVideo',
    mipmaps: false,
    minFilter: pc.FILTER_LINEAR,
    magFilter: pc.FILTER_LINEAR,
    addressU: pc.ADDRESS_CLAMP_TO_EDGE,
    addressV: pc.ADDRESS_CLAMP_TO_EDGE
  });

  if (this.videoElement) {
    this.videoTexture.setSource(this.videoElement);
  }
};

GsplatMp4Projector.prototype.findGsplatMaterial = function () {
  var gsplatParamsMaterial = this.app.scene && this.app.scene.gsplat ? this.app.scene.gsplat.material : null;
  if (gsplatParamsMaterial) {
    return gsplatParamsMaterial;
  }

  var found = null;
  this.app.root.forEach(function (node) {
    if (found || !node.gsplat) {
      return;
    }

    found = node.gsplat.material || node.gsplat.instance && node.gsplat.instance.material || null;
  });

  return found;
};

GsplatMp4Projector.prototype.installGsplatMaterialChunk = function () {
  var sceneMat = this.findGsplatMaterial();
  if (!sceneMat) {
    if (this.logDebug) {
      console.warn('[GsplatMp4Projector] gsplat material not found');
    }
    return;
  }

  this.sceneMaterial = sceneMat;
  this.originalGlslChunk = sceneMat.shaderChunks.glsl.get('gsplatModifyPS') || null;
  this.originalWgslChunk = sceneMat.shaderChunks.wgsl.get('gsplatModifyPS') || null;
  this.originalGlslVsChunk = sceneMat.shaderChunks.glsl.get('gsplatModifyVS') || null;
  this.originalWgslVsChunk = sceneMat.shaderChunks.wgsl.get('gsplatModifyVS') || null;

  sceneMat.shaderChunks.glsl.set('gsplatModifyVS', this.buildGlslVsChunk());
  sceneMat.shaderChunks.glsl.set('gsplatModifyPS', this.buildGlslPsChunk());
  sceneMat.shaderChunks.wgsl.set('gsplatModifyVS', this.buildWgslVsChunk());
  sceneMat.shaderChunks.wgsl.set('gsplatModifyPS', this.buildWgslPsChunk());
  sceneMat.update();

  if (this.logDebug) {
    console.log('[GsplatMp4Projector] gsplat chunks installed');
  }
};

GsplatMp4Projector.prototype.buildGlslVsChunk = function () {
  return [
    'varying mediump vec3 vProjectedWorldCenter;',
    'void modifySplatCenter(inout vec3 center) {',
    '}',
    'void modifySplatRotationScale(vec3 originalCenter, vec3 modifiedCenter, inout vec4 rotation, inout vec3 scale) {',
    '}',
    'void modifySplatColor(vec3 center, inout vec4 color) {',
    '  vProjectedWorldCenter = (matrix_model * vec4(center, 1.0)).xyz;',
    '}'
  ].join('\n');
};

GsplatMp4Projector.prototype.buildGlslPsChunk = function () {
  return [
    'varying mediump vec3 vProjectedWorldCenter;',
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
    '  if (uProjectorEnabled < 0.5) {',
    '    return;',
    '  }',
    '  vec3 worldPos = gsplatProjectorReconstructWorldPos();',
    '  vec4 projected = uProjectorViewProj * vec4(worldPos, 1.0);',
    '  if (projected.w <= 0.0) {',
    '    return;',
    '  }',
    '  vec3 projNdc = projected.xyz / projected.w;',
    '  if (projNdc.x < -1.0 || projNdc.x > 1.0 || projNdc.y < -1.0 || projNdc.y > 1.0 || projNdc.z < -1.0 || projNdc.z > 1.0) {',
    '    return;',
    '  }',
    '  vec2 uv = projNdc.xy * 0.5 + 0.5;',
    '  if (uVideoFlipY > 0.5) {',
    '    uv.y = 1.0 - uv.y;',
    '  }',
    '  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {',
    '    return;',
    '  }',
    '  vec2 edgeDist = min(uv, 1.0 - uv);',
    '  float edgeMin = min(edgeDist.x, edgeDist.y);',
    '  float softMask = clamp(edgeMin / max(uProjectionSoftEdge, 1e-5), 0.0, 1.0);',
    '  vec4 videoColor = texture2D(uProjectedVideo, uv);',
    '  float amount = uProjectionOpacity * softMask * videoColor.a;',
    '  color.rgb = mix(color.rgb, videoColor.rgb, amount);',
    '}'
  ].join('\n');
};

GsplatMp4Projector.prototype.buildWgslVsChunk = function () {
  return [
    'varying vProjectedWorldCenter: vec3f;',
    'fn modifySplatCenter(center: ptr<function, vec3f>) {',
    '}',
    'fn modifySplatRotationScale(originalCenter: vec3f, modifiedCenter: vec3f, rotation: ptr<function, vec4f>, scale: ptr<function, vec3f>) {',
    '}',
    'fn modifySplatColor(center: vec3f, color: ptr<function, vec4f>) {',
    '  vProjectedWorldCenter = (uniform.matrix_model * vec4f(center, 1.0)).xyz;',
    '}'
  ].join('\n');
};

GsplatMp4Projector.prototype.buildWgslPsChunk = function () {
  return [
    'varying vProjectedWorldCenter: vec3f;',
    'var uProjectedVideo: texture_2d<f32>;',
    'var uProjectedVideoSampler: sampler;',
    'uniform uMainInvViewProj: mat4x4f;',
    'uniform uProjectorViewProj: mat4x4f;',
    'uniform uScreenSize: vec2f;',
    'uniform uProjectionOpacity: f32;',
    'uniform uProjectionSoftEdge: f32;',
    'uniform uProjectorEnabled: f32;',
    'uniform uVideoFlipY: f32;',
    'fn gsplatProjectorReconstructWorldPos(position: vec4f) -> vec3f {',
    '  let ndcXY = (position.xy / uniform.uScreenSize) * 2.0 - 1.0;',
    '  let ndc = vec4f(ndcXY, position.z * 2.0 - 1.0, 1.0);',
    '  let world = uniform.uMainInvViewProj * ndc;',
    '  return world.xyz / max(world.w, 1e-6);',
    '}',
    'fn modifySplatColor(gaussianUV: vec2f, color: ptr<function, vec4f>) {',
    '  if (uniform.uProjectorEnabled < 0.5) {',
    '    return;',
    '  }',
    '  let worldPos = gsplatProjectorReconstructWorldPos(pcPosition);',
    '  let projected = uniform.uProjectorViewProj * vec4f(worldPos, 1.0);',
    '  if (projected.w <= 0.0) {',
    '    return;',
    '  }',
    '  let projNdc = projected.xyz / projected.w;',
    '  if (projNdc.x < -1.0 || projNdc.x > 1.0 || projNdc.y < -1.0 || projNdc.y > 1.0 || projNdc.z < -1.0 || projNdc.z > 1.0) {',
    '    return;',
    '  }',
    '  var uv = projNdc.xy * 0.5 + vec2f(0.5, 0.5);',
    '  if (uniform.uVideoFlipY > 0.5) {',
    '    uv.y = 1.0 - uv.y;',
    '  }',
    '  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {',
    '    return;',
    '  }',
    '  let edgeDist = min(uv, vec2f(1.0, 1.0) - uv);',
    '  let edgeMin = min(edgeDist.x, edgeDist.y);',
    '  let softMask = clamp(edgeMin / max(uniform.uProjectionSoftEdge, 1e-5), 0.0, 1.0);',
    '  let videoColor = textureSampleLevel(uProjectedVideo, uProjectedVideoSampler, uv, 0.0);',
    '  let amount = uniform.uProjectionOpacity * softMask * videoColor.a;',
    '  (*color).rgb = mix((*color).rgb, videoColor.rgb, amount);',
    '}'
  ].join('\n');
};

GsplatMp4Projector.prototype.update = function () {
  if (!this.sceneMaterial || !this.mainCameraEntity || !this.projectorEntity) {
    return;
  }

  if (this.videoElement && this.videoTexture && this.videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    this.videoTexture.setSource(this.videoElement);
    this.videoTexture.upload();
  }

  this.updateMatrices();
  this.updateUniforms();

  if (this.logDebug) {
    var now = performance.now();
    if (now - this.debugLastTick > 1000) {
      this.debugLastTick = now;
      console.log('[GsplatMp4Projector] tick', {
        readyState: this.videoElement ? this.videoElement.readyState : 0,
        currentTime: this.videoElement ? this.videoElement.currentTime : 0,
        enabledProjection: this.enabledProjection
      });
    }
  }
};

GsplatMp4Projector.prototype.updateMatrices = function () {
  var cameraComponent = this.mainCameraEntity.camera;
  if (!cameraComponent) {
    return;
  }

  var canvas = this.app.graphicsDevice.canvas;
  var aspect = Math.max(1e-6, canvas.clientWidth / Math.max(canvas.clientHeight, 1));

  this.mainProj.setPerspective(
    cameraComponent.fov,
    aspect,
    cameraComponent.nearClip,
    cameraComponent.farClip,
    false
  );
  this.mainView.copy(this.mainCameraEntity.getWorldTransform()).invert();
  this.mainViewProj.mul2(this.mainProj, this.mainView);
  this.mainInvViewProj.copy(this.mainViewProj).invert();

  this.projectorProj.setPerspective(
    this.projectorFov,
    this.projectorAspect,
    this.projectorNear,
    this.projectorFar,
    false
  );
  this.projectorView.copy(this.projectorEntity.getWorldTransform()).invert();
  this.projectorViewProj.mul2(this.projectorProj, this.projectorView);

  this.screenSizeUniform[0] = canvas.width;
  this.screenSizeUniform[1] = canvas.height;
};

GsplatMp4Projector.prototype.updateUniforms = function () {
  this.sceneMaterial.setParameter('uProjectedVideo', this.videoTexture);
  this.sceneMaterial.setParameter('uMainInvViewProj', this.mainInvViewProj.data);
  this.sceneMaterial.setParameter('uProjectorViewProj', this.projectorViewProj.data);
  this.sceneMaterial.setParameter('uScreenSize', this.screenSizeUniform);
  this.sceneMaterial.setParameter('uProjectionOpacity', this.opacity);
  this.sceneMaterial.setParameter('uProjectionSoftEdge', this.softEdge);
  this.sceneMaterial.setParameter('uProjectorEnabled', this.enabledProjection ? 1 : 0);
  this.sceneMaterial.setParameter('uVideoFlipY', this.flipY ? 1 : 0);
};

GsplatMp4Projector.prototype.destroyProjection = function () {
  if (this.sceneMaterial) {
    if (this.originalGlslVsChunk) {
      this.sceneMaterial.shaderChunks.glsl.set('gsplatModifyVS', this.originalGlslVsChunk);
    } else {
      this.sceneMaterial.shaderChunks.glsl.delete('gsplatModifyVS');
    }

    if (this.originalGlslChunk) {
      this.sceneMaterial.shaderChunks.glsl.set('gsplatModifyPS', this.originalGlslChunk);
    } else {
      this.sceneMaterial.shaderChunks.glsl.delete('gsplatModifyPS');
    }

    if (this.originalWgslVsChunk) {
      this.sceneMaterial.shaderChunks.wgsl.set('gsplatModifyVS', this.originalWgslVsChunk);
    } else {
      this.sceneMaterial.shaderChunks.wgsl.delete('gsplatModifyVS');
    }

    if (this.originalWgslChunk) {
      this.sceneMaterial.shaderChunks.wgsl.set('gsplatModifyPS', this.originalWgslChunk);
    } else {
      this.sceneMaterial.shaderChunks.wgsl.delete('gsplatModifyPS');
    }

    this.sceneMaterial.update();
  }

  if (this.videoTexture) {
    this.videoTexture.destroy();
    this.videoTexture = null;
  }

  if (this.videoElement) {
    this.videoElement.pause();
    this.videoElement.removeAttribute('src');
    this.videoElement.load();
    if (this.videoElement.parentNode) {
      this.videoElement.parentNode.removeChild(this.videoElement);
    }
    this.videoElement = null;
  }
};
