import type { EN_US_MESSAGES } from './messages.js';

export const CLI_SCHEMA_VERSION = '1' as const;
export const PLUGIN_CLI_VERSION = '0.2.0' as const;

export type PluginCliCommand = 'create' | 'build' | 'validate' | 'pack' | 'inspect' | 'help' | 'version';
export type PluginCliLocale = 'en-US' | 'zh-CN';
export type PluginCliStatus =
  | 'success'
  | 'compatible'
  | 'incompatible'
  | 'invalid'
  | 'usage_error'
  | 'operational_error';
export type PluginCliExitCode = 0 | 1 | 2 | 3;
export type PluginTemplateKind = 'framework-neutral' | 'react-semi';

export interface PluginCliDiagnostic {
  readonly code: string;
  readonly path: string;
  readonly message_key: PluginCliMessageKey;
  readonly arguments: Readonly<Record<string, string | number | boolean>>;
}

export interface PluginCliEnvelope<Result = Readonly<Record<string, unknown>>> {
  readonly schema_version: typeof CLI_SCHEMA_VERSION;
  readonly command: PluginCliCommand;
  readonly status: PluginCliStatus;
  readonly result: Result;
  readonly diagnostics: readonly PluginCliDiagnostic[];
}

export interface PluginCliGlobalOptions {
  readonly json: boolean;
  readonly locale: PluginCliLocale;
}

export type ParsedPluginCliInvocation =
  | (PluginCliGlobalOptions & {
      readonly command: 'create';
      readonly target: string;
      readonly template: PluginTemplateKind;
      readonly pluginId: string;
      readonly name: string;
    })
  | (PluginCliGlobalOptions & { readonly command: 'build' | 'validate'; readonly project?: string })
  | (PluginCliGlobalOptions & {
      readonly command: 'pack';
      readonly project?: string;
      readonly output?: string;
      readonly noBuild: boolean;
    })
  | (PluginCliGlobalOptions & { readonly command: 'inspect'; readonly file: string })
  | (PluginCliGlobalOptions & { readonly command: 'help' | 'version' });

export type PluginCliMessageKey = keyof typeof EN_US_MESSAGES;
