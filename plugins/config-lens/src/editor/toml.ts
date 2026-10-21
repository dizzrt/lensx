import type { languages } from 'monaco-editor';

export const conf: languages.LanguageConfiguration = {
  comments: { lineComment: '#' },
  brackets: [
    ['{', '}'],
    ['[', ']'],
  ],
  autoClosingPairs: [
    { open: '{', close: '}', notIn: ['string', 'comment'] },
    { open: '[', close: ']', notIn: ['string', 'comment'] },
    { open: '"', close: '"', notIn: ['string', 'comment'] },
    { open: "'", close: "'", notIn: ['string', 'comment'] },
  ],
};

// Lexical coloring only. TOML 1.0 validity and fidelity remain Worker-owned.
export const language: languages.IMonarchLanguage = {
  defaultToken: '',
  tokenPostfix: '.toml',
  escapes: /\\(?:[btnfr"\\]|u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8})/,
  tokenizer: {
    root: [
      [/^(\s*)(\[\[?)([^\]]*)(\]\]?)/, ['', 'delimiter', 'type', 'delimiter']],
      [/#.*$/, 'comment'],
      [/(?:[\w-]+|"(?:[^"\\]|\\.)*"|'[^']*')(?=\s*[.=])/, 'key'],
      [/"""/, 'string', '@basicMultiline'],
      [/'''/, 'string', '@literalMultiline'],
      [/"$/, 'string.invalid'],
      [/"/, 'string', '@basicString'],
      [/'[^']*'/, 'string'],
      [/'[^']*$/, 'string.invalid'],
      [/\d{4}-\d{2}-\d{2}(?:[Tt ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})?)?/, 'number.date'],
      [/\d{2}:\d{2}:\d{2}(?:\.\d+)?/, 'number.date'],
      [/\b(?:true|false)\b/, 'keyword'],
      [/[+-]?(?:inf|nan)\b/, 'number'],
      [/0[xob][\da-fA-F_]+/, 'number'],
      [/[+-]?\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d[\d_]*)?/, 'number'],
      [/[{}[\],.=]/, 'delimiter'],
      [/\s+/, ''],
    ],
    basicString: [
      [/[^"\\]+$/, 'string.invalid', '@pop'],
      [/[^"\\]+/, 'string'],
      [/@escapes/, 'string.escape'],
      [/\\$/, 'string.invalid', '@pop'],
      [/\\./, 'string.escape.invalid'],
      [/"/, 'string', '@pop'],
    ],
    basicMultiline: [
      [/"""/, 'string', '@pop'],
      [/(?:[^"\\]|"(?!""))+/, 'string'],
      [/@escapes/, 'string.escape'],
      [/\\\s*$/, 'string.escape'],
      [/\\./, 'string.escape.invalid'],
    ],
    literalMultiline: [
      [/'''/, 'string', '@pop'],
      [/(?:[^']|'(?!''))+/, 'string'],
    ],
  },
};
