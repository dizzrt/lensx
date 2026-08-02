import { spawn, spawnSync } from 'node:child_process';
import { mkdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(packageRoot, '../..');
const screenshotRoot = resolve(repositoryRoot, '.tmp/create-plugin-ui-package-visual');
const previewPort = 47_000 + (process.pid % 1_000);
const previewUrl = `http://127.0.0.1:${previewPort}`;
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const combinations = [
  ['en-US', 'light'],
  ['en-US', 'dark'],
  ['zh-CN', 'light'],
  ['zh-CN', 'dark'],
];

const run = (command, arguments_, cwd, options = {}) => {
  const result = spawnSync(command, arguments_, { cwd, encoding: 'utf8', ...options });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `${command} ${arguments_.join(' ')} failed with status ${result.status}.\n${result.stdout}\n${result.stderr}`,
    );
  }
  return result.stdout;
};

const wait = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

const verifyKeyboardRecovery = async (url) => {
  const debuggingPort = 49_000 + (process.pid % 500);
  const chrome = spawn(
    chromePath,
    [
      '--headless=new',
      '--disable-background-networking',
      '--disable-extensions',
      '--disable-gpu',
      '--no-default-browser-check',
      '--no-first-run',
      '--no-sandbox',
      `--remote-debugging-port=${debuggingPort}`,
      `--user-data-dir=${resolve(screenshotRoot, 'chrome-keyboard')}`,
      url,
    ],
    { stdio: 'ignore' },
  );

  try {
    let target;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      try {
        const targets = await fetch(`http://127.0.0.1:${debuggingPort}/json/list`).then((response) => response.json());
        target = targets.find((candidate) => candidate.type === 'page' && candidate.url.startsWith(previewUrl));
        if (target !== undefined) {
          break;
        }
      } catch {
        // Chrome is still starting.
      }
      await wait(100);
    }
    if (target?.webSocketDebuggerUrl === undefined) {
      throw new Error('Chrome DevTools did not expose the visual fixture page.');
    }

    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolvePromise, rejectPromise) => {
      socket.addEventListener('open', resolvePromise, { once: true });
      socket.addEventListener('error', rejectPromise, { once: true });
    });
    let nextId = 0;
    const pending = new Map();
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== undefined) {
        pending.get(message.id)?.(message);
        pending.delete(message.id);
      }
    });
    const call = (method, params = {}) =>
      new Promise((resolvePromise, rejectPromise) => {
        const id = ++nextId;
        pending.set(id, (message) => {
          if (message.error !== undefined) {
            rejectPromise(new Error(`${method} failed: ${JSON.stringify(message.error)}`));
          } else {
            resolvePromise(message.result);
          }
        });
        socket.send(JSON.stringify({ id, method, params }));
      });

    for (let attempt = 0; attempt < 50; attempt += 1) {
      const result = await call('Runtime.evaluate', {
        expression: 'document.body.dataset.visualCheck',
        returnByValue: true,
      });
      if (result.result.value === 'passed') {
        break;
      }
      await wait(100);
    }
    await call('Runtime.evaluate', {
      expression: "document.querySelector('.lensx-plugin-feedback__recovery').focus()",
      returnByValue: true,
    });
    await call('Input.dispatchKeyEvent', {
      code: 'Enter',
      key: 'Enter',
      nativeVirtualKeyCode: 13,
      text: '\r',
      type: 'keyDown',
      unmodifiedText: '\r',
      windowsVirtualKeyCode: 13,
    });
    await call('Input.dispatchKeyEvent', {
      code: 'Enter',
      key: 'Enter',
      nativeVirtualKeyCode: 13,
      type: 'keyUp',
      windowsVirtualKeyCode: 13,
    });

    let recoveryCount = '0';
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const result = await call('Runtime.evaluate', {
        expression: "document.querySelector('[data-recovery-count]').dataset.recoveryCount",
        returnByValue: true,
      });
      recoveryCount = result.result.value;
      if (recoveryCount === '1') {
        break;
      }
      await wait(50);
    }
    socket.close();
    if (recoveryCount !== '1') {
      throw new Error(`Keyboard recovery did not invoke the plugin handler exactly once: ${recoveryCount}.`);
    }
  } finally {
    chrome.kill('SIGKILL');
  }
};

await mkdir(screenshotRoot, { recursive: true });
run('pnpm', ['exec', 'rsbuild', 'build', '-c', 'visual/rsbuild.config.ts'], packageRoot, { stdio: 'inherit' });

const preview = spawn(
  'pnpm',
  [
    'exec',
    'rsbuild',
    'preview',
    '-c',
    'visual/rsbuild.config.ts',
    '--host',
    '127.0.0.1',
    '--port',
    String(previewPort),
  ],
  { cwd: packageRoot, stdio: 'ignore' },
);

try {
  let previewReady = false;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const probe = spawnSync('curl', ['--fail', '--silent', previewUrl], { encoding: 'utf8' });
    if (probe.status === 0) {
      previewReady = true;
      break;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }
  if (!previewReady) {
    throw new Error('The Plugin UI visual preview server did not become ready.');
  }

  await verifyKeyboardRecovery(`${previewUrl}/?locale=en-US&theme=light`);

  const backgroundByTheme = new Map();
  for (const [locale, theme] of combinations) {
    const screenshotPath = resolve(screenshotRoot, `${locale}-${theme}.png`);
    const url = `${previewUrl}/?locale=${locale}&theme=${theme}`;
    const result = spawnSync(
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
        `--user-data-dir=${resolve(screenshotRoot, `chrome-${locale}-${theme}`)}`,
        '--virtual-time-budget=3000',
        '--window-size=650,600',
        `--screenshot=${screenshotPath}`,
        '--dump-dom',
        url,
      ],
      { cwd: packageRoot, encoding: 'utf8', killSignal: 'SIGKILL', timeout: 10_000 },
    );
    const html = result.stdout;
    if (!html.includes('data-visual-check="passed"') || !html.includes('data-token-count="10"')) {
      throw new Error(`Visual automation failed for ${locale}/${theme}.\n${html}\n${result.stderr}`);
    }
    if (!html.includes(`lang="${locale}"`) || !html.includes(`color-scheme: ${theme}`)) {
      throw new Error(`Document locale/theme attributes are incorrect for ${locale}/${theme}.`);
    }
    if ((theme === 'dark') !== html.includes('theme-mode="dark"')) {
      throw new Error(`Semi body theme attribute is incorrect for ${locale}/${theme}.`);
    }
    if (!html.includes('aria-live="polite"') || !html.includes('aria-live="assertive"')) {
      throw new Error(`Live region semantics are missing for ${locale}/${theme}.`);
    }
    const background = /data-background-token="([^"]+)"/u.exec(html)?.[1];
    if (background === undefined || background.length === 0) {
      throw new Error(`Computed background token is missing for ${locale}/${theme}.`);
    }
    backgroundByTheme.set(theme, background);

    const screenshot = await stat(screenshotPath);
    if (screenshot.size < 10_000) {
      throw new Error(`Visual screenshot is unexpectedly small for ${locale}/${theme}: ${screenshot.size} bytes.`);
    }
    const dimensions = run('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', screenshotPath], packageRoot);
    if (!dimensions.includes('pixelWidth: 650') || !dimensions.includes('pixelHeight: 600')) {
      throw new Error(`Visual screenshot dimensions are not 650x600 for ${locale}/${theme}.\n${dimensions}`);
    }
  }

  if (backgroundByTheme.get('light') === backgroundByTheme.get('dark')) {
    throw new Error('Light and dark computed background tokens must differ.');
  }

  console.log(`Verified four locale/theme visual combinations and wrote temporary screenshots to ${screenshotRoot}.`);
} finally {
  preview.kill('SIGKILL');
}
