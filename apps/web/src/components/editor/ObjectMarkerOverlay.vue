<script setup>
import { ref } from 'vue';

defineProps({
  markers: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(['select']);
const hoveredMarkerId = ref(null);

function handleMarkerClick(marker) {
  emit('select', marker.objectId);
}
</script>

<template>
  <div class="object-marker-overlay">
    <button
      v-for="marker in markers"
      :key="marker.objectId"
      class="object-marker"
      :class="[
        `object-marker--${marker.kind}`,
        { 'is-selected': marker.selected },
        { 'is-active': marker.active },
        { 'is-hovered': hoveredMarkerId === marker.objectId }
      ]"
      :style="{
        left: `${marker.screenX}px`,
        top: `${marker.screenY}px`,
        zIndex: marker.zIndex
      }"
      :title="marker.tooltip"
      :aria-label="marker.name"
      type="button"
      @pointerdown.stop.prevent
      @click.stop.prevent="handleMarkerClick(marker)"
      @mouseenter="hoveredMarkerId = marker.objectId"
      @mouseleave="hoveredMarkerId = null"
      @focus="hoveredMarkerId = marker.objectId"
      @blur="hoveredMarkerId = null"
    >
      <span class="object-marker__icon">{{ marker.icon }}</span>
      <span v-if="marker.selected || hoveredMarkerId === marker.objectId" class="object-marker__label">
        {{ marker.name }}
      </span>
    </button>
  </div>
</template>
