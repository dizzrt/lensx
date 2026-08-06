import { cliDiagnostic } from './diagnostics.js';
import type { ParsedPluginCliInvocation, PluginCliDiagnostic, PluginCliLocale } from './types.js';

type ParseResult =
  | { readonly invocation: ParsedPluginCliInvocation; readonly diagnostics: readonly [] }
  | { readonly diagnostics: readonly PluginCliDiagnostic[]; readonly json: boolean; readonly locale: PluginCliLocale };

const commands = new Set(['create', 'build', 'validate', 'pack', 'inspect']);
const valueOptions = new Set(['--locale', '--project', '--output', '--template', '--plugin-id', '--name']);

export const parsePluginCliArguments = (arguments_: readonly string[]): ParseResult => {
  let json = false;
  let locale: PluginCliLocale = 'en-US';
  const values = new Map<string, string>();
  const flags = new Set<string>();
  const positionals: string[] = [];
  const diagnostics: PluginCliDiagnostic[] = [];

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index] ?? '';
    if (argument === '--json') {
      json = true;
      continue;
    }
    if (
      argument === '--help' ||
      argument === '-h' ||
      argument === '--version' ||
      argument === '-v' ||
      argument === '--no-build'
    ) {
      flags.add(argument);
      continue;
    }
    if (valueOptions.has(argument)) {
      const value = arguments_[index + 1];
      if (value === undefined || value.startsWith('--')) {
        diagnostics.push(cliDiagnostic('CLI_EXPECTED_VALUE', '/arguments', 'expected_value', { option: argument }));
      } else {
        values.set(argument, value);
        index += 1;
      }
      continue;
    }
    if (argument.startsWith('-')) {
      diagnostics.push(cliDiagnostic('CLI_UNKNOWN_OPTION', '/arguments', 'invalid_option', { option: argument }));
      continue;
    }
    positionals.push(argument);
  }

  const requestedLocale = values.get('--locale');
  if (requestedLocale !== undefined) {
    if (requestedLocale === 'en-US' || requestedLocale === 'zh-CN') locale = requestedLocale;
    else
      diagnostics.push(
        cliDiagnostic('CLI_INVALID_LOCALE', '/arguments/locale', 'invalid_locale', { locale: requestedLocale }),
      );
  }

  if (flags.has('--help') || flags.has('-h') || arguments_.length === 0) {
    return diagnostics.length > 0
      ? { diagnostics, json, locale }
      : { invocation: { command: 'help', json, locale }, diagnostics: [] };
  }
  if (flags.has('--version') || flags.has('-v')) {
    return diagnostics.length > 0
      ? { diagnostics, json, locale }
      : { invocation: { command: 'version', json, locale }, diagnostics: [] };
  }

  const command = positionals.shift();
  if (command === undefined || !commands.has(command)) {
    diagnostics.push(
      cliDiagnostic('CLI_UNKNOWN_COMMAND', '/arguments/command', 'unknown_command', { command: command ?? '' }),
    );
    return { diagnostics, json, locale };
  }

  const rejectOptions = (allowed: readonly string[]) => {
    const allowedSet = new Set(['--locale', ...allowed]);
    for (const option of values.keys()) {
      if (!allowedSet.has(option))
        diagnostics.push(cliDiagnostic('CLI_INVALID_OPTION', '/arguments', 'invalid_option', { option }));
    }
  };
  const rejectPositionals = () => {
    for (const argument of positionals)
      diagnostics.push(cliDiagnostic('CLI_UNEXPECTED_ARGUMENT', '/arguments', 'unexpected_argument', { argument }));
  };
  const requireValue = (option: string, label: string): string => {
    const value = values.get(option);
    if (value === undefined)
      diagnostics.push(cliDiagnostic('CLI_MISSING_ARGUMENT', '/arguments', 'missing_argument', { argument: label }));
    return value ?? '';
  };

  let invocation: ParsedPluginCliInvocation;
  if (command === 'create') {
    rejectOptions(['--template', '--plugin-id', '--name']);
    const target = positionals.shift();
    if (target === undefined)
      diagnostics.push(cliDiagnostic('CLI_MISSING_ARGUMENT', '/arguments', 'missing_argument', { argument: 'target' }));
    rejectPositionals();
    const template = requireValue('--template', '--template');
    if (template !== 'framework-neutral' && template !== 'react-semi') {
      diagnostics.push(
        cliDiagnostic('CLI_INVALID_TEMPLATE', '/arguments/template', 'invalid_option', { option: template }),
      );
    }
    invocation = {
      command,
      json,
      locale,
      target: target ?? '',
      template: template === 'react-semi' ? 'react-semi' : 'framework-neutral',
      pluginId: requireValue('--plugin-id', '--plugin-id'),
      name: requireValue('--name', '--name'),
    };
  } else if (command === 'build' || command === 'validate') {
    rejectOptions(['--project']);
    rejectPositionals();
    invocation = { command, json, locale, ...(values.has('--project') ? { project: values.get('--project') } : {}) };
  } else if (command === 'pack') {
    rejectOptions(['--project', '--output']);
    rejectPositionals();
    invocation = {
      command,
      json,
      locale,
      noBuild: flags.has('--no-build'),
      ...(values.has('--project') ? { project: values.get('--project') } : {}),
      ...(values.has('--output') ? { output: values.get('--output') } : {}),
    };
  } else {
    rejectOptions([]);
    const file = positionals.shift();
    if (file === undefined)
      diagnostics.push(cliDiagnostic('CLI_MISSING_ARGUMENT', '/arguments', 'missing_argument', { argument: 'file' }));
    rejectPositionals();
    invocation = { command: 'inspect', json, locale, file: file ?? '' };
  }

  return diagnostics.length > 0 ? { diagnostics, json, locale } : { invocation, diagnostics: [] };
};
