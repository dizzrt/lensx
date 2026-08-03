import { createHash } from 'node:crypto';

import { PLUGIN_PACKAGE_CHECKSUMS_PATH, PLUGIN_PACKAGE_FORMAT_VERSION } from './constants.ts';
import { packageDiagnostic } from './diagnostics.ts';
import { comparePathBytes } from './path.ts';
import type { PluginPackageDiagnostic, PluginPackageFileFact } from './types.ts';

export interface PluginPackageChecksumRecord {
  readonly path: string;
  readonly size: number;
  readonly sha256: string;
}

export interface PluginPackageChecksums {
  readonly package_format_version: '0.1.0';
  readonly algorithm: 'sha256';
  readonly files: readonly PluginPackageChecksumRecord[];
}

export const sha256Hex = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

export const buildCanonicalChecksums = (
  files: readonly { readonly path: string; readonly bytes: Uint8Array }[],
): { readonly value: PluginPackageChecksums; readonly bytes: Uint8Array } => {
  const records = files
    .filter((file) => file.path !== PLUGIN_PACKAGE_CHECKSUMS_PATH)
    .map((file) => ({ path: file.path, size: file.bytes.byteLength, sha256: sha256Hex(file.bytes) }))
    .sort((left, right) => comparePathBytes(left.path, right.path));
  const value: PluginPackageChecksums = {
    package_format_version: PLUGIN_PACKAGE_FORMAT_VERSION,
    algorithm: 'sha256',
    files: records,
  };
  return { value, bytes: Buffer.from(`${JSON.stringify(value)}\n`, 'utf8') };
};

const isChecksumRecord = (value: unknown): value is PluginPackageChecksumRecord => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).join(',') === 'path,size,sha256' &&
    typeof record.path === 'string' &&
    Number.isSafeInteger(record.size) &&
    (record.size as number) >= 0 &&
    typeof record.sha256 === 'string' &&
    /^[0-9a-f]{64}$/u.test(record.sha256)
  );
};

export const parseCanonicalChecksums = (
  bytes: Uint8Array,
): { readonly value?: PluginPackageChecksums; readonly diagnostics: readonly PluginPackageDiagnostic[] } => {
  let input: unknown;
  try {
    input = JSON.parse(Buffer.from(bytes).toString('utf8')) as unknown;
  } catch {
    return { diagnostics: [packageDiagnostic('checksums_invalid', PLUGIN_PACKAGE_CHECKSUMS_PATH)] };
  }
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { diagnostics: [packageDiagnostic('checksums_invalid', PLUGIN_PACKAGE_CHECKSUMS_PATH)] };
  }
  const record = input as Record<string, unknown>;
  if (
    Object.keys(record).join(',') !== 'package_format_version,algorithm,files' ||
    !Array.isArray(record.files) ||
    !record.files.every(isChecksumRecord)
  ) {
    return { diagnostics: [packageDiagnostic('checksums_invalid', PLUGIN_PACKAGE_CHECKSUMS_PATH)] };
  }
  if (record.package_format_version !== PLUGIN_PACKAGE_FORMAT_VERSION) {
    return { diagnostics: [packageDiagnostic('package_version_invalid', PLUGIN_PACKAGE_CHECKSUMS_PATH)] };
  }
  if (record.algorithm !== 'sha256') {
    return { diagnostics: [packageDiagnostic('checksum_algorithm_invalid', PLUGIN_PACKAGE_CHECKSUMS_PATH)] };
  }
  const value = input as unknown as PluginPackageChecksums;
  const canonical = Buffer.from(`${JSON.stringify(value)}\n`, 'utf8');
  if (!Buffer.from(bytes).equals(canonical)) {
    return { diagnostics: [packageDiagnostic('checksums_invalid', PLUGIN_PACKAGE_CHECKSUMS_PATH)] };
  }
  const paths = value.files.map((file) => file.path);
  const sorted = [...paths].sort(comparePathBytes);
  if (new Set(paths).size !== paths.length || paths.some((path, index) => path !== sorted[index])) {
    return { diagnostics: [packageDiagnostic('checksum_record_invalid', PLUGIN_PACKAGE_CHECKSUMS_PATH)] };
  }
  return { value, diagnostics: [] };
};

export const validateChecksumCoverage = (
  checksums: PluginPackageChecksums,
  files: readonly PluginPackageFileFact[],
): PluginPackageDiagnostic[] => {
  const diagnostics: PluginPackageDiagnostic[] = [];
  const expectedFiles = files.filter((file) => file.path !== PLUGIN_PACKAGE_CHECKSUMS_PATH);
  const byPath = new Map(expectedFiles.map((file) => [file.path, file]));
  if (checksums.files.length !== expectedFiles.length) {
    diagnostics.push(packageDiagnostic('checksum_coverage_invalid', PLUGIN_PACKAGE_CHECKSUMS_PATH));
  }
  for (const record of checksums.files) {
    const file = byPath.get(record.path);
    if (file === undefined) {
      diagnostics.push(packageDiagnostic('checksum_coverage_invalid', record.path));
      continue;
    }
    byPath.delete(record.path);
    if (record.size !== file.size) diagnostics.push(packageDiagnostic('checksum_size_invalid', record.path));
    if (record.sha256 !== file.sha256) diagnostics.push(packageDiagnostic('checksum_digest_invalid', record.path));
  }
  for (const path of byPath.keys()) diagnostics.push(packageDiagnostic('checksum_coverage_invalid', path));
  return diagnostics;
};
