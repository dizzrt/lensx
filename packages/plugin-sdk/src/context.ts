import { PluginSdkError } from './error.js';
import { parseSemVer } from './semver.js';
import type { PluginRuntimeContext, PluginRuntimeLocale, PluginRuntimeTheme } from './types.js';

const CONTEXT_KEYS = ['capabilities', 'hostApiVersion', 'locale', 'theme'];
const LOCALES = new Set<PluginRuntimeLocale>(['en-US', 'zh-CN']);
const THEMES = new Set<PluginRuntimeTheme>(['light', 'dark']);

const invalidContext = (): never => {
  throw new PluginSdkError('invalid_runtime_context');
};

export const validateRuntimeContext = (value: unknown): PluginRuntimeContext => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return invalidContext();
  }
  const input = value as Record<string, unknown>;
  if (Object.keys(input).sort().join('\0') !== CONTEXT_KEYS.join('\0')) {
    return invalidContext();
  }
  if (typeof input.hostApiVersion !== 'string' || parseSemVer(input.hostApiVersion) === undefined) {
    return invalidContext();
  }
  if (typeof input.locale !== 'string' || !LOCALES.has(input.locale as PluginRuntimeLocale)) {
    return invalidContext();
  }
  if (typeof input.theme !== 'string' || !THEMES.has(input.theme as PluginRuntimeTheme)) {
    return invalidContext();
  }
  if (!Array.isArray(input.capabilities)) {
    return invalidContext();
  }
  const capabilities: string[] = [];
  const seen = new Set<string>();
  for (const capability of input.capabilities) {
    if (
      typeof capability !== 'string' ||
      capability.length === 0 ||
      capability.trim() !== capability ||
      seen.has(capability)
    ) {
      return invalidContext();
    }
    seen.add(capability);
    capabilities.push(capability);
  }

  return Object.freeze({
    capabilities: Object.freeze(capabilities),
    hostApiVersion: input.hostApiVersion,
    locale: input.locale as PluginRuntimeLocale,
    theme: input.theme as PluginRuntimeTheme,
  });
};
