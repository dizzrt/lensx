import type { PluginRuntimeContext } from '@lensx/plugin-sdk';

import type { LanguageId, SafeDiagnostic } from './language/protocol.js';

const copy = {
  'en-US': {
    compact: 'Compact',
    diagnosticSummary: (count: number) => `${count} diagnostic${count === 1 ? '' : 's'}`,
    empty: 'Enter configuration text to begin.',
    format: 'Format',
    inputLabel: 'Editable configuration input',
    language: 'Language',
    loading: 'Connecting ConfigLens to lensX…',
    processing: 'Processing in a dedicated Worker…',
    ready: 'Input is valid.',
    retry: 'Retry',
    sdkError: 'ConfigLens could not connect to lensX. No content was sent.',
    title: 'ConfigLens',
    diagnostics: {
      compactUnsupported: 'Compact is available only for JSON.',
      fidelityRejected: 'The formatter result was rejected because protected content changed.',
      inputBytesLimit: 'Input exceeds the 2 MiB UTF-8 limit.',
      inputLinesLimit: 'Input exceeds the 100,000-line limit.',
      internalFailure: 'The operation failed safely. Retry to create fresh Worker state.',
      jsonSyntax: 'Invalid strict JSON syntax.',
      protocolFailure: 'The Worker returned an invalid bounded response.',
      timeout: 'The operation exceeded the five-second deadline.',
      tomlSyntax: 'Invalid TOML 1.0 syntax.',
      workerFailure: 'The language Worker stopped unexpectedly.',
      xmlExternalUnsupported: 'DTD, entity, XInclude, and external resolution are not supported.',
      xmlSyntax: 'Invalid XML 1.0 syntax.',
      yamlLimit: 'YAML alias or nesting limits were exceeded.',
      yamlSyntax: 'Invalid YAML 1.2 syntax.',
    },
  },
  'zh-CN': {
    compact: '压缩',
    diagnosticSummary: (count: number) => `${count} 条诊断`,
    empty: '输入配置文本以开始。',
    format: '格式化',
    inputLabel: '可编辑的配置输入',
    language: '语言',
    loading: '正在将 ConfigLens 连接到 lensX…',
    processing: '正在专用 Worker 中处理…',
    ready: '输入有效。',
    retry: '重试',
    sdkError: 'ConfigLens 无法连接到 lensX，未发送任何内容。',
    title: 'ConfigLens',
    diagnostics: {
      compactUnsupported: '仅 JSON 支持压缩。',
      fidelityRejected: '格式化结果改变了受保护内容，已拒绝该结果。',
      inputBytesLimit: '输入超过 2 MiB UTF-8 限制。',
      inputLinesLimit: '输入超过 100,000 行限制。',
      internalFailure: '操作已安全失败；重试将创建新的 Worker 状态。',
      jsonSyntax: '严格 JSON 语法无效。',
      protocolFailure: 'Worker 返回了无效的有界响应。',
      timeout: '操作超过五秒截止时间。',
      tomlSyntax: 'TOML 1.0 语法无效。',
      workerFailure: '语言 Worker 意外停止。',
      xmlExternalUnsupported: '不支持 DTD、实体、XInclude 和外部解析。',
      xmlSyntax: 'XML 1.0 语法无效。',
      yamlLimit: 'YAML alias 或嵌套超过限制。',
      yamlSyntax: 'YAML 1.2 语法无效。',
    },
  },
} as const;

export type ConfigLensMessages = (typeof copy)['en-US'];

export const messagesFor = (locale: PluginRuntimeContext['locale']): ConfigLensMessages =>
  (copy[locale] ?? copy['en-US']) as ConfigLensMessages;

const messageName = (key: SafeDiagnostic['messageKey']): keyof ConfigLensMessages['diagnostics'] => {
  const raw = key.startsWith('diagnostic.') ? key.slice('diagnostic.'.length) : 'internalFailure';
  return raw in copy['en-US'].diagnostics ? (raw as keyof ConfigLensMessages['diagnostics']) : 'internalFailure';
};

export const diagnosticMessage = (messages: ConfigLensMessages, diagnostic: SafeDiagnostic): string =>
  messages.diagnostics[messageName(diagnostic.messageKey)];

export const languageLabel = (language: LanguageId): string =>
  language === 'yaml' ? 'YAML 1.2' : language === 'toml' ? 'TOML 1.0' : language === 'xml' ? 'XML 1.0' : 'JSON';
