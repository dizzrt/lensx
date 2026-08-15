import { resolve } from 'node:path';

import { defineConfig } from '@rsbuild/core';
import { pluginLess } from '@rsbuild/plugin-less';
import { pluginReact } from '@rsbuild/plugin-react';

export default defineConfig({
  html: { template: resolve(import.meta.dirname, 'index.html') },
  output: {
    assetPrefix: './',
    cleanDistPath: true,
    distPath: { root: resolve(import.meta.dirname, 'dist') },
    sourceMap: false,
  },
  plugins: [pluginReact({ reactCompiler: true }), pluginLess()],
  source: { entry: { index: resolve(import.meta.dirname, 'src/main.tsx') } },
});
