/**
 * Per-user purge targets — the Firestore part of purgeUserData (functions/src/onUserDelete.ts)
 * plus the per-user docs it does not cover (design §2.2).
 *
 * Why a list and not a call: purgeUserData is not exported and lives in a deployed GDPR
 * function module that initialises firebase-admin / Storage and firebase-functions at
 * import time (functions/ is a separate package, not installed at the repo root), so a
 * root script cannot import it — and changing that function just to export it would mean
 * a functions deploy for nothing. Instead this list MIRRORS it, and
 * __tests__/purge-targets.test.ts reads onUserDelete.ts and fails if purgeUserData ever
 * touches a collection this list does not. Storage is not mirrored: demo users never upload.
 */

/** Docs keyed by uid; `recursive` = with every subcollection (purgeUserData's recursiveDelete). */
export const PER_USER_DOCS: ReadonlyArray<{ collection: string; recursive: boolean; fromPurgeUserData: boolean }> = [
  { collection: 'users', recursive: true, fromPurgeUserData: true },
  { collection: 'healthSamples', recursive: true, fromPurgeUserData: true },
  { collection: 'ai_coach_threads', recursive: true, fromPurgeUserData: true },
  { collection: 'ai_coach_review_cursors', recursive: false, fromPurgeUserData: true },
  { collection: 'ai_coach_memory', recursive: false, fromPurgeUserData: true },
  { collection: 'ai_coach_proactive', recursive: false, fromPurgeUserData: true },
  { collection: 'presence', recursive: true, fromPurgeUserData: true },
  { collection: 'connections', recursive: true, fromPurgeUserData: true },
  { collection: 'activity', recursive: true, fromPurgeUserData: true },
  { collection: 'kudos', recursive: true, fromPurgeUserData: true },
  // Not in purgeUserData (design §2.2 "מסמכים אישיים שהיא לא מכסה"):
  { collection: 'userPublic', recursive: false, fromPurgeUserData: false },
  { collection: 'userAge', recursive: false, fromPurgeUserData: false },
  { collection: 'streaks', recursive: false, fromPurgeUserData: false },
  { collection: 'user_memberships', recursive: false, fromPurgeUserData: false },
  { collection: 'entitlements', recursive: true, fromPurgeUserData: false },
  { collection: 'military_declarations', recursive: false, fromPurgeUserData: false },
  { collection: 'userLocations', recursive: false, fromPurgeUserData: false },
  { collection: 'active_workouts', recursive: false, fromPurgeUserData: false },
];

/** Docs whose id starts with `${uid}_`. */
export const PER_USER_ID_PREFIX: ReadonlyArray<{ collection: string; fromPurgeUserData: boolean }> = [
  { collection: 'dailyActivity', fromPurgeUserData: true },
  { collection: 'dailyActivityPublic', fromPurgeUserData: false },
  { collection: 'userSchedule', fromPurgeUserData: false },
  { collection: 'league_steps_applied', fromPurgeUserData: false },
  // The seed's own ids also start with the uid (belt and braces next to the field queries).
  { collection: 'workouts', fromPurgeUserData: false },
  { collection: 'feed_posts', fromPurgeUserData: false },
  { collection: 'sessions', fromPurgeUserData: false },
];

/** Docs found by a field equal to the uid. `recursive` for groups (members, chat…). */
export const PER_USER_QUERIES: ReadonlyArray<{ collection: string; field: string; recursive: boolean; fromPurgeUserData: boolean }> = [
  { collection: 'ai_coach_reviews', field: 'uid', recursive: false, fromPurgeUserData: true },
  { collection: 'ai_coach_eval_cases', field: 'sourceUid', recursive: false, fromPurgeUserData: true },
  { collection: 'workout_feedback', field: 'uid', recursive: false, fromPurgeUserData: true },
  { collection: 'generation_log', field: 'uid', recursive: false, fromPurgeUserData: true },
  { collection: 'generation_reviews', field: 'uid', recursive: false, fromPurgeUserData: true },
  { collection: 'feed_posts', field: 'authorUid', recursive: true, fromPurgeUserData: true },
  { collection: 'community_groups', field: 'createdBy', recursive: true, fromPurgeUserData: true },
  { collection: 'workouts', field: 'userId', recursive: false, fromPurgeUserData: true },
  { collection: 'sessions', field: 'userId', recursive: false, fromPurgeUserData: true },
  { collection: 'planned_sessions', field: 'userId', recursive: true, fromPurgeUserData: false },
  { collection: 'league_scope_stats_processed', field: 'uid', recursive: false, fromPurgeUserData: false },
];

/**
 * Chats: purgeUserData deletes DMs and only removes the uid from group chats (the other,
 * real members keep the history). In the demo world every participant is demo or a viewer,
 * so the whole chat goes — and a chat with any OTHER participant stops the purge (a leak).
 */
export const CHATS_COLLECTION = 'chats';

/** Every collection the per-user part covers (for the parity test). */
export function perUserCollections(): Set<string> {
  return new Set([
    ...PER_USER_DOCS.map((x) => x.collection),
    ...PER_USER_ID_PREFIX.map((x) => x.collection),
    ...PER_USER_QUERIES.map((x) => x.collection),
    CHATS_COLLECTION,
  ]);
}

/** Collections that hold demo-scope aggregates, keyed by a `demo-` id prefix. */
export const SCOPE_ID_PREFIX_COLLECTIONS = ['leaderboard_shards', 'leaderboard_snapshots', 'unit_league_aggregates', 'unitDirectory'] as const;

/** Collections swept by authorityId ∈ demo authorities (catches strays). */
export const SCOPE_AUTHORITY_COLLECTIONS = ['sessions', 'feed_posts', 'maintenance_reports', 'manager_notifications', 'community_events', 'planned_sessions'] as const;
