import * as pc from 'playcanvas';

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

function projectWorldPoint(cameraEntity, worldPoint) {
  const screenPoint = cameraEntity.camera.worldToScreen(worldPoint);
  if (!Number.isFinite(screenPoint.x) || !Number.isFinite(screenPoint.y) || screenPoint.z < 0 || screenPoint.z > 1) {
    return null;
  }

  return {
    x: screenPoint.x,
    y: screenPoint.y,
    z: screenPoint.z
  };
}

export class TransformGizmo {
  constructor({ app, cameraEntity }) {
    this.app = app;
    this.cameraEntity = cameraEntity;
    this.selectedObject = null;

    this.root = new pc.Entity('__helper_transform_gizmo');
    this.root.enabled = false;

    const shaftMaterial = new pc.StandardMaterial();
    shaftMaterial.diffuse = new pc.Color(0.98, 0.78, 0.2);
    shaftMaterial.emissive = new pc.Color(0.45, 0.28, 0.04);
    shaftMaterial.depthTest = false;
    shaftMaterial.update();

    const tipMaterial = new pc.StandardMaterial();
    tipMaterial.diffuse = new pc.Color(1, 0.52, 0.2);
    tipMaterial.emissive = new pc.Color(0.55, 0.18, 0.08);
    tipMaterial.depthTest = false;
    tipMaterial.update();

    this.shaft = new pc.Entity('__helper_transform_gizmo_y_axis');
    this.shaft.addComponent('render', {
      type: 'cylinder',
      castShadows: false,
      receiveShadows: false,
      material: shaftMaterial
    });
    this.shaft.setLocalPosition(0, 0.6, 0);
    this.shaft.setLocalScale(0.06, 0.6, 0.06);

    this.tip = new pc.Entity('__helper_transform_gizmo_y_tip');
    this.tip.addComponent('render', {
      type: 'cone',
      castShadows: false,
      receiveShadows: false,
      material: tipMaterial
    });
    this.tip.setLocalPosition(0, 1.35, 0);
    this.tip.setLocalScale(0.18, 0.28, 0.18);

    this.root.addChild(this.shaft);
    this.root.addChild(this.tip);
    this.app.root.addChild(this.root);
  }

  destroy() {
    if (this.root && !this.root.destroyed) {
      this.root.destroy();
    }
  }

  showFor(sceneObject) {
    if (!sceneObject?.entity) {
      this.hide();
      return;
    }

    const didChangeObject = this.selectedObject?.id !== sceneObject.id;
    this.selectedObject = sceneObject;
    this.root.enabled = true;
    this.update();
    if (didChangeObject) {
      console.log(`[TransformGizmo] show ${sceneObject.id}`);
    }
  }

  hide() {
    this.selectedObject = null;
    this.root.enabled = false;
  }

  update() {
    if (!this.root.enabled || !this.selectedObject?.entity) {
      return;
    }

    const objectPosition = this.selectedObject.entity.getPosition();
    const cameraPosition = this.cameraEntity.getPosition();
    const distance = cameraPosition.distance(objectPosition);
    const scale = Math.max(0.6, distance * 0.04);

    this.root.setPosition(objectPosition);
    this.root.setLocalScale(scale, scale, scale);
  }

  pick(screenX, screenY) {
    if (!this.root.enabled || !this.selectedObject?.entity) {
      return 'none';
    }

    const origin = this.selectedObject.entity.getPosition();
    const tip = origin.clone().add(new pc.Vec3(0, this.root.getLocalScale().y * 1.5, 0));
    const screenOrigin = projectWorldPoint(this.cameraEntity, origin);
    const screenTip = projectWorldPoint(this.cameraEntity, tip);

    if (!screenOrigin || !screenTip) {
      return 'none';
    }

    const point = { x: screenX, y: screenY };
    const thresholdSq = 18 * 18;
    const distanceSq = getDistanceToSegmentSquared(point, screenOrigin, screenTip);
    if (distanceSq > thresholdSq) {
      return 'none';
    }

    console.log('[TransformGizmo] pick y-axis');
    return 'y-axis';
  }
}
