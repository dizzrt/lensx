import type { PluginCliDiagnostic, PluginCliMessageKey } from './types.js';

const SAFE_PATH = /^\/(?:[A-Za-z0-9_.~-]|~[01]|\/)*$|^(?:[A-Za-z0-9_@.-]+\/)*[A-Za-z0-9_@.-]+$/u;
const SECRET_NAME = /(?:token|secret|password|credential|nonce|grant|authorization|cookie|key)/iu;
const UNSAFE_VALUE = /(?:\n|\r|\bat\s+.+:\d+:\d+|-----BEGIN|[A-Za-z]:\\|\/(?:Users|home|private|tmp)\/)/u;
const HOST_ABSOLUTE_PATH = /^\/(?:Applications|Users|etc|home|opt|private|tmp|var)\//u;

export const safeDiagnosticPath = (path: string): string => {
  const normalized = path.replaceAll('\\', '/');
  if (HOST_ABSOLUTE_PATH.test(normalized) || /^[A-Za-z]:\//u.test(normalized) || !SAFE_PATH.test(normalized)) {
    return '/input';
  }
  return normalized;
};

const safeArguments = (
  values: Readonly<Record<string, string | number | boolean>>,
): Readonly<Record<string, string | number | boolean>> =>
  Object.fromEntries(
    Object.entries(values)
      .filter(([name, value]) => !SECRET_NAME.test(name) && !UNSAFE_VALUE.test(String(value)))
      .sort(([left], [right]) => left.localeCompare(right)),
  );

export const cliDiagnostic = (
  code: string,
  path: string,
  messageKey: PluginCliMessageKey,
  arguments_: Readonly<Record<string, string | number | boolean>> = {},
): PluginCliDiagnostic => ({
  code,
  path: safeDiagnosticPath(path),
  message_key: messageKey,
  arguments: safeArguments(arguments_),
});

const diagnosticKey = (item: PluginCliDiagnostic): string =>
  `${item.code}\0${item.path}\0${JSON.stringify(item.arguments)}`;

export const sortAndDedupeDiagnostics = (
  diagnostics: readonly PluginCliDiagnostic[],
): readonly PluginCliDiagnostic[] => {
  const unique = new Map(diagnostics.map((item) => [diagnosticKey(item), item]));
  return [...unique.values()].sort((left, right) => diagnosticKey(left).localeCompare(diagnosticKey(right)));
};

export const diagnosticFromUnknownError = (error: unknown): PluginCliDiagnostic => {
  const code =
    typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
      ? error.code
      : 'CLI_OPERATION_FAILED';
  return cliDiagnostic(code, '/operation', 'operation_failed');
};
