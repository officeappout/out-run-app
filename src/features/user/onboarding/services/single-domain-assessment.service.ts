/**
 * Single-Domain Assessment Writer
 *
 * Thin wrapper around the existing `onboarding-sync.service.ts` writer
 * (`syncOnboardingToFirestore`) that persists JUST ONE domain's newly-assessed
 * level, without touching any other already-assessed domain.
 *
 * Reuses the EXISTING body_focus/single-domain code path inside
 * `syncOnboardingToFirestore` (Ghost Purge + SKILL_TO_FOUNDATION_OFFSET logic
 * live entirely inside that function — nothing here reimplements them). This
 * is the same mechanism every "chest only" / "legs only" body-focus onboarding
 * user already exercises today; this module only shapes the payload for the
 * "one more domain, on an already-onboarded profile" mini-assessment case and
 * calls the same writer.
 *
 * Mechanism that keeps other domains undisturbed (not new — see
 * onboarding-sync.service.ts ~line 1164): the writer only writes a
 * `progression.tracks.{domain}` entry when `masterProgramSubLevels[domain] > 0`.
 * By zeroing every OTHER primary category here, none of them get written or
 * touched; the existing tracks the user already has for other domains are
 * merged in unchanged (`{...existingTracks, ...quizTracks}`).
 *
 * IMPORTANT: `syncOnboardingToFirestore` reads `onboarding_program_path` /
 * `onboarding_muscle_focus` directly from `sessionStorage` (not from its `data`
 * argument) to decide whether to take the body_focus single-domain branch.
 * The mini-assessment launcher (`mini-domain-assessment.ts`) is responsible for
 * seeding those keys BEFORE this function is called — see that module.
 *
 * ISOMORPHIC-friendly: the pure builder below has no I/O and is fully unit
 * testable; only `writeSingleDomainAssessment` touches Firebase.
 */

import { syncOnboardingToFirestore } from './onboarding-sync.service';

/** The four base assessment categories the visual-assessment slider covers. */
export const PRIMARY_CATEGORIES = ['push', 'pull', 'legs', 'core'] as const;
export type PrimaryCategory = (typeof PRIMARY_CATEGORIES)[number];

export interface SingleDomainAssignedResult {
  programId: string;
  levelId: string;
  masterProgramSubLevels: Record<string, number>;
}

/**
 * Pure builder: shapes the `assignedResults` payload for a SINGLE assessed
 * domain. All OTHER base categories are explicitly zeroed so onboarding-sync's
 * existing "only write childLevel > 0" rule leaves them untouched — this is
 * the exact existing mechanism (not a new one) that keeps other domains
 * undisturbed by this write.
 */
export function buildSingleDomainAssignedResult(
  domain: string,
  level: number,
): SingleDomainAssignedResult[] {
  const safeLevel = Math.max(1, Math.round(level));
  const masterProgramSubLevels: Record<string, number> = Object.fromEntries(
    PRIMARY_CATEGORIES.map((cat) => [cat, cat === domain ? safeLevel : 0]),
  );
  return [
    {
      programId: domain,
      levelId: `${domain}_level_${safeLevel}`,
      masterProgramSubLevels,
    },
  ];
}

/**
 * Persists a single domain's assessed level via the EXISTING onboarding-sync
 * writer. Requires `onboarding_program_path` = 'body_focus' and
 * `onboarding_muscle_focus` = JSON.stringify([domain]) to already be set in
 * sessionStorage (done by the mini-assessment launcher) so
 * `syncOnboardingToFirestore`'s Path B single-domain branch fires correctly.
 *
 * Returns the same boolean `syncOnboardingToFirestore` returns (true = synced).
 */
export async function writeSingleDomainAssessment(
  domain: string,
  level: number,
): Promise<boolean> {
  const assignedResults = buildSingleDomainAssignedResult(domain, level);
  return syncOnboardingToFirestore('COMPLETED', { assignedResults });
}
