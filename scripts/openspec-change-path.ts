const escapeRegularExpression = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

export const resolveOpenSpecChangeRoot = (changeName: string, paths: readonly string[]): string | undefined => {
  const activePath = `openspec/changes/${changeName}`;
  const archivePattern = new RegExp(
    `^openspec/changes/archive/\\d{4}-\\d{2}-\\d{2}-${escapeRegularExpression(changeName)}$`,
    'u',
  );
  const candidates = [...new Set(paths.map((path) => path.replace(/\/$/u, '')))];
  if (candidates.includes(activePath)) return activePath;
  return candidates
    .filter((path) => archivePattern.test(path))
    .sort()
    .at(-1);
};
