import { spawn, spawnSync } from 'node:child_process';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, '.tmp/plugin-runtime-slot-visual');
const previewPort = 47_000 + (process.pid % 500);
const previewUrl = `http://127.0.0.1:${previewPort}`;
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const wait = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
const run = (command, arguments_, options = {}) => {
  const result = spawnSync(command, arguments_, { cwd: root, encoding: 'utf8', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed.\n${result.stdout}\n${result.stderr}`);
  return result;
};

await mkdir(output, { recursive: true });
run('pnpm', ['exec', 'rsbuild', 'build', '-c', 'visual/plugin-runtime-slot/rsbuild.config.ts'], { stdio: 'inherit' });
const preview = spawn(
  'pnpm',
  [
    'exec',
    'rsbuild',
    'preview',
    '-c',
    'visual/plugin-runtime-slot/rsbuild.config.ts',
    '--host',
    '127.0.0.1',
    '--port',
    String(previewPort),
  ],
  { cwd: root, stdio: 'ignore' },
);
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (spawnSync('curl', ['--fail', '--silent', previewUrl]).status === 0) {
      ready = true;
      break;
    }
    await wait(100);
  }
  if (!ready) throw new Error('Plugin Runtime visual preview did not become ready.');
  const debuggingPort = 52_000 + (process.pid % 1_000);
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
      `--user-data-dir=${resolve(output, `chrome-${process.pid}`)}`,
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
      } catch {}
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
        pending.set(id, (message) =>
          message.error ? rejectPromise(new Error(`${method} failed`)) : resolvePromise(message.result),
        );
        socket.send(JSON.stringify({ id, method, params }));
      });
    await call('Page.enable');
    await call('Emulation.setDeviceMetricsOverride', { width: 650, height: 420, deviceScaleFactor: 1, mobile: false });
    for (const locale of ['en-US', 'zh-CN']) {
      for (const theme of ['light', 'dark']) {
        for (const state of ['loading', 'failure']) {
          await call('Page.navigate', { url: `${previewUrl}/?locale=${locale}&theme=${theme}&state=${state}` });
          let facts;
          for (let attempt = 0; attempt < 60; attempt += 1) {
            const result = await call('Runtime.evaluate', {
              expression: `({ ready: document.body.dataset.visualCheck, state: document.body.dataset.state, lang: document.documentElement.lang, colorScheme: document.documentElement.style.colorScheme, role: document.querySelector('[role="${state === 'failure' ? 'alert' : 'status'}"]')?.getAttribute('role'), overflow: getComputedStyle(document.querySelector('.plugin-runtime-visual-shell')).overflow })`,
              returnByValue: true,
            });
            facts = result.result.value;
            if (facts?.ready === 'passed') break;
            await wait(50);
          }
          if (
            facts?.state !== state ||
            facts.lang !== locale ||
            facts.colorScheme !== theme ||
            facts.role !== (state === 'failure' ? 'alert' : 'status')
          ) {
            throw new Error(`Visual state failed: ${locale}/${theme}/${state}: ${JSON.stringify(facts)}`);
          }
          const capture = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
          const path = resolve(output, `${locale}-${theme}-${state}.png`);
          await writeFile(path, Buffer.from(capture.data, 'base64'));
          if ((await stat(path)).size < 3_000) throw new Error(`Screenshot is unexpectedly small: ${path}`);
        }
      }
    }
    socket.close();
  } finally {
    chrome.kill('SIGKILL');
  }
  console.log('Verified 8 localized light/dark Plugin Runtime loading and failure screenshots.');
} finally {
  preview.kill('SIGKILL');
}
