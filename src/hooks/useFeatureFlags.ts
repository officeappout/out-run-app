'use client';

/**
 * useFeatureFlags
 *
 * Real-time Firestore listener for system_config/feature_flags.
 *
 * The document is publicly readable (no auth required) so the listener
 * can start immediately on mount — no auth timing race, zero permission errors.
 *
 * Super Admins always get all flags set to true regardless of Firestore values.
 *
 * Usage:
 *   const { flags, loading } = useFeatureFlags(profile?.core?.isSuperAdmin);
 */

import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// ============================================================================
// TYPES
// ============================================================================

export interface FeatureFlags {
  enableRunningPrograms: boolean;
  enableCommunityFeed: boolean;
  maintenanceMode: boolean;
}

const SAFE_DEFAULTS: FeatureFlags = {
  enableRunningPrograms: false,
  enableCommunityFeed: false,
  maintenanceMode: false,
};

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
        if (snap.exists()) {
          const data = snap.data();
          setFlags({
            enableRunningPrograms: data.enable_running_programs ?? false,
            enableCommunityFeed: data.enable_community_feed ?? false,
            maintenanceMode: data.maintenance_mode ?? false,
          });
        } else {
          // Document not yet seeded — keep safe defaults (all features hidden)
          setFlags(SAFE_DEFAULTS);
        }
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
  if (isSuperAdmin) {
    return {
      flags: {
        enableRunningPrograms: true,
        enableCommunityFeed: true,
        maintenanceMode: false,
      },
      loading: false,
    };
  }

  return { flags, loading };
}
