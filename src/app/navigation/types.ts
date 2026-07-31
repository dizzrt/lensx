export interface HostPageTarget {
  readonly owner_id: string;
  readonly page_id: string;
}

export interface ActivePage extends HostPageTarget {
  readonly opened_by_action_id: string;
}

export interface HostPageDefinition extends HostPageTarget {
  readonly enabled: boolean;
}

export type AppNavigationErrorCode =
  | 'navigation_handler_already_registered'
  | 'navigation_handler_unavailable'
  | 'page_unavailable';

export class AppNavigationError extends Error {
  readonly code: AppNavigationErrorCode;

  constructor(code: AppNavigationErrorCode, message: string) {
    super(message);
    this.name = 'AppNavigationError';
    this.code = code;
  }
}
