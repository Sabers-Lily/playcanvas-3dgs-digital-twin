import fs from 'node:fs';
import path from 'node:path';

const CONFIG_FILE_NAME = 'desktop-shell.json';

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.warn('[DesktopConfig] read failed:', filePath, error);
    return null;
  }
}

function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function loadDesktopConfig({ userDataDir, defaultAppDataDir, packagedFfmpegPath }) {
  const configPath = path.join(userDataDir, CONFIG_FILE_NAME);
  const existingConfig = readJsonFile(configPath) ?? {};
  const nextConfig = {
    appDataDir: typeof existingConfig.appDataDir === 'string' && existingConfig.appDataDir.trim()
      ? path.resolve(existingConfig.appDataDir.trim())
      : defaultAppDataDir,
    ffmpegPath: typeof existingConfig.ffmpegPath === 'string' && existingConfig.ffmpegPath.trim()
      ? path.resolve(existingConfig.ffmpegPath.trim())
      : (packagedFfmpegPath || '')
  };

  writeJsonFile(configPath, nextConfig);

  return {
    configPath,
    config: nextConfig
  };
}

export function updateDesktopConfig(configPath, patch = {}) {
  const currentConfig = readJsonFile(configPath) ?? {};
  const nextConfig = {
    ...currentConfig,
    ...patch
  };

  writeJsonFile(configPath, nextConfig);
  return nextConfig;
}
