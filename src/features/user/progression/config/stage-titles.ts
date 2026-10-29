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

import { makeLiveT } from '@/lib/i18n/live-t';
import { profile } from '@/messages/ns/profile';

const t = makeLiveT(profile);

export const STAGE_TITLES: Record<number, string> = {
  get 1() { return t('stageTitle.1'); },
  get 2() { return t('stageTitle.2'); },
  get 3() { return t('stageTitle.3'); },
  get 4() { return t('stageTitle.4'); },
  get 5() { return t('stageTitle.5'); },
  get 6() { return t('stageTitle.6'); },
  get 7() { return t('stageTitle.7'); },
  get 8() { return t('stageTitle.8'); },
  get 9() { return t('stageTitle.9'); },
  get 10() { return t('stageTitle.10'); },
};

/**
 * Resolve a stage label, falling back to a generic "שלב N" when the stage
 * is out of range (e.g. >10 if the system ever extends).
 */
export function getStageTitle(stage: number | null | undefined): string {
  if (stage == null || stage <= 0) return STAGE_TITLES[1];
  return STAGE_TITLES[stage] ?? t('stageTitle.fallback', { stage: String(stage) });
}
