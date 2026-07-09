<template>
  <div data-tauri-drag-region class="wh-full bg-white">
    <div class="flex wh-full">
      <div data-tauri-drag-region class="bg-red w-4"></div>
      <n-auto-complete v-model:value="value" :options="options" />
    </div>
  </div>
</template>

<style scoped>
.content {
  display: flex;
  min-height: 100vh;
  line-height: 1.1;
  text-align: center;
  flex-direction: column;
  justify-content: center;
}

.content h1 {
  font-size: 3.6rem;
  font-weight: 700;
}

.content p {
  font-size: 1.2rem;
  font-weight: 400;
  opacity: 0.5;
}
</style>

<script setup lang="ts">
import { NAutoComplete } from 'naive-ui';
import { ref } from 'vue';

const value = ref('');
const options = ref([
  {
    label: 'a',
  },
]);
</script>
