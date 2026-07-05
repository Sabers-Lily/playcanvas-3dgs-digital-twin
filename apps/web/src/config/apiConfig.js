const DEFAULT_API_ORIGIN = 'http://localhost:3000';

export function getApiOrigin() {
  return (import.meta.env.VITE_API_ORIGIN || DEFAULT_API_ORIGIN).replace(/\/$/u, '');
}

export function resolveApiUrl(path) {
  if (!path) {
    return '';
  }

  if (/^https?:\/\//u.test(path)) {
    return path;
  }

  return `${getApiOrigin()}${path.startsWith('/') ? path : `/${path}`}`;
}
