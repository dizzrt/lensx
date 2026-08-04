import {
  PLUGIN_RESOURCE_CONTRACT_VERSION,
  type PluginResourceEntry,
  type PluginResourceErrorCode,
  type PluginResourceErrorPayload,
  type ResolvePluginResourceEntryRequest,
} from './types';

const ENTRY_ID_PATTERN = /^entry_[0-9a-f]{16}$/u;
const PLUGIN_ID_PATTERN = /^(?:[a-z][a-z0-9_-]{0,63}\.)+[a-z][a-z0-9_-]{0,63}$/u;
const REVISION_PATTERN = /^(?:0|[1-9][0-9]*)$/u;
const SEMVER_PATTERN =
  /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;
const SCOPE_PATTERN = /^[0-9a-f]{32}$/u;
const PLUGIN_KEY_PATTERN = /^v1-[0-9a-f]+$/u;
const RESOURCE_SEGMENT_PATTERN = /^[0-9A-Za-z](?:[0-9A-Za-z._-]*[0-9A-Za-z])?$/u;

const ERROR_MESSAGES: Readonly<Record<PluginResourceErrorCode, string>> = Object.freeze({
  invalid_request: 'Plugin resource request is invalid.',
  stale_revision: 'Plugin registration revision is stale.',
  not_found: 'Plugin resource entry was not found.',
  unavailable: 'Plugin resource entry is unavailable.',
  unsafe_state: 'Plugin resource storage state is unsafe.',
  internal: 'Plugin resource resolution failed.',
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const exact = (value: unknown, keys: readonly string[]) => {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== keys.length ||
    !keys.every((key) => Object.hasOwn(value, key))
  ) {
    throw new TypeError('Plugin resource payload has an invalid field set.');
  }
  return value;
};

const freeze = <T>(value: T): T => {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
  return Object.freeze(value);
};

const contractVersion = (value: unknown) => {
  if (value !== PLUGIN_RESOURCE_CONTRACT_VERSION) throw new TypeError('Unsupported plugin resource contract.');
  return value;
};

const entryId = (value: unknown) => {
  if (typeof value !== 'string' || !ENTRY_ID_PATTERN.test(value)) throw new TypeError('Invalid resource entry ID.');
  return value;
};

const revision = (value: unknown) => {
  if (typeof value !== 'string' || !REVISION_PATTERN.test(value)) throw new TypeError('Invalid resource revision.');
  return value;
};

const pluginRecordKey = (pluginId: string) =>
  `v1-${[...new TextEncoder().encode(pluginId)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;

const entryUrl = (value: unknown, pluginId: string, expectedVersion: string) => {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 2048 ||
    !/^[\x20-\x7e]+$/u.test(value) ||
    /[%\\\0]/u.test(value)
  ) {
    throw new TypeError('Invalid plugin resource entry URL.');
  }
  const authorityMatch = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]+)/u.exec(value);
  if (!authorityMatch || /[@:A-Z]/u.test(authorityMatch[2])) {
    throw new TypeError('Invalid plugin resource entry URL.');
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError('Invalid plugin resource entry URL.');
  }
  const nativeMatch = /^([0-9a-f]{32})\.runtime\.localhost$/u.exec(parsed.hostname);
  const translatedMatch = /^lensx-plugin\.([0-9a-f]{32})\.runtime\.localhost$/u.exec(parsed.hostname);
  const nativeOrigin = parsed.protocol === 'lensx-plugin:' && nativeMatch !== null;
  const translatedOrigin = (parsed.protocol === 'http:' || parsed.protocol === 'https:') && translatedMatch !== null;
  const originScope = nativeMatch?.[1] ?? translatedMatch?.[1];
  const pathParts = parsed.pathname.startsWith('/') ? parsed.pathname.slice(1).split('/') : [];
  const [resourceVersion, pathScope, pluginKey, version, ...resourceSegments] = pathParts;
  const resourcePath = resourceSegments.join('/');
  if (
    (!nativeOrigin && !translatedOrigin) ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.port !== '' ||
    parsed.search !== '' ||
    parsed.hash !== '' ||
    resourceVersion !== 'v1' ||
    originScope === undefined ||
    pathScope !== originScope ||
    !SCOPE_PATTERN.test(pathScope) ||
    !PLUGIN_KEY_PATTERN.test(pluginKey ?? '') ||
    pluginKey !== pluginRecordKey(pluginId) ||
    !SEMVER_PATTERN.test(version ?? '') ||
    version !== expectedVersion ||
    resourcePath.length === 0 ||
    resourcePath.length > 100 ||
    resourceSegments.length > 16 ||
    resourceSegments.some(
      (segment) => !RESOURCE_SEGMENT_PATTERN.test(segment) || segment === '.' || segment === '..',
    ) ||
    /^(?:manifest|checksums)\.json$/iu.test(resourcePath)
  ) {
    throw new TypeError('Invalid plugin resource entry URL.');
  }
  return value;
};

export const parseResolvePluginResourceEntryRequest = (value: unknown): ResolvePluginResourceEntryRequest => {
  const item = exact(value, ['contract_version', 'entry_id', 'expected_revision']);
  return freeze({
    contract_version: contractVersion(item.contract_version),
    entry_id: entryId(item.entry_id),
    expected_revision: revision(item.expected_revision),
  });
};

export const parsePluginResourceEntry = (value: unknown): PluginResourceEntry => {
  const item = exact(value, ['contract_version', 'entry_id', 'revision', 'plugin_id', 'version', 'entry_url']);
  if (
    typeof item.plugin_id !== 'string' ||
    !PLUGIN_ID_PATTERN.test(item.plugin_id) ||
    item.plugin_id.length > 255 ||
    typeof item.version !== 'string' ||
    !SEMVER_PATTERN.test(item.version)
  ) {
    throw new TypeError('Invalid plugin resource identity.');
  }
  return freeze({
    contract_version: contractVersion(item.contract_version),
    entry_id: entryId(item.entry_id),
    revision: revision(item.revision),
    plugin_id: item.plugin_id,
    version: item.version,
    entry_url: entryUrl(item.entry_url, item.plugin_id, item.version),
  });
};

export const parsePluginResourceError = (value: unknown): PluginResourceErrorPayload => {
  const item = exact(value, ['contract_version', 'code', 'operation', 'message']);
  if (
    typeof item.code !== 'string' ||
    !(item.code in ERROR_MESSAGES) ||
    item.operation !== 'resolve_entry' ||
    item.message !== ERROR_MESSAGES[item.code as PluginResourceErrorCode]
  ) {
    throw new TypeError('Invalid plugin resource error.');
  }
  return freeze({
    contract_version: contractVersion(item.contract_version),
    code: item.code as PluginResourceErrorCode,
    operation: 'resolve_entry',
    message: item.message,
  });
};
