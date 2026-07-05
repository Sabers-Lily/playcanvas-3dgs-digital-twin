import * as pc from 'playcanvas';
import { BuildingEnvelopeMeshBuilder } from './BuildingEnvelopeMeshBuilder.js';

const DEFAULTS = {
  minPoints: 3,
  initialHeight: 5,
  defaultColor: '#00A3FF',
  defaultOpacity: 0.25,
  defaultDisplayMode: 'overlay'
};
const VISUAL_STATE = {
  normal: {
    hovered: false,
    selected: false,
    showVertices: false
  },
  hovered: {
    hovered: true,
    selected: false,
    showVertices: false
  },
  selected: {
    hovered: false,
    selected: true,
    showVertices: true
  }
};
const VERTEX_MARKER_PREFIX = '__building_envelope_selected_vertex_';

function readNumber(value, fallback = 0) {
  const next = Number.parseFloat(value);
  return Number.isFinite(next) ? next : fallback;
}

function normalizePoint(point, index) {
  const position = Array.isArray(point?.position)
    ? point.position
    : Array.isArray(point)
      ? point
      : [0, 0, 0];

  return {
    id: point?.id ?? `p${index}`,
    index,
    position: [
      Number.parseFloat(position[0]) || 0,
      Number.parseFloat(position[1]) || 0,
      Number.parseFloat(position[2]) || 0
    ]
  };
}

function cloneEnvelope(envelope = {}) {
  return {
    points: Array.isArray(envelope.points) ? envelope.points.map((point, index) => normalizePoint(point, index)) : [],
    closed: envelope.closed ?? true,
    height: Math.max(0, readNumber(envelope.height, DEFAULTS.initialHeight)),
    baseOffset: readNumber(envelope.baseOffset, 0),
    color: typeof envelope.color === 'string' ? envelope.color : DEFAULTS.defaultColor,
    opacity: readNumber(envelope.opacity, DEFAULTS.defaultOpacity) >= 0 ? readNumber(envelope.opacity, DEFAULTS.defaultOpacity) : DEFAULTS.defaultOpacity,
    outlineVisible: envelope.outlineVisible ?? true,
    fillVisible: envelope.fillVisible ?? true,
    topVisible: envelope.topVisible ?? true,
    sideVisible: envelope.sideVisible ?? true,
    upAxis: envelope.upAxis ?? 'z',
    displayMode: envelope.displayMode === 'depth' ? 'depth' : DEFAULTS.defaultDisplayMode
  };
}

function pointToVec3(point) {
  return new pc.Vec3(point[0], point[1], point[2]);
}

function midpoint(a, b) {
  return a.clone().add(b).mulScalar(0.5);
}

function createDraftPointMaterial() {
  const material = new pc.StandardMaterial();
  material.diffuse = new pc.Color(0.05, 0.85, 1);
  material.emissive = new pc.Color(0.02, 0.2, 0.25);
  material.useLighting = false;
  material.update();
  return material;
}

function createDraftLineMaterial() {
  const material = new pc.StandardMaterial();
  material.diffuse = new pc.Color(0.06, 0.65, 0.92);
  material.emissive = new pc.Color(0.02, 0.2, 0.25);
  material.useLighting = false;
  material.cull = pc.CULLFACE_NONE;
  material.update();
  return material;
}

function createDraftPointEntity(index, worldPosition, material) {
  const entity = new pc.Entity(`__building_envelope_draft_point_${index}`);
  entity.addComponent('render', {
    type: 'sphere',
    castShadows: false,
    receiveShadows: false,
    material
  });
  entity.setLocalScale(0.24, 0.24, 0.24);
  entity.setPosition(worldPosition);
  return entity;
}

function createDraftSegmentEntity(name, start, end, material, thickness = 0.06) {
  const direction = end.clone().sub(start);
  const length = direction.length();
  if (length <= 0.0001) {
    return null;
  }

  const entity = new pc.Entity(name);
  entity.addComponent('render', {
    type: 'box',
    castShadows: false,
    receiveShadows: false,
    material
  });
  entity.setLocalPosition(midpoint(start, end));
  entity.setLocalScale(thickness, length, thickness);
  entity.setLocalRotation(new pc.Quat().setFromDirections(new pc.Vec3(0, 1, 0), direction.normalize()));
  return entity;
}

function destroyMatchingChildren(entity, prefix) {
  if (!entity || typeof prefix !== 'string') {
    return;
  }

  [...entity.children]
    .filter((child) => typeof child.name === 'string' && child.name.startsWith(prefix))
    .forEach((child) => child.destroy());
}

function createSelectedVertexMaterial() {
  const material = new pc.StandardMaterial();
  material.diffuse = new pc.Color(0.32, 0.66, 1);
  material.emissive = new pc.Color(0.16, 0.34, 0.78);
  material.opacity = 0.98;
  material.cull = pc.CULLFACE_NONE;
  material.useLighting = false;
  material.update();
  return material;
}

function createSelectedVertexMarkerEntity(name, localPosition, material, layers = null) {
  const entity = new pc.Entity(name);
  entity.addComponent('render', {
    type: 'sphere',
    castShadows: false,
    receiveShadows: false,
    material
  });
  if (Array.isArray(layers) && layers.length) {
    entity.render.layers = [...layers];
  }
  entity.setLocalScale(0.22, 0.22, 0.22);
  entity.setLocalPosition(localPosition);
  return entity;
}

export class BuildingEnvelopeController {
  constructor({ app, onLog, visibleLayerIds = null, pickingLayerIds = null }) {
    this.app = app;
    this.onLog = typeof onLog === 'function' ? onLog : null;
    this.visibleLayerIds = Array.isArray(visibleLayerIds) && visibleLayerIds.length ? [...visibleLayerIds] : null;
    this.pickingLayerIds = Array.isArray(pickingLayerIds) && pickingLayerIds.length ? [...pickingLayerIds] : null;
    this.meshBuilder = new BuildingEnvelopeMeshBuilder({
      app,
      visibleLayerIds: this.visibleLayerIds,
      pickingLayerIds: this.pickingLayerIds
    });
    this.draftPointMaterial = createDraftPointMaterial();
    this.draftLineMaterial = createDraftLineMaterial();
    this.selectedVertexMaterial = createSelectedVertexMaterial();
    this.visualStateByObjectId = new Map();
    this.state = {
      active: false,
      mode: 'idle',
      minPoints: DEFAULTS.minPoints,
      initialHeight: DEFAULTS.initialHeight,
      points: [],
      markers: [],
      lineEntities: [],
      previewEntity: null,
      selectedEnvelopeId: null,
      options: {
        height: DEFAULTS.initialHeight,
        color: DEFAULTS.defaultColor,
        opacity: DEFAULTS.defaultOpacity
      }
    };
  }

  log(message) {
    console.log(message);
    this.onLog?.(message);
  }

  getStateSnapshot() {
    return {
      active: this.state.active,
      mode: this.state.mode,
      pointCount: this.state.points.length,
      minPoints: this.state.minPoints,
      canFinish: this.state.points.length >= this.state.minPoints,
      points: this.state.points.map((point, index) => normalizePoint(point, index)),
      options: { ...this.state.options }
    };
  }

  isDrawing() {
    return this.state.active;
  }

  startDrawing(options = {}) {
    this.clearDraft({ destroyOnly: true });
    this.state.active = true;
    this.state.mode = 'drawing';
    this.state.points = [];
    this.state.options = {
      // New envelopes must start at height 0 and be edited later in Inspector.
      height: DEFAULTS.initialHeight,
      color: typeof options.color === 'string' ? options.color : DEFAULTS.defaultColor,
      opacity: readNumber(options.opacity, DEFAULTS.defaultOpacity) >= 0 ? readNumber(options.opacity, DEFAULTS.defaultOpacity) : DEFAULTS.defaultOpacity
    };
    this.log('[BuildingEnvelope] drawing started');
    return this.getStateSnapshot();
  }

  stopDrawing() {
    if (!this.state.active) {
      return false;
    }

    this.state.active = false;
    this.state.mode = 'idle';
    this.log('[BuildingEnvelope] drawing stopped');
    return true;
  }

  cancelDrawing() {
    if (!this.state.active && this.state.points.length === 0) {
      return false;
    }

    this.clearDraft();
    this.state.active = false;
    this.state.mode = 'idle';
    this.log('[BuildingEnvelope] drawing cancelled');
    return true;
  }

  clearDraft({ destroyOnly = false } = {}) {
    this.state.markers.forEach((entity) => entity?.destroy());
    this.state.lineEntities.forEach((entity) => entity?.destroy());
    this.state.previewEntity?.destroy();
    this.state.markers = [];
    this.state.lineEntities = [];
    this.state.previewEntity = null;

    if (!destroyOnly) {
      this.state.points = [];
      this.state.mode = this.state.active ? 'drawing' : 'idle';
      this.log('[BuildingEnvelope] draft cleared');
    }
  }

  addPoint(worldPosition) {
    if (!this.state.active || !worldPosition) {
      return false;
    }

    const index = this.state.points.length;
    const point = normalizePoint({
      id: `p${index}`,
      index,
      position: [worldPosition.x, worldPosition.y, worldPosition.z]
    }, index);
    this.state.points.push(point);

    const marker = createDraftPointEntity(index, worldPosition, this.draftPointMaterial);
    this.app.root.addChild(marker);
    this.state.markers.push(marker);
    this.rebuildDraftLines();

    this.log(`[BuildingEnvelope] point added: index=${index} position=${point.position.join(',')}`);
    return true;
  }

  undoLastPoint() {
    if (!this.state.points.length) {
      return false;
    }

    this.state.points.pop();
    const marker = this.state.markers.pop();
    marker?.destroy();
    this.rebuildDraftLines();
    this.log('[BuildingEnvelope] point removed');
    return true;
  }

  rebuildDraftLines() {
    this.state.lineEntities.forEach((entity) => entity?.destroy());
    this.state.lineEntities = [];

    const points = this.state.points.map((point) => pointToVec3(point.position));
    for (let index = 0; index < points.length - 1; index += 1) {
      const segment = createDraftSegmentEntity(
        `__building_envelope_draft_line_${index}`,
        points[index],
        points[index + 1],
        this.draftLineMaterial
      );
      if (segment) {
        this.app.root.addChild(segment);
        this.state.lineEntities.push(segment);
      }
    }

    if (points.length >= this.state.minPoints) {
      const closingSegment = createDraftSegmentEntity(
        '__building_envelope_draft_preview',
        points[points.length - 1],
        points[0],
        this.draftLineMaterial
      );
      if (closingSegment) {
        this.app.root.addChild(closingSegment);
        this.state.lineEntities.push(closingSegment);
        this.state.previewEntity = closingSegment;
      }
    } else {
      this.state.previewEntity = null;
    }
  }

  createEnvelopeEntity(name, metadata) {
    return this.meshBuilder.createEnvelopeEntity(name, cloneEnvelope(metadata));
  }

  bindEnvelopeEntity(entity, objectId, metadata = null) {
    if (!entity || !objectId) {
      return false;
    }

    this.meshBuilder.tagEnvelopeEntity(entity, objectId);
    if (metadata) {
      this.meshBuilder.applyEnvelopeVisualState(entity, cloneEnvelope(metadata), {
        hovered: false,
        selected: false
      });
    }
    return true;
  }

  rebuildEnvelopeEntity(entity, metadata) {
    return this.meshBuilder.rebuildEnvelopeEntity(entity, cloneEnvelope(metadata));
  }

  updateEnvelopeInteractionState(entity, metadata, interactionState = {}) {
    if (!entity || !metadata) {
      return false;
    }

    this.meshBuilder.applyEnvelopeVisualState(entity, cloneEnvelope(metadata), interactionState);
    return true;
  }

  showSelectedVertexMarkers(objectId, entity, metadata) {
    if (!entity || !metadata) {
      return false;
    }

    const alreadyVisible = entity.children.some((child) => typeof child.name === 'string' && child.name.startsWith(VERTEX_MARKER_PREFIX));
    if (alreadyVisible) {
      return false;
    }

    destroyMatchingChildren(entity, VERTEX_MARKER_PREFIX);
    const envelope = cloneEnvelope(metadata);
    const center = entity.getLocalPosition().clone();

    envelope.points.forEach((point, index) => {
      const [x, y, z] = point.position;
      const marker = createSelectedVertexMarkerEntity(
        `${VERTEX_MARKER_PREFIX}${index}`,
        new pc.Vec3(
          (Number.parseFloat(x) || 0) - center.x,
          (Number.parseFloat(y) || 0) - center.y,
          (Number.parseFloat(z) || 0) - center.z
        ),
        this.selectedVertexMaterial,
        this.visibleLayerIds
      );
      entity.addChild(marker);
    });

    this.log(`[BuildingEnvelope] selected vertex markers shown: objectId=${objectId}`);
    return true;
  }

  hideSelectedVertexMarkers(objectId, entity) {
    if (!entity) {
      return false;
    }

    const hadMarkers = entity.children.some((child) => typeof child.name === 'string' && child.name.startsWith(VERTEX_MARKER_PREFIX));
    destroyMatchingChildren(entity, VERTEX_MARKER_PREFIX);
    if (hadMarkers) {
      this.log(`[BuildingEnvelope] selected vertex markers hidden: objectId=${objectId}`);
    }
    return hadMarkers;
  }

  setVisualState(objectId, entity, metadata, state = 'normal') {
    const nextState = VISUAL_STATE[state] ?? VISUAL_STATE.normal;
    const previousState = this.visualStateByObjectId.get(objectId) ?? 'normal';
    this.bindEnvelopeEntity(entity, objectId, metadata);
    if (previousState === state) {
      if (nextState.showVertices) {
        this.showSelectedVertexMarkers(objectId, entity, metadata);
      } else {
        this.hideSelectedVertexMarkers(objectId, entity);
      }
      return false;
    }

    const changed = this.updateEnvelopeInteractionState(entity, metadata, {
      hovered: nextState.hovered,
      selected: nextState.selected
    });
    this.visualStateByObjectId.set(objectId, state);

    if (nextState.showVertices) {
      this.showSelectedVertexMarkers(objectId, entity, metadata);
    } else {
      this.hideSelectedVertexMarkers(objectId, entity);
    }

    this.log(`[BuildingEnvelope] visual state changed: objectId=${objectId} state=${state}`);
    return changed;
  }

  buildEnvelopeFromSnapshot() {
    const snapshot = this.getStateSnapshot();
    if (snapshot.points.length < snapshot.minPoints) {
      this.log('[BuildingEnvelope] create failed: needs at least 3 points');
      return null;
    }

    return cloneEnvelope({
      points: snapshot.points,
      closed: true,
      height: DEFAULTS.initialHeight,
      color: snapshot.options.color,
      opacity: snapshot.options.opacity,
      outlineVisible: true,
      fillVisible: true,
      topVisible: true,
      sideVisible: true,
      baseOffset: 0,
      upAxis: 'z',
      displayMode: DEFAULTS.defaultDisplayMode
    });
  }

  finishDrawing() {
    const envelope = this.buildEnvelopeFromSnapshot();
    if (!envelope) {
      return null;
    }

    this.clearDraft({ destroyOnly: true });
    this.state.points = [];
    this.state.active = false;
    this.state.mode = 'idle';
    return envelope;
  }
}
