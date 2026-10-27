/**
 * program-meta-cache.ts — one Program-doc fetch per programId per session.
 *
 * W4 (27.10.2026, pilot: progress screen loads slowly): every SkillMapCard
 * called getProgramByTemplateId on mount — up to three Firestore queries per
 * card (doc id → slug → movementPattern), repeated for every card and again
 * on every return to the tab. The card's icon and name wait on it. Program
 * docs are CMS content that doesn't change mid-session, so the in-flight
 * promise is shared and the result kept. A null result or a failure is NOT
 * kept — the next mount retries, same as before.
 */
export function createProgramMetaCache<T>(fetcher: (programId: string) => Promise<T | null>) {
  const cache = new Map<string, Promise<T | null>>();
  return function get(programId: string): Promise<T | null> {
    const hit = cache.get(programId);
    if (hit) return hit;
    const p = fetcher(programId).then(
      (value) => {
        if (value == null) cache.delete(programId);
        return value;
      },
      (err) => {
        cache.delete(programId);
        throw err;
      },
    );
    cache.set(programId, p);
    return p;
  };
}
