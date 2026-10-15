/**
 * feature-flag-once — a ONE-SHOT read of a single panel flag (system_config/feature_flags) for
 * plain services that can't use the useFeatureFlags hook (no React). Same shape as the inline
 * read in feed.service.ts, shared so each service doesn't hand-roll its own copy.
 *
 * Fails CLOSED to the flag's FLAG_DEFS default: missing doc, missing key or a read error all
 * return `defaultValue` (false for every new flag). Super-admin overrides do NOT apply here —
 * services don't know who the viewer is; flags whose superAdminValue is false (the panel toggle
 * is the one switch) behave identically either way.
 */
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { FLAG_DEFS, type FirestoreFlagKey } from '@/hooks/feature-flag-defs';

export async function readFeatureFlagOnce(firestoreKey: FirestoreFlagKey): Promise<boolean> {
  const fallback = FLAG_DEFS.find((d) => d.firestoreKey === firestoreKey)?.defaultValue ?? false;
  try {
    const snap = await getDoc(doc(db, 'system_config', 'feature_flags'));
    if (!snap.exists()) return fallback;
    const value = snap.data()?.[firestoreKey];
    return typeof value === 'boolean' ? value : fallback;
  } catch (err) {
    console.warn(`[readFeatureFlagOnce] could not read ${firestoreKey} — using default ${fallback}:`, err);
    return fallback;
  }
}
