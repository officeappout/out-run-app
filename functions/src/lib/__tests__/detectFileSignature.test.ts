import { describe, it, expect } from 'vitest';
import { detectFileSignature, matchesExpectedCategory } from '../detectFileSignature';

/**
 * SPEC-03 Wave D.4: storage.rules' isImage()/isPdf() trust the CLAIMED
 * contentType header, not the actual bytes — a caller can claim
 * image/jpeg while uploading anything at all. This proves the real
 * detection: identify type from the file's own magic-byte signature,
 * independent of whatever the uploader claimed.
 */

function bytes(...vals: number[]): Uint8Array {
  return new Uint8Array(vals);
}

describe('detectFileSignature', () => {
  it('detects a real JPEG (FF D8 FF)', () => {
    expect(detectFileSignature(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0))).toBe('jpeg');
  });

  it('detects a real PNG (89 50 4E 47 0D 0A 1A 0A)', () => {
    expect(detectFileSignature(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0))).toBe('png');
  });

  it('detects a real WEBP (RIFF....WEBP)', () => {
    expect(detectFileSignature(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50))).toBe('webp');
  });

  it('detects a real GIF87a', () => {
    expect(detectFileSignature(bytes(0x47, 0x49, 0x46, 0x38, 0x37, 0x61))).toBe('gif');
  });

  it('detects a real GIF89a', () => {
    expect(detectFileSignature(bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61))).toBe('gif');
  });

  it('detects a real PDF (%PDF)', () => {
    expect(detectFileSignature(bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34))).toBe('pdf');
  });

  it("SPEC-03 D.4 fix: a file claiming to be an image but whose bytes don't match any known signature is 'unknown' — this is the actual gap contentType-only checking missed", () => {
    // e.g. an HTML file with a script tag, uploaded with a forged
    // Content-Type: image/jpeg header — the header lies, the bytes don't.
    const htmlAsBytes = new TextEncoder().encode('<html><script>alert(1)</script>');
    expect(detectFileSignature(htmlAsBytes)).toBe('unknown');
  });

  it('an empty buffer is unknown, not a false-positive match', () => {
    expect(detectFileSignature(bytes())).toBe('unknown');
  });

  it('a truncated/too-short buffer is unknown, not a false-positive match', () => {
    expect(detectFileSignature(bytes(0xff, 0xd8))).toBe('unknown');
  });
});

describe('matchesExpectedCategory', () => {
  it('a jpeg matches the "image" category', () => {
    expect(matchesExpectedCategory('jpeg', 'image')).toBe(true);
  });
  it('a png matches the "image" category', () => {
    expect(matchesExpectedCategory('png', 'image')).toBe(true);
  });
  it('a pdf does NOT match the "image" category', () => {
    expect(matchesExpectedCategory('pdf', 'image')).toBe(false);
  });
  it('a pdf matches the "pdf" category', () => {
    expect(matchesExpectedCategory('pdf', 'pdf')).toBe(true);
  });
  it('a jpeg does NOT match the "pdf" category', () => {
    expect(matchesExpectedCategory('jpeg', 'pdf')).toBe(false);
  });
  it('unknown never matches either category', () => {
    expect(matchesExpectedCategory('unknown', 'image')).toBe(false);
    expect(matchesExpectedCategory('unknown', 'pdf')).toBe(false);
  });
});
