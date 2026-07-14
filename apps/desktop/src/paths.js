import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDesktopConfig } from './configStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function ensureDirectory(pathname) {
  fs.mkdirSync(pathname, { recursive: true });
  return pathname;
}

export function getRuntimeRoot(app) {
  return app.isPackaged
    ? app.getAppPath()
    : path.resolve(__dirname, '../../..');
}

export function getDesktopPaths(app) {
  const runtimeRoot = getRuntimeRoot(app);
  const userDataDir = app.getPath('userData');
  const packagedFfmpegPath = path.join(process.resourcesPath, 'bin', 'ffmpeg.exe');
  const desktopConfig = loadDesktopConfig({
    userDataDir,
    defaultAppDataDir: path.join(userDataDir, 'runtime-data'),
    packagedFfmpegPath: fs.existsSync(packagedFfmpegPath) ? packagedFfmpegPath : ''
  });
  const appDataDir = ensureDirectory(desktopConfig.config.appDataDir);
  const projectsDir = ensureDirectory(path.join(appDataDir, 'projects'));
  const assetsDir = ensureDirectory(path.join(appDataDir, 'assets'));
  const hlsCacheDir = ensureDirectory(path.join(appDataDir, 'hls-cache'));
  const logsDir = ensureDirectory(path.join(appDataDir, 'logs'));
  const webDistDir = path.join(runtimeRoot, 'apps', 'web', 'dist');
  const apiServerEntry = path.join(runtimeRoot, 'apps', 'api', 'src', 'server.js');

  return {
    runtimeRoot,
    userDataDir,
    configPath: desktopConfig.configPath,
    config: desktopConfig.config,
    appDataDir,
    projectsDir,
    assetsDir,
    hlsCacheDir,
    logsDir,
    webDistDir,
    webIndexPath: path.join(webDistDir, 'index.html'),
    apiServerEntry,
    ffmpegPath: desktopConfig.config.ffmpegPath
  };
}
