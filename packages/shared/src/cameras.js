export const CAMERA_STREAM_MODES = {
  HLS: 'hls'
};

export const CAMERA_SOURCE_TYPES = {
  CAMERA_STREAM: 'cameraStream',
  CUSTOM_URL: 'customUrl'
};

export const CAMERA_STREAM_STATUSES = {
  IDLE: 'idle',
  STARTING: 'starting',
  RUNNING: 'running',
  STOPPED: 'stopped',
  ERROR: 'error'
};

export const CAMERA_SOURCES = [
  {
    id: 'camera1',
    name: '摄像头 1',
    type: 'rtsp',
    rtspUrl: 'rtsp://127.0.0.1:8554/camera1',
    enabled: true,
    streamMode: CAMERA_STREAM_MODES.HLS
  }
];

export function toPublicCameraSource(cameraSource) {
  if (!cameraSource) {
    return null;
  }

  return {
    id: cameraSource.id,
    name: cameraSource.name,
    type: cameraSource.type,
    enabled: cameraSource.enabled !== false,
    streamMode: cameraSource.streamMode ?? CAMERA_STREAM_MODES.HLS
  };
}
