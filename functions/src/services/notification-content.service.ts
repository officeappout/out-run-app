/**
 * notification-content.service — generic selector over the existing
 * "מנהל התראות" (Notification Manager) content library.
 *
 * Backing store: `workoutMetadata/notifications/notifications` — the SAME
 * 201-entry collection David authors through the admin panel
 * (`src/app/admin/workout-settings/page.tsx`). This module does not create
 * a parallel store; it's a read-only query layer on top of the existing one.
 *
 * Built GENERICALLY (any triggerType / bundleIdPrefix / persona combination),
 * but its FIRST live caller is `stepGoalNudgeScheduler.ts` only — the 3
 * existing hardcoded schedulers (retentionScheduler, onboardingDropoffDispatcher,
 * trainingReminderScheduler) are deliberately NOT migrated to this selector
 * yet. See `.claude/knowledge/notification-manager-wiring-design.md` §Step 2
 * scope decision for the reasoning (narrower blast radius for the first
 * live-data pass; migrating the other 3 needs its own full @tag-resolver
 * port and its own separately-flagged rollout).
 *
 * Selection logic mirrors the admin UI's own `loadNotifications()` pattern
 * (`page.tsx:664-678`) — fetch the whole subcollection (201 docs is cheap),
 * filter in-memory. Cached in-process with a TTL, same shape as
 * `push.service.ts`'s `channelConfigCache`.
 *
 * Tag resolution: the real content library uses `@word` placeholders
 * (e.g. `@שם`), resolved client-side today by
 * `src/features/content/branding/core/branding.utils.ts`'s
 * `resolveNotificationText()` — that's `src/` code, not importable into
 * `functions/src` (same cross-project boundary as the persona alias-map).
 * `personaliseNotificationText()` below is a DELIBERATELY MINIMAL mirror —
 * `@שם` (name) plus generic `{word}` placeholders (the same `{var}`-replace
 * pattern retentionScheduler.ts/onboardingDropoffDispatcher.ts/
 * onGroupMemberJoin.ts already use), driven by an arbitrary vars map so
 * callers can template in computed values like `{steps_left}`. Extend here
 * if a future message needs more of the full `@tag` vocabulary (location /
 * league rank / social context) rather than porting the whole resolver
 * speculatively.
 */

import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import {
  resolveCanonicalPersona,
  normalizePersonaValue,
  type CanonicalPersona,
} from './persona-alias-map.service';

const getDb = () => admin.firestore();

const COLLECTION_PATH = 'workoutMetadata/notifications/notifications';
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min — content changes rarely, admin-authored

interface NotificationLibraryDoc {
  id: string;
  triggerType?: string;
  persona?: string;
  bundleId?: string;
  text?: string;
  dailyGoalBucket?: string;
  activityType?: string;
  psychologicalTrigger?: string;
}

let contentCache: { docs: NotificationLibraryDoc[]; fetchedAt: number } | null = null;

/**
 * Fetch the entire notification-library subcollection, cached in-process.
 * No `where()` filter — mirrors the admin UI's own approach; at ~201 docs
 * this is a cheap full fetch, filtering happens here in-memory instead.
 */
async function getAllNotifications(): Promise<NotificationLibraryDoc[]> {
  const now = Date.now();
  if (contentCache && now - contentCache.fetchedAt <= CACHE_TTL_MS) {
    return contentCache.docs;
  }
  const snap = await getDb().collection(COLLECTION_PATH).get();
  const docs = snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      triggerType: typeof data.triggerType === 'string' ? data.triggerType : undefined,
      persona: typeof data.persona === 'string' ? data.persona : undefined,
      bundleId: typeof data.bundleId === 'string' ? data.bundleId : undefined,
      text: typeof data.text === 'string' ? data.text : undefined,
      dailyGoalBucket: typeof data.dailyGoalBucket === 'string' ? data.dailyGoalBucket : undefined,
      activityType: typeof data.activityType === 'string' ? data.activityType : undefined,
      psychologicalTrigger: typeof data.psychologicalTrigger === 'string' ? data.psychologicalTrigger : undefined,
    };
  });
  contentCache = { docs, fetchedAt: now };
  logger.info(`[notification-content] cache refreshed — ${docs.length} doc(s)`);
  return docs;
}

/** Deterministic candidate pick — same hash(uid) pattern already used by
 * retentionScheduler.ts / onboardingDropoffDispatcher.ts. NOT a
 * priority-weighted getBestMessage()-style system — the schema has no
 * priority field, and that pattern is separate, explicitly-deferred future
 * work (see the Phase-0 locked decisions). */
function hashUid(uid: string): number {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    hash = ((hash << 5) - hash + uid.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export interface SelectNotificationOpts {
  triggerType: string;
  /** Narrows within a triggerType, e.g. 'steps_' — needed because
   * triggerType alone is coarse (a shared category like 'Habit_Maintenance'
   * could hold unrelated future content too). */
  bundleIdPrefix?: string;
  persona: CanonicalPersona;
  /** Narrows to a specific daily-goal-completion bucket (Daily_Goal trigger
   * only). When set, only exact-matching docs qualify — no bucket fallback,
   * since 'start' copy read at 'hit' time would be wrong, not just generic. */
  dailyGoalBucket?: string;
  /** Narrows to a specific activity (Daily_Goal trigger only). Same
   * exact-match rule as dailyGoalBucket. */
  activityType?: string;
  /** For deterministic selection among multiple matching candidates. */
  uid: string;
}

export interface SelectedNotification {
  text: string;
  bundleId: string;
  docId: string;
  psychologicalTrigger?: string;
}

/**
 * Select one message from the content library matching the given
 * triggerType (+ optional bundleId prefix), targeted at the given
 * persona (or a 'generic' message, which matches any persona). Returns
 * null if nothing matches — callers must handle this (no message to send
 * is a valid, expected outcome, not an error).
 */
export async function selectNotificationContent(
  opts: SelectNotificationOpts,
): Promise<SelectedNotification | null> {
  const all = await getAllNotifications();

  const candidates = all.filter((doc) => {
    if (doc.triggerType !== opts.triggerType) return false;
    if (opts.bundleIdPrefix && !(doc.bundleId ?? '').startsWith(opts.bundleIdPrefix)) return false;
    if (opts.dailyGoalBucket && doc.dailyGoalBucket !== opts.dailyGoalBucket) return false;
    if (opts.activityType && doc.activityType !== opts.activityType) return false;
    if (!doc.text) return false;
    const docPersona = normalizePersonaValue(doc.persona) ?? 'generic';
    return docPersona === opts.persona || docPersona === 'generic';
  });

  if (candidates.length === 0) {
    logger.info(
      `[notification-content] no candidates: triggerType=${opts.triggerType} ` +
        `bundleIdPrefix=${opts.bundleIdPrefix ?? '(none)'} persona=${opts.persona}`,
    );
    return null;
  }

  const chosen = candidates[hashUid(opts.uid) % candidates.length];
  return {
    text: chosen.text as string,
    bundleId: chosen.bundleId ?? '',
    docId: chosen.id,
    psychologicalTrigger: chosen.psychologicalTrigger,
  };
}

export interface PersonaliseVars {
  name?: string;
  /** @רצף — raw streak day count. */
  streakDays?: number;
  /** @צעדים_שנותרו — remaining count to today's daily goal. */
  stepsLeft?: number;
  /** @מרחק — suggested route distance in meters (Daily_Goal), or proximity
   *  distance (Proximity content, if ever routed through this selector). */
  distanceMeters?: number;
  /** @דקות — approximate walking minutes to close today's step gap
   *  (Daily_Goal, walking only). Pre-computed by the caller. */
  walkMinutes?: number;
}

/**
 * Minimal tag resolver — a deliberate mirror of the specific tags
 * `branding.utils.ts`'s resolveNotificationText/resolveDescription needs
 * for Cloud-Function-sent copy (that file is `src/`, not importable here —
 * see module header). Supports:
 *   @שם              → vars.name (fallback 'חבר')
 *   @רצף             → vars.streakDays (fallback '0')
 *   @צעדים_שנותרו    → vars.stepsLeft, locale-formatted (fallback '0')
 *   @מרחק            → vars.distanceMeters, formatted as meters/km exactly
 *                       like the client-side @מרחק tag (fallback 'קרוב')
 *   @דקות            → vars.walkMinutes (fallback '0')
 *   {anyKey}         → arbitrary extra vars (generic {var}-replace, same
 *                       regex every other scheduler in this codebase uses;
 *                       missing keys resolve to '' rather than leaving the
 *                       placeholder literal in the sent copy)
 */
export function personaliseNotificationText(
  text: string,
  vars: PersonaliseVars & Record<string, string | number | undefined>,
): string {
  // Generic {key} pass runs FIRST, on the raw template only — every
  // legitimate {word} placeholder is authored by David in the panel, not
  // user-controlled. @שם's replacement value (a free-text, user-controlled
  // display name) is spliced in LAST specifically so it is never re-scanned
  // by this pass — a name containing a literal "{steps_left}"-shaped
  // substring must never be treated as a template placeholder.
  let result = text.replace(/\{(\w+)\}/g, (_, key: string) => {
    const v = vars[key];
    return v === undefined ? '' : String(v);
  });
  result = result.replace(/@רצף/g, () =>
    vars.streakDays !== undefined && vars.streakDays !== null ? String(vars.streakDays) : '0',
  );
  result = result.replace(/@צעדים_שנותרו/g, () =>
    vars.stepsLeft !== undefined && vars.stepsLeft !== null
      ? vars.stepsLeft.toLocaleString('he-IL')
      : '0',
  );
  result = result.replace(/@מרחק/g, () => {
    if (vars.distanceMeters === undefined || vars.distanceMeters === null) return 'קרוב';
    if (vars.distanceMeters < 1000) return `${vars.distanceMeters} מטר`;
    return `${(vars.distanceMeters / 1000).toFixed(1)} ק"מ`;
  });
  result = result.replace(/@דקות/g, () =>
    vars.walkMinutes !== undefined && vars.walkMinutes !== null ? String(vars.walkMinutes) : '0',
  );
  result = result.replace(/@שם/g, vars.name || 'חבר');
  return result;
}

// Re-exported for callers that only need persona resolution, not selection.
export { resolveCanonicalPersona };
