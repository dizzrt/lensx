import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readdir, readFile, rename, rm, rmdir } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { PluginCliCommandError } from './command-error.js';
import { cliDiagnostic } from './diagnostics.js';
import { inspectPluginPackage, PLUGIN_PACKAGE_LIMITS, type PluginPackageDiagnostic } from './package-format/index.js';
import { buildPluginProject, validatePluginProject } from './project.js';
import type { PluginCliDiagnostic } from './types.js';

const toPosix = (value: string): string => value.replaceAll('\\', '/');
const pagePresentations = (
  pages: readonly {
    readonly id: string;
    readonly presentation: {
      readonly initial_size: { readonly width: number; readonly height: number };
      readonly resizable: boolean;
    };
  }[],
) =>
  pages.map(({ id, presentation }) => ({
    page_id: id,
    initial_size: presentation.initial_size,
    resizable: presentation.resizable,
  }));
const isWithin = (parent: string, child: string): boolean => {
  const path = relative(parent, child);
  return path === '' || (path !== '..' && !path.startsWith('../') && !isAbsolute(path));
};

const mapPackageDiagnostics = (
  diagnostics: readonly PluginPackageDiagnostic[],
  incompatible = false,
): readonly PluginCliDiagnostic[] =>
  diagnostics.map((item) =>
    item.code === 'manifest_incompatible'
      ? cliDiagnostic('CLI_LEGACY_IFRAME_RUNTIME', item.path, 'legacy_runtime_incompatible')
      : cliDiagnostic(
          `CLI_PACKAGE_${item.code.toUpperCase()}`,
          item.path,
          incompatible ? 'package_incompatible' : 'payload_invalid',
          { package_code: item.code },
        ),
  );

const validateOutputTarget = async (output: string, dist: string): Promise<boolean> => {
  if (isWithin(dist, output)) {
    throw new PluginCliCommandError('usage_error', [
      cliDiagnostic('CLI_PACK_OUTPUT_IN_DIST', '/arguments/output', 'pack_output_invalid'),
    ]);
  }
  try {
    const metadata = await lstat(output);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new PluginCliCommandError('usage_error', [
        cliDiagnostic('CLI_PACK_OUTPUT_UNSAFE', '/arguments/output', 'pack_output_invalid'),
      ]);
    }
    return true;
  } catch (error) {
    if (error instanceof PluginCliCommandError) throw error;
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return false;
    throw new PluginCliCommandError('operational_error', [
      cliDiagnostic('CLI_PACK_OUTPUT_CHECK_FAILED', '/operation/output', 'pack_write_failed'),
    ]);
  }
};

export interface PackPluginProjectInput {
  readonly cwd: string;
  readonly project?: string;
  readonly output?: string;
  readonly noBuild: boolean;
  readonly json: boolean;
  readonly writeStdout?: (value: string) => void;
  readonly writeStderr?: (value: string) => void;
  readonly beforeCommit?: () => void | Promise<void>;
}

export const packPluginProject = async (input: PackPluginProjectInput): Promise<Readonly<Record<string, unknown>>> => {
  if (!input.noBuild) {
    await buildPluginProject({
      cwd: input.cwd,
      project: input.project,
      json: input.json,
      writeStdout: input.writeStdout,
      writeStderr: input.writeStderr,
    });
  }
  const validated = await validatePluginProject(input.cwd, input.project);
  if (validated.inspection.status === 'incompatible') {
    throw new PluginCliCommandError('incompatible', [
      cliDiagnostic('CLI_PACKAGE_INCOMPATIBLE', '/compatibility', 'package_incompatible'),
    ]);
  }
  const defaultOutput = `artifacts/${validated.inspection.manifest.plugin_id}-${validated.inspection.manifest.version}.lxp`;
  const callerOutput = input.output ?? toPosix(join(validated.project.callerPath, defaultOutput));
  const output =
    input.output === undefined ? resolve(validated.project.root, defaultOutput) : resolve(input.cwd, input.output);
  const outputDirectory = dirname(output);
  const directoryExisted = await (async () => {
    try {
      const metadata = await lstat(outputDirectory);
      if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
        throw new PluginCliCommandError('usage_error', [
          cliDiagnostic('CLI_PACK_OUTPUT_UNSAFE', '/arguments/output', 'pack_output_invalid'),
        ]);
      }
      return true;
    } catch (error) {
      if (error instanceof PluginCliCommandError) throw error;
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'ENOENT' &&
        input.output === undefined
      ) {
        return false;
      }
      throw new PluginCliCommandError('usage_error', [
        cliDiagnostic('CLI_PACK_OUTPUT_UNSAFE', '/arguments/output', 'pack_output_invalid'),
      ]);
    }
  })();
  await validateOutputTarget(output, resolve(validated.project.root, 'dist'));

  if (!directoryExisted) await mkdir(outputDirectory, { recursive: false });
  const temporary = resolve(outputDirectory, `.${randomUUID()}.lxp.tmp`);
  try {
    const handle = await open(temporary, 'wx', 0o600);
    try {
      await handle.writeFile(validated.packageBytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await input.beforeCommit?.();
    await rename(temporary, output);
  } catch (error) {
    await rm(temporary, { force: true });
    if (!directoryExisted && (await readdir(outputDirectory)).length === 0) await rmdir(outputDirectory);
    if (error instanceof PluginCliCommandError) throw error;
    throw new PluginCliCommandError('operational_error', [
      cliDiagnostic('CLI_PACK_WRITE_FAILED', '/operation/output', 'pack_write_failed'),
    ]);
  }

  const facts = validated.inspection.facts;
  return {
    summary_version: '1',
    plugin_id: validated.inspection.manifest.plugin_id,
    version: validated.inspection.manifest.version,
    runtime_kind: validated.inspection.manifest.runtime.kind,
    page_presentations: pagePresentations(validated.inspection.manifest.contributes.pages),
    package_protocol: facts.packageFormatVersion,
    compatibility: validated.inspection.compatibility,
    file_count: facts.fileCount,
    compressed_size: facts.compressedSize,
    decompressed_size: facts.decompressedSize,
    package_digest: facts.packageDigest,
    output: input.output ?? (validated.project.callerPath === '.' ? defaultOutput : callerOutput),
  };
};

export const inspectPluginPackageFile = async (
  cwd: string,
  callerFile: string,
): Promise<{ readonly status: 'compatible' | 'incompatible'; readonly result: Readonly<Record<string, unknown>> }> => {
  const file = resolve(cwd, callerFile);
  let bytes: Uint8Array;
  try {
    const metadata = await lstat(file);
    if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error('unsafe input');
    if (metadata.size > PLUGIN_PACKAGE_LIMITS.compressedBytes) {
      throw new PluginCliCommandError('invalid', [
        cliDiagnostic('CLI_PACKAGE_COMPRESSED_SIZE_EXCEEDED', '/frame', 'payload_invalid'),
      ]);
    }
    bytes = await readFile(file);
  } catch (error) {
    if (error instanceof PluginCliCommandError) throw error;
    throw new PluginCliCommandError('operational_error', [
      cliDiagnostic('CLI_INSPECT_READ_FAILED', '/operation/inspect', 'operation_failed'),
    ]);
  }
  const inspection = await inspectPluginPackage(bytes);
  if (inspection.status === 'invalid') {
    throw new PluginCliCommandError('invalid', mapPackageDiagnostics(inspection.diagnostics));
  }
  if (!('manifest' in inspection)) {
    throw new PluginCliCommandError('incompatible', mapPackageDiagnostics(inspection.diagnostics, true));
  }
  return {
    status: inspection.status,
    result: {
      file: callerFile,
      plugin_id: inspection.manifest.plugin_id,
      version: inspection.manifest.version,
      runtime_kind: inspection.manifest.runtime.kind,
      page_presentations: pagePresentations(inspection.manifest.contributes.pages),
      package_protocol: inspection.facts.packageFormatVersion,
      compatibility: inspection.compatibility,
      file_count: inspection.facts.fileCount,
      compressed_size: inspection.facts.compressedSize,
      decompressed_size: inspection.facts.decompressedSize,
      package_digest: inspection.facts.packageDigest,
    },
  };
};
