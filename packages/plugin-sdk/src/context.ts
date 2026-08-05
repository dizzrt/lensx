import { validatePluginRuntimeContext } from '@lensx/plugin-contract';

import { PluginSdkError } from './error.js';
import type { PluginRuntimeContext } from './types.js';

const invalidContext = (): never => {
  throw new PluginSdkError('invalid_runtime_context');
};

export const validateRuntimeContext = (value: unknown): PluginRuntimeContext => {
  const result = validatePluginRuntimeContext(value);
  return result.status === 'valid' ? result.value : invalidContext();
};
