import { Banner, Button, Checkbox, Empty, Modal, Radio, RadioGroup, Spin, Tag, Typography } from '@douyinfe/semi-ui';
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
  install_permissions_partial: 'settings.plugins.feedback.installPermissionsPartial',
  install_permissions_failed: 'settings.plugins.feedback.installPermissionsFailed',
  load_failed: 'settings.plugins.feedback.loadFailed',
  mutation_failed: 'settings.plugins.feedback.mutationFailed',
  not_found: 'settings.plugins.feedback.notFound',
  plugin_enabled: 'settings.plugins.feedback.pluginEnabled',
  replacement_succeeded: 'settings.plugins.feedback.replacementSucceeded',
  replacement_permissions_partial: 'settings.plugins.feedback.replacementPermissionsPartial',
  permission_granted: 'settings.plugins.feedback.permissionGranted',
  permission_revoked: 'settings.plugins.feedback.permissionRevoked',
  permission_unchanged: 'settings.plugins.feedback.permissionUnchanged',
  permissions_deferred: 'settings.plugins.feedback.permissionsDeferred',
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
  const [dialog, setDialog] = useState<'clear' | 'uninstall'>();
  const [dataPolicy, setDataPolicy] = useState<PluginLifecycleDataPolicy>('retain_data');
  const restoreFocusRef = useRef<HTMLElement | undefined>(undefined);
  const restoreFocusIdRef = useRef<string | undefined>(undefined);
  const replacementOpenRef = useRef(false);
  const permissionOpenRef = useRef(false);

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

  useEffect(() => {
    if (view.permission_confirmation) permissionOpenRef.current = true;
    else if (permissionOpenRef.current) {
      permissionOpenRef.current = false;
      restoreFocus();
    }
  }, [restoreFocus, view.permission_confirmation]);

  const selected = view.entries.find((entry) => entry.entry_id === view.selected_entry_id);
  const selectedName = selected ? entryName(selected, locale) : '';
  const pending = view.mutation !== undefined;

  const openDialog = (kind: 'clear' | 'uninstall', trigger: HTMLElement) => {
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
                          ? `${entry.version} · ${t(`settings.plugins.source.${entry.source}`)}`
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
              <div>
                <Typography.Text strong>{t('settings.plugins.fields.permissions')}</Typography.Text>
                <Typography.Paragraph type="tertiary">
                  {t('settings.plugins.permissions.description')}
                </Typography.Paragraph>
                <ul className="plugin-management-permissions">
                  {detail.permissions.map((permission) => (
                    <li key={permission.permission_id}>
                      <div className="plugin-management-permission-main">
                        <div className="flex items-center gap-2">
                          <Typography.Text strong>
                            {permission.prompt.host_name[locale] ?? permission.prompt.host_name['en-US']}
                          </Typography.Text>
                          <Tag color={permission.prompt.risk === 'sensitive' ? 'orange' : 'grey'} size="small">
                            {t(`settings.plugins.permissions.risk.${permission.prompt.risk}`)}
                          </Tag>
                          {!permission.supported ? (
                            <Tag size="small">{t('settings.plugins.permissions.state.unsupported')}</Tag>
                          ) : null}
                        </div>
                        <Typography.Paragraph type="tertiary">
                          {permission.prompt.host_risk_description[locale] ??
                            permission.prompt.host_risk_description['en-US']}
                        </Typography.Paragraph>
                        {permission.prompt.author_reason ? (
                          <Typography.Paragraph>
                            <strong>{t('settings.plugins.permissions.authorReason')}:</strong>{' '}
                            {permission.prompt.author_reason[locale] ?? permission.prompt.author_reason['en-US']}
                          </Typography.Paragraph>
                        ) : null}
                        <Typography.Text type="tertiary">
                          {t(`settings.plugins.permissions.state.${permission.effective}`)}
                        </Typography.Text>
                      </div>
                      {permission.prompt.grant_available ? (
                        <Button
                          disabled={pending}
                          id={`plugin-permission-grant-${permission.permission_id}`}
                          onClick={(event) => {
                            rememberFocus(event.currentTarget);
                            service.openPermissionConfirmation(permission.permission_id, true);
                          }}
                          size="small"
                        >
                          {t('settings.plugins.permissions.grant')}
                        </Button>
                      ) : permission.prompt.revoke_available ? (
                        <Button
                          disabled={pending}
                          id={`plugin-permission-revoke-${permission.permission_id}`}
                          onClick={(event) => {
                            rememberFocus(event.currentTarget);
                            service.openPermissionConfirmation(permission.permission_id, false);
                          }}
                          size="small"
                          type="danger"
                        >
                          {t('settings.plugins.permissions.revoke')}
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
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
                <Button
                  data-plugin-management-action="clear-data"
                  disabled={!view.operations.clear_data}
                  onClick={(event) => openDialog('clear', event.currentTarget)}
                  type="danger"
                >
                  {t('settings.plugins.actions.clearData')}
                </Button>
                <Button
                  data-plugin-management-action="uninstall"
                  disabled={!view.operations.uninstall}
                  onClick={(event) => openDialog('uninstall', event.currentTarget)}
                  type="danger"
                >
                  {t('settings.plugins.actions.uninstall')}
                </Button>
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

      <Modal
        cancelButtonProps={{ autoFocus: true, disabled: pending }}
        cancelText={t('settings.plugins.confirm.cancel')}
        className="plugin-management-permission-modal"
        closeOnEsc={!pending}
        closable={!pending}
        confirmLoading={view.mutation === 'commit_installation'}
        maskClosable={false}
        motion={false}
        okText={t('settings.plugins.confirm.installation.confirm')}
        onCancel={() => void service.cancelInstallation()}
        onOk={() => void service.commitInstallation()}
        title={t('settings.plugins.confirm.installation.title')}
        visible={view.confirmation?.kind === 'installation' && !view.permission_confirmation}
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
              description={t('settings.plugins.permissions.publisherUnverifiedDescription')}
              fullMode={false}
              title={t('settings.plugins.permissions.publisherUnverified')}
              type="warning"
            />
            <Typography.Text>{view.confirmation.candidate.publisher.author}</Typography.Text>
            <ul className="plugin-management-permission-prompt-list">
              {view.confirmation.candidate.permissions.map((permission) => (
                <li key={permission.permission_id}>
                  <Checkbox
                    checked={
                      view.confirmation?.kind === 'installation' &&
                      view.confirmation.selected_permission_ids.includes(permission.permission_id)
                    }
                    disabled={pending || !permission.grant_available}
                    id={`plugin-installation-permission-${permission.permission_id}`}
                    onChange={(event) => {
                      rememberFocus(event.currentTarget, `plugin-installation-permission-${permission.permission_id}`);
                      service.openPermissionConfirmation(permission.permission_id, Boolean(event.target.checked));
                    }}
                  >
                    {permission.host_name[locale] ?? permission.host_name['en-US']}
                  </Checkbox>
                  <Tag color={permission.risk === 'sensitive' ? 'orange' : 'grey'} size="small">
                    {t(`settings.plugins.permissions.risk.${permission.risk}`)}
                  </Tag>
                  <Typography.Paragraph type="tertiary">
                    {permission.host_risk_description[locale] ?? permission.host_risk_description['en-US']}
                  </Typography.Paragraph>
                  {permission.author_reason ? (
                    <Typography.Paragraph>
                      <strong>{t('settings.plugins.permissions.authorReason')}:</strong>{' '}
                      {permission.author_reason[locale] ?? permission.author_reason['en-US']}
                    </Typography.Paragraph>
                  ) : null}
                </li>
              ))}
            </ul>
            <Button
              disabled={pending}
              onClick={() => {
                service.deferPreparedPermissions();
                void service.commitInstallation();
              }}
            >
              {t('settings.plugins.permissions.laterAndInstall')}
            </Button>
          </div>
        ) : null}
      </Modal>

      <Modal
        cancelButtonProps={{ autoFocus: true, disabled: pending }}
        cancelText={t('settings.plugins.confirm.cancel')}
        className="plugin-management-permission-modal"
        closeOnEsc={!pending}
        closable={!pending}
        confirmLoading={view.mutation === 'commit_replacement'}
        maskClosable={false}
        motion={false}
        okText={t('settings.plugins.confirm.replacement.confirm')}
        onCancel={() => void service.cancelReplacement()}
        onOk={() => void service.commitReplacement()}
        title={t('settings.plugins.confirm.replacement.title')}
        visible={view.confirmation?.kind === 'replacement' && !view.permission_confirmation}
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
              description={t('settings.plugins.permissions.publisherUnverifiedDescription')}
              fullMode={false}
              title={t('settings.plugins.permissions.publisherUnverified')}
              type="warning"
            />
            <Typography.Text strong>{t('settings.plugins.confirm.replacement.retainedPermissions')}</Typography.Text>
            <Typography.Paragraph>
              {view.confirmation.retained_permissions
                .map((item) => item.host_name[locale] ?? item.host_name['en-US'])
                .join(', ') || t('settings.plugins.none')}
            </Typography.Paragraph>
            <Typography.Text strong>{t('settings.plugins.confirm.replacement.removedPermissions')}</Typography.Text>
            <Typography.Paragraph>
              {view.confirmation.removed_permissions
                .map((item) => item.host_name[locale] ?? item.host_name['en-US'])
                .join(', ') || t('settings.plugins.none')}
            </Typography.Paragraph>
            <Typography.Text strong>{t('settings.plugins.confirm.replacement.addedPermissions')}</Typography.Text>
            <ul className="plugin-management-permission-prompt-list">
              {view.confirmation.added_permissions.map((permission) => (
                <li key={permission.permission_id}>
                  <Checkbox
                    checked={
                      view.confirmation?.kind === 'replacement' &&
                      view.confirmation.selected_permission_ids.includes(permission.permission_id)
                    }
                    disabled={pending || !permission.grant_available}
                    id={`plugin-replacement-permission-${permission.permission_id}`}
                    onChange={(event) => {
                      rememberFocus(event.currentTarget, `plugin-replacement-permission-${permission.permission_id}`);
                      service.openPermissionConfirmation(permission.permission_id, Boolean(event.target.checked));
                    }}
                  >
                    {permission.host_name[locale] ?? permission.host_name['en-US']}
                  </Checkbox>
                  <Tag color={permission.risk === 'sensitive' ? 'orange' : 'grey'} size="small">
                    {t(`settings.plugins.permissions.risk.${permission.risk}`)}
                  </Tag>
                  <Typography.Paragraph type="tertiary">
                    {permission.host_risk_description[locale] ?? permission.host_risk_description['en-US']}
                  </Typography.Paragraph>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Modal>

      <Modal
        cancelButtonProps={{ autoFocus: true, disabled: pending }}
        cancelText={t(
          view.permission_confirmation?.action === 'revoke'
            ? 'settings.plugins.confirm.cancel'
            : 'settings.plugins.permissions.deny',
        )}
        className="plugin-management-permission-modal"
        closeOnEsc={!pending}
        closable={!pending}
        confirmLoading={view.mutation === 'set_permission'}
        maskClosable={false}
        motion={false}
        okText={t(
          view.permission_confirmation?.action === 'revoke'
            ? 'settings.plugins.permissions.confirmRevoke'
            : 'settings.plugins.permissions.allow',
        )}
        okType={view.permission_confirmation?.action === 'revoke' ? 'danger' : 'primary'}
        onCancel={() => service.cancelPermissionDecision()}
        onOk={() => void service.confirmPermissionDecision()}
        title={t(
          view.permission_confirmation?.action === 'revoke'
            ? 'settings.plugins.permissions.revokeTitle'
            : 'settings.plugins.permissions.grantTitle',
        )}
        visible={Boolean(view.permission_confirmation)}
      >
        {view.permission_confirmation ? (
          <div className="plugin-management-confirmation" id="plugin-permission-confirmation-description">
            <Typography.Title heading={5}>
              {view.permission_confirmation.permission.host_name[locale] ??
                view.permission_confirmation.permission.host_name['en-US']}
            </Typography.Title>
            <Typography.Paragraph>
              {view.permission_confirmation.permission.host_risk_description[locale] ??
                view.permission_confirmation.permission.host_risk_description['en-US']}
            </Typography.Paragraph>
            {view.permission_confirmation.action === 'revoke' ? (
              <Banner
                closeIcon={null}
                description={t('settings.plugins.permissions.revokeImpact')}
                fullMode={false}
                type="warning"
              />
            ) : null}
            <Typography.Paragraph type="tertiary">
              {t('settings.plugins.permissions.singlePermissionOnly')}
            </Typography.Paragraph>
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
