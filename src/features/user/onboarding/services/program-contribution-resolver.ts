/**
 * Program Contribution Resolver
 *
 * Phase 3 (union-based program/track creation): pure, side-effect-free
 * transforms that turn a raw `assignedResults` array into the contribution
 * ONE card's selection makes toward the final written program set.
 *
 * Extracted from onboarding-sync.service.ts's two mutually-exclusive
 * `isPathCSkills` / `isPathBBodyFocus` branches (Phase 1b), which only ever
 * used the PRIMARY (first-tapped) card — silently dropping a co-selected
 * secondary card's contribution. The caller now computes each card's
 * contribution independently via these functions and unions the results,
 * instead of picking exactly one branch.
 *
 * No Firestore access, no sessionStorage reads — every input is passed in
 * explicitly so this stays unit-testable in isolation.
 */

import {
  getFocusDomainsForMuscleFocus,
  applySkillCollisionSuppression,
} from './assessment-path-config.service';

export interface AssignedResultEntry {
  programId: string;
  levelId: string;
  masterProgramSubLevels?: Record<string, number>;
}

const PRIMARY_CATEGORIES = ['push', 'pull', 'legs', 'core'] as const;

/**
 * Skills card contribution: Specialist (1 skill) vs Generalist (2+ skills)
 * program linkage. Mirrors the pre-Phase-3 `isPathCSkills` branch body
 * verbatim, plus Decision 2 (approved Phase 3 plan): the generalist rebuild
 * now carries over ALL FOUR of push/pull/legs/core from the primary result's
 * masterProgramSubLevels when genuinely assessed (> 0) — not just `core` (the
 * original D2 fix's narrower scope). Symmetric with this file's "no ghost
 * data, preserve genuinely assessed values" convention used throughout
 * onboarding-sync.service.ts.
 */
export function resolveSkillContribution(
  skillIds: string[],
  effectiveResults: AssignedResultEntry[],
): AssignedResultEntry[] {
  const skillResults = skillIds
    .map((sid) => effectiveResults.find((r) => r.programId === sid))
    .filter((r): r is AssignedResultEntry => r != null);
  if (skillResults.length === 0) {
    const fallback = effectiveResults[0];
    if (!fallback) return [];
    skillResults.push(fallback);
  }
  const primaryResult = skillResults[0];

  if (skillIds.length === 1) {
    return [{ ...primaryResult, programId: skillIds[0], levelId: primaryResult.levelId }];
  }

  const carriedDomains: Record<string, number> = {};
  for (const domain of PRIMARY_CATEGORIES) {
    const v = primaryResult.masterProgramSubLevels?.[domain];
    if (v) carriedDomains[domain] = v;
  }

  return [
    {
      ...primaryResult,
      programId: 'calisthenics_upper',
      levelId: primaryResult.levelId,
      masterProgramSubLevels: {
        ...Object.fromEntries(
          skillResults.map((r) => {
            const m = r.levelId.match(/(\d+)/);
            return [r.programId, m ? Math.max(1, parseInt(m[1], 10)) : 1];
          }),
        ),
        // D2 (Phase 1b) + Decision 2 (Phase 3): a real assessed push/pull/legs/core
        // level would otherwise be silently dropped here — this object used to be
        // a full replacement of primaryResult's masterProgramSubLevels, keeping
        // only the skill-id→level pairs.
        ...carriedDomains,
      },
    },
  ];
}

/**
 * Category card contribution: Health and/or Body Focus, expanded into one
 * entry per assessed domain (or a single combined entry for a single-domain
 * selection). Mirrors the pre-Phase-3 `isPathBBodyFocus` branch body, plus:
 *
 *  - Decision 1 (approved Phase 3 plan, "Health-widening"): Health
 *    contributes all 4 PRIMARY_CATEGORIES unconditionally (matching the
 *    read-side union resolver in assessment-path-config.service.ts's
 *    `resolveUnionCategories`), unioned with Body Focus's muscle-derived
 *    domains when Body Focus is also selected.
 *  - Decision 3 (approved Phase 3 plan): reuses `applySkillCollisionSuppression`
 *    (already used on the read/slider side for D3) so a push/pull-deriving
 *    skill is the sole source of truth for that domain when co-selected with
 *    a same-domain muscle chip/Health — the category contribution yields no
 *    redundant entry for a domain the skill already owns. Caller passes an
 *    empty `skillIds` when the Skills card isn't itself contributing, so
 *    suppression only ever applies when a skill genuinely co-selected.
 */
export function resolveCategoryContribution(
  cardOrder: string[],
  muscleIds: string[],
  skillIds: string[],
  primaryResult: AssignedResultEntry,
): AssignedResultEntry[] {
  let domains: string[] = [];
  if (cardOrder.includes('health')) {
    domains.push(...PRIMARY_CATEGORIES);
  }
  if (muscleIds.length > 0) {
    domains.push(...getFocusDomainsForMuscleFocus(muscleIds));
  }
  domains = Array.from(new Set(domains));
  const categories = applySkillCollisionSuppression(domains, skillIds);

  if (categories.length === 0) return [];

  const masterSub: Record<string, number> =
    primaryResult.masterProgramSubLevels ?? { push: 0, pull: 0, legs: 0, core: 0 };

  // Only expand domains that have a real assessed level (> 0).
  const assessedDomains = categories.filter((d) => (masterSub[d] ?? 0) > 0);

  if (assessedDomains.length > 1) {
    // ── Multi-domain: one independent result per assessed domain ──────
    // masterProgramSubLevels is intentionally omitted — each domain is
    // its own leaf program, not a master with children.
    return assessedDomains.map((domain) => ({
      programId: domain,
      levelId: `${domain}_level_${masterSub[domain]}`,
      masterProgramSubLevels: undefined,
    }));
  }

  // ── Single-domain (or nothing individually crossed the >0 bar): keep
  // the single-result behaviour, falling back to the first candidate
  // category (never empty here — `categories.length === 0` already
  // returned above) so a single-domain selection never silently drops.
  const singleDomain = assessedDomains[0] ?? categories[0] ?? 'push';
  const singleLevel =
    (masterSub[singleDomain] ?? 0) || Math.max(...Object.values(masterSub)) || 1;
  return [
    {
      ...primaryResult,
      programId: singleDomain,
      levelId: `${singleDomain}_level_${singleLevel}`,
      masterProgramSubLevels: undefined,
    },
  ];
}
