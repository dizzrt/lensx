import { defineConfig } from '@rsbuild/core';

export default defineConfig({
  source: {
    entry: {
      index: './src/plugin-runtime-security-lifecycle-harness.ts',
    },
  },
  html: {
    template: './static/index.html',
    title: 'lensX Plugin Runtime Security Lifecycle Harness',
  },
  output: {
    distPath: {
      root: 'dist',
    },
  },
});
