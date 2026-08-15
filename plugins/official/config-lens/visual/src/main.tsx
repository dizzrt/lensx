import '@lensx/plugin-ui/styles.css';
import { PluginUiProvider } from '@lensx/plugin-ui';
import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';

import { ConfigLensPage } from '../../src/ConfigLensPage.js';
import type { EditorSurfaceProps } from '../../src/editor/MonacoSurface.js';
import type { LanguageController } from '../../src/language/controller.js';
import type { LanguageResult } from '../../src/language/protocol.js';
import '../../src/styles.less';
import './visual.less';

const query = new URLSearchParams(location.search);
const locale = query.get('locale') === 'zh-CN' ? 'zh-CN' : 'en-US';
const theme = query.get('theme') === 'dark' ? 'dark' : 'light';
const scenario = query.get('scenario') ?? 'empty';
const samples: Record<string, string> = {
  empty: '',
  valid: '{"name":"ConfigLens","languages":["JSON","YAML","TOML","XML"]}',
  invalid: 'bad input',
  limit: 'a'.repeat(800),
  long: '{"description":"A deliberately long configuration value used to verify wrapping, editor containment, and responsive controls in both supported locales."}',
  focus: '{"focus":true}',
  recovery: 'bad then recover',
};

const result = (requestId: number, kind: string): LanguageResult => {
  if (kind === 'invalid' || (kind === 'recovery' && requestId === 1)) {
    return {
      requestId,
      status: 'invalid',
      diagnostics: [
        { code: 'json.syntax', severity: 'error', offset: 0, length: 3, messageKey: 'diagnostic.jsonSyntax' },
      ],
    };
  }
  if (kind === 'limit') {
    return {
      requestId,
      status: 'limit',
      diagnostics: [
        {
          code: 'input.bytes-limit',
          severity: 'error',
          offset: 0,
          length: 0,
          messageKey: 'diagnostic.inputBytesLimit',
        },
      ],
    };
  }
  return {
    requestId,
    status: 'valid',
    diagnostics: [],
    output: `{
  "name": "ConfigLens",
  "languages": ["JSON", "YAML", "TOML", "XML"]
}\n`,
  };
};

const createController = (): LanguageController => {
  let generation = 0;
  const run: LanguageController['run'] = async (_language, operation, _source) => {
    generation += 1;
    const next = result(generation, scenario);
    return operation === 'validate' && next.status === 'valid' ? { ...next, output: undefined } : next;
  };
  return {
    run,
    scheduleValidation: (_language, _source, publish) => {
      generation += 1;
      const next = result(generation, scenario);
      publish(next.status === 'valid' ? { ...next, output: undefined } : next);
    },
    invalidate: () => {
      generation += 1;
    },
    dispose: () => undefined,
    generation: () => generation,
  };
};

const VisualSurface = ({ diagnostics, input, language }: EditorSurfaceProps) => (
  <div className="visual-editor" data-diagnostics={diagnostics.length}>
    <pre data-language={language}>{input || ' '}</pre>
  </div>
);

const Harness = () => {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    const clickFormat = () =>
      [...document.querySelectorAll<HTMLButtonElement>('button')]
        .find((button) => /Format|格式化/u.test(button.textContent ?? ''))
        ?.click();
    if (['valid', 'invalid', 'limit', 'recovery'].includes(scenario)) {
      setTimeout(() => {
        clickFormat();
        if (scenario === 'recovery') setTimeout(clickFormat, 30);
      }, 20);
    }
    if (scenario === 'focus') {
      setTimeout(() => document.querySelector<HTMLButtonElement>('button')?.focus(), 20);
    }
    setTimeout(() => {
      const root = document.documentElement;
      const tokens = [
        'background',
        'surface',
        'text',
        'text-secondary',
        'border',
        'accent',
        'danger',
        'focus',
        'radius-page',
        'space-page',
      ];
      const styles = getComputedStyle(document.body);
      const editor = document.querySelector<HTMLElement>('.visual-editor');
      const toolbar = document.querySelector<HTMLElement>('.config-lens__toolbar');
      const editorRect = editor?.getBoundingClientRect();
      const toolbarRect = toolbar?.getBoundingClientRect();
      const editorBeforeControls =
        editor !== null &&
        toolbar !== null &&
        (editor.compareDocumentPosition(toolbar) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 &&
        editorRect !== undefined &&
        toolbarRect !== undefined &&
        editorRect.bottom <= toolbarRect.top;
      const noRepeatedHeading = document.querySelector('h1, .lensx-plugin-page__description') === null;
      const tokensComplete = tokens.every(
        (token) =>
          styles.getPropertyValue(`--lensx-plugin-color-${token}`).trim() !== '' ||
          styles.getPropertyValue(`--lensx-plugin-${token}`).trim() !== '',
      );
      const complete = tokensComplete && editorBeforeControls && noRepeatedHeading;
      root.dataset.visualCheck = complete ? 'passed' : 'failed';
      root.dataset.layoutCheck = editorBeforeControls && noRepeatedHeading ? 'passed' : 'failed';
      root.dataset.tokenCount = String(tokens.length);
      root.dataset.scenario = scenario;
      root.dataset.backgroundToken = styles.getPropertyValue('--lensx-plugin-color-background').trim();
    }, 180);
  }, []);
  const context = Object.freeze({ capabilities: Object.freeze([]), hostApiVersion: '0.2.0', locale, theme });
  return (
    <PluginUiProvider context={context}>
      <ConfigLensPage
        context={context}
        createController={createController}
        EditorSurface={VisualSurface}
        initialInput={samples[scenario] ?? ''}
      />
    </PluginUiProvider>
  );
};

createRoot(document.getElementById('root') as HTMLElement).render(<Harness />);
