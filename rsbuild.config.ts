import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from '@rsbuild/core';
import { pluginLess } from '@rsbuild/plugin-less';
import { pluginReact } from '@rsbuild/plugin-react';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));

// Docs: https://rsbuild.rs/config/
export default defineConfig({
  plugins: [
    pluginLess(),
    pluginReact({
      reactCompiler: true,
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(projectRoot, 'src'),
    },
  },
  html: {
    template: './static/index.html',
    title: 'lensx',
  },

  output: {
    distPath: {
      root: 'dist',
    },
  },
  server: {
    port: 40755,
  },
});
