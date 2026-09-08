import { describe, it, expect } from 'vitest';
import { resolveLoadedFlags } from '../resolve-loaded-flags';

const KEYS = ['a', 'b', 'c'] as const;
const DEFAULTS = { a: true, b: true, c: false };

describe('resolveLoadedFlags — success (doc read completed, may or may not exist)', () => {
  it('uses the real value for every key present in the data', () => {
    const { flags, loadFailed } = resolveLoadedFlags(
      { status: 'ok', data: { a: false, b: false, c: true } },
      KEYS,
      DEFAULTS,
    );
    expect(flags).toEqual({ a: false, b: false, c: true });
    expect(loadFailed).toBe(false);
  });

  it('falls back to the SAME provided defaults for a key missing from the data (no separate hardcoded copy)', () => {
    const { flags, loadFailed } = resolveLoadedFlags(
      { status: 'ok', data: { a: false } }, // b, c absent
      KEYS,
      DEFAULTS,
    );
    expect(flags).toEqual({ a: false, b: DEFAULTS.b, c: DEFAULTS.c });
    expect(loadFailed).toBe(false);
  });

  it('falls back to defaults entirely when the doc does not exist yet (data: undefined) — legitimate, not a failure', () => {
    const { flags, loadFailed } = resolveLoadedFlags({ status: 'ok', data: undefined }, KEYS, DEFAULTS);
    expect(flags).toEqual(DEFAULTS);
    expect(loadFailed).toBe(false);
  });
});

describe('resolveLoadedFlags — read failure (the case a bare getDoc().catch() used to swallow)', () => {
  it('reports loadFailed: true so the caller can block Save', () => {
    const { loadFailed } = resolveLoadedFlags({ status: 'error' }, KEYS, DEFAULTS);
    expect(loadFailed).toBe(true);
  });

  it('returns defaults-only flags on failure — never a stale or partially-real value that could be mistaken for a real read', () => {
    const { flags } = resolveLoadedFlags({ status: 'error' }, KEYS, DEFAULTS);
    expect(flags).toEqual(DEFAULTS);
  });

  it('a caller that (incorrectly) ignored loadFailed and saved anyway would only ever write the known-safe defaults, never leftover/partial state', () => {
    // Guards against a regression where a future edit reads `data` even in the
    // error branch (e.g. a stale getDoc() result) instead of always using defaults.
    const { flags } = resolveLoadedFlags({ status: 'error' }, KEYS, DEFAULTS);
    expect(Object.keys(flags).sort()).toEqual([...KEYS].sort());
    for (const k of KEYS) {
      expect(flags[k]).toBe(DEFAULTS[k]);
    }
  });
});
