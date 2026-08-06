import { spawnSync } from 'node:child_process';
import { chmod, cp, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
await rm(resolve(packageRoot, 'dist'), { force: true, recursive: true });
const templatesResult = spawnSync('node', ['scripts/verify-templates.mjs'], {
  cwd: packageRoot,
  stdio: 'inherit',
});
if (templatesResult.error !== undefined) throw templatesResult.error;
if (templatesResult.status !== 0) process.exit(templatesResult.status ?? 1);
const result = spawnSync('pnpm', ['exec', 'tsc', '-p', 'tsconfig.build.json'], {
  cwd: packageRoot,
  stdio: 'inherit',
});
if (result.error !== undefined) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

const templates = resolve(packageRoot, 'templates');
await mkdir(resolve(packageRoot, 'dist'), { recursive: true });
await cp(templates, resolve(packageRoot, 'dist/templates'), { recursive: true });
await chmod(resolve(packageRoot, 'dist/src/bin.js'), 0o755);
