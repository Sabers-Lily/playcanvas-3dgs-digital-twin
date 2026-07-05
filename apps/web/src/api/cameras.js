async function requestCameraJson(path, options = {}) {
  const response = await fetch(path, {
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });

  const payload = await response.json();

  if (!response.ok || !payload?.ok) {
    const error = new Error(payload?.error?.message || `Request failed: ${response.status}`);
    error.code = payload?.error?.code || 'REQUEST_FAILED';
    throw error;
  }

  return payload.data;
}

export async function listCameras() {
  return requestCameraJson('/api/cameras');
}

export async function getCamera(cameraId) {
  return requestCameraJson(`/api/cameras/${encodeURIComponent(cameraId)}`);
}

export async function getCameraStream(cameraId) {
  return requestCameraJson(`/api/cameras/${encodeURIComponent(cameraId)}/stream`);
}

export async function startCameraStream(cameraId) {
  return requestCameraJson(`/api/cameras/${encodeURIComponent(cameraId)}/stream/start`, {
    method: 'POST'
  });
}

export async function stopCameraStream(cameraId) {
  return requestCameraJson(`/api/cameras/${encodeURIComponent(cameraId)}/stream/stop`, {
    method: 'POST'
  });
}

export async function getCameraStatus(cameraId) {
  return requestCameraJson(`/api/cameras/${encodeURIComponent(cameraId)}/status`);
}
