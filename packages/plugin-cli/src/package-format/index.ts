import type { PluginHostVersions } from '@lensx/plugin-contract';

import { buildCanonicalChecksums, parseCanonicalChecksums, sha256Hex, validateChecksumCoverage } from './checksums.js';
import {
  PLUGIN_PACKAGE_CHECKSUMS_PATH,
  PLUGIN_PACKAGE_FORMAT_VERSION,
  PLUGIN_PACKAGE_LIMITS,
  PLUGIN_PACKAGE_MANIFEST_PATH,
} from './constants.js';
import { PluginPackageFormatError, packageDiagnostic, sortPackageDiagnostics } from './diagnostics.js';
import { DEFAULT_PLUGIN_HOST_VERSIONS, validatePackageManifest } from './manifest.js';
import { comparePathBytes, validatePathCollection } from './path.js';
import { createCanonicalTar, createCanonicalTarHeader } from './tar.js';
import type { PackedPluginPackage, PluginPackageInputFile, PluginPackageInspectionResult } from './types.js';
import { compressCanonicalTar, inspectZstandardTar } from './zstd.js';

export * from './constants.js';
export { PluginPackageFormatError, sortPackageDiagnostics } from './diagnostics.js';
export type * from './types.js';
export { compressCanonicalTar } from './zstd.js';
export { buildCanonicalChecksums, createCanonicalTar, createCanonicalTarHeader, sha256Hex };

export const inspectPluginPackage = async (
  packageBytes: Uint8Array,
  currentVersions: PluginHostVersions = DEFAULT_PLUGIN_HOST_VERSIONS,
): Promise<PluginPackageInspectionResult> => {
  const zstandard = await inspectZstandardTar(packageBytes);
  if (!('inspection' in zstandard)) return { status: 'invalid', diagnostics: zstandard.diagnostics };
  const archive = zstandard.inspection;
  if (archive.diagnostics.length > 0 || archive.manifestBytes === undefined || archive.checksumsBytes === undefined) {
    const missing = [
      ...(archive.manifestBytes === undefined
        ? [packageDiagnostic('archive_order_invalid', PLUGIN_PACKAGE_MANIFEST_PATH)]
        : []),
      ...(archive.checksumsBytes === undefined
        ? [packageDiagnostic('archive_order_invalid', PLUGIN_PACKAGE_CHECKSUMS_PATH)]
        : []),
    ];
    return { status: 'invalid', diagnostics: sortPackageDiagnostics([...archive.diagnostics, ...missing]) };
  }
  const checksums = parseCanonicalChecksums(archive.checksumsBytes);
  if (checksums.value === undefined) return { status: 'invalid', diagnostics: checksums.diagnostics };
  const checksumDiagnostics = validateChecksumCoverage(checksums.value, archive.files);
  if (checksumDiagnostics.length > 0) {
    return { status: 'invalid', diagnostics: sortPackageDiagnostics(checksumDiagnostics) };
  }
  const manifest = validatePackageManifest(archive.manifestBytes, archive.files, currentVersions);
  const facts = {
    packageFormatVersion: PLUGIN_PACKAGE_FORMAT_VERSION,
    compressedSize: packageBytes.byteLength,
    decompressedSize: archive.decompressedSize,
    fileCount: archive.files.length,
    files: archive.files,
    packageDigest: { algorithm: 'sha256' as const, value: sha256Hex(packageBytes) },
  };
  if ('incompatible' in manifest) {
    return { status: 'incompatible', facts, diagnostics: sortPackageDiagnostics(manifest.diagnostics) };
  }
  if (!('normalized' in manifest)) {
    return { status: 'invalid', diagnostics: sortPackageDiagnostics(manifest.diagnostics) };
  }
  return {
    status: manifest.normalized.status,
    manifest: manifest.normalized.manifest,
    compatibility: manifest.normalized.compatibility,
    facts,
    diagnostics: [],
  };
};

export const packPluginPackage = async (
  inputFiles: readonly PluginPackageInputFile[],
): Promise<PackedPluginPackage> => {
  const diagnostics = validatePathCollection(inputFiles.map((file) => file.path));
  if (inputFiles.some((file) => file.kind !== undefined && file.kind !== 'file')) {
    diagnostics.push(packageDiagnostic('archive_metadata_invalid', '/input'));
  }
  if (inputFiles.some((file) => file.path === PLUGIN_PACKAGE_CHECKSUMS_PATH)) {
    diagnostics.push(packageDiagnostic('checksum_record_invalid', PLUGIN_PACKAGE_CHECKSUMS_PATH));
  }
  if (!inputFiles.some((file) => file.path === PLUGIN_PACKAGE_MANIFEST_PATH)) {
    diagnostics.push(packageDiagnostic('archive_order_invalid', PLUGIN_PACKAGE_MANIFEST_PATH));
  }
  if (inputFiles.length + 1 > PLUGIN_PACKAGE_LIMITS.fileCount) {
    diagnostics.push(packageDiagnostic('file_count_exceeded', '/input'));
  }
  for (const file of inputFiles) {
    const limit =
      file.path === PLUGIN_PACKAGE_MANIFEST_PATH
        ? PLUGIN_PACKAGE_LIMITS.manifestBytes
        : PLUGIN_PACKAGE_LIMITS.fileBytes;
    if (file.bytes.byteLength > limit) {
      diagnostics.push(
        packageDiagnostic(
          file.path === PLUGIN_PACKAGE_MANIFEST_PATH ? 'metadata_size_exceeded' : 'file_size_exceeded',
          file.path,
        ),
      );
    }
  }
  if (diagnostics.length > 0) throw new PluginPackageFormatError(diagnostics);

  const copied = inputFiles
    .map((file) => ({ path: file.path, bytes: Uint8Array.from(file.bytes) }))
    .sort((left, right) => comparePathBytes(left.path, right.path));
  const checksums = buildCanonicalChecksums(copied);
  if (checksums.bytes.byteLength > PLUGIN_PACKAGE_LIMITS.checksumsBytes) {
    throw new PluginPackageFormatError([packageDiagnostic('metadata_size_exceeded', PLUGIN_PACKAGE_CHECKSUMS_PATH)]);
  }
  const tarBytes = createCanonicalTar([...copied, { path: PLUGIN_PACKAGE_CHECKSUMS_PATH, bytes: checksums.bytes }]);
  if (tarBytes.byteLength > PLUGIN_PACKAGE_LIMITS.tarBytes) {
    throw new PluginPackageFormatError([packageDiagnostic('tar_size_exceeded', '/archive')]);
  }
  const packageBytes = await compressCanonicalTar(tarBytes);
  if (packageBytes.byteLength > PLUGIN_PACKAGE_LIMITS.compressedBytes) {
    throw new PluginPackageFormatError([packageDiagnostic('compressed_size_exceeded', '/frame')]);
  }
  const inspection = await inspectPluginPackage(packageBytes);
  if (inspection.status === 'invalid') throw new PluginPackageFormatError(inspection.diagnostics);
  return {
    bytes: packageBytes,
    digest: { algorithm: 'sha256', value: sha256Hex(packageBytes) },
  };
};
