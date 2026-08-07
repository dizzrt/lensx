import type { ErrorObject, ValidateFunction } from 'ajv';

import hostApiSchema from '../schema/host-api.schema.json' with { type: 'json' };
import { validators as generatedHostApiValidators } from './generated/plugin-host-api-validators.js';
import type {
  HostApiError,
  HostApiEvent,
  HostApiMethod,
  HostApiMethodCatalogEntry,
  HostApiPermission,
  HostApiPermissionCatalogEntry,
  HostApiRequest,
  HostApiResult,
  HostApiValidationDiagnostic,
  HostApiValidationResult,
  PluginRuntimeContext,
} from './host-api-types.js';

const methodFacts = [
  ['actions.open', null, 'ActionsOpenRequest', 'ActionsOpenResult'],
  ['clipboard.read', 'clipboard.read', 'ClipboardReadRequest', 'ClipboardReadResult'],
  ['clipboard.write', 'clipboard.write', 'ClipboardWriteRequest', 'ClipboardWriteResult'],
  ['runtime.get_context', null, 'RuntimeGetContextRequest', 'RuntimeGetContextResult'],
  ['storage.delete', null, 'StorageDeleteRequest', 'StorageDeleteResult'],
  ['storage.get', null, 'StorageGetRequest', 'StorageGetResult'],
  ['storage.get_quota', null, 'StorageGetQuotaRequest', 'StorageGetQuotaResult'],
  ['storage.list', null, 'StorageListRequest', 'StorageListResult'],
  ['storage.set', null, 'StorageSetRequest', 'StorageSetResult'],
  ['ui.close', null, 'UiCloseRequest', 'UiCloseResult'],
] as const;

const deepFreeze = <Value>(value: Value): Value => {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
};

/** Closed Host API 0.1.0 semantic catalog; entries do not imply Runtime availability. */
export const HOST_API_METHOD_CATALOG: readonly HostApiMethodCatalogEntry[] = deepFreeze(
  methodFacts.map(([method, permission, params, result]) => ({
    deprecated: false,
    method,
    paramsSchema: `${hostApiSchema.$id}#/$defs/${params}`,
    permission,
    resultSchema: `${hostApiSchema.$id}#/$defs/${result}`,
  })),
);

/** Static permission requirements; authorization is enforced by a later Host boundary. */
export const HOST_API_PERMISSION_CATALOG: readonly HostApiPermissionCatalogEntry[] = deepFreeze([
  { deprecated: false, permission: 'clipboard.read' },
  { deprecated: false, permission: 'clipboard.write' },
]);

const methodSet = new Set<HostApiMethod>(HOST_API_METHOD_CATALOG.map(({ method }) => method));
const permissionSet = new Set<HostApiPermission>(HOST_API_PERMISSION_CATALOG.map(({ permission }) => permission));
const schemaValidator = (definition: string): ValidateFunction =>
  generatedHostApiValidators[definition as keyof typeof generatedHostApiValidators] as unknown as ValidateFunction;
const requestValidators = new Map<HostApiMethod, ValidateFunction>(
  methodFacts.map(([method, , request]) => [method, schemaValidator(request)]),
);
const resultValidators = new Map<HostApiMethod, ValidateFunction>(
  methodFacts.map(([method, , , result]) => [method, schemaValidator(result)]),
);
const contextValidator = schemaValidator('PluginRuntimeContextInput');
const eventValidator = schemaValidator('HostApiEventInput');
const errorValidator = schemaValidator('HostApiErrorInput');

const escapePointer = (value: string): string => value.replaceAll('~', '~0').replaceAll('/', '~1');
const diagnosticCode = (error: ErrorObject): HostApiValidationDiagnostic['code'] => {
  if (error.keyword === 'additionalProperties') return 'additional_property';
  if (error.keyword === 'required') return 'required';
  if (error.keyword === 'uniqueItems') return 'duplicate_value';
  if (error.keyword === 'type') return 'invalid_type';
  if (error.keyword === 'oneOf' || error.keyword === 'anyOf') return 'invalid_shape';
  return 'invalid_value';
};
const diagnosticsFromErrors = (
  errors: readonly ErrorObject[] | null | undefined,
): readonly HostApiValidationDiagnostic[] => {
  const diagnostics = (errors ?? []).map((error) => {
    const property =
      error.keyword === 'additionalProperties' && typeof error.params.additionalProperty === 'string'
        ? `/${escapePointer(error.params.additionalProperty)}`
        : error.keyword === 'required' && typeof error.params.missingProperty === 'string'
          ? `/${escapePointer(error.params.missingProperty)}`
          : '';
    return {
      code: diagnosticCode(error),
      path: `${error.instancePath}${property}`,
      message: 'The Host API semantic value is invalid.',
    } satisfies HostApiValidationDiagnostic;
  });
  const unique = new Map(diagnostics.map((item) => [`${item.path}\0${item.code}`, item]));
  return deepFreeze(
    [...unique.values()]
      .sort((left, right) => left.path.localeCompare(right.path) || left.code.localeCompare(right.code))
      .slice(0, 16),
  );
};

const invalid = (diagnostics: readonly HostApiValidationDiagnostic[]): HostApiValidationResult<never> =>
  deepFreeze({ status: 'invalid', diagnostics });
const valid = <Value>(value: Value): HostApiValidationResult<Value> =>
  deepFreeze({ status: 'valid', value, diagnostics: [] as const });

const isJsonValue = (value: unknown, ancestors = new Set<object>()): boolean => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object') return false;
  if (ancestors.has(value)) return false;
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  ) {
    return false;
  }
  ancestors.add(value);
  const children = Array.isArray(value) ? value : Object.values(value);
  const compatible = children.every((child) => isJsonValue(child, ancestors));
  ancestors.delete(value);
  return compatible;
};

const cloneJson = <Value>(value: Value): Value => {
  if (Array.isArray(value)) return value.map((item) => cloneJson(item)) as Value;
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneJson(item)])) as Value;
  }
  return value;
};

const validateWith = <Value>(input: unknown, validator: ValidateFunction): HostApiValidationResult<Value> => {
  if (!isJsonValue(input)) {
    return invalid([
      { code: 'invalid_type', path: '', message: 'The Host API semantic value must be JSON-compatible.' },
    ]);
  }
  if (!validator(input)) return invalid(diagnosticsFromErrors(validator.errors));
  return valid(deepFreeze(cloneJson(input)) as Value);
};

const methodFrom = (input: unknown): HostApiMethod | undefined => {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const method = (input as Record<string, unknown>).method;
  return typeof method === 'string' && methodSet.has(method as HostApiMethod) ? (method as HostApiMethod) : undefined;
};

const validatePaired = <Value>(
  input: unknown,
  validators: ReadonlyMap<HostApiMethod, ValidateFunction>,
): HostApiValidationResult<Value> => {
  const method = methodFrom(input);
  if (method === undefined) {
    return invalid([{ code: 'method_not_found', path: '/method', message: 'The Host API method is not declared.' }]);
  }
  const validator = validators.get(method);
  return validator === undefined
    ? invalid([{ code: 'method_not_found', path: '/method', message: 'The Host API method is not declared.' }])
    : validateWith<Value>(input, validator);
};

const sortedArrayDiagnostic = (values: readonly string[], path: string): HostApiValidationDiagnostic | undefined => {
  const compareCodePoints = (left: string, right: string) => {
    const leftPoints = Array.from(left, (point) => point.codePointAt(0) ?? 0);
    const rightPoints = Array.from(right, (point) => point.codePointAt(0) ?? 0);
    for (let index = 0; index < Math.min(leftPoints.length, rightPoints.length); index += 1) {
      const difference = (leftPoints[index] ?? 0) - (rightPoints[index] ?? 0);
      if (difference !== 0) return difference;
    }
    return leftPoints.length - rightPoints.length;
  };
  for (let index = 1; index < values.length; index += 1) {
    if (compareCodePoints(values[index - 1] ?? '', values[index] ?? '') >= 0) {
      return {
        code: 'unsorted_value',
        path: `${path}/${index}`,
        message: 'The Host API list must be sorted and unique.',
      };
    }
  }
  return undefined;
};

export const validateHostApiMethod = (input: unknown): HostApiValidationResult<HostApiMethod> =>
  typeof input === 'string' && methodSet.has(input as HostApiMethod)
    ? valid(input as HostApiMethod)
    : invalid([{ code: 'method_not_found', path: '', message: 'The Host API method is not declared.' }]);

export const validateHostApiPermission = (input: unknown): HostApiValidationResult<HostApiPermission> =>
  typeof input === 'string' && permissionSet.has(input as HostApiPermission)
    ? valid(input as HostApiPermission)
    : invalid([{ code: 'invalid_value', path: '', message: 'The Host API permission is not declared.' }]);

/** Validates and freezes a current-callability snapshot without creating grants or a transport. */
export const validatePluginRuntimeContext = (input: unknown): HostApiValidationResult<PluginRuntimeContext> => {
  const result = validateWith<PluginRuntimeContext>(input, contextValidator);
  if (result.status === 'invalid') return result;
  const diagnostic = sortedArrayDiagnostic(result.value.capabilities, '/capabilities');
  return diagnostic === undefined ? result : invalid([diagnostic]);
};

export const validateHostApiRequest = (input: unknown): HostApiValidationResult<HostApiRequest> =>
  validatePaired(input, requestValidators);

export const validateHostApiResult = (input: unknown): HostApiValidationResult<HostApiResult> => {
  const result = validatePaired<HostApiResult>(input, resultValidators);
  if (result.status === 'invalid') return result;
  const values = result.value.method === 'storage.list' ? result.value.result.keys : undefined;
  const diagnostic = values === undefined ? undefined : sortedArrayDiagnostic(values, '/result/keys');
  return diagnostic === undefined ? result : invalid([diagnostic]);
};

export const validateHostApiEvent = (input: unknown): HostApiValidationResult<HostApiEvent> => {
  const result = validateWith<HostApiEvent>(input, eventValidator);
  if (result.status === 'invalid') return result;
  const context = validatePluginRuntimeContext(result.value.payload);
  return context.status === 'invalid'
    ? invalid(context.diagnostics.map((item) => ({ ...item, path: `/payload${item.path}` })))
    : result;
};

export const validateHostApiError = (input: unknown): HostApiValidationResult<HostApiError> =>
  validateWith(input, errorValidator);
