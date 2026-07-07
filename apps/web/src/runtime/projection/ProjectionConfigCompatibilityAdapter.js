import { CAMERA_SOURCE_TYPES } from '../../../../../packages/shared/src/cameras.js';

function cloneQuadPoints(points = []) {
  return Array.isArray(points)
    ? points.map((point, index) => ({
        ...(point ?? {}),
        index: point?.index ?? index,
        position: Array.isArray(point?.position) ? [...point.position] : [0, 0, 0]
      }))
    : [];
}

export class ProjectionConfigCompatibilityAdapter {
  constructor({
    sceneObjectManager,
    createDefaultVideoProjectionMetadata,
    sourceRegistry,
    projectionRegistry,
    logPrefix = '[ProjectionCompatibilityAdapter]'
  } = {}) {
    this.sceneObjectManager = sceneObjectManager;
    this.createDefaultVideoProjectionMetadata = createDefaultVideoProjectionMetadata;
    this.sourceRegistry = sourceRegistry;
    this.projectionRegistry = projectionRegistry;
    this.logPrefix = logPrefix;
  }

  getSourceIdForObject(objectId) {
    return `camera-source:${objectId}`;
  }

  getProjectionIdForObject(objectId) {
    return `projection:${objectId}`;
  }

  hydrateSceneObject(sceneObject) {
    if (!sceneObject || sceneObject.type !== 'cameraDevice') {
      return null;
    }

    const legacyProjection = this.createDefaultVideoProjectionMetadata(
      sceneObject.id,
      sceneObject.metadata?.videoProjection
    );
    const sourceId = this.getSourceIdForObject(sceneObject.id);
    const projectionId = this.getProjectionIdForObject(sceneObject.id);

    const sourceConfig = this.sourceRegistry.upsert({
      id: sourceId,
      type: legacyProjection.sourceType ?? CAMERA_SOURCE_TYPES.CAMERA_STREAM,
      cameraId: legacyProjection.cameraId,
      streamUrl: legacyProjection.streamUrl ?? '',
      videoUrl: legacyProjection.videoUrl ?? '',
      enabled: true,
      metadata: {
        objectId: sceneObject.id
      }
    });

    const projectionConfig = this.projectionRegistry.upsert({
      id: projectionId,
      objectId: sceneObject.id,
      sourceId: sourceConfig.id,
      enabled: legacyProjection.enabled,
      mode: legacyProjection.mode,
      quadPoints: cloneQuadPoints(legacyProjection.quadPoints),
      opacity: legacyProjection.opacity,
      softEdge: legacyProjection.softEdge,
      flipY: legacyProjection.flipY,
      replaceMode: legacyProjection.replaceMode,
      quadPlaneTolerance: legacyProjection.quadPlaneTolerance,
      projectorFov: legacyProjection.projectorFov,
      projectorAspect: legacyProjection.projectorAspect,
      projectorNear: legacyProjection.projectorNear,
      projectorFar: legacyProjection.projectorFar,
      quadEditing: legacyProjection.quadEditing
    });

    return {
      sourceConfig,
      projectionConfig
    };
  }

  updateProjectionForObject(objectId, patch = {}) {
    const sceneObject = this.sceneObjectManager.getObject(objectId);
    if (!sceneObject || sceneObject.type !== 'cameraDevice') {
      return null;
    }

    const legacyProjection = this.createDefaultVideoProjectionMetadata(
      objectId,
      sceneObject.metadata?.videoProjection
    );
    const hydrated = this.hydrateSceneObject(sceneObject);
    const currentProjection = hydrated?.projectionConfig ?? null;
    const currentSource = hydrated?.sourceConfig ?? null;
    if (!currentProjection || !currentSource) {
      return null;
    }

    const nextSource = this.sourceRegistry.update(currentSource.id, {
      type: patch.sourceType ?? legacyProjection.sourceType ?? currentSource.type,
      cameraId: patch.cameraId ?? legacyProjection.cameraId ?? currentSource.cameraId,
      streamUrl: patch.streamUrl ?? legacyProjection.streamUrl ?? currentSource.streamUrl,
      videoUrl: patch.videoUrl ?? legacyProjection.videoUrl ?? currentSource.videoUrl
    });

    const projectionBase = {
      ...currentProjection,
      enabled: legacyProjection.enabled,
      mode: legacyProjection.mode,
      quadPoints: cloneQuadPoints(legacyProjection.quadPoints),
      opacity: legacyProjection.opacity,
      softEdge: legacyProjection.softEdge,
      flipY: legacyProjection.flipY,
      replaceMode: legacyProjection.replaceMode,
      quadPlaneTolerance: legacyProjection.quadPlaneTolerance,
      projectorFov: legacyProjection.projectorFov,
      projectorAspect: legacyProjection.projectorAspect,
      projectorNear: legacyProjection.projectorNear,
      projectorFar: legacyProjection.projectorFar,
      quadEditing: legacyProjection.quadEditing
    };

    const nextProjection = this.projectionRegistry.update(currentProjection.id, {
      ...projectionBase,
      ...patch,
      sourceId: nextSource.id
    });

    const nextLegacyProjection = this.createDefaultVideoProjectionMetadata(objectId, {
      ...legacyProjection,
      ...patch,
      enabled: patch.enabled ?? nextProjection.enabled,
      sourceType: nextSource.type,
      cameraId: nextSource.cameraId,
      streamUrl: nextSource.streamUrl || null,
      videoUrl: nextSource.videoUrl || ''
    });

    this.sceneObjectManager.updateObject(objectId, {
      metadata: {
        ...sceneObject.metadata,
        videoProjection: nextLegacyProjection
      }
    });

    return nextLegacyProjection;
  }

  removeObject(objectId) {
    this.sourceRegistry.remove(this.getSourceIdForObject(objectId));
    this.projectionRegistry.remove(this.getProjectionIdForObject(objectId));
  }
}
