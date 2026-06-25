<script setup>
defineProps({
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

function kindLabel(kind) {
  if (kind === 'gsplat') {
    return 'gsplat';
  }

  if (kind === 'bim') {
    return 'bim';
  }

  return kind;
}

function formatSize(size) {
  if (typeof size !== 'number' || Number.isNaN(size)) {
    return '-';
  }

  return `${size} bytes`;
}

function assetBadge(type, kind) {
  const normalized = String(type || kind || 'FILE').toUpperCase();
  if (normalized === 'GSPLAT') {
    return 'SOG';
  }

  if (normalized === 'BIM') {
    return 'GLB';
  }

  return normalized;
}

function roleLabel(role) {
  if (role === 'source') {
    return 'source';
  }

  if (role === 'derived') {
    return 'derived';
  }

  return '';
}

function derivedStatus(asset) {
  if (asset?.role === 'derived' && asset?.sourceAsset) {
    return `derived from ${asset.sourceAsset.sourceName}`;
  }

  if (!Array.isArray(asset?.derivedAssets) || asset.derivedAssets.length === 0) {
    return '';
  }

  const latestDerivedAsset = asset.latestDerivedAsset ?? asset.derivedAssets[0];
  if (!latestDerivedAsset) {
    return '';
  }

  return `${String(asset.type || '').toUpperCase()} -> ${String(latestDerivedAsset.type || '').toUpperCase()} ${latestDerivedAsset.status}`;
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
        <div class="asset-list">
          <button
            v-for="asset in assets"
            :key="asset.id"
            class="asset-row"
            :class="{ 'is-selected': asset.id === selectedAssetId }"
            type="button"
            @click="$emit('select-asset', asset.id)"
            @contextmenu.prevent="$emit('open-asset-context-menu', { assetId: asset.id, x: $event.clientX, y: $event.clientY })"
          >
            <span class="asset-main">
              <span class="asset-mainline">
                <span class="asset-badge">{{ assetBadge(asset.type, asset.kind) }}</span>
                <span class="asset-label" :title="asset.sourceName || asset.label">{{ asset.sourceName || asset.label }}</span>
              </span>
              <span class="asset-meta-inline">
                <span class="asset-kind">{{ kindLabel(asset.kind) }}</span>
                <span v-if="roleLabel(asset.role)" class="asset-role">{{ roleLabel(asset.role) }}</span>
                <span class="asset-size">{{ formatSize(asset.size) }}</span>
              </span>
              <span v-if="derivedStatus(asset)" class="asset-derived">{{ derivedStatus(asset) }}</span>
            </span>
            <span class="tree-status">{{ asset.status }}</span>
          </button>
        </div>
      </div>

      <div class="dock-pane logs-dock-pane">
        <div class="dock-pane-header">
          <div class="dock-pane-title">日志 / 状态</div>
        </div>
        <div class="status-block">
          <div class="log-row">
            <span>API: {{ apiStatus }}</span>
          </div>
          <div class="log-row">
            <span>Scenes API: {{ sceneApiStatus }}</span>
          </div>
        </div>
        <div class="compact-actions">
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
