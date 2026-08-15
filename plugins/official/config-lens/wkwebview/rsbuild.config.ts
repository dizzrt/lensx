import { resolve } from 'node:path';

import { defineConfig } from '@rsbuild/core';

export default defineConfig({
  html: { template: resolve(import.meta.dirname, 'index.html') },
  output: {
    assetPrefix: './',
    cleanDistPath: true,
    distPath: { root: resolve(import.meta.dirname, 'dist') },
    sourceMap: false,
  },
  performance: { chunkSplit: { strategy: 'split-by-experience' } },
  source: { entry: { index: resolve(import.meta.dirname, 'src/main.ts') } },
});
