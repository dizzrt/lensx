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

export const validatePackedPackage = ({ declarationSources, files, metadata, runtimeImports }) => {
  const diagnostics = [];
  const fileSet = new Set(files);
  const dependencies = metadata.dependencies ?? {};

  if (metadata.private === true) {
    diagnostics.push('The public package must not be private.');
  }
  if (Object.keys(metadata.exports ?? {}).join('\0') !== '.') {
    diagnostics.push('The Testkit package must expose only its root entry.');
  }
  if (Object.keys(dependencies).sort().join('\0') !== '@lensx/plugin-contract\0@lensx/plugin-sdk') {
    diagnostics.push('The Testkit must publish Plugin Contract and Plugin SDK as its only Runtime dependencies.');
  }
  if (Object.values(dependencies).some((version) => String(version).startsWith('workspace:'))) {
    diagnostics.push('Published dependencies must not contain workspace: ranges.');
  }

  for (const target of exportTargets(metadata.exports)) {
    const path = target.replace(/^\.\//u, '');
    if (!fileSet.has(path)) {
      diagnostics.push(`Export target is missing from the tarball: ${path}.`);
    }
  }
  for (const required of ['LICENSE', 'README.md', 'package.json']) {
    if (!fileSet.has(required)) {
      diagnostics.push(`Required package file is missing from the tarball: ${required}.`);
    }
  }
  for (const path of files) {
    if (
      /(^|\/)(tests?|fixtures?|scripts?)(\/|$)/u.test(path) ||
      path.startsWith('src/') ||
      path.includes('src/app/') ||
      (path.endsWith('.ts') && !path.endsWith('.d.ts'))
    ) {
      diagnostics.push(`Private or development file leaked into the tarball: ${path}.`);
    }
  }
  for (const specifier of runtimeImports) {
    const packageName = packageNameFromSpecifier(specifier);
    if (!Object.hasOwn(dependencies, packageName)) {
      diagnostics.push(`Runtime import ${specifier} is not declared in dependencies.`);
    }
    if (specifier !== '@lensx/plugin-contract' && specifier !== '@lensx/plugin-sdk') {
      diagnostics.push(`The semantic Testkit must not import a container-specific entry: ${specifier}.`);
    }
  }

  const declarations = declarationSources.join('\n');
  for (const forbidden of [
    'src/app/',
    '@tauri-apps/',
    '@douyinfe/semi-ui',
    "from 'react'",
    'AbortSignal',
    'MessagePort',
    'Window',
    'postMessage',
    'node:fs',
    'requestId',
    'nonce',
    'pluginIdentity',
    'PluginChildWebview',
    'PluginWebviewBridge',
    '__LENSX_PLUGIN_WEBVIEW_BRIDGE__',
    'bridge_contract_version',
    'source_label',
    'native_handle',
    'data_store_identifier',
    'entry_url',
    '@rstest/',
    'vitest',
  ]) {
    if (declarations.includes(forbidden)) {
      diagnostics.push(`Forbidden public declaration reference: ${forbidden}.`);
    }
  }

  return diagnostics.sort();
};
