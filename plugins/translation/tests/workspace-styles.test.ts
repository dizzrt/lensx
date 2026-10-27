import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from '@rstest/core';

const styles = readFileSync(resolve(import.meta.dirname, '../src/styles.less'), 'utf8');
const declarations = (selector: string) => {
  const start = styles.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`Missing style rule: ${selector}`);
  return styles.slice(start, styles.indexOf('}', start));
};

// These finite source contracts complement the Less build. Happy DOM does not
// evaluate responsive geometry, paint, clipping or native WebView focus rings.
describe('Translation responsive style contracts', () => {
  test('declares one narrow column and two equal columns from the 720px breakpoint', () => {
    expect(declarations('&__texts')).toMatch(/display:\s*grid/u);
    expect(declarations('&__texts')).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/u);
    expect(declarations('&__texts')).toMatch(/gap:\s*16px/u);
    expect(styles).toMatch(
      /@media\s*\(min-width:\s*720px\)\s*\{\s*\.translation__texts\s*\{\s*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/u,
    );
  });

  test('declares page fallback scrolling, readable scrollable text and wrapping controls', () => {
    expect(declarations('.translation')).toMatch(/overflow:\s*auto/u);
    expect(declarations('.translation')).toMatch(/padding:\s*12px 16px 16px/u);
    expect(declarations('&__card')).toMatch(/min-width:\s*0/u);
    expect(declarations('&__card')).toMatch(/min-height:\s*0/u);
    expect(declarations('&__card')).toMatch(/border-radius:\s*14px/u);
    const text = declarations('&__card textarea');
    expect(text).toMatch(/min-height:\s*140px/u);
    expect(text).toMatch(/overflow:\s*auto/u);
    expect(text).toMatch(/overflow-wrap:\s*anywhere/u);
    expect(text).toMatch(/white-space:\s*pre-wrap/u);
    expect(text).toMatch(/font-size:\s*16px/u);
    expect(text).toMatch(/line-height:\s*1\.6/u);
    expect(declarations('&__languages, &__actions')).toMatch(/flex-wrap:\s*wrap/u);
    expect(declarations('&__settings')).toMatch(/flex:\s*none/u);
  });

  test('hides the retained workspace despite its authored flex display while settings is active', () => {
    expect(declarations('&__workspace')).toMatch(/display:\s*flex/u);
    expect(declarations('&__workspace[hidden]')).toMatch(/display:\s*none/u);
  });

  test('separates card and text surfaces without a blue textarea focus box', () => {
    expect(declarations('.translation')).toContain('var(--lensx-plugin-color-text)');
    expect(declarations('.translation')).toContain('var(--lensx-plugin-color-background)');
    expect(declarations('&__card')).toContain('var(--lensx-plugin-color-surface)');
    expect(declarations('&__card .semi-input-textarea-wrapper')).toContain('var(--semi-color-fill-0)');
    expect(declarations('&__card--output .semi-input-textarea-wrapper')).toContain(
      'var(--semi-color-primary-light-default)',
    );
    expect(declarations('&__card textarea:focus, &__card textarea:focus-visible')).toMatch(/outline:\s*none/u);
    expect(declarations('&__card .semi-input-textarea-wrapper')).toMatch(/box-shadow:\s*none/u);
    expect(styles).not.toMatch(/&__card:focus-within\s*>\s*label/u);
    expect(declarations('&__card > label')).not.toMatch(/text-decoration(?:-line)?:\s*underline/u);
    expect(declarations(':focus-visible:not(textarea)')).toContain('var(--lensx-plugin-color-focus)');
  });

  test('keeps routine live status outside visual layout without removing its semantics', () => {
    expect(declarations('&__sr-only')).toMatch(/position:\s*absolute/u);
    expect(declarations('&__sr-only')).toMatch(/clip-path:\s*inset\(50%\)/u);
    expect(declarations('&__sr-only')).toMatch(/overflow:\s*hidden/u);
    expect(declarations('&__sr-only')).not.toMatch(/display:\s*none|visibility:\s*hidden/u);
  });

  test('centers compact language pills with source and target theme treatments', () => {
    expect(declarations('&__toolbar')).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\) auto minmax\(0, 1fr\)/u);
    expect(declarations('&__language')).toMatch(/width:\s*144px/u);
    expect(declarations('&__language-select')).toMatch(/border-radius:\s*999px/u);
    expect(declarations('&__language-select--source')).toContain('var(--semi-color-primary)');
    expect(declarations('&__language-select--target')).toContain('var(--lensx-plugin-color-accent)');
  });
});
