import type { NormalizedPluginManifest } from '@lensx/plugin-contract';
import { describe, expect, rs, test } from '@rstest/core';
import { render, screen } from '@testing-library/react';
import validCases from '../fixtures/plugin-registration-contract/valid/cases.json';
import { ActionTile } from '../src/app/launcher/ActionTile';
import { LauncherActionDispatcher } from '../src/app/launcher/actions/dispatcher';
import { LauncherActionRegistry } from '../src/app/launcher/actions/registry';
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
    expect(screen.getByText('Open Project')).toBeInTheDocument();
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
    expect(openPage).toHaveBeenCalledWith({ owner_id: 'com.acme.workspace', page_id: 'open_project' }, actionId);
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
