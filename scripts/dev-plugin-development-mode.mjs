import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { applyDevelopmentLauncherResult, runDevelopmentLauncher } from './development-launcher.mjs';

const isDirectExecution = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectExecution) {
  runDevelopmentLauncher({ mode: 'plugin-development', arguments: process.argv.slice(2) })
    .then((result) => applyDevelopmentLauncherResult(result))
    .catch(() =>
      applyDevelopmentLauncherResult({
        kind: 'failure',
        code: 1,
        diagnostic: '[development-launcher/internal] Development launcher failed.',
      }),
    );
}
