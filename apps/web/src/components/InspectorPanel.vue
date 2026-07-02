<script setup>
import { computed, reactive, watch } from 'vue';

const props = defineProps({
  selection: {
    type: Object,
    default: null
  },
  selectedAsset: {
    type: Object,
    default: null
  },
  alignment: {
    type: Object,
    default: () => ({
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1]
    })
  },
  steps: {
    type: Object,
    default: () => ({
      move: 1,
      rotate: 1,
      scale: 0.01
    })
  },
  cameraState: {
    type: Object,
    default: () => ({
      target: '-',
      distance: '-',
      yaw: '-',
      pitch: '-'
    })
  }
});

const emit = defineEmits(['action']);

const renameValue = reactive({ value: '' });
const transformForm = reactive({
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: 1
});
const stepForm = reactive({
  move: 1,
  rotate: 1,
  scale: 0.01
});

const TRANSFORM_EDITABLE_TYPES = new Set([
  'gsplat',
  'bim-proxy',
  'model',
  'glb',
  'empty',
  'robot',
  'robotDog',
  'cameraDevice',
  'device',
  'hotspot',
  'annotation',
  'routePoint'
]);

const isBimProxy = computed(() => props.selection?.type === 'bim-proxy');
const isGsplat = computed(() => props.selection?.type === 'gsplat');
const isCameraDevice = computed(() => props.selection?.type === 'cameraDevice');
const isRobotDog = computed(() => props.selection?.type === 'robotDog');
const isTransformEditable = computed(() => TRANSFORM_EDITABLE_TYPES.has(props.selection?.type));
const activeSelection = computed(() => (props.selectedAsset ? null : props.selection));
const selectedAssetType = computed(() => String(props.selectedAsset?.type || '').toLowerCase());
const projectionToggleLabel = computed(() => (
  videoProjectionForm.enabled ? 'Disable Projection' : 'Enable Projection'
));
const videoProjectionForm = reactive({
  enabled: true,
  mode: 'cameraFrustum',
  videoUrl: '',
  opacity: 1,
  softEdge: 0.05,
  flipY: false,
  replaceMode: false,
  quadPlaneTolerance: 0.25
});
const patrolForm = reactive({
  speed: 2,
  loop: false
});
const videoProjection = computed(() => props.selection?.metadata?.videoProjection ?? {});
const quadPointCount = computed(() => videoProjection.value.quadPoints?.length ?? 0);
const isQuadProjectionMode = computed(() => videoProjectionForm.mode === 'quad');
const isFourPointProjectionMode = computed(() => ['quad', 'quadOverlay'].includes(videoProjectionForm.mode));
const projectionModeLabel = computed(() => {
  if (videoProjectionForm.mode === 'quad') {
    return '四点深度投影';
  }

  if (videoProjectionForm.mode === 'quadOverlay') {
    return '四点覆盖投影';
  }

  return '摄像头视锥投影';
});

const robotDogPatrol = computed(() => (
  props.selection?.metadata?.patrol ?? {
    state: 'idle',
    routePoints: [],
    routeEditing: false,
    speed: 2,
    loop: false
  }
));
const patrolPointCount = computed(() => robotDogPatrol.value.routePoints?.length ?? 0);
const patrolCanStart = computed(() => (
  patrolPointCount.value >= 2 &&
  !robotDogPatrol.value.routeEditing &&
  !['running', 'paused'].includes(robotDogPatrol.value.state)
));
const patrolStateLabel = computed(() => robotDogPatrol.value.state ?? 'idle');

const selectedAssetHasReadyRuntime = computed(() => (
  (['sog', 'gsplat', 'glb', 'gltf'].includes(selectedAssetType.value) && Number(props.selectedAsset?.size ?? 0) > 0) ||
  (selectedAssetType.value === 'ply' && props.selectedAsset?.derivedAssets?.some((asset) => asset.type === 'sog' && asset.status === 'ready' && Number(asset.size ?? 0) > 0)) ||
  (selectedAssetType.value === 'obj' && props.selectedAsset?.derivedAssets?.some((asset) => asset.type === 'glb' && asset.status === 'ready' && Number(asset.size ?? 0) > 0))
));

const selectedAssetProcessLabel = computed(() => (
  props.selectedAsset?.latestDerivedAsset?.status === 'failed' ? 'Retry Process' : 'Process Asset'
));

const selectedAssetHint = computed(() => {
  if (!props.selectedAsset) {
    return '';
  }

  if (selectedAssetType.value === 'ply' || selectedAssetType.value === 'obj') {
    const latestDerivedAsset = props.selectedAsset.latestDerivedAsset ?? null;

    if (!latestDerivedAsset) {
      return 'Process this asset before adding it to the scene.';
    }

    if (latestDerivedAsset.status === 'processing') {
      return 'Derived asset is still processing.';
    }

    if (latestDerivedAsset.status === 'failed') {
      return 'Derived asset failed. Retry processing first.';
    }

    if (latestDerivedAsset.status === 'ready') {
      if (Number(latestDerivedAsset.size ?? 0) <= 0) {
        return 'Derived asset is empty and cannot be added.';
      }

      return `Add to Scene will use derived ${String(latestDerivedAsset.type || '').toUpperCase()}.`;
    }
  }

  if (props.selectedAsset.role === 'derived' && props.selectedAsset.sourceAsset) {
    return `Derived from ${props.selectedAsset.sourceAsset.sourceName}.`;
  }

  return '';
});

function stopInputEvent(event) {
  event.stopPropagation();
}

function handleTransformKeydown(event) {
  event.stopPropagation();

  if (event.key === 'Enter') {
    event.preventDefault();
    emitTransform();
  }
}

function handleTransformBlur() {
  emitTransform();
}

function resetTransformForm(transform) {
  if (!transform) {
    transformForm.position = [0, 0, 0];
    transformForm.rotation = [0, 0, 0];
    transformForm.scale = 1;
    return;
  }

  transformForm.position = [...transform.position];
  transformForm.rotation = [...transform.rotation];
  transformForm.scale = transform.scale[0];
}

function resetVideoProjectionForm() {
  const projection = props.selection?.metadata?.videoProjection ?? null;
  videoProjectionForm.enabled = projection?.enabled ?? true;
  videoProjectionForm.mode = projection?.mode ?? 'cameraFrustum';
  videoProjectionForm.videoUrl = projection?.videoUrl ?? '';
  videoProjectionForm.opacity = projection?.opacity ?? 1;
  videoProjectionForm.softEdge = projection?.softEdge ?? 0.05;
  videoProjectionForm.flipY = projection?.flipY ?? false;
  videoProjectionForm.replaceMode = projection?.replaceMode ?? false;
  videoProjectionForm.quadPlaneTolerance = projection?.quadPlaneTolerance ?? 0.25;
}

function resetPatrolForm() {
  patrolForm.speed = robotDogPatrol.value.speed ?? 2;
  patrolForm.loop = robotDogPatrol.value.loop ?? false;
}

watch(
  () => props.selection?.id,
  () => {
    const nextSelection = props.selection;
    renameValue.value = nextSelection?.displayName ?? nextSelection?.name ?? '';
  },
  { immediate: true }
);

watch(
  () => {
    if (props.selection?.type === 'bim-proxy') {
      return JSON.stringify(props.alignment);
    }

    return JSON.stringify(props.selection?.transform ?? null);
  },
  () => {
    const transform = props.selection?.type === 'bim-proxy'
      ? props.alignment
      : props.selection?.transform;

    resetTransformForm(transform);
  },
  { immediate: true, deep: true }
);

watch(
  () => `${props.steps.move}|${props.steps.rotate}|${props.steps.scale}`,
  () => {
    stepForm.move = props.steps.move;
    stepForm.rotate = props.steps.rotate;
    stepForm.scale = props.steps.scale;
  },
  { immediate: true }
);

watch(
  () => props.selection?.metadata?.videoProjection,
  () => {
    resetVideoProjectionForm();
  },
  { immediate: true, deep: true }
);

watch(
  () => props.selection?.metadata?.patrol,
  () => {
    resetPatrolForm();
  },
  { immediate: true, deep: true }
);

function emitSteps() {
  emit('action', 'set-steps', {
    move: stepForm.move,
    rotate: stepForm.rotate,
    scale: stepForm.scale
  });
}

function emitTransform() {
  emit('action', 'apply-alignment', {
    position: [...transformForm.position],
    rotation: [...transformForm.rotation],
    scale: [transformForm.scale, transformForm.scale, transformForm.scale]
  });
}

function saveAlignment() {
  emit('action', 'save-alignment', {
    position: [...transformForm.position],
    rotation: [...transformForm.rotation],
    scale: [transformForm.scale, transformForm.scale, transformForm.scale]
  });
}

function emitVideoProjectionPatch() {
  emit('action', 'update-video-projection', {
    enabled: videoProjectionForm.enabled,
    mode: videoProjectionForm.mode,
    videoUrl: videoProjectionForm.videoUrl,
    opacity: videoProjectionForm.opacity,
    softEdge: videoProjectionForm.softEdge,
    flipY: videoProjectionForm.flipY,
    replaceMode: videoProjectionForm.replaceMode,
    quadPlaneTolerance: videoProjectionForm.quadPlaneTolerance
  });
}

function emitRobotDogSpeed() {
  emit('action', 'robot-dog-set-speed', {
    robotDogId: props.selection?.id,
    speed: patrolForm.speed
  });
}

function emitRobotDogLoop() {
  emit('action', 'robot-dog-set-loop', {
    robotDogId: props.selection?.id,
    loop: patrolForm.loop
  });
}
</script>

<template>
  <aside class="panel right-panel">
    <div class="panel-header">Inspector</div>
    <div class="panel-body inspector-body">
      <div v-if="selectedAsset" class="inspector-block">
        <div class="section-title">Asset</div>
        <div class="inspector-meta-grid">
          <div class="inspector-meta">
            <span>Kind</span>
            <strong>Asset</strong>
          </div>
          <div class="inspector-meta inspector-meta-wide">
            <span>Name</span>
            <strong :title="selectedAsset.sourceName">{{ selectedAsset.sourceName }}</strong>
          </div>
          <div class="inspector-meta">
            <span>Format</span>
            <strong>{{ selectedAsset.type }}</strong>
          </div>
          <div class="inspector-meta">
            <span>Role</span>
            <strong>{{ selectedAsset.role || '-' }}</strong>
          </div>
          <div class="inspector-meta">
            <span>Status</span>
            <strong>{{ selectedAsset.status || '-' }}</strong>
          </div>
          <div class="inspector-meta">
            <span>Size</span>
            <strong>{{ typeof selectedAsset.size === 'number' ? `${selectedAsset.size} bytes` : '-' }}</strong>
          </div>
          <div class="inspector-meta inspector-meta-wide">
            <span>URL</span>
            <strong class="asset-url" :title="selectedAsset.url">{{ selectedAsset.url }}</strong>
          </div>
          <div class="inspector-meta inspector-meta-wide">
            <span>Asset ID</span>
            <strong :title="selectedAsset.id">{{ selectedAsset.id }}</strong>
          </div>
          <div class="inspector-meta inspector-meta-wide">
            <span>Source Asset ID</span>
            <strong :title="selectedAsset.sourceAssetId || '-'">{{ selectedAsset.sourceAssetId || '-' }}</strong>
          </div>
          <div class="inspector-meta inspector-meta-wide">
            <span>Derived Asset IDs</span>
            <strong :title="selectedAsset.derivedAssetIds?.join(', ') || '-'">{{ selectedAsset.derivedAssetIds?.join(', ') || '-' }}</strong>
          </div>
          <div class="inspector-meta inspector-meta-wide">
            <span>Created At</span>
            <strong :title="selectedAsset.createdAt || '-'">{{ selectedAsset.createdAt || '-' }}</strong>
          </div>
          <div v-if="selectedAsset.error" class="inspector-meta inspector-meta-wide">
            <span>Error</span>
            <strong :title="selectedAsset.error">{{ selectedAsset.error }}</strong>
          </div>
        </div>

        <div class="inspector-subsection">
          <div class="section-subtitle">Actions</div>
          <div class="inspector-actions">
            <button
              v-if="['ply', 'obj'].includes(String(selectedAsset.type || '').toLowerCase())"
              type="button"
              @click="emit('action', 'process-asset', selectedAsset)"
            >
              {{ selectedAssetProcessLabel }}
            </button>
            <button
              type="button"
              :disabled="!selectedAssetHasReadyRuntime"
              @click="emit('action', 'add-asset-to-scene', selectedAsset)"
            >
              Add to Scene
            </button>
            <button type="button" @click="emit('action', 'copy-asset-url', selectedAsset)">Copy URL</button>
            <button type="button" @click="emit('action', 'delete-asset', selectedAsset)">Delete Asset</button>
          </div>
          <div v-if="selectedAssetHint" class="inspector-note">{{ selectedAssetHint }}</div>
        </div>

        <div v-if="selectedAsset.derivedAssets?.length" class="inspector-subsection">
          <div class="section-subtitle">Derived Assets</div>
          <div class="inspector-meta-grid">
            <div
              v-for="derivedAsset in selectedAsset.derivedAssets"
              :key="derivedAsset.id"
              class="inspector-meta inspector-meta-wide"
            >
              <span>{{ derivedAsset.type.toUpperCase() }}</span>
              <strong :title="`${derivedAsset.sourceName} (${derivedAsset.status})`">
                {{ derivedAsset.sourceName }} / {{ derivedAsset.status }}
              </strong>
            </div>
          </div>
        </div>

        <div v-if="selectedAsset.sourceAsset" class="inspector-subsection">
          <div class="section-subtitle">Source Asset</div>
          <div class="inspector-meta-grid">
            <div class="inspector-meta inspector-meta-wide">
              <span>Source</span>
              <strong :title="selectedAsset.sourceAsset.sourceName">{{ selectedAsset.sourceAsset.sourceName }}</strong>
            </div>
          </div>
        </div>
      </div>

      <div v-else-if="!activeSelection" class="inspector-block">
        <div class="section-title">Inspector</div>
        <div class="inspector-empty">No selection</div>
      </div>

      <template v-else>
        <div class="inspector-block">
          <div class="section-title">Selection</div>
          <div class="inspector-rename">
            <label class="inspector-field">
              <span>Name</span>
              <input v-model="renameValue.value" type="text" @keydown.enter.prevent="emit('action', 'rename', renameValue.value)" />
            </label>
            <button type="button" @click="emit('action', 'rename', renameValue.value)">Rename</button>
          </div>

          <div class="inspector-meta-grid">
            <div class="inspector-meta">
              <span>Type</span>
              <strong>{{ activeSelection.typeLabel ?? activeSelection.type }}</strong>
            </div>
            <div class="inspector-meta">
              <span>Status</span>
              <strong>{{ activeSelection.status }}</strong>
            </div>
            <div class="inspector-meta">
              <span>Visible</span>
              <strong>{{ String(activeSelection.visible) }}</strong>
            </div>
            <div class="inspector-meta inspector-meta-wide">
              <span>Asset URL</span>
              <strong :title="activeSelection.metadata?.url ?? '-'">{{ activeSelection.metadata?.url ?? '-' }}</strong>
            </div>
            <div v-if="activeSelection.metadata?.sourceName" class="inspector-meta inspector-meta-wide">
              <span>Source Name</span>
              <strong :title="activeSelection.metadata.sourceName">{{ activeSelection.metadata.sourceName }}</strong>
            </div>
            <div v-if="activeSelection.metadata?.businessType" class="inspector-meta inspector-meta-wide">
              <span>Business Type</span>
              <strong :title="activeSelection.metadata.businessType">{{ activeSelection.metadata.businessType }}</strong>
            </div>
            <div v-if="activeSelection.metadata?.source" class="inspector-meta inspector-meta-wide">
              <span>Source</span>
              <strong :title="activeSelection.metadata.source">{{ activeSelection.metadata.source }}</strong>
            </div>
            <div v-if="activeSelection.metadata?.placedBy" class="inspector-meta inspector-meta-wide">
              <span>Placed By</span>
              <strong :title="activeSelection.metadata.placedBy">{{ activeSelection.metadata.placedBy }}</strong>
            </div>
          </div>
        </div>

        <div v-if="isTransformEditable" class="inspector-block">
          <div class="section-title">{{ isBimProxy ? 'BIM Alignment' : 'Transform' }}</div>

          <div class="inspector-subsection">
            <div class="section-subtitle">Position</div>
            <div class="inspector-grid inspector-grid-three">
              <label class="inspector-field"><span>X</span><input v-model.number="transformForm.position[0]" type="number" step="0.1" @keydown="handleTransformKeydown" @blur="handleTransformBlur" /></label>
              <label class="inspector-field"><span>Y</span><input v-model.number="transformForm.position[1]" type="number" step="0.1" @keydown="handleTransformKeydown" @blur="handleTransformBlur" /></label>
              <label class="inspector-field"><span>Z</span><input v-model.number="transformForm.position[2]" type="number" step="0.1" @keydown="handleTransformKeydown" @blur="handleTransformBlur" /></label>
            </div>
          </div>

          <div class="inspector-subsection">
            <div class="section-subtitle">Rotation</div>
            <div class="inspector-grid inspector-grid-three">
              <label class="inspector-field"><span>Rot X</span><input v-model.number="transformForm.rotation[0]" type="number" step="1" @keydown="handleTransformKeydown" @blur="handleTransformBlur" /></label>
              <label class="inspector-field"><span>Rot Y</span><input v-model.number="transformForm.rotation[1]" type="number" step="1" @keydown="handleTransformKeydown" @blur="handleTransformBlur" /></label>
              <label class="inspector-field"><span>Rot Z</span><input v-model.number="transformForm.rotation[2]" type="number" step="1" @keydown="handleTransformKeydown" @blur="handleTransformBlur" /></label>
            </div>
          </div>

          <div class="inspector-subsection">
            <div class="section-subtitle">Scale</div>
            <div class="inspector-grid">
              <label class="inspector-field"><span>Scale</span><input v-model.number="transformForm.scale" type="number" step="0.01" @keydown="handleTransformKeydown" @blur="handleTransformBlur" /></label>
            </div>
          </div>

          <div class="inspector-subsection">
            <div class="section-subtitle">Steps</div>
            <div class="inspector-grid">
              <label class="inspector-field"><span>Move Step</span><input v-model.number="stepForm.move" type="number" step="0.1" @keydown="stopInputEvent" @change="emitSteps" /></label>
              <label class="inspector-field"><span>Rotate Step</span><input v-model.number="stepForm.rotate" type="number" step="0.1" @keydown="stopInputEvent" @change="emitSteps" /></label>
              <label class="inspector-field"><span>Scale Step</span><input v-model.number="stepForm.scale" type="number" step="0.01" @keydown="stopInputEvent" @change="emitSteps" /></label>
            </div>
          </div>

          <div class="inspector-subsection">
            <div class="section-subtitle">Nudge</div>
            <div class="nudge-grid">
              <div class="nudge-row"><span class="nudge-label">X</span><div class="nudge-actions"><button type="button" @click="emit('action', 'nudge-position', { axis: 0, direction: 'minus' })">X -</button><button type="button" @click="emit('action', 'nudge-position', { axis: 0, direction: 'plus' })">X +</button></div></div>
              <div class="nudge-row"><span class="nudge-label">Y</span><div class="nudge-actions"><button type="button" @click="emit('action', 'nudge-position', { axis: 1, direction: 'minus' })">Y -</button><button type="button" @click="emit('action', 'nudge-position', { axis: 1, direction: 'plus' })">Y +</button></div></div>
              <div class="nudge-row"><span class="nudge-label">Z</span><div class="nudge-actions"><button type="button" @click="emit('action', 'nudge-position', { axis: 2, direction: 'minus' })">Z -</button><button type="button" @click="emit('action', 'nudge-position', { axis: 2, direction: 'plus' })">Z +</button></div></div>
              <div class="nudge-row"><span class="nudge-label">RotY</span><div class="nudge-actions"><button type="button" @click="emit('action', 'nudge-rotation', { axis: 1, direction: 'minus' })">RotY -</button><button type="button" @click="emit('action', 'nudge-rotation', { axis: 1, direction: 'plus' })">RotY +</button></div></div>
              <div class="nudge-row"><span class="nudge-label">Scale</span><div class="nudge-actions"><button type="button" @click="emit('action', 'nudge-scale', { direction: 'minus' })">Scale -</button><button type="button" @click="emit('action', 'nudge-scale', { direction: 'plus' })">Scale +</button></div></div>
            </div>
          </div>

          <div class="inspector-subsection">
            <div class="section-subtitle">Actions</div>
            <div class="inspector-actions">
              <button type="button" @click="emitTransform">Apply</button>
              <button v-if="isBimProxy" type="button" @click="emit('action', 'reset-alignment')">Reset</button>
              <button v-if="isBimProxy" type="button" @click="saveAlignment">Save</button>
              <button v-if="isBimProxy" type="button" @click="emit('action', 'load-alignment')">Load</button>
              <button v-if="isBimProxy" type="button" @click="emit('action', 'focus-bim')">Focus BIM</button>
              <button v-if="!isBimProxy" type="button" @click="emit('action', 'focus-selected')">Focus</button>
              <button v-if="isGsplat" type="button" @click="emit('action', 'focus-map')">Focus Map</button>
              <button v-if="isGsplat" type="button" @click="emit('action', 'reload-base')">Reload Base SOG</button>
              <button v-if="isBimProxy" type="button" @click="emit('action', 'copy-alignment-json')">Copy JSON</button>
              <button type="button" @click="emit('action', 'delete-selected')">Delete</button>
            </div>
          </div>
        </div>

        <div v-if="isRobotDog" class="inspector-block">
          <div class="section-title">巡航路线</div>
          <div class="inspector-meta-grid">
            <div class="inspector-meta">
              <span>路线状态</span>
              <strong>{{ patrolStateLabel }}</strong>
            </div>
            <div class="inspector-meta">
              <span>路线点数量</span>
              <strong>{{ patrolPointCount }}</strong>
            </div>
            <div class="inspector-meta">
              <span>编辑中</span>
              <strong>{{ String(robotDogPatrol.routeEditing ?? false) }}</strong>
            </div>
            <div class="inspector-meta">
              <span>循环巡航</span>
              <strong>{{ String(patrolForm.loop) }}</strong>
            </div>
          </div>

          <div class="inspector-subsection">
            <div class="section-subtitle">参数</div>
            <div class="inspector-grid">
              <label class="inspector-field">
                <span>速度</span>
                <input v-model.number="patrolForm.speed" type="number" min="0.1" step="0.1" @change="emitRobotDogSpeed" />
              </label>
              <label class="inspector-field">
                <span>循环巡航</span>
                <input v-model="patrolForm.loop" type="checkbox" @change="emitRobotDogLoop" />
              </label>
            </div>
          </div>

          <div class="inspector-subsection">
            <div class="section-subtitle">操作</div>
            <div class="inspector-actions">
              <button
                type="button"
                :disabled="robotDogPatrol.routeEditing"
                @click="emit('action', 'robot-dog-start-edit', { robotDogId: activeSelection.id })"
              >
                开始编辑路线
              </button>
              <button
                type="button"
                :disabled="!robotDogPatrol.routeEditing"
                @click="emit('action', 'robot-dog-stop-edit', { robotDogId: activeSelection.id })"
              >
                停止编辑路线
              </button>
              <button type="button" @click="emit('action', 'robot-dog-clear-route', { robotDogId: activeSelection.id })">清空路线</button>
              <button
                type="button"
                :disabled="!patrolCanStart"
                @click="emit('action', 'robot-dog-start-patrol', { robotDogId: activeSelection.id })"
              >
                开始巡航
              </button>
              <button
                type="button"
                :disabled="robotDogPatrol.state !== 'running'"
                @click="emit('action', 'robot-dog-pause-patrol', { robotDogId: activeSelection.id })"
              >
                暂停
              </button>
              <button
                type="button"
                :disabled="robotDogPatrol.state !== 'paused'"
                @click="emit('action', 'robot-dog-resume-patrol', { robotDogId: activeSelection.id })"
              >
                继续
              </button>
              <button
                type="button"
                :disabled="!['running', 'paused', 'finished', 'ready'].includes(robotDogPatrol.state)"
                @click="emit('action', 'robot-dog-stop-patrol', { robotDogId: activeSelection.id })"
              >
                停止
              </button>
            </div>
          </div>
        </div>

        <div v-if="false && isCameraDevice" class="inspector-block">
          <div class="section-title">VIDEO PROJECTION</div>
          <div class="inspector-meta-grid">
            <div class="inspector-meta">
              <span>Enabled</span>
              <strong>{{ String(videoProjectionForm.enabled) }}</strong>
            </div>
            <div class="inspector-meta">
              <span>模式</span>
              <strong>{{ videoProjectionForm.mode === 'quad' ? '四点区域投影' : '摄像头视锥投影' }}</strong>
            </div>
            <div class="inspector-meta">
              <span>已选点数</span>
              <strong>{{ quadPointCount }} / 4</strong>
            </div>
            <div class="inspector-meta inspector-meta-wide">
              <span>Video</span>
              <strong :title="videoProjectionForm.videoUrl || '-'">{{ videoProjectionForm.videoUrl || '-' }}</strong>
            </div>
          </div>

          <div class="inspector-subsection">
            <div class="section-subtitle">Parameters</div>
            <div class="inspector-grid">
              <label class="inspector-field">
                <span>投影模式</span>
                <select v-model="videoProjectionForm.mode" @change="emitVideoProjectionPatch">
                  <option value="cameraFrustum">摄像头视锥投影</option>
                  <option value="quad">四点区域投影</option>
                </select>
              </label>
              <label class="inspector-field">
                <span>Opacity</span>
                <input v-model.number="videoProjectionForm.opacity" type="number" min="0" max="1" step="0.05" @change="emitVideoProjectionPatch" />
              </label>
              <label class="inspector-field">
                <span>Soft Edge</span>
                <input v-model.number="videoProjectionForm.softEdge" type="number" min="0" max="1" step="0.01" @change="emitVideoProjectionPatch" />
              </label>
              <label class="inspector-field">
                <span>Flip Y</span>
                <input v-model="videoProjectionForm.flipY" type="checkbox" @change="emitVideoProjectionPatch" />
              </label>
            </div>
          </div>

          <div v-if="isQuadProjectionMode" class="inspector-subsection">
            <div class="section-subtitle">四点区域投影</div>
            <div class="inspector-meta-grid">
              <div class="inspector-meta">
                <span>已选点数</span>
                <strong>{{ quadPointCount }} / 4</strong>
              </div>
              <div class="inspector-meta inspector-meta-wide">
                <span>点位顺序</span>
                <strong>1 左上, 2 右上, 3 右下, 4 左下</strong>
              </div>
            </div>
            <div class="inspector-grid">
              <label class="inspector-field">
                <span>Plane Tolerance</span>
                <input v-model.number="videoProjectionForm.quadPlaneTolerance" type="number" min="0.001" step="0.01" @change="emitVideoProjectionPatch" />
              </label>
            </div>
            <div class="inspector-actions">
              <button type="button" @click="emit('action', 'start-quad-video-projection-editing')">开始选择四点</button>
              <button type="button" @click="emit('action', 'stop-quad-video-projection-editing')">停止选择</button>
              <button type="button" @click="emit('action', 'clear-quad-video-projection-points')">清空四点</button>
              <button type="button" :disabled="quadPointCount !== 4" @click="emit('action', 'apply-quad-video-projection')">应用四点投影</button>
            </div>
          </div>

          <div class="inspector-subsection">
            <div class="section-subtitle">Actions</div>
            <div class="inspector-actions">
              <button type="button" @click="emit('action', 'bind-test-video')">Bind test.mp4</button>
              <button type="button" @click="emit('action', 'toggle-projection-enabled')">{{ projectionToggleLabel }}</button>
            </div>
          </div>
        </div>

        <div v-else-if="isCameraDevice" class="inspector-block">
          <div class="section-title">VIDEO PROJECTION</div>
          <div class="inspector-meta-grid">
            <div class="inspector-meta">
              <span>Enabled</span>
              <strong>{{ String(videoProjectionForm.enabled) }}</strong>
            </div>
            <div class="inspector-meta">
              <span>模式</span>
              <strong>{{ projectionModeLabel }}</strong>
            </div>
            <div class="inspector-meta">
              <span>已选点数</span>
              <strong>{{ quadPointCount }} / 4</strong>
            </div>
            <div class="inspector-meta inspector-meta-wide">
              <span>Video</span>
              <strong :title="videoProjectionForm.videoUrl || '-'">{{ videoProjectionForm.videoUrl || '-' }}</strong>
            </div>
          </div>

          <div class="inspector-subsection">
            <div class="section-subtitle">Parameters</div>
            <div class="inspector-grid">
              <label class="inspector-field">
                <span>投影模式</span>
                <select v-model="videoProjectionForm.mode" @change="emitVideoProjectionPatch">
                  <option value="cameraFrustum">摄像头视锥投影</option>
                  <option value="quad">四点深度投影</option>
                  <option value="quadOverlay">四点覆盖投影</option>
                </select>
              </label>
              <label class="inspector-field">
                <span>Opacity</span>
                <input v-model.number="videoProjectionForm.opacity" type="number" min="0" max="1" step="0.05" @change="emitVideoProjectionPatch" />
              </label>
              <label class="inspector-field">
                <span>Soft Edge</span>
                <input v-model.number="videoProjectionForm.softEdge" type="number" min="0" max="1" step="0.01" @change="emitVideoProjectionPatch" />
              </label>
              <label class="inspector-field">
                <span>Flip Y</span>
                <input v-model="videoProjectionForm.flipY" type="checkbox" @change="emitVideoProjectionPatch" />
              </label>
              <label class="inspector-field">
                <span>覆盖模式</span>
                <select v-model="videoProjectionForm.replaceMode" @change="emitVideoProjectionPatch">
                  <option :value="false">混合</option>
                  <option :value="true">完全覆盖</option>
                </select>
              </label>
            </div>
            <div class="inspector-note">
              <template v-if="videoProjectionForm.mode === 'quadOverlay'">
                四点覆盖投影会忽略深度遮挡，只要屏幕 fragment 落在四点框内就覆盖视频，适合完整覆盖区域。
              </template>
              <template v-else-if="videoProjectionForm.mode === 'quad'">
                四点深度投影会根据 3DGS world position 和四点平面距离投影，更适合贴合真实表面。
              </template>
            </div>
          </div>

          <div v-if="isFourPointProjectionMode" class="inspector-subsection">
            <div class="section-subtitle">{{ isQuadProjectionMode ? '四点深度投影' : '四点覆盖投影' }}</div>
            <div class="inspector-meta-grid">
              <div class="inspector-meta">
                <span>已选点数</span>
                <strong>{{ quadPointCount }} / 4</strong>
              </div>
              <div class="inspector-meta inspector-meta-wide">
                <span>点位顺序</span>
                <strong>1 左上, 2 右上, 3 右下, 4 左下</strong>
              </div>
            </div>
            <div v-if="isQuadProjectionMode" class="inspector-grid">
              <label class="inspector-field">
                <span>Plane Tolerance</span>
                <input v-model.number="videoProjectionForm.quadPlaneTolerance" type="number" min="0.001" step="0.01" @change="emitVideoProjectionPatch" />
              </label>
            </div>
            <div class="inspector-actions">
              <button type="button" @click="emit('action', 'start-quad-video-projection-editing')">开始选择四点</button>
              <button type="button" @click="emit('action', 'stop-quad-video-projection-editing')">停止选择</button>
              <button type="button" @click="emit('action', 'clear-quad-video-projection-points')">清空四点</button>
              <button type="button" :disabled="quadPointCount !== 4" @click="emit('action', 'apply-quad-video-projection')">应用四点投影</button>
            </div>
          </div>

          <div class="inspector-subsection">
            <div class="section-subtitle">Actions</div>
            <div class="inspector-actions">
              <button type="button" @click="emit('action', 'bind-test-video')">Bind test.mp4</button>
              <button type="button" @click="emit('action', 'toggle-projection-enabled')">{{ projectionToggleLabel }}</button>
            </div>
          </div>
        </div>

        <div v-else-if="activeSelection.type === 'marker'" class="inspector-block">
          <div class="inspector-meta-grid">
            <div class="inspector-meta inspector-meta-wide">
              <span>Position</span>
              <strong>{{ activeSelection.metadata?.position ?? '-' }}</strong>
            </div>
          </div>
          <div class="inspector-actions">
            <button type="button" @click="emit('action', 'clear-marker')">Clear Marker</button>
            <button type="button" @click="emit('action', 'focus-marker')">Focus Marker</button>
            <button type="button" @click="emit('action', 'delete-selected')">Delete</button>
          </div>
        </div>

        <div v-else-if="activeSelection.type === 'camera'" class="inspector-block">
          <div class="inspector-meta-grid">
            <div class="inspector-meta inspector-meta-wide"><span>Target</span><strong>{{ cameraState.target }}</strong></div>
            <div class="inspector-meta"><span>Distance</span><strong>{{ cameraState.distance }}</strong></div>
            <div class="inspector-meta"><span>Yaw</span><strong>{{ cameraState.yaw }}</strong></div>
            <div class="inspector-meta"><span>Pitch</span><strong>{{ cameraState.pitch }}</strong></div>
          </div>
          <div class="inspector-actions">
            <button type="button" @click="emit('action', 'reset-camera')">Reset Camera</button>
          </div>
        </div>

        <div v-else-if="activeSelection.type === 'debug'" class="inspector-block">
          <div class="inspector-actions">
            <button type="button" @click="emit('action', 'toggle-debug')">Show/Hide Debug</button>
          </div>
        </div>

        <div v-else class="inspector-block">
          <div class="inspector-actions">
            <button v-if="!activeSelection.protected" type="button" @click="emit('action', 'delete-selected')">Delete</button>
          </div>
        </div>
      </template>
    </div>
  </aside>
</template>
