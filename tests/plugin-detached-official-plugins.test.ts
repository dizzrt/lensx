/// <reference path="../plugins/config-lens/src/editor/monaco-modules.d.ts" />
import { afterEach, expect, rs, test } from '@rstest/core';
import {
  createDeferred,
  createPluginRuntimeContextFixture,
  FakePluginSdkTransport,
} from '../packages/plugin-testkit/src';
import { replaceEditorContent } from '../plugins/config-lens/src/editor/MonacoSurface';
import { disposeMonacoWorkers, loadMonaco } from '../plugins/config-lens/src/editor/monaco';
import { createLanguageController, type LanguageWorker } from '../plugins/config-lens/src/language/controller';
import { executeLanguageRequest } from '../plugins/config-lens/src/language/engine';
import type { LanguageWorkerRequest } from '../plugins/config-lens/src/language/protocol';
import { type ConfigLensRuntimeState, createConfigLensRuntime } from '../plugins/config-lens/src/runtime';
import { createTranslationController } from '../plugins/translation/src/controller';
import { createTranslationProvider } from '../plugins/translation/src/provider';
import { createSdkHttpTransport } from '../plugins/translation/src/provider/transport';
import { createTranslationRuntime, type RuntimeState } from '../plugins/translation/src/runtime';
import { createSettingsController } from '../plugins/translation/src/settings';
import { createPluginRuntimeLifecycleService } from '../src/app/plugins/runtime/lifecycle-controller';

const flush = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
const cleanups: (() => void | Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  rs.useRealTimers();
  rs.unstubAllGlobals();
});

// Only Worker delivery is controlled: production parsing, controller and Monaco
// model/undo code execute normally. This does not model AppKit or WebKit scheduling.
class HeldLanguageWorker implements LanguageWorker {
  onerror: ((event: ErrorEvent) => unknown) | null = null;
  onmessage: ((event: MessageEvent<unknown>) => unknown) | null = null;
  readonly requests: LanguageWorkerRequest[] = [];
  readonly terminate = rs.fn();
  postMessage(request: LanguageWorkerRequest) {
    this.requests.push(request);
  }
  async complete() {
    const request = this.requests.at(-1);
    if (!request) throw new Error('Missing Worker request');
    const result = await executeLanguageRequest(request);
    this.onmessage?.(new MessageEvent('message', { data: result }));
  }
}
class EditorWorker extends EventTarget {
  readonly postMessage = rs.fn();
  readonly terminate = rs.fn();
}

test('ConfigLens retains the real Monaco undo stack, SDK and in-flight language work across Host ownership transfer', async () => {
  rs.stubGlobal('Worker', EditorWorker);
  cleanups.push(disposeMonacoWorkers);
  const monaco = await loadMonaco('en-US');
  const model = monaco.editor.createModel('{"value":1}', 'json');
  const siblingModel = monaco.editor.createModel('', 'json');
  cleanups.push(() => {
    model.dispose();
    siblingModel.dispose();
  });
  const editor = {
    pushUndoStop: () => {
      model.pushStackElement();
      return true;
    },
  };
  expect(replaceEditorContent(editor, model, '{"value":2}')).toBe(true);
  const worker = new HeldLanguageWorker();
  const factory = rs.fn(() => worker);
  const language = createLanguageController(factory);
  const transport = new FakePluginSdkTransport();
  const states: ConfigLensRuntimeState[] = [];
  const runtime = createConfigLensRuntime(
    () => transport,
    (state) => states.push(state),
  );
  const lifecycle = createPluginRuntimeLifecycleService();
  cleanups.push(() => lifecycle.dispose());
  const release = async () => {
    language.dispose();
    await runtime.dispose();
  };
  const attempt = await lifecycle.start({ targetKey: 'config-lens', onFailure: () => undefined });
  if (!attempt) throw new Error('Runtime admission failed');
  attempt.bindRuntime(release);
  await flush();
  attempt.markReady();
  expect(states.at(-1)?.kind).toBe('ready');
  const pending = language.run('json', 'format', model.getValue(), { inputVersion: 1, selectionVersion: 0 });
  const generation = language.generation();
  const owner = await lifecycle.transfer(attempt.key, attempt.currentOwner(), 'detached-config', release);
  expect(owner?.surfaceId).toBe('detached-config');
  await attempt.releasePresentation();
  expect(lifecycle.getCurrent()).toBeUndefined();
  expect(lifecycle.getCurrent('detached-config')).toBe(attempt);
  expect(language.generation()).toBe(generation);
  expect(worker.terminate).not.toHaveBeenCalled();
  expect(factory).toHaveBeenCalledTimes(1);
  expect(worker.requests).toHaveLength(1);
  expect(transport.observation.connectAttempts).toBe(1);
  expect(transport.observation.disposeCalls).toBe(0);
  expect(model.getValue()).toBe('{"value":2}');
  expect(siblingModel.getValue()).toBe('');
  await worker.complete();
  const result = await pending;
  expect(result.status).toBe('valid');
  if (result.output === undefined) throw new Error('Formatting did not produce output');
  expect(replaceEditorContent(editor, model, result.output)).toBe(true);
  expect(model.getValue()).toContain('\n');
  await model.undo();
  expect(model.getValue()).toBe('{"value":2}');
  await model.undo();
  expect(model.getValue()).toBe('{"value":1}');
  const context = createPluginRuntimeContextFixture({ locale: 'zh-CN', theme: 'dark' });
  transport.emit('runtime.context_changed', context);
  expect(states.at(-1)).toEqual({ kind: 'ready', context });
  expect(factory).toHaveBeenCalledTimes(1);
  expect(transport.observation.connectAttempts).toBe(1);
  await attempt.terminate('manual_close');
  await attempt.terminate('manual_close');
  expect(worker.terminate).toHaveBeenCalledTimes(1);
  expect(transport.observation.disposeCalls).toBe(1);
  const count = states.length;
  transport.emit('runtime.context_changed', createPluginRuntimeContextFixture());
  expect(states).toHaveLength(count);
});

test('Translation preserves its original signed HTTP request and independent sibling input through transfer and close', async () => {
  rs.useFakeTimers();
  const lifecycle = createPluginRuntimeLifecycleService();
  cleanups.push(() => lifecycle.dispose());
  const context = createPluginRuntimeContextFixture({ capabilities: ['http.request', 'storage.get'] });
  const stored = {
    version: 1,
    provider: 'volcengine',
    targetLanguage: 'zh',
    credentials: { accessKeyId: 'fixture-ak', secretAccessKey: 'fixture-sk' },
  };
  const open = async () => {
    const response = createDeferred<unknown>();
    const transport = new FakePluginSdkTransport({
      connect: () => context,
      request: (request) => {
        if (request.method === 'storage.get') return { method: 'storage.get', result: { found: true, value: stored } };
        if (request.method === 'http.request') return response.promise;
        throw new Error('Unexpected public API method');
      },
    });
    const states: RuntimeState[] = [];
    const runtime = createTranslationRuntime(
      () => transport,
      (state) => states.push(state),
    );
    await flush();
    const ready = states.at(-1);
    if (ready?.kind !== 'ready') throw new Error('SDK not ready');
    const settings = createSettingsController({ client: ready.client, initialLocale: 'en-US' });
    const provider = createTranslationProvider({
      request: createSdkHttpTransport(ready.client),
      now: () => new Date('2026-11-03T00:00:00Z'),
    });
    const controller = createTranslationController({ settings, translate: provider });
    const release = async () => {
      controller.dispose();
      settings.dispose();
      await runtime.dispose();
    };
    const attempt = await lifecycle.start({ targetKey: 'translation', onFailure: () => undefined });
    if (!attempt) throw new Error('Runtime admission failed');
    attempt.bindRuntime(release);
    attempt.markReady();
    await settings.load();
    return { response, transport, states, ready, controller, attempt, release };
  };
  const first = await open();
  first.controller.input('original A1');
  await rs.advanceTimersByTimeAsync(400);
  expect(first.controller.getSnapshot().status).toBe('translating');
  const http = first.transport.observation.requests.filter((request) => request.method === 'http.request');
  expect(http).toHaveLength(1);
  expect(
    await lifecycle.transfer(first.attempt.key, first.attempt.currentOwner(), 'detached-translation', first.release),
  ).toBeDefined();
  const second = await open();
  second.controller.input('independent A2');
  await rs.advanceTimersByTimeAsync(400);
  await second.attempt.terminate('manual_close');
  expect(first.controller.getSnapshot()).toMatchObject({ text: 'original A1', status: 'translating' });
  expect(first.transport.observation.disposeCalls).toBe(0);
  const updated = { ...context, locale: 'zh-CN', theme: 'dark' } as const;
  first.transport.emit('runtime.context_changed', updated);
  expect(first.states.at(-1)).toMatchObject({
    kind: 'ready',
    context: updated,
    client: first.ready.client,
    attempt: 1,
  });
  first.response.resolve({
    method: 'http.request',
    result: {
      status: 200,
      headers: [],
      body: JSON.stringify({
        TranslationList: [{ Translation: '原实例结果', DetectedSourceLanguage: 'en' }],
        ResponseMetadata: { RequestId: 'original-result' },
      }),
    },
  });
  await flush();
  expect(first.controller.getSnapshot()).toMatchObject({
    text: 'original A1',
    translation: '原实例结果',
    status: 'success',
    requestId: 'original-result',
  });
  expect(first.transport.observation.requests.filter((request) => request.method === 'http.request')).toEqual(http);
  expect(first.transport.observation.connectAttempts).toBe(1);
  second.response.resolve({ method: 'http.request', result: { status: 200, headers: [], body: '{}' } });
  await flush();
  expect(first.controller.getSnapshot().translation).toBe('原实例结果');
  expect(second.controller.getSnapshot().translation).toBe('');
  await lifecycle.terminateAll('app_teardown');
  expect(first.transport.observation.disposeCalls).toBe(1);
  expect(second.transport.observation.disposeCalls).toBe(1);
});
