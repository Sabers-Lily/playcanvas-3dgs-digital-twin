export const API_VERSION = '0.1.0';
export const API_SERVICE_NAME = '3dgs-digital-twin-api';
export const API_STAGE = 'local-dev';

export function createApiSuccess(data) {
  return {
    ok: true,
    data,
    error: null
  };
}

export function createApiError(code, message) {
  return {
    ok: false,
    data: null,
    error: {
      code,
      message
    }
  };
}
