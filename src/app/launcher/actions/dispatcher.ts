import { type LauncherActionRegistry, resolveRegisteredLauncherAction } from './registry';
import type { LauncherActionDispatchResult } from './types';

const failure = (
  actionId: string,
  code: 'action_execution_failed' | 'action_not_found' | 'action_unavailable',
  message: string,
): LauncherActionDispatchResult =>
  Object.freeze({
    ok: false,
    action_id: actionId,
    error: Object.freeze({ code, message }),
  });

export class LauncherActionDispatcher {
  constructor(private readonly registry: LauncherActionRegistry) {}

  async dispatch(actionId: string): Promise<LauncherActionDispatchResult> {
    const registration = resolveRegisteredLauncherAction(this.registry, actionId);
    if (!registration) {
      return failure(actionId, 'action_not_found', 'Launcher action was not found.');
    }
    if (!registration.descriptor.enabled) {
      return failure(actionId, 'action_unavailable', 'Launcher action is unavailable.');
    }

    try {
      const executorResult: unknown = await registration.executor();
      if (executorResult !== undefined) {
        return failure(actionId, 'action_execution_failed', 'Launcher action execution failed.');
      }
    } catch {
      return failure(actionId, 'action_execution_failed', 'Launcher action execution failed.');
    }

    return Object.freeze({
      ok: true,
      action_id: actionId,
    });
  }
}
