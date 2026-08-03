export const PLUGIN_PACKAGE_FORMAT_VERSION = '0.1.0' as const;
export const PLUGIN_PACKAGE_EXTENSION = '.lxp' as const;
export const PLUGIN_PACKAGE_MANIFEST_PATH = 'manifest.json' as const;
export const PLUGIN_PACKAGE_CHECKSUMS_PATH = 'checksums.json' as const;
export const PLUGIN_PACKAGE_REQUIRED_RECORDS = [PLUGIN_PACKAGE_MANIFEST_PATH, PLUGIN_PACKAGE_CHECKSUMS_PATH] as const;

export const PLUGIN_PACKAGE_ZSTD_LEVEL = 19 as const;

export const PLUGIN_PACKAGE_LIMITS = Object.freeze({
  compressedBytes: 64 * 1024 * 1024,
  zstdWindowBytes: 64 * 1024 * 1024,
  tarBytes: 256 * 1024 * 1024,
  fileCount: 4096,
  fileBytes: 64 * 1024 * 1024,
  manifestBytes: 1024 * 1024,
  checksumsBytes: 4 * 1024 * 1024,
  pathBytes: 100,
  pathSegments: 16,
});

export const PLUGIN_PACKAGE_HOST_PRIVATE_FIELDS = Object.freeze([
  'source',
  'installed_path',
  'package_digest',
  'signature',
  'signature_status',
  'verified',
  'official',
  'grants',
  'granted_permissions',
  'enabled',
  'lifecycle',
  'runtime_state',
]);
