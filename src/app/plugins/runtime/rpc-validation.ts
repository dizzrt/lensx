import type { HostApiMethod } from '@lensx/plugin-contract';

export const PLUGIN_RPC_V1_POLICY = Object.freeze({
  maxFrameBytes: 5_242_880,
  maxSemanticDepth: 32,
  maxFrameDepth: 36,
  maxVisitedNodes: 16_384,
  maxBatchRequestsPerFrame: 1,
  maxInFlightRequests: 32,
  hostExecutionDeadlineMs: 10_000,
} as const);

export type PluginRpcDiagnosticStage = 'ingress' | 'execution' | 'egress';
export type PluginRpcDiagnosticCode =
  | 'protocol_violation'
  | 'frame_limit_exceeded'
  | 'concurrency_limit_exceeded'
  | 'execution_timeout'
  | 'handler_failed'
  | 'invalid_handler_output'
  | 'invalid_event';

const DIAGNOSTIC_MESSAGES = Object.freeze({
  protocol_violation: 'The plugin RPC frame violated the private protocol.',
  frame_limit_exceeded: 'The plugin RPC frame exceeded a fixed limit.',
  concurrency_limit_exceeded: 'The plugin RPC concurrency limit was exceeded.',
  execution_timeout: 'The plugin RPC handler exceeded its execution deadline.',
  handler_failed: 'The plugin RPC handler failed.',
  invalid_handler_output: 'The plugin RPC handler returned invalid output.',
  invalid_event: 'The Host produced an invalid plugin RPC event.',
} satisfies Readonly<Record<PluginRpcDiagnosticCode, string>>);

export interface PluginRpcDiagnostic {
  readonly plugin_id: string;
  readonly method?: HostApiMethod;
  readonly stage: PluginRpcDiagnosticStage;
  readonly code: PluginRpcDiagnosticCode;
  readonly message: string;
}

export type PluginRpcDiagnosticSink = (diagnostic: PluginRpcDiagnostic) => void;

export const reportPluginRpcDiagnostic = (
  sink: PluginRpcDiagnosticSink | undefined,
  input: Omit<PluginRpcDiagnostic, 'message'>,
): void => {
  if (sink === undefined) return;
  const diagnostic = Object.freeze(
    input.method === undefined
      ? {
          plugin_id: input.plugin_id,
          stage: input.stage,
          code: input.code,
          message: DIAGNOSTIC_MESSAGES[input.code],
        }
      : { ...input, message: DIAGNOSTIC_MESSAGES[input.code] },
  );
  try {
    sink(diagnostic);
  } catch {
    // Diagnostics are observational and cannot affect request settlement.
  }
};

export type JsonCostFailure =
  | 'byte_limit_exceeded'
  | 'depth_limit_exceeded'
  | 'node_limit_exceeded'
  | 'cyclic_value'
  | 'non_json_value';

export type JsonCostAnalysis =
  | {
      readonly status: 'valid';
      readonly bytes: number;
      readonly maxDepth: number;
      readonly visitedNodes: number;
    }
  | {
      readonly status: 'invalid';
      readonly failure: JsonCostFailure;
    };

export interface JsonCostLimits {
  readonly maxBytes: number;
  readonly maxDepth: number;
  readonly maxNodes: number;
}

type WorkItem =
  | { readonly kind: 'value'; readonly value: unknown; readonly depth: number }
  | { readonly kind: 'leave'; readonly value: object };

const invalid = (failure: JsonCostFailure): JsonCostAnalysis => Object.freeze({ status: 'invalid', failure });

const isPlainRecord = (value: object): value is Record<string, unknown> => {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const stringJsonByteCost = (value: string): number => {
  let bytes = 2;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (
      code === 0x22 ||
      code === 0x5c ||
      code === 0x08 ||
      code === 0x09 ||
      code === 0x0a ||
      code === 0x0c ||
      code === 0x0d
    ) {
      bytes += 2;
    } else if (code <= 0x1f) {
      bytes += 6;
    } else if (code <= 0x7f) {
      bytes += 1;
    } else if (code <= 0x7ff) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 6;
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      bytes += 6;
    } else {
      bytes += 3;
    }
  }
  return bytes;
};

export const analyzeJsonCompatibleCost = (value: unknown, limits: JsonCostLimits): JsonCostAnalysis => {
  let bytes = 0;
  let maxDepth = 0;
  let visitedNodes = 0;
  const ancestors = new Set<object>();
  const work: WorkItem[] = [{ kind: 'value', value, depth: 0 }];
  const addBytes = (amount: number): boolean => {
    bytes += amount;
    return bytes <= limits.maxBytes;
  };
  const visit = (): boolean => {
    visitedNodes += 1;
    return visitedNodes <= limits.maxNodes;
  };

  try {
    while (work.length > 0) {
      const item = work.pop();
      if (item === undefined) break;
      if (item.kind === 'leave') {
        ancestors.delete(item.value);
        continue;
      }
      if (item.depth > limits.maxDepth) return invalid('depth_limit_exceeded');
      maxDepth = Math.max(maxDepth, item.depth);
      if (!visit()) return invalid('node_limit_exceeded');
      const current = item.value;
      if (current === null) {
        if (!addBytes(4)) return invalid('byte_limit_exceeded');
      } else if (typeof current === 'boolean') {
        if (!addBytes(current ? 4 : 5)) return invalid('byte_limit_exceeded');
      } else if (typeof current === 'number') {
        if (!Number.isFinite(current)) return invalid('non_json_value');
        if (!addBytes(Object.is(current, -0) ? 1 : String(current).length)) return invalid('byte_limit_exceeded');
      } else if (typeof current === 'string') {
        if (!addBytes(stringJsonByteCost(current))) return invalid('byte_limit_exceeded');
      } else if (typeof current !== 'object') {
        return invalid('non_json_value');
      } else {
        if (ancestors.has(current)) return invalid('cyclic_value');
        const array = Array.isArray(current);
        if (!array && !isPlainRecord(current)) return invalid('non_json_value');
        ancestors.add(current);
        work.push({ kind: 'leave', value: current });
        if (array) {
          if (!addBytes(2 + Math.max(0, current.length - 1))) return invalid('byte_limit_exceeded');
          for (let index = current.length - 1; index >= 0; index -= 1) {
            if (!Object.hasOwn(current, index)) return invalid('non_json_value');
            work.push({ kind: 'value', value: current[index], depth: item.depth + 1 });
          }
        } else {
          const keys = Object.keys(current);
          if (!addBytes(2 + Math.max(0, keys.length - 1))) return invalid('byte_limit_exceeded');
          for (let index = keys.length - 1; index >= 0; index -= 1) {
            const key = keys[index];
            if (key === undefined || !visit()) return invalid('node_limit_exceeded');
            if (!addBytes(stringJsonByteCost(key) + 1)) return invalid('byte_limit_exceeded');
            work.push({ kind: 'value', value: current[key], depth: item.depth + 1 });
          }
        }
      }
    }
  } catch {
    return invalid('non_json_value');
  }
  return Object.freeze({ status: 'valid', bytes, maxDepth, visitedNodes });
};

export const analyzePluginRpcFrame = (value: unknown): JsonCostAnalysis =>
  analyzeJsonCompatibleCost(value, {
    maxBytes: PLUGIN_RPC_V1_POLICY.maxFrameBytes,
    maxDepth: PLUGIN_RPC_V1_POLICY.maxFrameDepth,
    maxNodes: PLUGIN_RPC_V1_POLICY.maxVisitedNodes,
  });

export const analyzePluginRpcSemanticPayload = (value: unknown): JsonCostAnalysis =>
  analyzeJsonCompatibleCost(value, {
    maxBytes: PLUGIN_RPC_V1_POLICY.maxFrameBytes,
    maxDepth: PLUGIN_RPC_V1_POLICY.maxSemanticDepth,
    maxNodes: PLUGIN_RPC_V1_POLICY.maxVisitedNodes,
  });
