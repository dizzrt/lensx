import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const rootDir = join(import.meta.dirname, '..');
const vendorRoot = join(rootDir, 'vendor/frame-aware-navigation');
const integrityPath = join(vendorRoot, '.lensx-integrity.json');
const writeMode = process.argv.includes('--write');

const packages = Object.freeze({
  tauri: '2.11.5',
  'tauri-runtime': '2.11.3',
  'tauri-runtime-wry': '2.11.4',
  wry: '0.55.1',
});

const patchedFiles = Object.freeze([
  'tauri/src/webview/mod.rs',
  'tauri/src/webview/webview_window.rs',
  'tauri-runtime/src/webview.rs',
  'tauri-runtime-wry/src/lib.rs',
  'wry/src/lib.rs',
  'wry/src/wkwebview/class/wry_navigation_delegate.rs',
  'wry/src/wkwebview/mod.rs',
  'wry/src/wkwebview/navigation.rs',
]);

const listFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = join(directory, entry.name);
    if (absolutePath === integrityPath || entry.name === 'target') return [];
    return entry.isDirectory() ? listFiles(absolutePath) : [relative(vendorRoot, absolutePath)];
  });

for (const [name, version] of Object.entries(packages)) {
  const manifest = readFileSync(join(vendorRoot, name, 'Cargo.toml'), 'utf8');
  const packageBlock = manifest.match(/\[package\]([\s\S]*?)(?:\n\[|$)/)?.[1] ?? '';
  if (!packageBlock.includes(`name = "${name}"`) || !packageBlock.includes(`version = "${version}"`)) {
    throw new Error(`Vendored dependency revision drifted: ${name} must remain ${version}.`);
  }
}

for (const relativePath of patchedFiles) {
  if (!existsSync(join(vendorRoot, relativePath))) {
    throw new Error(`Reviewed frame-aware dependency patch file is missing: ${relativePath}.`);
  }
}

const files = listFiles(vendorRoot)
  .sort()
  .map((relativePath) => ({
    path: relativePath,
    sha256: createHash('sha256')
      .update(readFileSync(join(vendorRoot, relativePath)))
      .digest('hex'),
  }));
const integrity = `${JSON.stringify(
  {
    integrity_version: '0.1.0',
    packages,
    patched_files: patchedFiles,
    files,
  },
  null,
  2,
)}\n`;

if (writeMode) {
  writeFileSync(integrityPath, integrity);
  console.log(`Recorded ${files.length} vendored frame-aware dependency files.`);
} else if (!existsSync(integrityPath) || readFileSync(integrityPath, 'utf8') !== integrity) {
  throw new Error(
    'Vendored frame-aware dependency drift detected. Review the exact diff, then run pnpm run generate:frame-aware-navigation-dependency-drift.',
  );
} else {
  console.log(`Checked ${files.length} vendored frame-aware dependency files.`);
}
