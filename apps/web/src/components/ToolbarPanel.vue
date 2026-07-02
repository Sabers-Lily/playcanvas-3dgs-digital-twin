<script setup>
import { UI_FLAGS } from '../config/uiFlags.js';

defineProps({
  statusMessage: {
    type: String,
    default: 'Ready'
  }
});

defineEmits([
  'create-robot-dog',
  'reset-camera',
  'toggle-bim',
  'debug-bim',
  'clear-marker'
]);
</script>

<template>
  <header class="toolbar">
    <div v-if="UI_FLAGS.showDebugToolbar" class="toolbar-group toolbar-group-main">
      <button class="toolbar-compact-button" type="button" @click="$emit('create-robot-dog')">添加机器狗</button>
      <button class="toolbar-compact-button" type="button" @click="$emit('reset-camera')">重置</button>
      <button class="toolbar-compact-button" type="button" @click="$emit('toggle-bim')">BIM</button>
      <button class="toolbar-compact-button" type="button" @click="$emit('debug-bim')">调试</button>
      <button class="toolbar-compact-button" type="button" @click="$emit('clear-marker')">清点</button>
    </div>
    <div class="toolbar-summary">
      <div class="status-summary">{{ statusMessage }}</div>
      <div class="controls-hint">Orbit / Pan / Zoom / WASD / Q E</div>
    </div>
  </header>
</template>
