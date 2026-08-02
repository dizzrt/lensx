import { spawnSync } from 'node:child_process';
import { rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
await rm(resolve(packageRoot, 'dist'), { force: true, recursive: true });

const run = (command, arguments_) => {
  const result = spawnSync(command, arguments_, { cwd: packageRoot, stdio: 'inherit' });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

run('pnpm', ['exec', 'tsc', '-p', 'tsconfig.build.json']);
run('pnpm', ['exec', 'lessc', '--include-path=../../node_modules', 'src/styles.less', 'dist/styles.css']);
await writeFile(
  resolve(packageRoot, 'dist/styles.d.ts'),
  'declare const stylesheet: string;\nexport default stylesheet;\n',
  'utf8',
);
