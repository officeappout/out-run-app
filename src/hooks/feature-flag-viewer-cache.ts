/**
 * Per-viewer cache of the RESOLVED feature flags (owner bug 21.10.2026: entering
 * leagues / home showed the old design for a moment, then swapped to v2).
 *
 * useFeatureFlags already caches the raw system_config/feature_flags document, but
 * what a screen shows depends on the VIEWER too (super admin → superAdminValue,
 * AI tester → qaTesterValue). Those inputs arrive later than the document — the
 * persisted profile only reaches React after hydration, the tester check waits for
 * the ID token — so a screen could paint with the raw values (v1) and then swap.
 *
 * This module remembers the flags each signed-in uid last ended up with, on this
 * device, and decides (purely — unit-tested) what a screen should start from:
 *
 *   live      the document arrived (or the viewer is a super admin) — the truth
 *   cached    the uid's last resolved flags, until the truth arrives
 *   unknown   nothing known yet → the caller renders a neutral v2-style skeleton,
 *             never v1-then-v2
 *
 * A mismatch between the cache and the truth rewrites the cache, so a user whose
 * flag was turned off lands on v1 on the next resolve (and starts there next time).
 * UI gating only: nothing security-relevant reads flags from here.
 */
import { FLAG_DEFS } from './feature-flag-defs';

type FlagDef = (typeof FLAG_DEFS)[number];
export type FlagMap = { [D in FlagDef as D['key']]: boolean };

export const VIEWER_FLAGS_CACHE_PREFIX = 'out-viewer-flags-v1:';

export function viewerFlagsCacheKey(uid: string): string {
  return VIEWER_FLAGS_CACHE_PREFIX + uid;
}

// In-memory twin of the storage entries (the hook reads on every render).
const memo = new Map<string, FlagMap | null>();
let lastUidMemo: string | null | undefined;

/** Test-only: forget the in-memory twins. */
export function __resetViewerFlagsMemo() {
  memo.clear();
  lastUidMemo = undefined;
}

/** The uid's last resolved flags on this device, or null (none / corrupt / no storage). */
export function readViewerFlags(uid: string | null | undefined): FlagMap | null {
  if (!uid) return null;
  if (memo.has(uid)) return memo.get(uid) ?? null;
  const value = readViewerFlagsFromStorage(uid);
  if (typeof window !== 'undefined') memo.set(uid, value);
  return value;
}

function readViewerFlagsFromStorage(uid: string): FlagMap | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(viewerFlagsCacheKey(uid));
    if (!raw) return null;
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (!data || typeof data !== 'object') return null;
    return Object.fromEntries(
      FLAG_DEFS.map((d) => [d.key, typeof data[d.key] === 'boolean' ? data[d.key] : d.defaultValue]),
    ) as FlagMap;
  } catch {
    return null;
  }
}

export function writeViewerFlags(uid: string, flags: FlagMap): void {
  memo.set(uid, flags);
  try {
    window.localStorage.setItem(viewerFlagsCacheKey(uid), JSON.stringify(flags));
  } catch {
    /* private mode / quota — the cache is only a speed-up */
  }
}

export function sameFlags(a: FlagMap | null, b: FlagMap | null): boolean {
  if (!a || !b) return a === b;
  return FLAG_DEFS.every((d) => a[d.key] === b[d.key]);
}

/** The uid that last resolved flags on this device — used only while the profile is still loading. */
export const LAST_VIEWER_KEY = VIEWER_FLAGS_CACHE_PREFIX + '@last';

export function readLastViewerUid(): string | null {
  if (lastUidMemo !== undefined) return lastUidMemo;
  try {
    if (typeof window === 'undefined') return null;
    lastUidMemo = window.localStorage.getItem(LAST_VIEWER_KEY) || null;
    return lastUidMemo;
  } catch {
    return null;
  }
}

export function writeLastViewerUid(uid: string): void {
  if (lastUidMemo === uid) return;
  lastUidMemo = uid;
  try {
    window.localStorage.setItem(LAST_VIEWER_KEY, uid);
  } catch {
    /* speed-up only */
  }
}

/**
 * live      resolved from the live document with a known viewer — the truth
 * cached    a device cache (this viewer's resolved flags, or the raw document's)
 * fallback  nothing known and we stopped waiting — the safe defaults
 * unknown   nothing known yet → render a neutral skeleton, never v1-then-v2
 */
export type FlagsSource = 'live' | 'cached' | 'fallback' | 'unknown';

export interface DisplayFlagsInput {
  /** Flags resolved from the live document (or the super-admin set) for the current viewer inputs; null while pending. */
  live: FlagMap | null;
  /** The signed-in profile is known, so the viewer inputs behind `live` (super admin, uid) are trustworthy. */
  viewerKnown: boolean;
  /** The viewer's cached resolved flags (this uid's, or the last uid's while the profile loads), or null. */
  viewerCache: FlagMap | null;
  /** The raw-document cache resolved for the current viewer inputs, or null. */
  docCache: FlagMap | null;
  /** The wait is over (loading cap hit / listener error) — stop holding the skeleton. */
  gaveUp: boolean;
  /** Shown when nothing is known (the safe defaults). */
  fallback: FlagMap;
}

export interface DisplayFlags {
  flags: FlagMap;
  source: FlagsSource;
}

/**
 * What a screen renders right now (pure). The live truth wins once the viewer is
 * known; until then the viewer's own cache (it already includes the super-admin /
 * tester resolution) — a profile that never shows up stops counting after the
 * loading cap; then the raw-document cache; then, once we stopped waiting, the
 * defaults; otherwise "unknown".
 */
export function resolveDisplayFlags(input: DisplayFlagsInput): DisplayFlags {
  const { live, viewerKnown, viewerCache, docCache, gaveUp, fallback } = input;
  if (live && viewerKnown) return { flags: live, source: 'live' };
  if (viewerCache && (viewerKnown || !gaveUp)) return { flags: viewerCache, source: 'cached' };
  if (live) return { flags: live, source: 'live' };
  if (docCache) return { flags: docCache, source: 'cached' };
  if (gaveUp) return { flags: fallback, source: 'fallback' };
  return { flags: fallback, source: 'unknown' };
}

/** Rewrite the uid's cache only for a live result with a known viewer that differs from what is stored. */
export function shouldWriteViewerCache(
  uid: string | null | undefined,
  viewerKnown: boolean,
  display: DisplayFlags,
  viewerCache: FlagMap | null,
): boolean {
  return !!uid && viewerKnown && display.source === 'live' && !sameFlags(display.flags, viewerCache);
}

/**
 * Which loading look a v1/v2 screen shows while it waits (pure): the neutral v2
 * skeleton whenever the flags are unknown or say v2; the screen's old loader only
 * for a viewer whose flags are known to be off.
 */
export function loadingLook(ready: boolean, v2: boolean): 'skeleton' | 'legacy' {
  return !ready || v2 ? 'skeleton' : 'legacy';
}
