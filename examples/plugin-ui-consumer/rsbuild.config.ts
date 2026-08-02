import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

const moduleInventoryPlugin = {
  apply(compiler: {
    hooks: {
      done: {
        tap(
          name: string,
          callback: (stats: { compilation: { modules: Iterable<{ identifier(): string }> } }) => void,
        ): void;
      };
    };
  }) {
    compiler.hooks.done.tap('PluginUiConsumerModuleInventory', (stats) => {
      const modules = [...stats.compilation.modules].map((module) => module.identifier()).sort();
      writeFileSync(resolve(process.cwd(), 'dist/modules.json'), `${JSON.stringify(modules, null, 2)}\n`, 'utf8');
    });
  },
};

export default defineConfig({
  output: {
    cleanDistPath: true,
    distPath: { root: 'dist' },
    sourceMap: false,
  },
  performance: {
    chunkSplit: { strategy: 'all-in-one' },
  },
  plugins: [pluginReact()],
  source: {
    entry: { index: './src/main.tsx' },
  },
  tools: {
    rspack: (_config, { appendPlugins }) => {
      appendPlugins([moduleInventoryPlugin]);
    },
  },
});
