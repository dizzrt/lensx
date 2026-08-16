import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { compress } from '@structured-world/structured-zstd';

import {
  buildCanonicalChecksums,
  compressCanonicalTar,
  createCanonicalTar,
  inspectPluginPackage,
  PLUGIN_PACKAGE_CHECKSUMS_PATH,
  packPluginPackage,
} from '../packages/plugin-cli/dist/src/package-format/index.js';

const rootDir = join(import.meta.dirname, '..');
const fixtureRoot = join(rootDir, 'fixtures/plugin-package-format');
const writeMode = process.argv.includes('--write');
const baseManifest = JSON.parse(
  readFileSync(join(rootDir, 'packages/plugin-contract/tests/fixtures/base.json'), 'utf8'),
) as Record<string, unknown>;

const manifestBytes = (manifest: unknown): Uint8Array => Buffer.from(`${JSON.stringify(manifest)}\n`, 'utf8');
const payloadFiles = (manifest: unknown = baseManifest) => [
  { path: 'manifest.json', bytes: manifestBytes(manifest) },
  { path: 'dist/plugin.html', bytes: Buffer.from('<!doctype html><title>plugin</title>') },
  { path: 'assets/plugin-icon.svg', bytes: Buffer.from('<svg/>') },
  { path: 'assets/home.svg', bytes: Buffer.from('<svg><path/></svg>') },
];

const rawPackage = async (
  files: readonly { readonly path: string; readonly bytes: Uint8Array }[],
  checksumsBytes = buildCanonicalChecksums(files).bytes,
): Promise<Uint8Array> =>
  compressCanonicalTar(createCanonicalTar([...files, { path: PLUGIN_PACKAGE_CHECKSUMS_PATH, bytes: checksumsBytes }]));

interface FixtureOutput {
  name: string;
  category: 'valid' | 'invalid' | 'incompatible' | 'reproducible';
  bytes: Uint8Array;
}

const buildFixtures = async (): Promise<FixtureOutput[]> => {
  const valid = await packPluginPackage(payloadFiles());
  const incompatibleManifest = structuredClone(baseManifest);
  (incompatibleManifest.compatibility as Record<string, Record<string, string>>).lensx = {
    min_version: '0.2.0',
    max_version_exclusive: '0.3.0',
  };
  const incompatible = await packPluginPackage(payloadFiles(incompatibleManifest));
  const legacyIframeManifest = structuredClone(baseManifest);
  legacyIframeManifest.manifest_version = '0.2.0';
  (legacyIframeManifest.runtime as Record<string, unknown>).kind = 'iframe';
  const legacyIframe = await rawPackage(payloadFiles(legacyIframeManifest));

  const missingResourceFiles = payloadFiles().filter((file) => file.path !== 'dist/plugin.html');
  const hostFieldsManifest = {
    ...baseManifest,
    source: 'official',
    installed_path: '/private/plugin',
    package_digest: { algorithm: 'sha256', value: '0'.repeat(64) },
    signature: 'author-claim',
    grants: ['filesystem'],
    lifecycle: 'enabled',
  };
  const hostFieldFiles = payloadFiles(hostFieldsManifest);

  const versionFiles = payloadFiles();
  const versionChecksums = buildCanonicalChecksums(versionFiles).value;
  const invalidVersionBytes = Buffer.from(
    `${JSON.stringify({ ...versionChecksums, package_format_version: '0.2.0' })}\n`,
    'utf8',
  );

  const tamperedFiles = payloadFiles();
  const tamperedChecksums = structuredClone(buildCanonicalChecksums(tamperedFiles).value);
  const firstChecksum = tamperedChecksums.files[0];
  if (firstChecksum !== undefined) {
    Object.assign(firstChecksum, { sha256: '0'.repeat(64) });
  }

  const metadataFiles = payloadFiles();
  const metadataTar = Buffer.from(
    createCanonicalTar([
      ...metadataFiles,
      { path: PLUGIN_PACKAGE_CHECKSUMS_PATH, bytes: buildCanonicalChecksums(metadataFiles).bytes },
    ]),
  );
  metadataTar[100] = 0x37;

  return [
    { name: 'complete-compatible', category: 'valid', bytes: valid.bytes },
    { name: 'reference-repeatable', category: 'reproducible', bytes: valid.bytes },
    { name: 'manifest-incompatible', category: 'incompatible', bytes: incompatible.bytes },
    { name: 'legacy-iframe-runtime', category: 'incompatible', bytes: legacyIframe },
    { name: 'not-zstandard', category: 'invalid', bytes: Buffer.from('not a plugin package') },
    {
      name: 'trailing-bytes',
      category: 'invalid',
      bytes: Buffer.concat([valid.bytes, Buffer.from('trailing')]),
    },
    { name: 'missing-runtime-resource', category: 'invalid', bytes: await rawPackage(missingResourceFiles) },
    { name: 'host-private-fields', category: 'invalid', bytes: await rawPackage(hostFieldFiles) },
    {
      name: 'unsupported-package-version',
      category: 'invalid',
      bytes: await rawPackage(versionFiles, invalidVersionBytes),
    },
    {
      name: 'checksum-tampered',
      category: 'invalid',
      bytes: await rawPackage(tamperedFiles, Buffer.from(`${JSON.stringify(tamperedChecksums)}\n`, 'utf8')),
    },
    { name: 'noncanonical-tar-metadata', category: 'invalid', bytes: await compressCanonicalTar(metadataTar) },
    { name: 'empty-package', category: 'invalid', bytes: await compress(Buffer.alloc(1024), 19, true) },
  ];
};

const fixtures = await buildFixtures();
const expectations = [];
const drift: string[] = [];
for (const fixture of fixtures) {
  const relativeFile = `${fixture.category}/${fixture.name}.lxp`;
  const absoluteFile = join(fixtureRoot, relativeFile);
  const expected = await inspectPluginPackage(fixture.bytes);
  expectations.push({ name: fixture.name, category: fixture.category, file: relativeFile, expected });
  if (writeMode) {
    mkdirSync(join(fixtureRoot, fixture.category), { recursive: true });
    writeFileSync(absoluteFile, fixture.bytes);
  } else if (!existsSync(absoluteFile) || !readFileSync(absoluteFile).equals(Buffer.from(fixture.bytes))) {
    drift.push(relativeFile);
  }
}

const expectationsBytes = Buffer.from(`${JSON.stringify(expectations, null, 2)}\n`, 'utf8');
const expectationsFile = join(fixtureRoot, 'expectations.json');
if (writeMode) {
  mkdirSync(fixtureRoot, { recursive: true });
  writeFileSync(expectationsFile, expectationsBytes);
} else if (!existsSync(expectationsFile) || !readFileSync(expectationsFile).equals(expectationsBytes)) {
  drift.push('expectations.json');
}

if (drift.length > 0) {
  throw new Error(
    `Plugin package fixtures drifted: ${drift.join(', ')}. Review the change, then run pnpm run generate:plugin-package-format-fixtures.`,
  );
}

console.log(`${writeMode ? 'Generated' : 'Checked'} ${fixtures.length} plugin package fixtures.`);
