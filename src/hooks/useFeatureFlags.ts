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

import { useState, useEffect } from 'react';
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
// HOOK
// ============================================================================

export function useFeatureFlags(isSuperAdmin?: boolean): {
  flags: FeatureFlags;
  loading: boolean;
} {
  const [flags, setFlags] = useState<FeatureFlags>(SAFE_DEFAULTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // system_config is publicly readable — subscribe immediately, no auth gate needed.
    const unsubscribe = onSnapshot(
      doc(db, 'system_config', 'feature_flags'),
      (snap) => {
        setFlags(snap.exists() ? flagsFromFirestoreData(snap.data()) : SAFE_DEFAULTS);
        setLoading(false);
      },
      () => {
        // Silently fall back to safe defaults on any unexpected error.
        // In production this should never fire since the rule is now public.
        setFlags(SAFE_DEFAULTS);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  // Super Admins bypass all flags — they always see every feature enabled
  // (maintenanceMode is the one exception, per SUPER_ADMIN_FLAGS above).
  if (isSuperAdmin) {
    return { flags: SUPER_ADMIN_FLAGS, loading: false };
  }

  return { flags, loading };
}
