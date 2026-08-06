import { ContentChecksum, compress, createDecompressStream } from '@structured-world/structured-zstd';

import { PLUGIN_PACKAGE_LIMITS, PLUGIN_PACKAGE_ZSTD_LEVEL } from './constants.js';
import { packageDiagnostic } from './diagnostics.js';
import { type CanonicalTarInspection, CanonicalTarStreamInspector } from './tar.js';
import type { PluginPackageDiagnostic } from './types.js';

const ZSTD_MAGIC = 0xfd2fb528;
const ZSTD_SKIPPABLE_MAGIC_MIN = 0x184d2a50;
const ZSTD_SKIPPABLE_MAGIC_MAX = 0x184d2a5f;

const readLittleEndian = (bytes: Uint8Array, offset: number, length: number): number | undefined => {
  if (offset + length > bytes.byteLength || length > 6) return undefined;
  let value = 0;
  for (let index = 0; index < length; index += 1) value += (bytes[offset + index] ?? 0) * 2 ** (8 * index);
  return Number.isSafeInteger(value) ? value : undefined;
};

const scanZstandardFrame = (
  bytes: Uint8Array,
): { readonly contentSize?: number; readonly diagnostics: readonly PluginPackageDiagnostic[] } => {
  if (bytes.byteLength > PLUGIN_PACKAGE_LIMITS.compressedBytes) {
    return { diagnostics: [packageDiagnostic('compressed_size_exceeded', '/frame')] };
  }
  const magic = readLittleEndian(bytes, 0, 4);
  if (magic === undefined || (magic >= ZSTD_SKIPPABLE_MAGIC_MIN && magic <= ZSTD_SKIPPABLE_MAGIC_MAX)) {
    return { diagnostics: [packageDiagnostic('frame_invalid', '/frame')] };
  }
  if (magic !== ZSTD_MAGIC || bytes.byteLength < 6) {
    return { diagnostics: [packageDiagnostic('frame_invalid', '/frame')] };
  }
  const descriptor = bytes[4] ?? 0;
  if ((descriptor & 0x18) !== 0) return { diagnostics: [packageDiagnostic('frame_invalid', '/frame')] };
  const contentSizeFlag = descriptor >>> 6;
  const singleSegment = (descriptor & 0x20) !== 0;
  const checksum = (descriptor & 0x04) !== 0;
  const dictionaryFlag = descriptor & 0x03;
  let offset = 5;
  let windowSize: number | undefined;
  if (!singleSegment) {
    const windowDescriptor = bytes[offset];
    if (windowDescriptor === undefined) return { diagnostics: [packageDiagnostic('frame_invalid', '/frame')] };
    offset += 1;
    const exponent = windowDescriptor >>> 3;
    const mantissa = windowDescriptor & 0x07;
    const base = 2 ** (10 + exponent);
    windowSize = base + (base / 8) * mantissa;
  }
  const dictionaryBytes = [0, 1, 2, 4][dictionaryFlag] ?? 0;
  const dictionaryId = readLittleEndian(bytes, offset, dictionaryBytes) ?? 0;
  offset += dictionaryBytes;
  if (dictionaryId !== 0) {
    return { diagnostics: [packageDiagnostic('frame_dictionary_forbidden', '/frame')] };
  }
  const contentSizeBytes = contentSizeFlag === 0 ? (singleSegment ? 1 : 0) : ([0, 2, 4, 8][contentSizeFlag] ?? 0);
  if (contentSizeBytes === 0 || contentSizeBytes > 6) {
    return { diagnostics: [packageDiagnostic('frame_content_size_invalid', '/frame')] };
  }
  let contentSize = readLittleEndian(bytes, offset, contentSizeBytes);
  if (contentSize === undefined) {
    return { diagnostics: [packageDiagnostic('frame_content_size_invalid', '/frame')] };
  }
  if (contentSizeBytes === 2) contentSize += 256;
  offset += contentSizeBytes;
  if (singleSegment) windowSize = contentSize;
  if (contentSize > PLUGIN_PACKAGE_LIMITS.tarBytes) {
    return { diagnostics: [packageDiagnostic('frame_content_size_invalid', '/frame')] };
  }
  if ((windowSize ?? 0) > PLUGIN_PACKAGE_LIMITS.zstdWindowBytes) {
    return { diagnostics: [packageDiagnostic('frame_window_exceeded', '/frame')] };
  }
  if (!checksum) return { diagnostics: [packageDiagnostic('frame_checksum_required', '/frame')] };

  let lastBlock = false;
  while (!lastBlock) {
    const blockHeader = readLittleEndian(bytes, offset, 3);
    if (blockHeader === undefined) return { diagnostics: [packageDiagnostic('frame_invalid', '/frame')] };
    offset += 3;
    lastBlock = (blockHeader & 1) !== 0;
    const blockType = (blockHeader >>> 1) & 0x03;
    const blockSize = blockHeader >>> 3;
    if (blockType === 3) return { diagnostics: [packageDiagnostic('frame_invalid', '/frame')] };
    offset += blockType === 1 ? 1 : blockSize;
    if (offset > bytes.byteLength) return { diagnostics: [packageDiagnostic('frame_invalid', '/frame')] };
  }
  offset += 4;
  if (offset !== bytes.byteLength) {
    const nextMagic = readLittleEndian(bytes, offset, 4);
    return {
      diagnostics: [
        packageDiagnostic(nextMagic === ZSTD_MAGIC ? 'frame_multiple_forbidden' : 'frame_trailing_bytes', '/frame'),
      ],
    };
  }
  return { contentSize, diagnostics: [] };
};

export const compressCanonicalTar = async (tarBytes: Uint8Array): Promise<Uint8Array> =>
  compress(tarBytes, PLUGIN_PACKAGE_ZSTD_LEVEL, true);

export const inspectZstandardTar = async (
  packageBytes: Uint8Array,
): Promise<
  | { readonly inspection: CanonicalTarInspection; readonly diagnostics: readonly [] }
  | { readonly diagnostics: readonly PluginPackageDiagnostic[] }
> => {
  const frame = scanZstandardFrame(packageBytes);
  if (frame.diagnostics.length > 0) return { diagnostics: frame.diagnostics };
  const tarInspector = new CanonicalTarStreamInspector();
  let stream: Awaited<ReturnType<typeof createDecompressStream>> | undefined;
  try {
    stream = await createDecompressStream(ContentChecksum.Verify);
    const chunkBytes = 64 * 1024;
    for (let offset = 0; offset < packageBytes.byteLength; offset += chunkBytes) {
      tarInspector.push(stream.push(packageBytes.subarray(offset, offset + chunkBytes)));
    }
    tarInspector.push(stream.finish());
  } catch {
    return { diagnostics: [packageDiagnostic('frame_corrupt', '/frame')] };
  } finally {
    stream?.free();
  }
  const inspection = tarInspector.finish();
  if (inspection.decompressedSize !== frame.contentSize) {
    return { diagnostics: [packageDiagnostic('frame_content_size_invalid', '/frame')] };
  }
  return { inspection, diagnostics: [] };
};
