<script setup>
import { ref, defineExpose } from 'vue';

defineProps({
  statusSummary: {
    type: Object,
    default: () => ({
      sog: 'SOG idle',
      bim: 'BIM idle',
      pick: 'Ready'
    })
  }
});

const viewportBody = ref(null);

defineExpose({
  viewportBody
});
</script>

<template>
  <section class="panel viewport-panel">
    <div class="panel-header viewport-header">
      <span>视口</span>
      <span class="viewport-summary">
        SOG: {{ statusSummary.sog }} | BIM: {{ statusSummary.bim }} | Pick: {{ statusSummary.pick }}
      </span>
    </div>
    <div ref="viewportBody" class="viewport-body">
      <slot />
    </div>
  </section>
</template>
