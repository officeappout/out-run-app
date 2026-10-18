/**
 * entitlement.server — Admin SDK reads behind the AI gate (OUT AI Phase 0).
 *
 *   getServerFeatureFlags()  system_config/feature_flags → { [FLAG_DEFS key]: boolean }
 *   getAiEntitlement(uid)    entitlements/{uid} → AiEntitlementDoc | null
 *
 * Feature flags live in system_config/feature_flags (the document FLAG_DEFS, useFeatureFlags
 * and the admin system-settings page all use) — NOT app_config/feature_flags, which is a
 * separate legacy doc holding only chatNotificationsEnabled. Server reads never apply the
 * super-admin override: the server answers "is this ON for real", nothing else.
 */
import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import { FLAG_DEFS } from '@/hooks/feature-flag-defs';
import type { AiEntitlementDoc, AiFlags } from './ai-entitlement';

export type ServerFeatureFlags = { [D in (typeof FLAG_DEFS)[number] as D['key']]: boolean };

function defaults(): ServerFeatureFlags {
  return Object.fromEntries(FLAG_DEFS.map((d) => [d.key, d.defaultValue])) as ServerFeatureFlags;
}

/**
 * Missing doc / missing key → that flag's FLAG_DEFS default. A read ERROR also returns the
 * defaults (same contract as readFeatureFlagOnce) — for AI that is fail-closed, because
 * aiCoachEnabled defaults to false and canUseAi requires it.
 */
export async function getServerFeatureFlags(db: Firestore = getAdminDb()): Promise<ServerFeatureFlags> {
  const out = defaults();
  try {
    const snap = await db.collection('system_config').doc('feature_flags').get();
    const data = snap.exists ? (snap.data() ?? {}) : {};
    for (const d of FLAG_DEFS) {
      const v = data[d.firestoreKey];
      if (typeof v === 'boolean') (out as Record<string, boolean>)[d.key] = v;
    }
  } catch (err) {
    console.warn('[ai] feature flags read failed — using defaults (AI off)', err);
  }
  return out;
}

export function aiFlagsFrom(flags: ServerFeatureFlags): AiFlags {
  return { aiCoachEnabled: flags.aiCoachEnabled, aiCoachFreeForAll: flags.aiCoachFreeForAll };
}

/** entitlements/{uid}, or null when there is none. A read error throws (callers fail closed). */
export async function getAiEntitlement(uid: string, db: Firestore = getAdminDb()): Promise<AiEntitlementDoc | null> {
  const snap = await db.collection('entitlements').doc(uid).get();
  return snap.exists ? ((snap.data() as AiEntitlementDoc | undefined) ?? null) : null;
}
