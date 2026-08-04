import { Button, Spin, Typography } from '@douyinfe/semi-ui';
import { useEffect, useReducer, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ActivePage, PageResolution } from '../../navigation';
import { isValidIsolatedPluginRuntimeEntryUrl, isValidPluginRuntimeRoute, pluginRuntimeIframeSrc } from './helpers';
import {
  PLUGIN_RUNTIME_IFRAME_SANDBOX,
  PLUGIN_RUNTIME_PERMISSIONS_POLICY,
  PLUGIN_RUNTIME_REFERRER_POLICY,
} from './policy';
import type {
  PluginPageRuntimeDescriptor,
  PluginPageRuntimeResolver,
  PluginRuntimeNavigationAdapter,
  PluginRuntimeNavigationLease,
} from './types';

export type PluginRuntimeFrameState =
  | { readonly status: 'resolving' }
  | { readonly status: 'loading' | 'loaded'; readonly descriptor: PluginPageRuntimeDescriptor }
  | { readonly status: 'failed' }
  | { readonly status: 'disposed' };

export type PluginRuntimeFrameEvent =
  | { readonly type: 'resolve' }
  | { readonly type: 'mount'; readonly descriptor: PluginPageRuntimeDescriptor }
  | { readonly type: 'load'; readonly runtimeKey: string }
  | { readonly type: 'fail' }
  | { readonly type: 'dispose' };

export const reducePluginRuntimeFrameState = (
  state: PluginRuntimeFrameState,
  event: PluginRuntimeFrameEvent,
): PluginRuntimeFrameState => {
  switch (event.type) {
    case 'resolve':
      return { status: 'resolving' };
    case 'mount':
      return { status: 'loading', descriptor: event.descriptor };
    case 'load':
      return (state.status === 'loading' || state.status === 'loaded') &&
        state.descriptor.runtime_key === event.runtimeKey
        ? { status: 'loaded', descriptor: state.descriptor }
        : state;
    case 'fail':
      return { status: 'failed' };
    case 'dispose':
      return { status: 'disposed' };
  }
};

export interface PluginRuntimeFrameProps {
  readonly activePage: ActivePage;
  readonly navigationAdapter: PluginRuntimeNavigationAdapter;
  readonly pageResolution: PageResolution;
  readonly pageTitle: string;
  readonly resolver: PluginPageRuntimeResolver;
}

export const PluginRuntimeFrame = ({
  activePage,
  navigationAdapter,
  pageResolution,
  pageTitle,
  resolver,
}: PluginRuntimeFrameProps) => {
  const { t } = useTranslation();
  const [attempt, setAttempt] = useState(0);
  const [state, dispatch] = useReducer(reducePluginRuntimeFrameState, { status: 'resolving' });

  useEffect(() => {
    let cancelled = false;
    let activeLease: PluginRuntimeNavigationLease | undefined;
    dispatch({ type: 'resolve' });

    void resolver
      .resolve({ activePage, pageResolution, attempt })
      .then(async (descriptor) => {
        if (cancelled) return;
        if (
          descriptor.runtime_key.length === 0 ||
          descriptor.plugin_id !== activePage.owner_id ||
          !isValidIsolatedPluginRuntimeEntryUrl(descriptor.entry_url) ||
          !isValidPluginRuntimeRoute(descriptor.host_fragment) ||
          descriptor.iframe_src !== pluginRuntimeIframeSrc(descriptor.entry_url, descriptor.host_fragment)
        ) {
          throw new TypeError('Invalid Host-private Plugin Runtime descriptor.');
        }
        const lease = await navigationAdapter.activate({
          entry_url: descriptor.entry_url,
          host_fragment: descriptor.host_fragment,
        });
        if (cancelled) {
          await navigationAdapter.dispose(lease);
          return;
        }
        activeLease = lease;
        dispatch({ type: 'mount', descriptor });
      })
      .catch(() => {
        if (!cancelled) dispatch({ type: 'fail' });
      });

    return () => {
      cancelled = true;
      dispatch({ type: 'dispose' });
      if (activeLease) void navigationAdapter.dispose(activeLease);
    };
  }, [activePage, attempt, navigationAdapter, pageResolution, resolver]);

  if (state.status === 'failed') {
    return (
      <section aria-label={pageTitle} className="plugin-runtime-feedback" role="alert">
        <Typography.Title className="plugin-runtime-feedback-title" heading={5}>
          {t('launcher.page.pluginRuntimeFailureTitle')}
        </Typography.Title>
        <Typography.Text type="secondary">{t('launcher.page.pluginRuntimeFailureDescription')}</Typography.Text>
        <Button autoFocus onClick={() => setAttempt((current) => current + 1)} theme="solid" type="primary">
          {t('launcher.page.pluginRuntimeRetry')}
        </Button>
      </section>
    );
  }

  if (state.status === 'resolving' || state.status === 'disposed') {
    return (
      <section
        aria-busy="true"
        aria-label={pageTitle}
        aria-live="polite"
        className="plugin-runtime-feedback"
        role="status"
      >
        <Spin size="large" />
        <Typography.Text type="secondary">{t('launcher.page.pluginRuntimeResolving')}</Typography.Text>
      </section>
    );
  }

  const { descriptor } = state;
  return (
    <section
      aria-busy={state.status === 'loading'}
      aria-label={pageTitle}
      className="plugin-runtime-container"
      data-runtime-state={state.status}
    >
      {state.status === 'loading' ? (
        <div aria-live="polite" className="plugin-runtime-loading" role="status">
          <Spin size="large" />
          <Typography.Text type="secondary">{t('launcher.page.pluginRuntimeLoading')}</Typography.Text>
        </div>
      ) : null}
      <iframe
        allow={PLUGIN_RUNTIME_PERMISSIONS_POLICY}
        className="plugin-runtime-iframe"
        key={descriptor.runtime_key}
        onLoad={() => dispatch({ type: 'load', runtimeKey: descriptor.runtime_key })}
        referrerPolicy={PLUGIN_RUNTIME_REFERRER_POLICY}
        sandbox={PLUGIN_RUNTIME_IFRAME_SANDBOX}
        src={descriptor.iframe_src}
        title={t('launcher.page.pluginRuntimeFrameTitle', { title: pageTitle })}
      />
    </section>
  );
};
