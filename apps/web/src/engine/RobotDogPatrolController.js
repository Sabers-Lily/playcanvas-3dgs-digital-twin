import * as pc from 'playcanvas';

const ROUTE_STATE_IDLE = 'idle';
const ROUTE_STATE_EDITING = 'editing';
const ROUTE_STATE_READY = 'ready';
const ROUTE_STATE_RUNNING = 'running';
const ROUTE_STATE_PAUSED = 'paused';
const ROUTE_STATE_FINISHED = 'finished';

const DEFAULT_PATROL = Object.freeze({
  routeEditing: false,
  routePoints: [],
  routeClosed: false,
  speed: 2,
  loop: false,
  state: ROUTE_STATE_IDLE,
  currentSegmentIndex: 0,
  progress: 0,
  modelYawOffset: 0
});

function clonePatrol(patrol = {}) {
  return {
    ...DEFAULT_PATROL,
    ...patrol,
    routePoints: Array.isArray(patrol.routePoints)
      ? patrol.routePoints.map((point, index) => ({
          id: point.id ?? `waypoint-${index + 1}`,
          index: point.index ?? index,
          position: Array.isArray(point.position) ? [...point.position] : [0, 0, 0]
        }))
      : []
  };
}

function toVec3(position) {
  return new pc.Vec3(position[0] ?? 0, position[1] ?? 0, position[2] ?? 0);
}

function cloneTransform(transform = {}) {
  return {
    position: [...(transform.position ?? [0, 0, 0])],
    rotation: [...(transform.rotation ?? [0, 0, 0])],
    scale: [...(transform.scale ?? [1, 1, 1])]
  };
}

function formatWaypoint(point) {
  return `x=${point.x.toFixed(2)}, y=${point.y.toFixed(2)}, z=${point.z.toFixed(2)}`;
}

export class RobotDogPatrolController {
  constructor({
    app,
    sceneObjectManager,
    selectionManager,
    onLog,
    onStateChange
  }) {
    this.app = app;
    this.sceneObjectManager = sceneObjectManager;
    this.selectionManager = selectionManager;
    this.onLog = onLog ?? (() => {});
    this.onStateChange = onStateChange ?? (() => {});

    this.helperRoot = new pc.Entity('RobotDogPatrolHelpers');
    this.app.root.addChild(this.helperRoot);

    this.waypointMaterial = new pc.StandardMaterial();
    this.waypointMaterial.diffuse = new pc.Color(1, 0.78, 0.24);
    this.waypointMaterial.emissive = new pc.Color(0.75, 0.45, 0.08);
    this.waypointMaterial.update();

    this.lineMaterial = new pc.StandardMaterial();
    this.lineMaterial.diffuse = new pc.Color(0.16, 0.82, 0.76);
    this.lineMaterial.emissive = new pc.Color(0.06, 0.3, 0.28);
    this.lineMaterial.update();

    this.helpers = new Map();
    this.editingRobotDogId = null;
  }

  destroy() {
    this.helpers.forEach((helper) => {
      helper.root.destroy();
    });
    this.helpers.clear();
    this.helperRoot.destroy();
  }

  isRobotDog(object) {
    return Boolean(object && object.type === 'robotDog');
  }

  getEditingRobotDogId() {
    return this.editingRobotDogId;
  }

  ensureRobotDogPatrol(robotDogId) {
    const robotDog = this.sceneObjectManager.getObject(robotDogId);
    if (!this.isRobotDog(robotDog)) {
      return null;
    }

    const patrol = clonePatrol(robotDog.metadata?.patrol);
    if (!robotDog.metadata?.patrol) {
      this.updatePatrol(robotDogId, patrol, { emitLog: false });
      return this.sceneObjectManager.getObject(robotDogId)?.metadata?.patrol ?? patrol;
    }

    return patrol;
  }

  getPatrolState(robotDogId) {
    return this.ensureRobotDogPatrol(robotDogId);
  }

  updatePatrol(robotDogId, patrol, options = {}) {
    const robotDog = this.sceneObjectManager.getObject(robotDogId);
    if (!this.isRobotDog(robotDog)) {
      return null;
    }

    const nextPatrol = clonePatrol(patrol);
    this.sceneObjectManager.updateObject(robotDogId, {
      metadata: {
        ...robotDog.metadata,
        patrol: nextPatrol
      },
      status: options.status ?? robotDog.status
    });

    if (options.refreshVisuals !== false) {
      this.ensureRouteHelpers(robotDogId);
      this.rebuildRouteVisuals(robotDogId);
    }
    this.onStateChange(robotDogId, nextPatrol);
    return nextPatrol;
  }

  ensureRouteHelpers(robotDogId) {
    if (this.helpers.has(robotDogId)) {
      return this.helpers.get(robotDogId);
    }

    const root = new pc.Entity(`RobotDogRoute-${robotDogId}`);
    this.helperRoot.addChild(root);

    const helper = {
      root,
      markers: [],
      segments: []
    };

    this.helpers.set(robotDogId, helper);
    return helper;
  }

  clearRouteHelpers(robotDogId) {
    const helper = this.helpers.get(robotDogId);
    if (!helper) {
      return;
    }

    helper.markers.forEach((entity) => entity.destroy());
    helper.segments.forEach((entity) => entity.destroy());
    helper.markers = [];
    helper.segments = [];
  }

  removeRobotDog(robotDogId) {
    if (this.editingRobotDogId === robotDogId) {
      this.editingRobotDogId = null;
    }

    const helper = this.helpers.get(robotDogId);
    if (helper) {
      helper.root.destroy();
      this.helpers.delete(robotDogId);
    }
  }

  setRouteVisible(robotDogId, visible) {
    const helper = this.ensureRouteHelpers(robotDogId);
    helper.root.enabled = Boolean(visible);
  }

  rebuildRouteVisuals(robotDogId) {
    const robotDog = this.sceneObjectManager.getObject(robotDogId);
    if (!this.isRobotDog(robotDog)) {
      return;
    }

    const helper = this.ensureRouteHelpers(robotDogId);
    const patrol = clonePatrol(robotDog.metadata?.patrol);
    const routePoints = patrol.routePoints;

    this.clearRouteHelpers(robotDogId);
    helper.root.enabled = robotDog.visible !== false;

    routePoints.forEach((point, index) => {
      const marker = new pc.Entity(`Waypoint-${robotDogId}-${index + 1}`);
      marker.addComponent('render', {
        type: 'sphere',
        castShadows: false,
        receiveShadows: false,
        material: this.waypointMaterial
      });
      marker.setLocalScale(0.24, 0.24, 0.24);
      marker.setLocalPosition(point.position[0], point.position[1] + 0.12, point.position[2]);
      helper.root.addChild(marker);
      helper.markers.push(marker);
    });

    for (let index = 0; index < routePoints.length - 1; index += 1) {
      const start = toVec3(routePoints[index].position);
      const end = toVec3(routePoints[index + 1].position);
      const segment = this.createRouteSegment(start, end);
      helper.root.addChild(segment);
      helper.segments.push(segment);
    }
  }

  createRouteSegment(start, end) {
    const segment = new pc.Entity('RouteSegment');
    segment.addComponent('render', {
      type: 'cylinder',
      castShadows: false,
      receiveShadows: false,
      material: this.lineMaterial
    });

    const midpoint = start.clone().add(end).mulScalar(0.5);
    const direction = end.clone().sub(start);
    const length = Math.max(direction.length(), 0.001);
    segment.setPosition(midpoint);
    segment.lookAt(end);
    segment.rotateLocal(90, 0, 0);
    segment.setLocalScale(0.06, length * 0.5, 0.06);
    return segment;
  }

  startRouteEditing(robotDogId) {
    const robotDog = this.sceneObjectManager.getObject(robotDogId);
    if (!this.isRobotDog(robotDog)) {
      this.onLog('[RobotDogPatrol] route editing failed: selected object is not robotDog');
      return false;
    }

    if (this.editingRobotDogId && this.editingRobotDogId !== robotDogId) {
      this.stopRouteEditing(this.editingRobotDogId, { silent: true });
    }

    const patrol = clonePatrol(robotDog.metadata?.patrol);
    patrol.routeEditing = true;
    patrol.state = ROUTE_STATE_EDITING;
    patrol.currentSegmentIndex = 0;
    patrol.progress = 0;

    this.editingRobotDogId = robotDogId;
    this.updatePatrol(robotDogId, patrol);
    this.onLog(`[RobotDogPatrol] route editing started: robotDogId=${robotDogId}`);
    return true;
  }

  stopRouteEditing(robotDogId, options = {}) {
    const robotDog = this.sceneObjectManager.getObject(robotDogId);
    if (!this.isRobotDog(robotDog)) {
      return false;
    }

    const patrol = clonePatrol(robotDog.metadata?.patrol);
    patrol.routeEditing = false;
    patrol.state = patrol.routePoints.length >= 2 ? ROUTE_STATE_READY : ROUTE_STATE_IDLE;
    patrol.currentSegmentIndex = 0;
    patrol.progress = 0;

    if (this.editingRobotDogId === robotDogId) {
      this.editingRobotDogId = null;
    }

    this.updatePatrol(robotDogId, patrol);
    if (!options.silent) {
      this.onLog(`[RobotDogPatrol] route editing stopped: robotDogId=${robotDogId}`);
    }
    return true;
  }

  addRoutePoint(robotDogId, worldPosition) {
    const robotDog = this.sceneObjectManager.getObject(robotDogId);
    if (!this.isRobotDog(robotDog)) {
      return false;
    }

    const point = worldPosition instanceof pc.Vec3
      ? worldPosition.clone()
      : new pc.Vec3(worldPosition?.x ?? 0, worldPosition?.y ?? 0, worldPosition?.z ?? 0);
    const patrol = clonePatrol(robotDog.metadata?.patrol);
    const index = patrol.routePoints.length;

    patrol.routeEditing = true;
    patrol.state = ROUTE_STATE_EDITING;
    patrol.routePoints.push({
      id: `waypoint-${index + 1}`,
      index,
      position: [point.x, point.y, point.z]
    });

    this.updatePatrol(robotDogId, patrol);
    this.onLog(
      `[RobotDogPatrol] waypoint added: robotDogId=${robotDogId} index=${index} position=${formatWaypoint(point)}`
    );
    return true;
  }

  clearRoute(robotDogId) {
    const robotDog = this.sceneObjectManager.getObject(robotDogId);
    if (!this.isRobotDog(robotDog)) {
      return false;
    }

    const patrol = clonePatrol(robotDog.metadata?.patrol);
    patrol.routePoints = [];
    patrol.routeEditing = false;
    patrol.state = ROUTE_STATE_IDLE;
    patrol.currentSegmentIndex = 0;
    patrol.progress = 0;

    if (this.editingRobotDogId === robotDogId) {
      this.editingRobotDogId = null;
    }

    this.updatePatrol(robotDogId, patrol);
    this.onLog(`[RobotDogPatrol] route cleared: robotDogId=${robotDogId}`);
    return true;
  }

  startPatrol(robotDogId) {
    const robotDog = this.sceneObjectManager.getObject(robotDogId);
    if (!this.isRobotDog(robotDog)) {
      return false;
    }

    const patrol = clonePatrol(robotDog.metadata?.patrol);
    if (patrol.routePoints.length < 2) {
      this.onLog('[RobotDogPatrol] patrol failed: route needs at least 2 points');
      return false;
    }

    patrol.routeEditing = false;
    patrol.state = ROUTE_STATE_RUNNING;
    patrol.currentSegmentIndex = 0;
    patrol.progress = 0;
    this.editingRobotDogId = null;

    const firstPoint = toVec3(patrol.routePoints[0].position);
    robotDog.entity?.setPosition(firstPoint);
    this.lookAtNextWaypoint(robotDogId, firstPoint, patrol.routePoints[1]);
    this.syncRobotTransform(robotDogId);

    this.updatePatrol(robotDogId, patrol, { status: 'running' });
    this.onLog(`[RobotDogPatrol] patrol started: robotDogId=${robotDogId}`);
    return true;
  }

  pausePatrol(robotDogId) {
    const robotDog = this.sceneObjectManager.getObject(robotDogId);
    if (!this.isRobotDog(robotDog)) {
      return false;
    }

    const patrol = clonePatrol(robotDog.metadata?.patrol);
    if (patrol.state !== ROUTE_STATE_RUNNING) {
      return false;
    }

    patrol.state = ROUTE_STATE_PAUSED;
    this.updatePatrol(robotDogId, patrol, { status: 'paused' });
    this.onLog(`[RobotDogPatrol] patrol paused: robotDogId=${robotDogId}`);
    return true;
  }

  resumePatrol(robotDogId) {
    const robotDog = this.sceneObjectManager.getObject(robotDogId);
    if (!this.isRobotDog(robotDog)) {
      return false;
    }

    const patrol = clonePatrol(robotDog.metadata?.patrol);
    if (patrol.state !== ROUTE_STATE_PAUSED) {
      return false;
    }

    patrol.state = ROUTE_STATE_RUNNING;
    this.updatePatrol(robotDogId, patrol, { status: 'running' });
    this.onLog(`[RobotDogPatrol] patrol resumed: robotDogId=${robotDogId}`);
    return true;
  }

  stopPatrol(robotDogId) {
    const robotDog = this.sceneObjectManager.getObject(robotDogId);
    if (!this.isRobotDog(robotDog)) {
      return false;
    }

    const patrol = clonePatrol(robotDog.metadata?.patrol);
    patrol.routeEditing = false;
    patrol.state = patrol.routePoints.length >= 2 ? ROUTE_STATE_READY : ROUTE_STATE_IDLE;
    patrol.currentSegmentIndex = 0;
    patrol.progress = 0;

    if (patrol.routePoints[0] && robotDog.entity) {
      const firstPoint = toVec3(patrol.routePoints[0].position);
      robotDog.entity.setPosition(firstPoint);
      this.lookAtNextWaypoint(robotDogId, firstPoint, patrol.routePoints[1] ?? patrol.routePoints[0]);
      this.syncRobotTransform(robotDogId);
    }

    this.updatePatrol(robotDogId, patrol, { status: 'ready' });
    this.onLog(`[RobotDogPatrol] patrol stopped: robotDogId=${robotDogId}`);
    return true;
  }

  setPatrolSpeed(robotDogId, speed) {
    const robotDog = this.sceneObjectManager.getObject(robotDogId);
    if (!this.isRobotDog(robotDog)) {
      return false;
    }

    const patrol = clonePatrol(robotDog.metadata?.patrol);
    patrol.speed = Math.max(0.1, Number.parseFloat(speed) || DEFAULT_PATROL.speed);
    this.updatePatrol(robotDogId, patrol);
    return true;
  }

  setPatrolLoop(robotDogId, loop) {
    const robotDog = this.sceneObjectManager.getObject(robotDogId);
    if (!this.isRobotDog(robotDog)) {
      return false;
    }

    const patrol = clonePatrol(robotDog.metadata?.patrol);
    patrol.loop = Boolean(loop);
    this.updatePatrol(robotDogId, patrol);
    return true;
  }

  syncRobotTransform(robotDogId) {
    const robotDog = this.sceneObjectManager.getObject(robotDogId);
    if (!this.isRobotDog(robotDog) || !robotDog.entity) {
      return false;
    }

    const position = robotDog.entity.getLocalPosition();
    const rotation = robotDog.entity.getLocalEulerAngles();
    const scale = robotDog.entity.getLocalScale();
    this.sceneObjectManager.setTransform(robotDogId, {
      position: [position.x, position.y, position.z],
      rotation: [rotation.x, rotation.y, rotation.z],
      scale: [scale.x, scale.y, scale.z]
    });
    return true;
  }

  lookAtNextWaypoint(robotDogId, currentPosition, nextPoint) {
    const robotDog = this.sceneObjectManager.getObject(robotDogId);
    if (!this.isRobotDog(robotDog) || !robotDog.entity || !nextPoint) {
      return;
    }

    const nextPosition = toVec3(nextPoint.position);
    robotDog.entity.lookAt(nextPosition);

    const patrol = clonePatrol(robotDog.metadata?.patrol);
    if (patrol.modelYawOffset) {
      robotDog.entity.rotateLocal(0, patrol.modelYawOffset, 0);
    }

    if (currentPosition) {
      robotDog.entity.setPosition(currentPosition);
    }
  }

  update(dt) {
    this.sceneObjectManager.getObjects()
      .filter((object) => object.type === 'robotDog')
      .forEach((robotDog) => {
        this.setRouteVisible(robotDog.id, robotDog.visible !== false);

        const patrol = clonePatrol(robotDog.metadata?.patrol);
        if (patrol.state !== ROUTE_STATE_RUNNING || patrol.routePoints.length < 2 || !robotDog.entity) {
          return;
        }

        const currentIndex = patrol.currentSegmentIndex;
        const nextIndex = currentIndex + 1;
        const currentPoint = patrol.routePoints[currentIndex];
        const nextPoint = patrol.routePoints[nextIndex];

        if (!currentPoint || !nextPoint) {
          this.finishPatrol(robotDog.id, patrol);
          return;
        }

        const start = toVec3(currentPoint.position);
        const end = toVec3(nextPoint.position);
        const direction = end.clone().sub(start);
        const distance = direction.length();

        if (distance <= 0.0001) {
          patrol.currentSegmentIndex += 1;
          patrol.progress = 0;
          this.updatePatrol(robotDog.id, patrol, {
            status: 'running',
            refreshVisuals: false
          });
          return;
        }

        const step = Math.max(0.01, patrol.speed) * dt;
        patrol.progress = Math.min(1, patrol.progress + (step / distance));
        const position = start.clone().lerp(start, end, patrol.progress);
        robotDog.entity.setPosition(position);
        this.lookAtNextWaypoint(robotDog.id, position, nextPoint);
        this.syncRobotTransform(robotDog.id);

        if (patrol.progress >= 1) {
          if (nextIndex >= patrol.routePoints.length - 1) {
            if (patrol.loop) {
              patrol.currentSegmentIndex = 0;
              patrol.progress = 0;
            } else {
              this.finishPatrol(robotDog.id, patrol);
              return;
            }
          } else {
            patrol.currentSegmentIndex += 1;
            patrol.progress = 0;
          }
        }

        this.updatePatrol(robotDog.id, patrol, {
          status: 'running',
          refreshVisuals: false
        });
      });
  }

  finishPatrol(robotDogId, patrolInput) {
    const patrol = clonePatrol(patrolInput);
    patrol.routeEditing = false;
    patrol.state = ROUTE_STATE_FINISHED;
    patrol.progress = 1;
    this.updatePatrol(robotDogId, patrol, { status: 'finished' });
    this.onLog(`[RobotDogPatrol] patrol finished: robotDogId=${robotDogId}`);
  }

  syncExistingRobotDogs() {
    this.sceneObjectManager.getObjects()
      .filter((object) => object.type === 'robotDog')
      .forEach((object) => {
        this.ensureRobotDogPatrol(object.id);
        this.rebuildRouteVisuals(object.id);
      });
  }

  buildRobotDogMetadata(metadata = {}) {
    return {
      ...metadata,
      patrol: clonePatrol(metadata.patrol)
    };
  }

  static get ROUTE_STATES() {
    return {
      IDLE: ROUTE_STATE_IDLE,
      EDITING: ROUTE_STATE_EDITING,
      READY: ROUTE_STATE_READY,
      RUNNING: ROUTE_STATE_RUNNING,
      PAUSED: ROUTE_STATE_PAUSED,
      FINISHED: ROUTE_STATE_FINISHED
    };
  }
}
