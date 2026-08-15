import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const packageRoot = resolve(import.meta.dirname, '..');
const baselineRoot = resolve(packageRoot, 'visual/baselines');
const captureRoot = await mkdtemp(resolve(tmpdir(), 'lensx-plugin-template-visual-'));
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 47_500 + (process.pid % 400);
const baseUrl = `http://127.0.0.1:${port}`;
const update = process.argv.includes('--update');
const combinations = [
  ['en-US', 'light'],
  ['en-US', 'dark'],
  ['zh-CN', 'light'],
  ['zh-CN', 'dark'],
];

const run = (command, arguments_, cwd, options = {}) => {
  const result = spawnSync(command, arguments_, { cwd, encoding: 'utf8', ...options });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${arguments_.join(' ')} failed.\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout;
};

const decodeBitmap = async (png, name) => {
  const bitmap = resolve(captureRoot, `${name}.bmp`);
  run('sips', ['-s', 'format', 'bmp', png, '--out', bitmap], packageRoot);
  const bytes = await readFile(bitmap);
  const offset = bytes.readUInt32LE(10);
  const width = bytes.readInt32LE(18);
  const height = Math.abs(bytes.readInt32LE(22));
  const bitsPerPixel = bytes.readUInt16LE(28);
  if (width !== 650 || height !== 600 || bitsPerPixel !== 24) {
    throw new Error(`Unexpected decoded bitmap format for ${name}.`);
  }
  return bytes.subarray(offset);
};

const assertVisuallyEquivalent = async (capture, baseline, name) => {
  const [actual, expected] = await Promise.all([
    decodeBitmap(capture, `actual-${name}`),
    decodeBitmap(baseline, `expected-${name}`),
  ]);
  if (actual.length !== expected.length) throw new Error(`Visual baseline dimensions drifted: ${name}.`);

  let changedChannels = 0;
  let maximumDelta = 0;
  for (let index = 0; index < actual.length; index += 1) {
    const delta = Math.abs(actual[index] - expected[index]);
    if (delta > 8) changedChannels += 1;
    maximumDelta = Math.max(maximumDelta, delta);
  }
  const changedRatio = changedChannels / actual.length;
  if (changedRatio > 0.001) {
    throw new Error(
      `Visual baseline drifted: ${name} (${(changedRatio * 100).toFixed(3)}% channels, max delta ${maximumDelta}).`,
    );
  }
};

await mkdir(baselineRoot, { recursive: true });
run('pnpm', ['exec', 'rsbuild', 'build', '-c', 'visual/rsbuild.config.ts'], packageRoot, { stdio: 'inherit' });
const preview = spawn(
  'pnpm',
  ['exec', 'rsbuild', 'preview', '-c', 'visual/rsbuild.config.ts', '--host', '127.0.0.1', '--port', String(port)],
  { cwd: packageRoot, stdio: 'ignore' },
);

try {
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (spawnSync('curl', ['--fail', '--silent', baseUrl]).status === 0) {
      ready = true;
      break;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }
  if (!ready) throw new Error('React template visual preview did not become ready.');

  const backgrounds = new Map();
  for (const [locale, theme] of combinations) {
    const name = `${locale}-${theme}.png`;
    const capture = resolve(captureRoot, name);
    let result;
    let html = '';
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      result = spawnSync(
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
          `--user-data-dir=${resolve(captureRoot, `chrome-${locale}-${theme}-${attempt}`)}`,
          '--virtual-time-budget=3000',
          '--window-size=650,600',
          `--screenshot=${capture}`,
          '--dump-dom',
          `${baseUrl}/?locale=${locale}&theme=${theme}`,
        ],
        { cwd: packageRoot, encoding: 'utf8', killSignal: 'SIGKILL', timeout: 10_000 },
      );
      html = result.stdout;
      if (html.includes('data-visual-check="passed"') && html.includes('data-token-count="10"')) break;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
    }
    if (!html.includes('data-visual-check="passed"') || !html.includes('data-token-count="10"')) {
      throw new Error(`Visual semantics/styles failed for ${locale}/${theme}.\n${html}\n${result?.stderr ?? ''}`);
    }
    if (!html.includes(`lang="${locale}"`) || !html.includes(`color-scheme: ${theme}`)) {
      throw new Error(`Visual locale/theme failed for ${locale}/${theme}.`);
    }
    const background = /data-background-token="([^"]+)"/u.exec(html)?.[1];
    if (background === undefined) throw new Error(`Missing computed background for ${locale}/${theme}.`);
    backgrounds.set(theme, background);
    const dimensions = run('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', capture], packageRoot);
    if (!dimensions.includes('pixelWidth: 650') || !dimensions.includes('pixelHeight: 600')) {
      throw new Error(`Unexpected screenshot dimensions for ${locale}/${theme}.`);
    }
    const baseline = resolve(baselineRoot, name);
    if (update) await writeFile(baseline, await readFile(capture));
    else await assertVisuallyEquivalent(capture, baseline, name);
  }
  if (backgrounds.get('light') === backgrounds.get('dark')) throw new Error('Light and dark tokens must differ.');
  console.log(`${update ? 'Updated' : 'Verified'} four stable React template visual baselines.`);
} finally {
  preview.kill('SIGKILL');
  await rm(captureRoot, { recursive: true, force: true });
}
