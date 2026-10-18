/**
 * AI coach — "you never checked your level here" gaps for the user sheet. Pure.
 *
 * Same definition as the progress tab's "עוד לא בדקת רמה" section: bucketForProgressHub's
 * `needsAssessment` bucket (#403), i.e. the unassessed children of the user's active parent
 * programs (full_body → push / pull / legs / core, …) and active programs that were never
 * assessed. The workout engine leaves such a program out until it has a level (absent =
 * absent), so Kelly mentions it once at a natural moment and offers the mini level check
 * (startMiniDomainAssessment, the same flow the progress tab's "בדקו רמה" opens).
 *
 * Only programs the mini assessment can actually run are kept: the four base categories
 * (body_focus path) and the skill ladders (skills path).
 */
import { PROGRAM_NAME_HE } from '@/features/workout-engine/services/coach-note';
import {
  bucketForProgressHub,
  buildHubLevelsBySlug,
  resolveParentChildSlugs,
} from '@/features/progression-map/services/progress-hub-bucketing.service';

/** The mini assessment's body_focus categories (single-domain-assessment PRIMARY_CATEGORIES). */
export const ASSESS_CATEGORY_SLUGS = ['push', 'pull', 'legs', 'core'] as const;
/** Skill ladders the mini assessment's skills path runs (SKILL_TO_FOUNDATION_DOMAIN keys). */
export const ASSESS_SKILL_SLUGS = ['planche', 'front_lever', 'back_lever', 'handstand', 'hspu', 'muscle_up', 'one_arm_pullup'] as const;
export const ASSESSABLE_SLUGS = [...ASSESS_CATEGORY_SLUGS, ...ASSESS_SKILL_SLUGS] as const;
export type AssessableSlug = (typeof ASSESSABLE_SLUGS)[number];

export function isAssessableSlug(v: unknown): v is AssessableSlug {
  return typeof v === 'string' && (ASSESSABLE_SLUGS as readonly string[]).includes(v);
}

/** Parents the engine knows by slug, even when their Program doc isn't loaded. */
const KNOWN_PARENT_SLUGS: ReadonlySet<string> = new Set(['full_body', 'upper_body', 'lower_body', 'calisthenics_upper']);

export const MAX_ASSESSMENT_GAPS = 4;

export interface AssessmentGap {
  /** Program slug (one of ASSESSABLE_SLUGS). Never shown to the user. */
  slug: AssessableSlug;
  /** Hebrew program name ("ליבה"). */
  name: string;
  /** The active parent it belongs to (Hebrew), when it is a child program. */
  partOf: string | null;
  /** One short Hebrew line on why it matters. */
  why: string;
}

export interface AssessmentGapInput {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw Firestore document data, read through field guards
  profile: Record<string, any>;
  /** Raw program id → slug (Firestore ids and slugs are mixed in real data). Default: identity. */
  resolveSlug?: (id: string) => string;
  /** Parent slug → its Program doc's subPrograms (slug space), when loaded. */
  subProgramsBySlug?: Readonly<Record<string, readonly string[]>>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw Firestore document data
const obj = (v: unknown): Record<string, any> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {});

export function deriveAssessmentGaps(i: AssessmentGapInput): AssessmentGap[] {
  const resolveSlug = i.resolveSlug ?? ((id: string) => id);
  const prog = obj(i.profile?.progression);
  const tracksRaw = obj(prog.tracks) as Record<string, { currentLevel?: number } | undefined>;
  const domainsRaw = obj(prog.domains) as Record<string, { currentLevel?: number; level?: number } | number | undefined>;
  const activeIds = (Array.isArray(prog.activePrograms) ? prog.activePrograms : [])
    .map((ap: unknown) => (typeof ap === 'string' ? ap : obj(ap).templateId))
    .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0);
  if (activeIds.length === 0) return [];

  const skillFocus = (Array.isArray(prog.skillFocusIds) ? prog.skillFocusIds : [])
    .filter((x: unknown): x is string => typeof x === 'string')
    .map(resolveSlug);
  const levelsBySlug = buildHubLevelsBySlug(tracksRaw, domainsRaw, resolveSlug);
  const subs = i.subProgramsBySlug ?? {};

  const childrenOf = (id: string): readonly string[] | undefined => {
    const slug = resolveSlug(id);
    const known = KNOWN_PARENT_SLUGS.has(slug) || (subs[slug]?.length ?? 0) > 0;
    if (!known) return undefined;
    return resolveParentChildSlugs(slug, subs[slug], skillFocus);
  };

  const trackLevels: Record<string, number | undefined> = {};
  for (const [k, v] of Object.entries(tracksRaw)) trackLevels[k] = v?.currentLevel;

  const { needsAssessment } = bucketForProgressHub({
    activeIds,
    trackLevels,
    levelsBySlug,
    childrenOf,
    catalog: [],
    gates: {},
    resolveSlug,
    isHidden: () => false,
  });

  const out: AssessmentGap[] = [];
  for (const item of needsAssessment) {
    if (!isAssessableSlug(item.slug)) continue;
    const name = PROGRAM_NAME_HE[item.slug];
    if (!name) continue;
    const partOf = item.parentId ? (PROGRAM_NAME_HE[resolveSlug(item.parentId)] ?? null) : null;
    out.push({
      slug: item.slug,
      name,
      partOf,
      why: partOf
        ? `חלק מהתוכנית ${partOf}, והאימונים לא כוללים את ${name} עד שבודקים רמה`
        : `תוכנית פעילה בלי רמה, והאימונים לא כוללים את ${name} עד שבודקים רמה`,
    });
    if (out.length >= MAX_ASSESSMENT_GAPS) break;
  }
  return out;
}

/** The gap a workout touches: a gap in its domains, or any base-category gap for a full-body workout. */
export function gapForWorkout(gaps: readonly AssessmentGap[], workoutDomains: readonly string[]): AssessmentGap | null {
  if (gaps.length === 0) return null;
  if (workoutDomains.length === 0) {
    return gaps.find((g) => (ASSESS_CATEGORY_SLUGS as readonly string[]).includes(g.slug)) ?? null;
  }
  return gaps.find((g) => workoutDomains.includes(g.slug)) ?? null;
}
