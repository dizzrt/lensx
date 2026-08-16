import { recordConfigLensStageFromPageStart } from './startup-stages.js';

export const CONFIG_LENS_FIRST_INTERACTIVE_EVENT = 'lensx.config-lens.first-interactive' as const;

let signalled = false;

export const signalConfigLensFirstInteractive = (): void => {
  if (signalled) return;
  signalled = true;
  recordConfigLensStageFromPageStart('first_interactive');
  globalThis.dispatchEvent(new Event(CONFIG_LENS_FIRST_INTERACTIVE_EVENT));
};
