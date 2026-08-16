import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const packageRoot = resolve(import.meta.dirname, '..');
const baselineRoot = resolve(packageRoot, 'visual/baselines');
const captureRoot = await mkdtemp(resolve(tmpdir(), 'lensx-config-lens-visual-'));
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 47_900 + (process.pid % 300);
const baseUrl = `http://127.0.0.1:${port}`;
const update = process.argv.includes('--update');
const locales = ['en-US', 'zh-CN'];
const themes = ['light', 'dark'];
const scenarios = ['empty', 'valid', 'invalid', 'limit', 'long', 'focus', 'recovery'];

const waitForExit = (child, timeout) =>
  new Promise((resolveExit) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolveExit(true);
      return;
    }
    const timer = setTimeout(() => {
      child.off('exit', onExit);
      resolveExit(false);
    }, timeout);
    const onExit = () => {
      clearTimeout(timer);
      resolveExit(true);
    };
    child.once('exit', onExit);
  });

const run = (command, arguments_, cwd, options = {}) => {
  const execution = spawnSync(command, arguments_, { cwd, encoding: 'utf8', ...options });
  if (execution.error !== undefined) throw execution.error;
  if (execution.status !== 0)
    throw new Error(`${command} ${arguments_.join(' ')} failed.\n${execution.stdout}\n${execution.stderr}`);
  return execution.stdout;
};

const decodeBitmap = async (png, name) => {
  const bitmap = resolve(captureRoot, `${name}.bmp`);
  run('sips', ['-s', 'format', 'bmp', png, '--out', bitmap], packageRoot);
  const bytes = await readFile(bitmap);
  const offset = bytes.readUInt32LE(10);
  const width = bytes.readInt32LE(18);
  const height = Math.abs(bytes.readInt32LE(22));
  if (width !== 650 || height !== 600 || bytes.readUInt16LE(28) !== 24) throw new Error(`Unexpected bitmap: ${name}.`);
  return bytes.subarray(offset);
};

const assertEquivalent = async (capture, baseline, name) => {
  const [actual, expected] = await Promise.all([
    decodeBitmap(capture, `actual-${name}`),
    decodeBitmap(baseline, `expected-${name}`),
  ]);
  if (actual.length !== expected.length) throw new Error(`Visual dimensions drifted: ${name}.`);
  let changed = 0;
  for (let index = 0; index < actual.length; index += 1)
    if (Math.abs(actual[index] - expected[index]) > 8) changed += 1;
  if (changed / actual.length > 0.001) throw new Error(`Visual baseline drifted: ${name}.`);
};

await mkdir(baselineRoot, { recursive: true });
run('pnpm', ['exec', 'rsbuild', 'build', '-c', 'visual/rsbuild.config.ts'], packageRoot, { stdio: 'inherit' });
const preview = spawn(
  'pnpm',
  ['exec', 'rsbuild', 'preview', '-c', 'visual/rsbuild.config.ts', '--host', '127.0.0.1', '--port', String(port)],
  {
    cwd: packageRoot,
    stdio: 'ignore',
  },
);

try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (spawnSync('curl', ['--fail', '--silent', baseUrl]).status === 0) {
      ready = true;
      break;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }
  if (!ready) throw new Error('ConfigLens visual server did not become ready.');
  const backgrounds = new Map();
  for (const locale of locales) {
    for (const theme of themes) {
      for (const scenario of scenarios) {
        const stem = `${locale}-${theme}-${scenario}`;
        const capture = resolve(captureRoot, `${stem}.png`);
        let execution;
        let html = '';
        for (let attempt = 1; attempt <= 3; attempt += 1) {
          execution = spawnSync(
            chromePath,
            [
              '--headless=new',
              '--disable-background-networking',
              '--disable-extensions',
              '--disable-gpu',
              '--hide-scrollbars',
              '--no-default-browser-check',
              '--no-first-run',
              '--no-sandbox',
              `--user-data-dir=${resolve(captureRoot, `chrome-${stem}-${attempt}`)}`,
              '--virtual-time-budget=1000',
              '--window-size=650,600',
              `--screenshot=${capture}`,
              '--dump-dom',
              `${baseUrl}/?locale=${locale}&theme=${theme}&scenario=${scenario}`,
            ],
            { cwd: packageRoot, encoding: 'utf8', killSignal: 'SIGKILL', timeout: 10_000 },
          );
          html = execution.stdout;
          if (
            html.includes('data-visual-check="passed"') &&
            html.includes('data-layout-check="passed"') &&
            html.includes(`data-scenario="${scenario}"`)
          )
            break;
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
        }
        if (
          !html.includes('data-visual-check="passed"') ||
          !html.includes('data-layout-check="passed"') ||
          !html.includes(`data-scenario="${scenario}"`)
        ) {
          throw new Error(`Visual semantics failed: ${stem}.\n${html}\n${execution?.stderr ?? ''}`);
        }
        if (!html.includes(`lang="${locale}"`) || !html.includes(`color-scheme: ${theme}`)) {
          throw new Error(`Visual locale/theme failed: ${stem}.`);
        }
        backgrounds.set(theme, /data-background-token="([^"]+)"/u.exec(html)?.[1]);
        const baseline = resolve(baselineRoot, `${stem}.png`);
        if (update) await writeFile(baseline, await readFile(capture));
        else await assertEquivalent(capture, baseline, stem);
      }
    }
  }
  if (backgrounds.get('light') === backgrounds.get('dark')) throw new Error('Light and dark backgrounds must differ.');
  console.log(`${update ? 'Updated' : 'Verified'} 28 ConfigLens visual baselines.`);
} finally {
  preview.kill('SIGTERM');
  if (!(await waitForExit(preview, 2_000))) {
    preview.kill('SIGKILL');
    await waitForExit(preview, 2_000);
  }
  await rm(captureRoot, { recursive: true, force: true });
}
