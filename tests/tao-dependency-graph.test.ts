import { describe, expect, test } from '@rstest/core';

import { assertTaoDependencyGraphs, checkTaoDependencyGraph } from '../scripts/tao-dependency-graph.ts';

const root = '/fixture/repository with spaces';
const path = `${root}/vendor/frame-aware-navigation/tao`;
const row = `tao v0.35.3 (${path})|dbus,rwh_06,x11\n`;

describe('vendored Tao compilation dependency selection', () => {
  test('compares actual application and selected package feature sets independently of ordering', () => {
    expect(() => assertTaoDependencyGraphs(row, row.replace('dbus,rwh_06,x11', 'x11,dbus,rwh_06'), root)).not.toThrow();
  });

  test.each([
    '',
    `${row}${row}`,
    'tao v0.35.3|dbus,rwh_06,x11',
    row.replace('v0.35.3', 'v0.35.4'),
    row.replace(path, '/registry/tao'),
    row.replace('dbus,rwh_06,x11', 'rwh_06,x11'),
  ])('rejects missing, malformed, path, version, and feature drift: %s', (drifted) => {
    expect(() => assertTaoDependencyGraphs(row, drifted, root)).toThrow(
      /\[tao\/(?:graph-invalid|graph-drift|feature-drift)\]/u,
    );
    expect(() => assertTaoDependencyGraphs(drifted, row, root)).toThrow(
      /\[tao\/(?:graph-invalid|graph-drift|feature-drift)\]/u,
    );
  });

  test('queries the locked application reverse graph and the package selected for strict compilation', () => {
    const observed: string[][] = [];
    checkTaoDependencyGraph(root, (argv, cwd) => {
      expect(cwd).toBe(root);
      observed.push([...argv]);
      return { status: 0, stdout: row };
    });
    const shared = ['tree', '--locked', '--manifest-path', 'src-tauri/Cargo.toml', '-p'];
    const suffix = ['--depth', '0', '--format', '{p}|{f}', '--prefix', 'none'];
    expect(observed).toEqual([
      [...shared, 'lensx', '--invert', 'tao', ...suffix],
      [...shared, 'tao', ...suffix],
    ]);
  });

  test.each([
    { status: 5, stdout: '', stderr: 'cargo resolution failed' },
    { status: null, stdout: '', error: new Error('cargo unavailable') },
  ])('fails closed on Cargo command failure without querying a second graph', (result) => {
    let calls = 0;
    expect(() =>
      checkTaoDependencyGraph(root, () => {
        calls += 1;
        return result;
      }),
    ).toThrow('[tao/graph-command-failed] application');
    expect(calls).toBe(1);
  });
});
