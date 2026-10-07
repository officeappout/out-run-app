/**
 * push-copy-resolver.service — resolves a push_events `variantId` back to
 * its real message text, for the Push Performance table (07.10.2026
 * follow-up). Pure/sync half lives here; the content-library half needs a
 * live Firestore read and is done by the caller (push-performance-summary
 * route) using the helpers below to know WHAT to look up.
 *
 * Two resolution paths, matching how variantId is actually constructed at
 * send time (functions/src) — confirmed by reading each sender, not
 * assumed:
 *
 *   1. Content-library senders (stepGoalNudgeScheduler.ts,
 *      onPlannedActivityCreated.ts) — variantId IS the content library's
 *      own `bundleId`. The body lives in Firestore
 *      (`workoutMetadata/notifications/notifications`, the SAME collection
 *      those senders themselves read via notification-content.service.ts)
 *      and must be looked up live — that's the whole point of a content
 *      library, the text changes without a code deploy. The title is a
 *      hardcoded constant at each sender, mirrored below (same
 *      cross-project-boundary constraint persona-alias-map.service.ts's
 *      own header already documents: the Next.js app can't import
 *      functions/src directly, no shared paths/workspaces config).
 *
 *   2. Synthetic-variantId senders (trainingReminderScheduler.ts,
 *      reminderSweepScheduler.ts passes 1 & 2) — variantId is
 *      `${title}__b${bodyIndex}` (the 07.10.2026 variant-tagging fix).
 *      Parsed back into title + bodyIndex, then the body text comes from a
 *      HAND-MIRRORED copy of the relevant BODY_VARIANTS array — same
 *      mirror-by-hand pattern as the titles above, applied to bodies.
 *
 * Every resolver here is best-effort: returns `null` (never throws) when a
 * variant can't be resolved, so a caller falls back to the raw variantId —
 * a bad/unrecognized variant must never break the table.
 */

export interface ResolvedCopy {
  title: string;
  body: string;
}

// ── Path 2: hand-mirrored BODY_VARIANTS — keep in sync by hand with: ──────
//   - functions/src/trainingReminderScheduler.ts's BODY_VARIANTS (used by
//     buildMessage(), shared by trainingReminderScheduler itself AND
//     reminderSweepScheduler's pass 2, which imports buildMessage() from
//     that same file — hence the one array covering 2 categories below).
//   - functions/src/reminderSweepScheduler.ts's OWN local BODY_VARIANTS
//     (pass 1 only — a distinct, separate array).

const SCHEDULED_WORKOUT_BODY_VARIANTS = [
  'האימון שלך מחכה — פתח את האפליקציה ותתחיל.',
  'הזמן שלך להתאמן הגיע. אפילו 15 דקות עושות את ההבדל 💪',
  'רגע קטן לעצמך היום — האימון שלך מוכן ומחכה בפארק.',
];

const REMINDER_SWEEP_BODY_VARIANTS = [
  'הזמן שקבעת לאימון הגיע — בוא נזוז 💪',
  'תזכורת: זה הזמן שלך להתאמן.',
  'רגע קטן לעצמך — האימון שקבעת מחכה.',
];

const SYNTHETIC_VARIANT_BODY_SOURCE: Record<string, string[]> = {
  ScheduledWorkout: SCHEDULED_WORKOUT_BODY_VARIANTS,
  ReminderSweepWorkout: SCHEDULED_WORKOUT_BODY_VARIANTS,
  ReminderSweep: REMINDER_SWEEP_BODY_VARIANTS,
};

/** Parses the `${title}__b${bodyIndex}` shape — see trainingReminderScheduler.ts / reminderSweepScheduler.ts's sendPush call sites. */
function parseSyntheticVariantId(variantId: string): { title: string; bodyIndex: number } | null {
  const match = variantId.match(/^(.*)__b(\d+)$/);
  if (!match) return null;
  const bodyIndex = Number(match[2]);
  if (!Number.isFinite(bodyIndex)) return null;
  return { title: match[1], bodyIndex };
}

/** Resolves a synthetic (title__bN) variantId for the 3 non-content-library measured categories. Returns null if the category/variantId don't match this shape. */
export function resolveSyntheticVariant(category: string, variantId: string): ResolvedCopy | null {
  const bodies = SYNTHETIC_VARIANT_BODY_SOURCE[category];
  if (!bodies) return null;
  const parsed = parseSyntheticVariantId(variantId);
  if (!parsed || parsed.bodyIndex < 0 || parsed.bodyIndex >= bodies.length) return null;
  return { title: parsed.title, body: bodies[parsed.bodyIndex] };
}

// ── Path 1: content-library senders — hardcoded titles, mirrored (same
// cross-project-boundary reasoning as above). The body is NOT mirrored —
// it must come from a live Firestore read by the caller. ─────────────────

const CONTENT_LIBRARY_TITLE_BY_CATEGORY: Record<string, string> = {
  Daily_Goal: '💪 יעד הצעדים היומי', // stepGoalNudgeScheduler.ts's PUSH_TITLE constant
  Future_Partner_Plan: 'מישהו מתאמן לידך', // onPlannedActivityCreated.ts's hardcoded title
};

/** True for a category whose body lives in the workoutMetadata/notifications/notifications content library (variantId = bundleId), rather than being resolvable from code alone. */
export function isContentLibraryCategory(category: string): boolean {
  return category in CONTENT_LIBRARY_TITLE_BY_CATEGORY;
}

export function contentLibraryTitleFor(category: string): string | null {
  return CONTENT_LIBRARY_TITLE_BY_CATEGORY[category] ?? null;
}
