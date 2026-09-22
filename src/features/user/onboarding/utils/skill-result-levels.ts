/**
 * D2 (multi-select program path, Phase 1): baseline foundational levels for
 * a Path C (skills) assessment result, before the async CMS
 * parentLevelMapping override loop (assessment-visual/page.tsx's
 * buildSkillResult) runs on top.
 *
 * push/pull/legs start at 0 — a skill-only user never undergoes a
 * push/pull/legs visual slider assessment; seeding a non-zero default would
 * contaminate `masterProgramSubLevels` and bypass the Ghost Purge in
 * onboarding-sync.service.ts (which only removes entries whose
 * `currentLevel === 0`). `push`/`pull` may be overridden afterward by the
 * CMS parentLevelMapping formula; `legs` has no slider for a skill-only
 * selection and stays 0 by design.
 *
 * `core` reads the real assessed level when present: the union resolver
 * (assessment-path-config.service.ts) now adds a literal 'core' category to
 * any skill selection (outside mini-domain-assessment top-up mode), so
 * `skillLevels['core']` holds a genuine slider result, not a placeholder.
 */
export function baselineSkillMasterSubLevels(
  skillLevels: Record<string, number>,
): { push: number; pull: number; legs: number; core: number } {
  return {
    push: 0,
    pull: 0,
    legs: 0,
    core: skillLevels['core'] ?? 0,
  };
}
