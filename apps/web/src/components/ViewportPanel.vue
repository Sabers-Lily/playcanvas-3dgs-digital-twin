<script setup>
import { defineExpose, ref } from 'vue';

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
    <div ref="viewportBody" class="viewport-body">
      <slot />
    </div>
  </section>
</template>
