import { validateProjectFile } from '../../../../../packages/shared/src/project.js';

export async function openProject({
  project,
  runtime,
  refreshAssets
}) {
  const normalizedProject = validateProjectFile(project);

  await refreshAssets?.();
  runtime?.clearSceneForProjectOpen?.();

  const result = await runtime?.restoreSceneObjectsFromPayload?.(
    normalizedProject.scene?.objects ?? []
  );

  runtime?.restoreCameraView?.(normalizedProject.view ?? null);

  if (normalizedProject.scene?.selectedObjectId) {
    runtime?.selectSceneObject?.(normalizedProject.scene.selectedObjectId);
  }

  return {
    project: normalizedProject,
    restoredCount: result?.restoredCount ?? 0,
    missingAssets: Array.isArray(result?.missingAssets) ? result.missingAssets : []
  };
}
