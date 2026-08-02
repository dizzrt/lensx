export interface PackedPackageMetadata {
  readonly private?: boolean;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
  readonly optionalDependencies?: Readonly<Record<string, string>>;
  readonly exports?: Readonly<Record<string, unknown>>;
}

export function validatePackedPackage(input: {
  readonly metadata: PackedPackageMetadata;
  readonly files: readonly string[];
  readonly runtimeImports: readonly string[];
}): string[];
