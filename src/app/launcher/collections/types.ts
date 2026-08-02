import { isValidLauncherActionId } from '../actions';

export const LAUNCHER_ACTION_COLLECTION_LIMIT = 8;
export const LAUNCHER_ACTION_COLLECTIONS_VERSION = 1;

export interface LauncherActionCollections {
  readonly version: typeof LAUNCHER_ACTION_COLLECTIONS_VERSION;
  readonly recent_action_ids: readonly string[];
  readonly pinned_action_ids: readonly string[];
}

export const EMPTY_LAUNCHER_ACTION_COLLECTIONS: LauncherActionCollections = Object.freeze({
  version: LAUNCHER_ACTION_COLLECTIONS_VERSION,
  recent_action_ids: Object.freeze([]),
  pinned_action_ids: Object.freeze([]),
});

const isActionId = (value: unknown): value is string => {
  if (typeof value !== 'string') {
    return false;
  }
  const ownerId = value.split('.').slice(0, -1).join('.');
  return isValidLauncherActionId(value, ownerId);
};

const isActionIdCollection = (value: unknown): value is readonly string[] =>
  Array.isArray(value) &&
  value.length <= LAUNCHER_ACTION_COLLECTION_LIMIT &&
  value.every(isActionId) &&
  new Set(value).size === value.length;

export const isLauncherActionCollections = (value: unknown): value is LauncherActionCollections => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const keys = Object.keys(value);
  if (
    keys.length !== 3 ||
    !keys.includes('version') ||
    !keys.includes('recent_action_ids') ||
    !keys.includes('pinned_action_ids')
  ) {
    return false;
  }
  const collections = value as Partial<Record<keyof LauncherActionCollections, unknown>>;
  return (
    collections.version === LAUNCHER_ACTION_COLLECTIONS_VERSION &&
    isActionIdCollection(collections.recent_action_ids) &&
    isActionIdCollection(collections.pinned_action_ids)
  );
};

export const cloneLauncherActionCollections = (collections: LauncherActionCollections): LauncherActionCollections =>
  Object.freeze({
    version: LAUNCHER_ACTION_COLLECTIONS_VERSION,
    recent_action_ids: Object.freeze([...collections.recent_action_ids]),
    pinned_action_ids: Object.freeze([...collections.pinned_action_ids]),
  });

export type LauncherActionCollectionsOperation = 'read' | 'record_use' | 'set_pinned';

export type LauncherActionCollectionsErrorCode =
  | 'invalid_launcher_action_collections_error_payload'
  | 'invalid_launcher_action_collections_payload'
  | 'launcher_action_collections_capacity_reached'
  | 'launcher_action_collections_invalid'
  | 'launcher_action_collections_read_failed'
  | 'launcher_action_collections_write_failed';

export interface LauncherActionCollectionsErrorPayload {
  readonly code: LauncherActionCollectionsErrorCode;
  readonly operation: LauncherActionCollectionsOperation;
  readonly message: string;
}

export class LauncherActionCollectionsError extends Error {
  readonly code: LauncherActionCollectionsErrorCode;
  readonly operation: LauncherActionCollectionsOperation;

  constructor(payload: LauncherActionCollectionsErrorPayload) {
    super(payload.message);
    this.name = 'LauncherActionCollectionsError';
    this.code = payload.code;
    this.operation = payload.operation;
  }
}

export interface LauncherActionCollectionsClient {
  read: () => Promise<LauncherActionCollections>;
  recordUse: (actionId: string) => Promise<LauncherActionCollections>;
  setPinned: (actionId: string, pinned: boolean) => Promise<LauncherActionCollections>;
}
