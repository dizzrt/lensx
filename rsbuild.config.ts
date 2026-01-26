import { defineConfig } from '@rsbuild/core';
import { pluginLess } from '@rsbuild/plugin-less';
import { pluginVue } from '@rsbuild/plugin-vue';

// Docs: https://rsbuild.rs/config/
export default defineConfig({
  plugins: [pluginVue(), pluginLess()],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  html: {
    template: './static/index.html',
  },
});
