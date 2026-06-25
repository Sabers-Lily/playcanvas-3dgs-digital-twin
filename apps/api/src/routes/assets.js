import { createApiError, createApiSuccess } from '../../../../packages/shared/src/api.js';
import {
  createAssetFromUpload,
  deleteAsset,
  getAsset,
  getAssetFile,
  listAssets,
  processAsset
} from '../store/assetStore.js';

function assetFileRequired() {
  return createApiError('ASSET_FILE_REQUIRED', 'Asset file is required');
}

function assetTypeNotAllowed() {
  return createApiError('ASSET_TYPE_NOT_ALLOWED', 'Asset type is not allowed');
}

function assetNotFound() {
  return createApiError('ASSET_NOT_FOUND', 'Asset not found');
}

function assetFileNotFound() {
  return createApiError('ASSET_FILE_NOT_FOUND', 'Asset file not found');
}

function assetWriteFailed() {
  return createApiError('ASSET_WRITE_FAILED', 'Failed to write asset file');
}

function assetIndexInvalid() {
  return createApiError('ASSET_INDEX_INVALID', 'Asset index is invalid');
}

function assetConvertFailed(message = 'Asset conversion failed') {
  return createApiError('ASSET_CONVERT_FAILED', message);
}

function assetProcessingFailed(message = 'Asset processing failed') {
  return createApiError('ASSET_PROCESSING_FAILED', message);
}

function assetProcessNotSupported(message = 'Asset processing is not supported') {
  return createApiError('ASSET_PROCESS_NOT_SUPPORTED', message);
}

function assetAlreadyRuntimeReady(message = 'Asset is already runtime-ready') {
  return createApiError('ASSET_ALREADY_RUNTIME_READY', message);
}

function assetDeleteBlocked(message = 'Asset delete is blocked') {
  return createApiError('ASSET_DELETE_BLOCKED', message);
}

function parseMultipartFile(request) {
  return new Promise((resolve, reject) => {
    const contentType = request.headers['content-type'] || '';
    const match = contentType.match(/boundary=(.+)$/u);
    if (!match) {
      const error = new Error('Asset file is required');
      error.code = 'ASSET_FILE_REQUIRED';
      reject(error);
      return;
    }

    const boundary = `--${match[1]}`;
    const chunks = [];

    request.on('data', (chunk) => {
      chunks.push(chunk);
    });

    request.on('end', () => {
      try {
        const buffer = Buffer.concat(chunks);
        const binary = buffer.toString('binary');
        const start = binary.indexOf(boundary);
        if (start === -1) {
          const error = new Error('Asset file is required');
          error.code = 'ASSET_FILE_REQUIRED';
          throw error;
        }

        const headerStart = binary.indexOf('\r\n', start) + 2;
        const headerEnd = binary.indexOf('\r\n\r\n', headerStart);
        const headerText = binary.slice(headerStart, headerEnd);
        const dispositionMatch = headerText.match(/filename="([^"]+)"/u);
        if (!dispositionMatch) {
          const error = new Error('Asset file is required');
          error.code = 'ASSET_FILE_REQUIRED';
          throw error;
        }

        const dataStart = headerEnd + 4;
        const closing = binary.indexOf(`\r\n${boundary}--`, dataStart);
        const dataEnd = closing >= 0 ? closing : binary.indexOf(`\r\n${boundary}`, dataStart);
        const fileBuffer = buffer.subarray(dataStart, dataEnd);

        resolve({
          filename: dispositionMatch[1],
          buffer: fileBuffer
        });
      } catch (error) {
        reject(error);
      }
    });

    request.on('error', reject);
  });
}

export async function handleAssetsRoute(request, response, pathname, writeJson, writeBuffer) {
  if (request.method === 'GET' && pathname === '/api/assets') {
    writeJson(response, 200, createApiSuccess(await listAssets()));
    return true;
  }

  if (request.method === 'POST' && pathname === '/api/assets/upload') {
    try {
      const file = await parseMultipartFile(request);
      const asset = await createAssetFromUpload({
        sourceName: file.filename,
        buffer: file.buffer
      });

      if (asset.type === 'ply' || asset.type === 'obj') {
        try {
          await processAsset(asset.id);
        } catch (error) {
          if (!['ASSET_CONVERT_FAILED', 'ASSET_PROCESS_NOT_SUPPORTED'].includes(error?.code)) {
            throw error;
          }
          console.warn('[Assets] auto process failed:', asset.id, error);
        }
      }

      writeJson(response, 201, createApiSuccess(asset));
      return true;
    } catch (error) {
      if (error?.code === 'ASSET_FILE_REQUIRED') {
        writeJson(response, 400, assetFileRequired());
        return true;
      }

      if (error?.code === 'ASSET_TYPE_NOT_ALLOWED') {
        writeJson(response, 400, assetTypeNotAllowed());
        return true;
      }

      if (error?.code === 'ASSET_WRITE_FAILED') {
        writeJson(response, 500, assetWriteFailed());
        return true;
      }

      if (error?.code === 'ASSET_INDEX_INVALID') {
        writeJson(response, 500, assetIndexInvalid());
        return true;
      }

      if (error?.code === 'ASSET_CONVERT_FAILED') {
        writeJson(response, 500, assetConvertFailed(error.message));
        return true;
      }

      if (error?.code === 'ASSET_ALREADY_RUNTIME_READY') {
        writeJson(response, 200, createApiSuccess({
          assetId: asset.id,
          status: 'ready',
          derivedAssetId: null
        }));
        return true;
      }

      if (error?.code === 'ASSET_PROCESSING_FAILED') {
        writeJson(response, 500, assetProcessingFailed(error.message));
        return true;
      }

      throw error;
    }
  }

  const processMatch = pathname.match(/^\/api\/assets\/([^/]+)\/process$/u);
  if (processMatch && request.method === 'POST') {
    const assetId = decodeURIComponent(processMatch[1]);

    try {
      const result = await processAsset(assetId);
      writeJson(response, 200, createApiSuccess(result));
      return true;
    } catch (error) {
      if (error?.code === 'ASSET_NOT_FOUND') {
        writeJson(response, 404, assetNotFound());
        return true;
      }

      if (error?.code === 'ASSET_INDEX_INVALID') {
        writeJson(response, 500, assetIndexInvalid());
        return true;
      }

      if (error?.code === 'ASSET_CONVERT_FAILED') {
        writeJson(response, 500, assetConvertFailed(error.message));
        return true;
      }

      if (error?.code === 'ASSET_PROCESS_NOT_SUPPORTED') {
        writeJson(response, 400, assetProcessNotSupported(error.message));
        return true;
      }

      if (error?.code === 'ASSET_ALREADY_RUNTIME_READY') {
        writeJson(response, 200, createApiSuccess({
          assetId,
          status: 'ready',
          derivedAssetId: null
        }));
        return true;
      }

      writeJson(response, 500, assetProcessingFailed(error?.message || 'Asset processing failed'));
      return true;
    }
  }

  const match = pathname.match(/^\/api\/assets\/([^/]+)(?:\/file)?$/u);
  if (!match) {
    return false;
  }

  const assetId = decodeURIComponent(match[1]);
  const isFileRoute = pathname.endsWith('/file');

  if (request.method === 'GET' && isFileRoute) {
    try {
      const file = await getAssetFile(assetId);
      if (!file) {
        writeJson(response, 404, assetNotFound());
        return true;
      }

      writeBuffer(response, 200, file.buffer, file.record.mimeType);
      return true;
    } catch (error) {
      if (error?.code === 'ASSET_FILE_NOT_FOUND') {
        writeJson(response, 404, assetFileNotFound());
        return true;
      }

      if (error?.code === 'ASSET_INDEX_INVALID') {
        writeJson(response, 500, assetIndexInvalid());
        return true;
      }

      throw error;
    }
  }

  if (request.method === 'GET' && !isFileRoute) {
    const asset = await getAsset(assetId);
    if (!asset) {
      writeJson(response, 404, assetNotFound());
      return true;
    }

    writeJson(response, 200, createApiSuccess(asset));
    return true;
  }

  if (request.method === 'DELETE' && !isFileRoute) {
    try {
      const deleted = await deleteAsset(assetId);
      if (!deleted) {
        writeJson(response, 404, assetNotFound());
        return true;
      }

      writeJson(response, 200, createApiSuccess({ deleted: true, id: assetId }));
      return true;
    } catch (error) {
      if (error?.code === 'ASSET_INDEX_INVALID') {
        writeJson(response, 500, assetIndexInvalid());
        return true;
      }

      if (error?.code === 'ASSET_WRITE_FAILED') {
        writeJson(response, 500, assetWriteFailed());
        return true;
      }

      if (error?.code === 'ASSET_DELETE_BLOCKED_DERIVED_EXISTS') {
        writeJson(response, 409, assetDeleteBlocked(error.message));
        return true;
      }

      throw error;
    }
  }

  return false;
}
