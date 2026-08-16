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
          callback: (stats: {
            compilation: {
              chunkGraph: {
                getModuleChunks(module: { identifier(): string }): Iterable<{ files: Iterable<string> }>;
              };
              modules: Iterable<{ identifier(): string }>;
            };
          }) => void,
        ): void;
      };
    };
  }) {
    compiler.hooks.done.tap('ConfigLensModuleInventory', (stats) => {
      const modules = [...stats.compilation.modules].map((module) => module.identifier()).sort();
      writeFileSync(resolve(import.meta.dirname, 'dist/modules.json'), `${JSON.stringify(modules, null, 2)}\n`, 'utf8');
      const chunkModules: Record<string, string[]> = {};
      for (const module of stats.compilation.modules) {
        for (const chunk of stats.compilation.chunkGraph.getModuleChunks(module)) {
          for (const file of chunk.files) {
            const modules = chunkModules[file] ?? [];
            modules.push(module.identifier());
            chunkModules[file] = modules;
          }
        }
      }
      for (const identifiers of Object.values(chunkModules)) identifiers.sort();
      writeFileSync(
        resolve(import.meta.dirname, 'dist/chunk-modules.json'),
        `${JSON.stringify(chunkModules, null, 2)}\n`,
        'utf8',
      );
    });
  },
};

export default defineConfig({
  html: { template: resolve(import.meta.dirname, 'index.html') },
  output: {
    assetPrefix: './',
    cleanDistPath: true,
    copy: [{ from: resolve(import.meta.dirname, 'manifest.json'), to: 'manifest.json' }],
    distPath: { root: resolve(import.meta.dirname, 'dist') },
    sourceMap: false,
  },
  performance: {
    chunkSplit: { strategy: 'split-by-experience' },
  },
  plugins: [pluginReact({ reactCompiler: true }), pluginLess()],
  source: { entry: { index: resolve(import.meta.dirname, 'src/main.tsx') } },
  tools: {
    rspack: (_config, { appendPlugins }) => {
      if (process.env.RSTEST === undefined) appendPlugins([moduleInventoryPlugin]);
    },
  },
});
