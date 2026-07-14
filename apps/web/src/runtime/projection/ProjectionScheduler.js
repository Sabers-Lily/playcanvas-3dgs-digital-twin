export class ProjectionScheduler {
  constructor({
    maxActive = 4,
    logPrefix = '[ProjectionScheduler]'
  } = {}) {
    this.maxActive = Math.max(1, Number(maxActive) || 1);
    this.logPrefix = logPrefix;
    this.candidates = [];
    this.activeSet = [];
  }

  evaluate({
    projectionConfigs = [],
    sourceRegistry,
    runtimePool
  } = {}) {
    this.candidates = projectionConfigs.map((config) => {
      const source = sourceRegistry?.get(config.sourceId) ?? null;
      const runtimeState = source ? runtimePool?.getState(source.id) : null;
      const quadPointCount = config.quadPoints?.length ?? 0;
      const runtimeReady = Boolean(
        runtimeState &&
        Number(runtimeState.readyState ?? 0) >= 2 &&
        Number(runtimeState.videoWidth ?? 0) > 0 &&
        Number(runtimeState.videoHeight ?? 0) > 0 &&
        runtimeState.status !== 'error'
      );
      const eligible = Boolean(
        config.enabled &&
        source &&
        quadPointCount === 4 &&
        (source.streamUrl || source.videoUrl) &&
        runtimeReady
      );

      let score = 0;
      if (eligible) {
        score += config.pinned ? 10000 : 0;
        score += Number(config.priority ?? 0);
        score += quadPointCount * 10;
        score += runtimeState && !runtimeState.paused ? 25 : 0;
      }

      return {
        projectionId: config.id,
        sourceId: config.sourceId,
        objectId: config.objectId,
        eligible,
        score,
        runtimeState,
        runtimeReady
      };
    }).sort((left, right) => right.score - left.score);

    const nextActiveSet = this.candidates
      .filter((candidate) => candidate.eligible)
      .slice(0, this.maxActive)
      .map((candidate) => candidate.projectionId);

    const changed =
      nextActiveSet.length !== this.activeSet.length ||
      nextActiveSet.some((projectionId, index) => projectionId !== this.activeSet[index]);

    if (changed) {
      this.activeSet = nextActiveSet;
      console.log(`${this.logPrefix} active set changed`, {
        activeProjectionIds: [...this.activeSet],
        maxActive: this.maxActive
      });
    }

    return this.activeSet;
  }

  getCandidates() {
    return [...this.candidates];
  }

  getActiveSet() {
    return [...this.activeSet];
  }

  pin(projectionId) {
    return projectionId;
  }

  unpin(projectionId) {
    return projectionId;
  }

  setPriority(projectionId, priority) {
    return {
      projectionId,
      priority
    };
  }
}
