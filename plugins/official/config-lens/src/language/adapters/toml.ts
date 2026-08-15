import { type AST, parseTOML } from 'toml-eslint-parser';

import {
  diagnostic,
  invalidResult,
  type LanguageAdapter,
  type LanguageRequest,
  type LanguageResult,
  validResult,
} from '../protocol.js';

interface TomlFacts {
  readonly tokenInventory: readonly string[];
  readonly commentInventory: readonly string[];
  readonly declarationInventory: readonly string[];
}

const parseToml = (source: string): TomlFacts => {
  const ast = parseTOML(source, { tomlVersion: '1.0' });
  const tokenInventory = ast.tokens.map((token) => source.slice(token.range[0], token.range[1]));
  const commentInventory = ast.comments.map((comment) => source.slice(comment.range[0], comment.range[1]));
  const declarationInventory: string[] = [];
  const visit = (node: AST.TOMLNode): void => {
    if (node.type === 'TOMLKeyValue') {
      declarationInventory.push(`key:${source.slice(node.key.range[0], node.key.range[1])}`);
    } else if (node.type === 'TOMLTable') {
      declarationInventory.push(`${node.kind}:${source.slice(node.key.range[0], node.key.range[1])}`);
    } else if (node.type === 'TOMLValue') {
      declarationInventory.push(`${node.kind}:${source.slice(node.range[0], node.range[1])}`);
    }
    const value = node as unknown as Record<string, unknown>;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'parent' || key === 'tokens' || key === 'comments') continue;
      if (Array.isArray(child)) {
        for (const item of child) {
          if (typeof item === 'object' && item !== null && 'type' in item) visit(item as AST.TOMLNode);
        }
      } else if (typeof child === 'object' && child !== null && 'type' in child) {
        visit(child as AST.TOMLNode);
      }
    }
  };
  visit(ast);
  return { tokenInventory, commentInventory, declarationInventory };
};

const findTomlBoundary = (line: string, target: '=' | '#'): number => {
  let quote: '"' | "'" | undefined;
  let escaped = false;
  let depth = 0;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quote !== undefined) {
      if (quote === '"' && escaped) escaped = false;
      else if (quote === '"' && character === '\\') escaped = true;
      else if (character === quote) quote = undefined;
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    else if (character === '[' || character === '{') depth += 1;
    else if (character === ']' || character === '}') depth = Math.max(0, depth - 1);
    else if (character === target && (target === '#' || depth === 0)) return index;
  }
  return -1;
};

const formatToml = (source: string): string => {
  let multiline: '"""' | "'''" | undefined;
  const lines = source.split(/\r?\n/u).map((line) => {
    const tripleCount = (token: '"""' | "'''") => line.split(token).length - 1;
    if (multiline !== undefined) {
      if (tripleCount(multiline) % 2 === 1) multiline = undefined;
      return line;
    }
    if (tripleCount('"""') % 2 === 1) multiline = '"""';
    else if (tripleCount("'''") % 2 === 1) multiline = "'''";
    if (multiline !== undefined) return line;
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) return line.trimEnd();
    if (/^\[\[?.*\]\]?$/u.test(trimmed)) return trimmed;
    const commentAt = findTomlBoundary(line, '#');
    const code = commentAt === -1 ? line : line.slice(0, commentAt);
    const comment = commentAt === -1 ? '' : line.slice(commentAt).trimEnd();
    const equalsAt = findTomlBoundary(code, '=');
    if (equalsAt === -1) return line.trimEnd();
    const formatted = `${code.slice(0, equalsAt).trim()} = ${code.slice(equalsAt + 1).trim()}`;
    return comment === '' ? formatted : `${formatted} ${comment}`;
  });
  return `${lines.join('\n').trimEnd()}\n`;
};

export const runToml = (request: LanguageRequest): LanguageResult => {
  if (request.operation === 'compact') {
    return invalidResult(
      request.requestId,
      diagnostic('toml.compact-unsupported', 'diagnostic.compactUnsupported'),
      'unsupported',
    );
  }
  try {
    const input = parseToml(request.source);
    if (request.operation === 'validate') return validResult(request.requestId);
    const output = formatToml(request.source);
    const reparsed = parseToml(output);
    if (
      JSON.stringify(input.tokenInventory) !== JSON.stringify(reparsed.tokenInventory) ||
      JSON.stringify(input.commentInventory) !== JSON.stringify(reparsed.commentInventory) ||
      JSON.stringify(input.declarationInventory) !== JSON.stringify(reparsed.declarationInventory)
    ) {
      return invalidResult(
        request.requestId,
        diagnostic('toml.fidelity', 'diagnostic.fidelityRejected'),
        'internal-error',
      );
    }
    return validResult(request.requestId, output);
  } catch (error) {
    const offset =
      typeof error === 'object' && error !== null && 'index' in error && typeof error.index === 'number'
        ? error.index
        : 0;
    return invalidResult(request.requestId, diagnostic('toml.syntax', 'diagnostic.tomlSyntax', offset, 1));
  }
};

export const tomlAdapter: LanguageAdapter = { language: 'toml', run: runToml };
