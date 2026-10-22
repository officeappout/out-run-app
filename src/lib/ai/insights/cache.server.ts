/**
 * Workout insights — one answer per finished workout (Admin SDK only; no client rule grants
 * access to this collection, so it stays server-side under the default deny).
 *
 *   ai_workout_insights/{uid}_{key}  { uid, key, insight, funny, model, createdAt }
 *
 * Read and write failures are swallowed: the cache only saves money, it never blocks a line.
 */
import 'server-only';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import type { WorkoutInsightLines } from './schema';

export const INSIGHT_CACHE_COLLECTION = 'ai_workout_insights';

const docId = (uid: string, key: string) => `${uid}_${key}`.slice(0, 1400);

export async function readCachedInsight(db: Firestore, uid: string, key: string): Promise<WorkoutInsightLines | null> {
  try {
    const snap = await db.collection(INSIGHT_CACHE_COLLECTION).doc(docId(uid, key)).get();
    if (!snap.exists) return null;
    const d = snap.data() ?? {};
    if (d.uid !== uid) return null;
    return {
      insight: typeof d.insight === 'string' ? d.insight : null,
      funny: typeof d.funny === 'string' ? d.funny : null,
    };
  } catch (err) {
    console.warn('[insights] cache read failed', (err as Error)?.name);
    return null;
  }
}

export async function writeCachedInsight(
  db: Firestore,
  uid: string,
  key: string,
  lines: WorkoutInsightLines,
  model: string,
): Promise<void> {
  try {
    await db
      .collection(INSIGHT_CACHE_COLLECTION)
      .doc(docId(uid, key))
      .set({ uid, key, insight: lines.insight, funny: lines.funny, model, createdAt: FieldValue.serverTimestamp() });
  } catch (err) {
    console.warn('[insights] cache write failed', (err as Error)?.name);
  }
}
