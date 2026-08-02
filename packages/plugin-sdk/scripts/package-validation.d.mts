interface PackedPackageMetadata {
  readonly dependencies?: Record<string, string>;
  readonly exports?: Record<string, unknown>;
  readonly private?: boolean;
}

export function validatePackedPackage(input: {
  readonly declarationSources: readonly string[];
  readonly files: readonly string[];
  readonly metadata: PackedPackageMetadata;
  readonly runtimeImports: readonly string[];
}): string[];
