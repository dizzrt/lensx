import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = (path: string): string => readFileSync(join(root, path), 'utf8');
const pairs = [
  ['docs/en/architecture/overview.md', 'docs/zh/architecture/overview.md'],
  ['docs/en/development/validation.md', 'docs/zh/development/validation.md'],
] as const;

for (const [index, [englishPath, chinesePath]] of pairs.entries()) {
  const english = read(englishPath);
  const chinese = read(chinesePath);
  const markers =
    index === 0
      ? ['LSUIElement=true', 'ActivationPolicy::Accessory', 'visibleOnAllWorkspaces', 'FullScreenAuxiliary']
      : ['LSUIElement', 'visibleOnAllWorkspaces', 'alwaysOnTop', 'skipTaskbar'];
  for (const marker of [...markers, 'Cmd+W', 'Cmd+Q']) {
    if (!english.includes(marker) || !chinese.includes(marker)) {
      throw new Error(`macOS Accessory documentation failed: ${marker} is not mirrored.`);
    }
  }
}

const englishOverview = read(pairs[0][0]);
const chineseOverview = read(pairs[0][1]);
for (const [path, source] of [
  [pairs[0][0], englishOverview],
  [pairs[0][1], chineseOverview],
] as const) {
  for (const marker of ['global-shortcut', 'RunEvent::Exit', 'multiple displays']) {
    const alternatives = marker === 'multiple displays' ? ['multiple displays', '多显示器'] : [marker];
    if (!alternatives.some((candidate) => source.includes(candidate))) {
      throw new Error(`macOS Accessory documentation failed: ${path} is missing ${marker}.`);
    }
  }
}

const englishValidation = read(pairs[1][0]);
const chineseValidation = read(pairs[1][1]);
for (const [path, source] of [
  [pairs[1][0], englishValidation],
  [pairs[1][1], chineseValidation],
] as const) {
  for (const marker of [
    'pnpm run check:macos-accessory-launcher',
    'pnpm run evidence:macos-accessory-launcher',
    'Launch Services',
    'Tauri/Tao/Wry',
    'source digest',
    'sacrifice',
    'macos_application_policy',
    'macos_window_collection',
    'bounded',
  ]) {
    const alternatives =
      marker === 'sacrifice' ? ['sacrifice', '牺牲'] : marker === 'bounded' ? ['bounded', '有界'] : [marker];
    if (!alternatives.some((candidate) => source.includes(candidate))) {
      throw new Error(`macOS Accessory documentation failed: ${path} is missing ${marker}.`);
    }
  }
  if (source.includes('.tmp/')) {
    throw new Error(`macOS Accessory documentation failed: ${path} cites temporary repository material.`);
  }
}

console.log('Verified bilingual macOS Accessory Launcher architecture and validation documentation.');
