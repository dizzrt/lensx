import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { defineConfig } from '@rsbuild/core';
import { pluginLess } from '@rsbuild/plugin-less';
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
    compiler.hooks.done.tap('ReactSemiTemplateModuleInventory', (stats) => {
      const modules = [...stats.compilation.modules].map((module) => module.identifier()).sort();
      writeFileSync(resolve(import.meta.dirname, 'dist/modules.json'), `${JSON.stringify(modules, null, 2)}\n`, 'utf8');
    });
  },
};

export default defineConfig({
  html: {
    template: resolve(import.meta.dirname, 'index.html'),
  },
  output: {
    assetPrefix: './',
    cleanDistPath: true,
    copy: [{ from: resolve(import.meta.dirname, 'manifest.json'), to: 'manifest.json' }],
    distPath: { root: resolve(import.meta.dirname, 'dist') },
    sourceMap: false,
  },
  performance: {
    chunkSplit: { strategy: 'all-in-one' },
  },
  plugins: [pluginReact({ reactCompiler: true }), pluginLess()],
  source: {
    entry: { index: resolve(import.meta.dirname, 'src/main.tsx') },
  },
  tools: {
    rspack: (_config, { appendPlugins }) => {
      if (process.env.LENSX_TEMPLATE_MODULE_GRAPH === '1') appendPlugins([moduleInventoryPlugin]);
    },
  },
});
