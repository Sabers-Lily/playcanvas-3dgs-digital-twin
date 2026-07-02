import * as pc from 'playcanvas';

const FACE_THICKNESS = 0.08;
const OUTLINE_THICKNESS = 0.08;
const ZERO_HEIGHT_FOOTPRINT_THICKNESS = 0.12;

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

function createStandardMaterial({
  color,
  opacity,
  emissiveScale = 0.08,
  depthTest = true
}) {
  const material = new pc.StandardMaterial();
  const resolvedColor = colorFromHex(color);
  const resolvedOpacity = clampOpacity(opacity);
  material.diffuse = resolvedColor.clone();
  material.emissive = resolvedColor.clone().mulScalar(emissiveScale);
  material.opacity = resolvedOpacity;
  material.blendType = resolvedOpacity < 1 ? pc.BLEND_NORMAL : pc.BLEND_NONE;
  material.depthWrite = resolvedOpacity >= 1;
  material.depthTest = depthTest;
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
  return points.map((point) => {
    const position = getPointPosition(point);
    return new pc.Vec3(
      (Number.parseFloat(position[0]) || 0) - center.x,
      (Number.parseFloat(position[1]) || 0) - center.y,
      (Number.parseFloat(position[2]) || 0) - center.z
    );
  });
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

function destroyChildren(entity) {
  if (!entity) {
    return;
  }

  [...entity.children].forEach((child) => child.destroy());
}

function createFaceEntity(name, start, end, upAxisVector, height, material, upAxis = 'z') {
  const edgeDirection = end.clone().sub(start);
  const edgeLength = edgeDirection.length();
  if (edgeLength <= 0.0001 || height <= 0.0001) {
    return null;
  }

  const faceEntity = createBoxEntity(name, material);
  const thickness = FACE_THICKNESS;
  const faceCenter = midpoint(start, end).add(upAxisVector.clone().mulScalar(height * 0.5));
  faceEntity.setLocalPosition(faceCenter);

  if (upAxis === 'y') {
    faceEntity.setLocalScale(thickness, height, Math.max(edgeLength, thickness));
    faceEntity.setLocalRotation(new pc.Quat().setFromDirections(new pc.Vec3(0, 0, 1), edgeDirection.clone().normalize()));
    return faceEntity;
  }

  faceEntity.setLocalScale(Math.max(edgeLength, thickness), thickness, height);
  faceEntity.setLocalRotation(new pc.Quat().setFromDirections(new pc.Vec3(1, 0, 0), edgeDirection.clone().normalize()));
  return faceEntity;
}

function createFootprintRibbonEntity(name, start, end, material, upAxis = 'z') {
  const thickness = ZERO_HEIGHT_FOOTPRINT_THICKNESS;
  return createSegmentEntity(name, start, end, thickness, material, upAxis);
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
    const upAxis = envelope.upAxis ?? 'z';
    const upAxisVector = getUpAxisVector(upAxis);
    const color = normalizeHexColor(envelope.color);
    const opacity = clampOpacity(envelope.opacity);
    const localBasePoints = localizePoints(points, center);
    const localTopPoints = localBasePoints.map((point) => point.clone().add(upAxisVector.clone().mulScalar(height)));

    const outlineMaterial = createStandardMaterial({
      color: '#ff3b30',
      opacity: 0.95,
      emissiveScale: 0.4,
      depthTest: true
    });

    const fillMaterial = createStandardMaterial({
      color,
      opacity,
      emissiveScale: 0.12,
      depthTest: true
    });

    for (let index = 0; index < localBasePoints.length; index += 1) {
      const nextIndex = (index + 1) % localBasePoints.length;
      const baseStart = localBasePoints[index];
      const baseEnd = localBasePoints[nextIndex];
      const topStart = localTopPoints[index];
      const topEnd = localTopPoints[nextIndex];

      const bottomLine = createSegmentEntity(
        `__building_envelope_outline_bottom_${index}`,
        baseStart,
        baseEnd,
        OUTLINE_THICKNESS,
        outlineMaterial,
        upAxis
      );
      if (bottomLine) {
        entity.addChild(bottomLine);
      }

      if (height <= 0.0001) {
        if (envelope.fillVisible !== false) {
          const footprintRibbon = createFootprintRibbonEntity(
            `__building_envelope_footprint_${index}`,
            baseStart,
            baseEnd,
            fillMaterial,
            upAxis
          );
          if (footprintRibbon) {
            entity.addChild(footprintRibbon);
          }
        }
        continue;
      }

      if (envelope.topVisible !== false) {
        const topLine = createSegmentEntity(
          `__building_envelope_outline_top_${index}`,
          topStart,
          topEnd,
          OUTLINE_THICKNESS,
          outlineMaterial,
          upAxis
        );
        if (topLine) {
          entity.addChild(topLine);
        }
      }

      if (envelope.sideVisible !== false) {
        const verticalLine = createSegmentEntity(
          `__building_envelope_outline_side_${index}`,
          baseStart,
          topStart,
          OUTLINE_THICKNESS,
          outlineMaterial,
          upAxis
        );
        if (verticalLine) {
          entity.addChild(verticalLine);
        }

        if (envelope.fillVisible !== false) {
          const sideFace = createFaceEntity(
            `__building_envelope_face_side_${index}`,
            baseStart,
            baseEnd,
            upAxisVector,
            height,
            fillMaterial,
            upAxis
          );
          if (sideFace) {
            entity.addChild(sideFace);
          }
        }
      }
    }

    return entity;
  }
}
