import * as pc from 'playcanvas';

const MARKER_DEFINITIONS = {
  cameraDevice: { kind: 'camera', icon: '摄' },
  buildingEnvelope: { kind: 'annotation', icon: '标' },
  annotation: { kind: 'annotation', icon: '标' },
  empty: { kind: 'empty', icon: '空' },
  device: { kind: 'device', icon: '设' },
  robot: { kind: 'robot', icon: '机' },
  robotDog: { kind: 'robot', icon: '机' },
  hotspot: { kind: 'hotspot', icon: '热' },
  routePoint: { kind: 'route', icon: '路' },
  model: { kind: 'model', icon: '模' },
  glb: { kind: 'model', icon: '模' }
};

const HIDDEN_MARKER_TYPES = new Set(['gsplat', 'bim-proxy', 'marker', 'debug', 'camera']);

function roundScreen(value) {
  return Math.round(value * 10) / 10;
}

function cloneWorldPosition(vec3) {
  return [vec3.x, vec3.y, vec3.z];
}

function getMarkerDefinition(type) {
  return MARKER_DEFINITIONS[type] ?? {
    kind: 'default',
    icon: '物'
  };
}

function compareMarkers(left, right) {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    const leftMarker = left[index];
    const rightMarker = right[index];

    if (
      leftMarker.objectId !== rightMarker.objectId ||
      leftMarker.name !== rightMarker.name ||
      leftMarker.type !== rightMarker.type ||
      leftMarker.selected !== rightMarker.selected ||
      leftMarker.screenX !== rightMarker.screenX ||
      leftMarker.screenY !== rightMarker.screenY ||
      leftMarker.zIndex !== rightMarker.zIndex ||
      leftMarker.status !== rightMarker.status
    ) {
      return false;
    }
  }

  return true;
}

export class ObjectMarkerManager {
  constructor(options) {
    this.app = options.app;
    this.cameraEntity = options.cameraEntity;
    this.canvas = options.canvas;
    this.viewportElement = options.viewportElement;
    this.sceneObjectManager = options.sceneObjectManager;
    this.selectionManager = options.selectionManager;
    this.onSelectObject = options.onSelectObject;

    this.markerViewModels = [];
    this.listeners = new Set();
    this.tempScreen = new pc.Vec3();
    this.tempWorld = new pc.Vec3();
    this.tempCameraToObject = new pc.Vec3();
    this.tempCameraPosition = new pc.Vec3();
    this.tempCameraForward = new pc.Vec3();

    console.log('[ObjectMarkerManager] initialized', {
      markerTypes: ['camera', 'annotation', 'empty', 'device', 'robot', 'model', 'hotspot', 'route']
    });
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    const snapshot = this.getMarkerViewModels();
    this.listeners.forEach((listener) => listener(snapshot));
  }

  getMarkerViewModels() {
    return this.markerViewModels.map((marker) => ({
      ...marker,
      worldPosition: [...marker.worldPosition]
    }));
  }

  onMarkerClick(objectId) {
    const sceneObject = this.sceneObjectManager.getObject(objectId);
    if (!sceneObject) {
      return false;
    }

    console.log('[ObjectMarkerManager] marker clicked', {
      objectId,
      type: sceneObject.type,
      name: sceneObject.displayName ?? sceneObject.name
    });

    return this.onSelectObject?.(objectId) ?? false;
  }

  update() {
    const nextMarkers = this.buildMarkerViewModels();
    if (compareMarkers(this.markerViewModels, nextMarkers)) {
      return false;
    }

    const previousCount = this.markerViewModels.length;
    this.markerViewModels = nextMarkers;

    if (previousCount !== nextMarkers.length) {
      console.log('[ObjectMarkerManager] marker count changed', {
        count: nextMarkers.length
      });
    }

    this.notify();
    return true;
  }

  destroy() {
    this.listeners.clear();
    this.markerViewModels = [];
  }

  buildMarkerViewModels() {
    const cameraComponent = this.cameraEntity?.camera ?? null;
    const canvasWidth = this.canvas?.width ?? 0;
    const canvasHeight = this.canvas?.height ?? 0;
    const viewportWidth = this.viewportElement?.clientWidth ?? 0;
    const viewportHeight = this.viewportElement?.clientHeight ?? 0;

    if (!cameraComponent || canvasWidth <= 0 || canvasHeight <= 0 || viewportWidth <= 0 || viewportHeight <= 0) {
      return [];
    }

    const selectedId = this.selectionManager.getSelectedId();
    const scaleX = viewportWidth / canvasWidth;
    const scaleY = viewportHeight / canvasHeight;

    this.tempCameraPosition.copy(this.cameraEntity.getPosition());
    this.tempCameraForward.copy(this.cameraEntity.forward);

    return this.sceneObjectManager.getObjects()
      .filter((sceneObject) => this.shouldDisplayMarker(sceneObject))
      .map((sceneObject) => this.buildMarkerForObject(sceneObject, {
        cameraComponent,
        selectedId,
        scaleX,
        scaleY,
        viewportWidth,
        viewportHeight
      }))
      .filter(Boolean)
      .sort((left, right) => {
        if (left.selected !== right.selected) {
          return left.selected ? -1 : 1;
        }

        if (left.depth !== right.depth) {
          return right.depth - left.depth;
        }

        return left.screenY - right.screenY;
      })
      .map((marker, index, allMarkers) => ({
        ...marker,
        zIndex: marker.selected ? allMarkers.length + 20 : allMarkers.length - index
      }));
  }

  shouldDisplayMarker(sceneObject) {
    if (!sceneObject?.id || !sceneObject.visible) {
      return false;
    }

    return !HIDDEN_MARKER_TYPES.has(sceneObject.type);
  }

  buildMarkerForObject(sceneObject, options) {
    const worldPosition = this.getObjectWorldPosition(sceneObject);
    if (!worldPosition) {
      return null;
    }

    this.tempCameraToObject.sub2(worldPosition, this.tempCameraPosition);
    if (this.tempCameraToObject.dot(this.tempCameraForward) <= 0) {
      return null;
    }

    options.cameraComponent.worldToScreen(worldPosition, this.tempScreen);

    const localX = this.tempScreen.x * options.scaleX;
    const localY = this.tempScreen.y * options.scaleY;
    const isInsideViewport = (
      localX >= -24 &&
      localX <= options.viewportWidth + 24 &&
      localY >= -24 &&
      localY <= options.viewportHeight + 24
    );

    if (!isInsideViewport) {
      return null;
    }

    const definition = getMarkerDefinition(sceneObject.type);
    const name = sceneObject.displayName ?? sceneObject.name ?? sceneObject.id;
    const typeLabel = sceneObject.typeLabel ?? sceneObject.type;
    const selected = sceneObject.id === options.selectedId;

    return {
      objectId: sceneObject.id,
      type: sceneObject.type,
      typeLabel,
      kind: definition.kind,
      icon: definition.icon,
      name,
      selected,
      active: sceneObject.status !== 'error',
      status: sceneObject.status ?? 'active',
      visible: true,
      screenX: roundScreen(localX),
      screenY: roundScreen(localY),
      depth: roundScreen(this.tempScreen.z),
      worldPosition: cloneWorldPosition(worldPosition),
      tooltip: `名称：${name}\n类型：${typeLabel}\n状态：${sceneObject.status ?? 'active'}\n来源：${sceneObject.metadata?.source ?? 'scene'}`
    };
  }

  getObjectWorldPosition(sceneObject) {
    if (sceneObject.entity && !sceneObject.entity.destroyed) {
      return sceneObject.entity.getPosition();
    }

    if (sceneObject.type === 'buildingEnvelope' && Array.isArray(sceneObject.metadata?.envelope?.points) && sceneObject.metadata.envelope.points.length > 0) {
      const points = sceneObject.metadata.envelope.points;
      let x = 0;
      let y = 0;
      let z = 0;

      points.forEach((point) => {
        const position = Array.isArray(point?.position) ? point.position : point;
        x += Number(position?.[0] ?? 0);
        y += Number(position?.[1] ?? 0);
        z += Number(position?.[2] ?? 0);
      });

      const divisor = points.length || 1;
      this.tempWorld.set(x / divisor, y / divisor, z / divisor);
      return this.tempWorld;
    }

    const position = sceneObject.transform?.position;
    if (!Array.isArray(position)) {
      return null;
    }

    this.tempWorld.set(
      Number(position[0] ?? 0),
      Number(position[1] ?? 0),
      Number(position[2] ?? 0)
    );
    return this.tempWorld;
  }
}
