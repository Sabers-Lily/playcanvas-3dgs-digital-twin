<script setup>
defineProps({
  routes: {
    type: Array,
    default: () => []
  }
});
</script>

<template>
  <div class="robot-route-overlay">
    <svg class="robot-route-overlay__svg" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <g
        v-for="route in routes"
        :key="route.objectId"
        class="robot-route-overlay__route"
        :class="[
          { 'is-selected': route.selected },
          { 'is-editing': route.editing },
          { 'is-running': route.running },
          { 'is-paused': route.paused },
          { 'is-finished': route.finished }
        ]"
      >
        <polyline
          v-for="segment in route.segments"
          :key="`${segment.id}-outline`"
          class="robot-route-overlay__line robot-route-overlay__line--outline"
          :points="segment.points"
        />
        <polyline
          v-for="segment in route.segments"
          :key="`${segment.id}-main`"
          class="robot-route-overlay__line robot-route-overlay__line--main"
          :points="segment.points"
        />

        <g
          v-for="waypoint in route.waypoints"
          :key="waypoint.id"
          class="robot-route-overlay__waypoint"
          :class="[
            `is-${waypoint.kind}`,
            { 'is-current': waypoint.isCurrent }
          ]"
          :transform="`translate(${waypoint.x} ${waypoint.y})`"
        >
          <circle class="robot-route-overlay__waypoint-ring" r="11" />
          <circle class="robot-route-overlay__waypoint-core" r="7" />
          <text class="robot-route-overlay__waypoint-label" text-anchor="middle" dominant-baseline="central">
            {{ waypoint.label }}
          </text>
        </g>
      </g>
    </svg>
  </div>
</template>
