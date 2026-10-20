import { readFileSync } from 'node:fs';
import { describe, expect, test } from '@rstest/core';

const styles = readFileSync(new URL('../src/styles/global.less', import.meta.url), 'utf8');
const rule = (selector: string) => styles.slice(styles.indexOf(`${selector} {`)).split('}')[0];

describe('Action tile geometry contract', () => {
  test('uses column width for a square without stretching grid rows', () => {
    expect(rule('.launcher-action-tile')).toContain('width: 100%');
    expect(rule('.launcher-action-tile')).toContain('aspect-ratio: 1');
    expect(rule('.launcher-action-tile')).toContain('min-height: 0');
    expect(rule('.launcher-action-tile')).toContain('align-self: start');
    for (const grid of ['.launcher-results', '.launcher-collection-track']) {
      expect(rule(grid)).toContain('align-items: start');
      expect(rule(grid)).toContain('align-content: start');
      expect(rule(grid)).not.toContain('grid-auto-rows');
    }
    expect(rule('.launcher-collection-track')).toContain('repeat(8, minmax(0, 1fr))');
  });

  test('fills the same boundary with one button and fixes icon and title line geometry', () => {
    expect(rule('.launcher-action-main.semi-button')).toContain('width: 100%');
    expect(rule('.launcher-action-main.semi-button')).toContain('height: 100%');
    expect(rule('.launcher-action-main.semi-button')).toContain('border-radius: 12px');
    expect(rule('.launcher-action-tile')).toContain('border-radius: 12px');
    expect(rule('.launcher-action-text')).toContain('height: 20px');
    expect(rule('.launcher-action-title')).toContain('line-height: 20px');
    expect(rule('.launcher-action-icon')).toContain('width: 28px');
    expect(rule('.launcher-action-icon')).toContain('height: 28px');
    expect(rule('.launcher-action-icon')).toContain('flex: none');
  });

  test('keeps one CSS ellipsis owner and an independent complete-text measurement box', () => {
    const title = rule('.launcher-action-title');
    expect(title).toContain('font-family: inherit');
    expect(rule('.launcher-action-main.semi-button')).toContain('font-family: inherit');
    expect(title).toContain('white-space: nowrap');
    expect(title).toContain('text-overflow: ellipsis');
    expect(title).toContain('overflow: hidden');
    const measure = rule('.launcher-action-title-measure');
    expect(measure).toContain('position: absolute');
    expect(measure).toContain('width: max-content');
    expect(measure).toContain('visibility: hidden');
    expect(measure).not.toContain('display: none');
  });

  test('bounds the body overlay to the viewport and wraps long words with theme tokens', () => {
    const tooltip = rule('.launcher-action-tooltip');
    expect(tooltip).toContain('max-width: min(360px, calc(100vw - 16px))');
    expect(tooltip).toContain('padding: 0');
    expect(tooltip).not.toContain('overflow-y: auto');
    const content = rule('.launcher-action-tooltip-content');
    expect(content).toContain('max-height: calc(100vh - 16px)');
    expect(content).toContain('overflow-y: auto');
    expect(content).toContain('padding: 8px 12px');
    expect(tooltip).toContain('overflow-wrap: anywhere');
    expect(tooltip).toContain('white-space: normal');
    expect(tooltip).toContain('var(--semi-color-bg-3)');
    expect(tooltip).toContain('var(--semi-color-text-0)');
  });
});
