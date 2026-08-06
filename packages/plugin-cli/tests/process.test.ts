import { describe, expect, test } from '@rstest/core';

import { runBoundedProcess } from '../src/process.ts';

describe('build process output strategy', () => {
  test('streams author output in human mode', async () => {
    const stdout: string[] = [];
    const result = await runBoundedProcess({
      command: process.execPath,
      arguments: ['--eval', 'process.stdout.write("author log")'],
      cwd: process.cwd(),
      json: false,
      writeStdout: (value) => stdout.push(value),
    });
    expect(result).toMatchObject({ status: 0, stdout: '', stderr: '', truncated: false });
    expect(stdout.join('')).toBe('author log');
  });

  test('captures JSON-mode logs without writing them and enforces a shared bound', async () => {
    const streamed: string[] = [];
    const result = await runBoundedProcess({
      command: process.execPath,
      arguments: ['--eval', 'process.stdout.write("x".repeat(32)); process.stderr.write("failure")'],
      cwd: process.cwd(),
      json: true,
      maximumCaptureBytes: 16,
      writeStdout: (value) => streamed.push(value),
      writeStderr: (value) => streamed.push(value),
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toHaveLength(16);
    expect(result.stderr).toBe('');
    expect(result.truncated).toBe(true);
    expect(streamed).toEqual([]);
  });

  test('preserves non-zero process status as a controlled fact', async () => {
    const result = await runBoundedProcess({
      command: process.execPath,
      arguments: ['--eval', 'process.stderr.write("no"); process.exit(7)'],
      cwd: process.cwd(),
      json: true,
    });
    expect(result).toMatchObject({ status: 7, stderr: 'no', truncated: false });
  });
});
