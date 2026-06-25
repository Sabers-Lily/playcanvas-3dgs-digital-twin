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

export async function uploadAsset(file) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/assets/upload', {
    method: 'POST',
    body: formData
  });

  const payload = await response.json();

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error?.message || `Upload failed: ${response.status}`);
  }

  return payload.data;
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
