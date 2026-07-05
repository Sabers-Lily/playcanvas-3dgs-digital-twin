import { createApiError, createApiSuccess } from '../../../../packages/shared/src/api.js';
import { CAMERA_SOURCES, toPublicCameraSource } from '../../../../packages/shared/src/cameras.js';

function cameraNotFound() {
  return createApiError('CAMERA_NOT_FOUND', 'Camera not found');
}

function cameraDisabled() {
  return createApiError('CAMERA_DISABLED', 'Camera is disabled');
}

function cameraStreamFailed(message = 'Camera stream operation failed') {
  return createApiError('CAMERA_STREAM_FAILED', message);
}

function ffmpegNotFound(message = 'FFmpeg executable not found') {
  return createApiError('FFMPEG_NOT_FOUND', message);
}

function buildAbsoluteUrl(request, path) {
  const protocol = request.headers['x-forwarded-proto'] ?? 'http';
  const host = request.headers.host ?? 'localhost:3000';
  return `${protocol}://${host}${path}`;
}

function buildStreamPayload(request, cameraId) {
  const playUrl = `/streams/${encodeURIComponent(cameraId)}/index.m3u8`;

  return {
    cameraId,
    streamMode: 'hls',
    playUrl,
    absolutePlayUrl: buildAbsoluteUrl(request, playUrl)
  };
}

function getCameraSource(cameraId) {
  return CAMERA_SOURCES.find((entry) => entry.id === cameraId) ?? null;
}

export async function handleCamerasRoute(request, response, pathname, writeJson, rtspHlsService) {
  if (request.method === 'GET' && pathname === '/api/cameras') {
    writeJson(response, 200, createApiSuccess(CAMERA_SOURCES.map((entry) => toPublicCameraSource(entry))));
    return true;
  }

  const match = pathname.match(/^\/api\/cameras\/([^/]+)(?:\/(stream(?:\/(start|stop))?|status))?$/u);
  if (!match) {
    return false;
  }

  const cameraId = decodeURIComponent(match[1]);
  const subRoute = match[2] ?? '';
  const action = match[3] ?? '';
  const cameraSource = getCameraSource(cameraId);

  if (!cameraSource) {
    writeJson(response, 404, cameraNotFound());
    return true;
  }

  if (request.method === 'GET' && !subRoute) {
    writeJson(response, 200, createApiSuccess(toPublicCameraSource(cameraSource)));
    return true;
  }

  if (cameraSource.enabled === false) {
    writeJson(response, 409, cameraDisabled());
    return true;
  }

  if (request.method === 'GET' && subRoute === 'stream') {
    writeJson(response, 200, createApiSuccess(buildStreamPayload(request, cameraId)));
    return true;
  }

  if (request.method === 'GET' && subRoute === 'status') {
    const status = rtspHlsService.getStatus(cameraId);
    writeJson(response, 200, createApiSuccess({
      cameraId,
      status: status.status,
      lastError: status.lastError,
      lastErrorCode: status.lastErrorCode ?? null,
      ffmpegPath: status.ffmpegPath ?? null,
      outputDir: status.outputDir ?? null,
      indexExists: status.indexExists ?? false,
      segmentCount: status.segmentCount ?? 0,
      playUrl: status.playUrl,
      absolutePlayUrl: buildAbsoluteUrl(request, status.playUrl)
    }));
    return true;
  }

  if (request.method === 'POST' && subRoute === 'stream/start' && action === 'start') {
    try {
      const status = await rtspHlsService.start(cameraId);
      if (status.status === 'error') {
        throw new Error(status.lastError || 'Camera stream start failed');
      }
      writeJson(response, 200, createApiSuccess({
        cameraId,
        status: status.status,
        playUrl: status.playUrl,
        absolutePlayUrl: buildAbsoluteUrl(request, status.playUrl)
      }));
      return true;
    } catch (error) {
      console.error('[CameraStream] start failed:', error);
      if (error?.code === 'FFMPEG_NOT_FOUND') {
        writeJson(response, 503, ffmpegNotFound(error.message));
        return true;
      }
      writeJson(response, 500, cameraStreamFailed(error?.message || 'Camera stream start failed'));
      return true;
    }
  }

  if (request.method === 'POST' && subRoute === 'stream/stop' && action === 'stop') {
    try {
      const status = await rtspHlsService.stop(cameraId);
      writeJson(response, 200, createApiSuccess({
        cameraId,
        status: status.status,
        playUrl: status.playUrl,
        absolutePlayUrl: buildAbsoluteUrl(request, status.playUrl)
      }));
      return true;
    } catch (error) {
      console.error('[CameraStream] stop failed:', error);
      writeJson(response, 500, cameraStreamFailed(error?.message || 'Camera stream stop failed'));
      return true;
    }
  }

  return false;
}
