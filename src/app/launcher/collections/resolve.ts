import type { LauncherActionDescriptor } from '../actions';

export const resolveLauncherActionCollection = (
  actionIds: readonly string[],
  snapshot: readonly LauncherActionDescriptor[],
): readonly LauncherActionDescriptor[] => {
  const descriptorsById = new Map(snapshot.map((descriptor) => [descriptor.action_id, descriptor]));
  return Object.freeze(
    actionIds.flatMap((actionId) => {
      const descriptor = descriptorsById.get(actionId);
      return descriptor?.enabled ? [descriptor] : [];
    }),
  );
};
