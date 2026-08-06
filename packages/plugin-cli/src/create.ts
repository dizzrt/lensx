import { randomUUID } from 'node:crypto';
import { cp, lstat, mkdir, readdir, readFile, rename, rm, rmdir, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { type PluginManifestInput, validatePluginManifest } from '@lensx/plugin-contract';

import { PluginCliCommandError } from './command-error.js';
import { cliDiagnostic } from './diagnostics.js';
import type { PluginTemplateKind } from './types.js';

const templateRoot = fileURLToPath(new URL('../templates/', import.meta.url));
const PACKAGE_NAME = /^[a-z0-9](?:[a-z0-9._-]{0,212}[a-z0-9])?$/u;
const PLUGIN_ID = /^(?:[a-z][a-z0-9_-]{0,63}\.)+[a-z][a-z0-9_-]{0,63}$/u;
const DISPLAY_NAME = /^[A-Za-z0-9](?:[A-Za-z0-9 ._-]{0,78}[A-Za-z0-9])?$/u;
const TEXT_EXTENSIONS = new Set(['.css', '.html', '.json', '.less', '.md', '.mjs', '.ts', '.tsx']);

const projectPackageName = (name: string): string =>
  name
    .normalize('NFKD')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9._-]+/gu, '-')
    .replace(/^[._-]+|[._-]+$/gu, '')
    .slice(0, 214);

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

const validateInputs = (pluginId: string, name: string): string => {
  if (!PLUGIN_ID.test(pluginId) || pluginId.length > 255) {
    throw new PluginCliCommandError('usage_error', [
      cliDiagnostic('CLI_CREATE_INVALID_PLUGIN_ID', '/arguments/plugin-id', 'create_invalid_plugin_id'),
    ]);
  }
  if (!DISPLAY_NAME.test(name)) {
    throw new PluginCliCommandError('usage_error', [
      cliDiagnostic('CLI_CREATE_INVALID_NAME', '/arguments/name', 'create_invalid_name'),
    ]);
  }
  const packageName = projectPackageName(name);
  if (!PACKAGE_NAME.test(packageName)) {
    throw new PluginCliCommandError('usage_error', [
      cliDiagnostic('CLI_CREATE_INVALID_NAME', '/arguments/name', 'create_invalid_name'),
    ]);
  }
  return packageName;
};

const replaceTemplateMarkers = async (
  staging: string,
  template: PluginTemplateKind,
  pluginId: string,
  name: string,
  packageName: string,
): Promise<void> => {
  const markers =
    template === 'framework-neutral'
      ? [
          ['dev.lensx.template.framework-neutral', pluginId],
          ['@lensx/example-plugin-framework-neutral', packageName],
          ['Framework-neutral starter', name],
        ]
      : [
          ['dev.lensx.template.react-semi', pluginId],
          ['@lensx/example-plugin-react-semi', packageName],
          ['React and Semi starter', name],
        ];
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile() && TEXT_EXTENSIONS.has(extname(entry.name))) {
        let source = await readFile(path, 'utf8');
        for (const [from, to] of markers) source = source.replaceAll(from, to);
        await writeFile(path, source, { encoding: 'utf8', flag: 'w' });
      }
    }
  };
  await visit(staging);
};

const customizeTemplate = async (staging: string, pluginId: string, name: string, packageName: string) => {
  const packageFile = resolve(staging, 'package.json');
  const metadata = JSON.parse(await readFile(packageFile, 'utf8')) as Record<string, unknown>;
  metadata.name = packageName;
  metadata.private = true;
  await writeFile(packageFile, json(metadata), { encoding: 'utf8', flag: 'w' });

  const manifestFile = resolve(staging, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8')) as PluginManifestInput;
  const page = manifest.contributes.pages[0];
  const action = manifest.contributes.actions?.[0];
  if (page === undefined || action === undefined) {
    throw new PluginCliCommandError('invalid', [
      cliDiagnostic('CLI_CREATE_INVALID_MANIFEST', '/manifest', 'create_invalid_manifest'),
    ]);
  }
  manifest.plugin_id = pluginId;
  manifest.display.name = { 'en-US': name, 'zh-CN': name };
  page.title = { 'en-US': name, 'zh-CN': name };
  action.title = { 'en-US': `Open ${name}`, 'zh-CN': `打开 ${name}` };
  const validation = validatePluginManifest(manifest);
  if (validation.status === 'invalid') {
    throw new PluginCliCommandError('invalid', [
      cliDiagnostic('CLI_CREATE_INVALID_MANIFEST', '/manifest', 'create_invalid_manifest'),
    ]);
  }
  await writeFile(manifestFile, json(manifest), { encoding: 'utf8', flag: 'w' });
};

export interface CreatePluginProjectInput {
  readonly cwd: string;
  readonly target: string;
  readonly template: PluginTemplateKind;
  readonly pluginId: string;
  readonly name: string;
  readonly signal?: AbortSignal;
  readonly beforeCommit?: () => void | Promise<void>;
}

export interface CreatedPluginProject {
  readonly target: string;
  readonly template: PluginTemplateKind;
  readonly plugin_id: string;
  readonly package_name: string;
}

export const createPluginProject = async (input: CreatePluginProjectInput): Promise<CreatedPluginProject> => {
  const packageName = validateInputs(input.pluginId, input.name);
  const target = resolve(input.cwd, input.target);
  const parent = dirname(target);
  if (target === parent || basename(target).length === 0) {
    throw new PluginCliCommandError('usage_error', [
      cliDiagnostic('CLI_CREATE_UNSAFE_TARGET', '/arguments/target', 'create_target_unsafe'),
    ]);
  }

  try {
    const parentMetadata = await lstat(parent);
    if (!parentMetadata.isDirectory()) throw new Error('parent is not a directory');
  } catch {
    throw new PluginCliCommandError('usage_error', [
      cliDiagnostic('CLI_CREATE_UNSAFE_TARGET', '/arguments/target', 'create_target_unsafe'),
    ]);
  }

  let existingEmpty = false;
  try {
    const metadata = await lstat(target);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw new Error('unsafe target');
    if ((await readdir(target)).length > 0) {
      throw new PluginCliCommandError('usage_error', [
        cliDiagnostic('CLI_CREATE_TARGET_NOT_EMPTY', '/arguments/target', 'create_target_not_empty'),
      ]);
    }
    existingEmpty = true;
  } catch (error) {
    if (error instanceof PluginCliCommandError) throw error;
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      existingEmpty = false;
    } else if (error instanceof Error && error.message === 'unsafe target') {
      throw new PluginCliCommandError('usage_error', [
        cliDiagnostic('CLI_CREATE_UNSAFE_TARGET', '/arguments/target', 'create_target_unsafe'),
      ]);
    } else {
      throw new PluginCliCommandError('operational_error', [
        cliDiagnostic('CLI_CREATE_FAILED', '/operation/create', 'create_failed'),
      ]);
    }
  }

  const staging = resolve(parent, `.${basename(target)}.lensx-staging-${randomUUID()}`);
  let removedEmptyTarget = false;
  try {
    if (input.signal?.aborted) throw new Error('aborted');
    await cp(resolve(templateRoot, input.template), staging, { recursive: true, errorOnExist: true, force: false });
    await replaceTemplateMarkers(staging, input.template, input.pluginId, input.name, packageName);
    await customizeTemplate(staging, input.pluginId, input.name, packageName);
    if (input.signal?.aborted) throw new Error('aborted');
    await input.beforeCommit?.();
    if (existingEmpty) {
      await rmdir(target);
      removedEmptyTarget = true;
    }
    await rename(staging, target);
    return { target: input.target, template: input.template, plugin_id: input.pluginId, package_name: packageName };
  } catch (error) {
    await rm(staging, { force: true, recursive: true });
    if (removedEmptyTarget) await mkdir(target, { recursive: false });
    if (error instanceof PluginCliCommandError) throw error;
    throw new PluginCliCommandError('operational_error', [
      cliDiagnostic('CLI_CREATE_FAILED', '/operation/create', 'create_failed'),
    ]);
  }
};
