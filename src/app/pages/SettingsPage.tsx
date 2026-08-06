import { Banner, Radio, RadioGroup, TabPane, Tabs, Typography } from '@douyinfe/semi-ui';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppLocale } from '../i18n';
import type { PluginManagementService } from '../plugins/management';
import type { AppPreferences, AppPreferencesClient, AppPreferencesErrorCode } from '../preferences';
import { useAppTheme } from '../theme';
import { PluginManagementSettings } from './PluginManagementSettings';

interface SettingsPageProps {
  managementService: PluginManagementService;
  preferencesClient: AppPreferencesClient;
}

type PreferenceKey = keyof AppPreferences;

const isThemeMode = (value: unknown): value is AppPreferences['theme_mode'] => value === 'light' || value === 'dark';

const isLocale = (value: unknown): value is AppPreferences['locale'] => value === 'en-US' || value === 'zh-CN';

export const SettingsPage = ({ managementService, preferencesClient }: SettingsPageProps) => {
  const { t } = useTranslation();
  const { locale, setLocale } = useAppLocale();
  const { setThemeMode, themeMode } = useAppTheme();
  const [confirmedPreferences, setConfirmedPreferences] = useState<AppPreferences>({
    theme_mode: themeMode,
    locale,
  });
  const [pendingPreference, setPendingPreference] = useState<PreferenceKey>();
  const [saveErrorCode, setSaveErrorCode] = useState<AppPreferencesErrorCode>();
  const saveChainRef = useRef(Promise.resolve());

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
          <PluginManagementSettings service={managementService} />
        </TabPane>
      </Tabs>
    </div>
  );
};
