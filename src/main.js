import * as pc from 'playcanvas';
import { BimProxyManager } from './engine/BimProxyManager';
import { CameraController } from './engine/CameraController';
import { MarkerManager } from './engine/MarkerManager';
import { PickingController } from './engine/PickingController';
import './styles.css';

const canvas = document.getElementById('app-canvas');
const fileInput = document.getElementById('file-input');
const loadPublicButton = document.getElementById('load-public');
const loadBimButton = document.getElementById('load-bim');
const toggleBimButton = document.getElementById('toggle-bim');
const debugBimButton = document.getElementById('debug-bim');
const clearMarkerButton = document.getElementById('clear-marker');
const statusEl = document.getElementById('status');
const resetCameraButton = document.getElementById('reset-camera');

const app = new pc.Application(canvas, {
  mouse: new pc.Mouse(document.body),
  touch: new pc.TouchDevice(document.body)
});

window.app = app;
window.pc = pc;

app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
app.setCanvasResolution(pc.RESOLUTION_AUTO);
app.start();

app.scene.ambientLight = new pc.Color(0.25, 0.25, 0.25);
app.scene.gammaCorrection = pc.GAMMA_SRGB;
app.scene.toneMapping = pc.TONEMAP_ACES;

const camera = new pc.Entity('Camera');
camera.addComponent('camera', {
  clearColor: new pc.Color(0.08, 0.09, 0.12),
  fov: 60
});
app.root.addChild(camera);

const light = new pc.Entity('DirectionalLight');
light.addComponent('light', {
  type: 'directional',
  color: new pc.Color(1, 1, 1),
  intensity: 1.5,
  castShadows: false
});
light.setLocalEulerAngles(45, 30, 0);
app.root.addChild(light);

function setStatus(text) {
  statusState.message = text;
  renderStatus();
}

const statusState = {
  sog: 'SOG idle',
  bim: 'BIM idle',
  message: 'Ready'
};

function renderStatus() {
  statusEl.textContent = `${statusState.sog} | ${statusState.bim} | ${statusState.message}`;
}

const cameraController = new CameraController({
  app,
  camera,
  canvas
});

cameraController.setDefaultFocus({
  target: new pc.Vec3(0, 0, 0),
  distance: 80,
  yaw: 0,
  pitch: 45
});
cameraController.reset();

const bimProxyManager = new BimProxyManager({ app });
bimProxyManager.createFallbackGroundProxy();

const markerManager = new MarkerManager({ app });
const pickingController = new PickingController({
  app,
  canvas,
  camera,
  bimProxyManager,
  markerManager,
  onPick: (hit) => {
    if (hit.source === 'fallback-plane') {
      setStatus(
        `Picked fallback plane, BIM mesh picking pending: x=${hit.point.x.toFixed(2)}, y=${hit.point.y.toFixed(2)}, z=${hit.point.z.toFixed(2)}`
      );
      return;
    }

    setStatus(
      `Picked BIM: x=${hit.point.x.toFixed(2)}, y=${hit.point.y.toFixed(2)}, z=${hit.point.z.toFixed(2)} (${hit.entityName || 'BIM'})`
    );
  },
  onClear: () => {
    setStatus('Ready');
  }
});

window.cameraController = cameraController;
window.bimProxyManager = bimProxyManager;
window.markerManager = markerManager;
window.pickingController = pickingController;

window.addEventListener('resize', () => {
  app.resizeCanvas(canvas.width, canvas.height);
});

let currentGsplatEntity = null;
let currentAsset = null;
let currentBlobUrl = null;
let loadToken = 0;

function updateDebugHandles() {
  window.currentSplatEntity = currentGsplatEntity;
  window.currentSplatAsset = currentAsset;
}

function cleanupCurrentGsplat() {
  if (currentGsplatEntity) {
    currentGsplatEntity.destroy();
    currentGsplatEntity = null;
  }

  if (currentAsset) {
    currentAsset.off();
    currentAsset.unload();
    if (app.assets.get(currentAsset.id)) {
      app.assets.remove(currentAsset);
    }
    currentAsset = null;
  }

  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = null;
  }

  updateDebugHandles();
}

function describeError(err) {
  if (!err) {
    return 'Unknown error';
  }

  if (typeof err.message === 'string' && err.message) {
    return err.message;
  }

  try {
    return JSON.stringify(err);
  } catch (_jsonError) {
    return String(err);
  }
}

function getGsplatBounds(entity, asset) {
  const candidates = [
    entity?.gsplat?.instance?.meshInstance?.aabb,
    entity?.gsplat?.instance?.resource?.aabb,
    entity?.gsplat?.customAabb,
    asset?.resource?.aabb
  ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    if (candidate.center && candidate.halfExtents) {
      return candidate.clone ? candidate.clone() : candidate;
    }
  }

  return null;
}

function focusLoadedMap(entity, asset) {
  const aabb = getGsplatBounds(entity, asset);

  if (aabb) {
    cameraController.focusAabb(aabb, {
      yaw: 0,
      pitch: 45,
      minDistance: 80
    });
    return;
  }

  cameraController.focus(new pc.Vec3(0, 0, 0), 80, {
    yaw: 0,
    pitch: 45
  });
}

function attachGsplatEntity(file, asset, token) {
  if (token !== loadToken) {
    return;
  }

  const entity = new pc.Entity(file.name);
  entity.addComponent('gsplat', { asset });
  app.root.addChild(entity);

  currentGsplatEntity = entity;
  updateDebugHandles();

  requestAnimationFrame(() => {
    focusLoadedMap(entity, asset);
    statusState.sog = `SOG loaded: ${file.name}`;
    setStatus(`Loaded ${file.name}`);
  });
}

function loadGsplatAsset({ displayName, url, filename, size }) {
  loadToken += 1;
  const token = loadToken;

  cleanupCurrentGsplat();

  const asset = new pc.Asset(displayName, 'gsplat', {
    url,
    filename,
    ...(typeof size === 'number' ? { size } : {})
  });

  currentAsset = asset;
  updateDebugHandles();
  app.assets.add(asset);

  statusState.sog = `SOG loading: ${filename}`;
  setStatus(`Loading ${filename}`);

  asset.on('progress', (receivedBytes, totalBytes) => {
    if (token !== loadToken) {
      return;
    }

    if (totalBytes > 0) {
      const percent = ((receivedBytes / totalBytes) * 100).toFixed(1);
      statusState.sog = `SOG loading ${percent}%: ${filename}`;
      setStatus(`Loading ${filename}`);
    }
  });

  asset.once('load', () => {
    attachGsplatEntity({ name: displayName }, asset, token);
  });

  asset.once('error', (err) => {
    if (token !== loadToken) {
      return;
    }

    const message = describeError(err);
    console.error(err, asset);
    statusState.sog = `SOG failed: ${filename}`;
    setStatus(`SOG error: ${message}`);

    if (currentAsset === asset) {
      currentAsset = null;
    }

    if (currentBlobUrl === url) {
      URL.revokeObjectURL(url);
      currentBlobUrl = null;
    }

    if (app.assets.get(asset.id)) {
      app.assets.remove(asset);
    }

    updateDebugHandles();
  });

  app.assets.load(asset);
}

function loadSogFile(file) {
  const blobUrl = URL.createObjectURL(file);
  currentBlobUrl = blobUrl;

  loadGsplatAsset({
    displayName: file.name,
    url: blobUrl,
    filename: file.name,
    size: file.size
  });
}

fileInput.addEventListener('change', (event) => {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  loadSogFile(file);
  fileInput.value = '';
});

loadPublicButton.addEventListener('click', () => {
  loadGsplatAsset({
    displayName: 'base.sog',
    url: '/assets/base.sog',
    filename: 'base.sog'
  });
});

loadBimButton.addEventListener('click', async () => {
  if (bimProxyManager.isLoaded()) {
    statusState.bim = 'BIM loaded: 南广场.glb';
    setStatus('BIM already loaded');
    return;
  }

  statusState.bim = 'BIM loading: 南广场.glb';
  renderStatus();

  try {
    await bimProxyManager.load(encodeURI('/assets/南广场.glb'));
    statusState.bim = 'BIM loaded: 南广场.glb';
    setStatus('BIM proxy loaded');
  } catch (error) {
    const message = describeError(error);
    console.warn(error);
    statusState.bim = 'BIM failed: 南广场.glb';
    setStatus(`BIM error: ${message}`);
  }
});

toggleBimButton.addEventListener('click', () => {
  if (!bimProxyManager.isLoaded()) {
    setStatus('BIM not loaded');
    return;
  }

  const visible = bimProxyManager.toggleVisible();
  setStatus(visible ? 'BIM visible' : 'BIM hidden');
});

debugBimButton.addEventListener('click', () => {
  const visible = bimProxyManager.toggleDebugVisible();
  setStatus(visible ? 'BIM debug enabled' : 'BIM debug disabled');
});

clearMarkerButton.addEventListener('click', () => {
  pickingController.clearMarker();
});

resetCameraButton.addEventListener('click', () => {
  focusLoadedMap(currentGsplatEntity, currentAsset);
  setStatus('Camera reset');
});

renderStatus();
