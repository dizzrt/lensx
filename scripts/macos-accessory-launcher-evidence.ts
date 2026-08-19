import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import evidenceSchema from '../tools/macos-accessory-launcher/evidence.schema.json' with { type: 'json' };
import { assertMacosAccessoryPolicy } from './check-macos-accessory-launcher.ts';

const root = join(import.meta.dirname, '..');
const evidencePath = join(root, 'fixtures/macos-accessory-launcher/evidence/macos.json');
const sourceFiles = [
  'src-tauri/Info.plist',
  'src-tauri/tauri.conf.json',
  'src-tauri/macos-accessory-evidence.conf.json',
  'src-tauri/macos-accessory-fullscreen-sacrifice.conf.json',
  'src-tauri/Cargo.toml',
  'src-tauri/src/lib.rs',
  'src-tauri/src/config_lens_cold_open_harness.rs',
  'src-tauri/src/launcher_window.rs',
  'src-tauri/src/macos_launcher.rs',
  'src-tauri/src/macos_accessory_evidence.rs',
  'src-tauri/examples/macos_accessory_fullscreen_sacrifice.rs',
  'scripts/check-macos-accessory-launcher.ts',
  'scripts/check-macos-accessory-launcher-docs.ts',
  'scripts/macos-accessory-launcher-evidence.ts',
  'tests/macos-accessory-launcher.test.ts',
  'tools/macos-accessory-launcher/evidence.schema.json',
  'docs/en/architecture/overview.md',
  'docs/zh/architecture/overview.md',
  'docs/en/development/validation.md',
  'docs/zh/development/validation.md',
  'package.json',
] as const;

type JsonRecord = Record<string, unknown>;

const readJson = (path: string): JsonRecord => JSON.parse(readFileSync(path, 'utf8')) as JsonRecord;
const record = (value: unknown, label: string): JsonRecord => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`macOS Accessory evidence failed: ${label} must be an object.`);
  }
  return value as JsonRecord;
};
const exactKeys = (value: JsonRecord, expected: readonly string[], label: string): void => {
  const actual = Object.keys(value).sort().join('\n');
  if (actual !== [...expected].sort().join('\n')) {
    throw new Error(`macOS Accessory evidence failed: ${label} fields drifted.`);
  }
};
const allTrue = (value: unknown, label: string): void => {
  const entries = Object.entries(record(value, label));
  if (entries.length === 0 || entries.some(([, result]) => result !== true)) {
    throw new Error(`macOS Accessory evidence failed: ${label} contains a failed fact.`);
  }
};

export const macosAccessorySourceDigest = (): string => {
  const hash = createHash('sha256');
  for (const path of sourceFiles) {
    hash.update(path);
    hash.update('\0');
    hash.update(readFileSync(join(root, path)));
    hash.update('\0');
  }
  return hash.digest('hex');
};

const validateSchema = new Ajv2020({ allErrors: true, strict: true }).compile(evidenceSchema);

export const validateMacosAccessoryEvidence = (value: unknown, currentDigest = macosAccessorySourceDigest()): void => {
  if (!validateSchema(value)) {
    throw new Error(`macOS Accessory evidence failed schema validation: ${JSON.stringify(validateSchema.errors)}`);
  }
  const evidence = record(value, 'evidence');
  if (evidence.source_digest !== currentDigest) {
    throw new Error('macOS Accessory evidence failed: committed product evidence is stale for current source.');
  }
  const product = record(evidence.product, 'product');
  exactKeys(
    product,
    [
      'evidence_version',
      'platform',
      'bundle_runtime',
      'window_policy',
      'ordinary_space',
      'fullscreen_space',
      'repeated_toggle',
      'local_shortcuts',
      'cleanup',
    ],
    'product',
  );
  for (const key of [
    'bundle_runtime',
    'window_policy',
    'ordinary_space',
    'fullscreen_space',
    'local_shortcuts',
    'cleanup',
  ]) {
    allTrue(product[key], `product.${key}`);
  }
  const repeated = record(product.repeated_toggle, 'product.repeated_toggle');
  if (repeated.repetitions !== 3) {
    throw new Error('macOS Accessory evidence failed: repeated toggle count drifted.');
  }
  allTrue(
    Object.fromEntries(Object.entries(repeated).filter(([key]) => key !== 'repetitions')),
    'product.repeated_toggle',
  );
  allTrue(evidence.plugin_child, 'plugin_child');
  allTrue(evidence.gate, 'gate');
};

const packageVersion = (lock: string, name: string): string => {
  const blocks = lock.split('[[package]]').slice(1);
  const block = blocks.find((candidate) => candidate.includes(`\nname = "${name}"\n`));
  const version = block?.match(/\nversion = "([^"]+)"/u)?.[1];
  if (!version) throw new Error(`macOS Accessory evidence failed: ${name} revision is unavailable.`);
  return version;
};

const waitFor = async (predicate: () => boolean, label: string, timeoutMs = 120_000): Promise<void> => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`macOS Accessory evidence failed: ${label} timed out.`);
};

const run = (command: string, arguments_: string[], label: string): void => {
  const result = spawnSync(command, arguments_, { cwd: root, encoding: 'utf8', stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`macOS Accessory evidence failed: ${label}.`);
};

const processAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const stopChild = (child: ChildProcess | undefined): void => {
  if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
};

const runProductEvidence = async (write: boolean): Promise<void> => {
  if (process.platform !== 'darwin') {
    throw new Error('macOS Accessory evidence failed: target product evidence requires macOS.');
  }
  assertMacosAccessoryPolicy();
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'lensx-macos-accessory-evidence-'));
  let sacrifice: ChildProcess | undefined;
  let productPid: number | undefined;
  let completed = false;
  try {
    const ordinaryReady = join(temporaryRoot, 'sacrifice-ordinary-ready');
    const fullscreenRequest = join(temporaryRoot, 'sacrifice-fullscreen-request');
    const fullscreenReady = join(temporaryRoot, 'sacrifice-fullscreen-ready');
    const stopRequest = join(temporaryRoot, 'sacrifice-stop');
    const sacrificeOutput = join(temporaryRoot, 'sacrifice.json');
    const productOutput = join(temporaryRoot, 'product.json');
    const productFailureOutput = join(temporaryRoot, 'product-failure.txt');
    const childOutput = join(temporaryRoot, 'plugin-child.json');
    const childRoot = join(temporaryRoot, 'plugin-child-state');

    run(
      'cargo',
      [
        'build',
        '--manifest-path',
        'src-tauri/Cargo.toml',
        '--example',
        'macos_accessory_fullscreen_sacrifice',
        '--features',
        'macos-accessory-evidence',
      ],
      'fullscreen sacrifice build failed',
    );
    sacrifice = spawn(
      join(root, 'src-tauri/target/debug/examples/macos_accessory_fullscreen_sacrifice'),
      [
        '--ordinary-ready',
        ordinaryReady,
        '--fullscreen-request',
        fullscreenRequest,
        '--fullscreen-ready',
        fullscreenReady,
        '--stop-request',
        stopRequest,
        '--final-output',
        sacrificeOutput,
      ],
      { cwd: root, stdio: 'ignore' },
    );
    await waitFor(() => existsSync(ordinaryReady), 'ordinary sacrifice readiness');

    run(
      'pnpm',
      [
        'exec',
        'tauri',
        'build',
        '--bundles',
        'app',
        '--features',
        'macos-accessory-evidence',
        '--config',
        'src-tauri/macos-accessory-evidence.conf.json',
      ],
      'packaged product build failed',
    );
    const bundle = join(root, 'src-tauri/target/release/bundle/macos/lensx-macos-accessory-evidence.app');
    if (!existsSync(bundle)) throw new Error('macOS Accessory evidence failed: packaged .app is missing.');
    const plist = spawnSync(
      '/usr/libexec/PlistBuddy',
      ['-c', 'Print :LSUIElement', join(bundle, 'Contents/Info.plist')],
      { encoding: 'utf8' },
    );
    const lsUiElement = plist.status === 0 && plist.stdout.trim() === 'true';

    const launched = spawnSync(
      '/usr/bin/open',
      [
        '-n',
        bundle,
        '--args',
        '--lensx-macos-accessory-evidence-output',
        productOutput,
        '--lensx-macos-accessory-evidence-failure-output',
        productFailureOutput,
        '--lensx-macos-accessory-evidence-sacrifice-pid',
        String(sacrifice.pid),
        '--lensx-macos-accessory-evidence-fullscreen-request',
        fullscreenRequest,
        '--lensx-macos-accessory-evidence-fullscreen-ready',
        fullscreenReady,
      ],
      { cwd: root, encoding: 'utf8' },
    );
    if (launched.status !== 0) {
      throw new Error('macOS Accessory evidence failed: Launch Services start failed.');
    }
    await waitFor(
      () => existsSync(productOutput) || existsSync(productFailureOutput),
      'packaged product evidence',
      180_000,
    );
    if (existsSync(productFailureOutput)) {
      throw new Error(`macOS Accessory evidence failed: product stage ${readFileSync(productFailureOutput, 'utf8')}.`);
    }
    const rawProduct = readJson(productOutput);
    const observedProductPid = rawProduct.process_id;
    if (typeof observedProductPid !== 'number' || !Number.isInteger(observedProductPid) || observedProductPid <= 0) {
      throw new Error('macOS Accessory evidence failed: product process identity is invalid.');
    }
    const productProcessId = observedProductPid;
    productPid = productProcessId;
    await waitFor(() => !processAlive(productProcessId), 'Cmd+Q product exit', 30_000);
    const localShortcuts = record(rawProduct.local_shortcuts, 'product.local_shortcuts');
    localShortcuts.cmd_q_key_equivalent_dispatched = true;
    localShortcuts.cmd_q_exit_requested = true;
    const productCleanup = record(rawProduct.cleanup, 'product.cleanup');
    productCleanup.graceful_exit_requested = true;

    writeFileSync(stopRequest, 'stop');
    await waitFor(() => existsSync(sacrificeOutput), 'sacrifice cleanup');
    await waitFor(() => sacrifice?.exitCode !== null, 'sacrifice process exit');

    run('pnpm', ['--dir', 'plugins/config-lens', 'run', 'build'], 'ConfigLens build failed');
    run(
      'cargo',
      [
        'run',
        '--release',
        '--manifest-path',
        'src-tauri/Cargo.toml',
        '--example',
        'config_lens_cold_open_harness',
        '--features',
        'config-lens-cold-open-harness',
        '--',
        '--profile',
        'release_like',
        '--candidate',
        join(root, 'plugins/config-lens/dist'),
        '--root',
        childRoot,
        '--output',
        childOutput,
        '--samples',
        '2',
      ],
      'current Plugin Child product evidence failed',
    );
    const rawChild = readJson(childOutput);
    const pluginChild = record(rawChild.launcher_lifecycle, 'launcher_lifecycle');
    allTrue(pluginChild, 'launcher_lifecycle');

    const { process_id: _, ...product } = rawProduct;
    const lock = readFileSync(join(root, 'src-tauri/Cargo.lock'), 'utf8');
    const evidence = {
      evidence_version: '0.1.0',
      platform: 'macos',
      macos_version: spawnSync('/usr/bin/sw_vers', ['-productVersion'], { encoding: 'utf8' }).stdout.trim(),
      source_digest: macosAccessorySourceDigest(),
      revisions: {
        tauri: packageVersion(lock, 'tauri'),
        tao: packageVersion(lock, 'tao'),
        wry: packageVersion(lock, 'wry'),
      },
      bundle_metadata: {
        ls_ui_element: lsUiElement,
        launch_services_start: true,
        packaged_app: true,
      },
      product,
      sacrifice: readJson(sacrificeOutput),
      plugin_child: pluginChild,
      gate: {
        current_source_digest: true,
        packaged_product_executed: true,
        product_process_exited: true,
        setup_failure_covered_by_deterministic_tests: true,
        static_results_not_substituted: true,
        temporary_state_isolated: true,
        bounded_timeouts: true,
        graceful_cleanup: true,
      },
    };
    validateMacosAccessoryEvidence(evidence);
    if (write) {
      mkdirSync(join(root, 'fixtures/macos-accessory-launcher/evidence'), { recursive: true });
      writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
    }
    completed = true;
  } finally {
    stopChild(sacrifice);
    if (productPid !== undefined && processAlive(productPid)) {
      process.kill(productPid, 'SIGTERM');
    }
    if (completed) {
      rmSync(temporaryRoot, { recursive: true, force: true });
    } else {
      console.error(`macOS Accessory evidence retained failed bounded records at ${temporaryRoot}`);
    }
    rmSync(join(homedir(), 'Library/Application Support/com.dizzrt.lensx.macos-accessory-evidence'), {
      recursive: true,
      force: true,
    });
  }
};

const main = async (): Promise<void> => {
  const runRequested = process.argv.includes('--run');
  const write = process.argv.includes('--write');
  if (write && !runRequested) {
    throw new Error('macOS Accessory evidence failed: --write requires --run.');
  }
  if (runRequested) await runProductEvidence(write);
  if (!existsSync(evidencePath)) {
    throw new Error('macOS Accessory evidence failed: committed target product evidence is missing.');
  }
  validateMacosAccessoryEvidence(readJson(evidencePath));
  console.log(
    `Verified current macOS packaged Accessory, Dock, Space, fullscreen, shortcut, Child, and cleanup evidence${
      runRequested ? ' after a real product rerun' : ''
    }.`,
  );
};

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) await main();
