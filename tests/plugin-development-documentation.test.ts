import { describe, expect, test } from '@rstest/core';

import {
  CAPABILITY_STATUS_CATALOG,
  DEVELOPER_DOCUMENTS,
  type DocumentationFile,
  parseMarkdownBlocks,
  validateDeveloperDocumentation,
  validateHostApiDocumentationCoverage,
  validatePublicPackageCoverage,
  validateRunnableBlocks,
} from '../scripts/plugin-development-documentation.ts';

const statusComments = CAPABILITY_STATUS_CATALOG.map(
  (fact) => `<!-- lensx-capability-status ${JSON.stringify(fact)} -->`,
).join('\n');

const completeFiles = (): DocumentationFile[] => {
  const files: DocumentationFile[] = [];
  for (const document of DEVELOPER_DOCUMENTS) {
    for (const locale of ['en', 'zh'] as const) {
      const headings = document.requiredHeadings[locale].map((heading) => `## ${heading}`).join('\n\n');
      files.push({
        path: `docs/${locale}/plugin-development/${document.path}`,
        source: `# Title\n\n${headings}${document.path === 'index.md' && locale === 'en' ? `\n${statusComments}` : ''}\n`,
      });
    }
  }
  return files;
};

const codes = (diagnostics: readonly { readonly code: string }[]) => diagnostics.map(({ code }) => code);

describe('plugin development documentation tree', () => {
  test('accepts the complete mirrored model', () => {
    expect(validateDeveloperDocumentation(completeFiles())).toEqual([]);
  });

  test('reports missing paths, extra mirrors, broken links, anchors, and absolute paths', () => {
    const files = completeFiles().filter(({ path }) => path !== 'docs/zh/plugin-development/host-api.md');
    files.push({ path: 'docs/zh/plugin-development/extra.md', source: '# Extra\n' });
    const hub = files.find(({ path }) => path === 'docs/en/plugin-development/index.md');
    if (hub === undefined) throw new Error('fixture hub missing');
    files[files.indexOf(hub)] = {
      ...hub,
      source: `${hub.source}\n[Missing](missing.md)\n[Anchor](public-packages.md#missing)\n[Absolute](/Users/example/private.md)\n`,
    };
    expect(codes(validateDeveloperDocumentation(files))).toEqual(
      expect.arrayContaining([
        'boundary/private-reference',
        'link/broken-anchor',
        'link/broken-target',
        'link/not-relative',
        'mirror/chinese-missing',
        'mirror/english-missing',
        'tree/path-missing',
        'tree/unexpected-page',
      ]),
    );
  });

  test('rejects a not-delivered capability labelled shipped and bounds diagnostics', () => {
    const files = completeFiles();
    const hub = files.find(({ path }) => path === 'docs/en/plugin-development/index.md');
    if (hub === undefined) throw new Error('fixture hub missing');
    files[files.indexOf(hub)] = {
      ...hub,
      source: hub.source.replace(
        '<!-- lensx-capability-status {"id":"npm-publication","status":"not-delivered"} -->',
        '<!-- lensx-capability-status {"id":"npm-publication","status":"shipped"} -->',
      ),
    };
    const diagnostics = validateDeveloperDocumentation(files);
    expect(diagnostics).toContainEqual(expect.objectContaining({ code: 'status/mismatch' }));
    expect(diagnostics.length).toBeLessThanOrEqual(64);
    expect(JSON.stringify(diagnostics)).not.toContain('/Users/');
  });
});

describe('fenced block metadata', () => {
  test('parses metadata and validates source, region, JSON, command, and explicit non-runnable blocks', () => {
    const source = [
      '```ts source=example.ts region=hello id=source',
      'export const hello = true;',
      '```',
      '```json verify=json id=json',
      '{"ok":true}',
      '```',
      '```sh verify=command id=command',
      'pnpm run test',
      'lensx-plugin validate --project .',
      '```',
      '```text non-runnable=output id=output',
      'compatible',
      '```',
    ].join('\n');
    expect(parseMarkdownBlocks(source)).toHaveLength(4);
    expect(
      validateRunnableBlocks({
        files: [{ path: 'docs/en/plugin-development/tutorial.md', source }],
        projectSources: {
          'example.ts': '// lensx-doc-region hello\nexport const hello = true;\n// lensx-doc-endregion hello\n',
        },
        rootScripts: new Set(['test']),
      }),
    ).toEqual([]);
  });

  test.each([
    ['unclassified', '```ts\nexport const value = true;\n```', 'block/classification'],
    ['missing target', '```ts source=missing.ts\nvalue\n```', 'block/source-missing'],
    ['missing region', '```ts source=example.ts region=nope\nvalue\n```', 'block/region-missing'],
    ['source drift', '```ts source=example.ts\nwrong\n```', 'block/source-drift'],
    ['private import', "```ts verify=framework-neutral\nimport 'src/app/private';\n```", 'block/private-reference'],
    ['invalid JSON', '```json verify=json\n{nope}\n```', 'block/json-invalid'],
    ['unknown command', '```sh verify=command\nunknown-command\n```', 'block/command-invalid'],
    ['unknown verify', '```ts verify=unknown\nvalue\n```', 'block/verify-unknown'],
    ['absolute source', '```ts source=/Users/example/source.ts\nvalue\n```', 'block/source-path'],
  ])('rejects %s', (_name, source, code) => {
    const diagnostics = validateRunnableBlocks({
      files: [{ path: 'docs/en/plugin-development/tutorial.md', source }],
      projectSources: { 'example.ts': 'expected\n' },
      rootScripts: new Set(),
    });
    expect(codes(diagnostics)).toContain(code);
  });

  test('reruns from current source without a cache and recovers after a fix', () => {
    const file = { path: 'docs/en/plugin-development/tutorial.md', source: '```ts source=example.ts\ncurrent\n```' };
    expect(
      codes(
        validateRunnableBlocks({ files: [file], projectSources: { 'example.ts': 'stale' }, rootScripts: new Set() }),
      ),
    ).toContain('block/source-drift');
    expect(
      validateRunnableBlocks({ files: [file], projectSources: { 'example.ts': 'current' }, rootScripts: new Set() }),
    ).toEqual([]);
  });
});

describe('public package and Host API coverage', () => {
  const hostFacts = {
    methods: [
      { method: 'runtime.get_context', permission: null },
      { method: 'clipboard.read', permission: 'clipboard.read' },
    ],
    permissions: ['clipboard.read'],
    errorCodes: ['invalid_params', 'permission_denied'],
    hostApiVersion: '0.1.0',
    providers: { 'runtime.get_context': 'base' as const, 'clipboard.read': 'clipboard' as const },
  };
  const hostSource = [
    '<!-- lensx-host-api-method {"method":"runtime.get_context","permission":null,"provider":"base","version":"0.1.0","capability":"session"} -->',
    '<!-- lensx-host-api-method {"method":"clipboard.read","permission":"clipboard.read","provider":"clipboard","version":"0.1.0","capability":"session"} -->',
    '<!-- lensx-host-api-errors {"version":"0.1.0","codes":["invalid_params","permission_denied"]} -->',
  ].join('\n');

  test('accepts exact package and Host API coverage', () => {
    expect(
      validatePublicPackageCoverage(
        '<!-- lensx-public-package {"name":"@lensx/plugin-sdk","version":"0.1.0","exports":[".","./iframe"]} -->',
        [{ name: '@lensx/plugin-sdk', version: '0.1.0', exports: ['.', './iframe'] }],
      ),
    ).toEqual([]);
    expect(validateHostApiDocumentationCoverage(hostSource, hostFacts)).toEqual([]);
  });

  test.each([
    ['missing', hostSource.replace(/^.*runtime\.get_context.*\n/u, ''), 'host-api/missing'],
    [
      'extra',
      `${hostSource}\n<!-- lensx-host-api-method {"method":"extra","permission":null,"provider":"base","version":"0.1.0","capability":"session"} -->`,
      'host-api/extra',
    ],
    ['permission', hostSource.replace('"permission":"clipboard.read"', '"permission":null'), 'host-api/permission'],
    ['provider', hostSource.replace('"provider":"clipboard"', '"provider":"base"'), 'host-api/provider'],
    ['version', hostSource.replaceAll('"version":"0.1.0"', '"version":"0.2.0"'), 'host-api/version'],
    ['errors', hostSource.replace('"invalid_params",', ''), 'host-api/errors'],
    ['private wire', `${hostSource}\nDo not expose postMessage.`, 'host-api/private-wire'],
  ])('rejects Host API %s drift', (_name, source, code) => {
    expect(codes(validateHostApiDocumentationCoverage(source, hostFacts))).toContain(code);
  });

  test('reports empty and drifted package collections', () => {
    expect(
      codes(validatePublicPackageCoverage('', [{ name: '@lensx/plugin-sdk', version: '0.1.0', exports: ['.'] }])),
    ).toContain('package/missing');
    expect(
      codes(
        validatePublicPackageCoverage(
          '<!-- lensx-public-package {"name":"@lensx/plugin-sdk","version":"0.2.0","exports":["./private"]} -->',
          [{ name: '@lensx/plugin-sdk', version: '0.1.0', exports: ['.'] }],
        ),
      ),
    ).toEqual(expect.arrayContaining(['package/exports', 'package/version']));
  });
});
