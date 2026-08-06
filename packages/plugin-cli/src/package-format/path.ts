import { PLUGIN_PACKAGE_CHECKSUMS_PATH, PLUGIN_PACKAGE_LIMITS, PLUGIN_PACKAGE_MANIFEST_PATH } from './constants.js';
import { packageDiagnostic } from './diagnostics.js';
import type { PluginPackageDiagnostic } from './types.js';

const SEGMENT_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/u;
const WINDOWS_RESERVED_BASENAMES = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  'com1',
  'com2',
  'com3',
  'com4',
  'com5',
  'com6',
  'com7',
  'com8',
  'com9',
  'lpt1',
  'lpt2',
  'lpt3',
  'lpt4',
  'lpt5',
  'lpt6',
  'lpt7',
  'lpt8',
  'lpt9',
]);

export const comparePathBytes = (left: string, right: string): number =>
  Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));

export const foldAsciiPath = (path: string): string => path.replace(/[A-Z]/gu, (value) => value.toLowerCase());

export const validatePortablePackagePath = (path: string): PluginPackageDiagnostic[] => {
  const diagnostics: PluginPackageDiagnostic[] = [];
  const bytes = Buffer.from(path, 'utf8');
  const segments = path.split('/');
  if (
    path.length === 0 ||
    path !== path.normalize('NFC') ||
    path.startsWith('/') ||
    path.endsWith('/') ||
    path.includes('\\') ||
    bytes.length > PLUGIN_PACKAGE_LIMITS.pathBytes ||
    segments.length > PLUGIN_PACKAGE_LIMITS.pathSegments ||
    segments.some((segment) => segment === '' || segment === '.' || segment === '..' || !SEGMENT_PATTERN.test(segment))
  ) {
    diagnostics.push(packageDiagnostic('path_invalid', path || '/archive'));
  }
  for (const segment of segments) {
    const basename = segment.split('.')[0]?.toLowerCase() ?? '';
    if (WINDOWS_RESERVED_BASENAMES.has(basename)) {
      diagnostics.push(packageDiagnostic('path_reserved', path));
      break;
    }
  }
  return diagnostics;
};

export const validatePathCollection = (paths: readonly string[]): PluginPackageDiagnostic[] => {
  const diagnostics = paths.flatMap(validatePortablePackagePath);
  const exact = new Set<string>();
  const folded = new Map<string, string>();
  for (const path of paths) {
    if (exact.has(path)) diagnostics.push(packageDiagnostic('path_invalid', path));
    exact.add(path);
    const key = foldAsciiPath(path);
    const previous = folded.get(key);
    if (previous !== undefined && previous !== path) {
      diagnostics.push(packageDiagnostic('path_case_collision', path));
    }
    folded.set(key, path);
  }
  return diagnostics;
};

export const isMetadataPath = (path: string): boolean =>
  path === PLUGIN_PACKAGE_MANIFEST_PATH || path === PLUGIN_PACKAGE_CHECKSUMS_PATH;
