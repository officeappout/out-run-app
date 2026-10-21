/**
 * seedAchievements — browser-side Firestore seeder.
 *
 * Uses the already-authenticated Firebase client from src/lib/firebase.ts,
 * so no service account or admin SDK is required.
 *
 * The signed-in user must be david@appout.co.il (isRootAdmin in Firestore rules)
 * for the writes to succeed.
 *
 * Usage: call runSeedAchievements() from a button in the profile page.
 * Remove the button after the seed is confirmed in the Firebase console.
 */

import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ACHIEVEMENT_DEFINITIONS } from '@/features/user/progression/config/achievement-definitions';

export async function runSeedAchievements(): Promise<{ written: number; errors: string[] }> {
  const errors: string[] = [];
  let written = 0;

  console.log(`[Seed] Starting — ${ACHIEVEMENT_DEFINITIONS.length} achievements to write…`);

  for (const def of ACHIEVEMENT_DEFINITIONS) {
    const payload: Record<string, unknown> = {
      id:             def.id,
      name_he:        def.name_he,
      description_he: def.description_he,
      category:       def.category,
      type:           def.type,
      iconUrl:        def.iconUrl,
    };

    if (def.type === 'one_time') {
      if (def.condition) payload.condition = def.condition;
      payload.xp = def.xp ?? 0;
    } else if (def.type === 'tiered' && def.tiers) {
      payload.tiers = def.tiers;
    }

    try {
      await setDoc(doc(db, 'achievements', def.id), payload, { merge: true });
      console.log(`[Seed] ✅ achievements/${def.id}`);
      written++;
    } catch (e: any) {
      const msg = `achievements/${def.id}: ${e.message ?? e}`;
      console.error(`[Seed] ❌ ${msg}`);
      errors.push(msg);
    }
  }

  console.log(`[Seed] Done — ${written}/${ACHIEVEMENT_DEFINITIONS.length} written, ${errors.length} errors.`);
  return { written, errors };
}
