import { join } from 'node:path';
import { checkRetiredReleasePolicy } from './ci/retired-release-policy.ts';
import { checkCiWorkflowPolicy } from './ci/workflow-policy.ts';

const root = join(import.meta.dirname, '..');
checkCiWorkflowPolicy(root);
checkRetiredReleasePolicy(root);
console.log('CI workflow inventory, triggers, permissions, pinned actions, runners, and no-release policy passed.');
