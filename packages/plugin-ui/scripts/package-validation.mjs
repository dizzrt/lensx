const packageNameFromSpecifier = (specifier) =>
  specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];

const exportTargets = (exportsField) => {
  if (typeof exportsField === 'string') {
    return [exportsField];
  }
  if (exportsField === null || typeof exportsField !== 'object') {
    return [];
  }
  return Object.values(exportsField).flatMap((value) => exportTargets(value));
};

export const PUBLIC_STYLE_TOKENS = [
  '--lensx-plugin-color-background',
  '--lensx-plugin-color-surface',
  '--lensx-plugin-color-text',
  '--lensx-plugin-color-text-secondary',
  '--lensx-plugin-color-border',
  '--lensx-plugin-color-accent',
  '--lensx-plugin-color-danger',
  '--lensx-plugin-color-focus',
  '--lensx-plugin-radius-page',
  '--lensx-plugin-space-page',
];

export const validatePackedPackage = ({
  declarationSources,
  files,
  metadata,
  rootDeclaration,
  runtimeImports,
  styles,
}) => {
  const diagnostics = [];
  const fileSet = new Set(files);
  const dependencies = metadata.dependencies ?? {};
  const peerDependencies = metadata.peerDependencies ?? {};
  const runtimeOwners = { ...dependencies, ...peerDependencies };

  if (metadata.private === true) {
    diagnostics.push('The public package must not be private.');
  }
  if (Object.keys(metadata.exports ?? {}).join('\0') !== ['.', './styles.css'].join('\0')) {
    diagnostics.push('The UI package must expose only its root entry and ./styles.css.');
  }
  if (JSON.stringify(metadata.sideEffects) !== JSON.stringify(['./dist/styles.css'])) {
    diagnostics.push('The UI package must preserve only its published CSS as a side effect.');
  }
  if (Object.keys(dependencies).join('\0') !== '@douyinfe/semi-ui') {
    diagnostics.push('Semi Design must be the UI package only direct Runtime dependency.');
  }
  if (Object.keys(peerDependencies).join('\0') !== ['@lensx/plugin-sdk', 'react', 'react-dom'].join('\0')) {
    diagnostics.push('Plugin SDK, React, and React DOM must be the complete peer dependency set.');
  }
  if (
    [...Object.values(dependencies), ...Object.values(peerDependencies)].some((version) =>
      String(version).startsWith('workspace:'),
    )
  ) {
    diagnostics.push('Published Runtime and peer dependencies must not contain workspace: ranges.');
  }

  for (const target of exportTargets(metadata.exports)) {
    const path = target.replace(/^\.\//u, '');
    if (!fileSet.has(path)) {
      diagnostics.push(`Export target is missing from the tarball: ${path}.`);
    }
  }
  for (const path of files) {
    if (
      /(^|\/)(tests?|fixtures?|scripts?)(\/|$)/u.test(path) ||
      path.startsWith('src/') ||
      path.includes('src/app/') ||
      path.endsWith('.less') ||
      (path.endsWith('.ts') && !path.endsWith('.d.ts'))
    ) {
      diagnostics.push(`Private or development file leaked into the tarball: ${path}.`);
    }
  }
  for (const specifier of runtimeImports) {
    const packageName = packageNameFromSpecifier(specifier);
    if (!Object.hasOwn(runtimeOwners, packageName)) {
      diagnostics.push(`Runtime import ${specifier} is not declared in dependencies or peerDependencies.`);
    }
    if (specifier.startsWith('@lensx/plugin-sdk/')) {
      diagnostics.push(`Plugin UI must not import a container-specific SDK entry: ${specifier}.`);
    }
  }

  const declarations = declarationSources.join('\n');
  for (const forbidden of [
    'src/app/',
    '@tauri-apps/',
    'AppProviders',
    'AppLocaleContext',
    'AppThemeContext',
    'Launcher',
    'Window',
    'navigate',
    'ButtonProps',
    'InputProps',
    'TableProps',
    'FormProps',
    'ModalProps',
    'HTMLIFrameElement',
    'MessagePort',
    'postMessage',
    'PluginChildWebview',
    'PluginWebviewBridge',
    '__LENSX_PLUGIN_WEBVIEW_BRIDGE__',
    'createPluginWebviewTransport',
    'source_label',
    'native_handle',
    'entry_url',
  ]) {
    if (declarations.includes(forbidden)) {
      diagnostics.push(`Forbidden public declaration reference: ${forbidden}.`);
    }
  }
  for (const required of ['PluginUiProvider', 'PluginPage', 'PluginFeedback']) {
    if (!rootDeclaration.includes(required)) {
      diagnostics.push(`Missing public root declaration: ${required}.`);
    }
  }

  for (const token of PUBLIC_STYLE_TOKENS) {
    if (!styles.includes(`${token}:`)) {
      diagnostics.push(`Missing public style token: ${token}.`);
    }
  }
  for (const forbidden of ['src/styles/', 'src/app/', 'uno-', 'launcher-', '@unocss']) {
    if (styles.includes(forbidden)) {
      diagnostics.push(`Forbidden published style reference: ${forbidden}.`);
    }
  }
  if (!styles.includes('.semi-button') || !styles.includes('.lensx-plugin-page')) {
    diagnostics.push('Published styles must contain Semi base styles and Plugin UI component styles.');
  }

  return diagnostics.sort();
};
