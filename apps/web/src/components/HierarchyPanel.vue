<script setup>
defineProps({
  objects: {
    type: Array,
    default: () => []
  },
  selectedId: {
    type: String,
    default: null
  },
  addMenuOpen: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits([
  'select',
  'toggle-visible',
  'open-context-menu',
  'toggle-add-menu',
  'create-object',
  'duplicate',
  'delete-selected',
  'more'
]);

const ADD_OBJECT_ITEMS = [
  { type: 'empty', label: '空对象' },
  { type: 'robotDog', label: '机器狗' },
  { type: 'cameraDevice', label: '摄像头' },
  { type: 'device', label: '设备' },
  { type: 'hotspot', label: '热点' },
  { type: 'annotation', label: '标注' },
  { type: 'routePoint', label: '路线点' }
];

function typeIcon(type) {
  switch (type) {
    case 'gsplat':
      return '[G]';
    case 'bim-proxy':
      return '[B]';
    case 'marker':
      return '[M]';
    case 'camera':
      return '[C]';
    case 'robot':
    case 'robotDog':
      return '[R]';
    case 'cameraDevice':
      return '[V]';
    case 'device':
      return '[D]';
    case 'hotspot':
      return '[H]';
    case 'annotation':
      return '[A]';
    case 'routePoint':
      return '[P]';
    case 'empty':
      return '[ ]';
    case 'debug':
      return '[D]';
    default:
      return '[ ]';
  }
}

function onContextMenu(event, objectId) {
  event.preventDefault();
  event.stopPropagation();
  emit('open-context-menu', {
    objectId,
    x: event.clientX,
    y: event.clientY
  });
}

function createObject(type) {
  emit('create-object', type);
}
</script>

<template>
  <aside class="panel left-panel">
    <div class="panel-header panel-header-tools">
      <span>层级</span>
      <div class="panel-tools hierarchy-panel-tools">
        <div class="hierarchy-add-menu-wrap">
          <button class="toolbar-icon-button" type="button" title="添加场景对象" @click="$emit('toggle-add-menu')">+</button>
          <div class="toolbar-menu hierarchy-add-menu" :hidden="!addMenuOpen">
            <div class="hierarchy-add-title">添加对象</div>
            <button
              v-for="item in ADD_OBJECT_ITEMS"
              :key="item.type"
              type="button"
              @click="createObject(item.type)"
            >
              {{ item.label }}
            </button>
          </div>
        </div>
        <button class="toolbar-icon-button" type="button" title="Duplicate" @click="$emit('duplicate')">D</button>
        <button class="toolbar-icon-button" type="button" title="Delete" @click="$emit('delete-selected')">X</button>
        <button class="toolbar-icon-button" type="button" title="More" @click="$emit('more')">...</button>
      </div>
    </div>
    <div class="panel-body hierarchy-body">
      <div class="tree-root">ROOT</div>
      <div class="tree-group">
        <div
          v-for="object in objects"
          :key="object.id"
          class="tree-item"
          :class="{ 'is-selected': object.id === selectedId }"
          :data-object-id="object.id"
          role="button"
          tabindex="0"
          :title="object.typeLabel ?? object.type"
          @click="$emit('select', object.id)"
          @keydown.enter.prevent="$emit('select', object.id)"
          @keydown.space.prevent="$emit('select', object.id)"
          @contextmenu="onContextMenu($event, object.id)"
        >
          <span class="tree-main">
            <span class="tree-icon">{{ typeIcon(object.type) }}</span>
            <span class="tree-label">{{ object.displayName ?? object.name }}</span>
          </span>
          <span class="tree-side">
            <span class="tree-status">{{ object.status }}</span>
            <button
              class="tree-eye"
              type="button"
              :disabled="!object.canHide"
              @click.stop.prevent="$emit('toggle-visible', object.id)"
            >
              {{ object.visible ? 'ON' : 'OFF' }}
            </button>
          </span>
        </div>
      </div>
    </div>
  </aside>
</template>
