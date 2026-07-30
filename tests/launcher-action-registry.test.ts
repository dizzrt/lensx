import { describe, expect, rs, test } from '@rstest/core';
import { LauncherActionDispatcher } from '../src/app/launcher/actions/dispatcher';
import { LauncherActionRegistry } from '../src/app/launcher/actions/registry';
import type { LauncherActionExecutor } from '../src/app/launcher/actions/types';

const createDescriptor = (localName: string, enabled = true) => ({
  action_id: `lensx.core.${localName}`,
  owner_id: 'lensx.core',
  title: { 'en-US': localName },
  default_keywords: { 'en-US': [localName] },
  enabled,
});

const noOpExecutor: LauncherActionExecutor = () => undefined;

describe('launcher action registry', () => {
  test('registers a batch atomically after validating every descriptor', () => {
    const registry = new LauncherActionRegistry();
    const result = registry.registerBatch([
      { descriptor: createDescriptor('alpha'), executor: noOpExecutor },
      {
        descriptor: {
          ...createDescriptor('invalid'),
          title: { 'en-US': ' ' },
        },
        executor: noOpExecutor,
      },
    ]);

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'missing_localized_text', path: '/1/descriptor/title/en-US' }],
    });
    expect(registry.snapshot()).toEqual([]);
  });

  test('rejects existing and within-batch duplicate IDs without partial state', () => {
    const registry = new LauncherActionRegistry();
    expect(registry.register({ descriptor: createDescriptor('existing'), executor: noOpExecutor }).ok).toBe(true);

    const existingDuplicate = registry.registerBatch([
      { descriptor: createDescriptor('new_action'), executor: noOpExecutor },
      { descriptor: createDescriptor('existing'), executor: noOpExecutor },
    ]);
    expect(existingDuplicate).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'duplicate_action_id', path: '/1/descriptor/action_id' }],
    });
    expect(registry.get('lensx.core.new_action')).toBeUndefined();

    const batchDuplicate = registry.registerBatch([
      { descriptor: createDescriptor('duplicate'), executor: noOpExecutor },
      { descriptor: createDescriptor('duplicate'), executor: noOpExecutor },
    ]);
    expect(batchDuplicate).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'duplicate_action_id', path: '/1/descriptor/action_id' }],
    });
    expect(registry.get('lensx.core.duplicate')).toBeUndefined();
  });

  test('returns deterministic deeply frozen copies without executors', () => {
    const registry = new LauncherActionRegistry();
    const mutableDescriptor = createDescriptor('zulu');
    registry.registerBatch([
      { descriptor: mutableDescriptor, executor: noOpExecutor },
      { descriptor: createDescriptor('alpha'), executor: noOpExecutor },
    ]);

    mutableDescriptor.title['en-US'] = 'changed by caller';
    mutableDescriptor.default_keywords['en-US'].push('changed');
    const snapshot = registry.snapshot();

    expect(snapshot.map(({ action_id }) => action_id)).toEqual(['lensx.core.alpha', 'lensx.core.zulu']);
    expect(snapshot[1]?.title['en-US']).toBe('zulu');
    expect(snapshot[1]?.default_keywords['en-US']).toEqual(['zulu']);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot[1]?.default_keywords['en-US'])).toBe(true);
    expect('executor' in (snapshot[0] ?? {})).toBe(false);
    expect(registry.get('lensx.core.unknown')).toBeUndefined();
    expect(registry.get('lensx.core.alpha')).not.toBe(snapshot[0]);
  });
});

describe('launcher action dispatcher', () => {
  test('executes a registered enabled action exactly once', async () => {
    const registry = new LauncherActionRegistry();
    const executor = rs.fn(() => undefined);
    registry.register({ descriptor: createDescriptor('run'), executor });
    const dispatcher = new LauncherActionDispatcher(registry);

    await expect(dispatcher.dispatch('lensx.core.run')).resolves.toEqual({
      ok: true,
      action_id: 'lensx.core.run',
    });
    expect(executor).toHaveBeenCalledTimes(1);
  });

  test('returns typed unknown and unavailable failures without executing', async () => {
    const registry = new LauncherActionRegistry();
    const executor = rs.fn(() => undefined);
    registry.register({ descriptor: createDescriptor('disabled', false), executor });
    const dispatcher = new LauncherActionDispatcher(registry);

    await expect(dispatcher.dispatch('lensx.core.unknown')).resolves.toMatchObject({
      ok: false,
      error: { code: 'action_not_found' },
    });
    await expect(dispatcher.dispatch('lensx.core.disabled')).resolves.toMatchObject({
      ok: false,
      error: { code: 'action_unavailable' },
    });
    expect(executor).not.toHaveBeenCalled();
  });

  test('isolates thrown, rejected, and invalid executor results', async () => {
    const cases: LauncherActionExecutor[] = [
      () => {
        throw new Error('secret stack details');
      },
      async () => {
        throw new Error('native Rust object');
      },
      (() => ({ internal: true })) as unknown as LauncherActionExecutor,
    ];

    for (const [index, executor] of cases.entries()) {
      const registry = new LauncherActionRegistry();
      const actionId = `lensx.core.failure_${index}`;
      registry.register({
        descriptor: createDescriptor(`failure_${index}`),
        executor,
      });

      const result = await new LauncherActionDispatcher(registry).dispatch(actionId);
      expect(result).toEqual({
        ok: false,
        action_id: actionId,
        error: {
          code: 'action_execution_failed',
          message: 'Launcher action execution failed.',
        },
      });
      expect(JSON.stringify(result)).not.toContain('secret stack');
      expect(JSON.stringify(result)).not.toContain('Rust');
      expect(JSON.stringify(result)).not.toContain('internal');
    }
  });
});
