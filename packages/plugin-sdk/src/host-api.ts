import type { HostApiMethodDefinition } from './contract';

export const HOST_API_METHODS = {
  runtimeGetContext: 'lensx.runtime.get_context',
  actionsOpen: 'lensx.actions.open',
  eventsEmit: 'lensx.events.emit',
  uiClose: 'lensx.ui.close',
  preferencesGet: 'lensx.preferences.get',
} as const;

export const HOST_API_PERMISSIONS = {
  preferencesRead: 'lensx.preferences.read',
} as const;

export const HOST_API_DEFINITIONS: HostApiMethodDefinition[] = [
  {
    id: HOST_API_METHODS.runtimeGetContext,
  },
  {
    id: HOST_API_METHODS.actionsOpen,
  },
  {
    id: HOST_API_METHODS.eventsEmit,
  },
  {
    id: HOST_API_METHODS.uiClose,
  },
  {
    id: HOST_API_METHODS.preferencesGet,
    permission: HOST_API_PERMISSIONS.preferencesRead,
  },
];
