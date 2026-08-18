import { resolve } from 'node:path';

import { defineConfig } from '@rsbuild/core';
import { pluginLess } from '@rsbuild/plugin-less';

export default defineConfig({
  html: { template: resolve(import.meta.dirname, 'index.html') },
  output: {
    assetPrefix: './',
    cleanDistPath: true,
    distPath: { root: resolve(import.meta.dirname, 'dist') },
    sourceMap: false,
  },
  performance: { chunkSplit: { strategy: 'split-by-experience' } },
  plugins: [pluginLess()],
  source: { entry: { index: resolve(import.meta.dirname, 'src/main.ts') } },
});
