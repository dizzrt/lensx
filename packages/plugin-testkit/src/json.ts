const configurationError = (message: string): never => {
  throw new TypeError(`Plugin Testkit configuration error: ${message}`);
};

export const copyJsonValue = (value: unknown, ancestors = new Set<object>()): unknown => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : configurationError('values must be valid JSON data.');
  }
  if (typeof value !== 'object') {
    return configurationError('values must be valid JSON data.');
  }
  if (ancestors.has(value)) {
    return configurationError('values must not contain cycles.');
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => copyJsonValue(item, ancestors));
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return configurationError('values must use plain JSON objects.');
    }
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, copyJsonValue(item, ancestors)]),
    );
  } finally {
    ancestors.delete(value);
  }
};

export const freezeJsonValue = (value: unknown): unknown => {
  if (value !== null && typeof value === 'object') {
    for (const item of Array.isArray(value) ? value : Object.values(value)) {
      freezeJsonValue(item);
    }
    Object.freeze(value);
  }
  return value;
};

export const failTestkitConfiguration = configurationError;
