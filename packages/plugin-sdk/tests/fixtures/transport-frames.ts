export const requestId = 'request_0000000000000001';
export const validTransportFrames = Object.freeze([
  Object.freeze({
    contract_version: '0.1.0',
    type: 'lensx.plugin_transport.request',
    request_id: requestId,
    request: Object.freeze({ method: 'ui.close', params: Object.freeze({}) }),
  }),
  Object.freeze({
    contract_version: '0.1.0',
    type: 'lensx.plugin_transport.response',
    request_id: requestId,
    result: Object.freeze({ method: 'ui.close', result: Object.freeze({ accepted: true }) }),
  }),
  Object.freeze({
    contract_version: '0.1.0',
    type: 'lensx.plugin_transport.response',
    request_id: requestId,
    error: Object.freeze({ code: 'unavailable', message: 'The Host API is unavailable.' }),
  }),
  Object.freeze({
    contract_version: '0.1.0',
    type: 'lensx.plugin_transport.event',
    event: Object.freeze({
      event: 'runtime.context_changed',
      payload: Object.freeze({ capabilities: [], hostApiVersion: '0.2.0', locale: 'en-US', theme: 'light' }),
    }),
  }),
  Object.freeze({
    contract_version: '0.1.0',
    type: 'lensx.plugin_transport.cancel',
    request_id: requestId,
  }),
  Object.freeze({ contract_version: '0.1.0', type: 'lensx.plugin_transport.disconnect' }),
]);

export const invalidTransportFrames = Object.freeze([
  Object.freeze({ ...validTransportFrames[0], contract_version: '0.2.0' }),
  Object.freeze({ ...validTransportFrames[0], type: 'lensx.plugin_transport.unknown' }),
  Object.freeze({ ...validTransportFrames[0], plugin_id: 'com.private.plugin' }),
  Object.freeze({ ...validTransportFrames[0], grant: 'clipboard.read' }),
  Object.freeze({ ...validTransportFrames[0], path: '/private/plugin' }),
  Object.freeze({ ...validTransportFrames[0], executor: 'private' }),
  Object.freeze({ ...validTransportFrames[0], request_id: 'request_unbounded' }),
  Object.freeze({ ...validTransportFrames[0], request: { method: 'ui.close', params: {}, identity: 'private' } }),
  Object.freeze({ ...validTransportFrames[1], stack: 'private stack' }),
  Object.freeze({ ...validTransportFrames[2], error: { code: 'transport_failure', message: 'Wrong layer.' } }),
  Object.freeze({ ...validTransportFrames[3], event: { event: 'unknown', payload: {} } }),
  Object.freeze({
    ...validTransportFrames[0],
    request: { method: 'storage.set', params: { key: 'x', value: Number.NaN } },
  }),
]);
