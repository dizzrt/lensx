import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  resolveDocumentationTasksPath,
  validateDocumentationGateComposition,
  validateRoadmapDocumentationState,
} from './plugin-development-documentation-external.ts';

const repositoryRoot = resolve(import.meta.dirname, '..');
const metadata = JSON.parse(readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8')) as {
  readonly scripts?: Readonly<Record<string, string>>;
};
const aggregate = metadata.scripts?.['check:plugin-development-documentation'] ?? '';
const diagnostics = validateDocumentationGateComposition(aggregate);
const activeTasksPath = 'openspec/changes/publish-plugin-development-documentation/tasks.md';
const archiveRoot = resolve(repositoryRoot, 'openspec/changes/archive');
const taskPaths = [
  ...(existsSync(resolve(repositoryRoot, activeTasksPath)) ? [activeTasksPath] : []),
  ...(existsSync(archiveRoot)
    ? readdirSync(archiveRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => `openspec/changes/archive/${entry.name}/tasks.md`)
        .filter((path) => existsSync(resolve(repositoryRoot, path)))
    : []),
];
const tasksPath = resolveDocumentationTasksPath(taskPaths);
if (tasksPath === undefined) {
  throw new Error('gate/change-tasks-missing: plugin development documentation tasks were not found.');
}
diagnostics.push(
  ...validateRoadmapDocumentationState(
    readFileSync(resolve(repositoryRoot, 'plugin-roadmap.md'), 'utf8'),
    readFileSync(resolve(repositoryRoot, tasksPath), 'utf8'),
  ),
);
if (diagnostics.length > 0) throw new Error(diagnostics.join('\n'));
if (!(metadata.scripts?.check ?? '').includes('check:plugin-development-documentation')) {
  throw new Error('gate/workspace-check-missing: normal root check does not include plugin development documentation.');
}
const governance = ['README.md', 'README-zh.md', 'AGENTS.md', 'openspec/config.yaml'] as const;
for (const path of governance) {
  const source = readFileSync(resolve(repositoryRoot, path), 'utf8');
  if (source.includes('plugin-development/tutorial-')) {
    throw new Error(`boundary/tutorial-onboarding-leak: ${path}.`);
  }
}
const productionFiles: string[] = [];
const collectProduction = (directory: string): void => {
  for (const name of readdirSync(directory)) {
    const path = resolve(directory, name);
    if (statSync(path).isDirectory()) collectProduction(path);
    else if (/\.(?:rs|ts|tsx)$/u.test(name)) productionFiles.push(path);
  }
};
collectProduction(resolve(repositoryRoot, 'src'));
collectProduction(resolve(repositoryRoot, 'src-tauri/src'));
for (const path of productionFiles) {
  if (readFileSync(path, 'utf8').includes('plugin-development-documentation')) {
    throw new Error('boundary/production-dependency: documentation tooling entered a production source.');
  }
}
const hub = readFileSync(resolve(repositoryRoot, 'docs/en/plugin-development/index.md'), 'utf8');
for (const boundary of ['not-delivered', 'watch/HMR', 'signing', 'Marketplace', 'remote updates']) {
  if (!hub.includes(boundary)) throw new Error(`boundary/non-goal-missing: ${boundary}.`);
}
console.log('Plugin development documentation aggregate gate composition passed.');
