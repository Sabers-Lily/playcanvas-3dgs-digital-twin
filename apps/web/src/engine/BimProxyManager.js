import * as pc from 'playcanvas';

const BIM_FILE_NAME = '\u5357\u5e7f\u573a.glb';
const BIM_ENTITY_NAME = 'BIM Proxy - \u5357\u5e7f\u573a';
const DEFAULT_TRANSFORM = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1]
};

function cloneTransform(transform) {
  return {
    position: [...transform.position],
    rotation: [...transform.rotation],
    scale: [...transform.scale]
  };
}

function createDebugMaterial(color, opacity) {
  const material = new pc.StandardMaterial();
  material.diffuse = color;
  material.emissive = color.clone().mulScalar(0.2);
  material.blendType = pc.BLEND_NORMAL;
  material.opacity = opacity;
  material.depthWrite = false;
  material.cull = pc.CULLFACE_NONE;
  material.update();
  return material;
}

export class BimProxyManager {
  constructor({ app }) {
    this.app = app;

    this.fallbackProxy = null;
    this.bimAsset = null;
    this.bimRootEntity = null;
    this.bimLoaded = false;
    this.visible = true;
    this.debugVisible = false;
    this.opacity = 1;
    this.transform = cloneTransform(DEFAULT_TRANSFORM);

    this._fallbackSize = 5000;
    this._fallbackMaterial = createDebugMaterial(new pc.Color(0.15, 0.75, 1), 0.18);
    this._debugMaterial = createDebugMaterial(new pc.Color(1, 0.6, 0.15), 0.35);
    this._originalMaterials = new Map();
  }

  createFallbackGroundProxy() {
    if (this.fallbackProxy) {
      return this.fallbackProxy;
    }

    const entity = new pc.Entity('DebugGroundProxy');
    entity.addComponent('render', {
      type: 'plane',
      material: this._fallbackMaterial,
      castShadows: false,
      receiveShadows: false
    });

    entity.setLocalScale(this._fallbackSize, 1, this._fallbackSize);
    entity.setLocalPosition(0, 0, 0);
    entity.enabled = this.debugVisible;

    this.app.root.addChild(entity);
    this.fallbackProxy = entity;
    return entity;
  }

  async load(url) {
    if (this.bimLoaded && this.bimRootEntity) {
      return this.bimRootEntity;
    }

    return new Promise((resolve, reject) => {
      const asset = new pc.Asset(BIM_FILE_NAME, 'container', {
        url,
        filename: BIM_FILE_NAME
      });

      this.bimAsset = asset;
      this.app.assets.add(asset);

      asset.once('load', () => {
        try {
          const entity = asset.resource.instantiateRenderEntity({
            castShadows: false,
            receiveShadows: false
          });

          entity.name = BIM_ENTITY_NAME;
          this.app.root.addChild(entity);

          this.bimRootEntity = entity;
          this.bimLoaded = true;
          this.setVisible(true);
          this.setDebugVisible(false);
          this.applyCurrentTransform();
          resolve(entity);
        } catch (error) {
          reject(error);
        }
      });

      asset.once('error', (err) => {
        if (this.app.assets.get(asset.id)) {
          this.app.assets.remove(asset);
        }

        this.bimAsset = null;
        reject(err);
      });

      this.app.assets.load(asset);
    });
  }

  applyCurrentTransform() {
    return this.setTransform(this.transform);
  }

  setVisible(visible) {
    this.visible = Boolean(visible);

    if (this.bimRootEntity) {
      this.bimRootEntity.enabled = this.visible;
    }

    return this.visible;
  }

  toggleVisible() {
    this.setVisible(!this.visible);
    return this.visible;
  }

  setDebugVisible(visible) {
    this.debugVisible = Boolean(visible);

    if (this.fallbackProxy) {
      this.fallbackProxy.enabled = this.debugVisible;
    }

    if (!this.bimRootEntity) {
      return false;
    }

    if (this.debugVisible) {
      this.setVisible(true);
    }

    const renderComponents = this.bimRootEntity.findComponents('render');
    renderComponents.forEach((renderComponent) => {
      renderComponent.meshInstances.forEach((meshInstance) => {
        if (!this._originalMaterials.has(meshInstance)) {
          this._originalMaterials.set(meshInstance, meshInstance.material);
        }

        meshInstance.material = this.debugVisible
          ? this._debugMaterial
          : this._originalMaterials.get(meshInstance);
      });
    });

    return true;
  }

  toggleDebugVisible() {
    this.setDebugVisible(!this.debugVisible);
    return this.debugVisible;
  }

  setOpacity(opacity) {
    this.opacity = opacity;

    if (!this.bimRootEntity || this.debugVisible) {
      return false;
    }

    const renderComponents = this.bimRootEntity.findComponents('render');
    renderComponents.forEach((renderComponent) => {
      renderComponent.meshInstances.forEach((meshInstance) => {
        const material = meshInstance.material;
        material.blendType = opacity < 1 ? pc.BLEND_NORMAL : pc.BLEND_NONE;
        material.opacity = opacity;
        material.depthWrite = opacity >= 1;
        material.update();
      });
    });

    return true;
  }

  setTransform({ position, rotation, scale }) {
    if (position) {
      this.transform.position = [...position];
    }

    if (rotation) {
      this.transform.rotation = [...rotation];
    }

    if (scale) {
      this.transform.scale = [...scale];
    }

    const entity = this.bimRootEntity;
    if (!entity) {
      return false;
    }

    entity.setPosition(
      this.transform.position[0],
      this.transform.position[1],
      this.transform.position[2]
    );
    entity.setEulerAngles(
      this.transform.rotation[0],
      this.transform.rotation[1],
      this.transform.rotation[2]
    );
    entity.setLocalScale(
      this.transform.scale[0],
      this.transform.scale[1],
      this.transform.scale[2]
    );

    return true;
  }

  getTransform() {
    return cloneTransform(this.transform);
  }

  resetTransform() {
    this.transform = cloneTransform(DEFAULT_TRANSFORM);

    if (!this.bimRootEntity) {
      return false;
    }

    this.applyCurrentTransform();
    return true;
  }

  getRootEntity() {
    return this.bimRootEntity;
  }

  isLoaded() {
    return this.bimLoaded;
  }

  unload() {
    if (this.bimRootEntity) {
      this.bimRootEntity.destroy();
      this.bimRootEntity = null;
    }

    if (this.bimAsset) {
      this.bimAsset.off();
      this.bimAsset.unload();
      if (this.app.assets.get(this.bimAsset.id)) {
        this.app.assets.remove(this.bimAsset);
      }
      this.bimAsset = null;
    }

    this._originalMaterials.clear();
    this.bimLoaded = false;
    this.visible = true;
    this.debugVisible = false;
    return true;
  }

  intersectRay(origin, direction) {
    if (this.bimRootEntity) {
      const hit = this._intersectBimBounds(origin, direction);
      if (hit) {
        return hit;
      }
    }

    return this._intersectGroundPlane(origin, direction);
  }

  _intersectBimBounds(origin, direction) {
    const renderComponents = this.bimRootEntity.findComponents('render');
    let closest = null;

    renderComponents.forEach((renderComponent) => {
      renderComponent.meshInstances.forEach((meshInstance) => {
        const point = this._intersectAabb(origin, direction, meshInstance.aabb);
        if (!point) {
          return;
        }

        const distance = point.distance(origin);
        if (!closest || distance < closest.distance) {
          closest = {
            point,
            distance,
            entityName: meshInstance.node?.name || renderComponent.entity.name,
            source: 'bim-bounds'
          };
        }
      });
    });

    return closest;
  }

  _intersectGroundPlane(origin, direction) {
    const epsilon = 1e-6;
    if (Math.abs(direction.y) < epsilon) {
      return null;
    }

    const t = -origin.y / direction.y;
    if (t < 0) {
      return null;
    }

    const point = origin.clone().add(direction.clone().mulScalar(t));
    const halfSize = this._fallbackSize * 0.5;

    if (Math.abs(point.x) > halfSize || Math.abs(point.z) > halfSize) {
      return null;
    }

    return {
      point,
      entityName: 'DebugGroundProxy',
      source: 'fallback-plane'
    };
  }

  _intersectAabb(origin, direction, aabb) {
    const min = aabb.getMin();
    const max = aabb.getMax();

    let tMin = -Infinity;
    let tMax = Infinity;

    for (const axis of ['x', 'y', 'z']) {
      const dir = direction[axis];
      const start = origin[axis];

      if (Math.abs(dir) < 1e-6) {
        if (start < min[axis] || start > max[axis]) {
          return null;
        }
        continue;
      }

      let t1 = (min[axis] - start) / dir;
      let t2 = (max[axis] - start) / dir;

      if (t1 > t2) {
        const temp = t1;
        t1 = t2;
        t2 = temp;
      }

      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);

      if (tMax < tMin) {
        return null;
      }
    }

    const t = tMin >= 0 ? tMin : tMax;
    if (t < 0) {
      return null;
    }

    return origin.clone().add(direction.clone().mulScalar(t));
  }
}
