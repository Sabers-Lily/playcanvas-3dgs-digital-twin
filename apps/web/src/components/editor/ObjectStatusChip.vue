<script setup>
import { computed } from 'vue';

const props = defineProps({
  value: {
    type: [String, Boolean, Number],
    default: ''
  }
});

const text = computed(() => String(props.value ?? '').trim() || 'idle');

const toneClass = computed(() => {
  const normalized = text.value.toLowerCase();
  if (['ready', 'loaded', 'active', 'connected', 'running', 'on', 'true'].includes(normalized)) {
    return 'is-success';
  }

  if (['failed', 'offline', 'error', 'deleted', 'off', 'false'].includes(normalized)) {
    return 'is-danger';
  }

  if (['processing', 'checking', 'paused', 'warning'].includes(normalized)) {
    return 'is-warning';
  }

  return 'is-neutral';
});
</script>

<template>
  <span class="status-chip" :class="toneClass">
    <span class="status-chip-dot" />
    <span>{{ text }}</span>
  </span>
</template>
