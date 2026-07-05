import * as pc from 'playcanvas';

function toVec3(pointLike) {
  if (pointLike instanceof pc.Vec3) {
    return pointLike.clone();
  }

  const position = Array.isArray(pointLike?.position) ? pointLike.position : pointLike;
  return new pc.Vec3(
    Number(position?.[0] ?? position?.x ?? 0),
    Number(position?.[1] ?? position?.y ?? 0),
    Number(position?.[2] ?? position?.z ?? 0)
  );
}

function createQuadUvs(flipY = false) {
  return flipY
    ? [
      0, 0,
      1, 0,
      1, 1,
      0, 1
    ]
    : [
      0, 1,
      1, 1,
      1, 0,
      0, 0
    ];
}

function computeQuadNormal(points) {
  const edgeA = points[1].clone().sub(points[0]);
  const edgeB = points[3].clone().sub(points[0]);
  const normal = edgeA.cross(edgeB);
  if (normal.lengthSq() <= 1e-8) {
    return new pc.Vec3(0, 1, 0);
  }

  return normal.normalize();
}

export class FourPointVideoProjector {
  constructor({ app, parent = null, layerIds = null, logPrefix = '[FourPointVideoProjector]' }) {
    this.app = app;
    this.parent = parent ?? app?.root ?? null;
    this.layerIds = Array.isArray(layerIds) && layerIds.length ? [...layerIds] : null;
    this.logPrefix = logPrefix;
    this.entity = null;
    this.mesh = null;
    this.meshInstance = null;
    this.material = null;
    this.videoTexture = null;
    this.videoElement = null;
    this.cameraId = null;
    this._hasLoggedTextureUpload = false;
  }

  apply({
    cameraId,
    anchors,
    videoElement,
    opacity = 0.85,
    flipY = false
  }) {
    if (!this.app || !this.parent || !Array.isArray(anchors) || anchors.length !== 4 || !videoElement) {
      return false;
    }

    this.clear();

    const points = anchors.map((anchor) => toVec3(anchor));
    const quadNormal = computeQuadNormal(points);
    const liftedPoints = points.map((point) => point.clone().add(quadNormal.clone().mulScalar(0.01)));
    const positions = [];
    const normals = [];
    liftedPoints.forEach((point) => {
      positions.push(point.x, point.y, point.z);
      normals.push(quadNormal.x, quadNormal.y, quadNormal.z);
    });

    const mesh = new pc.Mesh(this.app.graphicsDevice);
    mesh.setPositions(positions);
    mesh.setNormals(normals);
    mesh.setUvs(0, createQuadUvs(flipY));
    mesh.setIndices([
      0, 1, 2,
      0, 2, 3
    ]);
    mesh.update(pc.PRIMITIVE_TRIANGLES);

    const texture = new pc.Texture(this.app.graphicsDevice, {
      name: `FourPointVideoTexture_${cameraId ?? 'camera'}`,
      format: pc.PIXELFORMAT_R8_G8_B8_A8,
      mipmaps: false,
      minFilter: pc.FILTER_LINEAR,
      magFilter: pc.FILTER_LINEAR,
      addressU: pc.ADDRESS_CLAMP_TO_EDGE,
      addressV: pc.ADDRESS_CLAMP_TO_EDGE
    });
    texture.setSource(videoElement);

    const material = new pc.StandardMaterial();
    material.diffuse = new pc.Color(1, 1, 1);
    material.emissive = new pc.Color(1, 1, 1);
    material.useLighting = false;
    material.diffuseMap = texture;
    material.emissiveMap = texture;
    material.emissiveIntensity = 1;
    material.opacity = Math.max(0, Math.min(1, Number(opacity) || 0));
    material.blendType = pc.BLEND_NORMAL;
    material.cull = pc.CULLFACE_NONE;
    material.depthTest = false;
    material.depthWrite = false;
    material.update();

    const meshInstance = new pc.MeshInstance(mesh, material);
    const entity = new pc.Entity(`__quad_projection_video_${cameraId ?? 'camera'}`);
    entity.addComponent('render', {
      meshInstances: [meshInstance],
      castShadows: false,
      receiveShadows: false
    });
    if (this.layerIds && entity.render) {
      entity.render.layers = [...this.layerIds];
    }
    this.parent.addChild(entity);

    this.cameraId = cameraId ?? null;
    this.entity = entity;
    this.mesh = mesh;
    this.meshInstance = meshInstance;
    this.material = material;
    this.videoTexture = texture;
    this.videoElement = videoElement;
    this._hasLoggedTextureUpload = false;

    console.log(`${this.logPrefix} create mesh`, {
      cameraId: this.cameraId,
      anchors: points.map((point) => [point.x, point.y, point.z]),
      normal: [quadNormal.x, quadNormal.y, quadNormal.z]
    });
    console.log(`${this.logPrefix} bind shared video texture`, {
      cameraId: this.cameraId
    });
    return true;
  }

  setOpacity(opacity) {
    if (!this.material) {
      return false;
    }

    this.material.opacity = Math.max(0, Math.min(1, Number(opacity) || 0));
    this.material.blendType = this.material.opacity < 1 ? pc.BLEND_NORMAL : pc.BLEND_NONE;
    this.material.update();
    return true;
  }

  update() {
    if (!this.videoTexture || !this.videoElement) {
      return;
    }

    if (this.videoElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return;
    }

    if (this.videoElement.paused || this.videoElement.ended) {
      return;
    }

    this.videoTexture.upload();
    if (!this._hasLoggedTextureUpload) {
      this._hasLoggedTextureUpload = true;
      console.log(`${this.logPrefix} texture upload started`, {
        cameraId: this.cameraId,
        currentTime: this.videoElement.currentTime ?? 0
      });
    }
  }

  clear() {
    if (this.entity) {
      console.log(`${this.logPrefix} clear`, {
        cameraId: this.cameraId
      });
      this.entity.destroy();
    }

    this.entity = null;
    this.mesh = null;
    this.meshInstance = null;

    if (this.material) {
      this.material.destroy();
    }
    this.material = null;

    if (this.videoTexture) {
      this.videoTexture.destroy();
    }
    this.videoTexture = null;
    this.videoElement = null;
    this.cameraId = null;
    this._hasLoggedTextureUpload = false;
  }

  dispose() {
    this.clear();
    this.parent = null;
    this.app = null;
  }
}
