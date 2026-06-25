<script setup>
defineProps({
  open: {
    type: Boolean,
    default: false
  },
  x: {
    type: Number,
    default: 0
  },
  y: {
    type: Number,
    default: 0
  },
  object: {
    type: Object,
    default: null
  },
  mode: {
    type: String,
    default: 'scene-object'
  }
});

defineEmits(['action', 'close']);

function toggleLabel(object) {
  return object?.visible ? 'Hide' : 'Show';
}

function canAddAssetToScene(object) {
  const type = String(object?.type || '').toLowerCase();

  if (['sog', 'gsplat', 'glb', 'gltf'].includes(type)) {
    return Number(object?.size ?? 0) > 0;
  }

  if (type === 'ply') {
    return Boolean(object?.derivedAssets?.some((asset) => (
      asset.type === 'sog' &&
      asset.status === 'ready' &&
      Number(asset.size ?? 0) > 0
    )));
  }

  if (type === 'obj') {
    return Boolean(object?.derivedAssets?.some((asset) => (
      asset.type === 'glb' &&
      asset.status === 'ready' &&
      Number(asset.size ?? 0) > 0
    )));
  }

  return false;
}

function isFailedAsset(object) {
  const type = String(object?.type || '').toLowerCase();

  if (['sog', 'gsplat', 'glb', 'gltf'].includes(type)) {
    return object?.status === 'failed' || Number(object?.size ?? 0) <= 0;
  }

  if (type === 'ply' || type === 'obj') {
    return object?.latestDerivedAsset?.status === 'failed' || (
      object?.latestDerivedAsset?.status === 'ready' &&
      Number(object?.latestDerivedAsset?.size ?? 0) <= 0
    );
  }

  return false;
}

function addToSceneLabel(object) {
  if (isFailedAsset(object)) {
    return 'Add to Scene Unavailable';
  }

  if (
    ['ply', 'obj'].includes(String(object?.type || '').toLowerCase()) &&
    object?.latestDerivedAsset?.status === 'processing'
  ) {
    return 'Processing';
  }

  return 'Add to Scene';
}

function processLabel(object) {
  if (object?.latestDerivedAsset?.status === 'failed') {
    return 'Retry Process';
  }

  return 'Process Asset';
}
</script>

<template>
  <div
    v-if="open"
    class="context-menu"
    :style="{ left: `${x}px`, top: `${y}px` }"
    @contextmenu.prevent
  >
    <template v-if="mode === 'asset'">
      <button
        v-if="['ply', 'obj'].includes(String(object?.type || '').toLowerCase())"
        class="context-menu-item"
        type="button"
        @click="$emit('action', 'process-asset')"
      >
        {{ processLabel(object) }}
      </button>
      <button
        class="context-menu-item"
        type="button"
        :disabled="!canAddAssetToScene(object)"
        @click="$emit('action', 'add-asset-to-scene')"
      >
        {{ addToSceneLabel(object) }}
      </button>
      <button class="context-menu-item" type="button" @click="$emit('action', 'copy-asset-url')">Copy URL</button>
      <div class="context-menu-separator"></div>
      <button class="context-menu-item danger" type="button" @click="$emit('action', 'delete-asset')">Delete Asset</button>
    </template>

    <template v-else>
      <button class="context-menu-item" type="button" disabled>New Entity</button>
      <button class="context-menu-item" type="button" disabled>Add Component</button>
      <button class="context-menu-item" type="button" disabled>Template</button>
      <div class="context-menu-separator"></div>
      <button class="context-menu-item" type="button" disabled>Enable / Disable</button>
      <button class="context-menu-item" type="button" :disabled="!object?.canHide" @click="$emit('action', 'toggle-visible')">
        {{ toggleLabel(object) }}
      </button>
      <div class="context-menu-separator"></div>
      <button class="context-menu-item" type="button" disabled>Copy</button>
      <button class="context-menu-item" type="button" disabled>Paste</button>
      <button class="context-menu-item" type="button" disabled>Duplicate</button>
      <div class="context-menu-separator"></div>
      <button class="context-menu-item danger" type="button" :disabled="object?.protected" @click="$emit('action', 'delete-object')">Delete</button>
    </template>
  </div>
</template>
