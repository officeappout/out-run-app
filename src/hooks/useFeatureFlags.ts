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

// Layout effect on the client (before paint), plain effect on the server.
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Never hold a screen on "loading" longer than this if Firestore is slow/offline. */
const LOADING_CAP_MS = 2500;

// ============================================================================
// HOOK
// ============================================================================

export function useFeatureFlags(isSuperAdmin?: boolean): {
  flags: FeatureFlags;
  loading: boolean;
} {
  const [flags, setFlags] = useState<FeatureFlags>(SAFE_DEFAULTS);
  const [loading, setLoading] = useState(true);

  // Before the first paint: the last-known flags, so the right design shows
  // straight away. (Not in useState's initializer — the server render has no
  // localStorage, and the first client render must match it.)
  useIsomorphicLayoutEffect(() => {
    const cached = readCachedFlags();
    if (cached) {
      setFlags(cached);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const cap = setTimeout(() => setLoading(false), LOADING_CAP_MS);
    // system_config is publicly readable — subscribe immediately, no auth gate needed.
    const unsubscribe = onSnapshot(
      doc(db, 'system_config', 'feature_flags'),
      (snap) => {
        const next = snap.exists() ? flagsFromFirestoreData(snap.data()) : SAFE_DEFAULTS;
        setFlags(next);
        setLoading(false);
        writeCachedFlags(next);
      },
      () => {
        // On an unexpected error keep the device's last-known flags (falling
        // back to safe defaults only when there are none) — wiping them here
        // would bring the old-design flash right back. In production this
        // should never fire since the rule is public.
        setFlags(readCachedFlags() ?? SAFE_DEFAULTS);
        setLoading(false);
      },
    );

    return () => {
      clearTimeout(cap);
      unsubscribe();
    };
  }, []);

  // Super Admins bypass all flags — they always see every feature enabled
  // (maintenanceMode is the one exception, per SUPER_ADMIN_FLAGS above).
  if (isSuperAdmin) {
    return { flags: SUPER_ADMIN_FLAGS, loading: false };
  }

  return { flags, loading };
}
