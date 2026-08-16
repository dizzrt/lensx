import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { relative, resolve } from 'node:path';

import {
  buildCanonicalChecksums,
  compressCanonicalTar,
  createCanonicalTar,
  inspectPluginPackage,
  PLUGIN_PACKAGE_CHECKSUMS_PATH,
  type PluginPackageInputFile,
  packPluginPackage,
} from '../packages/plugin-cli/dist/src/package-format/index.js';

const repositoryRoot = resolve(import.meta.dirname, '..');
const temporaryRoot = await mkdtemp(resolve(tmpdir(), 'lensx-plugin-template-package-'));
const templateDirectories = ['framework-neutral', 'react-semi'] as const;

interface TemplateManifest extends Record<string, unknown> {
  contributes: {
    readonly actions: readonly Record<string, unknown>[];
  } & Record<string, unknown>;
  display: Record<string, unknown>;
  runtime: { readonly entry: string; readonly kind: string };
}

const run = (command: string, arguments_: readonly string[], cwd = repositoryRoot): string => {
  const result = spawnSync(command, arguments_, { cwd, encoding: 'utf8' });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} ${arguments_.join(' ')} failed.\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
};

const collectFiles = async (root: string): Promise<PluginPackageInputFile[]> => {
  const files: PluginPackageInputFile[] = [];
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.name !== 'modules.json') files.push({ path: relative(root, path), bytes: await readFile(path) });
    }
  };
  await visit(root);
  return files;
};

const manifestBytes = (manifest: unknown): Uint8Array => Buffer.from(`${JSON.stringify(manifest)}\n`, 'utf8');
const rawPackage = async (files: readonly PluginPackageInputFile[]): Promise<Uint8Array> => {
  const checksums = buildCanonicalChecksums(files).bytes;
  return compressCanonicalTar(
    createCanonicalTar([...files, { path: PLUGIN_PACKAGE_CHECKSUMS_PATH, bytes: checksums }]),
  );
};

const expectInvalid = async (name: string, files: readonly PluginPackageInputFile[]): Promise<void> => {
  const inspection = await inspectPluginPackage(await rawPackage(files));
  if (inspection.status !== 'invalid') throw new Error(`template/package-negative-missed: ${name}`);
};

try {
  const evidence: Array<{
    pluginId: string;
    version: string;
    digest: string;
    fileCount: number;
    files: string[];
    compatible: boolean;
    installerPrepared: boolean;
  }> = [];
  const packagePaths: string[] = [];

  for (const directory of templateDirectories) {
    const templateRoot = resolve(repositoryRoot, 'examples/plugins', directory);
    run('pnpm', ['run', 'build'], templateRoot);
    const temporaryDist = resolve(temporaryRoot, directory, 'dist');
    await cp(resolve(templateRoot, 'dist'), temporaryDist, { recursive: true });
    const files = await collectFiles(temporaryDist);
    const [first, second] = await Promise.all([packPluginPackage(files), packPluginPackage(files)]);
    if (!Buffer.from(first.bytes).equals(Buffer.from(second.bytes)) || first.digest.value !== second.digest.value) {
      throw new Error(`template/package-nondeterministic: ${directory}`);
    }
    const inspection = await inspectPluginPackage(first.bytes);
    if (inspection.status !== 'compatible') throw new Error(`template/package-incompatible: ${directory}`);
    if (inspection.facts.files.some((file) => file.path !== PLUGIN_PACKAGE_CHECKSUMS_PATH && !file.checksumCovered)) {
      throw new Error(`template/package-checksum-gap: ${directory}`);
    }
    const packagePath = resolve(temporaryRoot, `${directory}.lxp`);
    await writeFile(packagePath, first.bytes);
    packagePaths.push(packagePath);
    evidence.push({
      pluginId: inspection.manifest.plugin_id,
      version: inspection.manifest.version,
      digest: inspection.facts.packageDigest.value,
      fileCount: inspection.facts.fileCount,
      files: inspection.facts.files.map((file) => file.path),
      compatible: true,
      installerPrepared: true,
    });

    const manifestFile = files.find((file) => file.path === 'manifest.json');
    if (manifestFile === undefined) throw new Error('template/package-manifest-missing');
    const manifest = JSON.parse(Buffer.from(manifestFile.bytes).toString('utf8')) as TemplateManifest;
    if (manifest.runtime.kind !== 'webview') throw new Error(`template/package-runtime-kind: ${directory}`);
    const withoutEntry = files.filter((file) => file.path !== manifest.runtime.entry);
    await expectInvalid(`${directory}/missing-entry`, withoutEntry);
    await expectInvalid(`${directory}/extra-manifest-resource`, [
      ...files.filter((file) => file.path !== 'manifest.json'),
      {
        path: 'manifest.json',
        bytes: manifestBytes({
          ...manifest,
          display: { ...manifest.display, icon: { kind: 'asset', path: 'missing.svg' } },
        }),
      },
    ]);
    await expectInvalid(`${directory}/invalid-action-target`, [
      ...files.filter((file) => file.path !== 'manifest.json'),
      {
        path: 'manifest.json',
        bytes: manifestBytes({
          ...manifest,
          contributes: {
            ...manifest.contributes,
            actions: manifest.contributes.actions.map((action: Record<string, unknown>) => ({
              ...action,
              target: { kind: 'page', page_id: 'missing' },
            })),
          },
        }),
      },
    ]);
    await expectInvalid(`${directory}/host-facts`, [
      ...files.filter((file) => file.path !== 'manifest.json'),
      {
        path: 'manifest.json',
        bytes: manifestBytes({ ...manifest, source: 'official', installed_path: '/private/plugin' }),
      },
    ]);

    const legacyPermissionManifest = {
      ...manifest,
      requested_permissions: [
        {
          permission_id: 'lensx.filesystem.read_selected',
          reason: { 'en-US': 'Read a selected folder.', 'zh-CN': '读取选中的文件夹。' },
        },
      ],
    };
    const legacyPermissionInspection = await inspectPluginPackage(
      await rawPackage([
        ...files.filter((file) => file.path !== 'manifest.json'),
        { path: 'manifest.json', bytes: manifestBytes(legacyPermissionManifest) },
      ]),
    );
    if (legacyPermissionInspection.status !== 'invalid')
      throw new Error(`template/package-legacy-permission-accepted: ${directory}`);
    if (!legacyPermissionInspection.diagnostics.some((diagnostic) => diagnostic.code === 'manifest_invalid'))
      throw new Error(`template/package-legacy-permission-diagnostic-missed: ${directory}`);

    const canonicalFiles = [
      ...files,
      { path: PLUGIN_PACKAGE_CHECKSUMS_PATH, bytes: buildCanonicalChecksums(files).bytes },
    ];
    const noncanonicalTar = Buffer.from(createCanonicalTar(canonicalFiles));
    noncanonicalTar[100] = 0x37;
    const noncanonical = await inspectPluginPackage(await compressCanonicalTar(noncanonicalTar));
    if (noncanonical.status !== 'invalid') throw new Error(`template/package-noncanonical-missed: ${directory}`);

    const metadata = JSON.parse(await readFile(resolve(templateRoot, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    if (metadata.scripts?.pack !== undefined) throw new Error(`template/public-pack-command: ${directory}`);
    const sourceText = (
      await Promise.all(
        (
          await readdir(resolve(templateRoot, 'src'))
        )
          .filter((file) => /\.[jt]sx?$/u.test(file))
          .map((file) => readFile(resolve(templateRoot, 'src', file), 'utf8')),
      )
    ).join('\n');
    if (sourceText.includes('tools/plugin-package-format'))
      throw new Error(`template/private-packer-import: ${directory}`);
    if (!sourceText.includes('@lensx/plugin-sdk/webview') || !sourceText.includes('createPluginWebviewTransport')) {
      throw new Error(`template/public-webview-transport-missing: ${directory}`);
    }
    for (const forbidden of [
      '@lensx/plugin-sdk/iframe',
      'createPluginIframeTransport',
      'MessageChannel',
      'MessagePort',
    ]) {
      if (sourceText.includes(forbidden))
        throw new Error(`template/legacy-runtime-reference: ${directory}/${forbidden}`);
    }
  }

  const rustOutput = run('cargo', [
    'run',
    '--quiet',
    '--manifest-path',
    'src-tauri/Cargo.toml',
    '--example',
    'plugin_project_template_package_smoke',
    '--',
    ...packagePaths,
  ]);
  const rustEvidence = JSON.parse(rustOutput.trim()) as typeof evidence;
  const crossLanguageMatches =
    rustEvidence.length === evidence.length &&
    rustEvidence.every((rust, index) => {
      const typescript = evidence[index];
      return (
        typescript !== undefined &&
        rust.pluginId === typescript.pluginId &&
        rust.version === typescript.version &&
        rust.digest === typescript.digest &&
        rust.fileCount === typescript.fileCount &&
        JSON.stringify(rust.files) === JSON.stringify(typescript.files) &&
        rust.compatible === typescript.compatible &&
        rust.installerPrepared === typescript.installerPrepared
      );
    });
  if (!crossLanguageMatches) {
    throw new Error(
      `template/package-cross-language-drift:\nTS=${JSON.stringify(evidence)}\nRust=${JSON.stringify(rustEvidence)}`,
    );
  }
  for (const item of evidence) {
    console.log(
      `Verified canonical ${item.pluginId}: sha256:${item.digest}, ${item.fileCount} package records with complete payload checksum coverage.`,
    );
  }
  console.log(
    'Verified package negative cases: missing/extra resource, invalid target, noncanonical bytes, permissions, Host facts.',
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
