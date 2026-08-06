import { spawn, spawnSync } from 'node:child_process';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '..');
const screenshotRoot = resolve(repositoryRoot, '.tmp/plugin-management-settings-visual');
const previewPort = 46_000 + (process.pid % 1_000);
const previewUrl = `http://127.0.0.1:${previewPort}`;
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const locales = ['en-US', 'zh-CN'];
const themes = ['light', 'dark'];
const states = ['empty', 'healthy', 'quarantined', 'degraded', 'replacement', 'uninstall', 'clear'];
const wait = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

const run = (command, arguments_, options = {}) => {
  const result = spawnSync(command, arguments_, { cwd: repositoryRoot, encoding: 'utf8', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${arguments_.join(' ')} failed.\n${result.stdout}\n${result.stderr}`);
  }
  return result;
};

await mkdir(screenshotRoot, { recursive: true });
run('pnpm', ['exec', 'rsbuild', 'build', '-c', 'visual/plugin-management/rsbuild.config.ts'], { stdio: 'inherit' });

const preview = spawn(
  'pnpm',
  [
    'exec',
    'rsbuild',
    'preview',
    '-c',
    'visual/plugin-management/rsbuild.config.ts',
    '--host',
    '127.0.0.1',
    '--port',
    String(previewPort),
  ],
  { cwd: repositoryRoot, stdio: 'ignore' },
);

try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const probe = spawnSync('curl', ['--fail', '--silent', previewUrl]);
    if (probe.status === 0) {
      ready = true;
      break;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }
  if (!ready) throw new Error('Plugin management visual preview did not become ready.');

  const debuggingPort = 48_000 + (process.pid % 1_000);
  const chrome = spawn(
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
      `--remote-debugging-port=${debuggingPort}`,
      `--user-data-dir=${resolve(screenshotRoot, `chrome-cdp-${process.pid}`)}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  try {
    let target;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      try {
        const targets = await fetch(`http://127.0.0.1:${debuggingPort}/json/list`).then((response) => response.json());
        target = targets.find((candidate) => candidate.type === 'page');
        if (target?.webSocketDebuggerUrl) break;
      } catch {
        // Chrome is still starting.
      }
      await wait(100);
    }
    if (!target?.webSocketDebuggerUrl) throw new Error('Chrome DevTools did not expose a page target.');

    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolvePromise, rejectPromise) => {
      socket.addEventListener('open', resolvePromise, { once: true });
      socket.addEventListener('error', rejectPromise, { once: true });
    });
    let nextId = 0;
    const pending = new Map();
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id === undefined) return;
      pending.get(message.id)?.(message);
      pending.delete(message.id);
    });
    const call = (method, params = {}) =>
      new Promise((resolvePromise, rejectPromise) => {
        const id = ++nextId;
        pending.set(id, (message) => {
          if (message.error) rejectPromise(new Error(`${method} failed: ${JSON.stringify(message.error)}`));
          else resolvePromise(message.result);
        });
        socket.send(JSON.stringify({ id, method, params }));
      });

    await call('Page.enable');
    await call('Emulation.setDeviceMetricsOverride', {
      width: 650,
      height: 600,
      deviceScaleFactor: 1,
      mobile: false,
    });

    for (const locale of locales) {
      for (const theme of themes) {
        for (const state of states) {
          const screenshotPath = resolve(screenshotRoot, `${locale}-${theme}-${state}.png`);
          const url = `${previewUrl}/?locale=${locale}&theme=${theme}&state=${state}`;
          await call('Page.navigate', { url });
          let facts;
          for (let attempt = 0; attempt < 60; attempt += 1) {
            const result = await call('Runtime.evaluate', {
              expression: `(() => ({
                ready: document.body.dataset.visualCheck,
                state: document.body.dataset.state,
                display: document.body.dataset.surfaceDisplay,
                border: document.body.dataset.surfaceBorder,
                lang: document.documentElement.lang,
                colorScheme: document.documentElement.style.colorScheme,
                dark: document.body.getAttribute('theme-mode') === 'dark',
                dialog: Boolean(document.querySelector('[role="dialog"].semi-modal-content-animate-show'))
              }))()`,
              returnByValue: true,
            });
            facts = result.result.value;
            if (facts?.ready === 'passed') break;
            await wait(50);
          }
          if (facts?.ready !== 'passed' || facts.state !== state) {
            throw new Error(`Visual fixture did not settle for ${locale}/${theme}/${state}.`);
          }
          if (facts.display !== 'grid' || facts.border !== 'solid') {
            throw new Error(`Continuous surface computed styles failed for ${locale}/${theme}/${state}.`);
          }
          if (facts.lang !== locale || facts.colorScheme !== theme || facts.dark !== (theme === 'dark')) {
            throw new Error(`Locale/theme document state failed for ${locale}/${theme}/${state}.`);
          }
          if ((state === 'replacement' || state === 'uninstall' || state === 'clear') && !facts.dialog) {
            throw new Error(`Confirmation dialog is missing for ${locale}/${theme}/${state}.`);
          }
          const capture = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
          await writeFile(screenshotPath, Buffer.from(capture.data, 'base64'));
          const screenshot = await stat(screenshotPath);
          if (screenshot.size < 8_000) throw new Error(`Screenshot is unexpectedly small: ${screenshotPath}.`);
          const dimensions = run('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', screenshotPath]).stdout;
          if (!dimensions.includes('pixelWidth: 650') || !dimensions.includes('pixelHeight: 600')) {
            throw new Error(`Screenshot dimensions are not 650x600: ${screenshotPath}.`);
          }
        }
      }
    }
    socket.close();
  } finally {
    chrome.kill('SIGKILL');
  }
  console.log(`Verified ${locales.length * themes.length * states.length} plugin management visual states.`);
} finally {
  preview.kill('SIGKILL');
}
