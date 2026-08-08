import { PLUGIN_RPC_V1_POLICY } from '../../src/app/plugins/runtime/rpc-validation';

export const rpcRequest = (sequence: number, method = 'ui.close', params: unknown = {}) => ({
  contract_version: '0.1.0',
  type: 'lensx.plugin_transport.request',
  request_id: `request_${sequence.toString(16).padStart(16, '0')}`,
  request: { method, params },
});

export const nestedValue = (depth: number): unknown => {
  let value: unknown = null;
  for (let index = 0; index < depth; index += 1) value = [value];
  return value;
};

export const exactFrameCostString = 'a'.repeat(PLUGIN_RPC_V1_POLICY.maxFrameBytes - 2);
export const maximumContractStorageText = 'x'.repeat(1_048_576);

export const validPluginRpcFixtures = Object.freeze([
  rpcRequest(1),
  rpcRequest(2, 'storage.set', { key: 'large-value', value: maximumContractStorageText }),
  rpcRequest(3, 'storage.set', { key: 'nested', value: nestedValue(PLUGIN_RPC_V1_POLICY.maxSemanticDepth) }),
  rpcRequest(4, 'storage.set', {
    key: 'many-values',
    value: Object.fromEntries(Array.from({ length: 256 }, (_, index) => [`key-${index}`, [index, `${index}`]])),
  }),
]);

const cycle: { self?: unknown } = {};
cycle.self = cycle;

export const maliciousPluginRpcFixtures = Object.freeze({
  batch: [rpcRequest(1), rpcRequest(2)],
  cycle,
  deep: rpcRequest(5, 'storage.set', {
    key: 'deep',
    value: nestedValue(PLUGIN_RPC_V1_POLICY.maxSemanticDepth + 1),
  }),
  nonFinite: rpcRequest(6, 'storage.set', { key: 'nan', value: Number.NaN }),
  nonJson: rpcRequest(7, 'storage.set', { key: 'undefined', value: undefined }),
  nonPlain: rpcRequest(8, 'storage.set', { key: 'date', value: new Date(0) }),
  tooManyNodes: Array.from({ length: PLUGIN_RPC_V1_POLICY.maxVisitedNodes }, () => null),
});
