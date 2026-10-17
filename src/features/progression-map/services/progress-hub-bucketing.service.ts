/**
 * progress-hub-bucketing.service.ts — the structure of the "התקדמות" tab.
 *
 * Pure: plain data in, three ordered lists out. No Firestore, no store, no
 * React — the hook (useProgressHubBuckets.ts) gathers the inputs.
 *
 *   mine            "התוכניות שלי"
 *                   - each active program in priority order (#1 = "ראשי"),
 *                     each followed by its ASSESSED child programs when it
 *                     is a parent;
 *                   - then tracked (assessed, not active) leaf programs,
 *                     highest level first.
 *   needsAssessment "עוד לא בדקת רמה"
 *                   - unassessed children of active parents, and active
 *                     programs that were never assessed. Workouts leave a
 *                     program out until it has a level (absent=absent, see
 *                     resolveChildDomainsForParent), so these get their own
 *                     section with a "check level" CTA.
 *   discover        "גלה עוד" (collapsed)
 *                   - everything else from the catalog, ordered: programs
 *                     that only need their own questionnaire, then locked
 *                     ones (a prerequisite is missing or too low), then
 *                     parent programs. Non-active parents always land here
 *                     (a tracked parent entry is usually a side effect of a
 *                     child assessment, not a choice).
 *
 * Hidden programs (isHidden) are excluded everywhere unless the user has
 * them ACTIVE, or they are a child of an active parent (then they are part
 * of a program the user trains and count in its average).
 *
 * Every id is compared in slug space (resolveSlug) — real activePrograms/
 * tracks data mixes raw Firestore ids and slugs for the same program.
 */
import type { ProgramGateResult } from './program-gating.service';
import { buildFlatTracksBySlug, DOMAIN_HEBREW_LABELS, formatRequirementsHint } from './program-card-state.service';

// ── Parent → children ───────────────────────────────────────────────────

const FOUNDATIONAL_SLUGS: ReadonlySet<string> = new Set([
  'push', 'pull', 'legs', 'core', 'upper_body', 'lower_body', 'full_body',
]);

/** Engine fallbacks when a parent's Program doc isn't loaded / has no subPrograms. */
const STATIC_PARENT_CHILDREN: Readonly<Record<string, readonly string[]>> = {
  full_body: ['push', 'pull', 'legs', 'core'],
  upper_body: ['push', 'pull'],
};

/** Mirrors progression.service.ts's getMasterProgramProgress (EXCLUDED_FROM_AVG / MASTER_CAP). */
const EXCLUDED_FROM_AVERAGE: Readonly<Record<string, readonly string[]>> = { full_body: ['core'] };
const PARENT_LEVEL_CAP: Readonly<Record<string, number>> = { full_body: 15 };

/**
 * The child programs of a parent, in slug space. Same sources the server's
 * master-level averaging reads (progression.service.ts):
 *   - calisthenics_upper: the user's skillFocusIds when set; otherwise its
 *     subPrograms minus the foundational domains.
 *   - anything else: Program.subPrograms; when that is empty (doc not loaded
 *     yet / not set), the engine's static list (full_body = push, pull,
 *     legs, core; upper_body = push, pull).
 * Replaces the hardcoded MASTER_PROGRAM_CHILDREN (full_body → push, pull,
 * legs only), which dropped core and knew no other parent.
 */
export function resolveParentChildSlugs(
  parentSlug: string,
  subProgramSlugs: readonly string[] | undefined,
  skillFocusSlugs?: readonly string[] | null,
): string[] {
  let children: readonly string[];
  if (parentSlug === 'calisthenics_upper') {
    children = skillFocusSlugs && skillFocusSlugs.length > 0
      ? skillFocusSlugs
      : (subProgramSlugs ?? []).filter((s) => !FOUNDATIONAL_SLUGS.has(s));
  } else if (subProgramSlugs && subProgramSlugs.length > 0) {
    children = subProgramSlugs;
  } else {
    children = STATIC_PARENT_CHILDREN[parentSlug] ?? [];
  }
  return Array.from(new Set(children)).filter((s) => s && s !== parentSlug);
}

/** True when this child is left out of its parent's average (full_body's core). */
export function isExcludedFromParentAverage(parentSlug: string, childSlug: string): boolean {
  return (EXCLUDED_FROM_AVERAGE[parentSlug] ?? []).includes(childSlug);
}

/**
 * A parent's level = the rounded mean of its ASSESSED children's levels
 * (excluding EXCLUDED_FROM_AVERAGE), capped per parent — the same formula
 * the server writes. Null when no child has a level yet.
 */
export function averageParentLevel(
  parentSlug: string,
  childSlugs: readonly string[],
  levelsBySlug: Readonly<Record<string, number>>,
): number | null {
  const levels = childSlugs
    .filter((c) => !isExcludedFromParentAverage(parentSlug, c))
    .map((c) => levelsBySlug[c])
    .filter((l): l is number => typeof l === 'number' && l > 0);
  if (levels.length === 0) return null;
  const avg = Math.round(levels.reduce((a, b) => a + b, 0) / levels.length);
  return Math.min(PARENT_LEVEL_CAP[parentSlug] ?? Infinity, avg);
}

/**
 * Assessed levels (> 0) by slug — tracks first, progression.domains fills
 * the gaps. Same "assessed" definition as isDomainAssessed (domains OR
 * tracks), so the hub never disagrees with what the engine admits.
 */
export function buildHubLevelsBySlug(
  tracksRaw: Readonly<Record<string, { currentLevel?: number } | undefined>>,
  domainsRaw: Readonly<Record<string, { currentLevel?: number; level?: number } | number | undefined>>,
  resolveSlug: (id: string) => string,
): Record<string, number> {
  const levels = buildFlatTracksBySlug(tracksRaw as Record<string, { currentLevel?: number } | undefined>, resolveSlug);
  for (const [key, v] of Object.entries(domainsRaw)) {
    const lvl = typeof v === 'number' ? v : (v?.currentLevel ?? v?.level ?? 0);
    const slug = resolveSlug(key);
    if (lvl > 0 && levels[slug] == null) levels[slug] = lvl;
  }
  return levels;
}

// ── Hub bucketing ───────────────────────────────────────────────────────

export type HubMineRole = 'primary' | 'active' | 'child' | 'tracked';

export interface HubMineItem {
  programId: string;
  slug: string;
  role: HubMineRole;
  /** The active parent this child belongs to (role === 'child' only). */
  parentId?: string;
}

export interface HubNeedsAssessmentItem {
  programId: string;
  slug: string;
  /** The active parent this child belongs to; absent for an unassessed active program. */
  parentId?: string;
}

/** 0 = only its own questionnaire is missing, 1 = locked by a prerequisite, 2 = parent. */
export type HubDiscoverKind = 'needs_questionnaire' | 'locked' | 'parent';

export interface HubDiscoverItem {
  programId: string;
  slug: string;
  kind: HubDiscoverKind;
  /** needs_assessment gate: the missing prerequisite domain (slug) the CTA should assess. */
  missingDomainSlug?: string;
  /** locked_prereq gate: the unmet requirements, for the hint text. */
  requirements?: { domainProgramId: string; need: number }[];
}

export interface ProgressHubBuckets {
  mine: HubMineItem[];
  needsAssessment: HubNeedsAssessmentItem[];
  discover: HubDiscoverItem[];
}

export interface ProgressHubInput {
  /** activePrograms' templateIds, priority order. */
  activeIds: readonly string[];
  /** Raw track keys → currentLevel (mixed id/slug keys; ≤0 / missing = unassessed). */
  trackLevels: Readonly<Record<string, number | undefined>>;
  /** Assessed levels by slug (> 0 only) — buildFlatTracksBySlug. */
  levelsBySlug: Readonly<Record<string, number>>;
  /** Child slugs for a parent program; undefined when the program is not a parent. */
  childrenOf: (programId: string) => readonly string[] | undefined;
  /** Discover candidates, catalog order (leaf allow-list + parents). */
  catalog: readonly string[];
  /** Gate result per catalog LEAF id (slug space requirements). Missing = available. */
  gates: Readonly<Record<string, ProgramGateResult | undefined>>;
  resolveSlug: (id: string) => string;
  isHidden: (idOrSlug: string) => boolean;
}

const DISCOVER_ORDER: Record<HubDiscoverKind, number> = { needs_questionnaire: 0, locked: 1, parent: 2 };

export function bucketForProgressHub(input: ProgressHubInput): ProgressHubBuckets {
  const { resolveSlug, levelsBySlug, childrenOf, isHidden } = input;
  const isAssessed = (slug: string) => (levelsBySlug[slug] ?? 0) > 0;

  const mine: HubMineItem[] = [];
  const needsAssessment: HubNeedsAssessmentItem[] = [];
  const placed = new Set<string>(); // slugs already in mine / needsAssessment

  // Active programs (never hidden — the owner's exception), each followed by its children.
  const activeSlugs = new Set<string>();
  const activeIds: string[] = [];
  for (const id of input.activeIds) {
    if (!id) continue;
    const slug = resolveSlug(id);
    if (activeSlugs.has(slug)) continue;
    activeSlugs.add(slug);
    activeIds.push(id);
  }

  activeIds.forEach((id, idx) => {
    const slug = resolveSlug(id);
    if (placed.has(slug)) return; // already listed as a child of an earlier active parent
    const children = childrenOf(id);
    const role: HubMineRole = idx === 0 ? 'primary' : 'active';

    if (children) {
      placed.add(slug);
      mine.push({ programId: id, slug, role });
      for (const childSlug of children) {
        if (placed.has(childSlug)) continue;
        placed.add(childSlug);
        if (isAssessed(childSlug)) {
          mine.push({ programId: childSlug, slug: childSlug, role: 'child', parentId: id });
        } else {
          needsAssessment.push({ programId: childSlug, slug: childSlug, parentId: id });
        }
      }
      return;
    }

    placed.add(slug);
    if (isAssessed(slug)) {
      mine.push({ programId: id, slug, role });
    } else {
      needsAssessment.push({ programId: id, slug });
    }
  });

  // Tracked leaf programs (assessed, not active), highest level first.
  const tracked: { id: string; slug: string; level: number }[] = [];
  const nonActiveParents: string[] = [];
  for (const [id, level] of Object.entries(input.trackLevels)) {
    if ((level ?? 0) <= 0) continue;
    const slug = resolveSlug(id);
    if (placed.has(slug) || activeSlugs.has(slug) || isHidden(id)) continue;
    if (childrenOf(id)) {
      nonActiveParents.push(id);
      continue;
    }
    if (tracked.some((t) => t.slug === slug)) continue;
    tracked.push({ id, slug, level: levelsBySlug[slug] ?? (level as number) });
  }
  tracked
    .map((t, order) => ({ ...t, order }))
    .sort((a, b) => b.level - a.level || a.order - b.order)
    .forEach((t) => {
      placed.add(t.slug);
      mine.push({ programId: t.id, slug: t.slug, role: 'tracked' });
    });

  // Discover: the rest of the catalog + non-active parents with a track entry.
  const discover: (HubDiscoverItem & { order: number })[] = [];
  const discoverSlugs = new Set<string>();
  [...input.catalog, ...nonActiveParents].forEach((id, order) => {
    const slug = resolveSlug(id);
    if (placed.has(slug) || activeSlugs.has(slug) || discoverSlugs.has(slug) || isHidden(id)) return;
    discoverSlugs.add(slug);
    if (childrenOf(id)) {
      discover.push({ programId: id, slug, kind: 'parent', order });
      return;
    }
    const gate = input.gates[id];
    if (gate?.status === 'needs_assessment') {
      discover.push({
        programId: id,
        slug,
        kind: 'locked',
        missingDomainSlug: gate.requirements[0]?.domainProgramId,
        order,
      });
    } else if (gate?.status === 'locked_prereq') {
      discover.push({
        programId: id,
        slug,
        kind: 'locked',
        requirements: gate.requirements.map(({ domainProgramId, need }) => ({ domainProgramId, need })),
        order,
      });
    } else {
      discover.push({ programId: id, slug, kind: 'needs_questionnaire', order });
    }
  });
  discover.sort((a, b) => DISCOVER_ORDER[a.kind] - DISCOVER_ORDER[b.kind] || a.order - b.order);

  return {
    mine,
    needsAssessment,
    discover: discover.map(({ order: _order, ...item }) => item),
  };
}

// ── Card copy ───────────────────────────────────────────────────────────

/** CTA on a card whose level was never checked (gender-neutral, plural). */
export const CHECK_LEVEL_CTA = 'בדקו רמה';

/** The one line under "עוד לא בדקת רמה". */
export const NEEDS_ASSESSMENT_EXPLAINER = 'האימונים לא יכללו את התוכנית עד שתבדקו רמה';

/**
 * Hint + CTA target for a "גלה עוד" card:
 *   needs_questionnaire  "בדקו רמה" → the program's own questionnaire
 *   locked, missing prerequisite domain → "קודם בודקים רמה ב<domain>" → THAT
 *     domain's questionnaire (the old CTA started the skill's own one,
 *     which never cleared the missing prerequisite)
 *   locked, prerequisite too low → "דרוש <domain> <level>", no CTA
 *   parent → nothing (the card opens ParentProgramSheet)
 */
export function discoverCardHint(item: HubDiscoverItem): { lockedHint?: string; assessSlug?: string } {
  switch (item.kind) {
    case 'needs_questionnaire':
      return { lockedHint: CHECK_LEVEL_CTA, assessSlug: item.slug };
    case 'locked':
      if (item.missingDomainSlug) {
        const label = DOMAIN_HEBREW_LABELS[item.missingDomainSlug] ?? item.missingDomainSlug;
        return { lockedHint: `קודם בודקים רמה ב${label}`, assessSlug: item.missingDomainSlug };
      }
      return item.requirements && item.requirements.length > 0
        ? { lockedHint: formatRequirementsHint(item.requirements) }
        : {};
    case 'parent':
    default:
      return {};
  }
}
