import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { CAMERA_SOURCES, CAMERA_STREAM_STATUSES } from '../../../../packages/shared/src/cameras.js';
import { getHlsCacheRoot } from '../config/storagePaths.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HLS_CACHE_ROOT = getHlsCacheRoot();
const FFMPEG_BIN = process.env.FFMPEG_PATH || process.env.FFMPEG_BIN || 'ffmpeg';
const FFMPEG_HLS_MODE = process.env.FFMPEG_HLS_MODE === 'copy' ? 'copy' : 'transcode';
const HLS_STALE_AFTER_MS = 8000;

function createServiceError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function ensureDirectory(path) {
  mkdirSync(path, { recursive: true });
}

function getCameraSource(cameraId) {
  return CAMERA_SOURCES.find((entry) => entry.id === cameraId) ?? null;
}

function readErrorText(buffer) {
  if (!buffer) {
    return null;
  }

  return String(buffer).trim() || null;
}

function isFfmpegErrorText(text) {
  if (!text) {
    return false;
  }

  return /error|failed|unable|invalid|timed out|not found|connection refused|404/iu.test(text);
}

function buildFfmpegArgs(cameraSource, outputFile) {
  const args = [
    '-rtsp_transport', 'tcp',
    '-fflags', 'nobuffer',
    '-flags', 'low_delay',
    '-i', cameraSource.rtspUrl,
    '-an'
  ];

  if (FFMPEG_HLS_MODE === 'transcode') {
    args.push(
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-tune', 'zerolatency',
      '-profile:v', 'baseline',
      '-pix_fmt', 'yuv420p',
      '-g', '30',
      '-keyint_min', '30',
      '-sc_threshold', '0',
      '-force_key_frames', 'expr:gte(t,n_forced*1)'
    );
  } else {
    args.push('-c:v', 'copy');
  }

  args.push(
    '-f', 'hls',
    '-hls_time', '1',
    '-hls_list_size', '5',
    '-hls_flags', 'delete_segments+append_list+independent_segments+omit_endlist',
    outputFile
  );

  return args;
}

function formatFfmpegNotFoundMessage() {
  return 'FFmpeg executable not found. Install ffmpeg or configure FFMPEG_PATH.';
}

function getFileModifiedAtMs(filePath) {
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    return statSync(filePath).mtimeMs;
  } catch (_error) {
    return null;
  }
}

function getFileAgeMs(filePath) {
  const modifiedAt = getFileModifiedAtMs(filePath);
  return modifiedAt === null ? null : Math.max(0, Date.now() - modifiedAt);
}

function isProcessAlive(childProcess) {
  return Boolean(childProcess && childProcess.exitCode === null && !childProcess.killed);
}

export class RtspHlsService {
  constructor() {
    ensureDirectory(HLS_CACHE_ROOT);
    this.streams = new Map();
    this._handleProcessExit = () => {
      Array.from(this.streams.keys()).forEach((cameraId) => {
        this.stop(cameraId, { cleanupFiles: false, silent: true }).catch((error) => {
          console.warn('[CameraStream] shutdown stop failed:', cameraId, error);
        });
      });
    };

    process.once('exit', this._handleProcessExit);
    process.once('SIGINT', () => {
      this._handleProcessExit();
      process.exit(0);
    });
    process.once('SIGTERM', () => {
      this._handleProcessExit();
      process.exit(0);
    });
  }

  getCameraOutputDir(cameraId) {
    return resolve(HLS_CACHE_ROOT, cameraId);
  }

  getPlaylistPath(cameraId) {
    return resolve(this.getCameraOutputDir(cameraId), 'index.m3u8');
  }

  getPlayUrl(cameraId) {
    return `/streams/${encodeURIComponent(cameraId)}/index.m3u8`;
  }

  cleanupOutput(cameraId) {
    const outputDir = this.getCameraOutputDir(cameraId);
    if (existsSync(outputDir)) {
      rmSync(outputDir, { recursive: true, force: true });
    }
    ensureDirectory(outputDir);
  }

  getFfmpegPath() {
    return FFMPEG_BIN;
  }

  checkFfmpegAvailable() {
    console.log('[CameraStream] ffmpeg path:', FFMPEG_BIN);
    const result = spawnSync(FFMPEG_BIN, ['-version'], {
      stdio: 'ignore',
      windowsHide: true
    });

    if (result.error) {
      throw createServiceError('FFMPEG_NOT_FOUND', formatFfmpegNotFoundMessage());
    }

    if (typeof result.status === 'number' && result.status !== 0) {
      throw createServiceError('FFMPEG_NOT_FOUND', formatFfmpegNotFoundMessage());
    }

    console.log('[CameraStream] ffmpeg available');
    return {
      ok: true,
      executablePath: FFMPEG_BIN
    };
  }

  setStreamError(cameraId, error) {
    const entry = this.streams.get(cameraId) ?? {
      cameraId,
      process: null,
      status: CAMERA_STREAM_STATUSES.ERROR,
      playUrl: this.getPlayUrl(cameraId),
      outputDir: this.getCameraOutputDir(cameraId),
      lastError: null,
      lastErrorCode: null,
      stderr: ''
    };

    entry.status = CAMERA_STREAM_STATUSES.ERROR;
    entry.lastError = error?.message || 'Unknown error';
    entry.lastErrorCode = error?.code || 'CAMERA_STREAM_FAILED';
    entry.process = null;
    this.streams.set(cameraId, entry);
    return entry;
  }

  start(cameraId) {
    const cameraSource = getCameraSource(cameraId);
    if (!cameraSource) {
      throw new Error(`Camera not found: ${cameraId}`);
    }

    const current = this.streams.get(cameraId);
    if (current?.status === CAMERA_STREAM_STATUSES.RUNNING || current?.status === CAMERA_STREAM_STATUSES.STARTING) {
      if (isProcessAlive(current.process)) {
        return Promise.resolve(this.getStatus(cameraId));
      }

      console.warn('[CameraStream] stale stream entry found, restarting:', {
        cameraId,
        status: current.status
      });
      this.streams.delete(cameraId);
    }

    try {
      this.checkFfmpegAvailable();
    } catch (error) {
      const entry = this.setStreamError(cameraId, error);
      console.error('[CameraStream] ffmpeg unavailable:', {
        cameraId,
        ffmpegPath: FFMPEG_BIN,
        error
      });
      return Promise.reject(createServiceError(entry.lastErrorCode, entry.lastError));
    }

    this.cleanupOutput(cameraId);
    const outputDir = this.getCameraOutputDir(cameraId);
    const outputFile = this.getPlaylistPath(cameraId);
    const ffmpegArgs = buildFfmpegArgs(cameraSource, outputFile);

    console.log('[CameraStream] starting ffmpeg:', { cameraId, mode: FFMPEG_HLS_MODE, outputFile });

    const child = spawn(FFMPEG_BIN, ffmpegArgs, {
      cwd: outputDir,
      stdio: ['ignore', 'ignore', 'pipe']
    });

    const entry = {
      cameraId,
      process: child,
      status: CAMERA_STREAM_STATUSES.STARTING,
      playUrl: this.getPlayUrl(cameraId),
      outputDir,
      lastError: null,
      lastErrorCode: null,
      stderr: ''
    };

    this.streams.set(cameraId, entry);

    child.stderr?.on('data', (chunk) => {
      entry.stderr += chunk.toString();
      const nextError = readErrorText(chunk);
      if (isFfmpegErrorText(nextError)) {
        entry.lastError = nextError;
        entry.lastErrorCode = entry.lastErrorCode ?? 'CAMERA_STREAM_FAILED';
      }
    });

    child.on('error', (error) => {
      entry.status = CAMERA_STREAM_STATUSES.ERROR;
      entry.lastError = error.message;
      entry.lastErrorCode = error?.code === 'ENOENT' ? 'FFMPEG_NOT_FOUND' : 'CAMERA_STREAM_FAILED';
      console.error('[CameraStream] ffmpeg error:', { cameraId, error });
    });

    child.on('exit', (code, signal) => {
      const latest = this.streams.get(cameraId);
      if (!latest || latest.process !== child) {
        return;
      }

      if (latest.status !== CAMERA_STREAM_STATUSES.STOPPED) {
        latest.status = code === 0 ? CAMERA_STREAM_STATUSES.STOPPED : CAMERA_STREAM_STATUSES.ERROR;
        latest.lastError = latest.lastError ?? `ffmpeg exited: code=${code ?? 'null'} signal=${signal ?? 'null'}`;
        latest.lastErrorCode = latest.lastErrorCode ?? (code === 0 ? null : 'CAMERA_STREAM_FAILED');
      }

      latest.process = null;
      console.warn('[CameraStream] ffmpeg exited:', {
        cameraId,
        code,
        signal,
        status: latest.status
      });
    });

    return new Promise((resolvePromise) => {
      const startedAt = Date.now();
      const poll = () => {
        const latest = this.streams.get(cameraId);
        const playlistExists = existsSync(outputFile);

        if (playlistExists) {
          latest.status = CAMERA_STREAM_STATUSES.RUNNING;
          latest.lastError = null;
          latest.lastErrorCode = null;
          console.log('[CameraStream] stream started:', { cameraId, playUrl: latest.playUrl });
          resolvePromise(this.getStatus(cameraId));
          return;
        }

        if (latest.status === CAMERA_STREAM_STATUSES.ERROR) {
          resolvePromise(this.getStatus(cameraId));
          return;
        }

        if (Date.now() - startedAt > 5000) {
          latest.status = CAMERA_STREAM_STATUSES.STARTING;
          resolvePromise(this.getStatus(cameraId));
          return;
        }

        setTimeout(poll, 200);
      };

      poll();
    });
  }

  stop(cameraId, options = {}) {
    const entry = this.streams.get(cameraId);
    if (!entry) {
      if (options.cleanupFiles !== false) {
        this.cleanupOutput(cameraId);
      }
      return Promise.resolve({
        cameraId,
        status: CAMERA_STREAM_STATUSES.STOPPED,
        lastError: null,
        lastErrorCode: null,
        playUrl: this.getPlayUrl(cameraId)
      });
    }

    entry.status = CAMERA_STREAM_STATUSES.STOPPED;

    if (entry.process) {
      entry.process.kill('SIGTERM');
      entry.process = null;
    }

    if (options.cleanupFiles !== false) {
      this.cleanupOutput(cameraId);
    }

    if (!options.silent) {
      console.log('[CameraStream] stream stopped:', { cameraId });
    }

    return Promise.resolve(this.getStatus(cameraId));
  }

  getStatus(cameraId) {
    const entry = this.streams.get(cameraId);
    const outputDir = this.getCameraOutputDir(cameraId);
    const playlistPath = this.getPlaylistPath(cameraId);
    const playlistExists = existsSync(playlistPath);
    const playlistAgeMs = getFileAgeMs(playlistPath);
    const segmentCount = existsSync(outputDir)
      ? readdirSync(outputDir).filter((fileName) => fileName.toLowerCase().endsWith('.ts')).length
      : 0;

    if (!entry) {
      return {
        cameraId,
        status: CAMERA_STREAM_STATUSES.STOPPED,
        lastError: null,
        lastErrorCode: null,
        ffmpegPath: this.getFfmpegPath(),
        outputDir,
        indexExists: playlistExists,
        playlistAgeMs,
        segmentCount,
        playUrl: this.getPlayUrl(cameraId)
      };
    }

    if (entry.status === CAMERA_STREAM_STATUSES.STARTING && playlistExists && isProcessAlive(entry.process)) {
      entry.status = CAMERA_STREAM_STATUSES.RUNNING;
    }

    if (
      entry.status === CAMERA_STREAM_STATUSES.RUNNING &&
      (!isProcessAlive(entry.process) || (playlistAgeMs !== null && playlistAgeMs > HLS_STALE_AFTER_MS))
    ) {
      entry.status = CAMERA_STREAM_STATUSES.ERROR;
      entry.lastError = !isProcessAlive(entry.process)
        ? 'ffmpeg process is not running'
        : `HLS output is stale: playlistAgeMs=${Math.round(playlistAgeMs)}`;
      entry.lastErrorCode = 'CAMERA_STREAM_STALE';
    }

    if (!entry.lastError && existsSync(outputDir)) {
      const files = readdirSync(outputDir);
      if (!files.length && entry.status === CAMERA_STREAM_STATUSES.ERROR) {
        entry.lastError = 'RTSP unavailable or ffmpeg produced no HLS output';
        entry.lastErrorCode = entry.lastErrorCode ?? 'CAMERA_STREAM_FAILED';
      }
    }

    return {
      cameraId,
      status: entry.status,
      lastError: entry.lastError,
      lastErrorCode: entry.lastErrorCode ?? null,
      ffmpegPath: this.getFfmpegPath(),
      outputDir,
      indexExists: playlistExists,
      playlistAgeMs,
      segmentCount,
      playUrl: this.getPlayUrl(cameraId)
    };
  }

  resolveStreamFile(cameraId, relativePath) {
    const safePath = relativePath.replace(/\\/gu, '/');
    const resolvedPath = resolve(this.getCameraOutputDir(cameraId), safePath);
    const outputDir = this.getCameraOutputDir(cameraId);

    if (!resolvedPath.startsWith(outputDir)) {
      return null;
    }

    return resolvedPath;
  }

  getStreamFileBuffer(cameraId, relativePath) {
    const filePath = this.resolveStreamFile(cameraId, relativePath);
    if (!filePath || !existsSync(filePath)) {
      return null;
    }

    return readFileSync(filePath);
  }
}
