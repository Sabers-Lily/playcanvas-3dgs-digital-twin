<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { UI_FLAGS } from '../config/uiFlags.js';
import InspectorSection from './editor/InspectorSection.vue';
import ObjectStatusChip from './editor/ObjectStatusChip.vue';
import { CAMERA_SOURCE_TYPES, CAMERA_STREAM_STATUSES } from '../../../../packages/shared/src/cameras.js';

const props = defineProps({
  selection: {
    type: Object,
    default: null
  },
  selectedAsset: {
    type: Object,
    default: null
  },
  cameraStreams: {
    type: Object,
    default: () => ({
      cameras: [],
      statuses: {},
      projectionRuntimes: {},
      apiStatus: 'idle'
    })
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
  transformEdit: {
    type: Object,
    default: () => ({
      enabled: false,
      objectId: null,
      startTransform: null,
      dragMode: 'none'
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

const previewHostRef = ref(null);
const isEditingProjectionStreamUrl = ref(false);
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
const videoProjectionForm = reactive({
  enabled: false,
  sourceType: CAMERA_SOURCE_TYPES.CAMERA_STREAM,
  cameraId: 'camera1',
  streamUrl: '',
  mode: 'quadOverlay',
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
const buildingEnvelopeForm = reactive({
  height: 5,
  color: '#00A3FF',
  opacity: 0.25,
  outlineVisible: true,
  fillVisible: true,
  topVisible: true,
  sideVisible: true,
  displayMode: 'overlay'
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
  'buildingEnvelope',
  'device',
  'hotspot',
  'annotation',
  'routePoint'
]);

const activeSelection = computed(() => (props.selectedAsset ? null : props.selection));
const isBimProxy = computed(() => props.selection?.type === 'bim-proxy');
const isGsplat = computed(() => props.selection?.type === 'gsplat');
const isCameraDevice = computed(() => props.selection?.type === 'cameraDevice');
const isRobotDog = computed(() => props.selection?.type === 'robotDog');
const isBuildingEnvelope = computed(() => props.selection?.type === 'buildingEnvelope');
const isMarker = computed(() => props.selection?.type === 'marker');
const isTransformEditable = computed(() => TRANSFORM_EDITABLE_TYPES.has(props.selection?.type));
const isTransformEditingSelection = computed(() => (
  Boolean(props.transformEdit?.enabled) &&
  props.transformEdit?.objectId === props.selection?.id
));
const transformGuideText = computed(() => (
  isTransformEditingSelection.value
    ? '正在编辑当前对象的 Transform，按 Enter 或失焦后提交。'
    : '可直接修改 Transform 数值，按 Enter 或失焦后提交。'
));
const selectedAssetType = computed(() => String(props.selectedAsset?.type || '').toLowerCase());
const videoProjection = computed(() => props.selection?.metadata?.videoProjection ?? {});
const cameraOptions = computed(() => Array.isArray(props.cameraStreams?.cameras) ? props.cameraStreams.cameras : []);
const currentProjectionRuntime = computed(() => (
  props.selection?.id
    ? props.cameraStreams?.projectionRuntimes?.[props.selection.id] ?? null
    : null
));
const currentCameraStreamStatus = computed(() => {
  const cameraId = videoProjectionForm.cameraId || videoProjection.value.cameraId;
  return props.cameraStreams?.statuses?.[cameraId] ?? null;
});
const cameraStreamStatusLabel = computed(() => {
  const status = currentCameraStreamStatus.value?.status ?? CAMERA_STREAM_STATUSES.IDLE;

  if (status === CAMERA_STREAM_STATUSES.STARTING) {
    return '启动中';
  }

  if (status === CAMERA_STREAM_STATUSES.RUNNING) {
    return '运行中';
  }

  if (status === CAMERA_STREAM_STATUSES.ERROR) {
    return '错误';
  }

  if (status === CAMERA_STREAM_STATUSES.STOPPED) {
    return '未启动';
  }

  return '未启动';
});
const quadPointCount = computed(() => videoProjection.value.quadPoints?.length ?? 0);
const isFourPointProjectionMode = computed(() => true);
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
const buildingEnvelope = computed(() => props.selection?.metadata?.envelope ?? null);
const buildingEnvelopePointCount = computed(() => buildingEnvelope.value?.points?.length ?? 0);


const projectionModeLabel = computed(() => {
  return '四点覆盖投影';
});

const projectionPreviewUrl = computed(() => (
  videoProjectionForm.sourceType === CAMERA_SOURCE_TYPES.CAMERA_STREAM
    ? (videoProjectionForm.streamUrl || currentCameraStreamStatus.value?.absolutePlayUrl || videoProjection.value.streamUrl || videoProjectionForm.videoUrl || props.selection?.metadata?.videoProjection?.videoUrl || '')
    : (videoProjectionForm.videoUrl || props.selection?.metadata?.videoProjection?.videoUrl || '')
));
const projectionStatusLabel = computed(() => {
  if (videoProjectionForm.enabled && quadPointCount.value === 4) {
    return '已应用';
  }

  if (videoProjectionForm.enabled) {
    return '已开启';
  }

  return '已关闭';
});
const projectionRuntimeSummary = computed(() => {
  const runtimeState = currentProjectionRuntime.value;
  if (!runtimeState) {
    return [];
  }

  return [
    `time=${runtimeState.currentTime ?? 0}`,
    `ready=${runtimeState.readyState ?? 0}`,
    `paused=${runtimeState.paused ? 'yes' : 'no'}`,
    `size=${runtimeState.videoWidth ?? 0}x${runtimeState.videoHeight ?? 0}`
  ];
});
const shouldShowFallbackPreview = computed(() => (
  !currentProjectionRuntime.value?.previewVideoElement &&
  Boolean(projectionPreviewUrl.value)
));
const robotDogTestVideoUrl = '/assets/test.mp4';

const selectedAssetHasReadyRuntime = computed(() => (
  (['sog', 'gsplat', 'glb', 'gltf'].includes(selectedAssetType.value) && Number(props.selectedAsset?.size ?? 0) > 0) ||
  (selectedAssetType.value === 'ply' && props.selectedAsset?.derivedAssets?.some((asset) => asset.type === 'sog' && asset.status === 'ready' && Number(asset.size ?? 0) > 0)) ||
  (selectedAssetType.value === 'obj' && props.selectedAsset?.derivedAssets?.some((asset) => asset.type === 'glb' && asset.status === 'ready' && Number(asset.size ?? 0) > 0))
));

const selectedAssetProcessLabel = computed(() => (
  props.selectedAsset?.latestDerivedAsset?.status === 'failed' ? '重试处理' : '处理资源'
));

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

function resetVideoProjectionForm({ preserveStreamUrl = false } = {}) {
  const projection = props.selection?.metadata?.videoProjection ?? null;
  videoProjectionForm.enabled = projection?.enabled ?? false;
  videoProjectionForm.sourceType = CAMERA_SOURCE_TYPES.CAMERA_STREAM;
  videoProjectionForm.cameraId = projection?.cameraId ?? 'camera1';
  if (!preserveStreamUrl && !isEditingProjectionStreamUrl.value) {
    videoProjectionForm.streamUrl = projection?.streamUrl ?? '';
  }
  videoProjectionForm.mode = 'quadOverlay';
  if (!preserveStreamUrl && !isEditingProjectionStreamUrl.value) {
    videoProjectionForm.videoUrl = projection?.videoUrl ?? '';
  }
  videoProjectionForm.opacity = projection?.opacity ?? 1;
  videoProjectionForm.softEdge = projection?.softEdge ?? 0;
  videoProjectionForm.flipY = projection?.flipY ?? false;
  videoProjectionForm.replaceMode = projection?.replaceMode ?? true;
  videoProjectionForm.quadPlaneTolerance = projection?.quadPlaneTolerance ?? 0.25;
}

function resetPatrolForm() {
  patrolForm.speed = robotDogPatrol.value.speed ?? 2;
  patrolForm.loop = robotDogPatrol.value.loop ?? false;
}

function resetBuildingEnvelopeForm() {
  const envelope = props.selection?.metadata?.envelope ?? null;
  buildingEnvelopeForm.height = envelope?.height ?? 0;
  buildingEnvelopeForm.color = envelope?.color ?? '#00A3FF';
  buildingEnvelopeForm.opacity = envelope?.opacity ?? 0.25;
  buildingEnvelopeForm.outlineVisible = envelope?.outlineVisible ?? true;
  buildingEnvelopeForm.fillVisible = envelope?.fillVisible ?? true;
  buildingEnvelopeForm.topVisible = envelope?.topVisible ?? true;
  buildingEnvelopeForm.sideVisible = envelope?.sideVisible ?? true;
  buildingEnvelopeForm.displayMode = envelope?.displayMode === 'depth' ? 'depth' : 'overlay';
}

watch(
  () => props.selection?.id,
  () => {
    const nextSelection = props.selection;
    renameValue.value = nextSelection?.displayName ?? nextSelection?.name ?? '';
    isEditingProjectionStreamUrl.value = false;
    resetVideoProjectionForm({ preserveStreamUrl: false });
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
  () => JSON.stringify(props.selection?.metadata?.videoProjection ?? null),
  () => resetVideoProjectionForm({ preserveStreamUrl: true }),
  { immediate: true }
);

watch(
  () => props.selection?.metadata?.patrol,
  () => resetPatrolForm(),
  { immediate: true, deep: true }
);

watch(
  () => props.selection?.metadata?.envelope,
  () => resetBuildingEnvelopeForm(),
  { immediate: true, deep: true }
);

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

function handleEnterTransformEdit() {
  emit('action', 'enter-transform-edit', {
    objectId: props.selection?.id
  });
}

function emitVideoProjectionPatch(patch = {}) {
  emit('action', 'update-video-projection', {
    enabled: videoProjectionForm.enabled,
    sourceType: videoProjectionForm.sourceType,
    cameraId: videoProjectionForm.cameraId,
    streamUrl: videoProjectionForm.streamUrl || null,
    mode: 'quadOverlay',
    videoUrl: videoProjectionForm.videoUrl,
    opacity: videoProjectionForm.opacity,
    softEdge: videoProjectionForm.softEdge,
    flipY: videoProjectionForm.flipY,
    replaceMode: videoProjectionForm.replaceMode,
    quadPlaneTolerance: videoProjectionForm.quadPlaneTolerance,
    ...patch
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

function emitBuildingEnvelopeHeight() {
  if (Number(buildingEnvelopeForm.height) > 0) {
    buildingEnvelopeForm.topVisible = true;
    buildingEnvelopeForm.sideVisible = true;
  } else {
    buildingEnvelopeForm.topVisible = false;
    buildingEnvelopeForm.sideVisible = false;
  }

  emit('action', 'set-building-envelope-height', {
    objectId: props.selection?.id,
    height: buildingEnvelopeForm.height
  });
}

function emitBuildingEnvelopeColor() {
  emit('action', 'set-building-envelope-color', {
    objectId: props.selection?.id,
    color: buildingEnvelopeForm.color
  });
}

function emitBuildingEnvelopeOpacity() {
  emit('action', 'set-building-envelope-opacity', {
    objectId: props.selection?.id,
    opacity: buildingEnvelopeForm.opacity
  });
}

function emitBuildingEnvelopeToggle(action, value) {
  emit('action', action, {
    objectId: props.selection?.id,
    visible: value
  });
}

function emitBuildingEnvelopeDisplayMode() {
  emit('action', 'set-building-envelope-display-mode', {
    objectId: props.selection?.id,
    displayMode: buildingEnvelopeForm.displayMode
  });
}

function handleCameraStreamSelectionChange() {
  isEditingProjectionStreamUrl.value = false;
  emitVideoProjectionPatch({
    enabled: videoProjection.value.enabled ?? videoProjectionForm.enabled
  });
  emit('action', 'bind-camera-stream', {
    cameraId: videoProjectionForm.cameraId
  });
}

function handleProjectionStreamUrlFocus() {
  isEditingProjectionStreamUrl.value = true;
}

function handleProjectionStreamUrlChange() {
  const normalizedUrl = String(videoProjectionForm.streamUrl || '').trim();
  videoProjectionForm.streamUrl = normalizedUrl;
  videoProjectionForm.videoUrl = normalizedUrl;
  isEditingProjectionStreamUrl.value = false;
  emitVideoProjectionPatch({
    streamUrl: normalizedUrl || null,
    videoUrl: normalizedUrl
  });
}

function detachPreviewVideo(videoElement = currentProjectionRuntime.value?.previewVideoElement ?? null) {
  if (videoElement?.parentElement === previewHostRef.value) {
    previewHostRef.value.removeChild(videoElement);
  }
}

function attachPreviewVideo() {
  const host = previewHostRef.value;
  const videoElement = currentProjectionRuntime.value?.previewVideoElement ?? null;

  if (!host || !videoElement) {
    return;
  }

  if (videoElement.parentElement && videoElement.parentElement !== host) {
    videoElement.parentElement.removeChild(videoElement);
  }

  if (videoElement.parentElement !== host) {
    host.appendChild(videoElement);
  }

  videoElement.controls = true;
  videoElement.muted = true;
  videoElement.playsInline = true;
}

watch(
  () => currentProjectionRuntime.value?.previewVideoElement,
  (nextVideoElement, previousVideoElement) => {
    if (previousVideoElement && previousVideoElement !== nextVideoElement) {
      detachPreviewVideo(previousVideoElement);
    }
    attachPreviewVideo();
  },
  { immediate: true }
);

onMounted(() => {
  attachPreviewVideo();
});

onBeforeUnmount(() => {
  detachPreviewVideo();
});
</script>

<template>
  <aside class="panel right-panel">
    <div class="panel-header">属性</div>
    <div class="panel-body inspector-body">
      <div v-if="selectedAsset" class="inspector-card">
        <InspectorSection title="基础信息" :default-open="true">
          <div class="inspector-meta-grid">
            <div class="inspector-meta"><span>名称</span><strong>{{ selectedAsset.sourceName }}</strong></div>
            <div class="inspector-meta"><span>格式</span><strong>{{ selectedAsset.type }}</strong></div>
            <div class="inspector-meta"><span>角色</span><strong>{{ selectedAsset.role || '-' }}</strong></div>
            <div class="inspector-meta"><span>状态</span><ObjectStatusChip :value="selectedAsset.displayStatus || selectedAsset.status || '-'" /></div>
            <div class="inspector-meta"><span>大小</span><strong>{{ typeof selectedAsset.size === 'number' ? `${selectedAsset.size} bytes` : '-' }}</strong></div>
            <div class="inspector-meta"><span>链接</span><strong :title="selectedAsset.url">{{ selectedAsset.url }}</strong></div>
          </div>
        </InspectorSection>

        <InspectorSection title="操作" :default-open="true">
          <div class="inspector-actions">
            <button
              v-if="['ply', 'obj'].includes(String(selectedAsset.type || '').toLowerCase())"
              class="button-secondary"
              type="button"
              @click="emit('action', 'process-asset', selectedAsset)"
            >
              {{ selectedAssetProcessLabel }}
            </button>
            <button class="button-primary" type="button" :disabled="!selectedAssetHasReadyRuntime" @click="emit('action', 'add-asset-to-scene', selectedAsset)">
              添加到场景
            </button>
            <button class="button-secondary" type="button" @click="emit('action', 'copy-asset-url', selectedAsset)">复制链接</button>
            <button class="button-danger" type="button" @click="emit('action', 'delete-asset', selectedAsset)">删除资源</button>
          </div>
        </InspectorSection>
      </div>

      <div v-else-if="!activeSelection" class="inspector-card">
        <div class="inspector-empty">当前没有选中对象</div>
      </div>

      <template v-else>
        <div class="inspector-card">
          <InspectorSection title="基础信息" :default-open="true">
            <div class="inspector-grid">
              <label class="inspector-field">
                <span>名称</span>
                <input v-model="renameValue.value" type="text" @keydown.enter.prevent="emit('action', 'rename', renameValue.value)" />
              </label>
              <div class="inspector-actions">
                <button class="button-secondary" type="button" @click="emit('action', 'rename', renameValue.value)">重命名</button>
              </div>
            </div>

            <div class="inspector-meta-grid">
              <div class="inspector-meta"><span>类型</span><strong>{{ activeSelection.typeLabel ?? activeSelection.type }}</strong></div>
              <div class="inspector-meta"><span>状态</span><ObjectStatusChip :value="activeSelection.status" /></div>
              <div class="inspector-meta"><span>可见</span><strong>{{ activeSelection.visible ? '是' : '否' }}</strong></div>
              <div v-if="activeSelection.metadata?.source" class="inspector-meta"><span>来源</span><strong>{{ activeSelection.metadata.source }}</strong></div>
              <div v-if="activeSelection.metadata?.sourceName" class="inspector-meta"><span>资源名</span><strong>{{ activeSelection.metadata.sourceName }}</strong></div>
            </div>
          </InspectorSection>

          <InspectorSection v-if="isTransformEditable" title="Transform" :default-open="true">
            <div class="inspector-grid">
              <div class="vector3-grid">
                <label class="inspector-field"><span>Position X</span><input v-model.number="transformForm.position[0]" type="number" step="0.1" @keydown="handleTransformKeydown" @blur="handleTransformBlur" /></label>
                <label class="inspector-field"><span>Position Y</span><input v-model.number="transformForm.position[1]" type="number" step="0.1" @keydown="handleTransformKeydown" @blur="handleTransformBlur" /></label>
                <label class="inspector-field"><span>Position Z</span><input v-model.number="transformForm.position[2]" type="number" step="0.1" @keydown="handleTransformKeydown" @blur="handleTransformBlur" /></label>
              </div>

              <div class="vector3-grid">
                <label class="inspector-field"><span>Rotation X</span><input v-model.number="transformForm.rotation[0]" type="number" step="1" @keydown="handleTransformKeydown" @blur="handleTransformBlur" /></label>
                <label class="inspector-field"><span>Rotation Y</span><input v-model.number="transformForm.rotation[1]" type="number" step="1" @keydown="handleTransformKeydown" @blur="handleTransformBlur" /></label>
                <label class="inspector-field"><span>Rotation Z</span><input v-model.number="transformForm.rotation[2]" type="number" step="1" @keydown="handleTransformKeydown" @blur="handleTransformBlur" /></label>
              </div>

              <label class="inspector-field">
                <span>Scale</span>
                <input v-model.number="transformForm.scale" type="number" step="0.01" @keydown="handleTransformKeydown" @blur="handleTransformBlur" />
              </label>

              <div class="inspector-note">
                {{ transformGuideText }}
              </div>
            </div>
          </InspectorSection>

          <InspectorSection v-if="UI_FLAGS.showStepControls && isTransformEditable" title="步进" :default-open="false">
            <div class="inspector-grid">
              <label class="inspector-field"><span>Move Step</span><input v-model.number="stepForm.move" type="number" step="0.1" @keydown="stopInputEvent" @change="emitSteps" /></label>
              <label class="inspector-field"><span>Rotate Step</span><input v-model.number="stepForm.rotate" type="number" step="0.1" @keydown="stopInputEvent" @change="emitSteps" /></label>
              <label class="inspector-field"><span>Scale Step</span><input v-model.number="stepForm.scale" type="number" step="0.01" @keydown="stopInputEvent" @change="emitSteps" /></label>
            </div>
          </InspectorSection>

          <InspectorSection v-if="UI_FLAGS.showNudgeControls && isTransformEditable" title="微调" :default-open="false">
            <div class="inspector-actions">
              <button class="button-secondary" type="button" @click="emit('action', 'nudge-position', { axis: 0, direction: 'minus' })">X -</button>
              <button class="button-secondary" type="button" @click="emit('action', 'nudge-position', { axis: 0, direction: 'plus' })">X +</button>
              <button class="button-secondary" type="button" @click="emit('action', 'nudge-position', { axis: 1, direction: 'minus' })">Y -</button>
              <button class="button-secondary" type="button" @click="emit('action', 'nudge-position', { axis: 1, direction: 'plus' })">Y +</button>
              <button class="button-secondary" type="button" @click="emit('action', 'nudge-position', { axis: 2, direction: 'minus' })">Z -</button>
              <button class="button-secondary" type="button" @click="emit('action', 'nudge-position', { axis: 2, direction: 'plus' })">Z +</button>
            </div>
          </InspectorSection>

          <InspectorSection v-if="isCameraDevice" title="视频投影" :default-open="true">
            <div class="inspector-meta-grid">
              <div class="inspector-meta"><span>启用</span><strong>{{ videoProjectionForm.enabled ? '是' : '否' }}</strong></div>
              <div class="inspector-meta"><span>模式</span><strong>{{ projectionModeLabel }}</strong></div>
              <div class="inspector-meta"><span>已选点数</span><strong>{{ quadPointCount }} / 4</strong></div>
              <div class="inspector-meta"><span>视频源</span><strong :title="projectionPreviewUrl">{{ projectionPreviewUrl }}</strong></div>
              <div class="inspector-meta"><span>流状态</span><strong>{{ cameraStreamStatusLabel }}</strong></div>
              <div class="inspector-meta"><span>投影状态</span><strong>{{ projectionStatusLabel }}</strong></div>
            </div>

            <div class="inspector-grid">
              <label class="inspector-field">
                <span>HLS 地址</span>
                <input
                  v-model="videoProjectionForm.streamUrl"
                  type="text"
                  placeholder="请输入 HLS 地址"
                  @focus="handleProjectionStreamUrlFocus"
                  @change="handleProjectionStreamUrlChange"
                />
              </label>
            </div>

            <div class="inspector-grid">
              <div class="inspector-field">
                <span>视频</span>
                <div ref="previewHostRef" class="inspector-video-preview-host" />
                <video
                  v-if="shouldShowFallbackPreview"
                  class="inspector-video-preview"
                  :src="projectionPreviewUrl"
                  controls
                  muted
                  autoplay
                  playsinline
                ></video>
                <div v-if="currentProjectionRuntime" class="inspector-note">
                  {{ currentProjectionRuntime.status || 'idle' }}
                  <span v-if="projectionRuntimeSummary.length"> | {{ projectionRuntimeSummary.join(' | ') }}</span>
                </div>
              </div>
            </div>
            <div class="projection-action-groups">
              <div v-if="isFourPointProjectionMode" class="projection-action-group">
                <div class="projection-action-title">四点区域</div>
                <div class="projection-action-grid">
                  <button class="button-secondary" type="button" @click="emit('action', 'start-quad-video-projection-editing')">开始选四点</button>
                  <button class="button-secondary" type="button" @click="emit('action', 'clear-quad-video-projection-points')">清空四点</button>
                </div>
                <div class="projection-action-grid">
                  <button class="button-primary" type="button" :disabled="quadPointCount !== 4" @click="emit('action', 'apply-quad-video-projection')">打开投影</button>
                  <button class="button-secondary" type="button" :disabled="!videoProjectionForm.enabled" @click="emit('action', 'disable-video-projection')">关闭投影</button>
                </div>
              </div>

              <div class="projection-action-group">
                <div class="projection-action-title">摄像头流</div>
                <div class="projection-action-grid">
                  <button class="button-secondary" type="button" @click="emit('action', 'start-camera-stream', { cameraId: videoProjectionForm.cameraId })">启动摄像</button>
                  <button class="button-primary" type="button" @click="emit('action', 'bind-camera-stream', { cameraId: videoProjectionForm.cameraId })">绑定摄像</button>
                </div>
              </div>

            </div>

            <div v-if="currentCameraStreamStatus?.lastError" class="inspector-note">
              {{ currentCameraStreamStatus.lastError }}
            </div>
            <div v-else-if="currentProjectionRuntime?.lastError" class="inspector-note">
              {{ currentProjectionRuntime.lastError }}
            </div>
          </InspectorSection>

          <InspectorSection v-if="isBuildingEnvelope" title="标签参数" :default-open="true">
            <div class="inspector-grid">
              <label class="inspector-field"><span>高度</span><input v-model.number="buildingEnvelopeForm.height" type="number" min="0" step="0.1" @change="emitBuildingEnvelopeHeight" /></label>
              <label class="inspector-field"><span>颜色</span><input v-model="buildingEnvelopeForm.color" type="color" @change="emitBuildingEnvelopeColor" /></label>
              <label class="inspector-field"><span>透明度</span><input v-model.number="buildingEnvelopeForm.opacity" type="number" min="0" max="1" step="0.05" @change="emitBuildingEnvelopeOpacity" /></label>
              <label class="inspector-field"><span>显示边框</span><input v-model="buildingEnvelopeForm.outlineVisible" type="checkbox" @change="emitBuildingEnvelopeToggle('set-building-envelope-outline-visible', buildingEnvelopeForm.outlineVisible)" /></label>
              <label class="inspector-field"><span>显示底面</span><input v-model="buildingEnvelopeForm.fillVisible" type="checkbox" @change="emitBuildingEnvelopeToggle('set-building-envelope-fill-visible', buildingEnvelopeForm.fillVisible)" /></label>
            </div>

          </InspectorSection>

          <InspectorSection v-if="isRobotDog" title="巡航路线" :default-open="true">
            <div class="inspector-meta-grid">
              <div class="inspector-meta"><span>路线状态</span><ObjectStatusChip :value="robotDogPatrol.state ?? 'idle'" /></div>
              <div class="inspector-meta"><span>路线点数</span><strong>{{ patrolPointCount }}</strong></div>
              <div class="inspector-meta"><span>编辑中</span><strong>{{ robotDogPatrol.routeEditing ? '是' : '否' }}</strong></div>
            </div>

            <div class="inspector-grid">
              <label class="inspector-field"><span>速度</span><input v-model.number="patrolForm.speed" type="number" min="0.1" step="0.1" @change="emitRobotDogSpeed" /></label>
              <label class="inspector-field"><span>循环巡航</span><input v-model="patrolForm.loop" type="checkbox" @change="emitRobotDogLoop" /></label>
            </div>

            <div class="inspector-actions">
              <button class="button-secondary" type="button" :disabled="robotDogPatrol.routeEditing" @click="emit('action', 'robot-dog-start-edit', { robotDogId: activeSelection.id })">开始编辑路线</button>
              <button class="button-secondary" type="button" :disabled="!robotDogPatrol.routeEditing" @click="emit('action', 'robot-dog-stop-edit', { robotDogId: activeSelection.id })">停止编辑路线</button>
              <button class="button-secondary" type="button" @click="emit('action', 'robot-dog-clear-route', { robotDogId: activeSelection.id })">清空路线</button>
              <button class="button-primary" type="button" :disabled="!patrolCanStart" @click="emit('action', 'robot-dog-start-patrol', { robotDogId: activeSelection.id })">开始巡航</button>
            </div>
          </InspectorSection>

          <InspectorSection v-if="isRobotDog" title="实时路况" :default-open="true">
            <div class="inspector-grid">
              <div class="inspector-field">
                <span>视频预览</span>
                <video
                  class="inspector-video-preview"
                  :src="robotDogTestVideoUrl"
                  controls
                  muted
                  loop
                  preload="metadata"
                  playsinline
                ></video>
              </div>
            </div>
          </InspectorSection>

          <InspectorSection v-if="isMarker" title="Pick Marker" :default-open="true">
            <div class="inspector-meta-grid">
              <div class="inspector-meta"><span>位置</span><strong>{{ activeSelection.metadata?.position ?? '-' }}</strong></div>
            </div>
            <div class="inspector-actions">
              <button class="button-secondary" type="button" @click="emit('action', 'clear-marker')">清除 Marker</button>
              <button class="button-secondary" type="button" @click="emit('action', 'focus-marker')">聚焦 Marker</button>
            </div>
          </InspectorSection>

          <InspectorSection title="操作" :default-open="true">
            <div class="inspector-actions">
              <button
                v-if="isTransformEditable && !isTransformEditingSelection"
                class="button-primary"
                type="button"
                @click="handleEnterTransformEdit"
              >
                编辑位置
              </button>
              <button
                v-if="isTransformEditingSelection"
                class="button-primary"
                type="button"
                @click="emit('action', 'commit-transform-edit')"
              >
                完成编辑
              </button>
              <button
                v-if="isTransformEditingSelection"
                class="button-secondary"
                type="button"
                @click="emit('action', 'cancel-transform-edit')"
              >
                取消编辑
              </button>
              <button class="button-secondary" type="button" @click="emit('action', 'focus-selected')">Focus</button>
              <button v-if="isBimProxy" class="button-secondary" type="button" @click="emit('action', 'reset-alignment')">重置对齐</button>
              <button v-if="isBimProxy" class="button-secondary" type="button" @click="emit('action', 'save-alignment')">保存对齐</button>
              <button v-if="isBimProxy" class="button-secondary" type="button" @click="emit('action', 'load-alignment')">加载对齐</button>
              <button v-if="isBimProxy" class="button-secondary" type="button" @click="emit('action', 'copy-alignment-json')">复制 JSON</button>
              <button v-if="isBuildingEnvelope" class="button-danger" type="button" @click="emit('action', 'delete-building-envelope', { objectId: activeSelection.id })">删除</button>
              <button v-else-if="!activeSelection.protected" class="button-danger" type="button" @click="emit('action', 'delete-selected')">删除</button>
            </div>
          </InspectorSection>

        </div>
      </template>
    </div>
  </aside>
</template>
