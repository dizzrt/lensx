import { SaxesParser } from 'saxes';

import {
  diagnostic,
  invalidResult,
  type LanguageAdapter,
  type LanguageRequest,
  type LanguageResult,
  validResult,
} from '../protocol.js';

const UNSUPPORTED_XML = /<!DOCTYPE\b|<!ENTITY\b|<xi:include\b|\b(?:SYSTEM|PUBLIC)\s+["']/iu;
const TOKEN = /<\?xml[\s\S]*?\?>|<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<[^>]+>|[^<]+/gu;

const validateXml = (source: string): void => {
  const parser = new SaxesParser({ defaultXMLVersion: '1.0', forceXMLVersion: true, xmlns: true });
  parser.write(source).close();
};

const xmlInventory = (source: string): readonly string[] =>
  [...source.matchAll(TOKEN)].flatMap(([raw]) =>
    raw.startsWith('<') ? [raw] : raw.trim() === '' ? [] : [`text:${raw}`],
  );

const formatXml = (source: string): string => {
  const tokens = [...source.matchAll(TOKEN)].map(([raw]) => raw);
  if (tokens.some((token) => !token.startsWith('<') && token.trim() !== '')) return source;
  let depth = 0;
  const lines: string[] = [];
  for (const token of tokens) {
    if (!token.startsWith('<')) continue;
    const closing = /^<\//u.test(token);
    const selfClosing = /\/>$/u.test(token) || /^<\?|^<!/u.test(token);
    if (closing) depth = Math.max(0, depth - 1);
    lines.push(`${'  '.repeat(depth)}${token}`);
    if (!closing && !selfClosing) depth += 1;
  }
  return `${lines.join('\n')}\n`;
};

export const runXml = (request: LanguageRequest): LanguageResult => {
  if (request.operation === 'compact') {
    return invalidResult(
      request.requestId,
      diagnostic('xml.compact-unsupported', 'diagnostic.compactUnsupported'),
      'unsupported',
    );
  }
  if (UNSUPPORTED_XML.test(request.source)) {
    return invalidResult(
      request.requestId,
      diagnostic('xml.external-unsupported', 'diagnostic.xmlExternalUnsupported'),
      'unsupported',
    );
  }
  try {
    validateXml(request.source);
    if (request.operation === 'validate') return validResult(request.requestId);
    const output = formatXml(request.source);
    validateXml(output);
    if (JSON.stringify(xmlInventory(request.source)) !== JSON.stringify(xmlInventory(output))) {
      return invalidResult(
        request.requestId,
        diagnostic('xml.fidelity', 'diagnostic.fidelityRejected'),
        'internal-error',
      );
    }
    return validResult(request.requestId, output);
  } catch {
    return invalidResult(request.requestId, diagnostic('xml.syntax', 'diagnostic.xmlSyntax'));
  }
};

export const xmlAdapter: LanguageAdapter = { language: 'xml', run: runXml };
