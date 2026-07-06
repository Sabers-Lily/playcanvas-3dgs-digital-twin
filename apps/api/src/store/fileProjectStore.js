import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProjectFile, validateProjectFile } from '../../../../packages/shared/src/project.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRootDir = path.resolve(__dirname, '../..');
const projectsDir = path.resolve(apiRootDir, '.data/projects');

function getProjectDir(projectId) {
  return path.join(projectsDir, projectId);
}

function getProjectFilePath(projectId) {
  return path.join(getProjectDir(projectId), 'project.json');
}

export async function ensureProjectDataDir() {
  await fs.mkdir(projectsDir, { recursive: true });
}

export async function saveProjectFile(project) {
  await ensureProjectDataDir();
  const normalizedProject = validateProjectFile(createProjectFile(project));
  const projectDir = getProjectDir(normalizedProject.projectId);
  const filePath = getProjectFilePath(normalizedProject.projectId);

  try {
    await fs.mkdir(projectDir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(normalizedProject, null, 2), 'utf8');
    return {
      projectId: normalizedProject.projectId,
      path: path.relative(apiRootDir, filePath).replace(/\\/gu, '/'),
      project: normalizedProject
    };
  } catch (_error) {
    const error = new Error('Failed to write project file');
    error.code = 'PROJECT_FILE_WRITE_FAILED';
    throw error;
  }
}

export async function loadProjectFile(projectId) {
  await ensureProjectDataDir();
  const filePath = getProjectFilePath(projectId);

  try {
    const content = await fs.readFile(filePath, 'utf8');
    return validateProjectFile(JSON.parse(content));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }

    if (error instanceof SyntaxError || error?.code === 'PROJECT_FILE_INVALID' || error?.code === 'PROJECT_VERSION_UNSUPPORTED') {
      const invalidError = new Error('Project file is invalid JSON');
      invalidError.code = 'PROJECT_FILE_INVALID';
      throw invalidError;
    }

    throw error;
  }
}

export async function listStoredProjects() {
  await ensureProjectDataDir();

  try {
    const entries = await fs.readdir(projectsDir, { withFileTypes: true });
    const projects = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      try {
        const project = await loadProjectFile(entry.name);
        if (!project) {
          continue;
        }

        projects.push({
          projectId: project.projectId,
          name: project.name,
          updatedAt: project.updatedAt,
          createdAt: project.createdAt,
          objectCount: project.scene?.objects?.length ?? 0,
          assetCount: project.assets?.length ?? 0
        });
      } catch (error) {
        console.warn('[ProjectStore] skip invalid project:', entry.name, error?.message || error);
      }
    }

    return projects.sort((left, right) => (
      new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime()
    ));
  } catch (_error) {
    return [];
  }
}
