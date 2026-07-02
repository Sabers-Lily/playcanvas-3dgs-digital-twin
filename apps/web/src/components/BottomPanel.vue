<script setup>
import { computed } from 'vue';
import { UI_FLAGS } from '../config/uiFlags.js';

const props = defineProps({
  assets: {
    type: Array,
    default: () => []
  },
  selectedAssetId: {
    type: String,
    default: null
  },
  logs: {
    type: Array,
    default: () => []
  },
  apiStatus: {
    type: String,
    default: 'checking'
  },
  sceneApiStatus: {
    type: String,
    default: 'idle'
  }
});

defineEmits([
  'select-asset',
  'open-asset-context-menu',
  'refresh-assets',
  'test-scene-api',
  'sync-current-scene',
  'restore-scene',
  'upload-asset'
]);

const visibleAssets = computed(() => (
  Array.isArray(props.assets)
    ? props.assets.filter((asset) => UI_FLAGS.showDebugAssets || asset.id === 'base-map' || asset.role)
    : []
));

function assetBadge(type) {
  const normalized = String(type || 'FILE').toUpperCase();
  if (normalized === 'GSPLAT') {
    return 'SOG';
  }

  return normalized;
}
</script>

<template>
  <section class="panel bottom-dock">
    <div class="bottom-dock-grid">
      <div class="dock-pane assets-dock-pane">
        <div class="dock-pane-header">
          <div class="dock-pane-title">资源</div>
          <div class="dock-pane-actions">
            <button
              class="editor-button"
              type="button"
              title="刷新资源"
              @click="$emit('refresh-assets')"
            >
              刷新
            </button>
            <button
              class="icon-button"
              type="button"
              title="上传资源"
              aria-label="上传资源"
              @click="$emit('upload-asset')"
            >
              +
            </button>
          </div>
        </div>
        <div v-if="visibleAssets.length" class="asset-list">
          <button
            v-for="asset in visibleAssets"
            :key="asset.id"
            class="asset-row"
            :class="{ 'is-selected': asset.id === selectedAssetId }"
            type="button"
            @click="$emit('select-asset', asset.id)"
            @contextmenu.prevent="$emit('open-asset-context-menu', { assetId: asset.id, x: $event.clientX, y: $event.clientY })"
          >
            <span class="asset-main">
              <span class="asset-mainline">
                <span class="asset-badge">{{ assetBadge(asset.type) }}</span>
                <span class="asset-label" :title="asset.sourceName || asset.label">{{ asset.sourceName || asset.label }}</span>
              </span>
              <span v-if="UI_FLAGS.showAssetInternalStatus" class="asset-meta-inline">
                <span class="asset-kind">{{ asset.kind }}</span>
                <span class="asset-size">{{ typeof asset.size === 'number' ? `${asset.size} bytes` : '-' }}</span>
              </span>
            </span>
            <span v-if="UI_FLAGS.showAssetInternalStatus" class="tree-status">{{ asset.status }}</span>
          </button>
        </div>
        <div v-else class="inspector-empty">暂无资源</div>
      </div>

      <div class="dock-pane logs-dock-pane">
        <div class="dock-pane-header">
          <div class="dock-pane-title">日志 / 状态</div>
        </div>
        <div v-if="UI_FLAGS.showApiDebugStatus" class="status-block">
          <div class="log-row">
            <span>API: {{ apiStatus }}</span>
          </div>
          <div class="log-row">
            <span>Scenes API: {{ sceneApiStatus }}</span>
          </div>
        </div>
        <div v-if="UI_FLAGS.showLogDebugButtons" class="compact-actions">
          <button class="editor-button" type="button" @click="$emit('sync-current-scene')">
            Sync
          </button>
          <button class="editor-button" type="button" @click="$emit('restore-scene')">
            Restore
          </button>
          <button class="editor-button" type="button" @click="$emit('test-scene-api')">
            Test API
          </button>
        </div>
        <div class="log-list">
          <div v-for="(log, index) in logs" :key="`${index}-${log}`" class="log-row">
            <span>{{ log }}</span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
