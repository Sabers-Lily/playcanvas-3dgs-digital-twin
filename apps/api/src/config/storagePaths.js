import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRootDir = path.resolve(__dirname, '../..');
const repoRootDir = path.resolve(apiRootDir, '..', '..');
const appDataRoot = process.env.APP_DATA_DIR
  ? path.resolve(process.env.APP_DATA_DIR)
  : apiRootDir;

export function getApiRootDir() {
  return apiRootDir;
}

export function getRepoRootDir() {
  return repoRootDir;
}

export function getAppDataRoot() {
  return appDataRoot;
}

export function getAssetDataDir() {
  return path.resolve(appDataRoot, 'assets', 'data');
}

export function getAssetStorageDir() {
  return path.resolve(appDataRoot, 'assets', 'storage');
}

export function getAssetIndexFilePath() {
  return path.join(getAssetDataDir(), 'assets.json');
}

export function getProjectsDir() {
  return path.resolve(appDataRoot, 'projects');
}

export function getScenesDir() {
  return path.resolve(appDataRoot, 'scenes');
}

export function getHlsCacheRoot() {
  return path.resolve(appDataRoot, 'hls-cache');
}

export function getLogsDir() {
  return path.resolve(appDataRoot, 'logs');
}

export function resolveAppDataPath(...segments) {
  return path.resolve(appDataRoot, ...segments);
}
