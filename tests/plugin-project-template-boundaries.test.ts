import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from '@rstest/core';

import {
  auditPluginTemplateBoundary,
  type PluginTemplateBoundaryInput,
} from '../scripts/plugin-project-template-boundaries';

const fixtureRoot = resolve(import.meta.dirname, 'fixtures/plugin-project-template-boundaries');
const fixtureNames = [
  'valid',
  'dependency-backlink',
  'deep-import',
  'host-private-import',
  'tauri-import',
  'private-packer-import',
  'missing-lifecycle',
  'legacy-iframe-runtime',
] as const;

describe('plugin project template public boundary fixtures', () => {
  for (const name of fixtureNames) {
    it(name, () => {
      const fixture = JSON.parse(readFileSync(resolve(fixtureRoot, `${name}.json`), 'utf8')) as {
        expected: readonly string[];
        input: PluginTemplateBoundaryInput;
      };
      expect(auditPluginTemplateBoundary(fixture.input)).toEqual(fixture.expected);
    });
  }
});
