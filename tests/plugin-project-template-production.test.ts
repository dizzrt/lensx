import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

import { describe, expect, test } from '@rstest/core';
import {
  inspectPluginPackage,
  type PluginPackageInputFile,
  packPluginPackage,
} from '../packages/plugin-cli/dist/src/package-format/index.js';
import { createPluginSdk } from '../packages/plugin-sdk/src';
import { createPluginIframeTransport } from '../packages/plugin-sdk/src/iframe';
import { LauncherActionDispatcher, LauncherActionRegistry } from '../src/app/launcher/actions';
import { AppNavigationService, PageRegistry } from '../src/app/navigation';
import type {
  PluginRegistrationDesktopAdapter,
  PluginRegistrationDetailResponse,
  PluginRegistrationSnapshot,
} from '../src/app/plugins/registration';
import {
  attachPluginRuntimeTransport,
  createMutablePluginHostApiContextSource,
  createPluginHostApiDispatcherFactory,
  createPluginPageRuntimeResolver,
  createPluginRuntimeLifecycleService,
  createPluginRuntimeSessionService,
  isExactPluginRuntimeIframePolicy,
  isValidIsolatedPluginRuntimeEntryUrl,
  PLUGIN_RUNTIME_IFRAME_SANDBOX,
  PLUGIN_RUNTIME_PERMISSIONS_POLICY,
  PLUGIN_RUNTIME_REFERRER_POLICY,
  type PluginRuntimeSession,
  type PluginRuntimeTransportAdapter,
} from '../src/app/plugins/runtime';
import { createPluginSurfaceProjectionService } from '../src/app/plugins/surfaces';

const repositoryRoot = resolve(import.meta.dirname, '..');
const templateDirectories = ['framework-neutral', 'react-semi'] as const;

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

class PluginDocumentWindow {
  readonly parent = Object.freeze({ kind: 'lensx-host-parent' });
  readonly listeners = new Set<(event: unknown) => void>();
  readonly bootstrapMessages: unknown[] = [];

  addEventListener(_type: 'message', listener: (event: unknown) => void) {
    this.listeners.add(listener);
  }

  removeEventListener(_type: 'message', listener: (event: unknown) => void) {
    this.listeners.delete(listener);
  }

  deliver(data: unknown, ports: readonly unknown[]) {
    this.bootstrapMessages.push(data);
    for (const listener of [...this.listeners]) {
      listener({ data, origin: 'lensx-runtime-harness://localhost', ports, source: this.parent });
    }
  }
}

const installPluginWindow = (window: PluginDocumentWindow): (() => void) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: window });
  return () => {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else Reflect.deleteProperty(globalThis, 'window');
  };
};

const waitFor = async (predicate: () => boolean): Promise<void> => {
  const deadline = Date.now() + 1_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Template production-component harness timed out.');
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1));
  }
};

describe('plugin project templates through production components', () => {
  for (const directory of templateDirectories) {
    test(directory, async () => {
      const templateRoot = resolve(repositoryRoot, 'examples/plugins', directory);
      const packed = await packPluginPackage(collectPayload(resolve(templateRoot, 'dist')));
      const inspection = await inspectPluginPackage(packed.bytes);
      if (inspection.status !== 'compatible') throw new Error('Template package must be compatible.');
      const manifest = inspection.manifest;
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
      const pageResolution = pageRegistry.lookup({ owner_id: manifest.plugin_id, page_id: page.id });
      if (pageResolution === undefined) throw new Error('Production Page projection failed.');
      expect(actionRegistry.get(`${manifest.plugin_id}.${action.id}`)?.owner_id).toBe(manifest.plugin_id);

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
      const activePage = {
        owner_id: manifest.plugin_id,
        page_id: page.id,
        opened_by_action_id: `${manifest.plugin_id}.${action.id}`,
      };
      const descriptor = await resolver.resolve({ activePage, pageResolution, attempt: 0 });
      expect(resourceReads).toEqual([entryId]);
      expect(isValidIsolatedPluginRuntimeEntryUrl(descriptor.entry_url)).toBe(true);
      expect(
        isExactPluginRuntimeIframePolicy({
          sandbox: PLUGIN_RUNTIME_IFRAME_SANDBOX,
          referrerPolicy: PLUGIN_RUNTIME_REFERRER_POLICY,
          allow: PLUGIN_RUNTIME_PERMISSIONS_POLICY,
        }),
      ).toBe(true);

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

      const documentWindow = new PluginDocumentWindow();
      const restoreWindow = installPluginWindow(documentWindow);
      const context = createMutablePluginHostApiContextSource({ locale: 'zh-CN', theme: 'dark' });
      const factory = createPluginHostApiDispatcherFactory({
        actions: { registry: actionRegistry, dispatcher: new LauncherActionDispatcher(actionRegistry) },
        context,
        navigation,
      });
      const lifecycle = createPluginRuntimeLifecycleService();
      const sessionService = createPluginRuntimeSessionService();
      const oldContextEvents: unknown[] = [];
      const clients: Array<ReturnType<typeof createPluginSdk>> = [];
      let iframeBound = false;
      let resourceLease = false;

      const connect = async (attemptNumber: number) => {
        const currentDescriptor =
          attemptNumber === 0
            ? descriptor
            : await resolver.resolve({ activePage, pageResolution, attempt: attemptNumber });
        const attempt = await lifecycle.start({
          targetKey: currentDescriptor.runtime_key,
          onFailure: () => undefined,
        });
        if (attempt === undefined) throw new Error('Production Runtime attempt did not start.');
        expect(attempt.bindTrustedIdentity(currentDescriptor.entry_id, currentDescriptor.resource_generation)).toBe(
          true,
        );
        iframeBound = true;
        resourceLease = true;
        attempt.bindIframe(() => {
          iframeBound = false;
        });
        attempt.bindNavigationLease(() => {
          resourceLease = false;
        });
        attempt.bindSubscription(resolver.subscribeInvalidation?.(() => undefined) ?? (() => undefined));

        const client = createPluginSdk({ transport: createPluginIframeTransport(), timeoutMs: 1_000 });
        clients.push(client);
        const initialization = client.initialize();
        await Promise.resolve();
        let session: PluginRuntimeSession;
        let adapter: PluginRuntimeTransportAdapter | undefined;
        session = sessionService.start({
          identity: currentDescriptor,
          owningAttempt: attempt,
          targetOrigin: currentDescriptor.expected_origin,
          targetWindow: {
            postMessage: (message, _targetOrigin, ports) => documentWindow.deliver(message, ports),
          },
          consumeReadyLease: (lease) => {
            const binding = factory.create({ identity: lease.identity, isCurrent: attempt.isCurrent });
            adapter = attachPluginRuntimeTransport({
              handler: binding.handler,
              isCurrent: attempt.isCurrent,
              lease,
              onDisconnect: () => session.disconnect(),
            });
            const detach = binding.attachEmitter(adapter.emit);
            return () => {
              detach();
              adapter?.dispose();
              binding.dispose();
            };
          },
        });
        attempt.bindSession(session.dispose);
        const initialized = await initialization;
        attempt.markReady();
        expect(initialized).toMatchObject({ hostApiVersion: '0.2.0', locale: 'zh-CN', theme: 'dark' });
        expect(session.snapshot().state).toBe('ready');
        return { attempt, client, session };
      };

      try {
        const first = await connect(0);
        first.client.subscribe('runtime.context_changed', (event) => oldContextEvents.push(event));
        const second = await connect(1);
        expect(first.attempt.isCurrent()).toBe(false);
        expect(first.session.snapshot().state).toBe('disposed');
        expect(second.attempt.isCurrent()).toBe(true);
        expect(sessionService.current()).toBe(second.session);
        const currentContextEvents: unknown[] = [];
        second.client.subscribe('runtime.context_changed', (event) => currentContextEvents.push(event));
        context.update({ locale: 'en-US', theme: 'light' });
        await waitFor(() => currentContextEvents.length === 1);
        expect(second.client.context).toMatchObject({ locale: 'en-US', theme: 'light' });
        expect(oldContextEvents).toEqual([]);
        expect(documentWindow.bootstrapMessages).toHaveLength(2);
        expect(JSON.stringify(documentWindow.bootstrapMessages)).not.toMatch(
          /React|Semi|Host Context|style|locale|theme/u,
        );
        second.session.disconnect();
        expect(second.session.snapshot().state).toBe('disconnected');
        await second.client.dispose();
        await first.client.dispose();
        await lifecycle.dispose();
        sessionService.dispose();
        expect(first.attempt.isCurrent()).toBe(false);
        expect(second.attempt.isCurrent()).toBe(false);
        expect(sessionService.current()).toBeUndefined();
        expect(documentWindow.listeners.size).toBe(0);
        expect(iframeBound).toBe(false);
        expect(resourceLease).toBe(false);
      } finally {
        for (const client of clients) await client.dispose();
        await lifecycle.dispose();
        sessionService.dispose();
        restoreWindow();
        navigation.destroy();
        await projection.destroy();
      }
      expect(pageRegistry.lookup({ owner_id: manifest.plugin_id, page_id: page.id })).toBeUndefined();
      expect(actionRegistry.get(`${manifest.plugin_id}.${action.id}`)).toBeUndefined();
      expect(registrationDestroyed).toBe(true);
    });
  }
});
