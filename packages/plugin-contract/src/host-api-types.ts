import type {
  HostApiErrorCodeInput,
  HostApiErrorInput,
  HostApiEventInput,
  HostApiEventNameInput,
  HostApiMethodInput,
  HostApiRequestInput,
  HostApiResultInput,
  PluginRuntimeContextInput,
} from './generated/plugin-host-api-input.js';

export type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export type HostApiMethod = HostApiMethodInput;
export type HostApiEventName = HostApiEventNameInput;
export type HostApiErrorCode = HostApiErrorCodeInput;
export type PluginRuntimeLocale = PluginRuntimeContextInput['locale'];
export type PluginRuntimeTheme = PluginRuntimeContextInput['theme'];

type DeepReadonly<Value> = Value extends (...arguments_: never[]) => unknown
  ? Value
  : Value extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : Value extends object
      ? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> }
      : Value;

export type PluginRuntimeContext = DeepReadonly<PluginRuntimeContextInput>;
export type HostApiRequest = DeepReadonly<HostApiRequestInput>;
export type HostApiResult = DeepReadonly<HostApiResultInput>;
export type HostApiEvent = DeepReadonly<HostApiEventInput>;
export type HostApiError = DeepReadonly<HostApiErrorInput>;

export interface HostApiValidationDiagnostic {
  readonly code:
    | 'additional_property'
    | 'duplicate_value'
    | 'invalid_shape'
    | 'invalid_type'
    | 'invalid_value'
    | 'method_not_found'
    | 'required'
    | 'unsorted_value';
  readonly path: string;
  readonly message: string;
}

export interface InvalidHostApiValidationResult {
  readonly status: 'invalid';
  readonly diagnostics: readonly HostApiValidationDiagnostic[];
}

export interface ValidHostApiValidationResult<Value> {
  readonly status: 'valid';
  readonly value: Value;
  readonly diagnostics: readonly [];
}

export type HostApiValidationResult<Value> = InvalidHostApiValidationResult | ValidHostApiValidationResult<Value>;

export interface HostApiMethodCatalogEntry {
  readonly method: HostApiMethod;
  readonly paramsSchema: string;
  readonly resultSchema: string;
  readonly deprecated: false;
}

export type {
  HostApiErrorInput,
  HostApiEventInput,
  HostApiRequestInput,
  HostApiResultInput,
  PluginRuntimeContextInput,
};
