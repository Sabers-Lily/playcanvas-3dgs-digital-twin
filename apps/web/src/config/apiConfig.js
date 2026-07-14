const DEFAULT_API_ORIGIN = 'http://localhost:3000';

function getQueryApiBase() {
  if (typeof window === 'undefined') {
    return '';
  }

  const url = new URL(window.location.href);
  return (url.searchParams.get('apiBase') || '').trim();
}

export function getApiBase() {
  return (getQueryApiBase() || import.meta.env.VITE_API_ORIGIN || DEFAULT_API_ORIGIN).replace(/\/$/u, '');
}

export function getApiOrigin() {
  return getApiBase();
}

export function resolveApiUrl(path) {
  if (!path) {
    return '';
  }

  if (/^https?:\/\//u.test(path)) {
    return path;
  }

  return `${getApiBase()}${path.startsWith('/') ? path : `/${path}`}`;
}
