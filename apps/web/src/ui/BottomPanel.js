const KIND_LABELS = {
  gsplat: '高斯地图',
  bim: 'BIM模型'
};

function renderAssetRow(asset) {
  return `
    <button class="asset-row" type="button" data-asset-id="${asset.id}">
      <span class="asset-main">
        <span class="asset-kind">[${KIND_LABELS[asset.kind] ?? asset.kind}]</span>
        <span>${asset.label}</span>
      </span>
      <span class="tree-status">${asset.status}</span>
    </button>
  `;
}

function renderLogRow(message) {
  return `
    <div class="log-row">
      <span>${message}</span>
    </div>
  `;
}

export function renderAssetsPanel(container, assets) {
  container.innerHTML = assets.map(renderAssetRow).join('');
}

export function renderLogsPanel(container, logs) {
  container.innerHTML = logs.map(renderLogRow).join('');
}
