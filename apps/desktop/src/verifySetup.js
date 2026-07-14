import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(desktopRoot, '..', '..');

function exists(label, targetPath, required = true) {
  const ok = Boolean(targetPath) && fs.existsSync(targetPath);
  const status = ok ? 'ok' : (required ? 'missing' : 'optional-missing');
  return { label, targetPath, ok, required, status };
}

function printEntry(entry) {
  console.log(`[DesktopVerify] ${entry.status}: ${entry.label}`, entry.targetPath);
}

function resolvePackageBinary(packageName) {
  try {
    return require.resolve(`${packageName}/package.json`, {
      paths: [desktopRoot]
    });
  } catch (_error) {
    try {
      return require.resolve(packageName, {
        paths: [desktopRoot]
      });
    } catch (_nextError) {
      return '';
    }
  }
}

const checks = [
  exists('desktop main', path.join(desktopRoot, 'src', 'main.js')),
  exists('electron builder config', path.join(desktopRoot, 'electron-builder.yml')),
  exists('web dist index', path.join(repoRoot, 'apps', 'web', 'dist', 'index.html')),
  exists('api server entry', path.join(repoRoot, 'apps', 'api', 'src', 'server.js')),
  exists('packaged ffmpeg directory', path.join(desktopRoot, 'resources', 'bin'), false),
  exists('electron dependency', resolvePackageBinary('electron')),
  exists('electron-builder dependency', resolvePackageBinary('electron-builder')),
  exists('obj2gltf dependency', resolvePackageBinary('obj2gltf')),
  exists('cesium dependency', resolvePackageBinary('cesium')),
  exists('fs-extra dependency', resolvePackageBinary('fs-extra')),
  exists('graceful-fs dependency', resolvePackageBinary('graceful-fs')),
  exists('jsonfile dependency', resolvePackageBinary('jsonfile')),
  exists('universalify dependency', resolvePackageBinary('universalify')),
  exists('bluebird dependency', resolvePackageBinary('bluebird')),
  exists('jpeg-js dependency', resolvePackageBinary('jpeg-js')),
  exists('mime dependency', resolvePackageBinary('mime')),
  exists('pngjs dependency', resolvePackageBinary('pngjs')),
  exists('yargs dependency', resolvePackageBinary('yargs'))
];

checks.forEach(printEntry);

if (checks.some((entry) => entry.required && !entry.ok)) {
  process.exitCode = 1;
}
