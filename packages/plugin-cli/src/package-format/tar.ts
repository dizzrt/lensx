import { createHash, type Hash } from 'node:crypto';

import { PLUGIN_PACKAGE_CHECKSUMS_PATH, PLUGIN_PACKAGE_LIMITS, PLUGIN_PACKAGE_MANIFEST_PATH } from './constants.js';
import { packageDiagnostic, sortPackageDiagnostics } from './diagnostics.js';
import { comparePathBytes, validatePathCollection, validatePortablePackagePath } from './path.js';
import type { PluginPackageDiagnostic, PluginPackageFileFact } from './types.js';

const TAR_BLOCK_BYTES = 512;

const writeOctal = (header: Buffer, offset: number, length: number, value: number): void => {
  const digits = value.toString(8).padStart(length - 1, '0');
  header.write(digits, offset, length - 1, 'ascii');
  header[offset + length - 1] = 0;
};

export const createCanonicalTarHeader = (path: string, size: number): Buffer => {
  const header = Buffer.alloc(TAR_BLOCK_BYTES);
  Buffer.from(path, 'utf8').copy(header, 0);
  writeOctal(header, 100, 8, 0o644);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  header[156] = 0x30;
  header.write('ustar\0', 257, 6, 'ascii');
  header.write('00', 263, 2, 'ascii');
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  const checksumDigits = checksum.toString(8).padStart(6, '0');
  header.write(checksumDigits, 148, 6, 'ascii');
  header[154] = 0;
  header[155] = 0x20;
  return header;
};

const canonicalTarOrder = <T extends { readonly path: string }>(files: readonly T[]): T[] => {
  const byPath = new Map(files.map((file) => [file.path, file]));
  const manifest = byPath.get(PLUGIN_PACKAGE_MANIFEST_PATH);
  const checksums = byPath.get(PLUGIN_PACKAGE_CHECKSUMS_PATH);
  if (manifest === undefined || checksums === undefined) return [...files];
  byPath.delete(PLUGIN_PACKAGE_MANIFEST_PATH);
  byPath.delete(PLUGIN_PACKAGE_CHECKSUMS_PATH);
  return [manifest, checksums, ...[...byPath.values()].sort((left, right) => comparePathBytes(left.path, right.path))];
};

export const createCanonicalTar = (
  files: readonly { readonly path: string; readonly bytes: Uint8Array }[],
): Uint8Array => {
  const blocks: Buffer[] = [];
  for (const file of canonicalTarOrder(files)) {
    blocks.push(createCanonicalTarHeader(file.path, file.bytes.byteLength));
    blocks.push(Buffer.from(file.bytes));
    const padding = (TAR_BLOCK_BYTES - (file.bytes.byteLength % TAR_BLOCK_BYTES)) % TAR_BLOCK_BYTES;
    if (padding > 0) blocks.push(Buffer.alloc(padding));
  }
  blocks.push(Buffer.alloc(TAR_BLOCK_BYTES * 2));
  return Buffer.concat(blocks);
};

const parseNulTerminatedUtf8 = (field: Uint8Array): string | undefined => {
  const nul = field.indexOf(0);
  const used = nul === -1 ? field : field.subarray(0, nul);
  if (nul !== -1 && field.subarray(nul).some((byte) => byte !== 0)) return undefined;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(used);
  } catch {
    return undefined;
  }
};

const parseOctal = (field: Uint8Array): number | undefined => {
  const text = Buffer.from(field)
    .toString('ascii')
    .replace(/[\0 ]+$/u, '');
  if (!/^[0-7]+$/u.test(text)) return undefined;
  const value = Number.parseInt(text, 8);
  return Number.isSafeInteger(value) ? value : undefined;
};

interface CurrentTarFile {
  path: string;
  size: number;
  remaining: number;
  paddingRemaining: number;
  hash: Hash;
  metadataChunks?: Buffer[];
  finalized: boolean;
}

export interface CanonicalTarInspection {
  readonly files: readonly PluginPackageFileFact[];
  readonly manifestBytes?: Uint8Array;
  readonly checksumsBytes?: Uint8Array;
  readonly decompressedSize: number;
  readonly diagnostics: readonly PluginPackageDiagnostic[];
}

export class CanonicalTarStreamInspector {
  private pending = Buffer.alloc(0);
  private current: CurrentTarFile | undefined;
  private readonly files: PluginPackageFileFact[] = [];
  private readonly diagnostics: PluginPackageDiagnostic[] = [];
  private readonly paths: string[] = [];
  private zeroBlocks = 0;
  private ended = false;
  private failed = false;
  private decompressedSize = 0;
  private manifestBytes: Uint8Array | undefined;
  private checksumsBytes: Uint8Array | undefined;

  push(chunk: Uint8Array): void {
    if (this.failed || chunk.byteLength === 0) return;
    this.decompressedSize += chunk.byteLength;
    if (this.decompressedSize > PLUGIN_PACKAGE_LIMITS.tarBytes) {
      this.diagnostics.push(packageDiagnostic('tar_size_exceeded', '/archive'));
      this.failed = true;
      return;
    }
    this.pending = Buffer.concat([this.pending, Buffer.from(chunk)]);
    this.process();
  }

  private consume(length: number): Buffer {
    const value = this.pending.subarray(0, length);
    this.pending = this.pending.subarray(length);
    return value;
  }

  private process(): void {
    while (!this.failed) {
      if (this.ended) {
        if (this.pending.length > 0) {
          this.diagnostics.push(packageDiagnostic('archive_termination_invalid', '/archive'));
          this.failed = true;
        }
        return;
      }
      if (this.current !== undefined) {
        if (this.current.remaining > 0) {
          if (this.pending.length === 0) return;
          const length = Math.min(this.pending.length, this.current.remaining);
          const data = this.consume(length);
          this.current.hash.update(data);
          this.current.metadataChunks?.push(data);
          this.current.remaining -= length;
          if (this.current.remaining > 0) return;
        }
        if (!this.current.finalized) {
          const metadata =
            this.current.metadataChunks === undefined ? undefined : Buffer.concat(this.current.metadataChunks);
          if (this.current.path === PLUGIN_PACKAGE_MANIFEST_PATH) this.manifestBytes = metadata;
          if (this.current.path === PLUGIN_PACKAGE_CHECKSUMS_PATH) this.checksumsBytes = metadata;
          this.files.push({
            path: this.current.path,
            size: this.current.size,
            sha256: this.current.hash.digest('hex'),
            checksumCovered: this.current.path !== PLUGIN_PACKAGE_CHECKSUMS_PATH,
          });
          this.current.finalized = true;
        }
        if (this.current.paddingRemaining > 0) {
          if (this.pending.length < this.current.paddingRemaining) return;
          const padding = this.consume(this.current.paddingRemaining);
          if (padding.some((byte) => byte !== 0)) {
            this.diagnostics.push(packageDiagnostic('archive_metadata_invalid', this.current.path));
          }
        }
        this.current = undefined;
        continue;
      }
      if (this.pending.length < TAR_BLOCK_BYTES) return;
      const header = this.consume(TAR_BLOCK_BYTES);
      if (header.every((byte) => byte === 0)) {
        this.zeroBlocks += 1;
        if (this.zeroBlocks === 2) this.ended = true;
        continue;
      }
      if (this.zeroBlocks > 0) {
        this.diagnostics.push(packageDiagnostic('archive_termination_invalid', '/archive'));
        this.failed = true;
        return;
      }
      this.readHeader(header);
    }
  }

  private readHeader(header: Buffer): void {
    const path = parseNulTerminatedUtf8(header.subarray(0, 100));
    const size = parseOctal(header.subarray(124, 136));
    if (path === undefined || size === undefined) {
      this.diagnostics.push(packageDiagnostic('archive_header_invalid', '/archive'));
      this.failed = true;
      return;
    }
    this.paths.push(path);
    this.diagnostics.push(...validatePortablePackagePath(path));
    if (this.paths.length === 1 && path !== PLUGIN_PACKAGE_MANIFEST_PATH) {
      this.diagnostics.push(packageDiagnostic('archive_order_invalid', path));
    } else if (this.paths.length === 2 && path !== PLUGIN_PACKAGE_CHECKSUMS_PATH) {
      this.diagnostics.push(packageDiagnostic('archive_order_invalid', path));
    } else if (this.paths.length > 3 && comparePathBytes(this.paths.at(-2) ?? '', path) >= 0) {
      this.diagnostics.push(packageDiagnostic('archive_order_invalid', path));
    }
    if (this.paths.length > PLUGIN_PACKAGE_LIMITS.fileCount) {
      this.diagnostics.push(packageDiagnostic('file_count_exceeded', '/archive'));
      this.failed = true;
      return;
    }
    const fileLimit =
      path === PLUGIN_PACKAGE_MANIFEST_PATH
        ? PLUGIN_PACKAGE_LIMITS.manifestBytes
        : path === PLUGIN_PACKAGE_CHECKSUMS_PATH
          ? PLUGIN_PACKAGE_LIMITS.checksumsBytes
          : PLUGIN_PACKAGE_LIMITS.fileBytes;
    if (size > fileLimit) {
      this.diagnostics.push(
        packageDiagnostic(
          path === PLUGIN_PACKAGE_MANIFEST_PATH || path === PLUGIN_PACKAGE_CHECKSUMS_PATH
            ? 'metadata_size_exceeded'
            : 'file_size_exceeded',
          path,
        ),
      );
      this.failed = true;
      return;
    }
    if (!header.equals(createCanonicalTarHeader(path, size))) {
      this.diagnostics.push(packageDiagnostic('archive_metadata_invalid', path));
    }
    this.current = {
      path,
      size,
      remaining: size,
      paddingRemaining: (TAR_BLOCK_BYTES - (size % TAR_BLOCK_BYTES)) % TAR_BLOCK_BYTES,
      hash: createHash('sha256'),
      finalized: false,
      metadataChunks: path === PLUGIN_PACKAGE_MANIFEST_PATH || path === PLUGIN_PACKAGE_CHECKSUMS_PATH ? [] : undefined,
    };
  }

  finish(): CanonicalTarInspection {
    this.process();
    if (!this.failed && (!this.ended || this.pending.length !== 0 || this.current !== undefined)) {
      this.diagnostics.push(packageDiagnostic('archive_incomplete', '/archive'));
    }
    this.diagnostics.push(...validatePathCollection(this.paths));
    return {
      files: this.files,
      manifestBytes: this.manifestBytes,
      checksumsBytes: this.checksumsBytes,
      decompressedSize: this.decompressedSize,
      diagnostics: sortPackageDiagnostics(this.diagnostics),
    };
  }
}
