import * as pc from 'playcanvas';

export class GsplatPointPicker {
  constructor({
    app,
    cameraEntity,
    getSplatEntity,
    markerEntity = null,
    layerName = 'World',
    pickerScale = 1,
    logResult = true
  }) {
    this.app = app;
    this.cameraEntity = cameraEntity;
    this.getSplatEntity = typeof getSplatEntity === 'function' ? getSplatEntity : () => null;
    this.markerEntity = markerEntity;
    this.layerName = layerName;
    this.pickerScale = pickerScale;
    this.logResult = logResult;
    this.picker = null;
    this.layer = null;

    if (this.app?.scene?.gsplat) {
      this.app.scene.gsplat.enableIds = true;
    }

    if (this.app) {
      this.picker = new pc.Picker(this.app, 1, 1, true);
    }

    this.layer = this.app?.scene?.layers?.getLayerByName?.(this.layerName) ?? null;
  }

  destroy() {
    if (this.picker?.destroy) {
      this.picker.destroy();
    }

    this.picker = null;
    this.layer = null;
    this.app = null;
    this.cameraEntity = null;
    this.markerEntity = null;
    this.getSplatEntity = null;
  }

  async pick(screenX, screenY) {
    const app = this.app;
    const cameraEntity = this.cameraEntity;
    const cameraComponent = cameraEntity?.camera;
    const canvas = app?.graphicsDevice?.canvas;
    const scene = app?.scene;
    const picker = this.picker;

    if (!app || !cameraEntity || !cameraComponent || !canvas || !scene || !picker || !picker.getWorldPointAsync) {
      console.debug('[Pick] gsplat failed: missing dependencies');
      return null;
    }

    const scale = Number.isFinite(this.pickerScale) && this.pickerScale > 0
      ? this.pickerScale
      : 1;
    const width = Math.max(1, Math.floor(canvas.clientWidth * scale));
    const height = Math.max(1, Math.floor(canvas.clientHeight * scale));

    if (picker.resize) {
      picker.resize(width, height);
    }

    const activeLayer = scene.layers?.getLayerByName?.(this.layerName) ?? this.layer;
    this.layer = activeLayer ?? null;

    if (this.layer) {
      picker.prepare(cameraComponent, scene, [this.layer]);
    } else {
      console.debug(`[Pick] gsplat failed: layer not found (${this.layerName})`);
      picker.prepare(cameraComponent, scene);
    }

    const pickX = Math.floor(screenX * scale);
    const pickY = Math.floor(screenY * scale);

    try {
      const worldPoint = await picker.getWorldPointAsync(pickX, pickY);
      if (!worldPoint) {
        console.debug('[Pick] gsplat failed: getWorldPointAsync returned null');
        return null;
      }

      const splatEntity = this.getSplatEntity?.() ?? null;
      const localPoint = splatEntity?.worldToLocal
        ? splatEntity.worldToLocal(worldPoint.clone())
        : null;

      if (this.markerEntity?.setPosition) {
        this.markerEntity.setPosition(worldPoint);
        this.markerEntity.enabled = true;
      }

      const payload = {
        worldPoint: worldPoint.clone(),
        localPoint: localPoint ? localPoint.clone() : null,
        screen: {
          x: screenX,
          y: screenY
        }
      };

      if (this.logResult) {
        console.log(
          `[GsplatPointPicker] world point: x=${worldPoint.x.toFixed(3)}, y=${worldPoint.y.toFixed(3)}, z=${worldPoint.z.toFixed(3)}`
        );
      }

      app.fire('gsplat:pick', payload);
      return payload;
    } catch (error) {
      console.debug('[Pick] gsplat failed:', error);
      return null;
    }
  }
}
