import { Banner, Nav, Select, Typography } from '@douyinfe/semi-ui';
import { cloneElement, type KeyboardEvent, useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppLocale } from '../i18n';
import type { LauncherActionDescriptor } from '../launcher/actions';
import type { PluginManagementService } from '../plugins/management';
import type { AppPreferences, AppPreferencesClient, AppPreferencesErrorCode } from '../preferences';
import { type ShortcutService, unavailableShortcutService } from '../shortcuts';
import { useAppTheme } from '../theme';
import { PluginManagementSettings } from './PluginManagementSettings';
import { ShortcutSettings } from './ShortcutSettings';

interface SettingsPageProps {
  managementService: PluginManagementService;
  preferencesClient: AppPreferencesClient;
  shortcutsService?: ShortcutService;
  actions?: readonly LauncherActionDescriptor[];
}

type PreferenceKey = keyof AppPreferences;
type SettingsSection = 'plugins' | 'preferences' | 'shortcuts';
const EMPTY_ACTIONS: readonly LauncherActionDescriptor[] = Object.freeze([]);

const isThemeMode = (value: unknown): value is AppPreferences['theme_mode'] => value === 'light' || value === 'dark';

const isLocale = (value: unknown): value is AppPreferences['locale'] => value === 'en-US' || value === 'zh-CN';

export const SettingsPage = ({
  managementService,
  preferencesClient,
  shortcutsService = unavailableShortcutService,
  actions = EMPTY_ACTIONS,
}: SettingsPageProps) => {
  const { t } = useTranslation();
  const { locale, setLocale } = useAppLocale();
  const { setThemeMode, themeMode } = useAppTheme();
  const [selectedSection, setSelectedSection] = useState<SettingsSection>('preferences');
  const [confirmedPreferences, setConfirmedPreferences] = useState<AppPreferences>({
    theme_mode: themeMode,
    locale,
  });
  const [pendingPreference, setPendingPreference] = useState<PreferenceKey>();
  const [saveErrorCode, setSaveErrorCode] = useState<AppPreferencesErrorCode>();
  const saveChainRef = useRef(Promise.resolve());
  const navigationItems = useMemo(
    () => [
      { itemKey: 'preferences', text: t('settings.sections.preferences') },
      { itemKey: 'plugins', text: t('settings.sections.plugins') },
      { itemKey: 'shortcuts', text: t('settings.sections.shortcuts') },
    ],
    [t],
  );
  const themeOptions = useMemo(
    () => [
      { label: t('settings.theme.light'), showTick: false, value: 'light' },
      { label: t('settings.theme.dark'), showTick: false, value: 'dark' },
    ],
    [t],
  );
  const localeOptions = useMemo(
    () => [
      { label: t('settings.locale.enUS'), showTick: false, value: 'en-US' },
      { label: t('settings.locale.zhCN'), showTick: false, value: 'zh-CN' },
    ],
    [t],
  );

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
    (value: unknown) => {
      if (isThemeMode(value)) {
        savePreference('theme_mode', value);
      }
    },
    [savePreference],
  );

  const handleLocaleChange = useCallback(
    (value: unknown) => {
      if (isLocale(value)) {
        savePreference('locale', value);
      }
    },
    [savePreference],
  );

  const handleSectionSelect = useCallback(({ itemKey }: { itemKey: string | number }) => {
    if (itemKey === 'preferences' || itemKey === 'plugins' || itemKey === 'shortcuts') {
      setSelectedSection(itemKey);
    }
  }, []);

  return (
    <div className="settings-page min-h-0 flex flex-1">
      <nav aria-label={t('settings.title')} className="settings-navigation flex-none">
        <Nav
          className="settings-navigation-menu"
          items={navigationItems}
          mode="vertical"
          onSelect={handleSectionSelect}
          renderWrapper={({ itemElement, props }) =>
            cloneElement(itemElement, {
              'aria-controls': `settings-${String(props.itemKey)}-panel`,
              'aria-current': props.itemKey === selectedSection ? 'page' : undefined,
              onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
                if ((event.key === 'Enter' || event.key === ' ') && props.itemKey) {
                  event.preventDefault();
                  handleSectionSelect({ itemKey: props.itemKey });
                }
              },
            })
          }
          selectedKeys={[selectedSection]}
        />
      </nav>
      <div className="settings-content min-h-0 min-w-0 flex flex-1 flex-col" data-settings-section={selectedSection}>
        {selectedSection === 'preferences' ? (
          <section
            aria-labelledby="settings-preferences-heading"
            className="settings-section flex flex-col gap-3"
            id="settings-preferences-panel"
          >
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
              <Select
                aria-describedby="settings-theme-description"
                aria-labelledby="settings-theme-label"
                className="settings-preference-select"
                disabled={Boolean(pendingPreference)}
                onChange={handleThemeChange}
                optionList={themeOptions}
                value={confirmedPreferences.theme_mode}
              />
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
              <Select
                aria-describedby="settings-locale-description"
                aria-labelledby="settings-locale-label"
                className="settings-preference-select"
                disabled={Boolean(pendingPreference)}
                onChange={handleLocaleChange}
                optionList={localeOptions}
                value={confirmedPreferences.locale}
              />
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
        ) : selectedSection === 'plugins' ? (
          <div className="settings-section-host min-h-0 flex flex-1 flex-col" id="settings-plugins-panel">
            <PluginManagementSettings service={managementService} />
          </div>
        ) : (
          <div id="settings-shortcuts-panel">
            <ShortcutSettings service={shortcutsService} actions={actions} />
          </div>
        )}
      </div>
    </div>
  );
};
