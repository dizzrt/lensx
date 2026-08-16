const SCOPE_PATTERN = /^[0-9a-f]{32}$/u;

export const isValidPluginRuntimeRoute = (value: string): boolean => {
  if (
    value.length === 0 ||
    value.length > 512 ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    !value.startsWith('/') ||
    !/^[\x20-\x7e]+$/u.test(value) ||
    value.includes('\\') ||
    value.includes('%') ||
    value.includes('?') ||
    value.includes('#') ||
    value.includes('://')
  ) {
    return false;
  }
  const segments = value.slice(1).split('/');
  return segments.every(
    (segment, index) => (segment !== '' || index === segments.length - 1) && segment !== '.' && segment !== '..',
  );
};

export const isValidIsolatedPluginRuntimeEntryUrl = (value: string): boolean => {
  if (value.length === 0 || value.length > 2048 || !/^[\x20-\x7e]+$/u.test(value) || /[%\\\0]/u.test(value)) {
    return false;
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  const native = /^([0-9a-f]{32})\.runtime\.localhost$/u.exec(parsed.hostname);
  const translated = /^lensx-plugin\.([0-9a-f]{32})\.runtime\.localhost$/u.exec(parsed.hostname);
  const nativeOrigin = parsed.protocol === 'lensx-plugin:' && native !== null;
  const translatedOrigin = (parsed.protocol === 'http:' || parsed.protocol === 'https:') && translated !== null;
  const originScope = native?.[1] ?? translated?.[1];
  const pathScope = parsed.pathname.split('/')[2];
  return Boolean(
    (nativeOrigin || translatedOrigin) &&
      originScope &&
      SCOPE_PATTERN.test(originScope) &&
      pathScope === originScope &&
      parsed.username === '' &&
      parsed.password === '' &&
      parsed.port === '' &&
      parsed.search === '' &&
      parsed.hash === '',
  );
};

export const pluginRuntimeFragmentFromRoute = (route: string): string | undefined =>
  isValidPluginRuntimeRoute(route) ? route : undefined;

export const pluginRuntimeOriginFromEntryUrl = (entryUrl: string): string | undefined => {
  if (!isValidIsolatedPluginRuntimeEntryUrl(entryUrl)) return undefined;
  const parsed = new URL(entryUrl);
  return `${parsed.protocol}//${parsed.hostname}`;
};

export const pluginRuntimeGenerationFromEntryUrl = (entryUrl: string): string | undefined => {
  if (!isValidIsolatedPluginRuntimeEntryUrl(entryUrl)) return undefined;
  const parsed = new URL(entryUrl);
  return (
    /^([0-9a-f]{32})\.runtime\.localhost$/u.exec(parsed.hostname)?.[1] ??
    /^lensx-plugin\.([0-9a-f]{32})\.runtime\.localhost$/u.exec(parsed.hostname)?.[1]
  );
};
