/**
 * Baseline foundational levels for a Path C (skills) assessment result,
 * before the async CMS parentLevelMapping override loop
 * (assessment-visual/page.tsx's buildSkillResult) runs on top.
 *
 * Multi-select program path (Phase 1b): `skillLevels` is keyed by whatever
 * the union resolver (assessment-path-config.service.ts) put in
 * `categories` — skill ladder IDs (planche, front_lever, ...) AND, for a
 * skill selection co-selected with Health/Body Focus, literal push/pull/
 * legs/core categories with their OWN real slider result. Read each of the
 * 4 directly from `skillLevels` when present, falling back to 0 (matching
 * the original zero-baseline behavior for a skill-only selection, where
 * none of push/pull/legs/core are ever literal category keys).
 *
 * push/pull have a SECOND source — the CMS parentLevelMapping formula
 * (buildSkillResult's own loop) derives them from an assessed skill level
 * and Math.max()s on top of whatever this function returns. The two
 * sources never collide: D3 collision suppression guarantees a
 * push/pull-deriving skill and a literal push/pull category are mutually
 * exclusive in the same union (the union resolver removes the literal
 * category whenever a same-domain skill is present) — so this function
 * only ever returns a genuine non-zero push/pull when NO skill claims that
 * domain, and the CMS loop only ever raises it when a skill does.
 *
 * `legs` has no second source (no skill ever derives a leg level) — a
 * non-zero value here can only come from a co-selected leg-domain muscle
 * chip's own real slider. A skill-only selection never puts 'legs' in
 * `categories`, so it stays 0 exactly as before.
 */
export function baselineSkillMasterSubLevels(
  skillLevels: Record<string, number>,
): { push: number; pull: number; legs: number; core: number } {
  return {
    push: skillLevels['push'] ?? 0,
    pull: skillLevels['pull'] ?? 0,
    legs: skillLevels['legs'] ?? 0,
    core: skillLevels['core'] ?? 0,
  };
}
