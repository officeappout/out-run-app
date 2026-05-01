/**
 * Stage Titles — Hebrew display names for the 10-stage Lemur evolution.
 *
 * SCOPE: A simple integer → Hebrew label map for UI surfaces that show a
 * compact "level title" next to a user (partner cards, profile sheets,
 * partner bubbles). Stage numbers are 1–10, mirroring `lemurStage` from
 * `progression.lemurStage`.
 *
 * This is intentionally separate from `lemur-stages.ts` (which carries
 * gendered XP names + minXP thresholds for the global XP system) — those
 * names are too long for inline chips. Use this map when you need a single
 * neutral 2-3 character Hebrew label.
 *
 * Source of truth for the mapping: previously inlined in
 * `UserProfileSheet.tsx`; centralised here so the partner card and the
 * profile sheet stay in lockstep.
 */

export const STAGE_TITLES: Record<number, string> = {
  1: 'מתחיל',
  2: 'שוחר',
  3: 'מתאמן',
  4: 'פעיל',
  5: 'יציב',
  6: 'מתקדם',
  7: 'חזק',
  8: 'אלוף',
  9: 'מאסטר',
  10: 'אגדה',
};

/**
 * Resolve a stage label, falling back to a generic "שלב N" when the stage
 * is out of range (e.g. >10 if the system ever extends).
 */
export function getStageTitle(stage: number | null | undefined): string {
  if (stage == null || stage <= 0) return STAGE_TITLES[1];
  return STAGE_TITLES[stage] ?? `שלב ${stage}`;
}
