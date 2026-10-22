import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
const cli = (args) => {
  const result = spawnSync('lensx-plugin', [...args, '--json'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, `CLI ${args[0]} failed: ${result.stdout || result.stderr}`);
  const output = JSON.parse(result.stdout);
  assert.equal(output.status, args[0] === 'pack' ? 'success' : 'compatible');
  return output.result;
};
const temporary = async (run) => {
  const directory = await mkdtemp(resolve(tmpdir(), 'lensx-translation-'));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};
// Exercise the same cleanup boundary on failure before using it for packages.
let failureDirectory;
await assert.rejects(
  temporary(async (directory) => {
    failureDirectory = directory;
    throw new Error('fixture-failure');
  }),
  /fixture-failure/u,
);
await assert.rejects(access(failureDirectory));

const files = new Set();
const visit = async (directory) => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await visit(path);
    else files.add(path);
  }
};
await visit(dist);
const manifest = JSON.parse(await readFile(resolve(dist, 'manifest.json'), 'utf8'));
assert.equal(manifest.plugin_id, 'dev.lensx.translation');
assert.equal(manifest.manifest_version, '0.4.0');
assert.deepEqual(manifest.contributes.pages[0].presentation, {
  initial_size: { width: 800, height: 600 },
  resizable: true,
});
const html = await readFile(resolve(dist, 'index.html'), 'utf8');
assert.match(html, /connect-src 'none';/u);
assert.match(html, /script-src 'self';/u);
const resource = (from, reference) => {
  if (reference.startsWith('data:') || reference.startsWith('#')) return;
  assert.doesNotMatch(reference, /^(?:\/|[a-z][a-z\d+.-]*:)/iu);
  const target = resolve(dirname(from), reference.split(/[?#]/u)[0]);
  assert.ok(target.startsWith(`${dist}${sep}`) && files.has(target), `Missing packaged resource: ${reference}`);
};
for (const file of files) {
  assert.ok(!file.endsWith('.map'));
  if (file.endsWith('.html')) {
    for (const match of (await readFile(file, 'utf8')).matchAll(/(?:src|href)=["']([^"']+)["']/gu))
      resource(file, match[1]);
  }
  if (file.endsWith('.css')) {
    for (const match of (await readFile(file, 'utf8')).matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gu))
      resource(file, match[1]);
  }
}
const modules = JSON.parse(await readFile(resolve(root, '.build/modules.json'), 'utf8'));
assert.ok(modules.some((name) => name.includes('@noble/hashes') && name.includes('sha2.js')));
assert.ok(modules.some((name) => name.includes('@noble/hashes') && name.includes('hmac.js')));
for (const module of modules) {
  assert.doesNotMatch(
    module,
    /(?:@tauri-apps|src-tauri\/|lensx\/src\/|node:|node_modules\/(?:buffer|crypto-browserify|stream-browserify)|external )/u,
  );
}
const scripts = (
  await Promise.all([...files].filter((file) => file.endsWith('.js')).map((file) => readFile(file, 'utf8')))
).join('\n');
assert.doesNotMatch(scripts, /crypto\.subtle|Buffer\.from|fixture-ak|fixture-sk/u);
const chunks = JSON.parse(await readFile(resolve(root, '.build/chunk-modules.json'), 'utf8'));
for (const file of Object.keys(chunks)) assert.ok(files.has(resolve(dist, file)), `Missing chunk: ${file}`);
assert.doesNotMatch(html, /(?:src|href)=["']https?:\/\//u);
const validated = cli(['validate', '--project', root]);
let successDirectory;
await temporary(async (directory) => {
  successDirectory = directory;
  const first = resolve(directory, 'first.lxp');
  const second = resolve(directory, 'second.lxp');
  const packed = cli(['pack', '--project', root, '--no-build', '--output', first]);
  cli(['pack', '--project', root, '--no-build', '--output', second]);
  assert.deepEqual(await readFile(first), await readFile(second));
  const inspected = cli(['inspect', first]);
  assert.equal(inspected.plugin_id, manifest.plugin_id);
  assert.equal(inspected.file_count, validated.file_count);
  assert.deepEqual(inspected.package_digest, packed.package_digest);
  assert.deepEqual(inspected.package_digest, {
    algorithm: 'sha256',
    value: createHash('sha256')
      .update(await readFile(first))
      .digest('hex'),
  });
});
await assert.rejects(access(successDirectory));
console.log(`Translation public CLI validation, reproducible packing and inspection passed (${files.size} files).`);
