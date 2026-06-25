async function requestJson(path, options = {}) {
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
    throw new Error(payload?.error?.message || `Request failed: ${response.status}`);
  }

  return payload.data;
}

export async function fetchScenes() {
  return requestJson('/api/scenes');
}

export async function fetchScene(sceneId) {
  return requestJson(`/api/scenes/${encodeURIComponent(sceneId)}`);
}

export async function createScene(payload) {
  return requestJson('/api/scenes', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function fetchSceneObjects(sceneId) {
  return requestJson(`/api/scenes/${encodeURIComponent(sceneId)}/objects`);
}

export async function createSceneObject(sceneId, payload) {
  return requestJson(`/api/scenes/${encodeURIComponent(sceneId)}/objects`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateSceneObject(sceneId, objectId, payload) {
  return requestJson(`/api/scenes/${encodeURIComponent(sceneId)}/objects/${encodeURIComponent(objectId)}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

export async function deleteSceneObject(sceneId, objectId) {
  return requestJson(`/api/scenes/${encodeURIComponent(sceneId)}/objects/${encodeURIComponent(objectId)}`, {
    method: 'DELETE'
  });
}

export async function replaceSceneObjects(sceneId, objects) {
  return requestJson(`/api/scenes/${encodeURIComponent(sceneId)}/objects`, {
    method: 'PUT',
    body: JSON.stringify({ objects })
  });
}
