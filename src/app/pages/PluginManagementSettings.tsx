import { Banner, Button, Empty, Modal, Radio, RadioGroup, Spin, Switch, Tag, Typography } from '@douyinfe/semi-ui';
import { type KeyboardEvent, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppLocale } from '../i18n';
import type { PluginLifecycleDataPolicy } from '../plugins/lifecycle';
import type {
  PluginManagementEntry,
  PluginManagementFeedbackCode,
  PluginManagementService,
} from '../plugins/management';

export interface PluginManagementSettingsProps {
  readonly service: PluginManagementService;
}

const feedbackKeys: Record<PluginManagementFeedbackCode, string> = {
  busy: 'settings.plugins.feedback.busy',
  cancelled: 'settings.plugins.feedback.cancelled',
  cleanup_pending: 'settings.plugins.feedback.cleanupPending',
  clear_changed: 'settings.plugins.feedback.clearChanged',
  clear_unchanged: 'settings.plugins.feedback.clearUnchanged',
  conflict: 'settings.plugins.feedback.conflict',
  convergence_failed: 'settings.plugins.feedback.convergenceFailed',
  detail_failed: 'settings.plugins.feedback.detailFailed',
  duplicate: 'settings.plugins.feedback.duplicate',
  install_succeeded: 'settings.plugins.feedback.installSucceeded',
  load_failed: 'settings.plugins.feedback.loadFailed',
  mutation_failed: 'settings.plugins.feedback.mutationFailed',
  not_found: 'settings.plugins.feedback.notFound',
  plugin_enabled: 'settings.plugins.feedback.pluginEnabled',
  replacement_succeeded: 'settings.plugins.feedback.replacementSucceeded',
  set_enabled_succeeded: 'settings.plugins.feedback.setEnabledSucceeded',
  unavailable: 'settings.plugins.feedback.unavailable',
  uninstall_succeeded: 'settings.plugins.feedback.uninstallSucceeded',
  unsafe_storage: 'settings.plugins.feedback.unsafeStorage',
};

const entryName = (entry: PluginManagementEntry, locale: 'en-US' | 'zh-CN') =>
  entry.kind === 'registered'
    ? (entry.display.name[locale] ?? entry.display.name['en-US'])
    : (entry.plugin_id ?? entry.entry_id);

export const PluginManagementSettings = ({ service }: PluginManagementSettingsProps) => {
  const { t } = useTranslation();
  const { locale } = useAppLocale();
  const view = useSyncExternalStore(service.subscribe, service.current, service.current);
  const [dialog, setDialog] = useState<'clear' | 'uninstall' | 'development-reload' | 'development-remove'>();
  const [dataPolicy, setDataPolicy] = useState<PluginLifecycleDataPolicy>('retain_data');
  const restoreFocusRef = useRef<HTMLElement | undefined>(undefined);
  const restoreFocusIdRef = useRef<string | undefined>(undefined);
  const replacementOpenRef = useRef(false);

  const restoreFocus = useCallback(() => {
    const target = restoreFocusRef.current;
    const targetId = restoreFocusIdRef.current;
    restoreFocusRef.current = undefined;
    restoreFocusIdRef.current = undefined;
    requestAnimationFrame(() => {
      const remounted = targetId ? document.getElementById(targetId) : undefined;
      const resolved = target?.isConnected
        ? target
        : (remounted?.querySelector<HTMLElement>('input, button, [tabindex]') ?? remounted ?? undefined);
      resolved?.focus({ preventScroll: true });
    });
  }, []);

  const rememberFocus = (target: HTMLElement, targetId?: string) => {
    restoreFocusRef.current = target;
    restoreFocusIdRef.current = targetId;
  };

  useEffect(() => {
    if (view.confirmation) replacementOpenRef.current = true;
    else if (replacementOpenRef.current) {
      replacementOpenRef.current = false;
      restoreFocus();
    }
  }, [restoreFocus, view.confirmation]);

  const selected = view.entries.find((entry) => entry.entry_id === view.selected_entry_id);
  const selectedName = selected ? entryName(selected, locale) : '';
  const pending = view.mutation !== undefined || view.development?.pending !== undefined;
  const developmentEntry = selected?.kind === 'registered' && selected.source === 'development';

  const openDialog = (
    kind: 'clear' | 'uninstall' | 'development-reload' | 'development-remove',
    trigger: HTMLElement,
  ) => {
    rememberFocus(trigger);
    if (kind === 'uninstall') setDataPolicy('retain_data');
    setDialog(kind);
  };

  const closeDialog = () => {
    setDialog(undefined);
    restoreFocus();
  };

  const focusCurrentSelection = useCallback(() => {
    requestAnimationFrame(() => {
      const selectedEntryId = service.current().selected_entry_id;
      const target = selectedEntryId
        ? document.getElementById(`plugin-management-entry-${selectedEntryId}`)
        : document.getElementById('settings-install-local-plugin');
      target?.focus({ preventScroll: true });
    });
  }, [service]);

  const confirmUninstall = async () => {
    setDialog(undefined);
    await service.uninstall(dataPolicy);
    restoreFocusRef.current = undefined;
    restoreFocusIdRef.current = undefined;
    focusCurrentSelection();
  };

  const confirmDevelopment = async (kind: 'development-reload' | 'development-remove') => {
    setDialog(undefined);
    if (kind === 'development-reload') await service.reloadDevelopmentEntry();
    else await service.removeDevelopmentEntry();
    restoreFocusRef.current = undefined;
    restoreFocusIdRef.current = undefined;
    focusCurrentSelection();
  };

  const handleEntryKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const offset = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (offset === 0) return;
    const target = view.entries[index + offset];
    if (!target) return;
    event.preventDefault();
    void service.select(target.entry_id).then(() => {
      document.getElementById(`plugin-management-entry-${target.entry_id}`)?.focus({ preventScroll: true });
    });
  };

  const detail = view.detail;
  const feedbackMessage = view.feedback
    ? t(feedbackKeys[view.feedback.code], {
        pluginId: view.feedback.plugin_id,
        version: view.feedback.version,
      })
    : '';

  return (
    <section
      aria-labelledby="settings-plugins-heading"
      className="settings-section plugin-management flex flex-col gap-3"
    >
      <div className="plugin-management-heading flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Typography.Title heading={3} id="settings-plugins-heading">
            {t('settings.plugins.title')}
          </Typography.Title>
          <Typography.Paragraph id="settings-plugins-description" type="tertiary">
            {t('settings.plugins.description')}
          </Typography.Paragraph>
        </div>
        <Button
          aria-describedby="settings-plugins-description"
          disabled={!view.operations.install}
          id="settings-install-local-plugin"
          loading={view.mutation === 'prepare_installation'}
          onClick={(event) => {
            rememberFocus(event.currentTarget);
            void service.prepareInstallation();
          }}
          theme="solid"
          type="primary"
        >
          {view.mutation === 'prepare_installation' ? t('settings.plugins.preparing') : t('settings.plugins.install')}
        </Button>
      </div>

      {view.development ? (
        <Banner
          closeIcon={null}
          description={t('settings.plugins.development.description')}
          fullMode={false}
          title={t('settings.plugins.development.title')}
          type="warning"
        >
          <div className="plugin-development-controls flex flex-wrap items-center gap-3">
            <Switch
              aria-label={t('settings.plugins.development.toggle')}
              checked={view.development.enabled}
              disabled={pending}
              loading={view.development.pending === 'set_mode'}
              onChange={(enabled) => void service.setDevelopmentMode(enabled)}
            />
            <Button
              disabled={!view.development.enabled || pending}
              loading={view.development.pending === 'register'}
              onClick={(event) => {
                rememberFocus(event.currentTarget);
                void service.registerDevelopmentDirectory();
              }}
              size="small"
            >
              {t('settings.plugins.development.register')}
            </Button>
            <Typography.Text type="tertiary">{t('settings.plugins.development.processLocal')}</Typography.Text>
          </div>
        </Banner>
      ) : null}

      {view.state === 'degraded' ? (
        <Banner
          closeIcon={null}
          description={t('settings.plugins.degraded')}
          fullMode={false}
          title={t('settings.plugins.degradedTitle')}
          type="danger"
        />
      ) : view.state === 'error' ? (
        <Banner
          closeIcon={null}
          description={t('settings.plugins.feedback.loadFailed')}
          fullMode={false}
          type="danger"
        />
      ) : null}

      <div className="plugin-management-surface min-h-0 flex-1">
        <section aria-label={t('settings.plugins.listLabel')} className="plugin-management-list">
          {view.state === 'loading' ? (
            <div className="plugin-management-centered">
              <Spin aria-label={t('settings.plugins.loading')} size="middle" />
              <Typography.Text type="tertiary">{t('settings.plugins.loading')}</Typography.Text>
            </div>
          ) : view.state === 'empty' ? (
            <Empty description={t('settings.plugins.empty')} />
          ) : view.state === 'degraded' || view.state === 'error' ? (
            <div className="plugin-management-centered">
              <Button disabled={!view.operations.retry} onClick={() => void service.refresh()}>
                {t('settings.plugins.retry')}
              </Button>
            </div>
          ) : (
            <ul className="plugin-management-entry-list">
              {view.entries.map((entry, index) => (
                <li key={entry.entry_id}>
                  <button
                    aria-current={entry.entry_id === view.selected_entry_id ? 'true' : undefined}
                    className="plugin-management-entry"
                    id={`plugin-management-entry-${entry.entry_id}`}
                    onClick={() => void service.select(entry.entry_id)}
                    onKeyDown={(event) => handleEntryKeyDown(event, index)}
                    type="button"
                  >
                    <span className="plugin-management-entry-main">
                      <span className="plugin-management-entry-name">{entryName(entry, locale)}</span>
                      <span className="plugin-management-entry-meta">
                        {entry.kind === 'registered'
                          ? entry.source === 'development'
                            ? `${entry.version} · ${t('settings.plugins.development.labels.development')} · ${t('settings.plugins.development.labels.unpacked')} · ${t('settings.plugins.development.labels.unsigned')}`
                            : `${entry.version} · ${t(`settings.plugins.source.${entry.source}`)}`
                          : t('settings.plugins.quarantined')}
                      </span>
                    </span>
                    <Tag color={entry.kind === 'quarantined' ? 'red' : entry.enabled ? 'green' : 'grey'} size="small">
                      {entry.kind === 'quarantined'
                        ? t('settings.plugins.quarantined')
                        : entry.enabled
                          ? t('settings.plugins.enabled')
                          : t('settings.plugins.disabled')}
                    </Tag>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label={t('settings.plugins.detailLabel')} className="plugin-management-detail">
          {detail.kind === 'none' ? (
            <Typography.Text type="tertiary">{t('settings.plugins.selectPrompt')}</Typography.Text>
          ) : detail.kind === 'loading' ? (
            <Spin aria-label={t('settings.plugins.loadingDetail')} size="middle" />
          ) : detail.kind === 'error' ? (
            <div className="plugin-management-centered">
              <Typography.Text type="danger">{t('settings.plugins.feedback.detailFailed')}</Typography.Text>
              <Button onClick={() => void service.select(detail.entry_id)}>{t('settings.plugins.retry')}</Button>
            </div>
          ) : detail.kind === 'quarantined' ? (
            <div className="plugin-management-detail-content">
              <Typography.Title heading={4}>{selectedName}</Typography.Title>
              <Tag color="red">{t('settings.plugins.quarantined')}</Tag>
              <Typography.Paragraph type="tertiary">{t('settings.plugins.quarantineDescription')}</Typography.Paragraph>
              <Typography.Text strong>{t('settings.plugins.fields.diagnostics')}</Typography.Text>
              <Typography.Paragraph>{t(`settings.plugins.diagnostics.${detail.diagnostic.code}`)}</Typography.Paragraph>
              <Button
                disabled={!view.operations.uninstall}
                onClick={(event) => openDialog('uninstall', event.currentTarget)}
                type="danger"
              >
                {t('settings.plugins.actions.uninstall')}
              </Button>
            </div>
          ) : (
            <div className="plugin-management-detail-content">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Typography.Title heading={4}>
                    {detail.manifest.display.name[locale] ?? detail.manifest.display.name['en-US']}
                  </Typography.Title>
                  <Typography.Text type="tertiary">{detail.manifest.plugin_id}</Typography.Text>
                </div>
                <Tag color={detail.enabled ? 'green' : 'grey'}>
                  {detail.enabled ? t('settings.plugins.enabled') : t('settings.plugins.disabled')}
                </Tag>
              </div>
              <dl className="plugin-management-facts">
                <div>
                  <dt>{t('settings.plugins.fields.version')}</dt>
                  <dd>{detail.manifest.version}</dd>
                </div>
                <div>
                  <dt>{t('settings.plugins.fields.source')}</dt>
                  <dd>{t(`settings.plugins.source.${detail.source}`)}</dd>
                </div>
                <div>
                  <dt>{t('settings.plugins.fields.compatibility')}</dt>
                  <dd>
                    {detail.compatibility.lensx && detail.compatibility.host_api
                      ? t('settings.plugins.compatible')
                      : t('settings.plugins.incompatible')}
                  </dd>
                </div>
                <div>
                  <dt>{t('settings.plugins.fields.runtime')}</dt>
                  <dd>{t(`settings.plugins.runtime.${detail.runtime.kind}`)}</dd>
                </div>
              </dl>
              {detail.source === 'development' ? (
                <Banner
                  closeIcon={null}
                  description={t('settings.plugins.development.unsignedDescription')}
                  fullMode={false}
                  title={t('settings.plugins.development.labels.development')}
                  type="warning"
                >
                  <div className="flex flex-wrap gap-2">
                    <Tag color="orange">{t('settings.plugins.development.labels.development')}</Tag>
                    <Tag>{t('settings.plugins.development.labels.unpacked')}</Tag>
                    <Tag>{t('settings.plugins.development.labels.unsigned')}</Tag>
                  </div>
                </Banner>
              ) : null}
              {detail.diagnostics.length > 0 ? (
                <div>
                  <Typography.Text strong>{t('settings.plugins.fields.diagnostics')}</Typography.Text>
                  <ul className="plugin-management-diagnostics">
                    {detail.diagnostics.map((diagnostic) => (
                      <li key={`${diagnostic.code}-${diagnostic.phase}-${diagnostic.message}`}>
                        {t(`settings.plugins.diagnostics.${diagnostic.code}`)}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="plugin-management-actions flex flex-wrap gap-2">
                {detail.enabled ? (
                  <Button
                    disabled={!view.operations.disable}
                    loading={view.mutation === 'set_enabled'}
                    onClick={() => void service.setEnabled(false)}
                  >
                    {t('settings.plugins.actions.disable')}
                  </Button>
                ) : (
                  <Button
                    disabled={!view.operations.enable}
                    loading={view.mutation === 'set_enabled'}
                    onClick={() => void service.setEnabled(true)}
                  >
                    {t('settings.plugins.actions.enable')}
                  </Button>
                )}
                {detail.source === 'development' ? (
                  <>
                    <Button
                      disabled={pending}
                      id="plugin-development-reload"
                      loading={view.development?.pending === 'reload'}
                      onClick={(event) => openDialog('development-reload', event.currentTarget)}
                    >
                      {t('settings.plugins.development.reload')}
                    </Button>
                    <Button
                      disabled={pending}
                      id="plugin-development-remove"
                      loading={view.development?.pending === 'remove'}
                      onClick={(event) => openDialog('development-remove', event.currentTarget)}
                      type="danger"
                    >
                      {t('settings.plugins.development.remove')}
                    </Button>
                  </>
                ) : (
                  <Button
                    data-plugin-management-action="replace"
                    disabled={!view.operations.replace}
                    loading={view.mutation === 'prepare_replacement'}
                    onClick={(event) => {
                      rememberFocus(event.currentTarget);
                      void service.prepareReplacement();
                    }}
                  >
                    {t('settings.plugins.actions.replace')}
                  </Button>
                )}
                <Button
                  data-plugin-management-action="clear-data"
                  disabled={!view.operations.clear_data}
                  onClick={(event) => openDialog('clear', event.currentTarget)}
                  type="danger"
                >
                  {t('settings.plugins.actions.clearData')}
                </Button>
                {!developmentEntry ? (
                  <Button
                    data-plugin-management-action="uninstall"
                    disabled={!view.operations.uninstall}
                    onClick={(event) => openDialog('uninstall', event.currentTarget)}
                    type="danger"
                  >
                    {t('settings.plugins.actions.uninstall')}
                  </Button>
                ) : null}
              </div>
            </div>
          )}
        </section>
      </div>

      <Typography.Text
        aria-atomic="true"
        aria-live={view.feedback?.kind === 'error' ? 'assertive' : 'polite'}
        className="settings-installation-status"
        role={view.feedback?.kind === 'error' ? 'alert' : 'status'}
        type={view.feedback?.kind === 'error' ? 'danger' : 'tertiary'}
      >
        {feedbackMessage}
      </Typography.Text>

      {view.development?.feedback ? (
        <Typography.Text
          aria-atomic="true"
          aria-live={view.development.feedback.kind === 'error' ? 'assertive' : 'polite'}
          role={view.development.feedback.kind === 'error' ? 'alert' : 'status'}
          type={view.development.feedback.kind === 'error' ? 'danger' : 'tertiary'}
        >
          {t(`settings.plugins.development.feedback.${view.development.feedback.code}`)}
        </Typography.Text>
      ) : null}

      <Modal
        cancelButtonProps={{ autoFocus: true, disabled: pending }}
        cancelText={t('settings.plugins.confirm.cancel')}
        closeOnEsc={!pending}
        closable={!pending}
        confirmLoading={view.development?.pending === (dialog === 'development-reload' ? 'reload' : 'remove')}
        maskClosable={false}
        motion={false}
        okButtonProps={{ type: dialog === 'development-remove' ? 'danger' : 'primary' }}
        okText={t(
          `settings.plugins.development.confirm.${dialog === 'development-remove' ? 'remove' : 'reload'}.confirm`,
        )}
        onCancel={closeDialog}
        onOk={() => dialog && void confirmDevelopment(dialog as 'development-reload' | 'development-remove')}
        title={t(`settings.plugins.development.confirm.${dialog === 'development-remove' ? 'remove' : 'reload'}.title`)}
        visible={dialog === 'development-reload' || dialog === 'development-remove'}
      >
        <Typography.Paragraph id="plugin-development-confirmation-description">
          {t(
            `settings.plugins.development.confirm.${dialog === 'development-remove' ? 'remove' : 'reload'}.description`,
            {
              name: selectedName,
            },
          )}
        </Typography.Paragraph>
      </Modal>

      <Modal
        cancelButtonProps={{ autoFocus: true, disabled: pending }}
        cancelText={t('settings.plugins.confirm.cancel')}
        className="plugin-management-confirmation-modal"
        closeOnEsc={!pending}
        closable={!pending}
        confirmLoading={view.mutation === 'commit_installation'}
        maskClosable={false}
        motion={false}
        okText={t('settings.plugins.confirm.installation.confirm')}
        onCancel={() => void service.cancelInstallation()}
        onOk={() => void service.commitInstallation()}
        title={t('settings.plugins.confirm.installation.title')}
        visible={view.confirmation?.kind === 'installation'}
      >
        {view.confirmation?.kind === 'installation' ? (
          <div className="plugin-management-confirmation">
            <Typography.Paragraph id="plugin-installation-confirmation-description">
              {t('settings.plugins.confirm.installation.description', {
                name:
                  view.confirmation.candidate.display_name[locale] ?? view.confirmation.candidate.display_name['en-US'],
                version: view.confirmation.candidate.version,
              })}
            </Typography.Paragraph>
            <Banner
              closeIcon={null}
              description={t('settings.plugins.trust.description')}
              fullMode={false}
              title={t('settings.plugins.trust.title')}
              type="warning"
            />
            <Typography.Text>{view.confirmation.candidate.publisher.author}</Typography.Text>
          </div>
        ) : null}
      </Modal>

      <Modal
        cancelButtonProps={{ autoFocus: true, disabled: pending }}
        cancelText={t('settings.plugins.confirm.cancel')}
        className="plugin-management-confirmation-modal"
        closeOnEsc={!pending}
        closable={!pending}
        confirmLoading={view.mutation === 'commit_replacement'}
        maskClosable={false}
        motion={false}
        okText={t('settings.plugins.confirm.replacement.confirm')}
        onCancel={() => void service.cancelReplacement()}
        onOk={() => void service.commitReplacement()}
        title={t('settings.plugins.confirm.replacement.title')}
        visible={view.confirmation?.kind === 'replacement'}
      >
        {view.confirmation?.kind === 'replacement' ? (
          <div className="plugin-management-confirmation">
            <Typography.Paragraph>
              {t('settings.plugins.confirm.replacement.description', { name: selectedName })}
            </Typography.Paragraph>
            <Typography.Text>
              {view.confirmation.current_version} → {view.confirmation.candidate_version}
            </Typography.Text>
            <Typography.Paragraph>
              {t(`settings.plugins.replacement.${view.confirmation.classification}`)}
            </Typography.Paragraph>
            <Banner
              closeIcon={null}
              description={t('settings.plugins.trust.replacementDescription')}
              fullMode={false}
              title={t('settings.plugins.trust.title')}
              type="warning"
            />
          </div>
        ) : null}
      </Modal>

      <Modal
        cancelButtonProps={{ autoFocus: true, disabled: pending }}
        cancelText={t('settings.plugins.confirm.cancel')}
        closeOnEsc={!pending}
        closable={!pending}
        confirmLoading={view.mutation === 'uninstall'}
        maskClosable={false}
        okText={t('settings.plugins.confirm.uninstall.confirm')}
        okType="danger"
        onCancel={closeDialog}
        onOk={() => void confirmUninstall()}
        title={t('settings.plugins.confirm.uninstall.title')}
        visible={dialog === 'uninstall'}
      >
        <Typography.Paragraph>
          {t('settings.plugins.confirm.uninstall.description', { name: selectedName })}
        </Typography.Paragraph>
        <RadioGroup
          aria-label={t('settings.plugins.confirm.uninstall.dataPolicy')}
          disabled={pending}
          onChange={(event) => {
            if (event.target.value === 'retain_data' || event.target.value === 'delete_data')
              setDataPolicy(event.target.value);
          }}
          value={dataPolicy}
        >
          <Radio value="retain_data">{t('settings.plugins.confirm.uninstall.retainData')}</Radio>
          <Radio value="delete_data">{t('settings.plugins.confirm.uninstall.deleteData')}</Radio>
        </RadioGroup>
        <Typography.Paragraph type="tertiary">
          {t(
            dataPolicy === 'retain_data'
              ? 'settings.plugins.confirm.uninstall.retainDescription'
              : 'settings.plugins.confirm.uninstall.deleteDescription',
          )}
        </Typography.Paragraph>
      </Modal>

      <Modal
        cancelButtonProps={{ autoFocus: true, disabled: pending }}
        cancelText={t('settings.plugins.confirm.cancel')}
        closeOnEsc={!pending}
        closable={!pending}
        confirmLoading={view.mutation === 'clear_data'}
        maskClosable={false}
        okText={t('settings.plugins.confirm.clear.confirm')}
        okType="danger"
        onCancel={closeDialog}
        onOk={() => {
          setDialog(undefined);
          void service.clearData().finally(restoreFocus);
        }}
        title={t('settings.plugins.confirm.clear.title')}
        visible={dialog === 'clear'}
      >
        <Typography.Paragraph>
          {t('settings.plugins.confirm.clear.description', { name: selectedName })}
        </Typography.Paragraph>
      </Modal>
    </section>
  );
};
