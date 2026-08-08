import { describe, expect, rs, test } from '@rstest/core';
import validCases from '../fixtures/plugin-registration-contract/valid/cases.json';
import {
  createPluginRegistrationDesktopAdapter,
  PLUGIN_REGISTRATION_CHANGED_EVENT,
  type PluginRegistrationInvoke,
  type PluginRegistrationListen,
  type PluginRegistrationQueryError,
  READ_PLUGIN_REGISTRATION_DETAIL_COMMAND,
  READ_PLUGIN_REGISTRATION_SNAPSHOT_COMMAND,
} from '../src/app/plugins/registration';

const validByName = new Map(validCases.map((fixture) => [fixture.name, fixture.value]));

const snapshot = (revision: string) => {
  const value = structuredClone(validByName.get('empty_snapshot')) as Record<string, unknown>;
  value.revision = revision;
  return value;
};

const detail = (revision: string) => {
  const value = structuredClone(validByName.get('healthy_detail')) as Record<string, unknown>;
  value.revision = revision;
  return value;
};

const event = (revision: string) => ({ contract_version: '0.3.0', revision });

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
};

const tick = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

const createControlledListen = () => {
  let listener: ((event: { readonly payload: unknown }) => void) | undefined;
  const unlisten = rs.fn();
  const listen: PluginRegistrationListen = rs.fn(async (eventName, nextListener) => {
    expect(eventName).toBe(PLUGIN_REGISTRATION_CHANGED_EVENT);
    listener = nextListener;
    return unlisten;
  });
  return {
    emit(payload: unknown) {
      expect(listener).toBeDefined();
      listener?.({ payload });
    },
    listen,
    unlisten,
  };
};

describe('Plugin Registration desktop adapter', () => {
  test('subscribes before the first read and closes the initialization race', async () => {
    const controlled = createControlledListen();
    const first = deferred<unknown>();
    let reads = 0;
    const invoke = rs.fn(async () => {
      reads += 1;
      expect(controlled.listen).toHaveBeenCalledTimes(1);
      return reads === 1 ? first.promise : snapshot('1');
    }) as PluginRegistrationInvoke;
    const adapter = createPluginRegistrationDesktopAdapter({ invoke, listen: controlled.listen });

    const initialization = adapter.initialize();
    await tick();
    controlled.emit(event('1'));
    first.resolve(snapshot('0'));

    await expect(initialization).resolves.toMatchObject({ revision: '1' });
    expect(invoke).toHaveBeenCalledTimes(2);
    await adapter.destroy();
  });

  test('coalesces rapid events into one serial refresh', async () => {
    const controlled = createControlledListen();
    const refresh = deferred<unknown>();
    let reads = 0;
    const invoke: PluginRegistrationInvoke = rs.fn(async () => {
      reads += 1;
      return reads === 1 ? snapshot('0') : refresh.promise;
    });
    const adapter = createPluginRegistrationDesktopAdapter({ invoke, listen: controlled.listen });
    await adapter.initialize();

    controlled.emit(event('1'));
    controlled.emit(event('2'));
    controlled.emit(event('3'));
    await tick();
    expect(reads).toBe(2);
    refresh.resolve(snapshot('3'));
    await tick();

    expect(reads).toBe(2);
    await adapter.destroy();
  });

  test('recovers missed events on Launcher activation and listener recovery', async () => {
    const controlled = createControlledListen();
    const responses = [snapshot('0'), snapshot('4'), snapshot('5')];
    const invoke: PluginRegistrationInvoke = rs.fn(async () => responses.shift());
    const adapter = createPluginRegistrationDesktopAdapter({ invoke, listen: controlled.listen });
    await adapter.initialize();

    await expect(adapter.handleLauncherActivation()).resolves.toMatchObject({ revision: '4' });
    await expect(adapter.recoverListener()).resolves.toMatchObject({ revision: '5' });
    expect(controlled.unlisten).toHaveBeenCalledTimes(1);
    expect(controlled.listen).toHaveBeenCalledTimes(2);
    await adapter.destroy();
  });

  test('reports invalid and out-of-order events safely and refreshes the complete snapshot', async () => {
    const controlled = createControlledListen();
    const invoke: PluginRegistrationInvoke = rs.fn(async () => snapshot('2'));
    const adapter = createPluginRegistrationDesktopAdapter({ invoke, listen: controlled.listen });
    const errors: PluginRegistrationQueryError[] = [];
    adapter.subscribe(
      () => undefined,
      (error) => errors.push(error),
    );
    await adapter.initialize();

    controlled.emit({ revision: '3', private_stack: 'secret' });
    controlled.emit(event('1'));
    await tick();

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ code: 'invalid_boundary_payload', operation: 'read_snapshot' });
    expect(invoke).toHaveBeenCalledTimes(2);
    await adapter.destroy();
  });

  test('invalidates detail cache and retries when detail revision differs', async () => {
    const controlled = createControlledListen();
    const calls: string[] = [];
    const responses = [snapshot('1'), detail('2'), snapshot('2'), detail('2')];
    const invoke: PluginRegistrationInvoke = rs.fn(async (command) => {
      calls.push(command);
      return responses.shift();
    });
    const adapter = createPluginRegistrationDesktopAdapter({ invoke, listen: controlled.listen });
    await adapter.initialize();

    const entryId = 'entry_0000000000000001';
    await expect(adapter.readDetail(entryId)).resolves.toMatchObject({ revision: '2' });
    await expect(adapter.readDetail(entryId)).resolves.toMatchObject({ revision: '2' });
    expect(calls).toEqual([
      READ_PLUGIN_REGISTRATION_SNAPSHOT_COMMAND,
      READ_PLUGIN_REGISTRATION_DETAIL_COMMAND,
      READ_PLUGIN_REGISTRATION_SNAPSHOT_COMMAND,
      READ_PLUGIN_REGISTRATION_DETAIL_COMMAND,
    ]);
    await adapter.destroy();
  });

  test('maps raw errors without exposing native details and validates input locally', async () => {
    const controlled = createControlledListen();
    const invoke: PluginRegistrationInvoke = rs.fn(async (command) => {
      if (command === READ_PLUGIN_REGISTRATION_SNAPSHOT_COMMAND) {
        return snapshot('0');
      }
      throw new Error('/private/path native stack');
    });
    const adapter = createPluginRegistrationDesktopAdapter({ invoke, listen: controlled.listen });
    await adapter.initialize();

    await expect(adapter.readDetail('bad')).rejects.toMatchObject({
      code: 'invalid_request',
      message: 'Plugin registration request is invalid.',
      operation: 'read_detail',
    });
    await expect(adapter.readDetail('entry_0000000000000001')).rejects.toMatchObject({
      code: 'invalid_boundary_payload',
      message: 'Plugin registration boundary returned an invalid payload.',
      operation: 'read_detail',
    });
    await adapter.destroy();
  });

  test('cleans up one listener and supports repeated destroy', async () => {
    const controlled = createControlledListen();
    const invoke: PluginRegistrationInvoke = rs.fn(async () => snapshot('0'));
    const adapter = createPluginRegistrationDesktopAdapter({ invoke, listen: controlled.listen });
    await adapter.initialize();

    await adapter.destroy();
    await adapter.destroy();
    expect(controlled.unlisten).toHaveBeenCalledTimes(1);
  });
});
