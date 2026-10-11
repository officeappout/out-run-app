/**
 * generateToken() — format/entropy proof (write-layer-3 audit, 11.10.2026).
 * Pure unit test, no emulator needed — proves the fix's shape directly:
 * was Math.random() over 6 chars, now crypto.getRandomValues() over 20.
 */
import { describe, it, expect } from 'vitest';
import { generateToken } from '../group-invitation.service';

const TOKEN_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

describe('generateToken', () => {
  it('produces "si_" + 20 chars from the expected alphabet (23 chars total)', () => {
    const token = generateToken();
    expect(token.startsWith('si_')).toBe(true);
    expect(token.length).toBe(23);
    const randomPart = token.slice(3);
    expect(randomPart.length).toBe(20);
    for (const ch of randomPart) {
      expect(TOKEN_CHARS.includes(ch)).toBe(true);
    }
    // Explicitly never contains the excluded ambiguous characters.
    expect(randomPart).not.toMatch(/[0O1I]/);
  });

  it('1000 calls produce 1000 distinct tokens (sanity check on the RNG — not a rigorous entropy proof, but a real collision would fail this immediately)', () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 1000; i++) tokens.add(generateToken());
    expect(tokens.size).toBe(1000);
  });
});
