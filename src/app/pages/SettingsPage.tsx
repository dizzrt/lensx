import { Banner, Button, Radio, RadioGroup, TabPane, Tabs, Typography } from '@douyinfe/semi-ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppLocale } from '../i18n';
import {
  type LocalPluginInstallationClient,
  LocalPluginInstallationError,
  type LocalPluginInstallationErrorCode,
} from '../plugins/installation';
import type { AppPreferences, AppPreferencesClient, AppPreferencesErrorCode } from '../preferences';
import { useAppTheme } from '../theme';

interface SettingsPageProps {
  installationClient: LocalPluginInstallationClient;
  preferencesClient: AppPreferencesClient;
}

type PreferenceKey = keyof AppPreferences;

const isThemeMode = (value: unknown): value is AppPreferences['theme_mode'] => value === 'light' || value === 'dark';

const isLocale = (value: unknown): value is AppPreferences['locale'] => value === 'en-US' || value === 'zh-CN';

type InstallationFeedback =
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'installed'; readonly pluginId: string; readonly version: string }
  | { readonly kind: 'error'; readonly code: LocalPluginInstallationErrorCode | 'invalid_boundary_payload' };

const installationFailureMessageKeys = {
  already_installed: 'settings.plugins.failure.alreadyInstalled',
  busy: 'settings.plugins.failure.busy',
  commit_failed: 'settings.plugins.failure.commitFailed',
  extraction_failed: 'settings.plugins.failure.extractionFailed',
  identity_quarantined: 'settings.plugins.failure.identityQuarantined',
  incompatible: 'settings.plugins.failure.incompatible',
  internal: 'settings.plugins.failure.internal',
  invalid_boundary_payload: 'settings.plugins.failure.invalidBoundaryPayload',
  invalid_package: 'settings.plugins.failure.invalidPackage',
  registration_failed: 'settings.plugins.failure.registrationFailed',
  source_read_failed: 'settings.plugins.failure.sourceReadFailed',
  unavailable: 'settings.plugins.failure.unavailable',
} as const;

export const SettingsPage = ({ installationClient, preferencesClient }: SettingsPageProps) => {
  const { t } = useTranslation();
  const { locale, setLocale } = useAppLocale();
  const { setThemeMode, themeMode } = useAppTheme();
  const [confirmedPreferences, setConfirmedPreferences] = useState<AppPreferences>({
    theme_mode: themeMode,
    locale,
  });
  const [pendingPreference, setPendingPreference] = useState<PreferenceKey>();
  const [saveErrorCode, setSaveErrorCode] = useState<AppPreferencesErrorCode>();
  const [installationPending, setInstallationPending] = useState(false);
  const [installationFeedback, setInstallationFeedback] = useState<InstallationFeedback>();
  const saveChainRef = useRef(Promise.resolve());
  const installationPendingRef = useRef(false);
  const restoreInstallationFocusRef = useRef(false);

  useEffect(() => {
    if (!installationPending && restoreInstallationFocusRef.current) {
      restoreInstallationFocusRef.current = false;
      document.getElementById('settings-install-local-plugin')?.focus({ preventScroll: true });
    }
  }, [installationPending]);

  const savePreference = useCallback(
    (key: PreferenceKey, value: AppPreferences[PreferenceKey]) => {
      if (pendingPreference || confirmedPreferences[key] === value) {
        return;
      }

      const nextPreferences = {
        ...confirmedPreferences,
        [key]: value,
      };
      setPendingPreference(key);
      setSaveErrorCode(undefined);

      const saveRequest = saveChainRef.current.then(() => preferencesClient.write(nextPreferences));
      saveChainRef.current = saveRequest.then(
        () => undefined,
        () => undefined,
      );
      void saveRequest
        .then((savedPreferences) => {
          setConfirmedPreferences(savedPreferences);
          setThemeMode(savedPreferences.theme_mode);
          setLocale(savedPreferences.locale);
        })
        .catch((error: unknown) => {
          setSaveErrorCode(
            typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
              ? (error.code as AppPreferencesErrorCode)
              : 'invalid_preferences_error_payload',
          );
        })
        .finally(() => {
          setPendingPreference(undefined);
        });
    },
    [confirmedPreferences, pendingPreference, preferencesClient, setLocale, setThemeMode],
  );

  const handleThemeChange = useCallback(
    (event: { target: { value?: unknown } }) => {
      if (isThemeMode(event.target.value)) {
        savePreference('theme_mode', event.target.value);
      }
    },
    [savePreference],
  );

  const handleLocaleChange = useCallback(
    (event: { target: { value?: unknown } }) => {
      if (isLocale(event.target.value)) {
        savePreference('locale', event.target.value);
      }
    },
    [savePreference],
  );

  const installLocalPlugin = useCallback(() => {
    if (installationPendingRef.current) {
      return;
    }
    installationPendingRef.current = true;
    setInstallationPending(true);
    setInstallationFeedback(undefined);
    void installationClient
      .install()
      .then((result) => {
        setInstallationFeedback(
          result.status === 'cancelled'
            ? { kind: 'cancelled' }
            : {
                kind: 'installed',
                pluginId: result.plugin_id,
                version: result.version,
              },
        );
      })
      .catch((error: unknown) => {
        setInstallationFeedback({
          kind: 'error',
          code: error instanceof LocalPluginInstallationError ? error.code : 'invalid_boundary_payload',
        });
      })
      .finally(() => {
        installationPendingRef.current = false;
        restoreInstallationFocusRef.current = true;
        setInstallationPending(false);
      });
  }, [installationClient]);

  const installationMessage = installationPending
    ? t('settings.plugins.pending')
    : installationFeedback?.kind === 'cancelled'
      ? t('settings.plugins.cancelled')
      : installationFeedback?.kind === 'installed'
        ? t('settings.plugins.success', {
            pluginId: installationFeedback.pluginId,
            version: installationFeedback.version,
          })
        : installationFeedback?.kind === 'error'
          ? t(installationFailureMessageKeys[installationFeedback.code])
          : '';

  return (
    <div className="settings-page min-h-0 flex flex-1 flex-col">
      <Tabs aria-label={t('settings.title')} className="settings-tabs" type="line">
        <TabPane itemKey="preferences" tab={t('settings.sections.preferences')}>
          <section aria-labelledby="settings-preferences-heading" className="settings-section flex flex-col gap-3">
            <Typography.Title heading={3} id="settings-preferences-heading">
              {t('settings.sections.preferences')}
            </Typography.Title>
            {saveErrorCode ? (
              <Banner closeIcon={null} description={t('settings.save.failure')} fullMode={false} type="danger" />
            ) : null}
            <div className="settings-row flex items-center justify-between gap-6">
              <div className="min-w-0">
                <Typography.Text id="settings-theme-label" strong>
                  {t('settings.theme.label')}
                </Typography.Text>
                <Typography.Paragraph id="settings-theme-description" type="tertiary">
                  {t('settings.theme.description')}
                </Typography.Paragraph>
              </div>
              <RadioGroup
                aria-describedby="settings-theme-description"
                aria-labelledby="settings-theme-label"
                disabled={Boolean(pendingPreference)}
                onChange={handleThemeChange}
                type="button"
                value={confirmedPreferences.theme_mode}
              >
                <Radio value="light">{t('settings.theme.light')}</Radio>
                <Radio value="dark">{t('settings.theme.dark')}</Radio>
              </RadioGroup>
            </div>
            <div className="settings-row flex items-center justify-between gap-6">
              <div className="min-w-0">
                <Typography.Text id="settings-locale-label" strong>
                  {t('settings.locale.label')}
                </Typography.Text>
                <Typography.Paragraph id="settings-locale-description" type="tertiary">
                  {t('settings.locale.description')}
                </Typography.Paragraph>
              </div>
              <RadioGroup
                aria-describedby="settings-locale-description"
                aria-labelledby="settings-locale-label"
                disabled={Boolean(pendingPreference)}
                onChange={handleLocaleChange}
                type="button"
                value={confirmedPreferences.locale}
              >
                <Radio value="en-US">{t('settings.locale.enUS')}</Radio>
                <Radio value="zh-CN">{t('settings.locale.zhCN')}</Radio>
              </RadioGroup>
            </div>
            <Typography.Text
              aria-live="polite"
              className="settings-save-status"
              role="status"
              type={saveErrorCode ? 'danger' : 'tertiary'}
            >
              {pendingPreference ? t('settings.save.inProgress') : ''}
            </Typography.Text>
          </section>
        </TabPane>
        <TabPane itemKey="plugins" tab={t('settings.sections.plugins')}>
          <section
            aria-labelledby="settings-plugins-heading"
            className="settings-section flex flex-col items-start gap-3"
          >
            <Typography.Title heading={3} id="settings-plugins-heading">
              {t('settings.plugins.title')}
            </Typography.Title>
            <Typography.Paragraph id="settings-plugins-description" type="tertiary">
              {t('settings.plugins.description')}
            </Typography.Paragraph>
            <Button
              aria-describedby="settings-plugins-description"
              disabled={installationPending}
              id="settings-install-local-plugin"
              loading={installationPending}
              onClick={installLocalPlugin}
              theme="solid"
              type="primary"
            >
              {installationPending ? t('settings.plugins.pending') : t('settings.plugins.install')}
            </Button>
            <Typography.Text
              aria-atomic="true"
              aria-live={installationFeedback?.kind === 'error' ? 'assertive' : 'polite'}
              className="settings-installation-status"
              role={installationFeedback?.kind === 'error' ? 'alert' : 'status'}
              type={installationFeedback?.kind === 'error' ? 'danger' : 'tertiary'}
            >
              {installationMessage}
            </Typography.Text>
          </section>
        </TabPane>
      </Tabs>
    </div>
  );
};
