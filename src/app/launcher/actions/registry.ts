import type {
  LauncherActionDescriptor,
  LauncherActionDiagnostic,
  LauncherActionRegistrationInput,
  LauncherActionRegistrationResult,
} from './types';
import {
  cloneLauncherActionDescriptor,
  sortLauncherActionDiagnostics,
  validateLauncherActionDescriptor,
} from './validation';

interface RegisteredLauncherAction {
  readonly descriptor: LauncherActionDescriptor;
  readonly executor: LauncherActionRegistrationInput['executor'];
}

const registryState = new WeakMap<LauncherActionRegistry, Map<string, RegisteredLauncherAction>>();

const createDuplicateDiagnostic = (path: string): LauncherActionDiagnostic => ({
  code: 'duplicate_action_id',
  path,
  message: 'Action ID is already registered.',
});

const prefixDiagnostic = (diagnostic: LauncherActionDiagnostic, index: number): LauncherActionDiagnostic => ({
  ...diagnostic,
  path: `/${index}/descriptor${diagnostic.path}`,
});

export class LauncherActionRegistry {
  constructor() {
    registryState.set(this, new Map());
  }

  register(registration: LauncherActionRegistrationInput): LauncherActionRegistrationResult {
    const state = registryState.get(this);
    if (!state) {
      throw new Error('Launcher action registry is not initialized.');
    }

    const validation = validateLauncherActionDescriptor(registration.descriptor);
    const diagnostics: LauncherActionDiagnostic[] = [...validation.diagnostics];
    if (typeof registration.executor !== 'function') {
      diagnostics.push({
        code: 'invalid_type',
        path: '/executor',
        message: 'Action executor must be a function.',
      });
    }
    if (validation.ok && state.has(validation.descriptor.action_id)) {
      diagnostics.push(createDuplicateDiagnostic('/descriptor/action_id'));
    }

    const sortedDiagnostics = sortLauncherActionDiagnostics(diagnostics);
    if (!validation.ok || sortedDiagnostics.length > 0) {
      return {
        ok: false,
        diagnostics: Object.freeze(sortedDiagnostics),
      };
    }

    const registeredAction = Object.freeze({
      descriptor: cloneLauncherActionDescriptor(validation.descriptor),
      executor: registration.executor,
    });
    state.set(registeredAction.descriptor.action_id, registeredAction);

    return {
      ok: true,
      descriptors: Object.freeze([cloneLauncherActionDescriptor(registeredAction.descriptor)]),
      diagnostics: [],
    };
  }

  registerBatch(registrations: readonly LauncherActionRegistrationInput[]): LauncherActionRegistrationResult {
    const state = registryState.get(this);
    if (!state) {
      throw new Error('Launcher action registry is not initialized.');
    }

    const diagnostics: LauncherActionDiagnostic[] = [];
    const validRegistrations: RegisteredLauncherAction[] = [];
    const batchIds = new Set<string>();

    registrations.forEach((registration, index) => {
      const validation = validateLauncherActionDescriptor(registration.descriptor);
      diagnostics.push(...validation.diagnostics.map((diagnostic) => prefixDiagnostic(diagnostic, index)));

      if (typeof registration.executor !== 'function') {
        diagnostics.push({
          code: 'invalid_type',
          path: `/${index}/executor`,
          message: 'Action executor must be a function.',
        });
      }

      if (!validation.ok || typeof registration.executor !== 'function') {
        return;
      }

      const { action_id: actionId } = validation.descriptor;
      if (state.has(actionId) || batchIds.has(actionId)) {
        diagnostics.push(createDuplicateDiagnostic(`/${index}/descriptor/action_id`));
        return;
      }

      batchIds.add(actionId);
      validRegistrations.push(
        Object.freeze({
          descriptor: cloneLauncherActionDescriptor(validation.descriptor),
          executor: registration.executor,
        }),
      );
    });

    const sortedDiagnostics = sortLauncherActionDiagnostics(diagnostics);
    if (sortedDiagnostics.length > 0) {
      return {
        ok: false,
        diagnostics: Object.freeze(sortedDiagnostics),
      };
    }

    for (const registration of validRegistrations) {
      state.set(registration.descriptor.action_id, registration);
    }

    return {
      ok: true,
      descriptors: Object.freeze(validRegistrations.map(({ descriptor }) => cloneLauncherActionDescriptor(descriptor))),
      diagnostics: [],
    };
  }

  get(actionId: string): LauncherActionDescriptor | undefined {
    const registration = registryState.get(this)?.get(actionId);
    return registration ? cloneLauncherActionDescriptor(registration.descriptor) : undefined;
  }

  snapshot(): readonly LauncherActionDescriptor[] {
    const state = registryState.get(this);
    if (!state) {
      return Object.freeze([]);
    }

    return Object.freeze(
      [...state.values()]
        .map(({ descriptor }) => cloneLauncherActionDescriptor(descriptor))
        .sort((left, right) => left.action_id.localeCompare(right.action_id)),
    );
  }
}

export const resolveRegisteredLauncherAction = (
  registry: LauncherActionRegistry,
  actionId: string,
): RegisteredLauncherAction | undefined => registryState.get(registry)?.get(actionId);
