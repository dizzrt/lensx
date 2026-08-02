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

export const validatePackedPackage = ({ metadata, files, runtimeImports }) => {
  const diagnostics = [];
  const fileSet = new Set(files);
  const dependencies = metadata.dependencies ?? {};
  const allDependencyVersions = [
    metadata.dependencies,
    metadata.devDependencies,
    metadata.peerDependencies,
    metadata.optionalDependencies,
  ].flatMap((section) => Object.values(section ?? {}));

  if (metadata.private === true) {
    diagnostics.push('The public package must not be private.');
  }
  if (allDependencyVersions.some((version) => String(version).startsWith('workspace:'))) {
    diagnostics.push('Published dependencies must not contain workspace: ranges.');
  }

  for (const subpath of ['.', './schema', './manifest.schema.json']) {
    if (!Object.hasOwn(metadata.exports ?? {}, subpath)) {
      diagnostics.push(`Missing public export ${subpath}.`);
    }
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

  return diagnostics.sort();
};
