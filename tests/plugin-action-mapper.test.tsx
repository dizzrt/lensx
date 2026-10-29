import { type NormalizedPluginManifest, normalizePluginManifest, validatePluginManifest } from '@lensx/plugin-contract';
import { describe, expect, rs, test } from '@rstest/core';
import { render, screen } from '@testing-library/react';
import validCases from '../fixtures/plugin-registration-contract/valid/cases.json';
import configLensManifest from '../plugins/config-lens/manifest.json';
import { ActionTile } from '../src/app/launcher/ActionTile';
import { LauncherActionDispatcher } from '../src/app/launcher/actions/dispatcher';
import { LauncherActionRegistry } from '../src/app/launcher/actions/registry';
import { searchLauncherActions } from '../src/app/launcher/actions/search';
import { resolveLauncherActionMetadata } from '../src/app/launcher/actions/validation';
import { mapPluginActionsToLauncherRegistrations } from '../src/app/plugins/actions';
import { parsePluginRegistrationDetailResponse } from '../src/app/plugins/registration';

const healthyDetail = parsePluginRegistrationDetailResponse(
  structuredClone(validCases.find(({ name }) => name === 'healthy_detail')?.value),
);
if (healthyDetail.detail.kind !== 'registered') {
  throw new Error('Healthy detail fixture must contain a registered plugin.');
}
const baseManifest = healthyDetail.detail.manifest;

const withActions = (
  actions: NormalizedPluginManifest['contributes']['actions'],
  launcher: NormalizedPluginManifest['contributes']['launcher'] = baseManifest.contributes.launcher,
): NormalizedPluginManifest => ({
  ...baseManifest,
  contributes: {
    ...baseManifest.contributes,
    actions,
    ...(launcher ? { launcher } : {}),
  },
});

describe('Plugin Action mapper', () => {
  test.each([
    'en-US',
    'zh-CN',
  ] as const)('projects and searches current ConfigLens metadata without legacy aliases in %s', async (locale) => {
    const validation = validatePluginManifest(configLensManifest);
    if (validation.status !== 'valid') throw new Error(JSON.stringify(validation.diagnostics));
    const { manifest } = normalizePluginManifest(validation, { lensx: '0.1.0', host_api: '0.2.0' });
    const openPage = rs.fn();
    const registry = new LauncherActionRegistry();
    expect(registry.registerBatch(mapPluginActionsToLauncherRegistrations(manifest, { openPage })).ok).toBe(true);
    const snapshot = registry.snapshot();
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]?.default_keywords).toEqual({
      'en-US': ['ConfigLens', 'JSON', 'YAML', 'TOML', 'XML', 'format', 'validate'],
      'zh-CN': ['ConfigLens', 'JSON', 'YAML', 'TOML', 'XML', '格式化', '校验'],
    });
    for (const query of ['ConfigLens', 'JSON', 'YAML', 'TOML', 'XML', 'format', 'validate', '格式化', '校验']) {
      expect(searchLauncherActions({ query, locale, snapshot, limit: 8 })).toEqual([
        expect.objectContaining({ action_id: 'dev.lensx.config-lens.open', title: 'ConfigLens' }),
      ]);
    }
    for (const query of ['Open ConfigLens', '打开 ConfigLens', 'configuration text', '配置文本']) {
      expect(searchLauncherActions({ query, locale, snapshot, limit: 8 })).toEqual([]);
    }
    await expect(new LauncherActionDispatcher(registry).dispatch('dev.lensx.config-lens.open')).resolves.toEqual({
      ok: true,
      action_id: 'dev.lensx.config-lens.open',
    });
    expect(openPage).toHaveBeenCalledWith(
      { owner_id: 'dev.lensx.config-lens', page_id: 'main' },
      'dev.lensx.config-lens.open',
      { invocationId: 1, source: 'normal' },
    );
  });

  test('maps multiple Actions to stable global IDs and preserves only Action-owned localized metadata', () => {
    const manifest = withActions([
      ...baseManifest.contributes.actions,
      {
        id: 'show_recent',
        title: { 'en-US': 'Show Recent', 'zh-CN': '显示最近项目' },
        default_keywords: { 'en-US': ['recent'], 'zh-CN': ['最近'] },
        icon: { kind: 'asset', path: 'assets/private-action.svg' },
        target: { kind: 'page', page_id: 'home' },
      },
    ]);
    const registrations = mapPluginActionsToLauncherRegistrations(manifest, { openPage: rs.fn() });

    expect(registrations.map(({ descriptor }) => descriptor)).toEqual([
      {
        action_id: 'com.acme.workspace.open_project',
        owner_id: 'com.acme.workspace',
        title: { 'en-US': 'Open Project', 'zh-CN': '打开项目' },
        description: { 'en-US': 'Open the project selection page.', 'zh-CN': '打开项目选择页面。' },
        default_keywords: {
          'en-US': ['open workspace', 'open folder'],
          'zh-CN': ['打开工作区', '打开文件夹'],
        },
        enabled: true,
      },
      {
        action_id: 'com.acme.workspace.show_recent',
        owner_id: 'com.acme.workspace',
        title: { 'en-US': 'Show Recent', 'zh-CN': '显示最近项目' },
        default_keywords: { 'en-US': ['recent'], 'zh-CN': ['最近'] },
        enabled: true,
      },
    ]);
    expect(Object.isFrozen(registrations)).toBe(true);
    expect(JSON.stringify(registrations.map(({ descriptor }) => descriptor))).not.toMatch(
      /asset|page_id|route|permission|publisher|source|executor/u,
    );
  });

  test('maps zero Actions to an empty batch without synthesizing a default Action', () => {
    const registrations = mapPluginActionsToLauncherRegistrations(withActions([]), { openPage: rs.fn() });
    expect(registrations).toEqual([]);
    expect(Object.isFrozen(registrations)).toBe(true);
  });

  test('preserves independent complete language maps while descriptions remain display-only', () => {
    const action = {
      id: 'format_json',
      title: { 'en-US': 'Format JSON', 'zh-CN': 'JSON 格式化' },
      description: { 'en-US': 'Reformat structured documents.', 'zh-CN': '重新整理结构化文档。' },
      default_keywords: { 'en-US': ['format', 'JSON'], 'zh-CN': ['格式化', 'ＪＳＯＮ'] },
      target: { kind: 'page', page_id: 'home' },
    } as const;
    const registry = new LauncherActionRegistry();
    const registrations = mapPluginActionsToLauncherRegistrations(withActions([action]), { openPage: rs.fn() });
    expect(registry.replaceProviderBatch(baseManifest.plugin_id, registrations).ok).toBe(true);
    const descriptor = registry.get(`${baseManifest.plugin_id}.format_json`);
    if (!descriptor) throw new Error('Mapped multilingual Action must be registered.');

    expect(descriptor.title).toEqual(action.title);
    expect(descriptor.description).toEqual(action.description);
    expect(descriptor.default_keywords).toEqual(action.default_keywords);
    expect(descriptor.title).not.toBe(action.title);
    expect(descriptor.description).not.toBe(action.description);
    expect(descriptor.default_keywords).not.toBe(action.default_keywords);
    for (const locale of ['en-US', 'zh-CN'] as const) {
      expect(descriptor.default_keywords[locale]).not.toBe(action.default_keywords[locale]);
      expect(Object.isFrozen(descriptor.default_keywords[locale])).toBe(true);
      const results = searchLauncherActions({ query: 'JSON', locale, snapshot: registry.snapshot(), limit: 8 });
      expect(results).toEqual([
        {
          action_id: `${baseManifest.plugin_id}.format_json`,
          owner_id: baseManifest.plugin_id,
          title: action.title[locale],
          description: action.description[locale],
          score: 1300,
        },
      ]);
      for (const query of ['structured', '结构化文档']) {
        expect(searchLauncherActions({ query, locale, snapshot: registry.snapshot(), limit: 8 })).toEqual([]);
      }
    }
    expect(Object.isFrozen(descriptor.title)).toBe(true);
    expect(Object.isFrozen(descriptor.description)).toBe(true);
    expect(Object.isFrozen(descriptor.default_keywords)).toBe(true);
  });

  test('publishes only Actions whose target Page is currently available', () => {
    const registrations = mapPluginActionsToLauncherRegistrations(
      withActions([
        ...baseManifest.contributes.actions,
        {
          id: 'show_home',
          title: { 'en-US': 'Show Home' },
          default_keywords: {},
          target: { kind: 'page', page_id: 'home' },
        },
      ]),
      { openPage: rs.fn() },
      ({ page_id: pageId }) => pageId === 'home',
    );

    expect(registrations.map(({ descriptor }) => (descriptor as { action_id: string }).action_id)).toEqual([
      'com.acme.workspace.show_home',
    ]);
  });

  test('uses Registry validation and the existing generic icon fallback', () => {
    const registry = new LauncherActionRegistry();
    const registrations = mapPluginActionsToLauncherRegistrations(baseManifest, { openPage: rs.fn() });
    expect(registry.replaceProviderBatch(baseManifest.plugin_id, registrations).ok).toBe(true);
    const [descriptor] = registry.snapshot();
    if (descriptor === undefined) {
      throw new Error('Projected descriptor must be registered.');
    }
    expect(descriptor?.icon).toBeUndefined();

    render(
      <ActionTile
        action={{
          action_id: descriptor.action_id,
          ...resolveLauncherActionMetadata(descriptor, 'en-US'),
        }}
        onActivate={() => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: 'Open Project' })).toBeInTheDocument();
    expect(document.querySelector('[data-icon-token="action-fallback"]')).not.toBeNull();
  });

  test('dispatches through the Host Page opener and contains opener failures safely', async () => {
    const openPage = rs.fn(
      (_target: { readonly owner_id: string; readonly page_id: string }, _actionId: string) => undefined,
    );
    const registry = new LauncherActionRegistry();
    registry.replaceProviderBatch(
      baseManifest.plugin_id,
      mapPluginActionsToLauncherRegistrations(baseManifest, { openPage }),
    );
    const dispatcher = new LauncherActionDispatcher(registry);
    const actionId = 'com.acme.workspace.open_project';

    await expect(dispatcher.dispatch(actionId)).resolves.toEqual({ ok: true, action_id: actionId });
    expect(openPage).toHaveBeenCalledWith({ owner_id: 'com.acme.workspace', page_id: 'open_project' }, actionId, {
      invocationId: 1,
      source: 'normal',
    });
    expect(Object.isFrozen(openPage.mock.calls[0]?.[0])).toBe(true);

    const failingRegistry = new LauncherActionRegistry();
    failingRegistry.replaceProviderBatch(
      baseManifest.plugin_id,
      mapPluginActionsToLauncherRegistrations(baseManifest, {
        openPage: () => {
          throw new Error('/private/plugin/route native stack');
        },
      }),
    );
    const failure = await new LauncherActionDispatcher(failingRegistry).dispatch(actionId);
    expect(failure).toEqual({
      ok: false,
      action_id: actionId,
      error: { code: 'action_execution_failed', message: 'Launcher action execution failed.' },
    });
    expect(JSON.stringify(failure)).not.toMatch(/private|route|stack/u);
  });
});
