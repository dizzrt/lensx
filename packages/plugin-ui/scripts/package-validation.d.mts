interface PackedPackageMetadata {
  readonly dependencies?: Record<string, string>;
  readonly exports?: Record<string, unknown>;
  readonly peerDependencies?: Record<string, string>;
  readonly private?: boolean;
  readonly sideEffects?: readonly string[];
}

export const PUBLIC_STYLE_TOKENS: readonly string[];

export function validatePackedPackage(input: {
  readonly declarationSources: readonly string[];
  readonly files: readonly string[];
  readonly metadata: PackedPackageMetadata;
  readonly rootDeclaration: string;
  readonly runtimeImports: readonly string[];
  readonly styles: string;
}): string[];
