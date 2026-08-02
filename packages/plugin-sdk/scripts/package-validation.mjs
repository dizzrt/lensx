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
    diagnostics.push('The SDK package must expose only its root entry.');
  }
  if (Object.keys(dependencies).join('\0') !== '@lensx/plugin-contract') {
    diagnostics.push('The SDK must publish Plugin Contract as its only Runtime dependency.');
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
  ]) {
    if (declarations.includes(forbidden)) {
      diagnostics.push(`Forbidden public declaration reference: ${forbidden}.`);
    }
  }

  return diagnostics.sort();
};
