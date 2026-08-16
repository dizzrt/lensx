import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from '@rstest/core';

import {
  buildCanonicalChecksums,
  compressCanonicalTar,
  createCanonicalTar,
  createCanonicalTarHeader,
  inspectPluginPackage,
  PLUGIN_PACKAGE_CHECKSUMS_PATH,
  PLUGIN_PACKAGE_FORMAT_VERSION,
  PLUGIN_PACKAGE_LIMITS,
  PluginPackageFormatError,
  packPluginPackage,
  sha256Hex,
} from '../src/package-format/index.ts';

const rootDir = join(import.meta.dirname, '../../..');
const baseManifest = JSON.parse(
  readFileSync(join(rootDir, 'packages/plugin-contract/tests/fixtures/base.json'), 'utf8'),
) as Record<string, unknown>;

const manifestBytes = (manifest: unknown = baseManifest): Uint8Array =>
  Buffer.from(`${JSON.stringify(manifest)}\n`, 'utf8');

const canonicalInput = () => [
  { path: 'manifest.json', bytes: manifestBytes(), sourceMetadata: { mode: 0o755, mtime: 123 } },
  { path: 'dist/plugin.html', bytes: Buffer.from('<!doctype html><title>plugin</title>') },
  { path: 'assets/plugin-icon.svg', bytes: Buffer.from('<svg/>') },
  { path: 'assets/home.svg', bytes: Buffer.from('<svg><path/></svg>') },
];

const packageWithChecksums = async (
  files: readonly { readonly path: string; readonly bytes: Uint8Array }[],
  checksums: unknown,
): Promise<Uint8Array> =>
  compressCanonicalTar(
    createCanonicalTar([
      ...files,
      { path: PLUGIN_PACKAGE_CHECKSUMS_PATH, bytes: Buffer.from(`${JSON.stringify(checksums)}\n`, 'utf8') },
    ]),
  );

describe('plugin CLI internal package format', () => {
  it('packs and inspects a compatible package with stable facts', async () => {
    const packed = await packPluginPackage(canonicalInput());
    const result = await inspectPluginPackage(packed.bytes);

    expect(result.status).toBe('compatible');
    if (result.status !== 'compatible') throw new Error('expected a compatible package');
    expect(result.facts.packageFormatVersion).toBe(PLUGIN_PACKAGE_FORMAT_VERSION);
    expect(result.facts.packageDigest).toEqual(packed.digest);
    expect(result.facts.files.map((file) => file.path)).toEqual([
      'manifest.json',
      'checksums.json',
      'assets/home.svg',
      'assets/plugin-icon.svg',
      'dist/plugin.html',
    ]);
    expect(result.manifest.plugin_id).toBe('com.acme.workspace');
  });

  it('produces byte-for-byte identical output for input order and metadata changes', async () => {
    const first = await packPluginPackage(canonicalInput());
    const reordered = [...canonicalInput()]
      .reverse()
      .map((file) => ({ ...file, sourceMetadata: { mode: 0o600, mtime: 999 } }));
    const second = await packPluginPackage(reordered);

    expect(second.bytes).toEqual(first.bytes);
    expect(second.digest).toEqual(first.digest);
  });

  it('returns incompatible when only current-version compatibility fails', async () => {
    const incompatible = structuredClone(baseManifest);
    const compatibility = incompatible.compatibility as Record<string, Record<string, string>>;
    compatibility.lensx = { min_version: '0.2.0', max_version_exclusive: '0.3.0' };
    const packed = await packPluginPackage(
      canonicalInput().map((file) =>
        file.path === 'manifest.json' ? { ...file, bytes: manifestBytes(incompatible) } : file,
      ),
    );

    expect((await inspectPluginPackage(packed.bytes)).status).toBe('incompatible');
  });

  it.each([
    '../escape.js',
    'assets\\icon.svg',
    'assets/CON.txt',
    'assets/.hidden',
    `${'a'.repeat(101)}.js`,
    `${Array.from({ length: 17 }, () => 'a').join('/')}.js`,
  ])('rejects a non-portable path: %s', async (path) => {
    await expect(packPluginPackage([...canonicalInput(), { path, bytes: Buffer.from('x') }])).rejects.toBeInstanceOf(
      PluginPackageFormatError,
    );
  });

  it('rejects ASCII case-insensitive collisions', async () => {
    await expect(
      packPluginPackage([
        ...canonicalInput(),
        { path: 'assets/Icon.svg', bytes: Buffer.from('one') },
        { path: 'assets/icon.svg', bytes: Buffer.from('two') },
      ]),
    ).rejects.toMatchObject({ diagnostics: [expect.objectContaining({ code: 'path_case_collision' })] });
  });

  it('rejects non-file input and the package file-count limit before writing TAR bytes', async () => {
    const directoryInput = { path: 'assets/folder', bytes: Buffer.alloc(0), kind: 'directory' } as never;
    await expect(packPluginPackage([...canonicalInput(), directoryInput])).rejects.toBeInstanceOf(
      PluginPackageFormatError,
    );

    const excessive = Array.from({ length: PLUGIN_PACKAGE_LIMITS.fileCount - canonicalInput().length }, (_, index) => ({
      path: `files/f${index}.txt`,
      bytes: Buffer.alloc(0),
    }));
    await expect(packPluginPackage([...canonicalInput(), ...excessive])).rejects.toMatchObject({
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'file_count_exceeded' })]),
    });
  });

  it('rejects author-declared Host state through the Manifest Contract', async () => {
    const manifest = {
      ...baseManifest,
      source: 'official',
      package_digest: { algorithm: 'sha256', value: '0'.repeat(64) },
    };
    await expect(
      packPluginPackage(
        canonicalInput().map((file) =>
          file.path === 'manifest.json' ? { ...file, bytes: manifestBytes(manifest) } : file,
        ),
      ),
    ).rejects.toMatchObject({
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'manifest_invalid' })]),
    });
  });

  it('rejects non-canonical TAR metadata', async () => {
    const files = canonicalInput().map(({ path, bytes }) => ({ path, bytes }));
    const checksums = buildCanonicalChecksums(files);
    const tar = Buffer.from(
      createCanonicalTar([...files, { path: PLUGIN_PACKAGE_CHECKSUMS_PATH, bytes: checksums.bytes }]),
    );
    tar[100] = 0x37;
    const result = await inspectPluginPackage(await compressCanonicalTar(tar));

    expect(result).toMatchObject({
      status: 'invalid',
      diagnostics: [expect.objectContaining({ code: 'archive_metadata_invalid' })],
    });
    expect('facts' in result).toBe(false);
    expect('manifest' in result).toBe(false);
  });

  it('rejects checksum tampering and non-canonical checksum JSON', async () => {
    const files = canonicalInput().map(({ path, bytes }) => ({ path, bytes }));
    const checksums = buildCanonicalChecksums(files);
    const parsed = JSON.parse(Buffer.from(checksums.bytes).toString('utf8')) as {
      files: Array<{ path: string; size: number; sha256: string }>;
    };
    const firstChecksum = parsed.files[0];
    if (firstChecksum === undefined) throw new Error('expected at least one checksum record');
    firstChecksum.sha256 = '0'.repeat(64);
    const nonCanonical = Buffer.from(JSON.stringify(parsed, null, 2));
    const tar = createCanonicalTar([...files, { path: PLUGIN_PACKAGE_CHECKSUMS_PATH, bytes: nonCanonical }]);
    const result = await inspectPluginPackage(await compressCanonicalTar(tar));

    expect(result).toMatchObject({
      status: 'invalid',
      diagnostics: [expect.objectContaining({ code: 'checksums_invalid' })],
    });
  });

  it('rejects missing, extra, duplicate, size-mismatched, and digest-mismatched checksum records', async () => {
    const files = canonicalInput().map(({ path, bytes }) => ({ path, bytes }));
    const base = structuredClone(buildCanonicalChecksums(files).value);
    const mutations = [
      { ...base, files: base.files.slice(1) },
      { ...base, files: [...base.files, { path: 'extra.txt', size: 1, sha256: '0'.repeat(64) }] },
      { ...base, files: [...base.files, base.files.at(-1)] },
      { ...base, files: base.files.map((item, index) => (index === 0 ? { ...item, size: item.size + 1 } : item)) },
      {
        ...base,
        files: base.files.map((item, index) => (index === 0 ? { ...item, sha256: '0'.repeat(64) } : item)),
      },
    ];

    for (const checksums of mutations) {
      const result = await inspectPluginPackage(await packageWithChecksums(files, checksums));
      expect(result.status).toBe('invalid');
      if (result.status !== 'invalid') throw new Error('expected checksum failure');
      expect(result.diagnostics.some((item) => item.code.startsWith('checksum'))).toBe(true);
    }
  });

  it('rejects concatenated frames and trailing bytes before decoding', async () => {
    const packed = await packPluginPackage(canonicalInput());
    const concatenated = Buffer.concat([packed.bytes, packed.bytes]);
    const trailing = Buffer.concat([packed.bytes, Buffer.from('private/path')]);

    expect(await inspectPluginPackage(concatenated)).toMatchObject({
      status: 'invalid',
      diagnostics: [expect.objectContaining({ code: 'frame_multiple_forbidden', path: '/frame' })],
    });
    expect(await inspectPluginPackage(trailing)).toMatchObject({
      status: 'invalid',
      diagnostics: [expect.objectContaining({ code: 'frame_trailing_bytes', path: '/frame' })],
    });
  });

  it('rejects skippable, dictionary, checksum-free, over-window, oversized, and corrupt frames', async () => {
    const packed = await packPluginPackage(canonicalInput());
    const dictionary = Buffer.from(packed.bytes);
    dictionary[4] = (dictionary[4] ?? 0) | 0x01;
    dictionary[5] = 1;
    const checksumFree = Buffer.from(packed.bytes);
    checksumFree[4] = (checksumFree[4] ?? 0) & ~0x04;
    const corrupt = Buffer.from(packed.bytes);
    corrupt[corrupt.length - 1] = (corrupt.at(-1) ?? 0) ^ 0xff;
    const skippable = Buffer.from([0x50, 0x2a, 0x4d, 0x18, 0, 0, 0, 0]);
    const overWindow = Buffer.from([0x28, 0xb5, 0x2f, 0xfd, 0x44, 17 << 3, 0, 0]);
    const oversizedContent = Buffer.alloc(13);
    oversizedContent.set([0x28, 0xb5, 0x2f, 0xfd, 0xa4], 0);
    oversizedContent.writeUInt32LE(PLUGIN_PACKAGE_LIMITS.tarBytes + 1, 5);

    const expectedCodes = [
      [skippable, 'frame_invalid'],
      [dictionary, 'frame_dictionary_forbidden'],
      [checksumFree, 'frame_checksum_required'],
      [overWindow, 'frame_window_exceeded'],
      [oversizedContent, 'frame_content_size_invalid'],
      [corrupt, 'frame_corrupt'],
    ] as const;
    for (const [bytes, code] of expectedCodes) {
      expect(await inspectPluginPackage(bytes)).toMatchObject({
        status: 'invalid',
        diagnostics: [expect.objectContaining({ code, path: '/frame' })],
      });
    }
  });

  it('rejects non-regular TAR entry types', async () => {
    const files = canonicalInput().map(({ path, bytes }) => ({ path, bytes }));
    const tar = Buffer.from(
      createCanonicalTar([
        ...files,
        { path: PLUGIN_PACKAGE_CHECKSUMS_PATH, bytes: buildCanonicalChecksums(files).bytes },
      ]),
    );
    tar[156] = 0x32;
    const result = await inspectPluginPackage(await compressCanonicalTar(tar));
    expect(result).toMatchObject({
      status: 'invalid',
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'archive_metadata_invalid' })]),
    });
  });

  it('rejects declared content and file sizes before allocating payloads', async () => {
    const oversizedHeader = createCanonicalTarHeader('manifest.json', PLUGIN_PACKAGE_LIMITS.manifestBytes + 1);
    const tar = Buffer.concat([oversizedHeader, Buffer.alloc(1024)]);
    const result = await inspectPluginPackage(await compressCanonicalTar(tar));

    expect(result).toMatchObject({
      status: 'invalid',
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'metadata_size_exceeded' })]),
    });
  });

  it('uses lower-case SHA-256 for file and package identity', async () => {
    const packed = await packPluginPackage(canonicalInput());
    expect(packed.digest).toEqual({ algorithm: 'sha256', value: sha256Hex(packed.bytes) });
    expect(packed.digest.value).toMatch(/^[0-9a-f]{64}$/u);
  });
});
