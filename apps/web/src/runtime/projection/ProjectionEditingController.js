function cloneQuadPoints(points = []) {
  return Array.isArray(points)
    ? points.map((point, index) => ({
        ...(point ?? {}),
        index: point?.index ?? index,
        position: Array.isArray(point?.position) ? [...point.position] : [0, 0, 0]
      }))
    : [];
}

export class ProjectionEditingController {
  constructor({
    projectionRegistry,
    compatibilityAdapter,
    logPrefix = '[ProjectionEditingController]'
  } = {}) {
    this.projectionRegistry = projectionRegistry;
    this.compatibilityAdapter = compatibilityAdapter;
    this.logPrefix = logPrefix;
    this.editingProjectionId = null;
  }

  start(projectionId) {
    const projection = this.projectionRegistry.get(projectionId);
    if (!projection) {
      return false;
    }

    // 进入四点编辑时，总是先清空旧锚点并关闭当前投影。
    // 此后视口点击应优先收集四个世界点，完成后再恢复投影流程。
    this.editingProjectionId = projectionId;
    this.projectionRegistry.update(projectionId, {
      quadEditing: true,
      enabled: false,
      quadPoints: []
    });
    this.compatibilityAdapter.updateProjectionForObject(projection.objectId, {
      quadEditing: true,
      enabled: false,
      quadPoints: []
    });
    console.log(`${this.logPrefix} start`, {
      projectionId
    });
    return true;
  }

  stop() {
    if (!this.editingProjectionId) {
      return false;
    }

    const projection = this.projectionRegistry.get(this.editingProjectionId);
    if (projection) {
      this.projectionRegistry.update(this.editingProjectionId, {
        quadEditing: false
      });
      this.compatibilityAdapter.updateProjectionForObject(projection.objectId, {
        quadEditing: false
      });
    }
    this.editingProjectionId = null;
    return true;
  }

  addWorldPoint(worldPoint) {
    if (!this.editingProjectionId || !worldPoint) {
      return null;
    }

    const projection = this.projectionRegistry.get(this.editingProjectionId);
    if (!projection || projection.quadPoints.length >= 4) {
      return null;
    }

    const index = projection.quadPoints.length;
    const nextPoint = {
      id: `quad-point-${String(index + 1).padStart(3, '0')}`,
      index,
      label: ['左上', '右上', '右下', '左下'][index],
      position: [worldPoint.x, worldPoint.y, worldPoint.z]
    };
    const quadPoints = [...cloneQuadPoints(projection.quadPoints), nextPoint];
    const quadEditing = quadPoints.length < 4;

    this.projectionRegistry.update(this.editingProjectionId, {
      quadPoints,
      quadEditing
    });
    this.compatibilityAdapter.updateProjectionForObject(projection.objectId, {
      quadPoints,
      quadEditing
    });
    console.log(`${this.logPrefix} world point`, {
      projectionId: this.editingProjectionId,
      index,
      world: nextPoint.position
    });

    if (!quadEditing) {
      // 收到第 4 个点后会自动结束采点，
      // 但真正应用投影仍然需要用户显式执行一次操作。
      this.editingProjectionId = null;
    }

    return quadPoints;
  }

  clear(projectionId) {
    const projection = this.projectionRegistry.get(projectionId);
    if (!projection) {
      return false;
    }

    this.projectionRegistry.update(projectionId, {
      enabled: false,
      quadEditing: false,
      quadPoints: []
    });
    this.compatibilityAdapter.updateProjectionForObject(projection.objectId, {
      enabled: false,
      quadEditing: false,
      quadPoints: []
    });

    if (this.editingProjectionId === projectionId) {
      this.editingProjectionId = null;
    }
    return true;
  }

  apply(projectionId) {
    const projection = this.projectionRegistry.get(projectionId);
    if (!projection || projection.quadPoints.length !== 4) {
      return false;
    }

    // apply 这里只切换状态；渲染器后续会直接复用已经持久化的四点锚点。
    this.projectionRegistry.update(projectionId, {
      enabled: true,
      quadEditing: false
    });
    this.compatibilityAdapter.updateProjectionForObject(projection.objectId, {
      enabled: true,
      quadEditing: false
    });

    if (this.editingProjectionId === projectionId) {
      this.editingProjectionId = null;
    }
    return true;
  }

  cancel() {
    return this.stop();
  }

  getEditingState() {
    return {
      projectionId: this.editingProjectionId
    };
  }
}
