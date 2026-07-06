import { createApiError, createApiSuccess } from '../../../../packages/shared/src/api.js';
import { validateProjectFile } from '../../../../packages/shared/src/project.js';
import { listStoredProjects, loadProjectFile, saveProjectFile } from '../store/fileProjectStore.js';

function projectNotFound() {
  return createApiError('PROJECT_NOT_FOUND', 'Project not found');
}

function projectFileInvalid() {
  return createApiError('PROJECT_FILE_INVALID', 'Project file is invalid');
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

export async function handleProjectsRoute(request, response, pathname, writeJson) {
  if (request.method === 'GET' && pathname === '/api/projects') {
    writeJson(response, 200, createApiSuccess(await listStoredProjects()));
    return true;
  }

  if (request.method === 'POST' && pathname === '/api/projects/save') {
    try {
      const body = await readBody(request);
      const project = validateProjectFile(body?.project);
      const result = await saveProjectFile(project);
      writeJson(response, 200, createApiSuccess({
        projectId: result.projectId,
        path: result.path
      }));
    } catch (error) {
      if (error?.code === 'PROJECT_FILE_INVALID' || error?.code === 'PROJECT_VERSION_UNSUPPORTED') {
        writeJson(response, 400, projectFileInvalid());
        return true;
      }

      throw error;
    }

    return true;
  }

  const match = pathname.match(/^\/api\/projects\/([^/]+)$/u);
  if (!match) {
    return false;
  }

  const projectId = decodeURIComponent(match[1]);
  if (request.method === 'GET') {
    const project = await loadProjectFile(projectId);
    if (!project) {
      writeJson(response, 404, projectNotFound());
      return true;
    }

    writeJson(response, 200, createApiSuccess({
      project
    }));
    return true;
  }

  return false;
}
