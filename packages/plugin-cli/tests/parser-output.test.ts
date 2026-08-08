import { describe, expect, test } from '@rstest/core';

import {
  cliDiagnostic,
  diagnosticFromUnknownError,
  safeDiagnosticPath,
  sortAndDedupeDiagnostics,
} from '../src/diagnostics.ts';
import { MESSAGE_CATALOGS } from '../src/messages.ts';
import { createEnvelope, renderHumanEnvelope, serializeEnvelope } from '../src/output.ts';
import { parsePluginCliArguments } from '../src/parser.ts';
import { runPluginCli } from '../src/runner.ts';

const invoke = async (arguments_: readonly string[]) => {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCode = await runPluginCli(arguments_, {
    cwd: '/caller/project',
    stdout: (value) => stdout.push(value),
    stderr: (value) => stderr.push(value),
  });
  return { exitCode, stdout: stdout.join(''), stderr: stderr.join('') };
};

describe('plugin CLI parsing and output', () => {
  test('parses the five bounded commands and options', () => {
    expect(
      parsePluginCliArguments([
        'create',
        'target',
        '--template',
        'react-semi',
        '--plugin-id',
        'com.test.demo',
        '--name',
        'Demo',
      ]),
    ).toMatchObject({
      invocation: {
        command: 'create',
        target: 'target',
        template: 'react-semi',
        pluginId: 'com.test.demo',
        name: 'Demo',
      },
    });
    expect(parsePluginCliArguments(['build', '--project', 'project'])).toMatchObject({
      invocation: { command: 'build', project: 'project' },
    });
    expect(parsePluginCliArguments(['validate'])).toMatchObject({ invocation: { command: 'validate' } });
    expect(parsePluginCliArguments(['pack', '--no-build', '--output', 'artifact.lxp'])).toMatchObject({
      invocation: { command: 'pack', noBuild: true, output: 'artifact.lxp' },
    });
    expect(parsePluginCliArguments(['inspect', 'artifact.lxp'])).toMatchObject({
      invocation: { command: 'inspect', file: 'artifact.lxp' },
    });
  });

  test('reports unknown commands, unsupported combinations, and missing values', () => {
    expect(parsePluginCliArguments(['unknown'])).toMatchObject({ diagnostics: [{ code: 'CLI_UNKNOWN_COMMAND' }] });
    expect(parsePluginCliArguments(['inspect', '--project', 'x', 'a.lxp'])).toMatchObject({
      diagnostics: [{ code: 'CLI_INVALID_OPTION' }],
    });
    expect(parsePluginCliArguments(['create', 'target', '--template'])).toMatchObject({
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'CLI_EXPECTED_VALUE' })]),
    });
  });

  test('returns stable exit codes for help, version, success, and usage errors', async () => {
    await expect(invoke(['--help'])).resolves.toMatchObject({ exitCode: 0, stderr: '' });
    await expect(invoke(['--version'])).resolves.toMatchObject({ exitCode: 0, stdout: 'lensx-plugin 0.2.0\n' });
    await expect(invoke(['missing'])).resolves.toMatchObject({ exitCode: 2, stdout: '' });
  });

  test('emits exactly one locale-independent JSON document', async () => {
    const english = await invoke(['--version', '--json', '--locale', 'en-US']);
    const chinese = await invoke(['--version', '--json', '--locale', 'zh-CN']);
    expect(english.stdout.trim().split('\n')).toHaveLength(1);
    expect(JSON.parse(english.stdout)).toEqual(JSON.parse(chinese.stdout));
    expect(JSON.parse(english.stdout)).toMatchObject({
      schema_version: '1',
      command: 'version',
      status: 'success',
      diagnostics: [],
    });
  });

  test('keeps human catalogs aligned while locale changes only rendered copy', () => {
    expect(Object.keys(MESSAGE_CATALOGS['en-US'])).toEqual(Object.keys(MESSAGE_CATALOGS['zh-CN']));
    const envelope = createEnvelope('validate', 'invalid', {}, [
      cliDiagnostic('CLI_INVALID', 'dist/manifest.json', 'operation_failed'),
    ]);
    expect(renderHumanEnvelope(envelope, 'en-US')).not.toEqual(renderHumanEnvelope(envelope, 'zh-CN'));
    expect(serializeEnvelope(envelope)).toContain('"code":"CLI_INVALID"');
  });

  test('sorts, deduplicates, and removes unsafe path and argument data', () => {
    const secret = 'super-secret-value';
    const diagnostics = sortAndDedupeDiagnostics([
      cliDiagnostic('B', '/Users/example/private/file', 'operation_failed', {
        token: secret,
        detail: 'at x (/tmp/a.ts:1:2)',
      }),
      cliDiagnostic('A', 'dist/manifest.json', 'operation_failed', { count: 1 }),
      cliDiagnostic('A', 'dist/manifest.json', 'operation_failed', { count: 1 }),
    ]);
    expect(diagnostics).toEqual([
      expect.objectContaining({ code: 'A', path: 'dist/manifest.json', arguments: { count: 1 } }),
      expect.objectContaining({ code: 'B', path: '/input', arguments: {} }),
    ]);
    expect(JSON.stringify(diagnostics)).not.toContain(secret);
    expect(safeDiagnosticPath('C:\\Users\\name\\file')).toBe('/input');
  });

  test('maps raw exceptions to bounded diagnostics without stack or message leakage', () => {
    const error = new Error('file contents and process.env.SECRET');
    error.stack = 'Error: private\n at /Users/name/source.ts:1:1';
    const diagnostic = diagnosticFromUnknownError(error);
    expect(diagnostic).toEqual({
      code: 'CLI_OPERATION_FAILED',
      path: '/operation',
      message_key: 'operation_failed',
      arguments: {},
    });
    expect(JSON.stringify(diagnostic)).not.toContain('private');
  });
});
