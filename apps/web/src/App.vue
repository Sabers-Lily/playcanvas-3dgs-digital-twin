<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import ToolbarPanel from './components/ToolbarPanel.vue';
import HierarchyPanel from './components/HierarchyPanel.vue';
import ViewportPanel from './components/ViewportPanel.vue';
import InspectorPanel from './components/InspectorPanel.vue';
import BottomPanel from './components/BottomPanel.vue';
import ContextMenu from './components/ContextMenu.vue';
import EditModeBanner from './components/editor/EditModeBanner.vue';
import { createMiniEditorRuntime } from './runtime/createMiniEditorRuntime.js';
import { UI_FLAGS } from './config/uiFlags.js';
import { fetchApiHealth } from './api/healthApi.js';
import {
  deleteAsset,
  fetchAssets,
  processAsset,
  uploadAsset
} from './api/assetApi.js';
import {
  createSceneObject,
  deleteSceneObject,
  fetchScene,
  fetchSceneObjects,
  fetchScenes,
  replaceSceneObjects
} from './api/sceneApi.js';
import { isSyncableSceneObject, sceneObjectToApiPayload } from './api/sceneObjectMapper.js';

const viewportPanelRef = ref(null);
const canvasRef = ref(null);
const assetUploadInputRef = ref(null);
const runtime = ref(null);
const bottomDrawerMode = ref(null);
const MAX_UI_LOGS = 100;

const snapshot = reactive({
  objects: [],
  selectedId: null,
  selectedObject: null,
  activeEditMode: null,
  alignment: {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1]
  },
  steps: {
    move: 1,
    rotate: 1,
    scale: 0.01
  },
  logs: [],
  assets: [],
  selectedAssetId: null,
  statusMessage: 'Ready',
  statusSummary: {
    sog: 'SOG idle',
    bim: 'BIM idle',
    pick: 'Ready'
  },
  hierarchyAddMenuOpen: false,
  contextMenu: {
    open: false,
    kind: 'scene-object',
    objectId: null,
    x: 0,
    y: 0
  },
  assetContextMenu: {
    open: false,
    assetId: null,
    x: 0,
    y: 0
  },
  cameraState: {
    target: '0.00, 0.00, 0.00',
    distance: '80.00',
    yaw: '0.0',
    pitch: '45.0'
  },
  apiStatus: 'checking',
  sceneApiStatus: 'idle'
});

let unsubscribe = null;
let sceneSyncCount = 0;
let selectionSyncCount = 0;
let lastPerfReport = typeof performance !== 'undefined' ? performance.now() : Date.now();

function shouldLogPerf() {
  return typeof window !== 'undefined' && Boolean(window.__MINI_EDITOR_PERF__);
}

function prependUiLog(message) {
  snapshot.logs = [message, ...snapshot.logs].slice(0, MAX_UI_LOGS);
}

function syncSnapshot(next) {
  if (shouldLogPerf()) {
    sceneSyncCount += 1;
    if (next.selectedId !== snapshot.selectedId) {
      selectionSyncCount += 1;
    }

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - lastPerfReport > 1000) {
      console.log('[Perf] sync scene objects per second:', sceneSyncCount);
      console.log('[Perf] sync selected object per second:', selectionSyncCount);
      sceneSyncCount = 0;
      selectionSyncCount = 0;
      lastPerfReport = now;
    }
  }

  snapshot.objects = next.objects;
  snapshot.selectedId = next.selectedId;
  snapshot.selectedObject = next.selectedObject;
  snapshot.activeEditMode = next.activeEditMode ?? null;
  snapshot.alignment = next.alignment;
  snapshot.steps = next.steps;
  snapshot.logs = next.logs;
  snapshot.assets = next.assets;
  snapshot.statusMessage = next.statusMessage;
  snapshot.statusSummary = next.statusSummary;
  snapshot.contextMenu = {
    ...next.contextMenu,
    kind: 'scene-object'
  };
  snapshot.cameraState = next.cameraState;
}

function clearAssetSelection() {
  snapshot.selectedAssetId = null;
}

function selectAsset(assetId) {
  snapshot.selectedAssetId = assetId;
}

function buildAssetView(rawAssets) {
  const assets = Array.isArray(rawAssets) ? rawAssets.map((asset) => ({ ...asset })) : [];
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const derivedBySourceId = new Map();

  assets.forEach((asset) => {
    if (!asset.sourceAssetId) {
      return;
    }

    const list = derivedBySourceId.get(asset.sourceAssetId) ?? [];
    list.push(asset);
    derivedBySourceId.set(asset.sourceAssetId, list);
  });

  return assets.map((asset) => {
    const derivedAssets = derivedBySourceId.get(asset.id) ?? [];
    const latestDerivedAsset = [...derivedAssets]
      .sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime())[0] ?? null;
    const preferredRuntimeAsset = (
      asset.status === 'ready' &&
      Number(asset.size ?? 0) > 0 &&
      ['sog', 'gsplat', 'glb', 'gltf'].includes(String(asset.type || '').toLowerCase())
        ? asset
        : derivedAssets.find((entry) => (
          entry.status === 'ready' &&
          Number(entry.size ?? 0) > 0 &&
          ['sog', 'glb', 'gltf'].includes(String(entry.type || '').toLowerCase())
        )) ?? null
    );

    return {
      ...asset,
      derivedAssets,
      derivedAssetIds: Array.isArray(asset.derivedAssetIds) ? asset.derivedAssetIds.map((id) => byId.get(id) ? id : id) : [],
      preferredRuntimeAsset,
      latestDerivedAsset,
      sourceAsset: asset.sourceAssetId ? byId.get(asset.sourceAssetId) ?? null : null
    };
  });
}

const selectedAsset = computed(() => (
  snapshot.selectedAssetId
    ? snapshot.assets.find((asset) => asset.id === snapshot.selectedAssetId) ?? null
    : null
));

const objectCount = computed(() => snapshot.objects.length);

const activeContextMenu = computed(() => {
  if (snapshot.assetContextMenu.open) {
    return {
      open: true,
      kind: 'asset',
      x: snapshot.assetContextMenu.x,
      y: snapshot.assetContextMenu.y
    };
  }

  return {
    open: snapshot.contextMenu.open,
    kind: 'scene-object',
    x: snapshot.contextMenu.x,
    y: snapshot.contextMenu.y
  };
});

const contextMenuObject = computed(() => {
  if (!snapshot.contextMenu.objectId) {
    return null;
  }

  return snapshot.objects.find((object) => object.id === snapshot.contextMenu.objectId) ?? null;
});

const contextMenuAsset = computed(() => {
  if (!snapshot.assetContextMenu.assetId) {
    return null;
  }

  return snapshot.assets.find((asset) => asset.id === snapshot.assetContextMenu.assetId) ?? null;
});

const currentEditBanner = computed(() => {
  const selectedObject = snapshot.selectedObject;
  const projectionEditingObject = snapshot.objects.find((object) => (
    object.type === 'cameraDevice' && object.metadata?.videoProjection?.quadEditing
  ));
  const routeEditingObject = snapshot.objects.find((object) => (
    object.type === 'robotDog' && object.metadata?.patrol?.routeEditing
  ));

  if (snapshot.activeEditMode === 'buildingEnvelopeDrawing') {
    return {
      label: '编辑模式',
      title: '正在绘制建筑多边体',
      description: '点击地图添加点位，闭合后创建高度为 0 的对象，随后可在右侧属性中设置高度。',
      actions: [
        { action: 'undo-building-envelope-point', label: '撤销上一点' },
        { action: 'finish-building-envelope-drawing', label: '闭合并创建', variant: 'primary' },
        { action: 'cancel-building-envelope-drawing', label: '取消', variant: 'danger' }
      ]
    };
  }

  if (snapshot.activeEditMode === 'quadVideoProjection' || projectionEditingObject) {
    const quadPointCount = projectionEditingObject?.metadata?.videoProjection?.quadPoints?.length ?? 0;
    return {
      label: '编辑模式',
      title: '正在选择四点投影',
      description: `按左上、右上、右下、左下顺序点击地图。当前已选 ${quadPointCount} / 4 点。`,
      actions: [
        { action: 'clear-quad-video-projection-points', label: '清空四点' },
        { action: 'apply-quad-video-projection', label: '应用四点投影', variant: 'primary', disabled: quadPointCount !== 4 },
        { action: 'stop-quad-video-projection-editing', label: '取消', variant: 'danger' }
      ]
    };
  }

  if (routeEditingObject || selectedObject?.metadata?.patrol?.routeEditing) {
    return {
      label: '编辑模式',
      title: '正在编辑机器狗路线',
      description: '点击地图添加路线点，完成后可开始巡航。',
      actions: [
        { action: 'robot-dog-clear-route', label: '清空路线' },
        { action: 'robot-dog-start-patrol', label: '开始巡航', variant: 'primary' },
        { action: 'robot-dog-stop-edit', label: '取消', variant: 'danger' }
      ]
    };
  }

  return null;
});

async function checkApiHealth() {
  try {
    await fetchApiHealth();
    snapshot.apiStatus = 'connected';
    console.log('[API] health check ok');
  } catch (error) {
    snapshot.apiStatus = 'offline';
    console.warn('[API] health check failed:', error);
    if (UI_FLAGS.showApiDebugStatus) {
      prependUiLog('API: offline');
    }
  }
}

async function refreshAssets() {
  try {
    const uploadedAssets = buildAssetView(await fetchAssets());
    runtime.value?.setUploadedAssets(uploadedAssets);

    if (snapshot.selectedAssetId && !uploadedAssets.some((asset) => asset.id === snapshot.selectedAssetId)) {
      clearAssetSelection();
    }
  } catch (error) {
    console.warn('[API] fetch assets failed:', error);
    prependUiLog(`Assets API: failed - ${error.message}`);
  }
}

async function testSceneApi() {
  snapshot.sceneApiStatus = 'running';

  try {
    const scenes = await fetchScenes();
    console.log('[API] scenes list ok');

    const scene = await fetchScene('local-scene-001');
    console.log('[API] scene details ok:', scene.id);

    const createdObject = await createSceneObject('local-scene-001', {
      type: 'glb',
      displayName: 'Scene API Test Object',
      visible: true,
      transform: {
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1]
      },
      metadata: {
        sourceName: 'Scene API Test Object'
      }
    });
    console.log('[API] object created:', createdObject.id);

    const objects = await fetchSceneObjects('local-scene-001');
    console.log('[API] objects list ok:', objects.length);

    await deleteSceneObject('local-scene-001', createdObject.id);
    console.log('[API] object deleted:', createdObject.id);

    snapshot.sceneApiStatus = 'ok';
    prependUiLog(`Scenes list: ${scenes.length}`);
    prependUiLog('Objects API: ok');
    prependUiLog('Scenes API: ok');
  } catch (error) {
    snapshot.sceneApiStatus = 'offline';
    prependUiLog(`Scenes API: failed - ${error.message}`);
    console.warn('[API] scene api test failed:', error);
  }
}

async function syncCurrentScene() {
  snapshot.sceneApiStatus = 'running';

  try {
    const objects = snapshot.objects
      .filter(isSyncableSceneObject)
      .map(sceneObjectToApiPayload);

    const result = await replaceSceneObjects('local-scene-001', objects);
    snapshot.sceneApiStatus = 'ok';
    prependUiLog(`Scene sync ok: ${result.objectCount} objects`);
    console.log('[API] scene sync ok:', result.objectCount);
  } catch (error) {
    snapshot.sceneApiStatus = 'offline';
    prependUiLog(`Scene sync failed: ${error.message}`);
    console.warn('[API] scene sync failed:', error);
  }
}

async function restoreScene() {
  snapshot.sceneApiStatus = 'running';

  try {
    const objects = await fetchSceneObjects('local-scene-001');
    const result = await runtime.value?.restoreSceneObjectsFromPayload(objects);

    snapshot.sceneApiStatus = 'ok';
    prependUiLog(`Scene restore ok: ${result?.restoredCount ?? 0} objects`);
    console.log('[API] scene restore ok:', result?.restoredCount ?? 0);
  } catch (error) {
    snapshot.sceneApiStatus = 'offline';
    prependUiLog(`Scene restore failed: ${error.message}`);
    console.warn('[API] scene restore failed:', error);
  }
}

function runToolbar(action) {
  runtime.value?.handleToolbarAction(action);
}

function chooseUploadAsset() {
  assetUploadInputRef.value?.click();
}

async function onChooseUploadAsset(event) {
  const file = event.target.files?.[0];
  event.target.value = '';

  if (!file) {
    return;
  }

  try {
    const asset = await uploadAsset(file);
    await refreshAssets();
    prependUiLog(`Asset uploaded: ${asset.sourceName}`);
    if (['ply', 'obj'].includes(String(asset.type || '').toLowerCase())) {
      prependUiLog(`Asset processing started: ${asset.sourceName}`);
    }
    console.log('[API] asset uploaded:', asset.id);
  } catch (error) {
    prependUiLog(`Asset upload failed: ${error.message}`);
    console.warn('[API] asset upload failed:', error);
  }
}

function onHierarchySelect(objectId) {
  clearAssetSelection();
  runtime.value?.handleHierarchySelect(objectId);
}

function onHierarchyToggle(objectId) {
  runtime.value?.toggleObjectVisibility(objectId);
}

function onHierarchyContextMenu(payload) {
  runtime.value?.openContextMenu(payload.objectId, payload.x, payload.y);
}

function toggleHierarchyAddMenu() {
  snapshot.hierarchyAddMenuOpen = !snapshot.hierarchyAddMenuOpen;
}

function createHierarchyObject(type) {
  snapshot.hierarchyAddMenuOpen = false;
  clearAssetSelection();
  runtime.value?.addSceneObjectByType?.(type);
}

function onAssetSelect(assetId) {
  selectAsset(assetId);
  runtime.value?.closeContextMenu();
  snapshot.assetContextMenu = {
    open: false,
    assetId: null,
    x: 0,
    y: 0
  };
}

function openAssetContextMenu({ assetId, x, y }) {
  selectAsset(assetId);
  runtime.value?.closeContextMenu();
  snapshot.assetContextMenu = {
    open: true,
    assetId,
    x,
    y
  };
}

function toggleBottomDrawer(mode) {
  bottomDrawerMode.value = bottomDrawerMode.value === mode ? null : mode;
}

async function handleDeleteAsset(asset) {
  if (!asset?.id) {
    return;
  }

  const derivedIds = new Set(Array.isArray(asset.derivedAssetIds) ? asset.derivedAssetIds : []);
  const sourceAssetId = asset.sourceAssetId ?? null;
  const objectUsingAsset = snapshot.objects.find((object) => (
    object.metadata?.assetId === asset.id ||
    object.metadata?.sourceAssetId === asset.id ||
    (derivedIds.size > 0 && derivedIds.has(object.metadata?.assetId)) ||
    (sourceAssetId && object.metadata?.sourceAssetId === sourceAssetId && object.metadata?.assetId === asset.id) ||
    object.metadata?.url === asset.url ||
    object.metadata?.sourceName === asset.sourceName
  ));
  if (objectUsingAsset) {
    prependUiLog(`Asset is used by scene object: ${objectUsingAsset.displayName ?? objectUsingAsset.name}`);
    return;
  }

  if (asset.role === 'source' && Array.isArray(asset.derivedAssetIds) && asset.derivedAssetIds.length > 0) {
    prependUiLog(`Delete blocked: remove derived assets first for ${asset.sourceName}`);
    return;
  }

  try {
    await deleteAsset(asset.id);
    prependUiLog(`Asset deleted: ${asset.sourceName}`);
    if (snapshot.selectedAssetId === asset.id) {
      clearAssetSelection();
    }
    snapshot.assetContextMenu = {
      open: false,
      assetId: null,
      x: 0,
      y: 0
    };
    await refreshAssets();
  } catch (error) {
    prependUiLog(`Asset delete failed: ${error.message}`);
    console.warn('[API] asset delete failed:', error);
  }
}

async function handleProcessAsset(asset) {
  if (!asset?.id) {
    return;
  }

  try {
    const actionLabel = asset.latestDerivedAsset?.status === 'failed' ? 'retry started' : 'started';
    const result = await processAsset(asset.id);
    prependUiLog(`Asset processing ${actionLabel}: ${asset.sourceName}`);
    console.log('[Asset] processing started:', result.assetId, result.derivedAssetId);
    await refreshAssets();
  } catch (error) {
    prependUiLog(`Asset processing failed: ${error.message}`);
    console.warn('[Asset] processing failed:', error);
  }
}

async function handleAddAssetToScene(asset) {
  if (!asset?.id) {
    return;
  }

  try {
    const normalizedType = String(asset.type || '').toLowerCase();
    prependUiLog(`Asset add to scene started: ${asset.sourceName}`);
    if (normalizedType === 'ply' || normalizedType === 'obj') {
      const latestDerivedAsset = asset.latestDerivedAsset ?? null;

      if (!latestDerivedAsset) {
        prependUiLog(`Process asset first: ${asset.sourceName}`);
        return;
      }

      if (latestDerivedAsset.status === 'processing') {
        prependUiLog(`Asset is processing: ${asset.sourceName}`);
        return;
      }

      if (latestDerivedAsset.status === 'failed') {
        prependUiLog(`Asset processing failed, retry first: ${asset.sourceName}`);
        return;
      }

      if (Number(latestDerivedAsset.size ?? 0) <= 0) {
        prependUiLog(`Asset is not ready: ${asset.sourceName}`);
        return;
      }
    }

    const runtimeAsset = asset.preferredRuntimeAsset ?? asset;
    if (asset.id !== runtimeAsset.id) {
      prependUiLog(`Using derived asset: ${runtimeAsset.sourceName}`);
    }
    if (Number(runtimeAsset.size ?? 0) <= 0) {
      prependUiLog(`Asset is not ready: ${runtimeAsset.sourceName || asset.sourceName}`);
      return;
    }
    const result = await runtime.value?.addAssetToScene(runtimeAsset);
    clearAssetSelection();
    snapshot.assetContextMenu = {
      open: false,
      assetId: null,
      x: 0,
      y: 0
    };
    prependUiLog(`Asset added to scene: ${runtimeAsset.sourceName}`);
    console.log('[Asset] added to scene:', result?.id ?? asset.id);
  } catch (error) {
    prependUiLog(`Add asset to scene failed: ${error.message}`);
    console.warn('[Asset] add to scene failed:', error);
  }
}

function onInspectorAction(action, payload) {
  if (action === 'process-asset') {
    handleProcessAsset(payload);
    return;
  }

  if (action === 'add-asset-to-scene') {
    handleAddAssetToScene(payload);
    return;
  }

  if (action === 'delete-asset') {
    handleDeleteAsset(payload);
    return;
  }

  if (action === 'copy-asset-url') {
    const asset = payload;
    if (!asset?.url) {
      prependUiLog('Asset URL is not available');
      return;
    }

    navigator.clipboard?.writeText(asset.url)
      .then(() => {
        prependUiLog(`Asset URL copied: ${asset.sourceName}`);
      })
      .catch((error) => {
        console.warn('[Asset] copy asset url failed:', error);
        prependUiLog(`Copy asset URL failed: ${error.message}`);
      });
    return;
  }

  clearAssetSelection();
  runtime.value?.handleInspectorAction(action, payload);
}

function onToolbarCommand({ command, payload }) {
  switch (command) {
    case 'toolbar-action':
      runToolbar(payload);
      return;
    case 'create-object':
      createHierarchyObject(payload);
      return;
    case 'focus-selected':
      onInspectorAction('focus-selected');
      return;
    case 'focus-map':
      onInspectorAction('focus-map');
      return;
    case 'clear-marker':
      onInspectorAction('clear-marker');
      return;
    case 'toggle-projection-enabled':
      onInspectorAction('toggle-projection-enabled');
      return;
    case 'projection-mode':
      onInspectorAction('update-video-projection', { mode: payload });
      if (payload === 'quad' || payload === 'quadOverlay') {
        onInspectorAction('start-quad-video-projection-editing');
      }
      return;
    case 'robot-dog-start-edit':
      onInspectorAction('robot-dog-start-edit', {
        robotDogId: snapshot.selectedObject?.id
      });
      return;
    case 'robot-dog-start-patrol':
      onInspectorAction('robot-dog-start-patrol', {
        robotDogId: snapshot.selectedObject?.id
      });
      return;
    case 'save-scene':
      syncCurrentScene();
      return;
    default:
      return;
  }
}

function onBannerAction(action) {
  switch (action) {
    case 'robot-dog-clear-route':
      onInspectorAction(action, { robotDogId: snapshot.selectedObject?.id });
      return;
    case 'robot-dog-start-patrol':
      onInspectorAction(action, { robotDogId: snapshot.selectedObject?.id });
      return;
    case 'robot-dog-stop-edit':
      onInspectorAction(action, { robotDogId: snapshot.selectedObject?.id });
      return;
    default:
      onInspectorAction(action);
  }
}

function onContextMenuAction(action) {
  if (snapshot.assetContextMenu.open) {
    if (action === 'process-asset') {
      handleProcessAsset(contextMenuAsset.value);
      return;
    }

    if (action === 'add-asset-to-scene') {
      handleAddAssetToScene(contextMenuAsset.value);
      return;
    }

    if (action === 'delete-asset') {
      handleDeleteAsset(contextMenuAsset.value);
      return;
    }

    if (action === 'copy-asset-url') {
      onInspectorAction('copy-asset-url', contextMenuAsset.value);
      snapshot.assetContextMenu = {
        open: false,
        assetId: null,
        x: 0,
        y: 0
      };
      return;
    }
  }

  runtime.value?.handleContextMenuAction(action);
}

function closeContextMenu() {
  runtime.value?.closeContextMenu();
  snapshot.assetContextMenu = {
    open: false,
    assetId: null,
    x: 0,
    y: 0
  };
}

onMounted(() => {
  const nextRuntime = createMiniEditorRuntime({
    canvas: canvasRef.value,
    viewportElement: viewportPanelRef.value?.viewportBody ?? viewportPanelRef.value?.$el
  });
  runtime.value = nextRuntime;
  unsubscribe = nextRuntime.subscribe(syncSnapshot);
  checkApiHealth();
  refreshAssets();
});

onBeforeUnmount(() => {
  if (unsubscribe) {
    unsubscribe();
  }
});
</script>

<template>
  <div class="app-shell" :class="{ 'has-bottom-drawer': Boolean(bottomDrawerMode) }">
    <ToolbarPanel
      :status-message="snapshot.statusMessage"
      @command="onToolbarCommand"
    />

    <input
      id="asset-upload-input"
      ref="assetUploadInputRef"
      class="visually-hidden-input"
      type="file"
      accept=".sog,.glb,.gltf,.obj,.ply"
      @change="onChooseUploadAsset"
    />

    <main class="editor-layout">
      <HierarchyPanel
        :objects="snapshot.objects"
        :selected-id="snapshot.selectedId"
        :add-menu-open="snapshot.hierarchyAddMenuOpen"
        @select="onHierarchySelect"
        @toggle-visible="onHierarchyToggle"
        @open-context-menu="onHierarchyContextMenu"
        @delete-selected="runToolbar('hierarchy-delete')"
        @toggle-add-menu="toggleHierarchyAddMenu"
        @create-object="createHierarchyObject"
      />

      <section class="main-area">
        <ViewportPanel ref="viewportPanelRef" :status-summary="snapshot.statusSummary">
          <EditModeBanner :mode="currentEditBanner" @action="onBannerAction" />
          <canvas id="app-canvas" ref="canvasRef"></canvas>
        </ViewportPanel>

        <BottomPanel
          :assets="snapshot.assets"
          :selected-asset-id="snapshot.selectedAssetId"
          :logs="snapshot.logs"
          :api-status="snapshot.apiStatus"
          :scene-api-status="snapshot.sceneApiStatus"
          :drawer-mode="bottomDrawerMode"
          :status-message="snapshot.statusMessage"
          :status-summary="snapshot.statusSummary"
          :object-count="objectCount"
          @select-asset="onAssetSelect"
          @open-asset-context-menu="openAssetContextMenu"
          @refresh-assets="refreshAssets"
          @upload-asset="chooseUploadAsset"
          @restore-scene="restoreScene"
          @sync-current-scene="syncCurrentScene"
          @test-scene-api="testSceneApi"
          @toggle-drawer="toggleBottomDrawer"
        />
      </section>

      <InspectorPanel
        :selection="snapshot.selectedObject"
        :selected-asset="selectedAsset"
        :alignment="snapshot.alignment"
        :steps="snapshot.steps"
        :camera-state="snapshot.cameraState"
        @action="onInspectorAction"
      />
    </main>

    <ContextMenu
      :open="activeContextMenu.open"
      :x="activeContextMenu.x"
      :y="activeContextMenu.y"
      :object="contextMenuObject"
      :mode="activeContextMenu.kind"
      @action="onContextMenuAction"
      @close="closeContextMenu"
    />
  </div>
</template>
