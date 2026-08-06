import { sortAndDedupeDiagnostics } from './diagnostics.js';
import { MESSAGE_CATALOGS } from './messages.js';
import {
  CLI_SCHEMA_VERSION,
  type PluginCliDiagnostic,
  type PluginCliEnvelope,
  type PluginCliLocale,
  type PluginCliMessageKey,
} from './types.js';

export const renderMessage = (
  locale: PluginCliLocale,
  key: PluginCliMessageKey,
  arguments_: Readonly<Record<string, string | number | boolean>> = {},
): string => {
  let message: string = MESSAGE_CATALOGS[locale][key];
  for (const [name, value] of Object.entries(arguments_)) message = message.replaceAll(`{${name}}`, String(value));
  return message;
};

export const createEnvelope = <Result extends Readonly<Record<string, unknown>>>(
  command: PluginCliEnvelope<Result>['command'],
  status: PluginCliEnvelope<Result>['status'],
  result: Result,
  diagnostics: readonly PluginCliDiagnostic[] = [],
): PluginCliEnvelope<Result> => ({
  schema_version: CLI_SCHEMA_VERSION,
  command,
  status,
  result,
  diagnostics: sortAndDedupeDiagnostics(diagnostics),
});

export const serializeEnvelope = (envelope: PluginCliEnvelope): string => `${JSON.stringify(envelope)}\n`;

export const renderHumanEnvelope = (envelope: PluginCliEnvelope, locale: PluginCliLocale): string => {
  if (envelope.diagnostics.length > 0) {
    return `${envelope.diagnostics.map((item) => `${item.code} ${item.path}: ${renderMessage(locale, item.message_key, item.arguments)}`).join('\n')}\n`;
  }
  if (envelope.command === 'help') return `${renderMessage(locale, 'usage')}\n\n${HELP_TEXT}\n`;
  if (envelope.command === 'version')
    return `${renderMessage(locale, 'version', envelope.result as Record<string, string>)}\n`;
  return `${renderMessage(locale, 'command_succeeded', { command: envelope.command })}\n`;
};

export const HELP_TEXT = `Usage: lensx-plugin <command> [options]

Commands:
  create <target> --template <framework-neutral|react-semi> --plugin-id <id> --name <name>
  build [--project <dir>]
  validate [--project <dir>]
  pack [--project <dir>] [--output <file>] [--no-build]
  inspect <file>

Options:
  --json                 emit one schema-versioned JSON document
  --locale <en-US|zh-CN> select human output locale
  --help                 show help
  --version              show version`;
