import { describe, expect, test } from '@rstest/core';
import Ajv2020 from 'ajv/dist/2020';
import { enUSMessages, zhCNMessages } from '../src/app/i18n';
import messageSchema from '../src/app/i18n/messages/messages.schema.json';

const localeResources = {
  'en-US': enUSMessages,
  'zh-CN': zhCNMessages,
};

type MessageResource = {
  [key: string]: MessageResource | string;
};

type MessageSchema = {
  properties?: Record<string, MessageSchema>;
  required?: readonly string[];
  type?: string;
};

const collectMessageKeys = (resource: MessageResource, prefix = ''): string[] =>
  Object.entries(resource)
    .flatMap(([key, value]) => {
      const qualifiedKey = prefix ? `${prefix}.${key}` : key;
      return typeof value === 'string' ? [qualifiedKey] : collectMessageKeys(value, qualifiedKey);
    })
    .sort();

const collectSchemaMessageKeys = (schema: MessageSchema, prefix = ''): string[] =>
  Object.entries(schema.properties ?? {})
    .flatMap(([key, value]) => {
      const qualifiedKey = prefix ? `${prefix}.${key}` : key;
      return value.type === 'string' ? [qualifiedKey] : collectSchemaMessageKeys(value, qualifiedKey);
    })
    .sort();

const expectEverySchemaPropertyRequired = (schema: MessageSchema) => {
  const properties = schema.properties ?? {};

  expect([...(schema.required ?? [])].sort()).toEqual(Object.keys(properties).sort());

  for (const propertySchema of Object.values(properties)) {
    if (propertySchema.type === 'object') {
      expectEverySchemaPropertyRequired(propertySchema);
    }
  }
};

describe('application message resources', () => {
  test('validates every locale against the shared JSON Schema', () => {
    const validateMessages = new Ajv2020({ allErrors: true }).compile(messageSchema);

    for (const [locale, resource] of Object.entries(localeResources)) {
      if (!validateMessages(resource)) {
        throw new Error(`${locale} messages failed schema validation: ${JSON.stringify(validateMessages.errors)}`);
      }
    }
  });

  test('keeps schema, canonical English, and Simplified Chinese keys aligned', () => {
    const schemaKeys = collectSchemaMessageKeys(messageSchema);
    const canonicalKeys = collectMessageKeys(enUSMessages);

    expectEverySchemaPropertyRequired(messageSchema);
    expect(canonicalKeys).toEqual(schemaKeys);
    expect(collectMessageKeys(zhCNMessages)).toEqual(canonicalKeys);
  });
});
