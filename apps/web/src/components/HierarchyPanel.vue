<script setup>
import { computed } from 'vue';
import { UI_FLAGS } from '../config/uiFlags.js';
import ObjectStatusChip from './editor/ObjectStatusChip.vue';

const props = defineProps({
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
  { type: 'buildingEnvelope', label: '建筑多边体' },
  { type: 'cameraDevice', label: '摄像头' },
  { type: 'empty', label: '空对象' },
  { type: 'robotDog', label: '机器狗' },
  { type: 'device', label: '设备' },
  { type: 'hotspot', label: '热点' },
  { type: 'annotation', label: '标注' },
  { type: 'routePoint', label: '路线点' }
];

const GROUP_DEFINITIONS = [
  { key: 'maps', label: '地图' },
  { key: 'buildings', label: '建筑' },
  { key: 'cameras', label: '摄像头' },
  { key: 'robots', label: '机器狗' },
  { key: 'helpers', label: '辅助对象' },
  { key: 'others', label: '其他' }
];

function typeIcon(type) {
  switch (type) {
    case 'gsplat':
      return '图';
    case 'buildingEnvelope':
      return '建';
    case 'cameraDevice':
    case 'camera':
      return '视';
    case 'robotDog':
    case 'robot':
      return '机';
    case 'marker':
    case 'debug':
      return '辅';
    case 'empty':
      return '空';
    default:
      return '物';
  }
}

function groupKeyForObject(object) {
  switch (object.type) {
    case 'gsplat':
      return 'maps';
    case 'buildingEnvelope':
      return 'buildings';
    case 'camera':
    case 'cameraDevice':
      return 'cameras';
    case 'robot':
    case 'robotDog':
      return 'robots';
    case 'debug':
    case 'marker':
      return 'helpers';
    default:
      return 'others';
  }
}

const groupedObjects = computed(() => {
  const groups = new Map(GROUP_DEFINITIONS.map((group) => [group.key, []]));

  (props.objects || []).forEach((object) => {
    const key = groupKeyForObject(object);
    if (key === 'helpers' && !UI_FLAGS.showDebugHelpersInHierarchy) {
      return;
    }
    groups.get(key)?.push(object);
  });

  return GROUP_DEFINITIONS
    .map((group) => ({
      ...group,
      objects: groups.get(group.key) ?? []
    }))
    .filter((group) => group.objects.length > 0);
});

function onContextMenu(event, objectId) {
  event.preventDefault();
  event.stopPropagation();
  emit('open-context-menu', {
    objectId,
    x: event.clientX,
    y: event.clientY
  });
}
</script>

<template>
  <aside class="panel left-panel">
    <div class="panel-header">
      <span>层级</span>
      <div class="panel-tools">
        <div class="toolbar-menu-group">
          <button class="toolbar-icon-button" type="button" title="添加对象" @click="$emit('toggle-add-menu')">+</button>
          <div class="toolbar-menu" :hidden="!addMenuOpen">
            <div class="toolbar-menu-title">添加对象</div>
            <button
              v-for="item in ADD_OBJECT_ITEMS"
              :key="item.type"
              type="button"
              @click="$emit('create-object', item.type)"
            >
              {{ item.label }}
            </button>
          </div>
        </div>
        <button class="toolbar-icon-button" type="button" title="删除选中" @click="$emit('delete-selected')">删</button>
      </div>
    </div>

    <div class="panel-body hierarchy-body">
      <div class="tree-root">场景对象</div>

      <section v-for="group in groupedObjects" :key="group.key" class="tree-group-card">
        <div class="tree-group-header">
          <span>{{ group.label }}</span>
          <span>{{ group.objects.length }}</span>
        </div>

        <div class="tree-group-list">
          <div
            v-for="object in group.objects"
            :key="object.id"
            class="tree-item"
            :class="{ 'is-selected': object.id === selectedId }"
            :title="object.typeLabel ?? object.type"
            @click="$emit('select', object.id)"
            @contextmenu="onContextMenu($event, object.id)"
          >
            <span class="tree-main">
              <span class="tree-icon">{{ typeIcon(object.type) }}</span>
              <span class="tree-label hierarchy-name">{{ object.displayName ?? object.name }}</span>
            </span>

            <span class="tree-side">
              <ObjectStatusChip :value="object.status" />
              <button
                class="tree-eye"
                type="button"
                :disabled="!object.canHide"
                @click.stop.prevent="$emit('toggle-visible', object.id)"
              >
                {{ object.visible ? '显' : '隐' }}
              </button>
            </span>
          </div>
        </div>
      </section>
    </div>
  </aside>
</template>
