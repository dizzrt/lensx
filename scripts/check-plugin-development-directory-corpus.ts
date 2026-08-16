import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PLUGIN_PACKAGE_LIMITS } from '../packages/plugin-cli/dist/src/package-format/constants.js';
import { validatePackageManifest } from '../packages/plugin-cli/dist/src/package-format/manifest.js';
import { validatePathCollection } from '../packages/plugin-cli/dist/src/package-format/path.js';

interface CorpusCase {
  readonly name: string;
  readonly manifest: 'compatible' | 'incompatible' | 'invalid' | 'legacy_manifest' | 'legacy_iframe';
  readonly paths: readonly string[];
  readonly virtual_file_count?: number;
  readonly virtual_file_size?: number;
  readonly virtual_total_size?: number;
  readonly expected: 'compatible' | 'incompatible' | 'invalid';
}

const root = resolve(import.meta.dirname, '..');
const corpus = JSON.parse(
  await readFile(resolve(root, 'fixtures/plugin-development-directory/cases.json'), 'utf8'),
) as CorpusCase[];
const baseManifest = JSON.parse(
  await readFile(resolve(root, 'packages/plugin-contract/tests/fixtures/base.json'), 'utf8'),
) as Record<string, unknown>;

for (const fixture of corpus) {
  let actual: CorpusCase['expected'] = 'invalid';
  const limitInvalid =
    (fixture.virtual_file_count ?? fixture.paths.length) > PLUGIN_PACKAGE_LIMITS.fileCount ||
    (fixture.virtual_file_size ?? 1) > PLUGIN_PACKAGE_LIMITS.fileBytes ||
    (fixture.virtual_total_size ?? fixture.paths.length) > PLUGIN_PACKAGE_LIMITS.tarBytes;
  const pathInvalid = validatePathCollection(fixture.paths).length > 0;
  if (!limitInvalid && !pathInvalid) {
    const manifest = structuredClone(baseManifest);
    if (fixture.manifest === 'incompatible') {
      const compatibility = manifest.compatibility as Record<string, Record<string, string>>;
      compatibility.lensx.min_version = '0.0.1';
      compatibility.lensx.max_version_exclusive = '0.1.0';
      compatibility.host_api.min_version = '0.0.1';
      compatibility.host_api.max_version_exclusive = '0.1.0';
    }
    if (fixture.manifest === 'legacy_manifest') manifest.manifest_version = '0.2.0';
    if (fixture.manifest === 'legacy_iframe') {
      (manifest.runtime as Record<string, unknown>).kind = 'iframe';
    }
    const bytes =
      fixture.manifest === 'invalid' ? Buffer.from('{', 'utf8') : Buffer.from(JSON.stringify(manifest), 'utf8');
    const files = fixture.paths.map((path) => ({ path, size: 1, sha256: '00', checksumCovered: false }));
    const result = validatePackageManifest(bytes, files);
    if ('normalized' in result) actual = result.normalized.status;
    else if ('incompatible' in result && result.incompatible) actual = 'incompatible';
  }
  if (actual !== fixture.expected) {
    throw new Error(`${fixture.name}: CLI payload result ${actual} does not match ${fixture.expected}.`);
  }
}

console.log(`Verified ${corpus.length} shared CLI/Host development directory payload cases.`);
