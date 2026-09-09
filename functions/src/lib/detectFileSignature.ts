/**
 * detectFileSignature.ts — SPEC-03 Wave D.4
 *
 * storage.rules' isImage()/isPdf() check `request.resource.contentType` —
 * a value the UPLOADING CLIENT sets on the request, not something Storage
 * independently verifies against the actual bytes. A caller can claim
 * `image/jpeg` while uploading anything at all (an executable, an HTML
 * file with an embedded script, a polyglot file) and pass that rule
 * cleanly — real "type by content, not extension/claimed header"
 * detection isn't possible in Security Rules at all, since rules only see
 * request metadata, never the file's actual bytes.
 *
 * This is the pure detection logic: given the first bytes of a file,
 * identify its real type from its magic-byte signature — the same
 * technique file(1)/libmagic use, restricted to the handful of formats
 * this app's user-facing upload paths actually need to accept.
 */

export type DetectedFileType = 'jpeg' | 'png' | 'webp' | 'gif' | 'pdf' | 'unknown';

function matches(buf: Uint8Array, offset: number, bytes: number[]): boolean {
  if (buf.length < offset + bytes.length) return false;
  for (let i = 0; i < bytes.length; i++) {
    if (buf[offset + i] !== bytes[i]) return false;
  }
  return true;
}

export function detectFileSignature(buf: Uint8Array): DetectedFileType {
  if (matches(buf, 0, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (matches(buf, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (
    matches(buf, 0, [0x52, 0x49, 0x46, 0x46]) && // "RIFF"
    matches(buf, 8, [0x57, 0x45, 0x42, 0x50]) // "WEBP"
  ) return 'webp';
  if (matches(buf, 0, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61])) return 'gif'; // GIF87a
  if (matches(buf, 0, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])) return 'gif'; // GIF89a
  if (matches(buf, 0, [0x25, 0x50, 0x44, 0x46])) return 'pdf'; // "%PDF"
  return 'unknown';
}

const IMAGE_TYPES: ReadonlySet<DetectedFileType> = new Set(['jpeg', 'png', 'webp', 'gif']);

/** Does the DETECTED type (from actual bytes) match the CLAIMED category? */
export function matchesExpectedCategory(
  detected: DetectedFileType,
  expected: 'image' | 'pdf',
): boolean {
  return expected === 'pdf' ? detected === 'pdf' : IMAGE_TYPES.has(detected);
}
