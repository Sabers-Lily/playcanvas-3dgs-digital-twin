import * as pc from 'playcanvas';

const FACE_THICKNESS = 0.12;
const OUTLINE_THICKNESS = 0.1;
const DEBUG_ZERO_HEIGHT_THICKNESS = 0.6;
const DEBUG_CENTER_MARKER_SIZE = 0.6;
const DEBUG_FORCE_OPAQUE = true;

function getPointPosition(point) {
  if (Array.isArray(point)) {
    return point;
  }

  if (Array.isArray(point?.position)) {
    return point.position;
  }

  return [0, 0, 0];
}

function clampOpacity(value, fallback = 0.25) {
  const next = Number.parseFloat(value);
  if (!Number.isFinite(next)) {
    return fallback;
  }

  return Math.max(0, Math.min(1, next));
}

function normalizeHexColor(color, fallback = '#00A3FF') {
  if (typeof color !== 'string') {
    return fallback;
  }

  const trimmed = color.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed;
  }

  return fallback;
}

function colorFromHex(hex) {
  return new pc.Color().fromString(normalizeHexColor(hex));
}

function createStandardMaterial({ color, opacity, emissiveScale = 0.08 }) {
  const material = new pc.StandardMaterial();
  const resolvedColor = colorFromHex(color);
  const resolvedOpacity = DEBUG_FORCE_OPAQUE ? 1 : clampOpacity(opacity);
  material.diffuse = resolvedColor.clone();
  material.emissive = resolvedColor.clone().mulScalar(emissiveScale);
  material.opacity = resolvedOpacity;
  material.blendType = resolvedOpacity < 1 ? pc.BLEND_NORMAL : pc.BLEND_NONE;
  material.depthWrite = true;
  material.depthTest = false;
  material.cull = pc.CULLFACE_NONE;
  material.useLighting = false;
  material.update();
  return material;
}

function averageWorldPoints(points) {
  const center = new pc.Vec3();
  if (!Array.isArray(points) || points.length === 0) {
    return center;
  }

  points.forEach((point) => {
    const position = getPointPosition(point);
    center.x += Number.parseFloat(position[0]) || 0;
    center.y += Number.parseFloat(position[1]) || 0;
    center.z += Number.parseFloat(position[2]) || 0;
  });

  center.mulScalar(1 / points.length);
  return center;
}

function localizePoints(points, center) {
  return points.map((point) => new pc.Vec3(
    (Number.parseFloat(getPointPosition(point)[0]) || 0) - center.x,
    (Number.parseFloat(getPointPosition(point)[1]) || 0) - center.y,
    (Number.parseFloat(getPointPosition(point)[2]) || 0) - center.z
  ));
}

function midpoint(a, b) {
  return a.clone().add(b).mulScalar(0.5);
}

function getUpAxisVector(upAxis = 'z') {
  if (upAxis === 'y') {
    return new pc.Vec3(0, 1, 0);
  }

  return new pc.Vec3(0, 0, 1);
}

function createBoxEntity(name, material) {
  const entity = new pc.Entity(name);
  entity.addComponent('render', {
    type: 'box',
    castShadows: false,
    receiveShadows: false,
    material
  });
  return entity;
}

function createSegmentEntity(name, start, end, thickness, material, upAxis = 'z') {
  const direction = end.clone().sub(start);
  const length = direction.length();
  if (length <= 0.0001) {
    return null;
  }

  const entity = createBoxEntity(name, material);
  entity.setLocalPosition(midpoint(start, end));

  if (upAxis === 'y') {
    entity.setLocalScale(thickness, length, thickness);
    entity.setLocalRotation(new pc.Quat().setFromDirections(new pc.Vec3(0, 1, 0), direction.clone().normalize()));
    return entity;
  }

  entity.setLocalScale(thickness, thickness, length);
  entity.setLocalRotation(new pc.Quat().setFromDirections(new pc.Vec3(0, 0, 1), direction.clone().normalize()));
  return entity;
}

function createVerticalDebugMarker(name, upAxisVector, visualHeight, material) {
  const entity = createBoxEntity(name, material);
  const offset = upAxisVector.clone().mulScalar(Math.max(visualHeight, DEBUG_CENTER_MARKER_SIZE) * 0.5);
  entity.setLocalPosition(offset);

  if (Math.abs(upAxisVector.z) > 0.5) {
    entity.setLocalScale(DEBUG_CENTER_MARKER_SIZE, DEBUG_CENTER_MARKER_SIZE, Math.max(visualHeight, DEBUG_CENTER_MARKER_SIZE));
  } else {
    entity.setLocalScale(DEBUG_CENTER_MARKER_SIZE, Math.max(visualHeight, DEBUG_CENTER_MARKER_SIZE), DEBUG_CENTER_MARKER_SIZE);
  }

  return entity;
}

function destroyChildren(entity) {
  if (!entity) {
    return;
  }

  [...entity.children].forEach((child) => child.destroy());
}

export class BuildingEnvelopeMeshBuilder {
  constructor({ app }) {
    this.app = app;
  }

  createEnvelopeEntity(name, envelope) {
    const entity = new pc.Entity(name);
    this.rebuildEnvelopeEntity(entity, envelope);
    return entity;
  }

  rebuildEnvelopeEntity(entity, envelope) {
    if (!entity || !envelope) {
      return null;
    }

    destroyChildren(entity);

    const points = Array.isArray(envelope.points) ? envelope.points : [];
    if (points.length < 3) {
      console.warn('[BuildingEnvelopeMeshBuilder] rebuild skipped: insufficient points', {
        pointCount: points.length
      });
      return null;
    }

    const center = averageWorldPoints(points);
    entity.setLocalPosition(center);
    entity.setLocalRotation(pc.Quat.IDENTITY);
    entity.setLocalScale(1, 1, 1);
    entity.enabled = true;

    const parsedHeight = Number.parseFloat(envelope.height);
    const height = Number.isFinite(parsedHeight) ? Math.max(0, parsedHeight) : 0;
    const visualHeight = height > 0 ? height : DEBUG_ZERO_HEIGHT_THICKNESS;
    const upAxis = envelope.upAxis ?? 'z';
    const upAxisVector = getUpAxisVector(upAxis);
    const color = normalizeHexColor(envelope.color);
    const opacity = clampOpacity(envelope.opacity);
    const fillMaterial = createStandardMaterial({ color, opacity, emissiveScale: 0.2 });
    const outlineMaterial = createStandardMaterial({ color: '#ff3b30', opacity: 1, emissiveScale: 0.5 });
    const debugMaterial = createStandardMaterial({ color: '#ffcc00', opacity: 1, emissiveScale: 0.8 });

    const localBasePoints = localizePoints(points, center);
    const localTopPoints = localBasePoints.map((point) => point.clone().add(upAxisVector.clone().mulScalar(visualHeight)));

    // Debug body: even when height is 0, keep a visible center marker so we can prove the entity exists.
    const debugCenterMarker = createVerticalDebugMarker('__building_envelope_debug_center', upAxisVector, visualHeight, debugMaterial);
    entity.addChild(debugCenterMarker);

    // Debug footprint: fill the polygon bounding shape by spanning thick segments across each edge.
    for (let index = 0; index < localBasePoints.length; index += 1) {
      const nextIndex = (index + 1) % localBasePoints.length;
      const bottomLine = createSegmentEntity(
        `__building_envelope_outline_bottom_${index}`,
        localBasePoints[index],
        localBasePoints[nextIndex],
        OUTLINE_THICKNESS,
        outlineMaterial,
        upAxis
      );

      if (bottomLine) {
        entity.addChild(bottomLine);
      }

      const raisedBaseA = localBasePoints[index].clone();
      const raisedBaseB = localBasePoints[nextIndex].clone();
      const topLine = createSegmentEntity(
        `__building_envelope_outline_top_${index}`,
        localTopPoints[index],
        localTopPoints[nextIndex],
        OUTLINE_THICKNESS,
        outlineMaterial,
        upAxis
      );

      const verticalLine = createSegmentEntity(
        `__building_envelope_outline_side_${index}`,
        raisedBaseA,
        localTopPoints[index],
        OUTLINE_THICKNESS,
        outlineMaterial,
        upAxis
      );

      [topLine, verticalLine].forEach((lineEntity) => {
        if (lineEntity) {
          entity.addChild(lineEntity);
        }
      });
    }

    // Add a solid debug slab between the first two edges so we can verify an opaque model is present.
    const edgeA = localBasePoints[0];
    const edgeB = localBasePoints[1];
    const edgeDirection = edgeB.clone().sub(edgeA);
    const edgeLength = edgeDirection.length();
    if (edgeLength > 0.0001) {
      const slabEntity = createBoxEntity('__building_envelope_debug_slab', fillMaterial);
      const slabCenter = midpoint(edgeA, edgeB).add(upAxisVector.clone().mulScalar(visualHeight * 0.5));
      slabEntity.setLocalPosition(slabCenter);

      if (upAxis === 'z') {
        slabEntity.setLocalScale(Math.max(edgeLength, 0.5), 1.2, visualHeight);
      } else {
        slabEntity.setLocalScale(Math.max(edgeLength, 0.5), visualHeight, 1.2);
      }

      entity.addChild(slabEntity);
    }

    console.log('[BuildingEnvelopeMeshBuilder] rebuilt entity', {
      name: entity.name,
      center: [center.x, center.y, center.z],
      height,
      visualHeight,
      upAxis,
      childCount: entity.children.length,
      points
    });

    return entity;
  }
}
