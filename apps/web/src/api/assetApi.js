async function requestJson(path, options = {}) {
  const response = await fetch(path, {
    cache: 'no-store',
    ...options
  });

  const payload = await response.json();

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error?.message || `Request failed: ${response.status}`);
  }

  return payload.data;
}

export async function uploadAsset(file, options = {}) {
  const { onProgress, onServerProcessing } = options;
  const formData = new FormData();
  formData.append('file', file);

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    let processingNotified = false;

    request.open('POST', '/api/assets/upload');
    request.responseType = 'json';

    request.upload.addEventListener('progress', (event) => {
      if (!event.lengthComputable || typeof onProgress !== 'function') {
        return;
      }

      onProgress({
        loaded: event.loaded,
        total: event.total,
        percent: Math.max(0, Math.min(100, Math.round((event.loaded / event.total) * 100)))
      });
    });

    request.upload.addEventListener('load', () => {
      if (processingNotified || typeof onServerProcessing !== 'function') {
        return;
      }

      processingNotified = true;
      onServerProcessing();
    });

    request.addEventListener('load', () => {
      const payload = request.response ?? JSON.parse(request.responseText || '{}');

      if (request.status < 200 || request.status >= 300 || !payload?.ok) {
        reject(new Error(payload?.error?.message || `Upload failed: ${request.status}`));
        return;
      }

      resolve(payload.data);
    });

    request.addEventListener('error', () => {
      reject(new Error('Upload failed: network error'));
    });

    request.addEventListener('abort', () => {
      reject(new Error('Upload cancelled'));
    });

    request.send(formData);
  });
}

export async function fetchAssets() {
  return requestJson('/api/assets');
}

export async function fetchAsset(assetId) {
  return requestJson(`/api/assets/${encodeURIComponent(assetId)}`);
}

export async function deleteAsset(assetId) {
  return requestJson(`/api/assets/${encodeURIComponent(assetId)}`, {
    method: 'DELETE'
  });
}

export async function processAsset(assetId) {
  return requestJson(`/api/assets/${encodeURIComponent(assetId)}/process`, {
    method: 'POST'
  });
}
