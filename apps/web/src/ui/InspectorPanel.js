function renderInputRow(label, id, value, step) {
  return `
    <label class="inspector-field">
      <span>${label}</span>
      <input id="${id}" type="number" step="${step}" value="${value}" />
    </label>
  `;
}

function renderNudgeRow(label, minusId, plusId) {
  return `
    <div class="nudge-row">
      <span class="nudge-label">${label}</span>
      <div class="nudge-actions">
        <button id="${minusId}" type="button">${label} -</button>
        <button id="${plusId}" type="button">${label} +</button>
      </div>
    </div>
  `;
}

function renderMetaRow(label, value) {
  return `<div class="inspector-meta"><span>${label}</span><strong>${value}</strong></div>`;
}

function renderRenameRow(selection) {
  const displayName = selection.displayName ?? selection.name;
  return `
    <div class="inspector-rename">
      <label class="inspector-field">
        <span>名称</span>
        <input id="rename-display-name" type="text" value="${displayName}" />
      </label>
      <button id="apply-rename" type="button">重命名</button>
    </div>
  `;
}

function renderBimInspector(selection, alignment, steps) {
  return `
    <div class="inspector-block">
      <div class="section-title">选择</div>
      ${renderRenameRow(selection)}
      ${renderMetaRow('类型', selection.typeLabel ?? selection.type)}
      ${renderMetaRow('状态', selection.status)}
      ${renderMetaRow('资源路径', selection.metadata?.url ?? '-')}
      ${renderMetaRow('可见', String(selection.visible))}
    </div>
    <div class="inspector-block">
      <div class="section-title">BIM 对齐</div>
      <div class="inspector-subsection">
        <div class="section-subtitle">变换</div>
        <div class="inspector-grid">
          ${renderInputRow('X', 'align-pos-x', alignment.position[0], '0.1')}
          ${renderInputRow('Y', 'align-pos-y', alignment.position[1], '0.1')}
          ${renderInputRow('Z', 'align-pos-z', alignment.position[2], '0.1')}
          ${renderInputRow('Rot X', 'align-rot-x', alignment.rotation[0], '1')}
          ${renderInputRow('Rot Y', 'align-rot-y', alignment.rotation[1], '1')}
          ${renderInputRow('Rot Z', 'align-rot-z', alignment.rotation[2], '1')}
          ${renderInputRow('Scale', 'align-scale', alignment.scale[0], '0.01')}
        </div>
      </div>
      <div class="inspector-subsection">
        <div class="section-subtitle">步长</div>
        <div class="inspector-grid">
          ${renderInputRow('移动步长', 'move-step', steps.move, '0.1')}
          ${renderInputRow('旋转步长', 'rotate-step', steps.rotate, '0.1')}
          ${renderInputRow('缩放步长', 'scale-step', steps.scale, '0.01')}
        </div>
      </div>
      <div class="inspector-subsection">
        <div class="section-subtitle">微调</div>
        <div class="nudge-grid">
          ${renderNudgeRow('X', 'nudge-pos-x-minus', 'nudge-pos-x-plus')}
          ${renderNudgeRow('Y', 'nudge-pos-y-minus', 'nudge-pos-y-plus')}
          ${renderNudgeRow('Z', 'nudge-pos-z-minus', 'nudge-pos-z-plus')}
          ${renderNudgeRow('RotX', 'nudge-rot-x-minus', 'nudge-rot-x-plus')}
          ${renderNudgeRow('RotY', 'nudge-rot-y-minus', 'nudge-rot-y-plus')}
          ${renderNudgeRow('RotZ', 'nudge-rot-z-minus', 'nudge-rot-z-plus')}
          ${renderNudgeRow('Scale', 'nudge-scale-minus', 'nudge-scale-plus')}
        </div>
      </div>
      <div class="inspector-subsection">
        <div class="section-subtitle">操作</div>
        <div class="inspector-actions">
          <button id="apply-alignment" type="button">Apply</button>
          <button id="reset-alignment" type="button">Reset Alignment</button>
          <button id="save-alignment" type="button">Save Alignment</button>
          <button id="load-alignment" type="button">Load Alignment</button>
          <button id="focus-bim" type="button">Focus BIM</button>
          <button id="copy-alignment-json" type="button">Copy Alignment JSON</button>
        </div>
      </div>
    </div>
  `;
}

function renderGsplatInspector(selection) {
  return `
    <div class="inspector-block">
      <div class="section-title">选择</div>
      ${renderRenameRow(selection)}
      ${renderMetaRow('类型', selection.typeLabel ?? selection.type)}
      ${renderMetaRow('状态', selection.status)}
      ${renderMetaRow('资源路径', selection.metadata?.url ?? '-')}
      ${renderMetaRow('资源名', selection.metadata?.sourceName ?? selection.asset?.name ?? selection.name)}
      ${renderMetaRow('可见', String(selection.visible))}
      <div class="inspector-actions">
        <button id="focus-map" type="button">Focus Map</button>
        <button id="reload-base" type="button">Reload Base SOG</button>
      </div>
    </div>
  `;
}

function renderMarkerInspector(selection) {
  return `
    <div class="inspector-block">
      <div class="section-title">选择</div>
      ${renderRenameRow(selection)}
      ${renderMetaRow('类型', selection.typeLabel ?? selection.type)}
      ${renderMetaRow('状态', selection.status)}
      ${renderMetaRow('可见', String(selection.visible))}
      ${renderMetaRow('位置', selection.metadata?.position ?? '-')}
      <div class="inspector-actions">
        <button id="clear-marker-inspector" type="button">Clear Marker</button>
        <button id="focus-marker" type="button">Focus Marker</button>
      </div>
    </div>
  `;
}

function renderCameraInspector(selection, cameraState) {
  return `
    <div class="inspector-block">
      <div class="section-title">选择</div>
      ${renderRenameRow(selection)}
      ${renderMetaRow('类型', selection.typeLabel ?? selection.type)}
      ${renderMetaRow('状态', selection.status)}
      ${renderMetaRow('目标点', cameraState.target)}
      ${renderMetaRow('距离', cameraState.distance)}
      ${renderMetaRow('偏航', cameraState.yaw)}
      ${renderMetaRow('俯仰', cameraState.pitch)}
      <div class="inspector-actions">
        <button id="reset-camera-inspector" type="button">Reset Camera</button>
      </div>
    </div>
  `;
}

function renderDebugInspector(selection) {
  return `
    <div class="inspector-block">
      <div class="section-title">选择</div>
      ${renderRenameRow(selection)}
      ${renderMetaRow('类型', selection.typeLabel ?? selection.type)}
      ${renderMetaRow('状态', selection.status)}
      ${renderMetaRow('可见', String(selection.visible))}
      <div class="inspector-actions">
        <button id="toggle-debug-inspector" type="button">Show/Hide Debug</button>
      </div>
    </div>
  `;
}

function renderDefaultInspector(selection) {
  return `
    <div class="inspector-block">
      <div class="section-title">选择</div>
      ${renderRenameRow(selection)}
      ${renderMetaRow('类型', selection.typeLabel ?? selection.type)}
      ${renderMetaRow('状态', selection.status)}
      ${renderMetaRow('可见', String(selection.visible))}
    </div>
  `;
}

export function renderInspector(container, config) {
  const {
    selection,
    alignment,
    steps,
    cameraState
  } = config;

  if (!selection) {
    container.innerHTML = `
      <div class="inspector-block">
        <div class="section-title">属性</div>
        <div class="inspector-empty">未选择对象</div>
      </div>
    `;
    return;
  }

  switch (selection.type) {
    case 'gsplat':
      container.innerHTML = renderGsplatInspector(selection);
      return;
    case 'bim-proxy':
      container.innerHTML = renderBimInspector(selection, alignment, steps);
      return;
    case 'marker':
      container.innerHTML = renderMarkerInspector(selection);
      return;
    case 'camera':
      container.innerHTML = renderCameraInspector(selection, cameraState);
      return;
    case 'debug':
      container.innerHTML = renderDebugInspector(selection);
      return;
    default:
      container.innerHTML = renderDefaultInspector(selection);
  }
}
