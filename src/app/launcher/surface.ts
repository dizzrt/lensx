import { invoke } from '@tauri-apps/api/core';

export const SET_LAUNCHER_SURFACE_MODE_COMMAND = 'set_launcher_surface_mode';

export type LauncherSurfaceTarget =
  | { readonly kind: 'home' }
  | { readonly kind: 'search' }
  | { readonly kind: 'host_page' }
  | {
      readonly kind: 'plugin_page';
      readonly owner_id: string;
      readonly page_id: string;
      readonly page_attempt_id: `page_attempt_${number}`;
      readonly initial_size: { readonly width: number; readonly height: number };
      readonly resizable: boolean;
    };

export interface LauncherSurfaceController {
  setPresentationState: (target: LauncherSurfaceTarget) => Promise<void>;
}

export type TauriSurfaceInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

const OWNER_PATTERN = /^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)+$/u;
const PAGE_ID_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/u;
const FIXED_TARGET_KEYS = Object.freeze(['kind']);
const PLUGIN_TARGET_KEYS = Object.freeze([
  'initial_size',
  'kind',
  'owner_id',
  'page_attempt_id',
  'page_id',
  'resizable',
]);
const SIZE_KEYS = Object.freeze(['height', 'width']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasExactKeys = (value: Record<string, unknown>, expected: readonly string[]) =>
  Object.keys(value).sort().join('\0') === [...expected].sort().join('\0');

function invalidTarget(): never {
  throw new TypeError('Invalid launcher surface target.');
}

export const validateLauncherSurfaceTarget = (value: unknown): LauncherSurfaceTarget => {
  if (!isRecord(value) || typeof value.kind !== 'string') invalidTarget();
  if (value.kind === 'home' || value.kind === 'search' || value.kind === 'host_page') {
    if (!hasExactKeys(value, FIXED_TARGET_KEYS)) invalidTarget();
    return Object.freeze({ kind: value.kind });
  }
  if (value.kind !== 'plugin_page' || !hasExactKeys(value, PLUGIN_TARGET_KEYS) || !isRecord(value.initial_size)) {
    invalidTarget();
  }
  if (
    !hasExactKeys(value.initial_size, SIZE_KEYS) ||
    typeof value.owner_id !== 'string' ||
    !OWNER_PATTERN.test(value.owner_id) ||
    typeof value.page_id !== 'string' ||
    !PAGE_ID_PATTERN.test(value.page_id) ||
    typeof value.page_attempt_id !== 'string' ||
    !/^page_attempt_[1-9][0-9]*$/u.test(value.page_attempt_id) ||
    !Number.isInteger(value.initial_size.width) ||
    Number(value.initial_size.width) < 320 ||
    Number(value.initial_size.width) > 4096 ||
    !Number.isInteger(value.initial_size.height) ||
    Number(value.initial_size.height) < 180 ||
    Number(value.initial_size.height) > 4096 ||
    typeof value.resizable !== 'boolean'
  ) {
    invalidTarget();
  }
  return Object.freeze({
    kind: 'plugin_page' as const,
    owner_id: value.owner_id,
    page_id: value.page_id,
    page_attempt_id: value.page_attempt_id as `page_attempt_${number}`,
    initial_size: Object.freeze({
      width: value.initial_size.width as number,
      height: value.initial_size.height as number,
    }),
    resizable: value.resizable,
  });
};

export const launcherSurfaceTargetKey = (target: LauncherSurfaceTarget) =>
  target.kind === 'plugin_page'
    ? `${target.kind}\0${target.owner_id}\0${target.page_id}\0${target.page_attempt_id}\0${target.initial_size.width}\0${target.initial_size.height}\0${target.resizable}`
    : target.kind;

export const createTauriLauncherSurfaceController = (
  invokeCommand: TauriSurfaceInvoke = invoke,
): LauncherSurfaceController => {
  let resizeChain = Promise.resolve();

  return {
    setPresentationState: (candidate) => {
      const target = validateLauncherSurfaceTarget(candidate);
      const resizeRequest = resizeChain.then(async () => {
        await invokeCommand(SET_LAUNCHER_SURFACE_MODE_COMMAND, { target });
      });
      resizeChain = resizeRequest.then(
        () => undefined,
        () => undefined,
      );
      return resizeRequest;
    },
  };
};

export const inertLauncherSurfaceController: LauncherSurfaceController = {
  setPresentationState: async () => undefined,
};

export const desktopLauncherSurfaceController = createTauriLauncherSurfaceController();
