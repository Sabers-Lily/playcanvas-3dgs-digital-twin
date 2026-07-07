export class ProjectionDiagnostics {
  constructor({
    sourceRegistry,
    runtimePool,
    projectionRegistry,
    scheduler,
    renderer
  } = {}) {
    this.sourceRegistry = sourceRegistry;
    this.runtimePool = runtimePool;
    this.projectionRegistry = projectionRegistry;
    this.scheduler = scheduler;
    this.renderer = renderer;
  }

  getProjectionDiagnostics(projectionId) {
    const config = this.projectionRegistry.get(projectionId);
    if (!config) {
      return null;
    }

    const source = this.sourceRegistry.get(config.sourceId);
    const runtime = source ? this.runtimePool.getState(source.id) : null;
    const schedulerCandidate = this.scheduler.getCandidates()
      .find((candidate) => candidate.projectionId === projectionId) ?? null;
    const rendererState = this.renderer.getRendererState()[projectionId] ?? null;

    return {
      projectionId,
      source: source
        ? {
            sourceId: source.id,
            sourceKey: runtime?.sourceKey ?? null
          }
        : null,
      runtime: runtime
        ? {
            status: runtime.status,
            currentTime: runtime.currentTime,
            readyState: runtime.readyState,
            paused: runtime.paused,
            videoWidth: runtime.videoWidth,
            videoHeight: runtime.videoHeight
          }
        : null,
      config: {
        enabled: config.enabled,
        quadPointCount: config.quadPoints?.length ?? 0
      },
      scheduler: schedulerCandidate
        ? {
            eligible: schedulerCandidate.eligible,
            score: schedulerCandidate.score,
            active: this.scheduler.getActiveSet().includes(projectionId)
          }
        : null,
      renderer: rendererState
    };
  }
}
