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
  },
  drawerMode: {
    type: String,
    default: null
  },
  statusMessage: {
    type: String,
    default: 'Ready'
  },
  statusSummary: {
    type: Object,
    default: () => ({
      sog: 'SOG idle',
      bim: 'BIM idle',
      pick: 'Ready'
    })
  },
  objectCount: {
    type: Number,
    default: 0
  }
});

defineEmits([
  'select-asset',
  'open-asset-context-menu',
  'refresh-assets',
  'test-scene-api',
  'sync-current-scene',
  'restore-scene',
  'upload-asset',
  'toggle-drawer'
]);

const visibleAssets = computed(() => (
  Array.isArray(props.assets)
    ? props.assets.filter((asset) => UI_FLAGS.showDebugAssets || asset.role)
    : []
));

function assetBadge(type) {
  const normalized = String(type || 'FILE').toUpperCase();
  return normalized === 'GSPLAT' ? 'SOG' : normalized;
}
</script>

<template>
  <section class="drawer-shell" :class="{ 'is-open': Boolean(drawerMode) }">
    <div class="statusbar">
      <div class="statusbar-left">
        <span class="statusbar-item">{{ statusMessage }}</span>
        <span class="statusbar-item">SOG: {{ statusSummary.sog }}</span>
        <span class="statusbar-item">BIM: {{ statusSummary.bim }}</span>
        <span class="statusbar-item">Pick: {{ statusSummary.pick }}</span>
        <span class="statusbar-item">Objects: {{ objectCount }}</span>
      </div>

      <div class="statusbar-right">
        <button
          class="statusbar-toggle"
          :class="{ 'is-active': drawerMode === 'assets' }"
          type="button"
          @click="$emit('toggle-drawer', 'assets')"
        >
          资源
        </button>
        <button
          class="statusbar-toggle"
          :class="{ 'is-active': drawerMode === 'logs' }"
          type="button"
          @click="$emit('toggle-drawer', 'logs')"
        >
          日志
        </button>
      </div>
    </div>

    <div class="bottom-drawer">
      <div v-if="drawerMode" class="drawer-grid">
        <section v-if="drawerMode === 'assets'" class="drawer-pane">
          <div class="drawer-pane-header">
            <div class="drawer-pane-title">资源</div>
            <div class="drawer-pane-actions">
              <button class="button-secondary" type="button" @click="$emit('refresh-assets')">刷新</button>
              <button class="icon-button" type="button" title="上传资源" @click="$emit('upload-asset')">+</button>
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
                  <span>{{ asset.kind }}</span>
                  <span>{{ typeof asset.size === 'number' ? `${asset.size} bytes` : '-' }}</span>
                </span>
              </span>
            </button>
          </div>

          <div v-else class="asset-list">
            <div class="inspector-empty">暂无资源</div>
          </div>
        </section>

        <section v-else class="drawer-pane">
          <div class="drawer-pane-header">
            <div class="drawer-pane-title">日志 / 状态</div>
            <div v-if="UI_FLAGS.showLogDebugButtons" class="drawer-pane-actions">
              <button class="button-secondary" type="button" @click="$emit('sync-current-scene')">Sync</button>
              <button class="button-secondary" type="button" @click="$emit('restore-scene')">Restore</button>
              <button class="button-secondary" type="button" @click="$emit('test-scene-api')">Test API</button>
            </div>
          </div>

          <div class="log-list">
            <div v-if="UI_FLAGS.showApiDebugStatus" class="log-row">API: {{ apiStatus }}</div>
            <div v-if="UI_FLAGS.showApiDebugStatus" class="log-row">Scenes API: {{ sceneApiStatus }}</div>
            <div v-for="(log, index) in logs" :key="`${index}-${log}`" class="log-row">{{ log }}</div>
          </div>
        </section>
      </div>
    </div>
  </section>
</template>
