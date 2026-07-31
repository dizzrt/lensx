import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, rs, test } from '@rstest/core';
import { render, screen } from '@testing-library/react';
import App from '../src/App';
import { AppProviders } from '../src/app/AppProviders';
import { createDefaultLauncherActionService, HIDE_LAUNCHER_ACTION_ID } from '../src/app/launcher/actions';
import type { LauncherActivationSource } from '../src/app/launcher/activation';
import { validatePluginManifestV0 } from '../src/app/plugins/manifest';

const baseManifest = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../fixtures/plugin-manifest-v0/base.json'), 'utf8'),
) as unknown;
const currentVersions = {
  lensx: '0.1.0',
  host_api: '1.0.0-dev',
} as const;

test('static Manifest validation does not discover, register, render, or execute a plugin', () => {
  const hideLauncher = rs.fn(async () => undefined);
  const service = createDefaultLauncherActionService({ hideLauncher });
  const before = service.registry.snapshot();
  const validation = validatePluginManifestV0(baseManifest, currentVersions);

  expect(validation.status).toBe('compatible');
  expect(service.registry.snapshot()).toEqual(before);
  expect(service.registry.snapshot().map(({ action_id: actionId }) => actionId)).toEqual([HIDE_LAUNCHER_ACTION_ID]);
  expect(hideLauncher).not.toHaveBeenCalled();

  const activationSource: LauncherActivationSource = {
    subscribe: async () => () => undefined,
  };
  render(
    <AppProviders>
      <App activationSource={activationSource} />
    </AppProviders>,
  );

  expect(screen.getByRole('combobox', { name: 'Launcher query' })).toBeInTheDocument();
  expect(document.querySelector('iframe')).not.toBeInTheDocument();
  expect(screen.queryByText('Workspace Tools')).not.toBeInTheDocument();
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

test('author and normalized contracts contain plain data but no Host-owned state or executor', () => {
  const result = validatePluginManifestV0(baseManifest, currentVersions);
  if (result.status === 'invalid') {
    throw new TypeError('Base fixture unexpectedly failed validation.');
  }

  const serialized = JSON.stringify(result.manifest);
  expect(JSON.parse(serialized)).toEqual(result.manifest);
  for (const forbidden of [
    '"executor"',
    '"source"',
    '"lifecycle"',
    '"enabled"',
    '"granted_permissions"',
    '"install_path"',
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
});

test.each([
  'source',
  'lifecycle',
  'enabled',
  'granted_permissions',
])('Schema rejects Host-owned author field %s', (field) => {
  const input = {
    ...(baseManifest as Record<string, unknown>),
    [field]: field === 'enabled' ? true : 'author-controlled',
  };
  const result = validatePluginManifestV0(input, currentVersions);

  expect(result.status).toBe('invalid');
  expect(result.diagnostics.map(({ code, path }) => ({ code, path }))).toEqual([
    {
      code: 'unknown_field',
      path: `/${field}`,
    },
  ]);
});
