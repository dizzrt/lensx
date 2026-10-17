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
        title: { 'en-US': 'Open notes', 'zh-CN': '打开笔记' },
        description: { 'en-US': 'Open the notes workspace', 'zh-CN': '笔记的保密说明' },
        default_keywords: { 'en-US': ['notes'], 'zh-CN': ['笔记'] },
        enabled: true,
      },
      executor,
    });
    const service: LauncherActionService = {
      registry,
      dispatcher: new LauncherActionDispatcher(registry),
    };

    const snapshot = service.registry.snapshot();
    const results = (query: string, locale: 'en-US' | 'zh-CN') =>
      searchLauncherActions({ query, locale, snapshot, limit: 8 });
    const [result] = results('notes', 'zh-CN');

    expect(result).toEqual({
      action_id: 'workspace.tools.open_notes',
      owner_id: 'workspace.tools',
      title: '打开笔记',
      description: '笔记的保密说明',
      score: 500,
    });
    expect(results('笔记', 'en-US')).toEqual([
      { ...result, title: 'Open notes', description: 'Open the notes workspace' },
    ]);
    for (const locale of ['en-US', 'zh-CN'] as const) {
      expect(results('workspace', locale)).toEqual([]);
      expect(results('保密说明', locale)).toEqual([]);
    }
    expect(executor).not.toHaveBeenCalled();
    expect('executor' in (result ?? {})).toBe(false);
    await expect(service.dispatcher.dispatch(result?.action_id ?? '')).resolves.toEqual({
      ok: true,
      action_id: 'workspace.tools.open_notes',
    });
    expect(executor).toHaveBeenCalledTimes(1);
  });

  test('cannot consume Manifest or provider-private fields through its typed input', () => {
    const registry = new LauncherActionRegistry();
    registry.register({
      descriptor: {
        action_id: 'workspace.tools.open_notes',
        owner_id: 'workspace.tools',
        title: { 'en-US': 'Open notes' },
        default_keywords: {},
        enabled: true,
      },
      executor: rs.fn(),
    });
    const descriptor = registry.get('workspace.tools.open_notes');
    if (!descriptor) throw new Error('Boundary fixture must register an Action.');
    const privateRead = rs.fn(() => {
      throw new Error('Search must not read provider-private or executable state.');
    });
    const privateFields = new Set([
      'manifest',
      'display',
      'contributes',
      'runtime',
      'target',
      'executor',
      'recent',
      'pinned',
    ]);
    const guardedDescriptor = new Proxy(descriptor, {
      get(target, property, receiver) {
        if (typeof property === 'string' && privateFields.has(property)) return privateRead();
        return Reflect.get(target, property, receiver);
      },
    });

    for (const locale of ['en-US', 'zh-CN'] as const) {
      for (const query of ['workspace.tools', 'ui/index.html', 'private-page', 'private-default']) {
        expect(searchLauncherActions({ query, locale, snapshot: [guardedDescriptor], limit: 8 })).toEqual([]);
      }
      expect(searchLauncherActions({ query: 'notes', locale, snapshot: [guardedDescriptor], limit: 8 })).toMatchObject([
        { action_id: descriptor.action_id, score: 250 },
      ]);
    }
    expect(privateRead).not.toHaveBeenCalled();
  });
});
