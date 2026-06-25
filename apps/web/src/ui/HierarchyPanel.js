function getTypeIcon(type) {
  switch (type) {
    case 'gsplat':
      return '[G]';
    case 'bim-proxy':
      return '[B]';
    case 'marker':
      return '[M]';
    case 'camera':
      return '[C]';
    case 'debug':
      return '[D]';
    default:
      return '[ ]';
  }
}

function renderObjectRow(object, selectedId) {
  const selectedClass = object.id === selectedId ? ' is-selected' : '';
  const eyeLabel = object.visible ? 'ON' : 'OFF';
  const eyeDisabled = object.canHide && object.entity ? '' : ' disabled';
  const displayName = object.displayName ?? object.name;

  return `
    <div class="tree-item${selectedClass}" data-object-id="${object.id}" role="button" tabindex="0" title="${object.typeLabel ?? object.type}">
      <span class="tree-main">
        <span class="tree-icon">${getTypeIcon(object.type)}</span>
        <span class="tree-label">${displayName}</span>
      </span>
      <span class="tree-side">
        <span class="tree-status">${object.status}</span>
        <button class="tree-eye" type="button" data-eye-id="${object.id}"${eyeDisabled}>${eyeLabel}</button>
      </span>
    </div>
  `;
}

export function renderHierarchy(container, config) {
  const { objects, selectedId } = config;
  const rows = objects.map((object) => renderObjectRow(object, selectedId)).join('');

  container.innerHTML = `
    <div class="tree-root">ROOT</div>
    <div class="tree-group">
      ${rows}
    </div>
  `;
}
