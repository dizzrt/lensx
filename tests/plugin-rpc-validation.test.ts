import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from '@rstest/core';

import {
  analyzeJsonCompatibleCost,
  analyzePluginRpcFrame,
  analyzePluginRpcSemanticPayload,
  PLUGIN_RPC_V1_POLICY,
  reportPluginRpcDiagnostic,
} from '../src/app/plugins/runtime/rpc-validation';
import {
  exactFrameCostString,
  maliciousPluginRpcFixtures,
  maximumContractStorageText,
  nestedValue,
  rpcRequest,
  validPluginRpcFixtures,
} from './fixtures/plugin-rpc-validation';

const limits = (overrides: Partial<{ maxBytes: number; maxDepth: number; maxNodes: number }> = {}) => ({
  maxBytes: overrides.maxBytes ?? PLUGIN_RPC_V1_POLICY.maxFrameBytes,
  maxDepth: overrides.maxDepth ?? PLUGIN_RPC_V1_POLICY.maxFrameDepth,
  maxNodes: overrides.maxNodes ?? PLUGIN_RPC_V1_POLICY.maxVisitedNodes,
});

describe('Host-private plugin RPC v1 policy and bounded analyzer', () => {
  test('freezes the production policy at the approved v1 values', () => {
    expect(PLUGIN_RPC_V1_POLICY).toEqual({
      maxFrameBytes: 5_242_880,
      maxSemanticDepth: 32,
      maxFrameDepth: 36,
      maxVisitedNodes: 16_384,
      maxBatchRequestsPerFrame: 1,
      maxInFlightRequests: 32,
      hostExecutionDeadlineMs: 10_000,
    });
    expect(Object.isFrozen(PLUGIN_RPC_V1_POLICY)).toBe(true);
  });

  test('matches compact JSON UTF-8 and escaping cost without serializing the whole value', () => {
    const values = [
      null,
      true,
      false,
      -0,
      12.5,
      'ascii " slash \\ controls \b\t\n\f\r\u0000',
      '中文🙂',
      '\ud800',
      ['one', 2, false],
      { alpha: '值', quote: '"', nested: { ok: true } },
    ];
    for (const value of values) {
      const result = analyzeJsonCompatibleCost(value, limits());
      expect(result.status).toBe('valid');
      if (result.status === 'valid') {
        expect(result.bytes).toBe(Buffer.byteLength(JSON.stringify(value), 'utf8'));
      }
    }
  });

  test('accepts below and exact byte limits and stops after the first byte overrun', () => {
    expect(analyzeJsonCompatibleCost(exactFrameCostString.slice(1), limits()).status).toBe('valid');
    expect(analyzeJsonCompatibleCost(exactFrameCostString, limits())).toMatchObject({
      status: 'valid',
      bytes: PLUGIN_RPC_V1_POLICY.maxFrameBytes,
    });
    expect(analyzeJsonCompatibleCost(`${exactFrameCostString}a`, limits())).toEqual({
      status: 'invalid',
      failure: 'byte_limit_exceeded',
    });
  });

  test('accepts below and exact semantic depth and rejects the first deeper value', () => {
    expect(analyzePluginRpcSemanticPayload(nestedValue(31))).toMatchObject({ status: 'valid', maxDepth: 31 });
    expect(analyzePluginRpcSemanticPayload(nestedValue(32))).toMatchObject({ status: 'valid', maxDepth: 32 });
    expect(analyzePluginRpcSemanticPayload(nestedValue(33))).toEqual({
      status: 'invalid',
      failure: 'depth_limit_exceeded',
    });
  });

  test('counts values and object keys with exact node-limit boundaries', () => {
    const below = Array.from({ length: PLUGIN_RPC_V1_POLICY.maxVisitedNodes - 2 }, () => null);
    const exact = Array.from({ length: PLUGIN_RPC_V1_POLICY.maxVisitedNodes - 1 }, () => null);
    const over = maliciousPluginRpcFixtures.tooManyNodes;
    expect(analyzeJsonCompatibleCost(below, limits())).toMatchObject({
      status: 'valid',
      visitedNodes: PLUGIN_RPC_V1_POLICY.maxVisitedNodes - 1,
    });
    expect(analyzeJsonCompatibleCost(exact, limits())).toMatchObject({
      status: 'valid',
      visitedNodes: PLUGIN_RPC_V1_POLICY.maxVisitedNodes,
    });
    expect(analyzeJsonCompatibleCost(over, limits())).toEqual({
      status: 'invalid',
      failure: 'node_limit_exceeded',
    });
    expect(analyzeJsonCompatibleCost({ first: 1, second: 2 }, limits({ maxNodes: 4 }))).toEqual({
      status: 'invalid',
      failure: 'node_limit_exceeded',
    });
  });

  test('rejects cycles, sparse arrays, non-plain objects, non-finite numbers, and non-JSON values', () => {
    const sparse = Array(1);
    for (const [value, failure] of [
      [maliciousPluginRpcFixtures.cycle, 'cyclic_value'],
      [sparse, 'non_json_value'],
      [new Date(0), 'non_json_value'],
      [Number.NaN, 'non_json_value'],
      [Number.POSITIVE_INFINITY, 'non_json_value'],
      [undefined, 'non_json_value'],
      [1n, 'non_json_value'],
      [Symbol('private'), 'non_json_value'],
      [() => undefined, 'non_json_value'],
    ] as const) {
      expect(analyzeJsonCompatibleCost(value, limits())).toEqual({ status: 'invalid', failure });
    }
  });

  test('does not mutate valid input and accepts the maintained legal corpus', () => {
    expect(maximumContractStorageText).toHaveLength(1_048_576);
    for (const fixture of validPluginRpcFixtures) {
      const before = structuredClone(fixture);
      expect(analyzePluginRpcFrame(fixture).status).toBe('valid');
      expect(fixture).toEqual(before);
    }
  });

  test('keeps diagnostic records frozen, closed, safe, and observational', () => {
    const observed: unknown[] = [];
    reportPluginRpcDiagnostic(
      (diagnostic) => {
        observed.push(diagnostic);
        throw new Error('observability failure with /private/path and payload');
      },
      {
        plugin_id: 'com.acme.workspace',
        method: 'storage.set',
        stage: 'ingress',
        code: 'frame_limit_exceeded',
      },
    );
    expect(observed).toHaveLength(1);
    expect(observed[0]).toEqual({
      plugin_id: 'com.acme.workspace',
      method: 'storage.set',
      stage: 'ingress',
      code: 'frame_limit_exceeded',
      message: 'The plugin RPC frame exceeded a fixed limit.',
    });
    expect(Object.isFrozen(observed[0])).toBe(true);
    expect(JSON.stringify(observed[0])).not.toMatch(/request_|payload|private\/path|origin|grant|stack|Port/u);
  });

  test('keeps RPC policy, diagnostics, analyzers, and fixtures out of public packages', () => {
    for (const packageName of ['plugin-contract', 'plugin-sdk', 'plugin-ui', 'plugin-testkit']) {
      const packageRoot = join(import.meta.dirname, `../packages/${packageName}`);
      const metadata = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as { exports?: unknown };
      expect(JSON.stringify(metadata.exports)).not.toMatch(/rpc|validation|diagnostic|fixture/u);
      expect(readFileSync(join(packageRoot, 'src/index.ts'), 'utf8')).not.toMatch(
        /rpc-validation|PluginRpcDiagnostic/u,
      );
    }
    expect(analyzePluginRpcFrame(rpcRequest(1)).status).toBe('valid');
    expect(analyzePluginRpcFrame(maliciousPluginRpcFixtures.batch).status).toBe('valid');
  });
});
