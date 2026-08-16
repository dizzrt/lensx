import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  discoverWorkspaceMembers,
  REQUIRED_LIFECYCLE_SCRIPTS,
  validateLifecycleScripts,
} from './workspace-lifecycle.ts';

const rootDir = join(import.meta.dirname, '..');
const manifest = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8')) as {
  readonly scripts?: Readonly<Record<string, string>>;
};
const scripts = manifest.scripts ?? {};

const fail = (message: string): never => {
  throw new Error(`[plugin-runtime/gate-graph] ${message}`);
};

const dependencies = (name: string): string[] => {
  const command = scripts[name];
  if (command === undefined) fail(`missing root script ${name}`);
  return [...command.matchAll(/\bpnpm run ([a-z0-9:-]+)/gu)].map((match) => match[1] ?? '').filter(Boolean);
};

for (const name of Object.keys(scripts).sort()) {
  for (const dependency of dependencies(name)) {
    if (scripts[dependency] === undefined) fail(`${name} invokes missing root script ${dependency}`);
  }
}

const closure = (root: string): Set<string> => {
  const visited = new Set<string>();
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.shift();
    if (current === undefined || visited.has(current)) continue;
    visited.add(current);
    pending.push(...dependencies(current));
  }
  return visited;
};

const requireReachable = (root: string, required: readonly string[]): void => {
  const reachable = closure(root);
  for (const name of required) {
    if (!reachable.has(name)) fail(`${root} does not reach ${name}`);
  }
};

const removedScripts = [
  ['check:plugin-', 'iframe-runtime'].join(''),
  ['check:plugin-runtime-', 'session'].join(''),
  ['check:plugin-runtime-security-', 'lifecycle'].join(''),
];
for (const removed of removedScripts) {
  if (scripts[removed] !== undefined) fail(`removed root script remains: ${removed}`);
  for (const [name, command] of Object.entries(scripts)) {
    if (command.includes(removed)) fail(`${name} still invokes removed root script ${removed}`);
  }
}

requireReachable('check:open-isolated-plugin-runtime', [
  'check:plugin-resource-service',
  'check:plugin-child-webview-navigation',
  'check:plugin-child-webview-session',
  'check:plugin-rpc-validation',
  'check:plugin-host-api-dispatcher',
  'check:plugin-development-runtime-evidence',
  'check:no-dual-plugin-runtime',
]);
requireReachable('check:plugin-development-documentation', [
  'check:plugin-development-mode',
  'check:plugin-project-template',
  'check:plugin-developer-cli',
  'check:open-isolated-plugin-runtime',
]);
requireReachable('check:official-plugin-release-pipeline', [
  'check:official-config-lens-plugin',
  'check:official-plugin-release-dry-run',
  'check:open-isolated-plugin-runtime',
]);

const rootCheck = scripts.check ?? '';
if (!rootCheck.includes('node scripts/workspace-lifecycle.ts check')) {
  fail('root check no longer runs the workspace lifecycle aggregator');
}
if (!rootCheck.includes('check:plugin-development-documentation')) {
  fail('root check no longer reaches the plugin development and Runtime aggregate');
}

const members = discoverWorkspaceMembers(rootDir);
validateLifecycleScripts(members, rootDir);
for (const member of members) {
  for (const lifecycle of REQUIRED_LIFECYCLE_SCRIPTS) {
    if (typeof member.manifest.scripts?.[lifecycle] !== 'string') {
      fail(`${member.relativePath} is missing ${lifecycle}`);
    }
  }
}

console.log(
  'Plugin Runtime gate graph preserves resource, navigation, Session, RPC, Host API, development, official, open-isolated, and workspace lifecycle coverage.',
);
