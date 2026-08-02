import { PLUGIN_HOST_API_VERSION, PLUGIN_MANIFEST_VERSION, type PluginManifestInput } from '@lensx/plugin-contract';

import { copyJsonValue, failTestkitConfiguration } from './json.js';

export type PluginManifestFixtureMutation =
  | {
      readonly op: 'set';
      readonly path: string;
      readonly value: unknown;
    }
  | {
      readonly op: 'remove';
      readonly path: string;
    };

export const createPluginManifestFixture = (): PluginManifestInput => ({
  compatibility: {
    host_api: {
      max_version_exclusive: '0.2.0',
      min_version: PLUGIN_HOST_API_VERSION,
    },
    lensx: {
      max_version_exclusive: '0.2.0',
      min_version: '0.1.0',
    },
  },
  contributes: {
    pages: [
      {
        id: 'main',
        route: '/',
        title: { 'en-US': 'Test Plugin' },
      },
    ],
  },
  display: {
    name: { 'en-US': 'Test Plugin' },
  },
  manifest_version: PLUGIN_MANIFEST_VERSION,
  plugin_id: 'com.example.test-plugin',
  publisher: {
    author: 'Test Author',
    homepage: 'https://example.com/test-plugin',
    repository: 'https://example.com/test-plugin/repository',
  },
  runtime: {
    entry: 'dist/plugin.html',
    kind: 'iframe',
  },
  version: '0.1.0',
});

const decodePointerToken = (token: string): string => {
  if (/~(?:[^01]|$)/u.test(token)) {
    return failTestkitConfiguration('JSON Pointer contains an invalid escape sequence.');
  }
  return token.replaceAll('~1', '/').replaceAll('~0', '~');
};

const parsePointer = (pointer: string): string[] => {
  if (pointer === '') {
    return [];
  }
  if (!pointer.startsWith('/')) {
    return failTestkitConfiguration('JSON Pointer must be empty or start with "/".');
  }
  return pointer.slice(1).split('/').map(decodePointerToken);
};

const arrayIndex = (token: string, length: number): number => {
  if (!/^(?:0|[1-9]\d*)$/u.test(token)) {
    return failTestkitConfiguration(`JSON Pointer array token ${JSON.stringify(token)} is invalid.`);
  }
  const index = Number(token);
  if (!Number.isSafeInteger(index) || index >= length) {
    return failTestkitConfiguration(`JSON Pointer array index ${JSON.stringify(token)} is out of bounds.`);
  }
  return index;
};

const childAt = (parent: unknown, token: string): unknown => {
  if (Array.isArray(parent)) {
    return parent[arrayIndex(token, parent.length)];
  }
  if (parent === null || typeof parent !== 'object' || !Object.hasOwn(parent, token)) {
    return failTestkitConfiguration(`JSON Pointer token ${JSON.stringify(token)} does not exist.`);
  }
  return (parent as Record<string, unknown>)[token];
};

const parentAt = (document: unknown, tokens: readonly string[]): unknown => {
  let current = document;
  for (const token of tokens) {
    current = childAt(current, token);
  }
  return current;
};

const applyMutation = (document: unknown, mutation: PluginManifestFixtureMutation): unknown => {
  const tokens = parsePointer(mutation.path);
  if (tokens.length === 0) {
    return mutation.op === 'set' ? copyJsonValue(mutation.value) : undefined;
  }

  const parent = parentAt(document, tokens.slice(0, -1));
  const token = tokens.at(-1);
  if (token === undefined) {
    return failTestkitConfiguration('JSON Pointer is missing its final token.');
  }
  if (Array.isArray(parent)) {
    const index = arrayIndex(token, parent.length);
    if (mutation.op === 'set') {
      parent[index] = copyJsonValue(mutation.value);
    } else {
      parent.splice(index, 1);
    }
    return document;
  }
  if (parent === null || typeof parent !== 'object') {
    return failTestkitConfiguration('JSON Pointer parent is not an object or array.');
  }
  const record = parent as Record<string, unknown>;
  if (mutation.op === 'remove') {
    if (!Object.hasOwn(record, token)) {
      return failTestkitConfiguration(`JSON Pointer token ${JSON.stringify(token)} does not exist.`);
    }
    delete record[token];
  } else {
    record[token] = copyJsonValue(mutation.value);
  }
  return document;
};

export const mutatePluginManifestFixture = (
  input: unknown,
  operations: readonly PluginManifestFixtureMutation[],
): unknown => {
  let result = copyJsonValue(input);
  for (const operation of operations) {
    result = applyMutation(result, operation);
  }
  return result;
};
