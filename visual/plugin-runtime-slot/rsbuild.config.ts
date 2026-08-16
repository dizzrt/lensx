import { resolve } from 'node:path';
import { defineConfig } from '@rsbuild/core';
import { pluginLess } from '@rsbuild/plugin-less';
import { pluginReact } from '@rsbuild/plugin-react';

const repositoryRoot = resolve(import.meta.dirname, '../..');

export default defineConfig({
  plugins: [pluginLess(), pluginReact()],
  source: { entry: { index: resolve(import.meta.dirname, 'src/main.tsx') } },
  resolve: {
    alias: {
      '@douyinfe/semi-ui/dist/css/semi.min.css': resolve(
        repositoryRoot,
        'node_modules/@douyinfe/semi-ui/dist/css/semi.min.css',
      ),
    },
  },
  html: { template: resolve(import.meta.dirname, 'index.html') },
  output: { distPath: { root: resolve(repositoryRoot, '.tmp/plugin-runtime-slot-visual-dist') } },
});
