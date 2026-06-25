const STORAGE_KEY = 'playcanvas-3dgs-bim-alignment';

export const DEFAULT_BIM_ALIGNMENT = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1]
};

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function sanitizeVector(value, fallback) {
  if (!Array.isArray(value) || value.length !== 3) {
    return [...fallback];
  }

  return value.map((item, index) => (
    isFiniteNumber(item) ? item : fallback[index]
  ));
}

function sanitizeScale(value) {
  if (Array.isArray(value) && value.length === 3) {
    return sanitizeVector(value, DEFAULT_BIM_ALIGNMENT.scale);
  }

  if (isFiniteNumber(value)) {
    return [value, value, value];
  }

  return [...DEFAULT_BIM_ALIGNMENT.scale];
}

export class BimAlignmentManager {
  constructor(storage = window.localStorage) {
    this.storage = storage;
    this.current = this.clone(DEFAULT_BIM_ALIGNMENT);
  }

  clone(alignment) {
    return {
      position: [...alignment.position],
      rotation: [...alignment.rotation],
      scale: [...alignment.scale]
    };
  }

  sanitize(alignment) {
    const next = alignment || {};

    return {
      position: sanitizeVector(next.position, DEFAULT_BIM_ALIGNMENT.position),
      rotation: sanitizeVector(next.rotation, DEFAULT_BIM_ALIGNMENT.rotation),
      scale: sanitizeScale(next.scale)
    };
  }

  setCurrent(alignment) {
    this.current = this.sanitize(alignment);
    return this.getCurrent();
  }

  getCurrent() {
    return this.clone(this.current);
  }

  reset() {
    this.current = this.clone(DEFAULT_BIM_ALIGNMENT);
    return this.getCurrent();
  }

  save(alignment = this.current) {
    const next = this.sanitize(alignment);
    this.storage.setItem(STORAGE_KEY, JSON.stringify(next));
    this.current = next;
    return this.getCurrent();
  }

  load() {
    const raw = this.storage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    const next = this.sanitize(parsed);
    this.current = next;
    return this.getCurrent();
  }
}
