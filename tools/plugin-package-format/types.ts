import type { NormalizedPluginManifest, PluginManifestCompatibility } from '@lensx/plugin-contract';

export type PluginPackageStatus = 'invalid' | 'compatible' | 'incompatible';

export type PluginPackageDiagnosticCode =
  | 'archive_header_invalid'
  | 'archive_incomplete'
  | 'archive_metadata_invalid'
  | 'archive_order_invalid'
  | 'archive_termination_invalid'
  | 'checksum_algorithm_invalid'
  | 'checksum_coverage_invalid'
  | 'checksum_digest_invalid'
  | 'checksum_record_invalid'
  | 'checksum_size_invalid'
  | 'checksums_invalid'
  | 'compressed_size_exceeded'
  | 'file_count_exceeded'
  | 'file_size_exceeded'
  | 'frame_checksum_required'
  | 'frame_content_size_invalid'
  | 'frame_corrupt'
  | 'frame_dictionary_forbidden'
  | 'frame_invalid'
  | 'frame_multiple_forbidden'
  | 'frame_trailing_bytes'
  | 'frame_window_exceeded'
  | 'manifest_invalid'
  | 'metadata_size_exceeded'
  | 'package_version_invalid'
  | 'path_case_collision'
  | 'path_invalid'
  | 'path_reserved'
  | 'resource_missing'
  | 'tar_size_exceeded';

export interface PluginPackageDiagnostic {
  readonly code: PluginPackageDiagnosticCode;
  readonly path: string;
  readonly message: string;
}

export interface AlgorithmLabelledDigest {
  readonly algorithm: 'sha256';
  readonly value: string;
}

export interface PluginPackageFileFact {
  readonly path: string;
  readonly size: number;
  readonly sha256: string;
  readonly checksumCovered: boolean;
}

export interface PluginPackageFacts {
  readonly packageFormatVersion: '0.1.0';
  readonly compressedSize: number;
  readonly decompressedSize: number;
  readonly fileCount: number;
  readonly files: readonly PluginPackageFileFact[];
  readonly packageDigest: AlgorithmLabelledDigest;
}

export interface InvalidPluginPackageInspectionResult {
  readonly status: 'invalid';
  readonly diagnostics: readonly PluginPackageDiagnostic[];
}

export interface ValidPluginPackageInspectionResult {
  readonly status: 'compatible' | 'incompatible';
  readonly manifest: NormalizedPluginManifest;
  readonly compatibility: PluginManifestCompatibility;
  readonly facts: PluginPackageFacts;
  readonly diagnostics: readonly [];
}

export type PluginPackageInspectionResult = InvalidPluginPackageInspectionResult | ValidPluginPackageInspectionResult;

export interface PluginPackageInputFile {
  readonly path: string;
  readonly bytes: Uint8Array;
  readonly kind?: 'file';
  readonly sourceMetadata?: Readonly<Record<string, unknown>>;
}

export interface PackedPluginPackage {
  readonly bytes: Uint8Array;
  readonly digest: AlgorithmLabelledDigest;
}
