import * as pc from 'playcanvas';

const OUTLINE_THICKNESS = 0.08;
const ZERO_HEIGHT_FOOTPRINT_THICKNESS = 0.12;
const MIN_FACE_HEIGHT = 0.0001;

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

function destroyChildren(entity) {
  if (!entity) {
    return;
  }

  [...entity.children].forEach((child) => child.destroy());
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

function createFootprintRibbonEntity(name, start, end, material, upAxis = 'z') {
  return createSegmentEntity(name, start, end, ZERO_HEIGHT_FOOTPRINT_THICKNESS, material, upAxis);
}

function signedArea2d(points, upAxis = 'z') {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const nextIndex = (index + 1) % points.length;
    const a = points[index];
    const b = points[nextIndex];

    if (upAxis === 'y') {
      area += a.x * b.z - b.x * a.z;
    } else {
      area += a.x * b.y - b.x * a.y;
    }
  }

  return area * 0.5;
}

function polygonAreaAtIndices(points, indices, upAxis = 'z') {
  let area = 0;
  for (let i = 0; i < indices.length; i += 1) {
    const current = points[indices[i]];
    const next = points[indices[(i + 1) % indices.length]];

    if (upAxis === 'y') {
      area += current.x * next.z - next.x * current.z;
    } else {
      area += current.x * next.y - next.x * current.y;
    }
  }

  return area * 0.5;
}

function isConvex(prev, current, next, orientation, upAxis = 'z') {
  const ax = current.x - prev.x;
  const ay = upAxis === 'y' ? current.z - prev.z : current.y - prev.y;
  const bx = next.x - current.x;
  const by = upAxis === 'y' ? next.z - current.z : next.y - current.y;
  const cross = ax * by - ay * bx;
  return orientation > 0 ? cross > 1e-6 : cross < -1e-6;
}

function isPointInsideTriangle(point, a, b, c, upAxis = 'z') {
  const px = point.x;
  const py = upAxis === 'y' ? point.z : point.y;
  const ax = a.x;
  const ay = upAxis === 'y' ? a.z : a.y;
  const bx = b.x;
  const by = upAxis === 'y' ? b.z : b.y;
  const cx = c.x;
  const cy = upAxis === 'y' ? c.z : c.y;

  const v0x = cx - ax;
  const v0y = cy - ay;
  const v1x = bx - ax;
  const v1y = by - ay;
  const v2x = px - ax;
  const v2y = py - ay;

  const dot00 = v0x * v0x + v0y * v0y;
  const dot01 = v0x * v1x + v0y * v1y;
  const dot02 = v0x * v2x + v0y * v2y;
  const dot11 = v1x * v1x + v1y * v1y;
  const dot12 = v1x * v2x + v1y * v2y;

  const denominator = dot00 * dot11 - dot01 * dot01;
  if (Math.abs(denominator) <= 1e-8) {
    return false;
  }

  const invDenominator = 1 / denominator;
  const u = (dot11 * dot02 - dot01 * dot12) * invDenominator;
  const v = (dot00 * dot12 - dot01 * dot02) * invDenominator;
  return u >= 0 && v >= 0 && (u + v) <= 1;
}

function triangulatePolygon(points, upAxis = 'z') {
  if (!Array.isArray(points) || points.length < 3) {
    return [];
  }

  const remaining = points.map((_, index) => index);
  const triangles = [];
  const orientation = polygonAreaAtIndices(points, remaining, upAxis) >= 0 ? 1 : -1;
  let guard = 0;

  while (remaining.length > 3 && guard < 1000) {
    let earFound = false;

    for (let i = 0; i < remaining.length; i += 1) {
      const prevIndex = remaining[(i - 1 + remaining.length) % remaining.length];
      const currentIndex = remaining[i];
      const nextIndex = remaining[(i + 1) % remaining.length];
      const prev = points[prevIndex];
      const current = points[currentIndex];
      const next = points[nextIndex];

      if (!isConvex(prev, current, next, orientation, upAxis)) {
        continue;
      }

      let containsPoint = false;
      for (let j = 0; j < remaining.length; j += 1) {
        const testIndex = remaining[j];
        if (testIndex === prevIndex || testIndex === currentIndex || testIndex === nextIndex) {
          continue;
        }

        if (isPointInsideTriangle(points[testIndex], prev, current, next, upAxis)) {
          containsPoint = true;
          break;
        }
      }

      if (containsPoint) {
        continue;
      }

      triangles.push(
        orientation > 0
          ? [prevIndex, currentIndex, nextIndex]
          : [prevIndex, nextIndex, currentIndex]
      );
      remaining.splice(i, 1);
      earFound = true;
      break;
    }

    if (!earFound) {
      break;
    }

    guard += 1;
  }

  if (remaining.length === 3) {
    triangles.push(
      orientation > 0
        ? [remaining[0], remaining[1], remaining[2]]
        : [remaining[0], remaining[2], remaining[1]]
    );
  }

  return triangles;
}

function createMeshEntity(app, name, positions, indices, material) {
  if (!positions.length || !indices.length) {
    return null;
  }

  const mesh = new pc.Mesh(app.graphicsDevice);
  mesh.setPositions(positions);
  mesh.setIndices(indices);
  mesh.update(pc.PRIMITIVE_TRIANGLES);

  const meshInstance = new pc.MeshInstance(mesh, material);
  const entity = new pc.Entity(name);
  entity.addComponent('render', {
    meshInstances: [meshInstance],
    castShadows: false,
    receiveShadows: false
  });
  return entity;
}

function pushVec3(positions, vec) {
  positions.push(vec.x, vec.y, vec.z);
}

function createTopFaceEntity(app, name, topPoints, triangles, material) {
  if (!triangles.length) {
    return null;
  }

  const positions = [];
  topPoints.forEach((point) => pushVec3(positions, point));

  const indices = [];
  triangles.forEach((triangle) => {
    indices.push(triangle[0], triangle[1], triangle[2]);
  });

  return createMeshEntity(app, name, positions, indices, material);
}

function createSideFaceEntity(app, name, baseStart, baseEnd, topStart, topEnd, material) {
  const positions = [];
  pushVec3(positions, baseStart);
  pushVec3(positions, baseEnd);
  pushVec3(positions, topEnd);
  pushVec3(positions, topStart);

  const indices = [0, 1, 2, 0, 2, 3];
  return createMeshEntity(app, name, positions, indices, material);
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
    const topTriangles = triangulatePolygon(localTopPoints, upAxis);

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

      if (envelope.outlineVisible !== false) {
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
      }

      if (height <= MIN_FACE_HEIGHT) {
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

      if (envelope.outlineVisible !== false && envelope.topVisible !== false) {
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

      if (envelope.outlineVisible !== false && envelope.sideVisible !== false) {
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
      }

      if (envelope.fillVisible !== false && envelope.sideVisible !== false) {
        const sideFace = createSideFaceEntity(
          this.app,
          `__building_envelope_face_side_${index}`,
          baseStart,
          baseEnd,
          topStart,
          topEnd,
          fillMaterial
        );
        if (sideFace) {
          entity.addChild(sideFace);
        }
      }
    }

    if (height > MIN_FACE_HEIGHT && envelope.fillVisible !== false && envelope.topVisible !== false) {
      const topFace = createTopFaceEntity(
        this.app,
        '__building_envelope_face_top',
        localTopPoints,
        topTriangles,
        fillMaterial
      );
      if (topFace) {
        entity.addChild(topFace);
      }
    }

    if (height > MIN_FACE_HEIGHT && !topTriangles.length) {
      console.warn('[BuildingEnvelopeMeshBuilder] top triangulation failed', {
        pointCount: localTopPoints.length,
        signedArea: signedArea2d(localTopPoints, upAxis)
      });
    }

    return entity;
  }
}
