import { afterEach, beforeEach, describe, expect, rs, test } from '@rstest/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode, useEffect } from 'react';
import { HostWindowBootstrap } from '../src/app/windows/HostWindowBootstrap';
import {
  createHostWindowPort,
  HOST_WINDOW_SNAPSHOT_EVENT,
  parseHostWindowOperation,
  parseHostWindowSnapshot,
} from '../src/app/windows/host-window-protocol';

const entryUrl =
  'lensx-plugin://0123456789abcdef0123456789abcdef.runtime.localhost/v1/0123456789abcdef0123456789abcdef/v1-636f6d2e61636d652e776f726b7370616365/1.2.3/index.html';
const rawSnapshot = (id = 1) => ({
  contract_version: '0.1.0',
  shell_epoch: `shell_${id}`,
  revision: '1',
  owner: { window_label: `plugin-window-${id.toString(16).padStart(16, '0')}`, ownership_revision: '2' },
  phase: 'preparing',
  page: {
    owner_id: 'com.acme.workspace',
    page_id: 'home',
    title: 'Home',
    plugin_name: 'Workspace',
    action_name: 'Home',
  },
  locale: 'en-US',
  theme: 'light',
  binding: null,
  error_code: null,
});
const rect = HTMLElement.prototype.getBoundingClientRect;
beforeEach(() => {
  HTMLElement.prototype.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 650, bottom: 600, width: 650, height: 600 }) as DOMRect;
});
afterEach(() => {
  HTMLElement.prototype.getBoundingClientRect = rect;
});

describe('native-derived Host bootstrap and lightweight shell', () => {
  test('main and two detached bootstraps instantiate global application services only once', async () => {
    let activeMainServices = 0;
    let mainStarts = 0;
    const Main = () => {
      useEffect(() => {
        mainStarts++;
        activeMainServices++;
        return () => {
          activeMainServices--;
        };
      }, []);
      return <div>Main application</div>;
    };
    const loadMain = rs.fn(async () => ({ default: Main }));
    const buildPort = (id: number) =>
      createHostWindowPort(
        async (command) => {
          if (command === 'read_host_window_bootstrap')
            return id === 0
              ? { contract_version: '0.1.0', mode: 'main' }
              : { contract_version: '0.1.0', mode: 'detached', snapshot: rawSnapshot(id) };
          if (command === 'subscribe_host_window')
            return { contract_version: '0.1.0', subscription_id: `subscription_${id}`, snapshot: rawSnapshot(id) };
          return { contract_version: '0.1.0', accepted: true };
        },
        async () => ({ channelId: '__CHANNEL__:1', release: () => undefined }),
      );
    const ports = [buildPort(0), buildPort(1), buildPort(2)];
    const view = render(
      <>
        <HostWindowBootstrap port={ports[0]} loadMainApplication={loadMain} />
        <HostWindowBootstrap port={ports[1]} loadMainApplication={loadMain} />
        <HostWindowBootstrap port={ports[2]} loadMainApplication={loadMain} />
      </>,
    );
    expect(await screen.findByText('Main application')).toBeInTheDocument();
    await waitFor(() => expect(document.querySelectorAll('[data-host-window-mode="detached"]')).toHaveLength(2));
    expect(loadMain).toHaveBeenCalledTimes(1);
    expect(mainStarts).toBe(1);
    expect(activeMainServices).toBe(1);
    view.unmount();
    expect(activeMainServices).toBe(0);
  });

  test.each([
    { contract_version: '0.1.0', mode: 'main', window_label: 'main' },
    {
      contract_version: '0.1.0',
      mode: 'detached',
      snapshot: { ...rawSnapshot(), owner: { window_label: 'main', ownership_revision: '1' } },
    },
    { contract_version: '9.0.0', mode: 'main' },
  ])('never falls back to main for malformed or self-selected bootstrap %#', async (payload) => {
    const invoke = rs.fn(async () => payload);
    const loadMain = rs.fn(async () => ({ default: () => <div>Forbidden main bootstrap</div> }));
    const port = createHostWindowPort(invoke, async () => ({ channelId: '__CHANNEL__:1', release: () => undefined }));
    render(<HostWindowBootstrap port={port} loadMainApplication={loadMain} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('This plugin page could not be loaded');
    expect(loadMain).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledExactlyOnceWith('read_host_window_bootstrap', { request: {} });
  });

  test('keeps confirmed locale/theme and accessible Page metadata without rendering duplicate window chrome', async () => {
    let deliver: ((payload: unknown) => void) | undefined;
    let finishSubscribe!: (value: unknown) => void;
    const unsubscribe = rs.fn();
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const invoke = rs.fn(async (command: string, args?: Record<string, unknown>) => {
      calls.push({ command, args });
      if (command === 'read_host_window_bootstrap')
        return { contract_version: '0.1.0', mode: 'detached', snapshot: rawSnapshot() };
      if (command === 'subscribe_host_window')
        return new Promise((resolve) => {
          finishSubscribe = resolve;
        });
      return { contract_version: '0.1.0', accepted: true };
    });
    const port = createHostWindowPort(invoke, async (event, listener) => {
      expect(event).toBe(HOST_WINDOW_SNAPSHOT_EVENT);
      deliver = listener;
      return { channelId: '__CHANNEL__:1', release: unsubscribe };
    });
    const loadMain = rs.fn(async () => ({ default: () => <div>Unused main</div> }));
    const view = render(<HostWindowBootstrap port={port} loadMainApplication={loadMain} />);
    await waitFor(() => expect(calls.some(({ command }) => command === 'subscribe_host_window')).toBe(true));
    const newest = {
      ...rawSnapshot(),
      revision: '3',
      phase: 'active',
      locale: 'zh-CN',
      theme: 'dark',
      page: { ...rawSnapshot().page, title: '第三页', plugin_name: '工作区', action_name: '第三页' },
      binding: { attempt_id: 'attempt_0000000000000001', entry_url: entryUrl, resource_generation: '1' },
    };
    await act(async () => {
      deliver?.(newest);
      finishSubscribe({
        contract_version: '0.1.0',
        subscription_id: 'subscription_1',
        snapshot: { ...rawSnapshot(), revision: '2' },
      });
    });
    const content = await screen.findByRole('main', { name: '第三页' });
    expect(content.querySelector('[data-plugin-runtime-slot="true"]')).not.toBeNull();
    expect(calls.filter(({ command }) => command === 'ready_host_window')).toHaveLength(0);
    await waitFor(() =>
      expect(calls.find(({ command }) => command === 'update_host_window_slot')?.args).toMatchObject({
        request: { snapshot_revision: '3', physical_bounds: { x: 0, y: 0, width: 650, height: 600 } },
      }),
    );
    expect(document.body).toHaveAttribute('theme-mode', 'dark');
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(content).not.toHaveTextContent('第三页');
    expect(content).not.toHaveTextContent('工作区');
    fireEvent.mouseDown(content, { button: 0 });
    expect(calls.some(({ command }) => command === 'drag_host_window' || command === 'close_host_window')).toBe(false);
    expect(
      calls.some(({ command }) =>
        /preferences|shortcut|installation|management|read_host_window_operations/u.test(command),
      ),
    ).toBe(false);
    expect(loadMain).not.toHaveBeenCalled();
    view.unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(calls.some(({ command }) => command === 'release_host_window_subscription')).toBe(true));
    const previous = calls.length;
    await act(async () => {
      deliver?.({ ...newest, revision: '4' });
    });
    expect(calls).toHaveLength(previous);
  });
});

test('shell and coordination DTOs reject cross-window fields, stale shapes and invalid numeric identities', () => {
  for (const patch of [
    { extra: true },
    { revision: '0' },
    { shell_epoch: '../main' },
    { binding: { attempt_id: 'attempt_0000000000000000', entry_url: entryUrl, resource_generation: '1' } },
    { owner: { window_label: 'plugin-child-0000000000000001', ownership_revision: '1' } },
  ]) {
    expect(() => parseHostWindowSnapshot({ ...rawSnapshot(), ...patch })).toThrow();
  }
  const operation = {
    contract_version: '0.1.0',
    operation_id: 'op_1',
    transfer_token: 'migration_1',
    attempt_id: 'attempt_0000000000000001',
    kind: 'restore_navigation',
    from_owner: rawSnapshot().owner,
    to_owner: { window_label: 'main', ownership_revision: '2' },
    shell_epoch: 'shell_1',
    outcome: null,
  };
  expect(parseHostWindowOperation(operation).to_owner.ownershipRevision).toBe(2n);
  expect(() => parseHostWindowOperation({ ...operation, kind: 'close_instance', outcome: 'committed' })).toThrow();
  expect(() => parseHostWindowOperation({ ...operation, shell_url: 'tauri://localhost/?mode=main' })).toThrow();
});

test('main coordination wraps presentation commands without impersonating the detached shell source', async () => {
  const invoke = rs.fn(async () => ({
    contract_version: '0.3.0',
    attempt_id: 'attempt_0000000000000001',
    window_label: rawSnapshot().owner.window_label,
    ownership_revision: '1',
    entry_url: entryUrl,
    resource_generation: '1',
  }));
  const port = createHostWindowPort(invoke, async () => ({ channelId: '__CHANNEL__:1', release: () => undefined }));
  await port.presentation('shell_1').create({
    owner: { windowLabel: rawSnapshot().owner.window_label, ownershipRevision: 1n },
    identity: {
      entryId: 'entry_0123456789abcdef',
      pluginId: 'com.acme.workspace',
      version: '1.2.3',
      pageId: 'home',
      expectedRevision: '7',
    },
    scaleFactor: 1,
    physicalBounds: { x: 0, y: 0, width: 650, height: 600 },
    presentationRevision: 1n,
  });
  expect(invoke).toHaveBeenCalledExactlyOnceWith(
    'coordinate_plugin_child_webview',
    expect.objectContaining({
      request: expect.objectContaining({
        contract_version: '0.1.0',
        shell_epoch: 'shell_1',
        operation: 'create',
        request: expect.objectContaining({
          contract_version: '0.3.0',
          window_label: rawSnapshot().owner.window_label,
          ownership_revision: '1',
        }),
      }),
    }),
  );
});

test('allocates no Channel for cancelled listeners and releases exact subscriptions after a late handshake', async () => {
  let channelSequence = 0;
  const localReleases: Array<ReturnType<typeof rs.fn>> = [];
  const channels = rs.fn(async () => {
    const release = rs.fn();
    localReleases.push(release);
    return { channelId: `__CHANNEL__:${++channelSequence}`, release };
  });
  let finishOld!: (value: unknown) => void;
  const invoke = rs.fn(async (command: string, args?: Record<string, unknown>) => {
    const request = args?.request as Record<string, unknown>;
    if (command === 'subscribe_host_window') {
      if (request.channel_id === '__CHANNEL__:1')
        return new Promise((resolve) => {
          finishOld = resolve;
        });
      return {
        contract_version: '0.1.0',
        subscription_id: 'subscription_new',
        snapshot: { ...rawSnapshot(), revision: '2' },
      };
    }
    if (command === 'read_host_window_snapshot')
      return { contract_version: '0.1.0', snapshot: { ...rawSnapshot(), revision: '3' } };
    return { contract_version: '0.1.0', accepted: true };
  });
  const port = createHostWindowPort(invoke, channels);
  const cancelUnused = await port.listenSnapshots(() => undefined);
  cancelUnused();
  expect(channels).not.toHaveBeenCalled();
  expect(invoke).not.toHaveBeenCalled();
  const stopOld = await port.listenSnapshots(() => undefined);
  const oldHandshake = port.subscribeShell('shell_1');
  await waitFor(() =>
    expect(invoke).toHaveBeenCalledWith('subscribe_host_window', {
      request: { contract_version: '0.1.0', shell_epoch: 'shell_1', channel_id: '__CHANNEL__:1' },
    }),
  );
  stopOld();
  const stopNew = await port.listenSnapshots(() => undefined);
  await expect(port.subscribeShell('shell_1')).resolves.toMatchObject({ revision: '2' });
  finishOld({ contract_version: '0.1.0', subscription_id: 'subscription_old', snapshot: rawSnapshot() });
  await oldHandshake;
  await waitFor(() =>
    expect(invoke).toHaveBeenCalledWith('release_host_window_subscription', {
      request: {
        contract_version: '0.1.0',
        shell_epoch: 'shell_1',
        subscription_id: 'subscription_old',
        channel_id: '__CHANNEL__:1',
      },
    }),
  );
  await expect(port.subscribeShell('shell_1')).resolves.toMatchObject({ revision: '3' });
  expect(channels).toHaveBeenCalledTimes(2);
  expect(localReleases[0]).toHaveBeenCalledTimes(1);
  expect(localReleases[1]).not.toHaveBeenCalled();
  stopNew();
  await waitFor(() =>
    expect(invoke).toHaveBeenCalledWith('release_host_window_subscription', {
      request: {
        contract_version: '0.1.0',
        shell_epoch: 'shell_1',
        subscription_id: 'subscription_new',
        channel_id: '__CHANNEL__:2',
      },
    }),
  );
  expect(localReleases[1]).toHaveBeenCalledTimes(1);
});

test('main operation channel registers once and later reconciliation uses only the read command', async () => {
  const channel = rs.fn(async () => ({ channelId: '__CHANNEL__:19', release: rs.fn() }));
  const invoke = rs.fn(async (command: string) =>
    command === 'subscribe_host_window_operations'
      ? { contract_version: '0.1.0', subscription_id: 'subscription_main', operations: [] }
      : command === 'read_host_window_operations'
        ? { contract_version: '0.1.0', operations: [] }
        : { contract_version: '0.1.0', accepted: true },
  );
  const port = createHostWindowPort(invoke, channel);
  const stop = await port.listenOperations(() => undefined);
  await expect(port.readOperations()).resolves.toEqual([]);
  await expect(port.readOperations()).resolves.toEqual([]);
  expect(channel).toHaveBeenCalledTimes(1);
  expect(invoke).toHaveBeenCalledWith('subscribe_host_window_operations', {
    request: { contract_version: '0.1.0', channel_id: '__CHANNEL__:19' },
  });
  expect(invoke).toHaveBeenCalledWith('read_host_window_operations', { request: { contract_version: '0.1.0' } });
  stop();
  await waitFor(() =>
    expect(invoke).toHaveBeenCalledWith('release_host_window_subscription', {
      request: {
        contract_version: '0.1.0',
        shell_epoch: null,
        subscription_id: 'subscription_main',
        channel_id: '__CHANNEL__:19',
      },
    }),
  );
});

test('bounds an unanswered channel handshake and discards its callback by actual-source cleanup', async () => {
  rs.useFakeTimers();
  try {
    const localRelease = rs.fn();
    const invoke = rs.fn(async (command: string) => {
      if (command === 'subscribe_host_window_operations') return new Promise<never>(() => undefined);
      return { contract_version: '0.1.0', accepted: true };
    });
    const port = createHostWindowPort(invoke, async () => ({ channelId: '__CHANNEL__:27', release: localRelease }));
    const stop = await port.listenOperations(() => undefined);
    const pending = port.readOperations();
    const rejected = expect(pending).rejects.toThrow('Host window state is unavailable.');
    await rs.advanceTimersByTimeAsync(10_000);
    await rejected;
    expect(localRelease).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('release_host_window_subscription', {
      request: { contract_version: '0.1.0', shell_epoch: null, subscription_id: null, channel_id: '__CHANNEL__:27' },
    });
    stop();
    expect(localRelease).toHaveBeenCalledTimes(1);
  } finally {
    rs.useRealTimers();
  }
});

test.each([
  'snapshots',
  'operations',
] as const)('releases a %s subscription when its initial payload is malformed', async (kind) => {
  const localRelease = rs.fn();
  const invoke = rs.fn(async (command: string) => {
    if (command.startsWith('subscribe_host_window')) {
      return {
        contract_version: '0.1.0',
        subscription_id: 'subscription_invalid',
        ...(kind === 'snapshots' ? { snapshot: {} } : { operations: [{}] }),
      };
    }
    return { contract_version: '0.1.0', accepted: true };
  });
  const port = createHostWindowPort(invoke, async () => ({ channelId: '__CHANNEL__:31', release: localRelease }));
  const stop = await (kind === 'snapshots'
    ? port.listenSnapshots(() => undefined)
    : port.listenOperations(() => undefined));
  await expect(kind === 'snapshots' ? port.subscribeShell('shell_1') : port.readOperations()).rejects.toThrow(
    'Host window state is unavailable.',
  );
  await waitFor(() =>
    expect(invoke).toHaveBeenCalledWith('release_host_window_subscription', {
      request: {
        contract_version: '0.1.0',
        shell_epoch: kind === 'snapshots' ? 'shell_1' : null,
        subscription_id: 'subscription_invalid',
        channel_id: '__CHANNEL__:31',
      },
    }),
  );
  expect(localRelease).toHaveBeenCalledTimes(1);
  stop();
  expect(localRelease).toHaveBeenCalledTimes(1);
});

test('first ready follows successful subscription even at the bootstrap revision and reports later geometry changes', async () => {
  let finishSubscribe!: (value: unknown) => void;
  const invoke = rs.fn(async (command: string, _args?: Record<string, unknown>) => {
    if (command === 'read_host_window_bootstrap')
      return { contract_version: '0.1.0', mode: 'detached', snapshot: rawSnapshot() };
    if (command === 'subscribe_host_window')
      return new Promise((resolve) => {
        finishSubscribe = resolve;
      });
    return { contract_version: '0.1.0', accepted: true };
  });
  const port = createHostWindowPort(invoke, async () => ({ channelId: '__CHANNEL__:1', release: () => undefined }));
  const view = render(
    <StrictMode>
      <HostWindowBootstrap port={port} />
    </StrictMode>,
  );
  await waitFor(() => expect(finishSubscribe).toBeDefined());
  fireEvent(window, new Event('resize'));
  expect(invoke.mock.calls.filter(([command]) => command === 'ready_host_window')).toHaveLength(0);
  expect(invoke.mock.calls.filter(([command]) => command === 'update_host_window_slot')).toHaveLength(0);
  await act(async () =>
    finishSubscribe({ contract_version: '0.1.0', subscription_id: 'subscription_1', snapshot: rawSnapshot() }),
  );
  await waitFor(() =>
    expect(invoke).toHaveBeenCalledWith('ready_host_window', {
      request: {
        contract_version: '0.1.0',
        shell_epoch: 'shell_1',
        snapshot_revision: '1',
        scale_factor: window.devicePixelRatio,
        physical_bounds: { x: 0, y: 0, width: 650, height: 600 },
      },
    }),
  );
  fireEvent(window, new Event('resize'));
  expect(invoke.mock.calls.filter(([command]) => command === 'ready_host_window')).toHaveLength(1);
  HTMLElement.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 720, 640);
  fireEvent(window, new Event('resize'));
  await waitFor(() =>
    expect(invoke).toHaveBeenCalledWith('update_host_window_slot', {
      request: {
        contract_version: '0.1.0',
        shell_epoch: 'shell_1',
        snapshot_revision: '1',
        presentation_revision: '1',
        scale_factor: window.devicePixelRatio,
        physical_bounds: { x: 0, y: 0, width: 720, height: 640 },
      },
    }),
  );
  view.unmount();
  fireEvent(window, new Event('resize'));
  expect(invoke.mock.calls.filter(([command]) => command === 'ready_host_window')).toHaveLength(1);
  expect(invoke.mock.calls.filter(([command]) => command === 'update_host_window_slot')).toHaveLength(1);
});

test('discarding a shell during its handshake never starts ready or slot reporting', async () => {
  let finishSubscribe!: (value: unknown) => void;
  const release = rs.fn();
  const invoke = rs.fn(async (command: string) => {
    if (command === 'read_host_window_bootstrap')
      return { contract_version: '0.1.0', mode: 'detached', snapshot: rawSnapshot() };
    if (command === 'subscribe_host_window')
      return new Promise((resolve) => {
        finishSubscribe = resolve;
      });
    return { contract_version: '0.1.0', accepted: true };
  });
  const view = render(
    <HostWindowBootstrap port={createHostWindowPort(invoke, async () => ({ channelId: '__CHANNEL__:1', release }))} />,
  );
  await waitFor(() => expect(finishSubscribe).toBeDefined());
  view.unmount();
  await act(async () =>
    finishSubscribe({ contract_version: '0.1.0', subscription_id: 'subscription_1', snapshot: rawSnapshot() }),
  );
  fireEvent(window, new Event('resize'));
  expect(release).toHaveBeenCalledTimes(1);
  expect(
    invoke.mock.calls.filter(([command]) => command === 'ready_host_window' || command === 'update_host_window_slot'),
  ).toHaveLength(0);
});

test('a newer rendered snapshot waits for the previous geometry request and ignores its stale failure', async () => {
  let deliver!: (value: unknown) => void;
  let rejectFirst!: (error: Error) => void;
  const invoke = rs.fn(async (command: string, _args?: Record<string, unknown>) => {
    if (command === 'read_host_window_bootstrap')
      return { contract_version: '0.1.0', mode: 'detached', snapshot: rawSnapshot() };
    if (command === 'subscribe_host_window')
      return { contract_version: '0.1.0', subscription_id: 'subscription_1', snapshot: rawSnapshot() };
    if (command === 'ready_host_window')
      return new Promise((_resolve, reject) => {
        rejectFirst = reject;
      });
    return { contract_version: '0.1.0', accepted: true };
  });
  const port = createHostWindowPort(invoke, async (_event, callback) => {
    deliver = callback;
    return { channelId: '__CHANNEL__:1', release: () => undefined };
  });
  render(<HostWindowBootstrap port={port} />);
  await waitFor(() => expect(rejectFirst).toBeDefined());
  await act(async () =>
    deliver({
      ...rawSnapshot(),
      revision: '2',
      phase: 'active',
      binding: { attempt_id: 'attempt_0000000000000001', entry_url: entryUrl, resource_generation: '1' },
    }),
  );
  expect(invoke.mock.calls.filter(([command]) => command === 'update_host_window_slot')).toHaveLength(0);
  await act(async () => rejectFirst(new Error('/private/stale')));
  await waitFor(() =>
    expect(invoke).toHaveBeenCalledWith('update_host_window_slot', {
      request: {
        contract_version: '0.1.0',
        shell_epoch: 'shell_1',
        snapshot_revision: '2',
        presentation_revision: '1',
        scale_factor: window.devicePixelRatio,
        physical_bounds: { x: 0, y: 0, width: 650, height: 600 },
      },
    }),
  );
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
