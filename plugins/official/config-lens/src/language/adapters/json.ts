import {
  diagnostic,
  invalidResult,
  type LanguageAdapter,
  type LanguageRequest,
  type LanguageResult,
  validResult,
} from '../protocol.js';

type JsonTokenKind = 'punctuation' | 'string' | 'number' | 'literal';
interface JsonToken {
  readonly kind: JsonTokenKind;
  readonly raw: string;
  readonly start: number;
  readonly end: number;
}

class JsonSyntaxError extends Error {
  readonly offset: number;
  readonly length: number;

  constructor(offset: number, length = 1) {
    super('Invalid JSON');
    this.offset = offset;
    this.length = length;
  }
}

const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/uy;
const isWhitespace = (character: string): boolean =>
  character === ' ' || character === '\t' || character === '\n' || character === '\r';

const scanJson = (source: string): JsonToken[] => {
  const tokens: JsonToken[] = [];
  let index = 0;
  while (index < source.length) {
    const character = source[index] ?? '';
    if (isWhitespace(character)) {
      index += 1;
      continue;
    }
    if ('{}[],:'.includes(character)) {
      tokens.push({ kind: 'punctuation', raw: character, start: index, end: index + 1 });
      index += 1;
      continue;
    }
    if (character === '"') {
      const start = index;
      index += 1;
      let closed = false;
      while (index < source.length) {
        const code = source.charCodeAt(index);
        if (code === 34) {
          index += 1;
          closed = true;
          break;
        }
        if (code < 0x20) throw new JsonSyntaxError(index);
        if (code === 92) {
          const escaped = source[index + 1];
          if (escaped === undefined || !'"\\/bfnrtu'.includes(escaped)) throw new JsonSyntaxError(index, 2);
          if (escaped === 'u') {
            const digits = source.slice(index + 2, index + 6);
            if (!/^[0-9a-fA-F]{4}$/u.test(digits)) throw new JsonSyntaxError(index, Math.min(6, source.length - index));
            index += 6;
          } else {
            index += 2;
          }
          continue;
        }
        index += 1;
      }
      if (!closed) throw new JsonSyntaxError(start, source.length - start);
      tokens.push({ kind: 'string', raw: source.slice(start, index), start, end: index });
      continue;
    }
    NUMBER.lastIndex = index;
    const number = NUMBER.exec(source);
    if (number !== null) {
      const raw = number[0];
      const end = index + raw.length;
      const following = source[end];
      if (following !== undefined && /[.0-9A-Za-z_+-]/u.test(following))
        throw new JsonSyntaxError(index, raw.length + 1);
      tokens.push({ kind: 'number', raw, start: index, end });
      index = end;
      continue;
    }
    const literal = ['true', 'false', 'null'].find((candidate) => source.startsWith(candidate, index));
    if (literal !== undefined) {
      tokens.push({ kind: 'literal', raw: literal, start: index, end: index + literal.length });
      index += literal.length;
      continue;
    }
    throw new JsonSyntaxError(index);
  }
  return tokens;
};

const parseTokens = (tokens: readonly JsonToken[]): void => {
  let cursor = 0;
  const take = (raw?: string): JsonToken => {
    const token = tokens[cursor];
    if (token === undefined || (raw !== undefined && token.raw !== raw)) {
      throw new JsonSyntaxError(
        token?.start ?? tokens.at(-1)?.end ?? 0,
        token === undefined ? 0 : token.end - token.start,
      );
    }
    cursor += 1;
    return token;
  };
  const value = (depth: number): void => {
    if (depth > 512) throw new JsonSyntaxError(tokens[cursor]?.start ?? 0);
    const token = tokens[cursor];
    if (token === undefined) throw new JsonSyntaxError(tokens.at(-1)?.end ?? 0, 0);
    if (token.kind === 'string' || token.kind === 'number' || token.kind === 'literal') {
      cursor += 1;
      return;
    }
    if (token.raw === '[') {
      take('[');
      if (tokens[cursor]?.raw !== ']') {
        value(depth + 1);
        while (tokens[cursor]?.raw === ',') {
          take(',');
          value(depth + 1);
        }
      }
      take(']');
      return;
    }
    if (token.raw === '{') {
      take('{');
      if (tokens[cursor]?.raw !== '}') {
        const firstKey = take();
        if (firstKey.kind !== 'string') throw new JsonSyntaxError(firstKey.start, firstKey.end - firstKey.start);
        take(':');
        value(depth + 1);
        while (tokens[cursor]?.raw === ',') {
          take(',');
          const key = take();
          if (key.kind !== 'string') throw new JsonSyntaxError(key.start, key.end - key.start);
          take(':');
          value(depth + 1);
        }
      }
      take('}');
      return;
    }
    throw new JsonSyntaxError(token.start, token.end - token.start);
  };
  value(0);
  if (cursor !== tokens.length) {
    const token = tokens[cursor];
    throw new JsonSyntaxError(token?.start ?? 0, token === undefined ? 0 : token.end - token.start);
  }
};

const formatTokens = (tokens: readonly JsonToken[], compact: boolean): string => {
  if (compact) return tokens.map(({ raw }) => raw).join('');
  let output = '';
  let depth = 0;
  const indent = () => '  '.repeat(depth);
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === undefined) continue;
    const next = tokens[index + 1];
    if (token.raw === '{' || token.raw === '[') {
      output += token.raw;
      if (next !== undefined && !((token.raw === '{' && next.raw === '}') || (token.raw === '[' && next.raw === ']'))) {
        depth += 1;
        output += `\n${indent()}`;
      }
    } else if (token.raw === '}' || token.raw === ']') {
      const previous = tokens[index - 1];
      if (
        previous !== undefined &&
        !((token.raw === '}' && previous.raw === '{') || (token.raw === ']' && previous.raw === '['))
      ) {
        depth = Math.max(0, depth - 1);
        output += `\n${indent()}`;
      }
      output += token.raw;
    } else if (token.raw === ',') {
      output += `,\n${indent()}`;
    } else if (token.raw === ':') {
      output += ': ';
    } else {
      output += token.raw;
    }
  }
  return `${output}\n`;
};

export const runJson = (request: LanguageRequest): LanguageResult => {
  try {
    const tokens = scanJson(request.source);
    parseTokens(tokens);
    if (request.operation === 'validate') return validResult(request.requestId);
    const output = formatTokens(tokens, request.operation === 'compact');
    const outputTokens = scanJson(output);
    parseTokens(outputTokens);
    if (JSON.stringify(tokens.map(({ raw }) => raw)) !== JSON.stringify(outputTokens.map(({ raw }) => raw))) {
      return invalidResult(
        request.requestId,
        diagnostic('json.fidelity', 'diagnostic.fidelityRejected'),
        'internal-error',
      );
    }
    return validResult(request.requestId, output);
  } catch (error) {
    const syntax = error instanceof JsonSyntaxError ? error : new JsonSyntaxError(0, 0);
    return invalidResult(
      request.requestId,
      diagnostic('json.syntax', 'diagnostic.jsonSyntax', syntax.offset, syntax.length),
    );
  }
};

export const jsonAdapter: LanguageAdapter = { language: 'json', run: runJson };
