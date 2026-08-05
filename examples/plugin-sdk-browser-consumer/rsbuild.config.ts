import { defineConfig } from '@rsbuild/core';

export default defineConfig({
  html: { title: 'lensX Plugin SDK browser consumer' },
  output: { cleanDistPath: true },
  source: { entry: { index: './src/index.ts' } },
});
