<script setup>
import { ref, watch } from 'vue';

const props = defineProps({
  title: {
    type: String,
    required: true
  },
  defaultOpen: {
    type: Boolean,
    default: true
  }
});

const isOpen = ref(props.defaultOpen);

watch(
  () => props.defaultOpen,
  (value) => {
    isOpen.value = value;
  }
);
</script>

<template>
  <section class="inspector-section" :class="{ 'is-open': isOpen }">
    <button class="inspector-section-header" type="button" @click="isOpen = !isOpen">
      <span class="inspector-section-title">{{ title }}</span>
      <span class="inspector-section-toggle">{{ isOpen ? '收起' : '展开' }}</span>
    </button>
    <div v-if="isOpen" class="inspector-section-body">
      <slot />
    </div>
  </section>
</template>
