const UNIT_LABEL = 'unit';

function toPoint3(point) {
  const x = Number(point?.x ?? point?.[0]);
  const y = Number(point?.y ?? point?.[1]);
  const z = Number(point?.z ?? point?.[2]);

  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    return null;
  }

  return { x, y, z };
}

export function cloneMeasurementPoint(point) {
  const normalized = toPoint3(point);
  return normalized ? { ...normalized } : null;
}

export function calculateDistance(pointA, pointB) {
  const a = toPoint3(pointA);
  const b = toPoint3(pointB);
  if (!a || !b) {
    return 0;
  }

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function calculateTriangleArea(pointA, pointB, pointC) {
  const a = toPoint3(pointA);
  const b = toPoint3(pointB);
  const c = toPoint3(pointC);
  if (!a || !b || !c) {
    return 0;
  }

  const ab = {
    x: b.x - a.x,
    y: b.y - a.y,
    z: b.z - a.z
  };
  const ac = {
    x: c.x - a.x,
    y: c.y - a.y,
    z: c.z - a.z
  };
  const cross = {
    x: ab.y * ac.z - ab.z * ac.y,
    y: ab.z * ac.x - ab.x * ac.z,
    z: ab.x * ac.y - ab.y * ac.x
  };

  return Math.sqrt(cross.x * cross.x + cross.y * cross.y + cross.z * cross.z) * 0.5;
}

export function calculatePolygonArea(points) {
  if (!Array.isArray(points) || points.length < 3) {
    return 0;
  }

  const normalizedPoints = points.map(cloneMeasurementPoint).filter(Boolean);
  if (normalizedPoints.length < 3) {
    return 0;
  }

  const origin = normalizedPoints[0];
  let area = 0;
  for (let index = 1; index < normalizedPoints.length - 1; index += 1) {
    area += calculateTriangleArea(origin, normalizedPoints[index], normalizedPoints[index + 1]);
  }

  return Number.isFinite(area) ? area : 0;
}

export function getMidpoint(pointA, pointB) {
  const a = toPoint3(pointA);
  const b = toPoint3(pointB);
  if (!a || !b) {
    return null;
  }

  return {
    x: (a.x + b.x) * 0.5,
    y: (a.y + b.y) * 0.5,
    z: (a.z + b.z) * 0.5
  };
}

export function getAveragePoint(points) {
  if (!Array.isArray(points) || !points.length) {
    return null;
  }

  const normalizedPoints = points.map(cloneMeasurementPoint).filter(Boolean);
  if (!normalizedPoints.length) {
    return null;
  }

  const sum = normalizedPoints.reduce((accumulator, point) => ({
    x: accumulator.x + point.x,
    y: accumulator.y + point.y,
    z: accumulator.z + point.z
  }), { x: 0, y: 0, z: 0 });

  return {
    x: sum.x / normalizedPoints.length,
    y: sum.y / normalizedPoints.length,
    z: sum.z / normalizedPoints.length
  };
}

export function isNearlySamePoint(pointA, pointB, epsilon = 0.01) {
  return calculateDistance(pointA, pointB) <= epsilon;
}

export function formatDistance(distance) {
  const value = Number(distance);
  if (!Number.isFinite(value) || value <= 0) {
    return `0.00 ${UNIT_LABEL}`;
  }

  if (value >= 1000) {
    return `${value.toFixed(2)} ${UNIT_LABEL}`;
  }

  return `${value.toFixed(2)} ${UNIT_LABEL}`;
}

export function formatArea(area) {
  const value = Number(area);
  if (!Number.isFinite(value) || value <= 0) {
    return `0.00 ${UNIT_LABEL}²`;
  }

  if (value >= 1000000) {
    return `${value.toFixed(2)} ${UNIT_LABEL}²`;
  }

  return `${value.toFixed(2)} ${UNIT_LABEL}²`;
}
