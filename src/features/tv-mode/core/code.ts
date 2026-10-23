import { TV_CODE_LENGTH, TV_CODE_PARAM, TV_PATH } from './constants';

/** `randomInt(max)` → integer in [0, max). Crypto-backed in the app, seeded in tests. */
export type RandomInt = (max: number) => number;

/** Browser / edge crypto — never Math.random for a join code. */
export function cryptoRandomInt(max: number): number {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c?.getRandomValues) throw new Error('crypto unavailable');
  // Rejection sampling: no modulo bias.
  const limit = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  do c.getRandomValues(buf);
  while (buf[0] >= limit);
  return buf[0] % max;
}

/** 6 digits, leading zeros allowed ("004821"). */
export function generateCode(randomInt: RandomInt): string {
  let out = '';
  for (let i = 0; i < TV_CODE_LENGTH; i++) out += String(randomInt(10));
  return out;
}

const ARABIC_INDIC = /[٠-٩]/g;
const EXT_ARABIC_INDIC = /[۰-۹]/g;

/** Keep the digits only (also Arabic-Indic ones typed on some keyboards), cut at the code length. */
export function normalizeCode(input: string): string {
  return input
    .replace(ARABIC_INDIC, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(EXT_ARABIC_INDIC, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\D/g, '')
    .slice(0, TV_CODE_LENGTH);
}

export function isValidCode(code: string): boolean {
  return new RegExp(`^\\d{${TV_CODE_LENGTH}}$`).test(code);
}

/** "482913" → "482 913" (groups of three; a string, not a number — leading zeros matter). */
export function formatCodeGroups(code: string): string {
  return code.length === TV_CODE_LENGTH ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}

/** What the QR on the TV encodes — and what the phone's own camera opens. */
export function buildJoinUrl(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, '')}${TV_PATH}?${TV_CODE_PARAM}=${code}`;
}

/** Accepts a typed code, a pasted code with spaces, or a scanned join URL. null = nothing usable. */
export function parseJoinInput(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    const fromQuery = url.searchParams.get(TV_CODE_PARAM);
    if (fromQuery) {
      const c = normalizeCode(fromQuery);
      return isValidCode(c) ? c : null;
    }
    return null;
  } catch {
    /* not a URL — treat as typed digits */
  }
  const c = normalizeCode(text);
  return isValidCode(c) ? c : null;
}

/**
 * Collision-safe allocation: `tryCreate(code)` must create the session only if the code is free
 * and report whether it did (Firestore `create()` / a transaction). Pure so it is testable.
 */
export async function allocateCode(
  tryCreate: (code: string) => Promise<boolean>,
  randomInt: RandomInt,
  maxAttempts = 12,
): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const code = generateCode(randomInt);
    if (await tryCreate(code)) return code;
  }
  throw new Error('tv-code-exhausted');
}
