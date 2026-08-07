import { resolve } from 'node:path';

import { defineConfig } from '@rsbuild/core';

const phases = ['initial', 'permission-delta'] as const;
type DevelopmentSmokePhase = (typeof phases)[number];

const requestedPhase = process.env.LENSX_PLUGIN_DEVELOPMENT_SMOKE_PHASE ?? 'initial';
if (!phases.includes(requestedPhase as DevelopmentSmokePhase)) {
  throw new Error(
    `LENSX_PLUGIN_DEVELOPMENT_SMOKE_PHASE must be one of: ${phases.join(', ')}. Received ${JSON.stringify(requestedPhase)}.`,
  );
}
const phase = requestedPhase as DevelopmentSmokePhase;

export default defineConfig({
  html: {
    template: resolve(import.meta.dirname, 'index.html'),
  },
  output: {
    assetPrefix: './',
    cleanDistPath: true,
    copy: [{ from: resolve(import.meta.dirname, `manifests/${phase}.json`), to: 'manifest.json' }],
    distPath: { root: resolve(import.meta.dirname, 'dist') },
    sourceMap: false,
  },
  performance: {
    chunkSplit: { strategy: 'all-in-one' },
  },
  source: {
    define: {
      __LENSX_PLUGIN_DEVELOPMENT_SMOKE_PHASE__: JSON.stringify(phase),
    },
    entry: { index: resolve(import.meta.dirname, 'src/main.ts') },
  },
});
