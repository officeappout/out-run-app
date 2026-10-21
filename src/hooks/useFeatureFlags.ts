'use client';

/**
 * useFeatureFlags
 *
 * Real-time Firestore listener for system_config/feature_flags.
 *
 * The document is publicly readable (no auth required) so the listener
 * can start immediately on mount — no auth timing race, zero permission errors.
 *
 * Super Admins always get all flags set to true regardless of Firestore values
 * (maintenanceMode is the one deliberate exception — see FLAG_DEFS below).
 *
 * Adding a flag: add ONE entry to FLAG_DEFS (./feature-flag-defs.ts — shared with the
 * system-settings admin page so both sides use the exact same defaults). Nothing else
 * in this file changes.
 *
 * Usage:
 *   const { flags, loading } = useFeatureFlags(profile?.core?.isSuperAdmin);
 */

import { useState, useEffect, useLayoutEffect } from 'react';
import { doc, onSnapshot, type DocumentData } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { FLAG_DEFS } from './feature-flag-defs';
import { resolveViewerFlags } from './feature-flag-resolve';
import {
  readViewerFlags,
  writeViewerFlags,
  readLastViewerUid,
  writeLastViewerUid,
  resolveDisplayFlags,
  shouldWriteViewerCache,
} from './feature-flag-viewer-cache';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { useIsQaTester } from '@/lib/qa/useIsQaTester';

// ============================================================================
// TYPES (derived from FLAG_DEFS — no separate list to keep in sync)
// ============================================================================

export type FeatureFlags = { [D in (typeof FLAG_DEFS)[number] as D['key']]: boolean };

const SAFE_DEFAULTS: FeatureFlags = Object.fromEntries(
  FLAG_DEFS.map((d) => [d.key, d.defaultValue]),
) as FeatureFlags;

const SUPER_ADMIN_FLAGS: FeatureFlags = Object.fromEntries(
  FLAG_DEFS.map((d) => [d.key, d.superAdminValue]),
) as FeatureFlags;

function flagsFromFirestoreData(data: DocumentData): FeatureFlags {
  return Object.fromEntries(
    FLAG_DEFS.map((d) => [d.key, data[d.firestoreKey] ?? d.defaultValue]),
  ) as FeatureFlags;
}

// ============================================================================
// LAST-KNOWN CACHE
// ============================================================================

/**
 * Last flags this device saw (David, 17.10.2026: "every page shows the old
 * design for a second, then switches"). Until the Firestore snapshot lands
 * the hook used to return SAFE_DEFAULTS — every v2 screen rendered its old
 * look first. Now the last-known values are applied before the first paint
 * and the snapshot only corrects them. UI gating only: nothing that matters
 * for security reads flags from here.
 */
export const FLAGS_CACHE_KEY = 'out-feature-flags-v1';

export function readCachedFlags(): FeatureFlags | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(FLAGS_CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      FLAG_DEFS.map((d) => [d.key, typeof data[d.key] === 'boolean' ? data[d.key] : d.defaultValue]),
    ) as FeatureFlags;
  } catch {
    return null;
  }
}

function writeCachedFlags(flags: FeatureFlags) {
  try {
    window.localStorage.setItem(FLAGS_CACHE_KEY, JSON.stringify(flags));
  } catch {
    /* private mode / quota — the cache is only a speed-up */
  }
}

/**
 * In-memory twin of the cache for this JS session: the newest flags any hook
 * instance received. Lets a hook that mounts after hydration start from them
 * in useState's initializer (see the hook below).
 */
let lastKnownFlags: FeatureFlags | null = null;
/** True once the first hook instance has committed on the client. */
let clientHydrated = false;

/**
 * Flags to start a NEW hook instance from, or null when unknown. Always null
 * until the app has hydrated, so the hydration render matches the server's.
 */
export function initialFlags(): FeatureFlags | null {
  if (!clientHydrated || typeof window === 'undefined') return null;
  return lastKnownFlags ?? readCachedFlags();
}

/** Test-only: mark the app hydrated / seed the in-memory flags. */
export function __setFlagsMemoryForTests(flags: FeatureFlags | null, hydrated: boolean) {
  lastKnownFlags = flags;
  clientHydrated = hydrated;
}

// Layout effect on the client (before paint), plain effect on the server.
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Never hold a screen on "loading" longer than this if Firestore is slow/offline. */
const LOADING_CAP_MS = 2500;

// ============================================================================
// HOOK
// ============================================================================

export function useFeatureFlags(isSuperAdmin?: boolean): {
  flags: FeatureFlags;
  /**
   * The live document values, WITHOUT the super-admin override. For gates that decide the
   * audience themselves (e.g. weather's admins-only mode, isWeatherOnFor) and so need the
   * real toggle state even for a super admin.
   */
  rawFlags: FeatureFlags;
  loading: boolean;
  /**
   * false while NOTHING is known about this viewer's flags yet (server render, the
   * hydration render, a first-ever launch before Firestore answers). A screen that
   * branches v1/v2 renders a neutral skeleton (FlagsSkeleton) instead of guessing —
   * never v1 first and then v2. true from a device cache onward.
   */
  ready: boolean;
} {
  // After the app's first hydration, a hook that mounts later (a client-side
  // navigation, a sheet, the bottom bar) starts straight from the best flags
  // this device knows — no render with SAFE_DEFAULTS at all. During the
  // hydration render itself it must still match the server (SAFE_DEFAULTS,
  // ready=false); the layout effect below corrects that before the first paint.
  const [hydrated, setHydrated] = useState(() => clientHydrated && typeof window !== 'undefined');
  // The live document from THIS JS session (null until a snapshot arrives).
  const [docFlags, setDocFlags] = useState<FeatureFlags | null>(() => (hydrated ? lastKnownFlags : null));
  const [docCache, setDocCache] = useState<FeatureFlags | null>(() => (hydrated ? readCachedFlags() : null));
  const [gaveUp, setGaveUp] = useState(false);
  // The signed-in viewer (persisted profile; null on the server / hydration render
  // and until the profile is restored).
  const uid = useUserStore((s) => s.profile?.id ?? null);

  useIsomorphicLayoutEffect(() => {
    clientHydrated = true;
    if (!hydrated) {
      setHydrated(true);
      setDocFlags(lastKnownFlags);
      setDocCache(readCachedFlags());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const cap = setTimeout(() => setGaveUp(true), LOADING_CAP_MS);
    // system_config is publicly readable — subscribe immediately, no auth gate needed.
    const unsubscribe = onSnapshot(
      doc(db, 'system_config', 'feature_flags'),
      (snap) => {
        const next = snap.exists() ? flagsFromFirestoreData(snap.data()) : SAFE_DEFAULTS;
        lastKnownFlags = next;
        setDocFlags(next);
        writeCachedFlags(next);
      },
      () => {
        // On an unexpected error keep the device's caches (the old-design flash
        // would come back if we wiped them) and stop waiting. In production this
        // should never fire since the rule is public.
        setGaveUp(true);
      },
    );

    return () => {
      clearTimeout(cap);
      unsubscribe();
    };
  }, []);

  // AI testers (uid demo_qa_* + claim qa) get each flag's qaTesterValue while the demo
  // switches are on — never the super-admin set. false for every real user (from the uid alone).
  const isQaTester = useIsQaTester();
  const viewer = { isSuperAdmin: !!isSuperAdmin, isQaTester };

  // Super Admins bypass all flags — they always see every feature enabled
  // (maintenanceMode is the one exception, per SUPER_ADMIN_FLAGS above).
  const live = !hydrated
    ? null
    : isSuperAdmin
      ? SUPER_ADMIN_FLAGS
      : docFlags
        ? resolveViewerFlags(docFlags, viewer, SUPER_ADMIN_FLAGS)
        : null;
  // The per-viewer cache is for callers that pass isSuperAdmin (the resolved view).
  // Callers that deliberately call useFeatureFlags() without it (no override) keep
  // using the raw document only, so the two views never overwrite each other.
  const usesViewerCache = isSuperAdmin !== undefined;
  const viewerUid = hydrated && usesViewerCache ? uid ?? readLastViewerUid() : null;
  const viewerCache = viewerUid ? readViewerFlags(viewerUid) : null;
  const display = resolveDisplayFlags({
    live,
    viewerKnown: hydrated && !!uid,
    viewerCache,
    docCache: docCache ? resolveViewerFlags(docCache, viewer, SUPER_ADMIN_FLAGS) : null,
    gaveUp,
    fallback: SAFE_DEFAULTS,
  });

  // Remember what this viewer ended up with (only live truth, only when it changed).
  const writeNow = usesViewerCache && shouldWriteViewerCache(uid, hydrated && !!uid, display, viewerCache);
  useEffect(() => {
    if (writeNow && uid) {
      writeViewerFlags(uid, display.flags);
      writeLastViewerUid(uid);
    }
  });

  const rawFlags = docFlags ?? docCache ?? SAFE_DEFAULTS;
  return {
    flags: display.flags,
    rawFlags,
    // Same meaning as before: false once the live document, a device cache, the
    // super-admin set or the loading cap is in — true only while nothing is.
    loading: display.source === 'unknown',
    ready: display.source !== 'unknown',
  };
}
