/**
 * logExerciseSwap — the ONE writer of exercise_swaps/{auto} (soft-adaptation
 * Phase 0). Called from every user-facing swap entry point; never from the
 * engine's internal substitutions or the Skill-Tree level override.
 *
 * Fire-and-forget by contract: returns void synchronously, never throws,
 * never awaits the network. Offline, Firestore's persistent local cache
 * (src/lib/firebase.ts — persistentLocalCache) queues the addDoc and sends
 * it on reconnect; if even that fails we only console.warn — a lost swap
 * log must never block or undo the swap the user asked for.
 *
 * Not gated on analytics consent: this is product data (adaptation input),
 * scoped to the signed-in user's own uid by firestore.rules. The admin-side
 * aggregate (exercise_stats, onExerciseSwapCreated) carries no uid.
 */
import { buildExerciseSwapPayload, resolveAppVersion, type ExerciseSwapInput } from './build-swap-log';

export type LogExerciseSwapInput = Omit<ExerciseSwapInput, 'userId' | 'appVersion'> & {
  /** Defaults to auth.currentUser.uid. */
  userId?: string;
};

export function logExerciseSwap(input: LogExerciseSwapInput): void {
  if (typeof window === 'undefined') return;
  void (async () => {
    try {
      const [{ auth, db }, { addDoc, collection, serverTimestamp }] = await Promise.all([
        import('@/lib/firebase'),
        import('firebase/firestore'),
      ]);
      const uid = input.userId ?? auth.currentUser?.uid;
      if (!uid) return;
      const payload = buildExerciseSwapPayload({
        ...input,
        userId: uid,
        appVersion: resolveAppVersion(),
      });
      if (!payload) return;
      await addDoc(collection(db, 'exercise_swaps'), { ...payload, at: serverTimestamp() });
    } catch (err) {
      console.warn('[logExerciseSwap] swap log not written (swap itself unaffected):', err);
    }
  })();
}
