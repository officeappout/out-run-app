/**
 * Firestore collections of the admin-panel assistant — Admin SDK ONLY. Each has an explicit
 * `allow read, write: if false` block in firestore.rules (no client access; the root-admin
 * catch-all still applies, see the comment there).
 *
 *   admin_ai_threads/{uid}                 { summary, summarizedUntil, messageCount, updatedAt }
 *   admin_ai_threads/{uid}/messages/{id}   { role, text, links[], evidence?, createdAt, expireAt (90d) }
 *   admin_ai_audit/{id}                    { uid, question≤500, route, tools[], model, usage, costUsd,
 *                                            guardFailed, rating?, createdAt, expireAt (180d) }
 *   admin_ai_stats/{YYYY-MM-DD}            { costUsd, modelCalls, questions, localNav, quick, updatedAt }
 *                                          — Israel day; costUsd is the admin daily budget's ledger
 */
export const ADMIN_AI_THREADS = 'admin_ai_threads';
export const ADMIN_AI_AUDIT = 'admin_ai_audit';
export const ADMIN_AI_STATS = 'admin_ai_stats';

/** The `feature` tag on the shared AI usage ledger (ai_usage / ai_usage_global). */
export const ADMIN_AI_FEATURE = 'admin_ai';
