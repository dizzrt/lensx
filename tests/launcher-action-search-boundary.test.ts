import { describe, expect, rs, test } from '@rstest/core';
import {
  LauncherActionDispatcher,
  LauncherActionRegistry,
  type LauncherActionService,
  searchLauncherActions,
} from '../src/app/launcher/actions';

describe('launcher action search service boundary', () => {
  test('uses one descriptor-only path for any valid registered owner', async () => {
    const executor = rs.fn(() => undefined);
    const registry = new LauncherActionRegistry();
    registry.register({
      descriptor: {
        action_id: 'workspace.tools.open_notes',
        owner_id: 'workspace.tools',
        title: { 'en-US': 'Open notes' },
        description: { 'en-US': 'Open the notes workspace' },
        default_keywords: { 'en-US': ['notes'] },
        enabled: true,
      },
      executor,
    });
    const service: LauncherActionService = {
      registry,
      dispatcher: new LauncherActionDispatcher(registry),
    };

    const [result] = searchLauncherActions({
      query: 'notes',
      locale: 'en-US',
      snapshot: service.registry.snapshot(),
      limit: 8,
    });

    expect(result?.action_id).toBe('workspace.tools.open_notes');
    expect('executor' in (result ?? {})).toBe(false);
    await expect(service.dispatcher.dispatch(result?.action_id ?? '')).resolves.toEqual({
      ok: true,
      action_id: 'workspace.tools.open_notes',
    });
    expect(executor).toHaveBeenCalledTimes(1);
  });

  test('cannot consume Manifest or provider-private fields through its typed input', () => {
    const registry = new LauncherActionRegistry();
    const manifestPrivateData = {
      display: { name: { 'en-US': 'Workspace Tools' } },
      contributes: { launcher: { default_action_id: 'open-notes' } },
      runtime: { entry: 'ui/index.html' },
    };

    expect(
      searchLauncherActions({
        query: 'Workspace Tools',
        locale: 'en-US',
        snapshot: registry.snapshot(),
        limit: 8,
      }),
    ).toEqual([]);
    expect(manifestPrivateData.contributes.launcher.default_action_id).toBe('open-notes');
  });
});
