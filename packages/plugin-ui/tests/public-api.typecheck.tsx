import type { PluginRuntimeContext } from '@lensx/plugin-sdk';
import type { ReactNode } from 'react';

import {
  PluginFeedback,
  type PluginFeedbackProps,
  PluginPage,
  type PluginPageProps,
  PluginUiProvider,
  type PluginUiProviderProps,
} from '../src/index.js';

declare const context: PluginRuntimeContext;
declare const content: ReactNode;

const providerProps: PluginUiProviderProps = { children: content, context };
const pageProps: PluginPageProps = { children: content, title: 'Title' };
const feedbackProps: PluginFeedbackProps = { kind: 'error', onRecovery: () => undefined };
const examples = {
  feedback: <PluginFeedback {...feedbackProps} />,
  page: <PluginPage {...pageProps} />,
  provider: <PluginUiProvider {...providerProps} />,
};
void examples;

// @ts-expect-error Host navigation is deliberately outside the public page API.
const hostNavigationLeak: PluginPageProps = { children: content, navigation: {}, title: 'Title' };
void hostNavigationLeak;

// @ts-expect-error Recovery belongs only to the discriminated error state.
const invalidLoadingRecovery: PluginFeedbackProps = { kind: 'loading', onRecovery: () => undefined };
void invalidLoadingRecovery;
