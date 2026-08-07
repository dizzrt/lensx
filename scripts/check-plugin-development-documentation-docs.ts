import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

import { HOST_API_METHOD_CATALOG, HOST_API_PERMISSION_CATALOG, PLUGIN_HOST_API_VERSION } from '@lensx/plugin-contract';

import {
  type DocumentationDiagnostic,
  type DocumentationFile,
  type HostApiProvider,
  type PublicPackageFact,
  validateDeveloperDocumentation,
  validateHostApiDocumentationCoverage,
  validatePublicPackageCoverage,
  validateRunnableBlocks,
} from './plugin-development-documentation.ts';

const repositoryRoot = resolve(import.meta.dirname, '..');
const toPosix = (path: string): string => path.split(sep).join('/');
const read = (path: string): string => readFileSync(resolve(repositoryRoot, path), 'utf8');

const collectFiles = (directory: string, include: (path: string) => boolean): string[] =>
  readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory())
        return entry.name === 'node_modules' || entry.name === 'dist' ? [] : collectFiles(path, include);
      return entry.isFile() && include(path) ? [path] : [];
    });

const documentationFiles: DocumentationFile[] = collectFiles(resolve(repositoryRoot, 'docs'), (path) =>
  path.endsWith('.md'),
).map((path) => ({ path: toPosix(relative(repositoryRoot, path)), source: readFileSync(path, 'utf8') }));
const developerFiles = documentationFiles.filter(({ path }) => /^docs\/(?:en|zh)\/plugin-development\//u.test(path));

const sourceRoots = ['packages/plugin-cli/templates', 'examples/plugins'];
const projectSources = Object.fromEntries(
  sourceRoots.flatMap((root) => {
    const absolute = resolve(repositoryRoot, root);
    return existsSync(absolute)
      ? collectFiles(absolute, (path) => statSync(path).isFile()).map((path) => [
          toPosix(relative(repositoryRoot, path)),
          readFileSync(path, 'utf8'),
        ])
      : [];
  }),
);
const rootManifest = JSON.parse(read('package.json')) as { readonly scripts?: Readonly<Record<string, string>> };

const packages = ['plugin-contract', 'plugin-sdk', 'plugin-ui', 'plugin-testkit', 'plugin-cli'].map((directory) => {
  const metadata = JSON.parse(read(`packages/${directory}/package.json`)) as {
    readonly name: string;
    readonly version: string;
    readonly exports?: Readonly<Record<string, unknown>>;
  };
  return {
    name: metadata.name,
    version: metadata.version,
    exports: Object.keys(metadata.exports ?? {}),
  } satisfies PublicPackageFact;
});

const stringLiterals = (source: string, constant: string): string[] => {
  const declaration = source.indexOf(`const ${constant}`);
  const open = declaration < 0 ? -1 : source.indexOf('[', declaration);
  const close = open < 0 ? -1 : source.indexOf(']', open);
  if (declaration < 0 || open < 0 || close < 0) {
    throw new Error(`Unable to derive production documentation fact ${constant}.`);
  }
  return [...source.slice(open + 1, close).matchAll(/['"]([^'"]+)['"]/gu)].flatMap((item) =>
    item[1] === undefined ? [] : [item[1]],
  );
};
const dispatcher = read('src/app/plugins/runtime/host-api-dispatcher.ts');
const storage = read('src/app/plugins/storage/types.ts');
const providers: Record<string, HostApiProvider> = {};
for (const method of stringLiterals(dispatcher, 'BASE_IMPLEMENTED_METHODS')) providers[method] = 'base';
for (const method of stringLiterals(storage, 'PLUGIN_SCOPED_STORAGE_METHODS')) providers[method] = 'storage';
for (const method of stringLiterals(dispatcher, 'clipboardMethodSet')) providers[method] = 'clipboard';
for (const marker of [
  'baseImplementedMethodSet',
  'storageMethodSet',
  'clipboardMethodSet',
  'PLUGIN_PERMISSION_CATALOG',
]) {
  if (!dispatcher.includes(marker)) throw new Error(`Production Dispatcher evidence is missing ${marker}.`);
}

const hostApiSchema = JSON.parse(read('packages/plugin-contract/schema/host-api.schema.json')) as {
  readonly $defs: Readonly<Record<string, { readonly enum?: readonly string[] }>>;
};
const errorCodes = hostApiSchema.$defs.HostApiErrorCodeInput?.enum;
if (errorCodes === undefined) throw new Error('Host API error Schema enum is unavailable.');

const diagnostics: DocumentationDiagnostic[] = [
  ...validateDeveloperDocumentation(documentationFiles),
  ...validateRunnableBlocks({
    files: developerFiles,
    projectSources,
    rootScripts: new Set(Object.keys(rootManifest.scripts ?? {})),
  }),
];
const publicPackages = documentationFiles.find(({ path }) => path === 'docs/en/plugin-development/public-packages.md');
if (publicPackages !== undefined) diagnostics.push(...validatePublicPackageCoverage(publicPackages.source, packages));
const hostApi = documentationFiles.find(({ path }) => path === 'docs/en/plugin-development/host-api.md');
if (hostApi !== undefined) {
  diagnostics.push(
    ...validateHostApiDocumentationCoverage(hostApi.source, {
      methods: HOST_API_METHOD_CATALOG,
      permissions: HOST_API_PERMISSION_CATALOG.map(({ permission }) => permission),
      errorCodes,
      hostApiVersion: PLUGIN_HOST_API_VERSION,
      providers,
    }),
  );
}

for (const locale of ['en', 'zh'] as const) {
  const indexPath = `docs/${locale}/index.md`;
  if (!read(indexPath).includes(`plugin-development/index.md`)) {
    diagnostics.push({
      code: 'index/hub-missing',
      path: indexPath,
      message: 'Top-level documentation index does not link the developer hub.',
    });
  }
}

if (diagnostics.length > 0) {
  for (const item of diagnostics.slice(0, 64)) console.error(`${item.code}: ${item.path}: ${item.message}`);
  process.exit(1);
}
console.log(
  `Plugin development docs passed: ${developerFiles.length} bilingual pages, ${packages.length} public packages, ${HOST_API_METHOD_CATALOG.length} Host API methods.`,
);
