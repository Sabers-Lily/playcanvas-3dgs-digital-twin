import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';

function requestJson(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, (response) => {
      const chunks = [];

      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if (response.statusCode !== 200) {
          reject(new Error(`Unexpected API status ${response.statusCode}: ${body}`));
          return;
        }

        resolve(body);
      });
    });

    request.on('error', reject);
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (!address || typeof address === 'string') {
          reject(new Error('Failed to allocate API port'));
          return;
        }

        resolve(address.port);
      });
    });
  });
}

async function waitForApiReady(apiBaseUrl, childProcess) {
  const healthUrl = `${apiBaseUrl}/api/health`;
  const startedAt = Date.now();

  while (Date.now() - startedAt < 15000) {
    if (childProcess.exitCode !== null) {
      throw new Error(`API process exited early with code ${childProcess.exitCode}`);
    }

    try {
      await requestJson(healthUrl);
      return;
    } catch (_error) {
      await wait(250);
    }
  }

  throw new Error(`Timed out waiting for API at ${healthUrl}`);
}

function pipeApiLogs(childProcess, logsDir) {
  const outputPath = path.join(logsDir, 'desktop-api.log');
  const logStream = fs.createWriteStream(outputPath, { flags: 'a' });

  const writeLog = (prefix, chunk) => {
    const text = chunk.toString();
    logStream.write(`[${new Date().toISOString()}] ${prefix}${text}`);
  };

  childProcess.stdout?.on('data', (chunk) => writeLog('stdout ', chunk));
  childProcess.stderr?.on('data', (chunk) => writeLog('stderr ', chunk));
  childProcess.once('exit', () => {
    logStream.end();
  });
}

export async function startApiProcess({ serverEntry, appDataDir, logsDir, ffmpegPath }) {
  const port = await findAvailablePort();
  const apiBaseUrl = `http://127.0.0.1:${port}`;
  const childProcess = spawn(process.execPath, [serverEntry], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      HOST: '127.0.0.1',
      PORT: String(port),
      WEB_ORIGIN: '*',
      APP_DATA_DIR: appDataDir,
      FFMPEG_PATH: ffmpegPath || process.env.FFMPEG_PATH || process.env.FFMPEG_BIN || 'ffmpeg'
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });

  pipeApiLogs(childProcess, logsDir);

  childProcess.once('error', (error) => {
    console.error('[DesktopAPI] process start failed:', error);
  });

  await waitForApiReady(apiBaseUrl, childProcess);

  console.log('[DesktopAPI] started:', {
    apiBaseUrl,
    serverEntry
  });

  return {
    childProcess,
    apiBaseUrl,
    port
  };
}

export async function stopApiProcess(apiRuntime) {
  if (!apiRuntime?.childProcess || apiRuntime.childProcess.exitCode !== null) {
    return;
  }

  apiRuntime.childProcess.kill('SIGTERM');
  await wait(300);

  if (apiRuntime.childProcess.exitCode === null) {
    apiRuntime.childProcess.kill('SIGKILL');
  }
}
