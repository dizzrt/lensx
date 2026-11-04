import { Channel, invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { AppLocale } from '../i18n/types';
import { isValidIsolatedPluginRuntimeEntryUrl } from '../plugins/runtime/helpers';
import {
  type PluginChildWebviewOwner,
  parsePluginChildWebviewOwner,
  serializePluginChildWebviewOwner,
} from '../plugins/runtime/pluginChildWebviewOwner';
import {
  createPluginChildWebviewPresentationController,
  type PluginChildWebviewPresentationBinding,
  validPluginResourceGeneration,
} from '../plugins/runtime/pluginChildWebviewPresentation';
import type { PluginChildWebviewPhysicalBounds } from '../plugins/runtime/pluginChildWebviewSlot';
import type { ThemeMode } from '../theme/theme';

export const HOST_WINDOW_VERSION = '0.1.0' as const;
export const HOST_WINDOW_SNAPSHOT_EVENT = 'plugin-host-window://snapshot';
export const HOST_WINDOW_OPERATION_EVENT = 'plugin-host-window://operation';
export interface HostWindowPage {
  readonly owner_id: string;
  readonly page_id: string;
  readonly title: string;
  readonly plugin_name: string;
  readonly action_name: string;
}
export interface HostWindowSnapshot {
  readonly contract_version: typeof HOST_WINDOW_VERSION;
  readonly shell_epoch: string;
  readonly revision: string;
  readonly owner: PluginChildWebviewOwner;
  readonly phase: 'preparing' | 'active' | 'recovery_required' | 'closing';
  readonly page: HostWindowPage;
  readonly locale: AppLocale;
  readonly theme: ThemeMode;
  readonly binding: PluginChildWebviewPresentationBinding | null;
  readonly error_code: 'runtime_unavailable' | 'recovery_required' | null;
}
export type HostWindowBootstrap =
  | { readonly mode: 'main' }
  | { readonly mode: 'detached'; readonly snapshot: HostWindowSnapshot };
export interface HostWindowOperation {
  readonly contract_version: typeof HOST_WINDOW_VERSION;
  readonly operation_id: string;
  readonly transfer_token: string;
  readonly attempt_id: string;
  readonly kind:
    | 'prepare_transfer'
    | 'transfer_navigation'
    | 'restore_navigation'
    | 'set_main_home'
    | 'settle_transfer'
    | 'close_instance';
  readonly from_owner: PluginChildWebviewOwner;
  readonly to_owner: PluginChildWebviewOwner;
  readonly shell_epoch: string;
  readonly outcome: 'committed' | 'restored' | 'recovery_required' | 'terminated' | null;
}
export interface PluginWindowRecoveryTicket {
  readonly attemptId: `attempt_${string}`;
  readonly transferToken: string;
}
export type PluginWindowOperationResult =
  | { readonly status: 'committed' | 'restored'; readonly owner: PluginChildWebviewOwner }
  | { readonly status: 'recovery_required' | 'recovering' | 'closing'; readonly ticket: PluginWindowRecoveryTicket }
  | { readonly status: 'rejected' | 'busy' | 'terminated' | 'superseded' };
export interface PluginWindowNativeState {
  readonly admissionFailure: string | null;
  readonly pendingAttempts: readonly string[];
  readonly recovery: readonly Extract<PluginWindowOperationResult, { ticket: PluginWindowRecoveryTicket }>[];
}
export type HostWindowInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;
export interface HostWindowChannelLease {
  readonly channelId: string;
  readonly release: () => void;
}
export type HostWindowListen = (event: string, handler: (payload: unknown) => void) => Promise<HostWindowChannelLease>;
const nativeListen: HostWindowListen = async (_event, handler) => {
  const channel = new Channel<unknown>(handler);
  return {
    channelId: channel.toJSON(),
    release: () => {
      channel.onmessage = () => undefined;
    },
  };
};
const fail = (): never => {
  throw new TypeError('Host window state is unavailable.');
};
const record = (value: unknown, keys: readonly string[]): Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return fail();
  const source = value as Record<string, unknown>;
  if (Object.keys(source).length !== keys.length || keys.some((key) => !Object.hasOwn(source, key))) return fail();
  return source;
};
const opaque = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/u.test(value);
const attempt = (value: unknown): value is `attempt_${string}` =>
  typeof value === 'string' && /^attempt_(?!0000000000000000)[0-9a-f]{16}$/u.test(value);
const text = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  [...value].length <= 512 &&
  new TextEncoder().encode(value).length <= 2048;
const owner = (value: unknown): PluginChildWebviewOwner => {
  const item = record(value, ['window_label', 'ownership_revision']);
  return parsePluginChildWebviewOwner(item.window_label, item.ownership_revision);
};
export const parseHostWindowSnapshot = (value: unknown): HostWindowSnapshot => {
  const source = record(value, [
    'contract_version',
    'shell_epoch',
    'revision',
    'owner',
    'phase',
    'page',
    'locale',
    'theme',
    'binding',
    'error_code',
  ]);
  if (
    source.contract_version !== HOST_WINDOW_VERSION ||
    !opaque(source.shell_epoch) ||
    !validPluginResourceGeneration(source.revision) ||
    !['preparing', 'active', 'recovery_required', 'closing'].includes(String(source.phase)) ||
    !['en-US', 'zh-CN'].includes(String(source.locale)) ||
    !['light', 'dark'].includes(String(source.theme)) ||
    (source.error_code !== null &&
      source.error_code !== 'runtime_unavailable' &&
      source.error_code !== 'recovery_required')
  )
    return fail();
  const page = record(source.page, ['owner_id', 'page_id', 'title', 'plugin_name', 'action_name']);
  if (
    typeof page.owner_id !== 'string' ||
    !/^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)+$/u.test(page.owner_id) ||
    typeof page.page_id !== 'string' ||
    !/^[a-z][a-z0-9_-]{0,63}$/u.test(page.page_id) ||
    !text(page.title) ||
    !text(page.plugin_name) ||
    !text(page.action_name)
  )
    return fail();
  const bindingOwner = owner(source.owner);
  if (bindingOwner.windowLabel === 'main') return fail();
  let binding: PluginChildWebviewPresentationBinding | null = null;
  if (source.binding !== null) {
    const item = record(source.binding, ['attempt_id', 'entry_url', 'resource_generation']);
    if (
      !attempt(item.attempt_id) ||
      typeof item.entry_url !== 'string' ||
      !isValidIsolatedPluginRuntimeEntryUrl(item.entry_url) ||
      !validPluginResourceGeneration(item.resource_generation)
    )
      return fail();
    binding = Object.freeze({
      attemptId: item.attempt_id,
      owner: bindingOwner,
      entryUrl: item.entry_url,
      resourceGeneration: item.resource_generation,
    });
  }
  return Object.freeze({
    ...source,
    page: Object.freeze({ ...page }),
    owner: bindingOwner,
    binding,
  }) as unknown as HostWindowSnapshot;
};
export const parseHostWindowOperation = (value: unknown): HostWindowOperation => {
  const source = record(value, [
    'contract_version',
    'operation_id',
    'transfer_token',
    'attempt_id',
    'kind',
    'from_owner',
    'to_owner',
    'shell_epoch',
    'outcome',
  ]);
  if (
    source.contract_version !== HOST_WINDOW_VERSION ||
    !opaque(source.operation_id) ||
    !opaque(source.transfer_token) ||
    !opaque(source.shell_epoch) ||
    !attempt(source.attempt_id) ||
    ![
      'prepare_transfer',
      'transfer_navigation',
      'restore_navigation',
      'set_main_home',
      'settle_transfer',
      'close_instance',
    ].includes(String(source.kind)) ||
    (source.outcome !== null &&
      !['committed', 'restored', 'recovery_required', 'terminated'].includes(String(source.outcome))) ||
    ['settle_transfer', 'close_instance'].includes(String(source.kind)) !== (source.outcome !== null) ||
    (source.kind === 'close_instance' && source.outcome !== 'terminated')
  )
    return fail();
  return Object.freeze({
    ...source,
    from_owner: owner(source.from_owner),
    to_owner: owner(source.to_owner),
  }) as unknown as HostWindowOperation;
};
const accepted = (value: unknown): boolean => {
  const source = record(value, ['contract_version', 'accepted']);
  if (source.contract_version !== HOST_WINDOW_VERSION || typeof source.accepted !== 'boolean') return fail();
  return source.accepted;
};
export const parsePluginWindowResult = (value: unknown): PluginWindowOperationResult => {
  const source = record(value, ['contract_version', 'status', 'owner', 'attempt_id', 'transfer_token']);
  if (source.contract_version !== HOST_WINDOW_VERSION) return fail();
  if (source.status === 'committed' || source.status === 'restored') {
    if (source.attempt_id !== null || source.transfer_token !== null) return fail();
    const confirmed = owner(source.owner);
    if ((source.status === 'restored') !== (confirmed.windowLabel === 'main')) return fail();
    return Object.freeze({ status: source.status, owner: confirmed });
  }
  if (source.status === 'recovery_required' || source.status === 'recovering' || source.status === 'closing') {
    if (source.owner !== null || !attempt(source.attempt_id) || !opaque(source.transfer_token)) return fail();
    return Object.freeze({
      status: source.status,
      ticket: Object.freeze({ attemptId: source.attempt_id, transferToken: source.transfer_token }),
    });
  }
  if (
    source.status === 'rejected' ||
    source.status === 'busy' ||
    source.status === 'terminated' ||
    source.status === 'superseded'
  ) {
    if (source.owner !== null || source.attempt_id !== null || source.transfer_token !== null) return fail();
    return Object.freeze({ status: source.status });
  }
  return fail();
};
export const parsePluginWindowNativeState = (value: unknown): PluginWindowNativeState => {
  const source = record(value, ['contract_version', 'pending_attempts', 'recovery', 'admission_failure']);
  if (
    source.contract_version !== HOST_WINDOW_VERSION ||
    !Array.isArray(source.pending_attempts) ||
    !source.pending_attempts.every(attempt) ||
    new Set(source.pending_attempts).size !== source.pending_attempts.length ||
    !Array.isArray(source.recovery)
  )
    return fail();
  const recovery = source.recovery.map(parsePluginWindowResult).map((result) => {
    if (!('ticket' in result)) return fail();
    return result;
  });
  let admissionFailure: string | null = null;
  if (source.admission_failure !== null) {
    const failure = record(source.admission_failure, ['attempt_id']);
    if (!attempt(failure.attempt_id)) return fail();
    admissionFailure = failure.attempt_id;
  }
  if (new Set(recovery.map(({ ticket }) => ticket.attemptId)).size !== recovery.length) return fail();
  return Object.freeze({
    admissionFailure,
    pendingAttempts: Object.freeze([...source.pending_attempts]),
    recovery: Object.freeze(recovery),
  });
};
const request = (value: Record<string, unknown> = {}) => ({
  request: { contract_version: HOST_WINDOW_VERSION, ...value },
});
interface NativeHostSubscription {
  readonly event: string;
  readonly handler: (payload: unknown) => void;
  active: boolean;
  localReleased: boolean;
  shellEpoch: string | null;
  subscriptionId?: string;
  channel?: HostWindowChannelLease;
  channelRequest?: Promise<HostWindowChannelLease>;
  registration?: Promise<unknown>;
  readonly releases: Set<string>;
}

export const createHostWindowPort = (call: HostWindowInvoke = invoke, subscribe: HostWindowListen = nativeListen) => {
  let snapshots: NativeHostSubscription | undefined;
  let operations: NativeHostSubscription | undefined;
  const bounded = (command: string, args?: Record<string, unknown>): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new TypeError('Host window state is unavailable.')), 10_000);
      void Promise.resolve()
        .then(() => call(command, args))
        .then(
          (value) => {
            clearTimeout(timer);
            resolve(value);
          },
          (error) => {
            clearTimeout(timer);
            reject(error);
          },
        );
    });
  const release = (subscription: NativeHostSubscription) => {
    subscription.active = false;
    const channel = subscription.channel;
    if (!channel) return;
    if (!subscription.localReleased) {
      channel.release();
      subscription.localReleased = true;
    }
    const key = `${subscription.subscriptionId ?? ''}\0${channel.channelId}`;
    if (subscription.releases.has(key)) return;
    subscription.releases.add(key);
    void bounded(
      'release_host_window_subscription',
      request({
        shell_epoch: subscription.shellEpoch,
        subscription_id: subscription.subscriptionId ?? null,
        channel_id: channel.channelId,
      }),
    ).catch(() => undefined);
  };
  const listener = (event: string, handler: (payload: unknown) => void): Promise<UnlistenFn> => {
    const previous = event === HOST_WINDOW_SNAPSHOT_EVENT ? snapshots : operations;
    if (previous) release(previous);
    const subscription: NativeHostSubscription = {
      event,
      handler,
      active: true,
      localReleased: false,
      shellEpoch: null,
      releases: new Set(),
    };
    if (event === HOST_WINDOW_SNAPSHOT_EVENT) snapshots = subscription;
    else operations = subscription;
    return Promise.resolve(() => release(subscription));
  };
  const channelFor = async (subscription: NativeHostSubscription) => {
    if (!subscription.active) return fail();
    subscription.channelRequest ??= subscribe(subscription.event, (payload) => {
      if (!subscription.active) return;
      try {
        subscription.handler(payload);
      } catch {
        /* Malformed data does not change authority or stop the channel. */
      }
    });
    const channel = await subscription.channelRequest;
    subscription.channel = channel;
    if (!/^__CHANNEL__:[0-9]{1,10}$/u.test(channel.channelId)) {
      release(subscription);
      return fail();
    }
    if (!subscription.active) {
      release(subscription);
      return fail();
    }
    return channel;
  };
  const register = async (subscription: NativeHostSubscription, command: string, fields: Record<string, unknown>) => {
    if (subscription.registration) return subscription.registration;
    subscription.registration = (async () => {
      const channel = await channelFor(subscription);
      try {
        const response = await bounded(command, request({ ...fields, channel_id: channel.channelId }));
        if (
          response !== null &&
          typeof response === 'object' &&
          opaque((response as Record<string, unknown>).subscription_id)
        ) {
          subscription.subscriptionId = (response as { subscription_id: string }).subscription_id;
        }
        if (!subscription.active) release(subscription);
        return response;
      } catch (error) {
        release(subscription);
        throw error;
      }
    })();
    return subscription.registration;
  };
  return {
    async listenPluginWindowState(callback: () => void) {
      return listen('plugin-detached-window-state-changed', ({ payload }) => {
        try {
          const hint = record(payload, ['contract_version', 'attempt_id']);
          if (hint.contract_version === HOST_WINDOW_VERSION && attempt(hint.attempt_id)) callback();
        } catch {
          /* A state hint can only request a fresh authoritative read. */
        }
      });
    },
    async readPluginWindowState() {
      return parsePluginWindowNativeState(await bounded('read_detached_window_state', request()));
    },
    async retryRecovery(ticket: PluginWindowRecoveryTicket) {
      return parsePluginWindowResult(
        await bounded(
          'retry_detached_window_recovery',
          request({ attempt_id: ticket.attemptId, transfer_token: ticket.transferToken }),
        ),
      );
    },
    async closeRecovery(ticket: PluginWindowRecoveryTicket) {
      return parsePluginWindowResult(
        await bounded(
          'close_detached_window_recovery',
          request({ attempt_id: ticket.attemptId, transfer_token: ticket.transferToken }),
        ),
      );
    },
    async quitPluginWindows() {
      return accepted(await bounded('quit_plugin_windows', request()));
    },
    async bootstrap(): Promise<HostWindowBootstrap> {
      const raw = await bounded('read_host_window_bootstrap', { request: {} });
      if (raw !== null && typeof raw === 'object' && (raw as { mode?: unknown }).mode === 'main') {
        const source = record(raw, ['contract_version', 'mode']);
        if (source.contract_version !== HOST_WINDOW_VERSION) return fail();
        return { mode: 'main' };
      }
      const source = record(raw, ['contract_version', 'mode', 'snapshot']);
      if (source.contract_version !== HOST_WINDOW_VERSION || source.mode !== 'detached') return fail();
      return { mode: 'detached', snapshot: parseHostWindowSnapshot(source.snapshot) };
    },
    listenSnapshots: (callback: (snapshot: HostWindowSnapshot) => void) =>
      listener(HOST_WINDOW_SNAPSHOT_EVENT, (value) => {
        try {
          callback(parseHostWindowSnapshot(value));
        } catch {
          /* Invalid native state grants no authority. */
        }
      }),
    listenOperations: (callback: (operation: HostWindowOperation) => void) =>
      listener(HOST_WINDOW_OPERATION_EVENT, (value) => {
        try {
          callback(parseHostWindowOperation(value));
        } catch {
          /* Invalid native state is ignored. */
        }
      }),
    async subscribeShell(shellEpoch: string) {
      const subscription = snapshots;
      if (!subscription?.active) return fail();
      subscription.shellEpoch = shellEpoch;
      if (subscription.subscriptionId) {
        const response = record(await bounded('read_host_window_snapshot', request({ shell_epoch: shellEpoch })), [
          'contract_version',
          'snapshot',
        ]);
        if (response.contract_version !== HOST_WINDOW_VERSION) return fail();
        return parseHostWindowSnapshot(response.snapshot);
      }
      try {
        const response = record(await register(subscription, 'subscribe_host_window', { shell_epoch: shellEpoch }), [
          'contract_version',
          'subscription_id',
          'snapshot',
        ]);
        if (response.contract_version !== HOST_WINDOW_VERSION || !opaque(response.subscription_id)) return fail();
        return parseHostWindowSnapshot(response.snapshot);
      } catch (error) {
        release(subscription);
        throw error;
      }
    },
    async readSnapshot(windowLabel: string) {
      const response = record(await bounded('read_host_window_snapshot', request({ window_label: windowLabel })), [
        'contract_version',
        'snapshot',
      ]);
      if (response.contract_version !== HOST_WINDOW_VERSION) return fail();
      return parseHostWindowSnapshot(response.snapshot);
    },
    async readSnapshotByEpoch(shellEpoch: string) {
      const response = record(await bounded('read_host_window_snapshot', request({ shell_epoch: shellEpoch })), [
        'contract_version',
        'snapshot',
      ]);
      if (response.contract_version !== HOST_WINDOW_VERSION) return fail();
      return parseHostWindowSnapshot(response.snapshot);
    },
    async readOperations() {
      const subscription = operations;
      const first = subscription?.active && !subscription.subscriptionId;
      try {
        const response = record(
          first
            ? await register(subscription, 'subscribe_host_window_operations', {})
            : await bounded('read_host_window_operations', request()),
          first ? ['contract_version', 'subscription_id', 'operations'] : ['contract_version', 'operations'],
        );
        if (
          response.contract_version !== HOST_WINDOW_VERSION ||
          (first && !opaque(response.subscription_id)) ||
          !Array.isArray(response.operations) ||
          response.operations.length > 128
        )
          return fail();
        return response.operations.map(parseHostWindowOperation);
      } catch (error) {
        if (first) release(subscription);
        throw error;
      }
    },
    async acknowledge(
      operation: HostWindowOperation,
      success: boolean,
      geometry?: { scaleFactor: number; bounds: PluginChildWebviewPhysicalBounds },
    ) {
      return accepted(
        await call(
          'ack_host_window_operation',
          request({
            operation_id: operation.operation_id,
            transfer_token: operation.transfer_token,
            accepted: success,
            geometry: geometry ? { scale_factor: geometry.scaleFactor, physical_bounds: geometry.bounds } : null,
          }),
        ),
      );
    },
    async ready(snapshot: HostWindowSnapshot, scaleFactor: number, bounds: PluginChildWebviewPhysicalBounds) {
      return accepted(
        await bounded(
          'ready_host_window',
          request({
            shell_epoch: snapshot.shell_epoch,
            snapshot_revision: snapshot.revision,
            scale_factor: scaleFactor,
            physical_bounds: bounds,
          }),
        ),
      );
    },
    async updateSlot(
      snapshot: HostWindowSnapshot,
      revision: bigint,
      scaleFactor: number,
      bounds: PluginChildWebviewPhysicalBounds,
    ) {
      return accepted(
        await bounded(
          'update_host_window_slot',
          request({
            shell_epoch: snapshot.shell_epoch,
            snapshot_revision: snapshot.revision,
            presentation_revision: revision.toString(),
            scale_factor: scaleFactor,
            physical_bounds: bounds,
          }),
        ),
      );
    },
    async replaceInstance(attemptId: string, owner: PluginChildWebviewOwner) {
      accepted(
        await call(
          'replace_host_instance',
          request({ attempt_id: attemptId, owner: serializePluginChildWebviewOwner(owner) }),
        ),
      );
    },
    async closeInstance(attemptId: string) {
      accepted(await call('close_host_instance', request({ attempt_id: attemptId })));
    },
    async waitOwner(attemptId: string): Promise<PluginChildWebviewOwner | undefined> {
      try {
        const response = record(await bounded('wait_host_instance_owner', request({ attempt_id: attemptId })), [
          'contract_version',
          'owner',
          'status',
        ]);
        if (response.contract_version !== HOST_WINDOW_VERSION || response.status !== 'stable') return undefined;
        return owner(response.owner);
      } catch {
        return undefined;
      }
    },
    async interaction(overlayOpen: boolean) {
      return accepted(await call('publish_main_host_interaction', request({ overlay_open: overlayOpen })));
    },
    async preferences(locale: AppLocale, theme: ThemeMode) {
      return accepted(await call('publish_host_window_preferences', request({ locale, theme })));
    },
    async publishMain(binding: PluginChildWebviewPresentationBinding, page: HostWindowPage) {
      return accepted(
        await call(
          'publish_main_host_page',
          request({
            attempt_id: binding.attemptId,
            owner: serializePluginChildWebviewOwner(binding.owner),
            page,
            binding: {
              attempt_id: binding.attemptId,
              entry_url: binding.entryUrl,
              resource_generation: binding.resourceGeneration,
            },
          }),
        ),
      );
    },
    async publishShell(
      snapshot: Pick<HostWindowSnapshot, 'shell_epoch' | 'phase' | 'error_code'>,
      owner: PluginChildWebviewOwner,
      page: HostWindowPage,
      binding: PluginChildWebviewPresentationBinding | null,
    ) {
      const response = record(
        await call(
          'publish_host_window_page',
          request({
            shell_epoch: snapshot.shell_epoch,
            phase: snapshot.phase,
            error_code: snapshot.error_code,
            owner: serializePluginChildWebviewOwner(owner),
            page,
            binding: binding && {
              attempt_id: binding.attemptId,
              entry_url: binding.entryUrl,
              resource_generation: binding.resourceGeneration,
            },
          }),
        ),
        ['contract_version', 'snapshot'],
      );
      if (response.contract_version !== HOST_WINDOW_VERSION) return fail();
      return parseHostWindowSnapshot(response.snapshot);
    },
    async geometry(shellEpoch: string) {
      const response = record(await call('read_host_window_geometry', request({ shell_epoch: shellEpoch })), [
        'contract_version',
        'snapshot_revision',
        'scale_factor',
        'physical_bounds',
      ]);
      if (
        response.contract_version !== HOST_WINDOW_VERSION ||
        !validPluginResourceGeneration(response.snapshot_revision) ||
        typeof response.scale_factor !== 'number' ||
        !Number.isFinite(response.scale_factor) ||
        response.scale_factor <= 0
      )
        return fail();
      const bounds = record(response.physical_bounds, ['x', 'y', 'width', 'height']);
      if (
        !['x', 'y', 'width', 'height'].every(
          (key) => typeof bounds[key] === 'number' && Number.isFinite(bounds[key]),
        ) ||
        Number(bounds.width) <= 0 ||
        Number(bounds.height) <= 0 ||
        Number(bounds.x) < 0 ||
        Number(bounds.y) < 0
      )
        return fail();
      return { scaleFactor: response.scale_factor, bounds: bounds as unknown as PluginChildWebviewPhysicalBounds };
    },
    presentation(shellEpoch: string) {
      const operations: Record<string, string> = {
        read_plugin_child_webview_admission: 'admission',
        create_plugin_child_webview_presentation: 'create',
        read_plugin_child_webview_presentation: 'read',
        wait_plugin_child_webview_presentation: 'wait',
        set_plugin_child_webview_presentation_visibility: 'visibility',
        destroy_plugin_child_webview_presentation: 'destroy',
        update_plugin_child_webview_slot: 'slot',
      };
      return createPluginChildWebviewPresentationController((command, args) => {
        const operation = operations[command];
        if (!operation || !args?.request) return Promise.reject(new TypeError('Unsupported Host window operation.'));
        return call(
          'coordinate_plugin_child_webview',
          request({ shell_epoch: shellEpoch, operation, request: args.request }),
        );
      });
    },
  };
};
export type HostWindowPort = ReturnType<typeof createHostWindowPort>;
export const desktopHostWindowPort = createHostWindowPort();
