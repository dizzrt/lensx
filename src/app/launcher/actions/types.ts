export const LAUNCHER_ACTION_LOCALES = ['en-US', 'zh-CN'] as const;

export type LauncherActionLocale = (typeof LAUNCHER_ACTION_LOCALES)[number];

export type LocalizedActionText = Readonly<
  Record<'en-US', string> & Partial<Record<Exclude<LauncherActionLocale, 'en-US'>, string>>
>;

export type LauncherActionKeywordMap = Readonly<Partial<Record<LauncherActionLocale, readonly string[]>>>;

export interface LauncherActionHostIcon {
  readonly kind: 'host';
  readonly token: string;
}

export interface LauncherActionDescriptor {
  readonly action_id: string;
  readonly owner_id: string;
  readonly title: LocalizedActionText;
  readonly description?: LocalizedActionText;
  readonly default_keywords: LauncherActionKeywordMap;
  readonly icon?: LauncherActionHostIcon;
  readonly enabled: boolean;
}

export type LauncherActionDiagnosticCode =
  | 'duplicate_action_id'
  | 'duplicate_keyword'
  | 'invalid_id'
  | 'invalid_keyword'
  | 'invalid_owner'
  | 'invalid_type'
  | 'missing_localized_text'
  | 'unknown_field';

export interface LauncherActionDiagnostic {
  readonly code: LauncherActionDiagnosticCode;
  readonly path: string;
  readonly message: string;
}

export type LauncherActionValidationResult =
  | {
      readonly ok: true;
      readonly descriptor: LauncherActionDescriptor;
      readonly diagnostics: readonly [];
    }
  | {
      readonly ok: false;
      readonly diagnostics: readonly LauncherActionDiagnostic[];
    };

export type LauncherActionExecutor = () => Promise<void> | void;

export interface LauncherActionRegistrationInput {
  readonly descriptor: unknown;
  readonly executor: LauncherActionExecutor;
}

export type LauncherActionRegistrationResult =
  | {
      readonly ok: true;
      readonly descriptors: readonly LauncherActionDescriptor[];
      readonly diagnostics: readonly [];
    }
  | {
      readonly ok: false;
      readonly diagnostics: readonly LauncherActionDiagnostic[];
    };

export type LauncherActionDispatchErrorCode = 'action_execution_failed' | 'action_not_found' | 'action_unavailable';

export type LauncherActionDispatchResult =
  | {
      readonly ok: true;
      readonly action_id: string;
    }
  | {
      readonly ok: false;
      readonly action_id: string;
      readonly error: {
        readonly code: LauncherActionDispatchErrorCode;
        readonly message: string;
      };
    };

export interface ResolvedLauncherActionMetadata {
  readonly title: string;
  readonly description?: string;
  readonly default_keywords: readonly string[];
  readonly icon?: LauncherActionHostIcon;
}
