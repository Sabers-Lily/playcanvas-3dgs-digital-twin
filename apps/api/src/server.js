import http from 'node:http';
import { extname } from 'node:path';
import { API_VERSION, API_SERVICE_NAME, API_STAGE, createApiSuccess, createApiError } from '../../../packages/shared/src/api.js';
import { handleScenesRoute } from './routes/scenes.js';
import { handleAssetsRoute } from './routes/assets.js';
import { handleCamerasRoute } from './routes/cameras.js';
import { initializeAssetStore } from './store/assetStore.js';
import { initializeSceneStore } from './store/memoryStore.js';
import { RtspHlsService } from './services/rtspHlsService.js';

const PORT = Number.parseInt(process.env.PORT ?? '3000', 10);
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
const rtspHlsService = new RtspHlsService();

function applyCorsHeaders(response) {
  response.setHeader('Access-Control-Allow-Origin', WEB_ORIGIN);
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function writeJson(response, statusCode, payload) {
  applyCorsHeaders(response);
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(JSON.stringify(payload, null, 2));
}

function writeBuffer(response, statusCode, buffer, contentType = 'application/octet-stream') {
  applyCorsHeaders(response);
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

function writeOptions(response) {
  applyCorsHeaders(response);
  response.writeHead(204);
  response.end();
}

function getStreamContentType(pathname) {
  const extension = extname(pathname).toLowerCase();

  if (extension === '.m3u8') {
    return 'application/vnd.apple.mpegurl';
  }

  if (extension === '.ts') {
    return 'video/mp2t';
  }

  return 'application/octet-stream';
}

function handleStreamRequest(request, response, pathname) {
  const match = pathname.match(/^\/streams\/([^/]+)\/(.+)$/u);
  if (!match || request.method !== 'GET') {
    return false;
  }

  const cameraId = decodeURIComponent(match[1]);
  const relativePath = decodeURIComponent(match[2]);
  const buffer = rtspHlsService.getStreamFileBuffer(cameraId, relativePath);
  if (!buffer) {
    const status = rtspHlsService.getStatus(cameraId);
    if (status.lastErrorCode === 'FFMPEG_NOT_FOUND') {
      writeJson(response, 503, createApiError('FFMPEG_NOT_FOUND', status.lastError));
      return true;
    }
    writeJson(response, 404, createApiError('STREAM_FILE_NOT_FOUND', `Stream file not found: ${cameraId}/${relativePath}`));
    return true;
  }

  writeBuffer(response, 200, buffer, getStreamContentType(relativePath));
  return true;
}

async function startServer() {
  await initializeSceneStore();
  await initializeAssetStore();

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

      if (request.method === 'OPTIONS') {
        writeOptions(response);
        return;
      }

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

      if (await handleCamerasRoute(request, response, url.pathname, writeJson, rtspHlsService)) {
        return;
      }

      if (handleStreamRequest(request, response, url.pathname)) {
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
