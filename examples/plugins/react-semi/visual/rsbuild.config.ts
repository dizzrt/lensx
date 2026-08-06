import { resolve } from 'node:path';

import { defineConfig } from '@rsbuild/core';
import { pluginLess } from '@rsbuild/plugin-less';
import { pluginReact } from '@rsbuild/plugin-react';

const packageRoot = resolve(import.meta.dirname, '..');

export default defineConfig({
  html: { template: resolve(import.meta.dirname, 'index.html') },
  output: {
    cleanDistPath: true,
    distPath: { root: resolve(packageRoot, 'visual-dist') },
    sourceMap: false,
  },
  performance: { chunkSplit: { strategy: 'all-in-one' } },
  plugins: [pluginReact(), pluginLess()],
  source: { entry: { index: resolve(import.meta.dirname, 'src/main.tsx') } },
});
