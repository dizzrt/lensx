import { describe, expect, it } from '@rstest/core';

import {
  auditNoDualRuntimePath,
  auditNoDualRuntimeText,
  NO_DUAL_RUNTIME_RULES,
} from '../scripts/no-dual-plugin-runtime';

const marker = (id: string): string => {
  const value = NO_DUAL_RUNTIME_RULES.find((rule) => rule.id === id)?.marker;
  if (value === undefined) throw new Error(`Missing drift rule ${id}.`);
  return value;
};

describe('no dual plugin Runtime drift policy', () => {
  it('rejects a removed production symbol', () => {
    const diagnostics = auditNoDualRuntimeText({
      path: 'src/app/plugins/runtime/old.ts',
      surface: 'production',
      text: `export const runtime = ${JSON.stringify(marker('legacy-frame-component'))};`,
    });

    expect(diagnostics.map(({ ruleId }) => ruleId)).toEqual(['legacy-frame-component']);
  });

  it('allows only the named legacy classifier corpus', () => {
    const text = marker('legacy-sdk-entry');
    expect(
      auditNoDualRuntimeText({
        path: 'packages/plugin-cli/src/project.ts',
        surface: 'public-package-source',
        text,
      }),
    ).toEqual([]);
    expect(
      auditNoDualRuntimeText({
        path: 'packages/plugin-cli/src/another-file.ts',
        surface: 'public-package-source',
        text,
      }).map(({ ruleId }) => ruleId),
    ).toEqual(['legacy-sdk-entry']);
  });

  it('allows explicit migration copy but rejects a current-behavior claim', () => {
    const oldCopy = marker('legacy-runtime-copy');
    expect(
      auditNoDualRuntimeText({
        path: 'docs/en/development/plugin-developer-cli.md',
        surface: 'current-docs',
        text: `The legacy protocol is incompatible: ${oldCopy}.`,
      }),
    ).toEqual([]);
    expect(
      auditNoDualRuntimeText({
        path: 'docs/en/development/new-page.md',
        surface: 'current-docs',
        text: `The shipped container is an ${oldCopy}.`,
      }).map(({ ruleId }) => ruleId),
    ).toEqual(['legacy-runtime-copy']);
  });

  it('checks removed capability names in paths', () => {
    const oldCapability = marker('legacy-runtime-capability');
    expect(
      auditNoDualRuntimePath(`openspec/specs/${oldCapability}/spec.md`, 'effective-stable-specs').map(
        ({ ruleId }) => ruleId,
      ),
    ).toEqual(['legacy-runtime-capability']);
  });

  it('allows only the exact migration change identifier in current policy', () => {
    const oldCapability = marker('legacy-runtime-capability');
    expect(
      auditNoDualRuntimeText({
        path: 'package.json',
        surface: 'root-policy',
        text: 'replace-plugin-iframe-runtime-with-child-webview',
      }),
    ).toEqual([]);
    expect(
      auditNoDualRuntimeText({
        path: 'package.json',
        surface: 'root-policy',
        text: `replace-plugin-iframe-runtime-with-child-webview ${oldCapability}`,
      }).map(({ ruleId }) => ruleId),
    ).toEqual(['legacy-runtime-capability']);
  });
});
