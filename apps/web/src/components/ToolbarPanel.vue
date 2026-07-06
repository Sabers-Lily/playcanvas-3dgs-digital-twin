<script setup>
import { ref } from 'vue';

defineProps({
  statusMessage: {
    type: String,
    default: 'Ready'
  },
  projectName: {
    type: String,
    default: '未命名工程'
  }
});

const emit = defineEmits(['command']);
const openMenu = ref(null);

const createItems = [
  { command: 'create-object', payload: 'buildingEnvelope', label: '建筑多边体', description: '绘制 footprint 并生成对象' },
  { command: 'create-object', payload: 'cameraDevice', label: '摄像头', description: '创建视频投影对象' },
  { command: 'toolbar-action', payload: 'create-robot-dog', label: '机器狗', description: '创建巡航机器人' },
  { command: 'create-object', payload: 'hotspot', label: '标记点', description: '创建地图标记' }
];

const projectionItems = [
  { command: 'toolbar-action', payload: 'start-quad-video-projection-editing', label: '开始选四点', description: '按左上、右上、右下、左下顺序选择世界锚点' },
  { command: 'toolbar-action', payload: 'apply-quad-video-projection', label: '应用四点投影', description: '将共享摄像头视频固定到四点世界区域' },
  { command: 'toggle-projection-enabled', payload: null, label: '启用 / 关闭投影', description: '只开关地图投影，不关闭右侧视频预览' }
];

const robotItems = [
  { command: 'toolbar-action', payload: 'create-robot-dog', label: '添加机器狗', description: '创建新的巡航机器人' },
  { command: 'robot-dog-start-edit', payload: null, label: '编辑巡航路线', description: '进入路线点位编辑模式' },
  { command: 'robot-dog-start-patrol', payload: null, label: '开始巡航', description: '按当前路线开始巡航' }
];

const viewItems = [
  { command: 'focus-selected', payload: null, label: '聚焦选中', description: '聚焦当前选中的场景对象' },
  { command: 'toolbar-action', payload: 'reset-camera', label: '重置视角', description: '恢复默认观察相机视角' },
  { command: 'focus-map', payload: null, label: '聚焦地图', description: '快速回到地图中心区域' },
  { command: 'clear-marker', payload: null, label: '清除 Pick Marker', description: '移除当前拾取标记' }
];

function toggleMenu(menu) {
  openMenu.value = openMenu.value === menu ? null : menu;
}

function run(command, payload = null) {
  openMenu.value = null;
  emit('command', { command, payload });
}
</script>

<template>
  <header class="editor-topbar">
    <div class="editor-toolbar-groups">
      <button class="toolbar-ghost-button" type="button" @click="run('focus-selected')">选择</button>

      <div class="toolbar-menu-group">
        <button class="toolbar-ghost-button" :class="{ 'is-open': openMenu === 'create' }" type="button" @click="toggleMenu('create')">
          创建
        </button>
        <div class="toolbar-floating-menu" :hidden="openMenu !== 'create'">
          <div class="toolbar-menu-title">创建</div>
          <button
            v-for="item in createItems"
            :key="item.label"
            class="toolbar-menu-item"
            type="button"
            @click="run(item.command, item.payload)"
          >
            <span class="toolbar-menu-item-title">{{ item.label }}</span>
            <span class="toolbar-menu-item-desc">{{ item.description }}</span>
          </button>
        </div>
      </div>

      <div class="toolbar-menu-group">
        <button class="toolbar-ghost-button" :class="{ 'is-open': openMenu === 'projection' }" type="button" @click="toggleMenu('projection')">
          投影
        </button>
        <div class="toolbar-floating-menu" :hidden="openMenu !== 'projection'">
          <div class="toolbar-menu-title">投影</div>
          <button
            v-for="item in projectionItems"
            :key="item.label"
            class="toolbar-menu-item"
            type="button"
            @click="run(item.command, item.payload)"
          >
            <span class="toolbar-menu-item-title">{{ item.label }}</span>
            <span class="toolbar-menu-item-desc">{{ item.description }}</span>
          </button>
        </div>
      </div>

      <div class="toolbar-menu-group">
        <button class="toolbar-ghost-button" :class="{ 'is-open': openMenu === 'robot' }" type="button" @click="toggleMenu('robot')">
          机器狗
        </button>
        <div class="toolbar-floating-menu" :hidden="openMenu !== 'robot'">
          <div class="toolbar-menu-title">机器狗</div>
          <button
            v-for="item in robotItems"
            :key="item.label"
            class="toolbar-menu-item"
            type="button"
            @click="run(item.command, item.payload)"
          >
            <span class="toolbar-menu-item-title">{{ item.label }}</span>
            <span class="toolbar-menu-item-desc">{{ item.description }}</span>
          </button>
        </div>
      </div>

      <div class="toolbar-menu-group">
        <button class="toolbar-ghost-button" :class="{ 'is-open': openMenu === 'view' }" type="button" @click="toggleMenu('view')">
          视图
        </button>
        <div class="toolbar-floating-menu is-align-right" :hidden="openMenu !== 'view'">
          <div class="toolbar-menu-title">视图</div>
          <button
            v-for="item in viewItems"
            :key="item.label"
            class="toolbar-menu-item"
            type="button"
            @click="run(item.command, item.payload)"
          >
            <span class="toolbar-menu-item-title">{{ item.label }}</span>
            <span class="toolbar-menu-item-desc">{{ item.description }}</span>
          </button>
        </div>
      </div>

      <div class="toolbar-divider" />
      <button class="button-secondary" type="button" @click="run('open-project')">打开工程</button>
      <button class="button-secondary" type="button" @click="run('import-project')">导入工程</button>
      <button class="button-secondary" type="button" @click="run('export-project')">导出工程</button>
      <button class="button-primary" type="button" @click="run('save-project')">保存</button>
      <span class="toolbar-project-name">{{ projectName }}</span>
    </div>
  </header>
</template>
