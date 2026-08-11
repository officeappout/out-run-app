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
 * only `@שם` (name) today. Extend here if a future message needs more of
 * the full tag vocabulary (location / league rank / social context) rather
 * than porting the whole resolver speculatively.
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
  /** For deterministic selection among multiple matching candidates. */
  uid: string;
}

export interface SelectedNotification {
  text: string;
  bundleId: string;
  docId: string;
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
  };
}

/** Minimal @tag resolver — @שם → name today. See module header. */
export function personaliseNotificationText(text: string, vars: { name?: string }): string {
  return text.replace(/@שם/g, vars.name || 'חבר');
}

// Re-exported for callers that only need persona resolution, not selection.
export { resolveCanonicalPersona };
