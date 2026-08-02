import { describe, expect, rs, test } from '@rstest/core';
import type { LauncherActionDescriptor } from '../src/app/launcher/actions';
import {
  createTauriLauncherActionCollectionsClient,
  EMPTY_LAUNCHER_ACTION_COLLECTIONS,
  isLauncherActionCollections,
  READ_LAUNCHER_ACTION_COLLECTIONS_COMMAND,
  RECORD_LAUNCHER_ACTION_USE_COMMAND,
  resolveLauncherActionCollection,
  SET_LAUNCHER_ACTION_PINNED_COMMAND,
} from '../src/app/launcher/collections';

const snapshot = (actionId: string, enabled = true): LauncherActionDescriptor => ({
  action_id: actionId,
  owner_id: actionId.split('.').slice(0, -1).join('.'),
  title: { 'en-US': actionId },
  default_keywords: {},
  enabled,
});

describe('launcher action collections desktop client', () => {
  test('validates strict versioned snapshots and safe defaults', () => {
    expect(isLauncherActionCollections(EMPTY_LAUNCHER_ACTION_COLLECTIONS)).toBe(true);
    expect(
      isLauncherActionCollections({
        version: 1,
        recent_action_ids: ['lensx.core.open_settings'],
        pinned_action_ids: [],
      }),
    ).toBe(true);
    expect(
      isLauncherActionCollections({
        version: 1,
        recent_action_ids: ['lensx.core.open_settings', 'lensx.core.open_settings'],
        pinned_action_ids: [],
      }),
    ).toBe(false);
    expect(isLauncherActionCollections({ ...EMPTY_LAUNCHER_ACTION_COLLECTIONS, extra: true })).toBe(false);
  });

  test('invokes typed read, record-use, and pin commands', async () => {
    const confirmed = {
      version: 1 as const,
      recent_action_ids: ['lensx.core.hide_launcher'],
      pinned_action_ids: ['lensx.core.open_settings'],
    };
    const invoke = rs.fn(async () => confirmed);
    const client = createTauriLauncherActionCollectionsClient(invoke);

    await expect(client.read()).resolves.toEqual(confirmed);
    await expect(client.recordUse('lensx.core.hide_launcher')).resolves.toEqual(confirmed);
    await expect(client.setPinned('lensx.core.open_settings', true)).resolves.toEqual(confirmed);
    expect(invoke).toHaveBeenNthCalledWith(1, READ_LAUNCHER_ACTION_COLLECTIONS_COMMAND, undefined);
    expect(invoke).toHaveBeenNthCalledWith(2, RECORD_LAUNCHER_ACTION_USE_COMMAND, {
      actionId: 'lensx.core.hide_launcher',
    });
    expect(invoke).toHaveBeenNthCalledWith(3, SET_LAUNCHER_ACTION_PINNED_COMMAND, {
      actionId: 'lensx.core.open_settings',
      pinned: true,
    });
  });

  test('maps invalid responses and Rust errors to stable safe failures', async () => {
    const invalidClient = createTauriLauncherActionCollectionsClient(async () => ({ version: 2 }));
    await expect(invalidClient.read()).rejects.toMatchObject({
      code: 'invalid_launcher_action_collections_payload',
      operation: 'read',
    });

    const rustErrorClient = createTauriLauncherActionCollectionsClient(async () => {
      throw {
        code: 'launcher_action_collections_capacity_reached',
        operation: 'set_pinned',
        message: 'The pinned action collection is full.',
      };
    });
    await expect(rustErrorClient.setPinned('lensx.core.open_settings', true)).rejects.toMatchObject({
      code: 'launcher_action_collections_capacity_reached',
      operation: 'set_pinned',
    });

    const malformedClient = createTauriLauncherActionCollectionsClient(async () => {
      throw new Error('/secret/path');
    });
    await expect(malformedClient.recordUse('lensx.core.hide_launcher')).rejects.toMatchObject({
      code: 'invalid_launcher_action_collections_error_payload',
      operation: 'record_use',
      message: 'Launcher action collections operation failed.',
    });
  });
});

describe('launcher action collection resolution', () => {
  test('preserves persisted order while filtering missing and disabled actions without filling gaps', () => {
    const descriptors = [
      snapshot('lensx.core.alpha'),
      snapshot('lensx.core.disabled', false),
      snapshot('lensx.core.zulu'),
    ];
    const resolved = resolveLauncherActionCollection(
      ['lensx.core.zulu', 'lensx.core.missing', 'lensx.core.disabled', 'lensx.core.alpha'],
      descriptors,
    );
    expect(resolved.map(({ action_id }) => action_id)).toEqual(['lensx.core.zulu', 'lensx.core.alpha']);
    expect(Object.isFrozen(resolved)).toBe(true);
  });
});
