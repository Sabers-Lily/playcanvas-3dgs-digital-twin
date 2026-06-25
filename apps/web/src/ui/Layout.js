export function createEditorLayout(root) {
  root.innerHTML = `
    <div class="app-shell">
      <header class="toolbar">
        <div class="toolbar-group toolbar-group-main">
          <button id="toolbar-add" class="toolbar-icon-button" type="button">+</button>
          <div id="toolbar-add-menu" class="toolbar-menu" hidden>
            <button id="load-public" type="button">Load Base SOG</button>
            <label class="toolbar-menu-item file-button" for="file-input">Choose Local SOG</label>
            <button id="load-converted" type="button">Load Converted SOG</button>
            <button id="load-bim" type="button">Load BIM Proxy</button>
            <button id="add-marker-placeholder" type="button">Add Marker Placeholder</button>
            <button id="add-model-placeholder" type="button">Add Model Placeholder</button>
          </div>
          <input id="file-input" type="file" accept=".sog" />
          <button id="reset-camera" type="button">Reset Camera</button>
          <button id="toggle-bim" type="button">Show/Hide BIM</button>
          <button id="debug-bim" type="button">Debug BIM</button>
          <button id="clear-marker" type="button">Clear Marker</button>
        </div>
        <div class="toolbar-summary">
          <div id="status" class="status-summary">Ready</div>
          <div class="controls-hint">LMB: Orbit | Shift+LMB/MMB/RMB: Pan | Wheel: Zoom | WASD: Move | Q/E: Up/Down | Shift: Faster</div>
        </div>
      </header>
      <main class="workspace">
        <aside class="panel left-panel">
          <div class="panel-header panel-header-tools">
            <span>层级</span>
            <div class="panel-tools">
              <button id="hierarchy-add" class="toolbar-icon-button" type="button" title="Add or load">+</button>
              <button id="hierarchy-duplicate" class="toolbar-icon-button" type="button" title="Duplicate">D</button>
              <button id="hierarchy-delete" class="toolbar-icon-button" type="button" title="Delete">X</button>
              <button id="hierarchy-more" class="toolbar-icon-button" type="button" title="More">...</button>
            </div>
          </div>
          <div id="hierarchy-panel" class="panel-body"></div>
        </aside>
        <section class="panel viewport-panel">
          <div class="panel-header">视口</div>
          <div class="viewport-body" id="viewport-body">
            <canvas id="app-canvas"></canvas>
          </div>
        </section>
        <aside class="panel right-panel">
          <div class="panel-header">属性</div>
          <div id="inspector-panel" class="panel-body"></div>
        </aside>
      </main>
      <section class="panel bottom-panel">
        <div class="panel-header">资源 / 日志</div>
        <div class="bottom-grid">
          <div class="bottom-section">
            <div class="section-title">资源</div>
            <div id="assets-panel" class="section-body"></div>
          </div>
          <div class="bottom-section">
            <div class="section-title">日志 / 状态</div>
            <div id="logs-panel" class="section-body"></div>
          </div>
        </div>
      </section>
    </div>
  `;

  return {
    canvas: root.querySelector('#app-canvas'),
    fileInput: root.querySelector('#file-input'),
    toolbarAddButton: root.querySelector('#toolbar-add'),
    toolbarAddMenu: root.querySelector('#toolbar-add-menu'),
    loadPublicButton: root.querySelector('#load-public'),
    loadConvertedButton: root.querySelector('#load-converted'),
    loadBimButton: root.querySelector('#load-bim'),
    addMarkerPlaceholderButton: root.querySelector('#add-marker-placeholder'),
    addModelPlaceholderButton: root.querySelector('#add-model-placeholder'),
    toggleBimButton: root.querySelector('#toggle-bim'),
    debugBimButton: root.querySelector('#debug-bim'),
    clearMarkerButton: root.querySelector('#clear-marker'),
    resetCameraButton: root.querySelector('#reset-camera'),
    hierarchyAddButton: root.querySelector('#hierarchy-add'),
    hierarchyDuplicateButton: root.querySelector('#hierarchy-duplicate'),
    hierarchyDeleteButton: root.querySelector('#hierarchy-delete'),
    hierarchyMoreButton: root.querySelector('#hierarchy-more'),
    statusEl: root.querySelector('#status'),
    viewportBody: root.querySelector('#viewport-body'),
    hierarchyPanel: root.querySelector('#hierarchy-panel'),
    inspectorPanel: root.querySelector('#inspector-panel'),
    assetsPanel: root.querySelector('#assets-panel'),
    logsPanel: root.querySelector('#logs-panel')
  };
}
