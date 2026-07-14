<script setup>
defineProps({
  overlay: {
    type: Object,
    default: () => ({
      isActive: false,
      activeTool: 'select',
      prompt: '',
      measurements: []
    })
  }
});
</script>

<template>
  <div class="measurement-overlay" :class="{ 'is-active': overlay?.isActive }">
    <div v-if="overlay?.isActive && overlay?.prompt" class="measurement-overlay__prompt">
      {{ overlay.prompt }}
    </div>

    <svg class="measurement-overlay__svg" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <g
        v-for="measurement in overlay?.measurements ?? []"
        :key="measurement.id"
        class="measurement-overlay__measurement"
        :class="[
          `is-${measurement.type}`,
          { 'is-draft': measurement.isDraft }
        ]"
      >
        <polygon
          v-for="polygon in measurement.polygons"
          :key="polygon.id"
          class="measurement-overlay__polygon"
          :points="polygon.points"
        />

        <polyline
          v-for="segment in measurement.segments"
          :key="`${segment.id}-outline`"
          class="measurement-overlay__line measurement-overlay__line--outline"
          :points="segment.points"
        />
        <polyline
          v-for="segment in measurement.segments"
          :key="`${segment.id}-main`"
          class="measurement-overlay__line measurement-overlay__line--main"
          :points="segment.points"
        />

        <g
          v-for="marker in measurement.markers"
          :key="marker.id"
          class="measurement-overlay__marker"
          :transform="`translate(${marker.x} ${marker.y})`"
        >
          <circle class="measurement-overlay__marker-ring" r="9" />
          <circle class="measurement-overlay__marker-core" r="5" />
        </g>
      </g>
    </svg>

    <template v-for="measurement in overlay?.measurements ?? []" :key="`${measurement.id}-labels`">
      <div
        v-for="label in measurement.labels"
        :key="label.id"
        class="measurement-overlay__label"
        :class="[
          `is-${measurement.type}`,
          { 'is-draft': measurement.isDraft }
        ]"
        :style="{ left: `${label.x}px`, top: `${label.y}px` }"
      >
        {{ label.text }}
      </div>
    </template>
  </div>
</template>
