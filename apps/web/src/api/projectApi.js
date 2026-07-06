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

export async function listProjects() {
  return requestJson('/api/projects');
}

export async function fetchProject(projectId) {
  return requestJson(`/api/projects/${encodeURIComponent(projectId)}`);
}

export async function saveProject(project) {
  return requestJson('/api/projects/save', {
    method: 'POST',
    body: JSON.stringify({
      project
    })
  });
}
