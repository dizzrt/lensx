import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { type ConfigParams, defineConfig, type RsbuildConfig } from '@rsbuild/core';
import { pluginLess } from '@rsbuild/plugin-less';
import { pluginReact } from '@rsbuild/plugin-react';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));
const pluginDevelopmentModeEnabled = process.env.LENSX_PLUGIN_DEVELOPMENT_MODE === '1';

export const createRsbuildConfig = ({ command }: Pick<ConfigParams, 'command'>): RsbuildConfig => ({
  plugins: [
    pluginLess(),
    pluginReact({
      reactCompiler: true,
    }),
  ],
  resolve: {
    aliasStrategy: 'prefer-alias',
    alias: {
      ...(command === 'dev'
        ? {
            // Keep Host HMR independent from workspace package dist rebuilds.
            '@lensx/plugin-contract$': resolve(projectRoot, 'packages/plugin-contract/src/index.ts'),
          }
        : {}),
      '@/app/plugins/development/composition': resolve(
        projectRoot,
        pluginDevelopmentModeEnabled
          ? 'src/app/plugins/development/composition-enabled.ts'
          : 'src/app/plugins/development/composition-disabled.ts',
      ),
      '@': resolve(projectRoot, 'src'),
      // Semi ships the global bundle outside its package exports.
      '@douyinfe/semi-ui/dist/css/semi.min.css': resolve(
        projectRoot,
        'node_modules/@douyinfe/semi-ui/dist/css/semi.min.css',
      ),
    },
  },
  source: {
    define: {
      __LENSX_PLUGIN_DEVELOPMENT_MODE__: JSON.stringify(pluginDevelopmentModeEnabled),
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

// Docs: https://rsbuild.rs/config/
export default defineConfig(createRsbuildConfig);
