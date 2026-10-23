import { describe, expect, it } from 'vitest';
import { allocateCode, buildJoinUrl, cryptoRandomInt, formatCodeGroups, generateCode, isValidCode, normalizeCode, parseJoinInput } from '../core/code';
import { expiresAtFor, isExpired, remainingHours, remainingMs } from '../core/expiry';
import { TV_SESSION_TTL_MS } from '../core/constants';

/** Deterministic randomInt from a digit script. */
const script = (digits: number[]) => {
  let i = 0;
  return () => digits[i++ % digits.length];
};

describe('generateCode', () => {
  it('is 6 digits, leading zeros kept', () => {
    expect(generateCode(script([0, 0, 4, 8, 2, 1]))).toBe('004821');
  });
  it('crypto randomInt stays in range and looks uniform enough', () => {
    const counts = new Array(10).fill(0);
    for (let i = 0; i < 5000; i++) {
      const n = cryptoRandomInt(10);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(10);
      counts[n]++;
    }
    for (const c of counts) expect(c).toBeGreaterThan(350);
  });
});

describe('normalizeCode / isValidCode / formatCodeGroups', () => {
  it('keeps digits only and cuts at 6', () => {
    expect(normalizeCode(' 482-913 99')).toBe('482913');
    expect(normalizeCode('٤٨٢٩١٣')).toBe('482913');
    expect(normalizeCode('۴۸۲۹۱۳')).toBe('482913');
  });
  it('validates exactly 6 digits', () => {
    expect(isValidCode('482913')).toBe(true);
    expect(isValidCode('48291')).toBe(false);
    expect(isValidCode('4829133')).toBe(false);
    expect(isValidCode('48291a')).toBe(false);
  });
  it('groups for display', () => {
    expect(formatCodeGroups('482913')).toBe('482 913');
    expect(formatCodeGroups('12')).toBe('12');
  });
});

describe('join url', () => {
  it('builds and parses the QR payload', () => {
    const url = buildJoinUrl('https://outrun.co.il/', '482913');
    expect(url).toBe('https://outrun.co.il/tv?code=482913');
    expect(parseJoinInput(url)).toBe('482913');
  });
  it('accepts typed digits and rejects junk', () => {
    expect(parseJoinInput('482 913')).toBe('482913');
    expect(parseJoinInput('https://outrun.co.il/tv?code=12')).toBeNull();
    expect(parseJoinInput('https://outrun.co.il/tv')).toBeNull();
    expect(parseJoinInput('hello')).toBeNull();
    expect(parseJoinInput('   ')).toBeNull();
  });
});

describe('allocateCode', () => {
  it('retries on a collision and returns the first free code', async () => {
    const taken = new Set(['111111', '222222']);
    const codes = ['111111', '222222', '333333'];
    let n = 0;
    const rng = () => Number(codes[Math.floor(n++ / 6)][0]); // each code = 6 identical digits
    const made: string[] = [];
    const code = await allocateCode(async (c) => {
      if (taken.has(c)) return false;
      made.push(c);
      return true;
    }, rng);
    expect(code).toBe('333333');
    expect(made).toEqual(['333333']);
  });
  it('gives up after maxAttempts', async () => {
    await expect(allocateCode(async () => false, cryptoRandomInt, 3)).rejects.toThrow('tv-code-exhausted');
  });
});

describe('expiry', () => {
  it('lives exactly 4 hours', () => {
    expect(TV_SESSION_TTL_MS).toBe(4 * 3600_000);
    expect(expiresAtFor(1000)).toBe(1000 + 4 * 3600_000);
  });
  it('expires at the boundary', () => {
    const exp = 10_000;
    expect(isExpired(exp, 9_999)).toBe(false);
    expect(isExpired(exp, 10_000)).toBe(true);
    expect(remainingMs(exp, 12_000)).toBe(0);
  });
  it('rounds the hours note up and never shows 0 while alive', () => {
    const now = 0;
    expect(remainingHours(4 * 3600_000, now)).toBe(4);
    expect(remainingHours(3 * 3600_000 + 1, now)).toBe(4);
    expect(remainingHours(60_000, now)).toBe(1);
    expect(remainingHours(0, now)).toBe(0);
  });
});
