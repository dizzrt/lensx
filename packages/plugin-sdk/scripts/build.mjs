import { spawnSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
await rm(resolve(packageRoot, 'dist'), { force: true, recursive: true });

const result = spawnSync('pnpm', ['exec', 'tsc', '-p', 'tsconfig.build.json'], {
  cwd: packageRoot,
  stdio: 'inherit',
});
if (result.error !== undefined) {
  throw result.error;
}
if (result.status !== 0) {
  process.exitCode = result.status ?? 1;
} else {
  await rm(resolve(packageRoot, 'dist/src/internal/transport-contract.d.ts'), { force: true });
  await rm(resolve(packageRoot, 'dist/src/internal/webview-bridge-contract.d.ts'), { force: true });
}
