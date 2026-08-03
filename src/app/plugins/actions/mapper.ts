import type { NormalizedPluginManifest } from '@lensx/plugin-contract';
import type { LauncherActionRegistrationInput } from '../../launcher/actions/types';

export interface PluginActionPageTarget {
  readonly owner_id: string;
  readonly page_id: string;
}

export interface PluginActionPageOpener {
  openPage: (target: PluginActionPageTarget, openedByActionId: string) => Promise<void> | void;
}

export type PluginActionPageAvailability = (target: PluginActionPageTarget) => boolean;

const cloneLocalizedText = (text: { readonly 'en-US': string; readonly 'zh-CN'?: string }) =>
  Object.freeze({
    'en-US': text['en-US'],
    ...(text['zh-CN'] ? { 'zh-CN': text['zh-CN'] } : {}),
  });

const cloneKeywords = (keywords: NormalizedPluginManifest['contributes']['actions'][number]['default_keywords']) =>
  Object.freeze({
    ...(keywords['en-US'] ? { 'en-US': Object.freeze([...keywords['en-US']]) } : {}),
    ...(keywords['zh-CN'] ? { 'zh-CN': Object.freeze([...keywords['zh-CN']]) } : {}),
  });

export const mapPluginActionsToLauncherRegistrations = (
  manifest: NormalizedPluginManifest,
  pageOpener: PluginActionPageOpener,
  isPageAvailable: PluginActionPageAvailability = () => true,
): readonly LauncherActionRegistrationInput[] =>
  Object.freeze(
    manifest.contributes.actions.flatMap((action) => {
      const actionId = `${manifest.plugin_id}.${action.id}`;
      const target = Object.freeze({
        owner_id: manifest.plugin_id,
        page_id: action.target.page_id,
      });

      if (!isPageAvailable(target)) {
        return [];
      }

      return [
        Object.freeze({
          descriptor: Object.freeze({
            action_id: actionId,
            owner_id: manifest.plugin_id,
            title: cloneLocalizedText(action.title),
            ...(action.description ? { description: cloneLocalizedText(action.description) } : {}),
            default_keywords: cloneKeywords(action.default_keywords),
            enabled: true,
          }),
          executor: () => pageOpener.openPage(target, actionId),
        }),
      ];
    }),
  );
