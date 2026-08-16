import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

import type { HostApiError, HostApiEvent, HostApiResult } from '@lensx/plugin-contract';
import { describe, expect, test } from '@rstest/core';
import {
  inspectPluginPackage,
  type PluginPackageInputFile,
  packPluginPackage,
} from '../packages/plugin-cli/dist/src/package-format/index.js';
import { createPluginSdk } from '../packages/plugin-sdk/src';
import { createPluginWebviewTransport } from '../packages/plugin-sdk/src/webview';
import { LauncherActionDispatcher, LauncherActionRegistry } from '../src/app/launcher/actions';
import { type ActivePage, AppNavigationService, PageRegistry } from '../src/app/navigation';
import type {
  PluginRegistrationDesktopAdapter,
  PluginRegistrationDetailResponse,
  PluginRegistrationSnapshot,
} from '../src/app/plugins/registration';
import {
  createMutablePluginHostApiContextSource,
  createPluginChildWebviewHostDispatcherController,
  createPluginHostApiDispatcherFactory,
  createPluginPageRuntimeResolver,
  createPluginRuntimeLifecycleService,
  type PluginChildWebviewHostDispatcherController,
  type PluginChildWebviewHostNativePort,
  type PluginHostApiAuthorityIdentity,
} from '../src/app/plugins/runtime';
import { createPluginSurfaceProjectionService } from '../src/app/plugins/surfaces';

const repositoryRoot = resolve(import.meta.dirname, '..');
const templateDirectories = ['framework-neutral', 'react-semi'] as const;
const WEBVIEW_BRIDGE_CARRIER_VERSION = '0.2.0' as const;
const WEBVIEW_HOST_ADAPTER_VERSION = '0.1.0' as const;

const collectPayload = (root: string): PluginPackageInputFile[] => {
  const files: PluginPackageInputFile[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.name !== 'modules.json') files.push({ path: relative(root, path), bytes: readFileSync(path) });
    }
  };
  visit(root);
  return files;
};

const opaqueId = (sequence: number) => sequence.toString(16).padStart(32, '0');
const waitFor = async (predicate: () => boolean): Promise<void> => {
  const deadline = Date.now() + 1_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Template production-component harness timed out.');
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1));
  }
};

class ChildWebviewNativeHarness implements PluginChildWebviewHostNativePort {
  readonly bridges = new Map<string, ChildWebviewBridgeHarness>();
  readonly dispatches = new Map<string, ChildWebviewBridgeHarness>();

  register(bridge: ChildWebviewBridgeHarness): void {
    this.bridges.set(bridge.sessionId, bridge);
  }

  unregister(bridge: ChildWebviewBridgeHarness): void {
    if (this.bridges.get(bridge.sessionId) === bridge) this.bridges.delete(bridge.sessionId);
    for (const [dispatchId, owner] of this.dispatches) {
      if (owner === bridge) this.dispatches.delete(dispatchId);
    }
  }

  bindDispatch(dispatchId: string, bridge: ChildWebviewBridgeHarness): void {
    this.dispatches.set(dispatchId, bridge);
  }

  async settle(dispatchId: string, output: HostApiResult | HostApiError): Promise<boolean> {
    const bridge = this.dispatches.get(dispatchId);
    this.dispatches.delete(dispatchId);
    return bridge?.settle(dispatchId, output) ?? false;
  }

  async fail(dispatchId: string): Promise<boolean> {
    const bridge = this.dispatches.get(dispatchId);
    this.dispatches.delete(dispatchId);
    return bridge?.fail(dispatchId) ?? false;
  }

  emitEvent(sessionId: string, event: HostApiEvent): boolean {
    return this.bridges.get(sessionId)?.emitHostEvent(event) ?? false;
  }
}

class ChildWebviewBridgeHarness {
  readonly bootstrap: Readonly<Record<string, unknown>>;
  readonly listeners = new Set<(frame: unknown) => void>();
  readonly outboundFrames: unknown[] = [];
  readonly pending = new Map<string, string>();
  readonly surface: Readonly<Record<string, unknown>>;
  #active = true;
  #dispatchSequence = 0;

  constructor(
    readonly sessionId: string,
    readonly identity: PluginHostApiAuthorityIdentity,
    readonly controller: PluginChildWebviewHostDispatcherController,
    readonly native: ChildWebviewNativeHarness,
  ) {
    this.bootstrap = Object.freeze({
      contract_version: WEBVIEW_BRIDGE_CARRIER_VERSION,
      type: 'lensx.plugin_bridge.ready',
      freshness: sessionId,
    });
    this.surface = Object.freeze({
      bootstrap: this.bootstrap,
      send: (frame: unknown) => this.send(frame),
      subscribe: (listener: (frame: unknown) => void) => this.subscribe(listener),
    });
    native.register(this);
  }

  send(frame: unknown): boolean {
    if (!this.#active || frame === null || typeof frame !== 'object') return false;
    this.outboundFrames.push(frame);
    const record = frame as { readonly type?: unknown; readonly request_id?: unknown; readonly request?: unknown };
    if (record.type === 'lensx.plugin_bridge.ready') return JSON.stringify(frame) === JSON.stringify(this.bootstrap);
    if (record.type === 'lensx.plugin_bridge.request' && typeof record.request_id === 'string') {
      const dispatchId = opaqueId(++this.#dispatchSequence);
      this.pending.set(dispatchId, record.request_id);
      this.native.bindDispatch(dispatchId, this);
      return this.controller.dispatch({
        contract_version: WEBVIEW_HOST_ADAPTER_VERSION,
        session_id: this.sessionId,
        dispatch_id: dispatchId,
        identity: this.identity,
        request: record.request,
      });
    }
    if (record.type === 'lensx.plugin_bridge.cancel' && typeof record.request_id === 'string') {
      const dispatchId = [...this.pending].find(([, requestId]) => requestId === record.request_id)?.[0];
      return (
        dispatchId !== undefined &&
        this.controller.cancel({
          contract_version: WEBVIEW_HOST_ADAPTER_VERSION,
          session_id: this.sessionId,
          dispatch_id: dispatchId,
        })
      );
    }
    if (record.type === 'lensx.plugin_bridge.disconnect') {
      return this.controller.disconnect({
        contract_version: WEBVIEW_HOST_ADAPTER_VERSION,
        session_id: this.sessionId,
      });
    }
    return false;
  }

  subscribe(listener: (frame: unknown) => void): () => void {
    if (!this.#active) throw new Error('Child WebView bridge is terminal.');
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  settle(dispatchId: string, output: HostApiResult | HostApiError): boolean {
    const requestId = this.pending.get(dispatchId);
    if (!this.#active || requestId === undefined) return false;
    this.pending.delete(dispatchId);
    this.emit({
      contract_version: WEBVIEW_BRIDGE_CARRIER_VERSION,
      type: 'lensx.plugin_bridge.response',
      request_id: requestId,
      ...(Object.hasOwn(output, 'method') ? { result: output } : { error: output }),
    });
    return true;
  }

  fail(dispatchId: string): boolean {
    if (!this.pending.delete(dispatchId)) return false;
    this.destroy();
    return true;
  }

  emitHostEvent(event: HostApiEvent): boolean {
    if (!this.#active) return false;
    this.emit({
      contract_version: WEBVIEW_BRIDGE_CARRIER_VERSION,
      type: 'lensx.plugin_bridge.event',
      event,
    });
    return true;
  }

  destroy(): void {
    if (!this.#active) return;
    this.emit({ contract_version: WEBVIEW_BRIDGE_CARRIER_VERSION, type: 'lensx.plugin_bridge.disconnect' });
    this.controller.disconnect({ contract_version: WEBVIEW_HOST_ADAPTER_VERSION, session_id: this.sessionId });
    this.#active = false;
    this.listeners.clear();
    this.pending.clear();
    this.native.unregister(this);
  }

  private emit(frame: unknown): void {
    for (const listener of [...this.listeners]) listener(frame);
  }
}

const installBridge = (bridge: ChildWebviewBridgeHarness): void => {
  Object.defineProperty(globalThis, '__LENSX_PLUGIN_WEBVIEW_BRIDGE__', {
    configurable: true,
    value: bridge.surface,
  });
};

describe('plugin project templates through production Child WebView components', () => {
  for (const directory of templateDirectories) {
    test(directory, async () => {
      const templateRoot = resolve(repositoryRoot, 'examples/plugins', directory);
      const packed = await packPluginPackage(collectPayload(resolve(templateRoot, 'dist')));
      const inspection = await inspectPluginPackage(packed.bytes);
      if (inspection.status !== 'compatible') throw new Error('Template package must be compatible.');
      const manifest = inspection.manifest;
      expect(manifest.runtime.kind).toBe('webview');
      const identityHash = createHash('sha256').update(manifest.plugin_id).digest('hex');
      const entryId = `entry_${identityHash.slice(0, 16)}`;
      const generation = identityHash.slice(0, 32);
      const revision = '1';
      const entryUrl = `lensx-plugin://${generation}.runtime.localhost/v1/${generation}/v1-${Buffer.from(
        manifest.plugin_id,
      ).toString('hex')}/${manifest.version}/${manifest.runtime.entry}`;
      const detail = {
        kind: 'registered' as const,
        entry_id: entryId,
        manifest,
        source: 'external' as const,
        enabled: true,
        compatibility: { lensx: true, host_api: true },
        runtime: { kind: 'inactive' as const },
        diagnostics: [] as const,
      };
      const snapshot: PluginRegistrationSnapshot = {
        contract_version: '0.3.0',
        revision,
        availability: { kind: 'available' },
        entries: [
          {
            kind: 'registered',
            entry_id: entryId,
            plugin_id: manifest.plugin_id,
            version: manifest.version,
            display: manifest.display,
            source: 'external',
            enabled: true,
            compatibility: { lensx: true, host_api: true },
            runtime: { kind: 'inactive' },
          },
        ],
      };
      let registrationDestroyed = false;
      const registrationAdapter: PluginRegistrationDesktopAdapter = {
        initialize: async () => snapshot,
        refresh: async () => snapshot,
        readDetail: async (): Promise<PluginRegistrationDetailResponse> => ({
          contract_version: '0.3.0',
          revision,
          detail,
        }),
        handleLauncherActivation: async () => snapshot,
        recoverListener: async () => snapshot,
        subscribe: () => () => undefined,
        destroy: async () => {
          registrationDestroyed = true;
        },
      };

      const pageRegistry = new PageRegistry([]);
      const actionRegistry = new LauncherActionRegistry();
      const navigation = new AppNavigationService(pageRegistry);
      let activePage: ActivePage | undefined;
      const unregisterNavigation = navigation.registerHandler((page) => {
        activePage = page;
      });
      const projection = createPluginSurfaceProjectionService({
        actionRegistry,
        navigationService: navigation,
        pageRegistry,
        registrationAdapter,
      });
      await projection.initialize();
      const page = manifest.contributes.pages[0];
      const action = manifest.contributes.actions[0];
      if (page === undefined || action === undefined) throw new Error('Template Page and Action are required.');
      const actionId = `${manifest.plugin_id}.${action.id}`;
      expect(await new LauncherActionDispatcher(actionRegistry).dispatch(actionId)).toEqual({
        ok: true,
        action_id: actionId,
      });
      const openedPage = activePage;
      if (openedPage === undefined) throw new Error('Template Action did not open its projected Page.');
      const pageResolution = pageRegistry.lookup(openedPage);
      if (pageResolution === undefined) throw new Error('Production Page projection failed.');

      const resourceReads: string[] = [];
      const resolver = createPluginPageRuntimeResolver({
        resourceAdapter: {
          resolveEntry: async (request) => {
            resourceReads.push(request.entry_id);
            return {
              contract_version: '0.1.0',
              entry_id: entryId,
              revision,
              plugin_id: manifest.plugin_id,
              version: manifest.version,
              entry_url: entryUrl,
            };
          },
        },
        surfaceProjectionService: projection,
      });
      const descriptor = await resolver.resolve({ activePage: openedPage, pageResolution, attempt: 0 });
      expect(resourceReads).toEqual([entryId]);

      const modules = JSON.parse(readFileSync(resolve(templateRoot, 'dist/modules.json'), 'utf8')) as string[];
      if (directory === 'react-semi') {
        for (const ownedRuntime of [
          ['react'],
          ['@douyinfe+semi-ui', '@douyinfe/semi-ui'],
          ['@lensx+plugin-ui', '@lensx/plugin-ui', '/packages/plugin-ui/'],
        ]) {
          expect(modules.some((identifier) => ownedRuntime.some((candidate) => identifier.includes(candidate)))).toBe(
            true,
          );
        }
      }

      const previousBridge = Object.getOwnPropertyDescriptor(globalThis, '__LENSX_PLUGIN_WEBVIEW_BRIDGE__');
      const context = createMutablePluginHostApiContextSource({ locale: 'zh-CN', theme: 'dark' });
      const factory = createPluginHostApiDispatcherFactory({
        actions: { registry: actionRegistry, dispatcher: new LauncherActionDispatcher(actionRegistry) },
        context,
        navigation,
      });
      const native = new ChildWebviewNativeHarness();
      const hostDispatcher = createPluginChildWebviewHostDispatcherController(factory, native);
      const lifecycle = createPluginRuntimeLifecycleService();
      const oldContextEvents: unknown[] = [];
      const clients: Array<ReturnType<typeof createPluginSdk>> = [];
      const bridges: ChildWebviewBridgeHarness[] = [];
      let sessionSequence = 0;

      const connect = async (attemptNumber: number) => {
        const currentDescriptor =
          attemptNumber === 0
            ? descriptor
            : await resolver.resolve({ activePage: openedPage, pageResolution, attempt: attemptNumber });
        const attempt = await lifecycle.start({
          targetKey: currentDescriptor.runtime_key,
          onFailure: () => undefined,
        });
        if (attempt === undefined) throw new Error('Production Runtime attempt did not start.');
        expect(attempt.bindTrustedIdentity(currentDescriptor.entry_id, currentDescriptor.resource_generation)).toBe(
          true,
        );
        const bridge = new ChildWebviewBridgeHarness(
          opaqueId(++sessionSequence),
          {
            entry_id: currentDescriptor.entry_id,
            plugin_id: currentDescriptor.plugin_id,
            version: currentDescriptor.version,
            page_id: currentDescriptor.page_id,
          },
          hostDispatcher,
          native,
        );
        bridges.push(bridge);
        installBridge(bridge);
        attempt.bindPresentation(() => bridge.destroy());
        const client = createPluginSdk({ transport: createPluginWebviewTransport(), timeoutMs: 1_000 });
        clients.push(client);
        const initialized = await client.initialize();
        attempt.markReady();
        expect(initialized).toMatchObject({ hostApiVersion: '0.2.0', locale: 'zh-CN', theme: 'dark' });
        return { attempt, bridge, client };
      };

      try {
        const first = await connect(0);
        first.client.subscribe('runtime.context_changed', (event) => oldContextEvents.push(event));
        const second = await connect(1);
        expect(first.attempt.isCurrent()).toBe(false);
        expect(first.bridge.listeners.size).toBe(0);
        expect(second.attempt.isCurrent()).toBe(true);
        expect(native.bridges.size).toBe(1);
        const currentContextEvents: unknown[] = [];
        second.client.subscribe('runtime.context_changed', (event) => currentContextEvents.push(event));
        context.update({ locale: 'en-US', theme: 'light' });
        await waitFor(() => currentContextEvents.length === 1);
        expect(second.client.context).toMatchObject({ locale: 'en-US', theme: 'light' });
        expect(oldContextEvents).toEqual([]);
        expect(
          bridges
            .flatMap(({ outboundFrames }) => outboundFrames)
            .filter((frame) => (frame as { readonly type?: string }).type === 'lensx.plugin_bridge.ready'),
        ).toHaveLength(2);
        expect(JSON.stringify(bridges.map(({ bootstrap }) => bootstrap))).not.toMatch(
          /plugin_id|entry_id|page_id|label|origin|path|nonce|React|Semi/u,
        );
        await second.client.dispose();
        await first.client.dispose();
        await lifecycle.dispose();
        hostDispatcher.dispose();
        expect(first.attempt.isCurrent()).toBe(false);
        expect(second.attempt.isCurrent()).toBe(false);
        expect(native.bridges.size).toBe(0);
        expect(bridges.every(({ listeners }) => listeners.size === 0)).toBe(true);
      } finally {
        for (const client of clients) await client.dispose();
        await lifecycle.dispose();
        hostDispatcher.dispose();
        if (previousBridge !== undefined) {
          Object.defineProperty(globalThis, '__LENSX_PLUGIN_WEBVIEW_BRIDGE__', previousBridge);
        } else {
          Reflect.deleteProperty(globalThis, '__LENSX_PLUGIN_WEBVIEW_BRIDGE__');
        }
        unregisterNavigation();
        navigation.destroy();
        await projection.destroy();
      }
      expect(pageRegistry.lookup({ owner_id: manifest.plugin_id, page_id: page.id })).toBeUndefined();
      expect(actionRegistry.get(actionId)).toBeUndefined();
      expect(registrationDestroyed).toBe(true);
    });
  }
});
