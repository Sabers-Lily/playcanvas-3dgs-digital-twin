import * as pc from 'playcanvas';

const ROUTE_STATE_RUNNING = 'running';
const ROUTE_STATE_PAUSED = 'paused';
const ROUTE_STATE_FINISHED = 'finished';

function roundScreen(value) {
  return Math.round(value * 10) / 10;
}

function comparePointLists(left = [], right = []) {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    const leftPoint = left[index];
    const rightPoint = right[index];

    if (
      leftPoint.x !== rightPoint.x ||
      leftPoint.y !== rightPoint.y ||
      leftPoint.id !== rightPoint.id ||
      leftPoint.label !== rightPoint.label ||
      leftPoint.kind !== rightPoint.kind ||
      leftPoint.isCurrent !== rightPoint.isCurrent
    ) {
      return false;
    }
  }

  return true;
}

function compareSegments(left = [], right = []) {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    const leftSegment = left[index];
    const rightSegment = right[index];

    if (leftSegment.id !== rightSegment.id || leftSegment.points !== rightSegment.points) {
      return false;
    }
  }

  return true;
}

function compareRouteOverlays(left = [], right = []) {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    const leftRoute = left[index];
    const rightRoute = right[index];

    if (
      leftRoute.objectId !== rightRoute.objectId ||
      leftRoute.name !== rightRoute.name ||
      leftRoute.selected !== rightRoute.selected ||
      leftRoute.editing !== rightRoute.editing ||
      leftRoute.running !== rightRoute.running ||
      leftRoute.paused !== rightRoute.paused ||
      leftRoute.finished !== rightRoute.finished ||
      leftRoute.zIndex !== rightRoute.zIndex ||
      !compareSegments(leftRoute.segments, rightRoute.segments) ||
      !comparePointLists(leftRoute.waypoints, rightRoute.waypoints)
    ) {
      return false;
    }
  }

  return true;
}

export class RobotRouteOverlayManager {
  constructor(options) {
    this.cameraEntity = options.cameraEntity;
    this.canvas = options.canvas;
    this.viewportElement = options.viewportElement;
    this.sceneObjectManager = options.sceneObjectManager;
    this.selectionManager = options.selectionManager;

    this.routeOverlays = [];
    this.tempScreen = new pc.Vec3();
    this.tempWorld = new pc.Vec3();
    this.tempCameraPosition = new pc.Vec3();
    this.tempCameraForward = new pc.Vec3();
    this.tempCameraToPoint = new pc.Vec3();
    this.lastSelectedRouteId = null;

    console.log('[RobotRouteOverlayManager] initialized');
  }

  destroy() {
    this.routeOverlays = [];
  }

  getOverlayModels() {
    return this.routeOverlays.map((route) => ({
      ...route,
      segments: route.segments.map((segment) => ({ ...segment })),
      waypoints: route.waypoints.map((waypoint) => ({ ...waypoint }))
    }));
  }

  update() {
    const nextRoutes = this.buildOverlayModels();
    if (compareRouteOverlays(this.routeOverlays, nextRoutes)) {
      return false;
    }

    const previousCount = this.routeOverlays.length;
    this.routeOverlays = nextRoutes;

    if (previousCount !== nextRoutes.length) {
      console.log('[RobotRouteOverlayManager] route overlay count changed', {
        count: nextRoutes.length
      });
    }

    const selectedRoute = nextRoutes.find((route) => route.selected) ?? null;
    const nextSelectedRouteId = selectedRoute?.objectId ?? null;
    if (this.lastSelectedRouteId !== nextSelectedRouteId) {
      console.log('[RobotRouteOverlayManager] selected route changed', {
        objectId: nextSelectedRouteId
      });
      this.lastSelectedRouteId = nextSelectedRouteId;
    }

    return true;
  }

  buildOverlayModels() {
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
      .filter((sceneObject) => this.shouldDisplayRoute(sceneObject))
      .map((sceneObject) => this.buildRouteOverlay(sceneObject, {
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
          return left.selected ? 1 : -1;
        }

        if (left.editing !== right.editing) {
          return left.editing ? 1 : -1;
        }

        if (left.running !== right.running) {
          return left.running ? 1 : -1;
        }

        return left.name.localeCompare(right.name);
      })
      .map((route, index, routes) => ({
        ...route,
        zIndex: route.selected || route.editing ? routes.length + 20 : routes.length - index + 5
      }));
  }

  shouldDisplayRoute(sceneObject) {
    if (!sceneObject?.id || sceneObject.type !== 'robotDog' || sceneObject.visible === false) {
      return false;
    }

    return Array.isArray(sceneObject.metadata?.patrol?.routePoints) && sceneObject.metadata.patrol.routePoints.length > 0;
  }

  buildRouteOverlay(sceneObject, options) {
    const patrol = sceneObject.metadata?.patrol ?? {};
    const routePoints = Array.isArray(patrol.routePoints) ? patrol.routePoints : [];
    const projectedPoints = routePoints.map((point, index) => this.projectWaypoint(point, index, {
      ...options,
      pointCount: routePoints.length
    }));
    const visibleWaypoints = projectedPoints.filter((point) => point.visible);

    if (!visibleWaypoints.length) {
      return null;
    }

    const segments = [];
    let activeSegmentPoints = [];

    projectedPoints.forEach((point, index) => {
      if (point.visible) {
        activeSegmentPoints.push(point);
      }

      const shouldFlush = (
        !point.visible ||
        index === projectedPoints.length - 1
      );

      if (!shouldFlush) {
        return;
      }

      if (activeSegmentPoints.length >= 2) {
        const startId = activeSegmentPoints[0].id;
        const endId = activeSegmentPoints[activeSegmentPoints.length - 1].id;
        segments.push({
          id: `${sceneObject.id}-${startId}-${endId}`,
          points: activeSegmentPoints.map((segmentPoint) => `${segmentPoint.x},${segmentPoint.y}`).join(' ')
        });
      }

      if (!point.visible) {
        activeSegmentPoints = [];
      }
    });

    const selected = sceneObject.id === options.selectedId;
    const editing = Boolean(patrol.routeEditing);
    const running = patrol.state === ROUTE_STATE_RUNNING;
    const paused = patrol.state === ROUTE_STATE_PAUSED;
    const finished = patrol.state === ROUTE_STATE_FINISHED;
    const name = sceneObject.displayName ?? sceneObject.name ?? sceneObject.id;
    const currentTargetIndex = running || paused
      ? Math.min((patrol.currentSegmentIndex ?? 0) + 1, Math.max(routePoints.length - 1, 0))
      : -1;

    return {
      objectId: sceneObject.id,
      name,
      selected,
      editing,
      running,
      paused,
      finished,
      state: patrol.state ?? 'idle',
      segments,
      waypoints: visibleWaypoints.map((point) => ({
        id: point.id,
        index: point.index,
        label: String(point.index + 1),
        x: point.x,
        y: point.y,
        kind: point.kind,
        isCurrent: point.index === currentTargetIndex
      }))
    };
  }

  projectWaypoint(point, index, options) {
    const position = Array.isArray(point?.position) ? point.position : [0, 0, 0];
    this.tempWorld.set(
      Number(position[0] ?? 0),
      Number(position[1] ?? 0),
      Number(position[2] ?? 0)
    );

    this.tempCameraToPoint.sub2(this.tempWorld, this.tempCameraPosition);
    if (this.tempCameraToPoint.dot(this.tempCameraForward) <= 0) {
      return {
        id: point?.id ?? `waypoint-${index + 1}`,
        index,
        visible: false
      };
    }

    options.cameraComponent.worldToScreen(this.tempWorld, this.tempScreen);
    const localX = this.tempScreen.x * options.scaleX;
    const localY = this.tempScreen.y * options.scaleY;
    const visible = (
      localX >= -48 &&
      localX <= options.viewportWidth + 48 &&
      localY >= -48 &&
      localY <= options.viewportHeight + 48
    );

    return {
      id: point?.id ?? `waypoint-${index + 1}`,
      index,
      visible,
      kind: index === 0 ? 'start' : (index === Math.max(0, options.pointCount - 1) ? 'end' : 'mid'),
      x: roundScreen(localX),
      y: roundScreen(localY)
    };
  }
}
