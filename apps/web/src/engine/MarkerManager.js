import * as pc from 'playcanvas';

export class MarkerManager {
  constructor({ app }) {
    this.app = app;
    this.marker = null;
    this.material = new pc.StandardMaterial();
    this.material.diffuse = new pc.Color(1, 0.35, 0.2);
    this.material.emissive = new pc.Color(1, 0.2, 0.1);
    this.material.update();
  }

  placeMarker(point) {
    this.clearMarker();

    const marker = new pc.Entity('Pick Marker');
    marker.addComponent('render', {
      type: 'sphere',
      material: this.material,
      castShadows: false,
      receiveShadows: false
    });

    marker.setLocalScale(0.4, 0.4, 0.4);
    marker.setPosition(point.x, point.y + 0.2, point.z);
    this.app.root.addChild(marker);
    this.marker = marker;
    return marker;
  }

  clearMarker() {
    if (this.marker) {
      this.marker.destroy();
      this.marker = null;
    }
  }
}
