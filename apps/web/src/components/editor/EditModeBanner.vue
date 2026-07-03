<script setup>
defineProps({
  mode: {
    type: Object,
    default: null
  }
});

defineEmits(['action']);
</script>

<template>
  <div v-if="mode" class="edit-mode-banner">
    <div class="edit-mode-copy">
      <div class="edit-mode-label">{{ mode.label }}</div>
      <div class="edit-mode-title">{{ mode.title }}</div>
      <div class="edit-mode-description">{{ mode.description }}</div>
    </div>
    <div class="edit-mode-actions">
      <button
        v-for="item in mode.actions"
        :key="item.action"
        class="button-secondary"
        :class="item.variant === 'primary' ? 'button-primary' : item.variant === 'danger' ? 'button-danger' : 'button-secondary'"
        type="button"
        :disabled="item.disabled"
        @click="$emit('action', item.action)"
      >
        {{ item.label }}
      </button>
    </div>
  </div>
</template>
