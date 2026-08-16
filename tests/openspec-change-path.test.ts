import { describe, expect, test } from '@rstest/core';

import { resolveOpenSpecChangeRoot } from '../scripts/openspec-change-path.ts';

describe('OpenSpec change lifecycle path resolution', () => {
  const changeName = 'reduce-plugin-cold-open-latency';
  const active = `openspec/changes/${changeName}`;
  const olderArchive = `openspec/changes/archive/2026-08-15-${changeName}`;
  const currentArchive = `openspec/changes/archive/2026-08-16-${changeName}`;

  test('prefers the active change while implementation is in progress', () => {
    expect(resolveOpenSpecChangeRoot(changeName, [currentArchive, active])).toBe(active);
  });

  test('selects the latest dated archive after archiving', () => {
    expect(resolveOpenSpecChangeRoot(changeName, [currentArchive, olderArchive])).toBe(currentArchive);
  });

  test('ignores unrelated and malformed archive paths', () => {
    expect(
      resolveOpenSpecChangeRoot(changeName, [
        'openspec/changes/archive/not-this-change',
        `openspec/changes/archive/not-a-date-${changeName}`,
      ]),
    ).toBeUndefined();
  });
});
