import {
  type CancelPluginReplacementRequest,
  type CommitPluginReplacementRequest,
  PLUGIN_REPLACEMENT_CONTRACT_VERSION,
  type PluginReplacementClassification,
  type PluginReplacementErrorCode,
  type PluginReplacementErrorPayload,
  type PluginReplacementOperation,
  type PluginReplacementResult,
  type PreparePluginReplacementRequest,
} from './types';

const ENTRY_ID_PATTERN = /^entry_[0-9a-f]{16}$/u;
const PLUGIN_ID_PATTERN = /^(?:[a-z][a-z0-9_-]{0,63}\.)+[a-z][a-z0-9_-]{0,63}$/u;
const REVISION_PATTERN = /^(?:0|[1-9][0-9]*)$/u;
const SEMVER_PATTERN =
  /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;
const TOKEN_PATTERN = /^[0-9A-Za-z_-]{32,128}$/u;
const CLASSIFICATIONS = new Set<PluginReplacementClassification>(['upgrade', 'downgrade', 'reinstall']);
const OPERATIONS = new Set<PluginReplacementOperation>([
  'prepare',
  'select',
  'read',
  'inspect',
  'extract',
  'commit',
  'register',
  'cleanup',
  'cancel',
]);
const ERROR_MESSAGES: Readonly<Record<PluginReplacementErrorCode, string>> = Object.freeze({
  invalid_request: 'The plugin replacement request is invalid.',
  invalid_package: 'The selected file is not a valid lensX plugin package.',
  incompatible: 'The selected plugin is not compatible with this version of lensX.',
  identity_mismatch: 'The selected package does not match the target plugin identity.',
  identity_quarantined: 'A quarantined plugin identity cannot be replaced.',
  unsafe_state: 'Plugin replacement cannot continue from the current storage state.',
  stale_revision: 'The plugin registration revision is stale.',
  invalid_preparation: 'The plugin replacement preparation is invalid or expired.',
  busy: 'Another plugin operation is in progress.',
  unavailable: 'Plugin replacement is unavailable.',
  source_read_failed: 'The selected plugin package could not be read.',
  extraction_failed: 'The plugin package could not be extracted safely.',
  commit_failed: 'The plugin replacement could not be committed.',
  registration_failed: 'The plugin registration could not be replaced.',
  internal: 'Plugin replacement failed.',
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const exact = (value: unknown, keys: readonly string[]) => {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== keys.length ||
    !keys.every((key) => Object.hasOwn(value, key))
  ) {
    throw new TypeError('Plugin replacement payload has an invalid field set.');
  }
  return value;
};

const freeze = <T>(value: T): T => {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
  return Object.freeze(value);
};

const version = (value: unknown) => {
  if (value !== PLUGIN_REPLACEMENT_CONTRACT_VERSION) throw new TypeError('Unsupported contract version.');
  return value;
};
const entry = (value: unknown) => {
  if (typeof value !== 'string' || !ENTRY_ID_PATTERN.test(value)) throw new TypeError('Invalid entry identity.');
  return value;
};
const revision = (value: unknown) => {
  if (typeof value !== 'string' || !REVISION_PATTERN.test(value)) throw new TypeError('Invalid revision.');
  return value;
};
const semver = (value: unknown) => {
  if (typeof value !== 'string' || !SEMVER_PATTERN.test(value)) throw new TypeError('Invalid version.');
  return value;
};
const classification = (value: unknown) => {
  if (typeof value !== 'string' || !CLASSIFICATIONS.has(value as PluginReplacementClassification))
    throw new TypeError('Invalid classification.');
  return value as PluginReplacementClassification;
};
export const parsePreparePluginReplacementRequest = (value: unknown): PreparePluginReplacementRequest => {
  const item = exact(value, ['contract_version', 'entry_id', 'expected_revision']);
  return freeze({
    contract_version: version(item.contract_version),
    entry_id: entry(item.entry_id),
    expected_revision: revision(item.expected_revision),
  });
};

export const parseCommitPluginReplacementRequest = (value: unknown): CommitPluginReplacementRequest => {
  const item = exact(value, ['contract_version', 'preparation_token', 'entry_id', 'expected_revision']);
  if (typeof item.preparation_token !== 'string' || !TOKEN_PATTERN.test(item.preparation_token))
    throw new TypeError('Invalid preparation token.');
  return freeze({
    contract_version: version(item.contract_version),
    preparation_token: item.preparation_token,
    entry_id: entry(item.entry_id),
    expected_revision: revision(item.expected_revision),
  });
};

export const parseCancelPluginReplacementRequest = (value: unknown): CancelPluginReplacementRequest => {
  const item = exact(value, ['contract_version', 'preparation_token']);
  if (typeof item.preparation_token !== 'string' || !TOKEN_PATTERN.test(item.preparation_token))
    throw new TypeError('Invalid preparation token.');
  return freeze({ contract_version: version(item.contract_version), preparation_token: item.preparation_token });
};

export const parsePluginReplacementResult = (value: unknown): PluginReplacementResult => {
  if (!isRecord(value)) throw new TypeError('Plugin replacement result is invalid.');
  if (value.status === 'cancelled') {
    const item = exact(value, ['status', 'contract_version']);
    return freeze({ status: 'cancelled', contract_version: version(item.contract_version) });
  }
  if (value.status === 'duplicate') {
    const item = exact(value, ['status', 'contract_version', 'entry_id', 'current_version', 'candidate_version']);
    return freeze({
      status: 'duplicate',
      contract_version: version(item.contract_version),
      entry_id: entry(item.entry_id),
      current_version: semver(item.current_version),
      candidate_version: semver(item.candidate_version),
    });
  }
  if (value.status === 'prepared') {
    const item = exact(value, [
      'status',
      'contract_version',
      'preparation_token',
      'entry_id',
      'current_version',
      'candidate_version',
      'classification',
    ]);
    if (typeof item.preparation_token !== 'string' || !TOKEN_PATTERN.test(item.preparation_token))
      throw new TypeError('Invalid preparation token.');
    return freeze({
      status: 'prepared',
      contract_version: version(item.contract_version),
      preparation_token: item.preparation_token,
      entry_id: entry(item.entry_id),
      current_version: semver(item.current_version),
      candidate_version: semver(item.candidate_version),
      classification: classification(item.classification),
    });
  }
  if (value.status === 'committed') {
    const item = exact(value, [
      'status',
      'contract_version',
      'entry_id',
      'plugin_id',
      'version',
      'classification',
      'revision',
      'cleanup',
    ]);
    if (
      typeof item.plugin_id !== 'string' ||
      !PLUGIN_ID_PATTERN.test(item.plugin_id) ||
      (item.cleanup !== 'complete' && item.cleanup !== 'pending')
    )
      throw new TypeError('Invalid committed result.');
    return freeze({
      status: 'committed',
      contract_version: version(item.contract_version),
      entry_id: entry(item.entry_id),
      plugin_id: item.plugin_id,
      version: semver(item.version),
      classification: classification(item.classification),
      revision: revision(item.revision),
      cleanup: item.cleanup,
    });
  }
  throw new TypeError('Unknown plugin replacement result.');
};

export const parsePluginReplacementError = (value: unknown): PluginReplacementErrorPayload => {
  const item = exact(value, ['contract_version', 'code', 'operation', 'message']);
  if (
    typeof item.code !== 'string' ||
    !(item.code in ERROR_MESSAGES) ||
    typeof item.operation !== 'string' ||
    !OPERATIONS.has(item.operation as PluginReplacementOperation) ||
    item.message !== ERROR_MESSAGES[item.code as PluginReplacementErrorCode]
  )
    throw new TypeError('Invalid plugin replacement error.');
  return freeze({
    contract_version: version(item.contract_version),
    code: item.code as PluginReplacementErrorCode,
    operation: item.operation as PluginReplacementOperation,
    message: item.message,
  });
};
