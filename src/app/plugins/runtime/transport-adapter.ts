import type { HostApiError, HostApiRequest, HostApiResult } from '@lensx/plugin-contract';

export interface PluginRuntimeTransportIdentity {
  readonly entry_id: string;
  readonly plugin_id: string;
  readonly version: string;
  readonly page_id: string;
}

export interface PluginRuntimeTransportHandlerInput {
  readonly identity: PluginRuntimeTransportIdentity;
  readonly request: HostApiRequest;
  readonly signal: AbortSignal;
}

const postResponseEffectBrand = Symbol('PluginRuntimeTransportPostResponseEffect');

export interface PluginRuntimeTransportPostResponseOutcome {
  readonly [postResponseEffectBrand]: true;
  readonly response: HostApiResult | HostApiError;
  readonly effect: () => void;
}

export const createPluginRuntimeTransportPostResponseOutcome = (
  response: HostApiResult | HostApiError,
  effect: () => void,
): PluginRuntimeTransportPostResponseOutcome =>
  Object.freeze({ [postResponseEffectBrand]: true as const, response, effect });

const isPostResponseOutcome = (value: unknown): value is PluginRuntimeTransportPostResponseOutcome =>
  typeof value === 'object' && value !== null && postResponseEffectBrand in value;

export interface PreparedPluginRuntimeTransportSettlement {
  readonly response: HostApiResult | HostApiError;
  readonly effect?: () => void;
}

export const preparePluginRuntimeTransportSettlement = (
  output: PluginRuntimeTransportHandlerResult,
): PreparedPluginRuntimeTransportSettlement =>
  Object.freeze(
    isPostResponseOutcome(output) ? { response: output.response, effect: output.effect } : { response: output },
  );

export type PluginRuntimeTransportHandlerResult =
  | HostApiResult
  | HostApiError
  | PluginRuntimeTransportPostResponseOutcome;

export type PluginRuntimeTransportHandler = (
  input: PluginRuntimeTransportHandlerInput,
) => PluginRuntimeTransportHandlerResult | PromiseLike<PluginRuntimeTransportHandlerResult>;

const unavailableError = Object.freeze({
  code: 'unavailable',
  message: 'The Host API is unavailable.',
}) satisfies HostApiError;

export const unavailablePluginRuntimeTransportHandler: PluginRuntimeTransportHandler = () => unavailableError;
