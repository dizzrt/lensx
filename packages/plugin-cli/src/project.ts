import { lstat, readdir, readFile } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';
import { PluginCliCommandError } from './command-error.js';
import { cliDiagnostic } from './diagnostics.js';
import {
  inspectPluginPackage,
  PLUGIN_PACKAGE_LIMITS,
  PluginPackageFormatError,
  type PluginPackageInputFile,
  packPluginPackage,
  type ValidPluginPackageInspectionResult,
} from './package-format/index.js';
import { runBoundedProcess } from './process.js';

const PNPM_VERSION = /^pnpm@11\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$/u;
const ORDINARY_SEMVER =
  /^(?:\^|~|>=|>|<=|<)?\s*(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?(?:\s+(?:<|<=|>|>=)\s*(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*))?$/u;
const SOURCE_EXTENSIONS = new Set(['.cjs', '.cts', '.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx']);
const IMPORT_PATTERN = /(?:from\s+|import\s*\(|import\s+)['"]([^'"]+)['"]/gu;
const HOST_PRIVATE = /^(?:@tauri-apps\/|@\/app\/|lensx(?:\/|$))|(?:^|\/)(?:src\/app|src-tauri|tools)(?:\/|$)/u;
const REQUIRED_SCRIPTS = ['build', 'typecheck', 'test', 'check'] as const;

interface ProjectMetadata {
  readonly name?: unknown;
  readonly private?: unknown;
  readonly packageManager?: unknown;
  readonly scripts?: Readonly<Record<string, string>>;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
}

export interface PluginProject {
  readonly root: string;
  readonly callerPath: string;
  readonly metadata: ProjectMetadata;
}

const failProject = (code: string, key: 'project_not_found' | 'project_metadata_invalid', path: string): never => {
  throw new PluginCliCommandError('usage_error', [cliDiagnostic(code, path, key)]);
};

export const resolvePluginProject = async (cwd: string, project?: string): Promise<PluginProject> => {
  const callerPath = project ?? '.';
  const root = resolve(cwd, callerPath);
  try {
    const rootMetadata = await lstat(root);
    if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink()) {
      failProject('CLI_PROJECT_NOT_FOUND', 'project_not_found', '/project');
    }
    const packageFile = resolve(root, 'package.json');
    const packageMetadata = await lstat(packageFile);
    if (!packageMetadata.isFile() || packageMetadata.isSymbolicLink()) {
      failProject('CLI_PROJECT_NOT_FOUND', 'project_not_found', 'package.json');
    }
    const metadata = JSON.parse(await readFile(packageFile, 'utf8')) as ProjectMetadata;
    return { root, callerPath, metadata };
  } catch (error) {
    if (error instanceof PluginCliCommandError) throw error;
    return failProject('CLI_PROJECT_NOT_FOUND', 'project_not_found', '/project');
  }
};

export const validateProjectMetadata = (project: PluginProject): void => {
  const { metadata } = project;
  const diagnostics = [];
  if (typeof metadata.name !== 'string' || metadata.name.length === 0 || metadata.private !== true) {
    diagnostics.push(cliDiagnostic('CLI_PROJECT_METADATA_INVALID', 'package.json', 'project_metadata_invalid'));
  }
  if (typeof metadata.packageManager !== 'string' || !PNPM_VERSION.test(metadata.packageManager)) {
    diagnostics.push(
      cliDiagnostic('CLI_PROJECT_PACKAGE_MANAGER_UNSUPPORTED', 'package.json', 'project_metadata_invalid'),
    );
  }
  for (const script of REQUIRED_SCRIPTS) {
    const value = metadata.scripts?.[script];
    if (typeof value !== 'string' || value.trim().length === 0) {
      diagnostics.push(
        cliDiagnostic('CLI_PROJECT_LIFECYCLE_MISSING', `package.json/scripts/${script}`, 'project_metadata_invalid', {
          script,
        }),
      );
    }
  }
  const build = metadata.scripts?.build ?? '';
  if (/(?:lensx-plugin|@lensx\/plugin-cli)(?:\s+|\s+run\s+)build(?:\s|$)/u.test(build)) {
    diagnostics.push(
      cliDiagnostic('CLI_PROJECT_BUILD_RECURSIVE', 'package.json/scripts/build', 'project_metadata_invalid'),
    );
  }
  for (const [name, version] of Object.entries({ ...metadata.dependencies, ...metadata.devDependencies })) {
    if (!ORDINARY_SEMVER.test(version)) {
      diagnostics.push(
        cliDiagnostic(
          'CLI_PROJECT_DEPENDENCY_UNSUPPORTED',
          `package.json/dependencies/${name}`,
          'project_metadata_invalid',
          { dependency: name },
        ),
      );
    }
  }
  if (diagnostics.length > 0) throw new PluginCliCommandError('usage_error', diagnostics);
};

const collectSourceFiles = async (directory: string): Promise<string[]> => {
  const files: string[] = [];
  try {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) files.push(...(await collectSourceFiles(path)));
      else if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name))) files.push(path);
    }
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return [];
    throw error;
  }
  return files.sort();
};

export const validateProjectImports = async (project: PluginProject): Promise<void> => {
  const declared = new Set(Object.keys({ ...project.metadata.dependencies, ...project.metadata.devDependencies }));
  const diagnostics = [];
  for (const base of ['src', 'tests']) {
    for (const file of await collectSourceFiles(resolve(project.root, base))) {
      const source = await readFile(file, 'utf8');
      for (const match of source.matchAll(IMPORT_PATTERN)) {
        const specifier = match[1] ?? '';
        if (specifier.startsWith('.') || specifier.startsWith('/')) continue;
        if (base === 'tests' && specifier.startsWith('node:')) continue;
        const packageName = specifier.startsWith('@')
          ? specifier.split('/').slice(0, 2).join('/')
          : (specifier.split('/')[0] ?? '');
        const allowedSubpath =
          !packageName.startsWith('@lensx/plugin-') ||
          specifier === packageName ||
          specifier === '@lensx/plugin-sdk/iframe' ||
          specifier === '@lensx/plugin-ui/styles.css';
        const runtimeCliImport = base === 'src' && packageName === '@lensx/plugin-cli';
        if (HOST_PRIVATE.test(specifier) || runtimeCliImport || !declared.has(packageName) || !allowedSubpath) {
          diagnostics.push(
            cliDiagnostic(
              'CLI_PROJECT_IMPORT_INVALID',
              relative(project.root, file).replaceAll('\\', '/'),
              'project_import_invalid',
              { specifier },
            ),
          );
        }
      }
    }
  }
  if (diagnostics.length > 0) throw new PluginCliCommandError('invalid', diagnostics);
};

export const buildPluginProject = async (input: {
  readonly cwd: string;
  readonly project?: string;
  readonly json: boolean;
  readonly writeStdout?: (value: string) => void;
  readonly writeStderr?: (value: string) => void;
}): Promise<Readonly<Record<string, unknown>>> => {
  const project = await resolvePluginProject(input.cwd, input.project);
  validateProjectMetadata(project);
  const processResult = await runBoundedProcess({
    command: 'pnpm',
    arguments: ['run', 'build'],
    cwd: project.root,
    json: input.json,
    writeStdout: input.writeStdout,
    writeStderr: input.writeStderr,
  });
  if (processResult.status !== 0) {
    throw new PluginCliCommandError('operational_error', [
      cliDiagnostic('CLI_BUILD_FAILED', '/operation/build', 'build_failed', {
        ...(processResult.status === null ? {} : { status: processResult.status }),
        signalled: processResult.signal !== null,
        truncated: processResult.truncated,
      }),
    ]);
  }
  try {
    const manifest = await lstat(resolve(project.root, 'dist/manifest.json'));
    if (!manifest.isFile() || manifest.isSymbolicLink() || manifest.size === 0) throw new Error('missing output');
  } catch {
    throw new PluginCliCommandError('operational_error', [
      cliDiagnostic('CLI_BUILD_OUTPUT_MISSING', 'dist/manifest.json', 'build_output_missing'),
    ]);
  }
  return { project: project.callerPath, dist: 'dist' };
};

const collectDistFiles = async (project: PluginProject): Promise<readonly PluginPackageInputFile[]> => {
  const dist = resolve(project.root, 'dist');
  try {
    const metadata = await lstat(dist);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw new Error('invalid dist');
  } catch {
    throw new PluginCliCommandError('invalid', [cliDiagnostic('CLI_DIST_MISSING', 'dist', 'payload_invalid')]);
  }
  const files: PluginPackageInputFile[] = [];
  let totalBytes = 0;
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      const metadata = await lstat(path);
      const packagePath = relative(dist, path).replaceAll('\\', '/');
      if (metadata.isSymbolicLink() || (!metadata.isDirectory() && !metadata.isFile())) {
        throw new PluginCliCommandError('invalid', [
          cliDiagnostic('CLI_DIST_FILE_UNSAFE', packagePath, 'payload_invalid'),
        ]);
      }
      if (metadata.isDirectory()) {
        await visit(path);
        continue;
      }
      if (metadata.size > PLUGIN_PACKAGE_LIMITS.fileBytes) {
        throw new PluginCliCommandError('invalid', [
          cliDiagnostic('CLI_DIST_FILE_LIMIT', packagePath, 'payload_invalid'),
        ]);
      }
      totalBytes += metadata.size;
      if (totalBytes > PLUGIN_PACKAGE_LIMITS.tarBytes || files.length + 1 >= PLUGIN_PACKAGE_LIMITS.fileCount) {
        throw new PluginCliCommandError('invalid', [cliDiagnostic('CLI_DIST_LIMIT', 'dist', 'payload_invalid')]);
      }
      files.push({ path: packagePath, bytes: await readFile(path), kind: 'file' });
    }
  };
  await visit(dist);
  if (files.length === 0) {
    throw new PluginCliCommandError('invalid', [cliDiagnostic('CLI_DIST_EMPTY', 'dist', 'payload_invalid')]);
  }
  return files;
};

const packageDiagnostics = (error: PluginPackageFormatError) =>
  error.diagnostics.map((item) =>
    cliDiagnostic(`CLI_PACKAGE_${item.code.toUpperCase()}`, item.path, 'payload_invalid', {
      package_code: item.code,
    }),
  );

export interface ValidatedPluginProject {
  readonly project: PluginProject;
  readonly files: readonly PluginPackageInputFile[];
  readonly packageBytes: Uint8Array;
  readonly inspection: ValidPluginPackageInspectionResult;
}

export const validatePluginProject = async (cwd: string, projectPath?: string): Promise<ValidatedPluginProject> => {
  const project = await resolvePluginProject(cwd, projectPath);
  validateProjectMetadata(project);
  await validateProjectImports(project);
  const files = await collectDistFiles(project);
  try {
    const packed = await packPluginPackage(files);
    const inspection = await inspectPluginPackage(packed.bytes);
    if (inspection.status === 'invalid') {
      throw new PluginCliCommandError(
        'invalid',
        inspection.diagnostics.map((item) =>
          cliDiagnostic(`CLI_PACKAGE_${item.code.toUpperCase()}`, item.path, 'payload_invalid', {
            package_code: item.code,
          }),
        ),
      );
    }
    return { project, files, packageBytes: packed.bytes, inspection };
  } catch (error) {
    if (error instanceof PluginCliCommandError) throw error;
    if (error instanceof PluginPackageFormatError)
      throw new PluginCliCommandError('invalid', packageDiagnostics(error));
    throw error;
  }
};
