import * as pc from 'playcanvas';

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

    this._fallbackSize = 5000;
    this._fallbackMaterial = createDebugMaterial(new pc.Color(0.15, 0.75, 1), 0.18);
    this._debugMaterial = createDebugMaterial(new pc.Color(1, 0.6, 0.15), 0.2);
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

  async load(url = encodeURI('/assets/南广场.glb')) {
    if (this.bimLoaded && this.bimRootEntity) {
      return this.bimRootEntity;
    }

    return new Promise((resolve, reject) => {
      const asset = new pc.Asset('南广场.glb', 'container', {
        url,
        filename: '南广场.glb'
      });

      this.bimAsset = asset;
      this.app.assets.add(asset);

      asset.once('load', () => {
        try {
          const entity = asset.resource.instantiateRenderEntity({
            castShadows: false,
            receiveShadows: false
          });

          entity.name = 'BIM Proxy - 南广场';
          this.app.root.addChild(entity);

          this.bimRootEntity = entity;
          this.bimLoaded = true;
          this.setTransform({
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1]
          });
          this.setVisible(true);
          this.setDebugVisible(false);
          this.setOpacity(1);
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

  setVisible(visible) {
    this.visible = Boolean(visible);

    if (this.bimRootEntity) {
      this.bimRootEntity.enabled = this.visible;
    }
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
      return;
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
  }

  toggleDebugVisible() {
    this.setDebugVisible(!this.debugVisible);
    return this.debugVisible;
  }

  setOpacity(opacity) {
    this.opacity = opacity;

    if (!this.bimRootEntity || this.debugVisible) {
      return;
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
  }

  setTransform({ position, rotation, scale }) {
    const entity = this.bimRootEntity;
    if (!entity) {
      return;
    }

    if (position) {
      entity.setLocalPosition(position[0], position[1], position[2]);
    }

    if (rotation) {
      entity.setLocalEulerAngles(rotation[0], rotation[1], rotation[2]);
    }

    if (scale) {
      entity.setLocalScale(scale[0], scale[1], scale[2]);
    }
  }

  getRootEntity() {
    return this.bimRootEntity;
  }

  getPickableEntities() {
    if (this.bimRootEntity) {
      return [this.bimRootEntity];
    }

    if (this.fallbackProxy) {
      return [this.fallbackProxy];
    }

    return [];
  }

  isLoaded() {
    return this.bimLoaded;
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
