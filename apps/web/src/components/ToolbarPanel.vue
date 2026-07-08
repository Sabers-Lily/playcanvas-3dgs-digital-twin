<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

const props = defineProps({
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
const rootElementRef = ref(null);
const openMenu = ref(null);

const menuGroups = [
  {
    key: 'file',
    label: '文件',
    sections: [
      {
        items: [
          { command: 'open-project', label: '打开工程', description: '打开已有工程配置' },
          { command: 'import-project', label: '导入工程', description: '从本地工程文件导入' },
          { command: 'export-project', label: '导出工程', description: '导出当前工程文件' },
          { command: 'save-project', label: '保存', description: '保存当前工程' }
        ]
      }
    ]
  },
  {
    key: 'view',
    label: '查看',
    sections: [
      {
        items: [
          { command: 'focus-map', label: '聚焦地图', description: '快速回到地图中心区域' },
          { command: 'toolbar-action', payload: 'reset-camera', label: '重置视角', description: '恢复默认观察相机视角' },
          { command: 'clear-marker', label: '清除 Pick Marker', description: '移除当前拾取标记' }
        ]
      }
    ]
  },
  {
    key: 'edit',
    label: '编辑',
    sections: [
      {
        title: '创建',
        items: [
          { command: 'create-object', payload: 'buildingEnvelope', label: '标注', description: '沿用原建筑多边体创建逻辑' },
          { command: 'create-object', payload: 'cameraDevice', label: '摄像头', description: '创建视频投影对象' },
          { command: 'toolbar-action', payload: 'create-robot-dog', label: '无人设备', description: '沿用原机器狗创建逻辑' }
        ]
      },
      {
        title: '投影',
        items: [
          { command: 'toolbar-action', payload: 'start-quad-video-projection-editing', label: '开始选四点', description: '按左上、右上、右下、左下顺序选择世界锚点' },
          { command: 'toolbar-action', payload: 'apply-quad-video-projection', label: '应用四点投影', description: '将共享摄像头视频固定到四点世界区域' },
          { command: 'toggle-projection-enabled', label: '启用 / 关闭投影', description: '只开关地图投影，不关闭右侧视频预览' }
        ]
      },
      {
        title: '机器狗',
        items: [
          { command: 'toolbar-action', payload: 'create-robot-dog', label: '添加设备', description: '沿用原机器狗创建逻辑' },
          { command: 'robot-dog-start-edit', label: '编辑巡航路线', description: '进入路线点位编辑模式' },
          { command: 'robot-dog-start-patrol', label: '开始巡航', description: '按当前路线开始巡航' }
        ]
      }
    ]
  },
  {
    key: 'select',
    label: '选择',
    sections: [
      {
        items: [
          { command: 'focus-selected', label: '聚焦选中', description: '聚焦当前选中的场景对象' }
        ]
      }
    ]
  }
];

const displayProjectName = computed(() => {
  const normalizedName = typeof props.projectName === 'string' ? props.projectName.trim() : '';
  return normalizedName || '未命名工程';
});

function closeMenu() {
  openMenu.value = null;
}

function toggleMenu(menuKey) {
  openMenu.value = openMenu.value === menuKey ? null : menuKey;
}

function run(command, payload = null) {
  closeMenu();
  emit('command', { command, payload });
}

function handleDocumentPointerDown(event) {
  if (!rootElementRef.value?.contains(event.target)) {
    closeMenu();
  }
}

function handleDocumentKeydown(event) {
  if (event.key === 'Escape') {
    closeMenu();
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown);
  window.addEventListener('keydown', handleDocumentKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown);
  window.removeEventListener('keydown', handleDocumentKeydown);
});
</script>

<template>
  <header ref="rootElementRef" class="editor-topbar">
    <div class="editor-toolbar-groups">
      <div
        v-for="menuGroup in menuGroups"
        :key="menuGroup.key"
        class="toolbar-menu-group"
      >
        <button
          class="toolbar-ghost-button"
          :class="{ 'is-open': openMenu === menuGroup.key }"
          type="button"
          @click="toggleMenu(menuGroup.key)"
        >
          {{ menuGroup.label }}
        </button>
        <div class="toolbar-floating-menu" :hidden="openMenu !== menuGroup.key">
          <template
            v-for="(section, sectionIndex) in menuGroup.sections"
            :key="`${menuGroup.key}-${section.title ?? 'section'}-${sectionIndex}`"
          >
            <div v-if="sectionIndex > 0" class="toolbar-menu-separator"></div>
            <div v-if="section.title" class="toolbar-menu-title">{{ section.title }}</div>
            <button
              v-for="item in section.items"
              :key="`${menuGroup.key}-${item.label}`"
              class="toolbar-menu-item"
              type="button"
              :disabled="item.disabled"
              @click="run(item.command, item.payload)"
            >
              <span class="toolbar-menu-item-title">{{ item.label }}</span>
              <span class="toolbar-menu-item-desc">{{ item.description }}</span>
            </button>
          </template>
        </div>
      </div>

      <span class="toolbar-project-name">{{ displayProjectName }}</span>
    </div>
  </header>
</template>
