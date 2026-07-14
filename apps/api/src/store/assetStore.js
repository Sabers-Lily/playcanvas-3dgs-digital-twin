import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import {
  getApiRootDir,
  getAppDataRoot,
  getAssetDataDir,
  getAssetIndexFilePath,
  getAssetStorageDir,
  getRepoRootDir
} from '../config/storagePaths.js';

const repoRootDir = getRepoRootDir();
const apiRootDir = getApiRootDir();
const appDataRoot = getAppDataRoot();
const dataDir = getAssetDataDir();
const storageDir = getAssetStorageDir();
const indexFilePath = getAssetIndexFilePath();
const convertPlyScriptPath = path.resolve(repoRootDir, 'scripts/convert-ply-to-sog.mjs');
let obj2gltfLoader = null;

const ALLOWED_EXTENSIONS = new Map([
  ['.sog', { type: 'sog', mimeType: 'application/octet-stream', runtimeType: 'gsplat' }],
  ['.glb', { type: 'glb', mimeType: 'model/gltf-binary', runtimeType: 'model' }],
  ['.gltf', { type: 'gltf', mimeType: 'model/gltf+json', runtimeType: 'model' }],
  ['.obj', { type: 'obj', mimeType: 'text/plain', runtimeType: null }],
  ['.ply', { type: 'ply', mimeType: 'application/octet-stream', runtimeType: null }]
]);

function createAssetId(prefix = 'asset') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeSourceName(filename) {
  const base = path.basename(filename || 'asset');
  return base || 'asset';
}

function getStoredName(sourceName, role = 'source') {
  const extension = path.extname(sourceName).toLowerCase();
  return `${role === 'derived' ? 'converted' : 'original'}${extension}`;
}

function getStoragePath(assetId, storedName) {
  return path.join(storageDir, assetId, storedName);
}

function toStoragePathForIndex(assetId, storedName) {
  return `assets/storage/${assetId}/${storedName}`;
}

function getTypeInfoFromType(type) {
  const normalizedType = String(type || '').toLowerCase();
  return Array.from(ALLOWED_EXTENSIONS.values()).find((entry) => entry.type === normalizedType) ?? null;
}

function normalizeAssetRecord(record) {
  const typeInfo = getTypeInfoFromType(record.type);

  return {
    id: record.id,
    sourceAssetId: record.sourceAssetId ?? null,
    sourceName: record.sourceName,
    storedName: record.storedName,
    type: record.type,
    runtimeType: record.runtimeType ?? typeInfo?.runtimeType ?? null,
    role: record.role ?? 'source',
    status: record.status ?? (typeInfo?.runtimeType ? 'ready' : 'uploaded'),
    mimeType: record.mimeType,
    size: record.size,
    url: record.url,
    storagePath: record.storagePath,
    createdAt: record.createdAt,
    derivedAssetIds: Array.isArray(record.derivedAssetIds) ? [...record.derivedAssetIds] : [],
    error: record.error ?? null
  };
}

function decodeTextBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length <= 0) {
    return '';
  }

  const utf8Text = buffer.toString('utf8');
  if (!utf8Text.includes('\uFFFD')) {
    return utf8Text;
  }

  return buffer.toString('latin1');
}

function extractObjMaterialPaths(buffer) {
  const text = decodeTextBuffer(buffer);
  if (!text) {
    return [];
  }

  const paths = new Set();
  text.split(/\r?\n/u).forEach((line) => {
    const match = line.match(/^\s*mtllib\s+(.+?)\s*$/iu);
    if (!match?.[1]) {
      return;
    }

    paths.add(match[1].trim());
  });

  return [...paths];
}

async function ensureObjMaterialFiles(inputPath) {
  const assetDir = path.dirname(inputPath);
  const inputBuffer = await fs.readFile(inputPath);
  const materialPaths = extractObjMaterialPaths(inputBuffer);

  for (const relativePath of materialPaths) {
    const normalizedRelativePath = relativePath.replace(/[\\/]+/gu, path.sep);
    const absolutePath = path.resolve(assetDir, normalizedRelativePath);
    const relativeToAssetDir = path.relative(assetDir, absolutePath);

    if (
      !relativeToAssetDir ||
      relativeToAssetDir.startsWith('..') ||
      path.isAbsolute(relativeToAssetDir)
    ) {
      continue;
    }

    try {
      await fs.access(absolutePath);
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw error;
      }

      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.writeFile(
        absolutePath,
        '# Generated placeholder because the referenced OBJ material file was not uploaded.\n',
        'utf8'
      );
      console.warn('[AssetStore] OBJ material file missing, generated placeholder:', absolutePath);
    }
  }
}

async function ensureAssetDirs() {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(storageDir, { recursive: true });
}

async function readIndexFile() {
  await ensureAssetDirs();

  try {
    const content = await fs.readFile(indexFilePath, 'utf8');
    const parsed = JSON.parse(content);
    if (!parsed || !Array.isArray(parsed.assets)) {
      throw new Error('Asset index is invalid');
    }

    return {
      assets: parsed.assets.map(normalizeAssetRecord)
    };
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { assets: [] };
    }

    if (error instanceof SyntaxError || error.message === 'Asset index is invalid') {
      const invalidError = new Error('Asset index is invalid');
      invalidError.code = 'ASSET_INDEX_INVALID';
      throw invalidError;
    }

    throw error;
  }
}

async function writeIndexFile(index) {
  await ensureAssetDirs();

  try {
    await fs.writeFile(indexFilePath, JSON.stringify(index, null, 2), 'utf8');
  } catch (_error) {
    const writeError = new Error('Failed to write asset index');
    writeError.code = 'ASSET_WRITE_FAILED';
    throw writeError;
  }
}

function runSplatTransform(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [convertPlyScriptPath, inputPath, outputPath], {
      cwd: repoRootDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: false
    });
    let stdout = '';
    let stderr = '';

    console.log('[AssetProcessing] PLY input:', inputPath);
    console.log('[AssetProcessing] SOG output:', outputPath);
    console.log('[AssetProcessing] converter cwd:', repoRootDir);

    child.stdout?.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });

    child.stderr?.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });

    child.once('error', (error) => {
      reject(new Error(`Failed to start PLY -> SOG converter.\n${error?.message || error}`.trim(), { cause: error }));
    });

    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      if (signal) {
        reject(new Error(`PLY -> SOG converter exited because of signal: ${signal}\n${stderr || stdout}`.trim()));
        return;
      }

      reject(new Error(`PLY -> SOG converter exited with code: ${code}\n${stderr || stdout}`.trim()));
    });
  });
}

async function loadObj2Gltf() {
  if (!obj2gltfLoader) {
    obj2gltfLoader = import('obj2gltf').then((module) => module.default);
  }

  return obj2gltfLoader;
}

async function writeDerivedAssetFile(assetId, storedName, buffer) {
  const assetDir = path.join(storageDir, assetId);
  const filePath = getStoragePath(assetId, storedName);

  await fs.mkdir(assetDir, { recursive: true });
  await fs.writeFile(filePath, buffer);
  return filePath;
}

async function updateAssetIndex(assetId, updateFn) {
  const index = await readIndexFile();
  const asset = index.assets.find((entry) => entry.id === assetId);
  if (!asset) {
    const notFoundError = new Error('Asset not found');
    notFoundError.code = 'ASSET_NOT_FOUND';
    throw notFoundError;
  }

  updateFn(asset, index.assets);
  await writeIndexFile(index);
  return asset;
}

async function createDerivedAssetRecord({
  sourceAsset,
  derivedType,
  derivedRuntimeType,
  derivedSourceName,
  derivedStoredName
}) {
  const typeInfo = getTypeInfoFromType(derivedType);
  const derivedAssetId = createAssetId(`asset_${derivedType}`);
  const derivedRecord = normalizeAssetRecord({
    id: derivedAssetId,
    sourceAssetId: sourceAsset.id,
    sourceName: derivedSourceName,
    storedName: derivedStoredName,
    type: derivedType,
    runtimeType: derivedRuntimeType ?? typeInfo?.runtimeType ?? null,
    role: 'derived',
    status: 'processing',
    mimeType: typeInfo?.mimeType ?? 'application/octet-stream',
    size: 0,
    url: `/api/assets/${derivedAssetId}/file`,
    storagePath: toStoragePathForIndex(derivedAssetId, derivedStoredName),
    createdAt: new Date().toISOString()
  });

  const index = await readIndexFile();
  const sourceRecord = index.assets.find((entry) => entry.id === sourceAsset.id);
  if (!sourceRecord) {
    const notFoundError = new Error('Asset not found');
    notFoundError.code = 'ASSET_NOT_FOUND';
    throw notFoundError;
  }

  sourceRecord.derivedAssetIds = Array.isArray(sourceRecord.derivedAssetIds) ? sourceRecord.derivedAssetIds : [];
  if (!sourceRecord.derivedAssetIds.includes(derivedAssetId)) {
    sourceRecord.derivedAssetIds.push(derivedAssetId);
  }

  index.assets.unshift(derivedRecord);
  await writeIndexFile(index);
  return derivedRecord;
}

async function setAssetProcessingResult(assetId, patch) {
  return updateAssetIndex(assetId, (asset) => {
    Object.assign(asset, patch);
  });
}

async function setSourceAssetProcessingState(sourceAssetId, patch) {
  return updateAssetIndex(sourceAssetId, (asset) => {
    Object.assign(asset, patch);
  });
}

async function convertPlyToSogAsset(sourceAsset) {
  const derivedSourceName = `${path.basename(sourceAsset.sourceName, path.extname(sourceAsset.sourceName))}.sog`;
  const derivedStoredName = 'converted.sog';
  const derivedAsset = await createDerivedAssetRecord({
    sourceAsset,
    derivedType: 'sog',
    derivedRuntimeType: 'gsplat',
    derivedSourceName,
    derivedStoredName
  });

  const inputPath = path.resolve(appDataRoot, sourceAsset.storagePath);
  const outputPath = getStoragePath(derivedAsset.id, derivedStoredName);

  try {
    await setSourceAssetProcessingState(sourceAsset.id, {
      status: 'processing',
      error: null
    });
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await runSplatTransform(inputPath, outputPath);
    const stats = await fs.stat(outputPath);
    if (!stats.size || stats.size <= 0) {
      throw new Error('Converted SOG file is empty');
    }
    await setAssetProcessingResult(derivedAsset.id, {
      status: 'ready',
      size: stats.size,
      error: null
    });
    await setSourceAssetProcessingState(sourceAsset.id, {
      status: 'available',
      error: null
    });
    return {
      assetId: sourceAsset.id,
      status: 'processing',
      derivedAssetId: derivedAsset.id
    };
  } catch (error) {
    await fs.rm(outputPath, { force: true }).catch(() => {});
    await setAssetProcessingResult(derivedAsset.id, {
      status: 'failed',
      size: 0,
      error: error?.message || 'Failed to convert PLY to SOG'
    });
    await setSourceAssetProcessingState(sourceAsset.id, {
      status: 'uploaded',
      error: error?.message || 'Failed to convert PLY to SOG'
    });
    const convertError = new Error('Failed to convert PLY to SOG');
    convertError.code = 'ASSET_CONVERT_FAILED';
    convertError.cause = error;
    throw convertError;
  }
}

async function convertObjToGlbAsset(sourceAsset) {
  const derivedSourceName = `${path.basename(sourceAsset.sourceName, path.extname(sourceAsset.sourceName))}.glb`;
  const derivedStoredName = 'converted.glb';
  const derivedAsset = await createDerivedAssetRecord({
    sourceAsset,
    derivedType: 'glb',
    derivedRuntimeType: 'model',
    derivedSourceName,
    derivedStoredName
  });

  const inputPath = path.resolve(appDataRoot, sourceAsset.storagePath);
  const outputPath = getStoragePath(derivedAsset.id, derivedStoredName);

  try {
    await setSourceAssetProcessingState(sourceAsset.id, {
      status: 'processing',
      error: null
    });
    await ensureObjMaterialFiles(inputPath);
    const obj2gltf = await loadObj2Gltf();
    const glbBuffer = await obj2gltf(inputPath, { binary: true });
    await writeDerivedAssetFile(derivedAsset.id, derivedStoredName, glbBuffer);
    await setAssetProcessingResult(derivedAsset.id, {
      status: 'ready',
      size: glbBuffer.length,
      error: null
    });
    await setSourceAssetProcessingState(sourceAsset.id, {
      status: 'available',
      error: null
    });
    return {
      assetId: sourceAsset.id,
      status: 'processing',
      derivedAssetId: derivedAsset.id
    };
  } catch (error) {
    await setAssetProcessingResult(derivedAsset.id, {
      status: 'failed',
      error: error?.message || 'Failed to convert OBJ to GLB'
    });
    await setSourceAssetProcessingState(sourceAsset.id, {
      status: 'uploaded',
      error: error?.message || 'Failed to convert OBJ to GLB'
    });

    if (error?.code === 'ASSET_PROCESS_NOT_SUPPORTED') {
      throw error;
    }

    const convertError = new Error('Failed to convert OBJ to GLB');
    convertError.code = 'ASSET_CONVERT_FAILED';
    convertError.cause = error;
    throw convertError;
  }
}

function getReadyDerivedAsset(sourceAsset, assets) {
  const derivedIds = Array.isArray(sourceAsset.derivedAssetIds) ? sourceAsset.derivedAssetIds : [];
  return assets.find((entry) => derivedIds.includes(entry.id) && entry.role === 'derived' && entry.status === 'ready') ?? null;
}

function getDerivedAssets(sourceAsset, assets) {
  const derivedIds = Array.isArray(sourceAsset.derivedAssetIds) ? sourceAsset.derivedAssetIds : [];
  return assets.filter((entry) => derivedIds.includes(entry.id) && entry.role === 'derived');
}

function getLatestDerivedAsset(sourceAsset, assets, expectedType) {
  return getDerivedAssets(sourceAsset, assets)
    .filter((entry) => !expectedType || entry.type === expectedType)
    .sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime())[0] ?? null;
}

async function removeAssetStorage(assetId) {
  const assetDir = path.join(storageDir, assetId);

  try {
    await fs.rm(assetDir, { recursive: true, force: true });
  } catch (_error) {
    const writeError = new Error('Failed to delete asset file');
    writeError.code = 'ASSET_WRITE_FAILED';
    throw writeError;
  }
}

async function retryPlyDerivedAsset(sourceAsset, derivedAsset) {
  await removeAssetStorage(derivedAsset.id);
  await setAssetProcessingResult(derivedAsset.id, {
    storedName: 'converted.sog',
    storagePath: toStoragePathForIndex(derivedAsset.id, 'converted.sog'),
    status: 'processing',
    size: 0,
    error: null
  });

  const inputPath = path.resolve(appDataRoot, sourceAsset.storagePath);
  const outputPath = getStoragePath(derivedAsset.id, 'converted.sog');

  try {
    await setSourceAssetProcessingState(sourceAsset.id, {
      status: 'processing',
      error: null
    });
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await runSplatTransform(inputPath, outputPath);
    const stats = await fs.stat(outputPath);
    if (!stats.size || stats.size <= 0) {
      throw new Error('Converted SOG file is empty');
    }
    await setAssetProcessingResult(derivedAsset.id, {
      status: 'ready',
      size: stats.size,
      error: null
    });
    await setSourceAssetProcessingState(sourceAsset.id, {
      status: 'available',
      error: null
    });
    return {
      assetId: sourceAsset.id,
      status: 'processing',
      derivedAssetId: derivedAsset.id
    };
  } catch (error) {
    await fs.rm(outputPath, { force: true }).catch(() => {});
    await setAssetProcessingResult(derivedAsset.id, {
      status: 'failed',
      size: 0,
      error: error?.message || 'Failed to convert PLY to SOG'
    });
    await setSourceAssetProcessingState(sourceAsset.id, {
      status: 'uploaded',
      error: error?.message || 'Failed to convert PLY to SOG'
    });
    const convertError = new Error('Failed to convert PLY to SOG');
    convertError.code = 'ASSET_CONVERT_FAILED';
    convertError.cause = error;
    throw convertError;
  }
}

async function retryObjDerivedAsset(sourceAsset, derivedAsset) {
  await removeAssetStorage(derivedAsset.id);
  await setAssetProcessingResult(derivedAsset.id, {
    storedName: 'converted.glb',
    storagePath: toStoragePathForIndex(derivedAsset.id, 'converted.glb'),
    status: 'processing',
    size: 0,
    error: null
  });

  const inputPath = path.resolve(appDataRoot, sourceAsset.storagePath);

  try {
    await setSourceAssetProcessingState(sourceAsset.id, {
      status: 'processing',
      error: null
    });
    await ensureObjMaterialFiles(inputPath);
    const obj2gltf = await loadObj2Gltf();
    const glbBuffer = await obj2gltf(inputPath, { binary: true });
    await writeDerivedAssetFile(derivedAsset.id, 'converted.glb', glbBuffer);
    await setAssetProcessingResult(derivedAsset.id, {
      status: 'ready',
      size: glbBuffer.length,
      error: null
    });
    await setSourceAssetProcessingState(sourceAsset.id, {
      status: 'available',
      error: null
    });
    return {
      assetId: sourceAsset.id,
      status: 'processing',
      derivedAssetId: derivedAsset.id
    };
  } catch (error) {
    await setAssetProcessingResult(derivedAsset.id, {
      status: 'failed',
      error: error?.message || 'Failed to convert OBJ to GLB'
    });
    await setSourceAssetProcessingState(sourceAsset.id, {
      status: 'uploaded',
      error: error?.message || 'Failed to convert OBJ to GLB'
    });

    if (error?.code === 'ASSET_PROCESS_NOT_SUPPORTED') {
      throw error;
    }

    const convertError = new Error('Failed to convert OBJ to GLB');
    convertError.code = 'ASSET_CONVERT_FAILED';
    convertError.cause = error;
    throw convertError;
  }
}

export async function initializeAssetStore() {
  await ensureAssetDirs();

  try {
    await readIndexFile();
  } catch (error) {
    if (error?.code === 'ASSET_INDEX_INVALID') {
      throw error;
    }
  }

  try {
    await fs.access(indexFilePath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      await writeIndexFile({ assets: [] });
    }
  }
}

export function getAllowedAssetExtensions() {
  return Array.from(ALLOWED_EXTENSIONS.keys());
}

export function getAssetTypeInfo(filename) {
  const extension = path.extname(filename || '').toLowerCase();
  return ALLOWED_EXTENSIONS.get(extension) ?? null;
}

export async function listAssets() {
  const index = await readIndexFile();
  return index.assets;
}

export async function getAsset(assetId) {
  const index = await readIndexFile();
  return index.assets.find((asset) => asset.id === assetId) ?? null;
}

export async function createAssetFromUpload({ sourceName, buffer }) {
  await ensureAssetDirs();

  const safeSourceName = sanitizeSourceName(sourceName);
  const typeInfo = getAssetTypeInfo(safeSourceName);
  if (!typeInfo) {
    const typeError = new Error('Asset type is not allowed');
    typeError.code = 'ASSET_TYPE_NOT_ALLOWED';
    throw typeError;
  }

  const assetId = createAssetId('asset_raw');
  const storedName = getStoredName(safeSourceName);
  const assetDir = path.join(storageDir, assetId);
  const filePath = getStoragePath(assetId, storedName);
  const index = await readIndexFile();

  try {
    await fs.mkdir(assetDir, { recursive: true });
    await fs.writeFile(filePath, buffer);
  } catch (_error) {
    const writeError = new Error('Failed to write asset file');
    writeError.code = 'ASSET_WRITE_FAILED';
    throw writeError;
  }

  const runtimeReady = Boolean(typeInfo.runtimeType);
  const record = normalizeAssetRecord({
    id: assetId,
    sourceName: safeSourceName,
    storedName,
    type: typeInfo.type,
    runtimeType: typeInfo.runtimeType,
    role: 'source',
    status: runtimeReady ? 'ready' : 'uploaded',
    mimeType: typeInfo.mimeType,
    size: buffer.length,
    url: `/api/assets/${assetId}/file`,
    storagePath: toStoragePathForIndex(assetId, storedName),
    createdAt: new Date().toISOString(),
    derivedAssetIds: []
  });

  index.assets.unshift(record);
  await writeIndexFile(index);
  return record;
}

export async function processAsset(assetId) {
  const sourceAsset = await getAsset(assetId);
  if (!sourceAsset) {
    const notFoundError = new Error('Asset not found');
    notFoundError.code = 'ASSET_NOT_FOUND';
    throw notFoundError;
  }

  if (sourceAsset.role === 'derived') {
    const notSupportedError = new Error('Derived asset does not need processing');
    notSupportedError.code = 'ASSET_PROCESS_NOT_SUPPORTED';
    throw notSupportedError;
  }

  if (sourceAsset.type === 'sog' || sourceAsset.type === 'glb' || sourceAsset.type === 'gltf') {
    return {
      assetId: sourceAsset.id,
      status: 'ready',
      derivedAssetId: null
    };
  }

  const index = await readIndexFile();
  const currentSource = index.assets.find((entry) => entry.id === assetId);
  if (!currentSource) {
    const notFoundError = new Error('Asset not found');
    notFoundError.code = 'ASSET_NOT_FOUND';
    throw notFoundError;
  }

  const readyDerivedAsset = getReadyDerivedAsset(currentSource, index.assets);
  if (readyDerivedAsset) {
    if (currentSource.status !== 'available') {
      await setSourceAssetProcessingState(currentSource.id, {
        status: 'available',
        error: null
      });
    }
    return {
      assetId: currentSource.id,
      status: 'ready',
      derivedAssetId: readyDerivedAsset.id
    };
  }

  if (currentSource.type === 'ply') {
    const latestDerivedAsset = getLatestDerivedAsset(currentSource, index.assets, 'sog');
    if (latestDerivedAsset?.status === 'processing') {
      return {
        assetId: currentSource.id,
        status: 'processing',
        derivedAssetId: latestDerivedAsset.id
      };
    }

    if (latestDerivedAsset?.status === 'failed') {
      return retryPlyDerivedAsset(currentSource, latestDerivedAsset);
    }

    return convertPlyToSogAsset(currentSource);
  }

  if (currentSource.type === 'obj') {
    const latestDerivedAsset = getLatestDerivedAsset(currentSource, index.assets, 'glb');
    if (latestDerivedAsset?.status === 'processing') {
      return {
        assetId: currentSource.id,
        status: 'processing',
        derivedAssetId: latestDerivedAsset.id
      };
    }

    if (latestDerivedAsset?.status === 'failed') {
      return retryObjDerivedAsset(currentSource, latestDerivedAsset);
    }

    return convertObjToGlbAsset(currentSource);
  }

  const notSupportedError = new Error(`Asset type is not supported for processing: ${currentSource.type}`);
  notSupportedError.code = 'ASSET_PROCESS_NOT_SUPPORTED';
  throw notSupportedError;
}

export async function getAssetFile(assetId) {
  const record = await getAsset(assetId);
  if (!record) {
    return null;
  }

  const filePath = path.resolve(appDataRoot, record.storagePath);

  try {
    const buffer = await fs.readFile(filePath);
    return {
      record,
      buffer
    };
  } catch (error) {
    if (error?.code === 'ENOENT') {
      const notFoundError = new Error('Asset file not found');
      notFoundError.code = 'ASSET_FILE_NOT_FOUND';
      throw notFoundError;
    }

    throw error;
  }
}

export async function deleteAsset(assetId) {
  const index = await readIndexFile();
  const asset = index.assets.find((entry) => entry.id === assetId);
  if (!asset) {
    return false;
  }

  if (asset.role === 'source' && Array.isArray(asset.derivedAssetIds) && asset.derivedAssetIds.length > 0) {
    const blockedError = new Error('Delete derived assets first');
    blockedError.code = 'ASSET_DELETE_BLOCKED_DERIVED_EXISTS';
    throw blockedError;
  }

  if (asset.role === 'derived' && asset.sourceAssetId) {
    const sourceAsset = index.assets.find((entry) => entry.id === asset.sourceAssetId);
    if (sourceAsset?.derivedAssetIds) {
      sourceAsset.derivedAssetIds = sourceAsset.derivedAssetIds.filter((derivedId) => derivedId !== assetId);
    }
  }

  index.assets = index.assets.filter((entry) => entry.id !== assetId);
  await writeIndexFile(index);
  await removeAssetStorage(assetId);

  return true;
}
