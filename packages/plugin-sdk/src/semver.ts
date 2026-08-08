import { PLUGIN_HOST_API_VERSION } from '@lensx/plugin-contract';

interface ParsedSemVer {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly prerelease: readonly (number | string)[];
}

const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;

export const parseSemVer = (value: string): ParsedSemVer | undefined => {
  const match = SEMVER_PATTERN.exec(value);
  if (match === null) {
    return undefined;
  }
  const [, major, minor, patch, prerelease] = match;
  if (major === undefined || minor === undefined || patch === undefined) {
    return undefined;
  }
  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    prerelease:
      prerelease === undefined
        ? []
        : prerelease.split('.').map((identifier) => (/^\d+$/u.test(identifier) ? Number(identifier) : identifier)),
  };
};

const compareIdentifier = (left: number | string, right: number | string): number => {
  if (left === right) {
    return 0;
  }
  if (typeof left === 'number' && typeof right === 'string') {
    return -1;
  }
  if (typeof left === 'string' && typeof right === 'number') {
    return 1;
  }
  return left < right ? -1 : 1;
};

export const compareSemVer = (left: ParsedSemVer, right: ParsedSemVer): number => {
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (left[key] !== right[key]) {
      return left[key] < right[key] ? -1 : 1;
    }
  }
  if (left.prerelease.length === 0 || right.prerelease.length === 0) {
    return left.prerelease.length === right.prerelease.length ? 0 : left.prerelease.length === 0 ? 1 : -1;
  }
  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftIdentifier = left.prerelease[index];
    const rightIdentifier = right.prerelease[index];
    if (leftIdentifier === undefined || rightIdentifier === undefined) {
      return leftIdentifier === rightIdentifier ? 0 : leftIdentifier === undefined ? -1 : 1;
    }
    const comparison = compareIdentifier(leftIdentifier, rightIdentifier);
    if (comparison !== 0) {
      return comparison;
    }
  }
  return 0;
};

const minimumHostApiVersion = parseSemVer(PLUGIN_HOST_API_VERSION);
const maximumHostApiVersion = parseSemVer('0.3.0');

if (minimumHostApiVersion === undefined || maximumHostApiVersion === undefined) {
  throw new Error('The SDK Host API compatibility boundary is invalid.');
}

export const isSupportedHostApiVersion = (value: string): boolean => {
  const parsed = parseSemVer(value);
  return (
    parsed !== undefined &&
    compareSemVer(parsed, minimumHostApiVersion) >= 0 &&
    compareSemVer(parsed, maximumHostApiVersion) < 0
  );
};
