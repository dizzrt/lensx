import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, test } from '@rstest/core';

const packageRoot = resolve(import.meta.dirname, '..');

test('ships an executable source entry that forwards only to the existing built runner', () => {
  const metadata = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'));
  expect(metadata.bin).toEqual({ 'lensx-plugin': './bin/lensx-plugin.mjs' });
  expect(metadata.files).toEqual(['bin/lensx-plugin.mjs', 'dist', 'LICENSE', 'README.md', 'DEPENDENCIES.md']);
  expect(metadata.exports).toEqual({
    '.': { types: './dist/src/index.d.ts', import: './dist/src/index.js' },
  });
  const entry = resolve(packageRoot, metadata.bin['lensx-plugin']);
  expect(statSync(entry).mode & 0o111).not.toBe(0);
  expect(readFileSync(entry, 'utf8')).toBe("#!/usr/bin/env node\nimport '../dist/src/bin.js';\n");
  expect(metadata.scripts.preinstall).toBeUndefined();
  expect(metadata.scripts.install).toBeUndefined();
  expect(metadata.scripts.postinstall).toBeUndefined();
});
