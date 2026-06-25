import http from 'node:http';
import { API_VERSION, API_SERVICE_NAME, API_STAGE, createApiSuccess, createApiError } from '../../../packages/shared/src/api.js';
import { handleScenesRoute } from './routes/scenes.js';
import { handleAssetsRoute } from './routes/assets.js';
import { initializeAssetStore } from './store/assetStore.js';
import { initializeSceneStore } from './store/memoryStore.js';

const PORT = Number.parseInt(process.env.PORT ?? '3000', 10);

function writeJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(JSON.stringify(payload, null, 2));
}

function writeBuffer(response, statusCode, buffer, contentType = 'application/octet-stream') {
  response.writeHead(statusCode, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
    'Content-Length': buffer.length
  });
  response.end(buffer);
}

function getHealthPayload() {
  return {
    service: API_SERVICE_NAME,
    version: API_VERSION
  };
}

function getVersionPayload() {
  return {
    name: '3dgs-digital-twin',
    apiVersion: API_VERSION,
    stage: API_STAGE
  };
}

async function startServer() {
  await initializeSceneStore();
  await initializeAssetStore();

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

      if (request.method === 'GET' && (url.pathname === '/health' || url.pathname === '/api/health')) {
        writeJson(response, 200, createApiSuccess(getHealthPayload()));
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/version') {
        writeJson(response, 200, createApiSuccess(getVersionPayload()));
        return;
      }

      if (await handleScenesRoute(request, response, url.pathname, writeJson)) {
        return;
      }

      if (await handleAssetsRoute(request, response, url.pathname, writeJson, writeBuffer)) {
        return;
      }

      writeJson(response, 404, createApiError('NOT_FOUND', `Route not found: ${request.method ?? 'GET'} ${url.pathname}`));
    } catch (error) {
      if (error?.code === 'SCENE_FILE_INVALID') {
        writeJson(response, 500, createApiError('SCENE_FILE_INVALID', 'Scene file is invalid JSON'));
        return;
      }

      if (error?.code === 'SCENE_FILE_WRITE_FAILED') {
        writeJson(response, 500, createApiError('SCENE_FILE_WRITE_FAILED', 'Failed to write scene file'));
        return;
      }

      console.error('[API] unexpected error:', error);
      writeJson(response, 500, createApiError('INTERNAL_SERVER_ERROR', 'Internal server error'));
    }
  });

  server.listen(PORT, () => {
    console.log(`[API] server running at http://localhost:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error('[API] failed to start server:', error);
  process.exitCode = 1;
});
