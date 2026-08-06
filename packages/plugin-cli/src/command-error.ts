import type { PluginCliDiagnostic, PluginCliStatus } from './types.js';

export class PluginCliCommandError extends Error {
  readonly status: Extract<PluginCliStatus, 'invalid' | 'incompatible' | 'usage_error' | 'operational_error'>;
  readonly diagnostics: readonly PluginCliDiagnostic[];

  constructor(status: PluginCliCommandError['status'], diagnostics: readonly PluginCliDiagnostic[]) {
    super('Plugin CLI command failed.');
    this.name = 'PluginCliCommandError';
    this.status = status;
    this.diagnostics = diagnostics;
  }
}
