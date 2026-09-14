'use client';

export const dynamic = 'force-dynamic';

/**
 * "תרגילים לא נשלפים" — Unreachable Exercises
 *
 * David's own proposal (00-PLAN.md §13): a permanent admin tool, not a
 * one-off report, showing live which exercises in the catalog cannot be
 * selected by any real generation path, and exactly why. Triggered by the
 * discovery that ~40 filmed warmup/stretch videos sit in the catalog and
 * are never shown to any user (03-LEVEL-TRIAGE.md's reachability finding).
 *
 * All reasons below reuse REAL production logic — none of it is
 * reimplemented here:
 *   - hasExplicitCoreLevel / exerciseMatchesProgram — the exact functions
 *     workout-selection.utils.ts uses for the core-slot gate (00-PLAN.md §12.3).
 *   - selectMethodForContext — the exact production execution-method
 *     selector (shared/utils/method-selection.utils.ts), called per
 *     location with the same baseline-gear assumption the generator itself
 *     injects (ESSENTIAL_PARK_GEAR / ASSUMED_HOME_GEAR).
 *   - The NO_ROLE_OR_TAG condition is copied verbatim (cited by file:line)
 *     from warmup.service.ts:394 and cooldown.service.ts:47,101 — the exact
 *     boolean checks that gate the warmup/cooldown/tabata candidate pools.
 *   - MOVEMENT_GROUP_MISMATCH imports `resolveExerciseDomain` +
 *     `isDomainAncestorRelated` (workout-selection.utils.ts) and
 *     `MG_TO_DOMAIN` (domain-mapping.constants.ts) — the exact same
 *     `[DomainMismatch]` check WorkoutGenerator.ts's `resolveDavidRuleDomain`
 *     runs in production, not a second copy of the same question
 *     (10.09.2026, David: import it, don't reimplement it).
 *
 * Two reasons are genuinely new audit logic, not reused production code,
 * because no live selection path asks these questions at runtime — they're
 * tagging-hygiene questions, not generation decisions:
 *   - ANCESTOR_DUPLICATE walks the real `programs` hierarchy (`subPrograms`,
 *     resolved via `resolveToSlug` — the correct resolver, not
 *     progression.service.ts's `buildProgramSlugMap`, see parking-lot.md's
 *     B1 finding) to find an exercise tagged with both a child and one of
 *     its ancestors in the same branch (e.g. pull + upper_body + full_body).
 *   - MULTI_SKILL_TAG counts how many of the catalog's 5 actually-used skill
 *     tags (multi-skill-tag-review.md, 09.09.2026) sit on the same exercise.
 *
 * An exercise can have MORE than one reason at once (e.g. most of the 70
 * orphaned exercises are both NO_LEVEL and NO_ROLE_OR_TAG) — all applicable
 * reasons are shown and filterable independently, not collapsed to one.
 *
 * Style matches /admin/content-matrix (same page shape: client-side fetch +
 * in-browser analysis, RTL, gradient header, stat cards, search/filter,
 * CSV/text export via Blob) per 00-PLAN.md §14's placement instruction.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { getAllExercises } from '@/features/content/exercises';
import type { Exercise, ExecutionLocation } from '@/features/content/exercises';
import { EXECUTION_LOCATION_LABELS } from '@/features/content/exercises/core/exercise-location.constants';
import type { Program } from '@/features/content/programs/core/program.types';
import { getCachedPrograms, buildIdToSlugMapFromPrograms, resolveToSlug } from '@/features/workout-engine/services/program-hierarchy.utils';
import {
  ensureEquipmentCachesLoaded,
  ESSENTIAL_PARK_GEAR,
  ASSUMED_HOME_GEAR,
} from '@/features/workout-engine/shared/utils/gear-mapping.utils';
import { ASSUMED_HOME_GEAR_ENABLED } from '@/config/feature-flags';
import { selectMethodForContext } from '@/features/workout-engine/shared/utils/method-selection.utils';
import {
  hasExplicitCoreLevel,
  resolveExerciseDomain,
  isDomainAncestorRelated,
  DOMAIN_RESOLUTION_SKILL_PARENT_MAP,
} from '@/features/workout-engine/logic/workout-selection.utils';
import { MG_TO_DOMAIN } from '@/features/workout-engine/shared/constants/domain-mapping.constants';
import { exerciseMatchesProgram } from '@/features/workout-engine/services/shadow-level.utils';
import {
  AlertTriangle,
  RefreshCw,
  Loader2,
  Search,
  Download,
  X,
} from 'lucide-react';

// ============================================================================
// REASON TAXONOMY
// ============================================================================

type Reason =
  | 'NO_LEVEL' | 'NO_ROLE_OR_TAG' | 'NO_EXECUTION_METHODS' | 'NO_LOCATION_COVERAGE' | 'CORE_NO_CORE_LEVEL' | 'UNHANDLED_ROLE'
  | 'ANCESTOR_DUPLICATE' | 'MULTI_SKILL_TAG' | 'MOVEMENT_GROUP_MISMATCH' | 'LEGACY_PROGRAM_ID_SCHEMA' | 'NO_NAME';

// Roles at least one real workout-engine selection path actually consumes —
// kept in sync by hand, not derived from the ExerciseRole type union, on
// purpose: the whole point of UNHANDLED_ROLE below is to catch the exact
// gap that happened once already (exerciseRole:'reinforcement' existed in
// the type + CMS for a long time before any selection path read it — the 4
// "טבטה" follow-along items sat completely unreachable, docs/workout-engine/
// 09-CORE-TABATA.md §1.6). If a role is ever ADDED to the ExerciseRole type
// without ALSO wiring a real consumer, this list staying manually curated
// is what makes that gap show up here instead of silently repeating.
const HANDLED_ROLES = new Set<string>(['main', 'warmup', 'cooldown', 'recovery', 'reinforcement']);

const REASON_META: Record<Reason, { label: string; short: string; color: string; explain: (row: UnreachableRow) => string }> = {
  NO_EXECUTION_METHODS: {
    label: 'אין execution_methods',
    short: 'ללא שיטת ביצוע',
    color: 'bg-red-100 text-red-800 border-red-300',
    explain: () => 'התרגיל לעולם לא ייבחר — אין אף שיטת ביצוע (execution_methods ריק). הוסף שיטת ביצוע אחת לפחות.',
  },
  NO_LOCATION_COVERAGE: {
    label: 'אין כיסוי מיקום',
    short: 'ללא כיסוי מיקום',
    color: 'bg-orange-100 text-orange-800 border-orange-300',
    explain: () =>
      'יש execution_methods, אבל אף אחת לא עוברת את הגייטינג האמיתי (selectMethodForContext) באף אחד מ-10 המיקומים, גם עם ציוד הבסיס (ESSENTIAL_PARK_GEAR / ASSUMED_HOME_GEAR). בדוק gearIds/equipmentIds מול location/locationMapping.',
  },
  CORE_NO_CORE_LEVEL: {
    label: 'ליבה בלי רמת core',
    short: 'ליבה חסרת רמה',
    color: 'bg-purple-100 text-purple-800 border-purple-300',
    explain: (row) =>
      `מסווג כתרגיל ליבה (movementGroup='${row.movementGroup ?? '—'}', primaryMuscle='${row.primaryMuscle ?? '—'}') אך אין רשומת targetPrograms עם programId שנפתר ל-'core'. מאז גייט הליבה (00-PLAN.md §12.3) התרגיל לא נכנס לסלוט הליבה של אימון רגיל — אך נשאר זמין במלואו בתוכניות האחרות שבהן יש לו רמה אמיתית (ראה targetPrograms).`,
  },
  NO_LEVEL: {
    label: 'אין רמה',
    short: 'ללא רמה',
    color: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    explain: () => 'אין targetPrograms ואין programIds — לא נראה למערכת הרמות. לא נבחר בשום מסלול-דומיין רגיל (push/pull/legs/core/סקילים). הוסף targetPrograms עם programId + level.',
  },
  NO_ROLE_OR_TAG: {
    label: 'אין role/תג',
    short: 'ללא role/תג',
    color: 'bg-blue-100 text-blue-800 border-blue-300',
    explain: () =>
      'אין exerciseRole ואין תג mobility/flexibility/hiit_friendly — לא עומד בתנאי הבריכה של warmup.service.ts:394 (exerciseRole==="warmup" || tags.includes("mobility")) או cooldown.service.ts:47,101 (exerciseRole==="cooldown" || tags.includes("flexibility")), ולא מגיע למאגר הטבטה (tags.includes("hiit_friendly")). הוסף exerciseRole מתאים או תג.',
  },
  UNHANDLED_ROLE: {
    label: 'role לא מטופל',
    short: 'role לא מוכר',
    color: 'bg-pink-100 text-pink-800 border-pink-300',
    explain: (row) =>
      `exerciseRole='${row.exerciseRole ?? '—'}' מוגדר, אבל אף מסלול בחירה חי לא קורא אותו (זה בדיוק מה שקרה ל-4 פריטי "טבטה" הפולו-אלונג לפני שחוברו — ראה docs/workout-engine/09-CORE-TABATA.md §1.6). בדוק שיש מסלול קוד שמסנן לפי הroleהזה, או תקן ל-role מוכר.`,
  },
  ANCESTOR_DUPLICATE: {
    label: 'כפילות אב/סבא',
    short: 'כפילות היררכיה',
    color: 'bg-teal-100 text-teal-800 border-teal-300',
    explain: (row) =>
      `מתויג גם בתוכנית וגם באב שלה (או בסבא) באותו ענף בהיררכיה: ${row.ancestorDuplicatePairs ?? '—'}. הרמה כבר מגיעה מהתגית הספציפית ביותר — התגית ההורה/סבא לא מוסיפה מידע.${row.ancestorDuplicateDecidedValidNote ? ` ⚠️ ${row.ancestorDuplicateDecidedValidNote} — השורה מוצגת לשקיפות, לא כבעיה פתוחה.` : ''} תגיות נוכחיות: ${row.targetProgramsDisplay ?? '—'}.`,
  },
  MULTI_SKILL_TAG: {
    label: '2+ תגי-סקיל',
    short: 'מספר סקילים',
    color: 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-300',
    explain: (row) =>
      `מתויג ביותר מסקיל אחד: ${row.multiSkillTags ?? '—'}. הכלל (דוד, 09.09.2026): הורה אחד + לכל היותר סקיל אחד לכל תרגיל. תגיות נוכחיות: ${row.targetProgramsDisplay ?? '—'}.`,
  },
  MOVEMENT_GROUP_MISMATCH: {
    label: 'אי-התאמת movementGroup',
    short: 'MG↔תגית',
    color: 'bg-amber-100 text-amber-800 border-amber-300',
    explain: (row) =>
      `movementGroup='${row.mgTagMismatch?.mg ?? row.movementGroup ?? '—'}' (→ '${row.mgTagMismatch?.mgDomain ?? '—'}') לא באותו ענף כמו התגית שנפתרת בפועל ('${row.mgTagMismatch?.tagDomain ?? '—'}') — אותה בדיקה בדיוק כמו [DomainMismatch] ב-WorkoutGenerator's DavidRule (resolveDavidRuleDomain), לא ענף-הורה/צאצא ביניהם. תגיות נוכחיות: ${row.targetProgramsDisplay ?? '—'}.`,
  },
  LEGACY_PROGRAM_ID_SCHEMA: {
    label: 'סכימה ישנה',
    short: 'programId ישן',
    color: 'bg-slate-100 text-slate-800 border-slate-300',
    explain: (row) =>
      `משתמש בשדה programId (יחיד, סכימה ישנה) במקום targetPrograms — שום מסלול-בחירה חי לא קורא את השדה הזה. תגיות נוכחיות (targetPrograms): ${row.targetProgramsDisplay ?? '—'}.`,
  },
  NO_NAME: {
    label: 'בלי שם',
    short: 'חסר שם',
    color: 'bg-rose-100 text-rose-800 border-rose-300',
    explain: () => 'אין name בשום שפה (he/en/es) — התרגיל לא ניתן לזיהוי בשום מסך.',
  },
};

const REASON_ORDER: Reason[] = [
  'NO_EXECUTION_METHODS', 'NO_LOCATION_COVERAGE', 'CORE_NO_CORE_LEVEL', 'NO_LEVEL', 'NO_ROLE_OR_TAG', 'UNHANDLED_ROLE',
  'MOVEMENT_GROUP_MISMATCH', 'ANCESTOR_DUPLICATE', 'MULTI_SKILL_TAG', 'LEGACY_PROGRAM_ID_SCHEMA', 'NO_NAME',
];

interface UnreachableRow {
  id: string;
  name: string;
  reasons: Reason[];
  movementGroup?: string | null;
  primaryMuscle?: string | null;
  exerciseRole?: string;
  /** Resolved "slug:Lx" list of this exercise's current targetPrograms — shown
   *  in every new (2026-09-10) reason's explanation per David's requirement:
   *  "what's wrong, and what the current tags are, with levels." */
  targetProgramsDisplay?: string;
  ancestorDuplicatePairs?: string;
  /** Set when one of this row's ancestor-duplicate pairs is a DECIDED-valid
   *  tagging, not a real duplicate — currently only muscle_up (David,
   *  14.09.2026: it genuinely is push+pull composite; subPrograms:[push,pull]
   *  stays as-is). The algorithm still flags the pair (no per-exercise/
   *  per-program exception, per the standing rule) — this note is display-
   *  only, so David sees the row without being misled into thinking it's an
   *  open tagging problem. */
  ancestorDuplicateDecidedValidNote?: string;
  multiSkillTags?: string;
  mgTagMismatch?: { mg: string; mgDomain: string; tagDomain: string };
}

function getName(ex: Exercise): string {
  const n: any = ex.name;
  if (!n) return '(ללא שם)';
  if (typeof n === 'string') return n || '(ללא שם)';
  return n.he || n.en || n.es || '(ללא שם)';
}

// All locations the live product actually schedules against (ExecutionLocation
// union, exercise.types.ts:394) — tested with the SAME baseline-gear
// assumption InputSanitizerMiddleware.normalizeEquipmentArray injects.
const ALL_LOCATIONS: ExecutionLocation[] = ['home', 'park', 'street', 'office', 'school', 'gym', 'airport', 'library', 'desk', 'service'];

function baselineGearFor(location: ExecutionLocation): string[] {
  if (location === 'park') return Array.from(ESSENTIAL_PARK_GEAR);
  if (ASSUMED_HOME_GEAR_ENABLED && (location === 'home' || location === 'office' || location === 'school')) {
    return Array.from(ASSUMED_HOME_GEAR);
  }
  return [];
}

function hasAnyLocationCoverage(ex: Exercise): boolean {
  return ALL_LOCATIONS.some((loc) => selectMethodForContext(ex, loc, baselineGearFor(loc)) !== null);
}

/** Resolved "slug:Lx" list, in targetPrograms array order — shared by every
 *  new reason's explanation so a reviewer always sees the current tagging
 *  next to what's wrong with it. */
function formatTargetPrograms(ex: Exercise): string {
  const tps = (ex.targetPrograms ?? []) as Array<{ programId: string; level: number }>;
  if (!tps.length) return '—';
  return tps.map((tp) => `${resolveToSlug(tp.programId)}:L${tp.level}`).join(', ');
}

// ── ANCESTOR_DUPLICATE (category א) ─────────────────────────────────────
// Direct-parent map (childSlug → Set<parentSlug>) built from the REAL
// programs collection's isMaster/subPrograms fields, resolved via
// resolveToSlug (the correct resolver — see B1 in parking-lot.md for why
// progression.service.ts's own slug builder is NOT used here). No existing
// production function walks this ancestor chain — it's a tagging-hygiene
// question, not a runtime selection decision — so this is genuinely new
// logic, not a duplicate of anything reused elsewhere on this page.
function buildDirectParentMap(programs: Program[]): Map<string, Set<string>> {
  const bySlugOrId = new Map<string, Program>();
  for (const p of programs) {
    bySlugOrId.set(p.id, p);
    if (p.slug) bySlugOrId.set(p.slug, p);
  }
  const directParents = new Map<string, Set<string>>();
  for (const p of programs) {
    if (!p.isMaster || !p.subPrograms?.length) continue;
    const parentSlug = p.slug ?? resolveToSlug(p.id);
    for (const childRef of p.subPrograms) {
      const childSlug = bySlugOrId.get(childRef)?.slug ?? resolveToSlug(childRef);
      if (!directParents.has(childSlug)) directParents.set(childSlug, new Set());
      directParents.get(childSlug)!.add(parentSlug);
    }
  }
  return directParents;
}

/** Transitive closure of buildDirectParentMap — slug → every ancestor slug,
 *  not just the direct parent (so pull → {upper_body, full_body}, not just
 *  {upper_body}). */
function buildAncestorMap(programs: Program[]): Map<string, Set<string>> {
  const directParents = buildDirectParentMap(programs);
  const cache = new Map<string, Set<string>>();
  const resolve = (slug: string, seen: Set<string>): Set<string> => {
    if (cache.has(slug)) return cache.get(slug)!;
    const result = new Set<string>();
    if (seen.has(slug)) return result; // cycle guard — hierarchy shouldn't cycle, but never trust CMS data blindly
    seen.add(slug);
    Array.from(directParents.get(slug) ?? []).forEach((parent) => {
      result.add(parent);
      Array.from(resolve(parent, seen)).forEach((grandparent) => result.add(grandparent));
    });
    cache.set(slug, result);
    return result;
  };
  const allSlugs = new Set<string>([
    ...Array.from(directParents.keys()),
    ...Array.from(directParents.values()).flatMap((set) => Array.from(set)),
  ]);
  const ancestorMap = new Map<string, Set<string>>();
  Array.from(allSlugs).forEach((slug) => ancestorMap.set(slug, resolve(slug, new Set())));
  return ancestorMap;
}

// ── MULTI_SKILL_TAG (category ב) ────────────────────────────────────────
// The skill programs the catalog actually tags exercises with — not the
// broader 7-key `DOMAIN_RESOLUTION_SKILL_PARENT_MAP`. This list was
// verified twice, not assumed once: the original 5 (09.09.2026,
// multi-skill-tag-review.md's 24-exercise audit) excluded `handstand` on
// the assumption it had zero real catalog usage — WRONG, caught live by
// the screaming check below (14.09.2026): 4 real exercises ("הליכות קיר",
// "עמידת ידיים" x3) carry it. Added. None of the 4 carry a second
// SKILL_SLUGS-tracked skill, so this does NOT change the verified
// MULTI_SKILL_TAG=24 count — it only makes the list accurate. `back_lever`
// stays excluded — re-verified 0 real usage, same check, same run.
const SKILL_SLUGS = new Set<string>(['planche', 'one_arm_pullup', 'front_lever', 'muscle_up', 'handstand_pushup', 'handstand']);

// ── MOVEMENT_GROUP_MISMATCH (category ג) ────────────────────────────────
// Worst-case activeDomains for [DomainMismatch] — every skill in
// DOMAIN_RESOLUTION_SKILL_PARENT_MAP plus every foundational domain.
// Matches the exact context this session's live verification used against
// the full 372-exercise catalog (09-10.09.2026): 6 fire, not dozens.
const AUDIT_ACTIVE_DOMAINS = [...Object.keys(DOMAIN_RESOLUTION_SKILL_PARENT_MAP), 'push', 'pull', 'legs', 'core'];

// ============================================================================
// PAGE
// ============================================================================

export default function UnreachableExercisesPage() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rows, setRows] = useState<UnreachableRow[]>([]);
  const [totalScanned, setTotalScanned] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [reasonFilter, setReasonFilter] = useState<Reason | 'all'>('all');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [allExercises, allPrograms] = await Promise.all([
          getAllExercises(),
          getCachedPrograms(),
          ensureEquipmentCachesLoaded(),
        ]);
        // Resolves programId Firestore doc IDs → slugs, exactly as the live
        // generator does at the same call site (home-workout.service.ts:1463)
        // — required for hasExplicitCoreLevel / exerciseMatchesProgram to
        // recognise a 'core' targetPrograms entry stored as a Firestore ID.
        buildIdToSlugMapFromPrograms(allPrograms);
        // Built once from real program data, reused for every exercise below —
        // not per-exercise, per (א)'s own doc comment.
        const ancestorMap = buildAncestorMap(allPrograms);

        if (cancelled) return;

        const computed: UnreachableRow[] = [];
        for (const ex of allExercises) {
          const reasons: Reason[] = [];
          const methods = (ex.execution_methods || ex.executionMethods || []) as any[];

          const hasLevel = (Array.isArray(ex.targetPrograms) && ex.targetPrograms.length > 0)
            || (Array.isArray(ex.programIds) && ex.programIds.length > 0);
          if (!hasLevel) reasons.push('NO_LEVEL');

          const tags: string[] = (ex.tags as string[]) ?? [];
          const hasRoleOrTag = !!ex.exerciseRole
            || tags.includes('mobility')
            || tags.includes('flexibility')
            || tags.includes('hiit_friendly');
          if (!hasRoleOrTag) reasons.push('NO_ROLE_OR_TAG');

          if (ex.exerciseRole && !HANDLED_ROLES.has(ex.exerciseRole)) reasons.push('UNHANDLED_ROLE');

          if (methods.length === 0) {
            reasons.push('NO_EXECUTION_METHODS');
          } else if (!hasAnyLocationCoverage(ex)) {
            reasons.push('NO_LOCATION_COVERAGE');
          }

          if (exerciseMatchesProgram(ex, 'core') && !hasExplicitCoreLevel(ex)) {
            reasons.push('CORE_NO_CORE_LEVEL');
          }

          // ── (א) ancestor/grandparent duplicate tagging ──────────────────
          const resolvedSlugs = Array.from(new Set(
            ((ex.targetPrograms ?? []) as Array<{ programId: string }>).map((tp) => resolveToSlug(tp.programId)),
          ));
          const dupPairs: string[] = [];
          let involvesDecidedValidMuscleUp = false;
          for (let i = 0; i < resolvedSlugs.length; i++) {
            for (let j = i + 1; j < resolvedSlugs.length; j++) {
              const [a, b] = [resolvedSlugs[i], resolvedSlugs[j]];
              if (ancestorMap.get(a)?.has(b) || ancestorMap.get(b)?.has(a)) {
                dupPairs.push(`${a}+${b}`);
                // DECIDED valid, not a real duplicate (David, 14.09.2026) —
                // muscle_up genuinely is push+pull composite. The pair is
                // still flagged (no exception in the algorithm itself) —
                // only the display gets a note, per parking-lot.md's
                // "muscle_up נשאר כמו שהוא" entry.
                if (a === 'muscle_up' || b === 'muscle_up') involvesDecidedValidMuscleUp = true;
              }
            }
          }
          let ancestorDuplicatePairs: string | undefined;
          let ancestorDuplicateDecidedValidNote: string | undefined;
          if (dupPairs.length > 0) {
            reasons.push('ANCESTOR_DUPLICATE');
            ancestorDuplicatePairs = dupPairs.join('; ');
            if (involvesDecidedValidMuscleUp) {
              ancestorDuplicateDecidedValidNote = 'תיוג תקין — מאסל-אפ מורכב מדחיפה ומשיכה (הכרעת דוד 14.09.2026)';
            }
          }

          // ── (ב) 2+ skill tags ─────────────────────────────────────────
          const taggedSkills = resolvedSlugs.filter((s) => SKILL_SLUGS.has(s));
          let multiSkillTags: string | undefined;
          if (taggedSkills.length >= 2) {
            reasons.push('MULTI_SKILL_TAG');
            multiSkillTags = taggedSkills.join(', ');
          }

          // ⚠️ Screaming check (14.09.2026, David — review round 2). This is
          // what CAUGHT the `handstand` gap above — not a hypothetical, it
          // already found a real, live mismatch once. SKILL_SLUGS (6) is a
          // hand-verified SUBSET of DOMAIN_RESOLUTION_SKILL_PARENT_MAP's keys
          // (7) — only `back_lever` is still excluded, re-verified 0 real
          // catalog usage in the same run that caught `handstand`. That
          // verification doesn't stay true on its own — the moment David tags
          // an exercise with `back_lever`, this category would silently miss
          // it, exactly like `handstand` was missed until this check existed.
          // Loud, not silent: if any exercise carries a skill tag that's a real
          // DOMAIN_RESOLUTION_SKILL_PARENT_MAP key but NOT in SKILL_SLUGS, log it
          // where it can't be missed, every scan, not just once.
          const untrackedSkillTags = resolvedSlugs.filter(
            (s) => DOMAIN_RESOLUTION_SKILL_PARENT_MAP[s] !== undefined && !SKILL_SLUGS.has(s),
          );
          if (untrackedSkillTags.length > 0) {
            console.error(
              `[unreachable-exercises] ⚠️ SKILL_SLUGS is missing a tagged skill: ` +
              `"${getName(ex)}" (${ex.id}) carries [${untrackedSkillTags.join(', ')}] — ` +
              `MULTI_SKILL_TAG will silently miss this exercise. Add it to SKILL_SLUGS.`,
            );
          }

          // ── (ג) movementGroup↔tag mismatch — same [DomainMismatch] check
          // as WorkoutGenerator.ts's resolveDavidRuleDomain, imported not
          // reimplemented (10.09.2026, David) ─────────────────────────────
          let mgTagMismatch: UnreachableRow['mgTagMismatch'];
          if (ex.movementGroup) {
            const tagDomain = resolveExerciseDomain(ex, {
              activeDomains: AUDIT_ACTIVE_DOMAINS,
              skillParentMap: DOMAIN_RESOLUTION_SKILL_PARENT_MAP,
              resolveSlug: resolveToSlug,
            });
            const mgDomain = MG_TO_DOMAIN[ex.movementGroup];
            if (tagDomain && mgDomain && !isDomainAncestorRelated(tagDomain, mgDomain)) {
              reasons.push('MOVEMENT_GROUP_MISMATCH');
              mgTagMismatch = { mg: ex.movementGroup, mgDomain, tagDomain };
            }
          }

          // ── (ד) legacy singular `programId` schema ──────────────────────
          if ((ex as any).programId !== undefined) reasons.push('LEGACY_PROGRAM_ID_SCHEMA');

          // ── (ה) no name in any language ──────────────────────────────────
          const rawName: any = ex.name;
          const hasNoName = !rawName
            || (typeof rawName === 'string' && rawName.trim() === '')
            || (typeof rawName === 'object' && !rawName.he && !rawName.en && !rawName.es);
          if (hasNoName) reasons.push('NO_NAME');

          if (reasons.length > 0) {
            computed.push({
              id: ex.id,
              name: getName(ex),
              reasons,
              movementGroup: ex.movementGroup,
              primaryMuscle: ex.primaryMuscle,
              exerciseRole: ex.exerciseRole,
              targetProgramsDisplay: formatTargetPrograms(ex),
              ancestorDuplicatePairs,
              ancestorDuplicateDecidedValidNote,
              multiSkillTags,
              mgTagMismatch,
            });
          }
        }

        if (!cancelled) {
          setRows(computed);
          setTotalScanned(allExercises.length);
        }
      } catch (e: any) {
        if (!cancelled) setLoadError(e?.message ?? String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const filteredRows = useMemo(() => {
    let result = rows;
    if (reasonFilter !== 'all') {
      result = result.filter((r) => r.reasons.includes(reasonFilter));
    }
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      result = result.filter((r) => r.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q));
    }
    return result;
  }, [rows, reasonFilter, searchTerm]);

  const reasonCounts = useMemo(() => {
    const counts: Record<Reason, number> = {
      NO_LEVEL: 0, NO_ROLE_OR_TAG: 0, NO_EXECUTION_METHODS: 0, NO_LOCATION_COVERAGE: 0, CORE_NO_CORE_LEVEL: 0, UNHANDLED_ROLE: 0,
      ANCESTOR_DUPLICATE: 0, MULTI_SKILL_TAG: 0, MOVEMENT_GROUP_MISMATCH: 0, LEGACY_PROGRAM_ID_SCHEMA: 0, NO_NAME: 0,
    };
    for (const r of rows) for (const reason of r.reasons) counts[reason]++;
    return counts;
  }, [rows]);

  const handleExportCsv = () => {
    const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const lines = ['exercise_id,name,reasons,details'];
    for (const row of filteredRows) {
      const details = row.reasons.map((r) => `${REASON_META[r].label}: ${REASON_META[r].explain(row)}`).join(' | ');
      lines.push([row.id, row.name, row.reasons.join(';'), details].map(escape).join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `unreachable-exercises-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3" dir="rtl">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        <p className="text-gray-500 font-medium">סורק את הקטלוג...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4" dir="rtl">
        <div className="flex items-center gap-3 px-6 py-4 bg-red-50 border border-red-200 rounded-2xl">
          <AlertTriangle className="w-6 h-6 text-red-500 flex-shrink-0" />
          <div>
            <p className="font-bold text-red-700">שגיאה בטעינת הקטלוג</p>
            <p className="text-sm text-red-600 mt-1">{loadError}</p>
          </div>
        </div>
        <button
          onClick={() => setRefreshKey((k) => k + 1)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors"
        >
          <RefreshCw size={18} />
          נסה שוב
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between bg-gradient-to-r from-indigo-600 to-purple-600 p-6 rounded-2xl shadow-lg text-white">
        <div>
          <h1 className="text-3xl font-black">תרגילים לא נשלפים</h1>
          <p className="text-indigo-100 mt-1">
            {rows.length} מתוך {totalScanned} תרגילים בקטלוג לא ניתנים לבחירה באף מסלול חי — חי מהקטלוג, לא דוח קפוא
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-xl font-bold transition-all"
          >
            <Download size={18} />
            ייצוא CSV
          </button>
          <button
            onClick={() => setRefreshKey((k) => k + 1)}
            className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-xl font-bold transition-all"
          >
            <RefreshCw size={18} />
            רענון
          </button>
        </div>
      </div>

      {/* Reason stat cards — click to filter */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {REASON_ORDER.map((reason) => (
          <button
            key={reason}
            onClick={() => setReasonFilter(reasonFilter === reason ? 'all' : reason)}
            className={`text-right p-4 rounded-2xl border-2 transition-all ${REASON_META[reason].color} ${
              reasonFilter === reason ? 'ring-2 ring-offset-2 ring-indigo-500 scale-[1.02]' : 'hover:scale-[1.01]'
            }`}
          >
            <div className="text-2xl font-black">{reasonCounts[reason]}</div>
            <div className="text-xs font-bold mt-1">{REASON_META[reason].label}</div>
          </button>
        ))}
      </div>

      {/* Search + filter bar */}
      <div className="flex items-center gap-3 bg-white p-3 rounded-2xl shadow border border-gray-100">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="חיפוש לפי שם או id..."
            className="w-full pr-10 pl-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={16} />
            </button>
          )}
        </div>
        {reasonFilter !== 'all' && (
          <button
            onClick={() => setReasonFilter('all')}
            className="flex items-center gap-1 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-bold text-gray-700"
          >
            <X size={14} />
            נקה סינון ({REASON_META[reasonFilter].label})
          </button>
        )}
        <div className="text-sm text-gray-500 font-medium whitespace-nowrap">{filteredRows.length} תוצאות</div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow border border-gray-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-gray-500 text-xs">
              <th className="text-right p-3 font-bold">שם</th>
              <th className="text-right p-3 font-bold">id</th>
              <th className="text-right p-3 font-bold">סיבות</th>
              <th className="text-right p-3 font-bold">מה חסר בדיוק</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => (
              <tr key={row.id} className="border-b border-gray-50 hover:bg-gray-50 align-top">
                <td className="p-3 font-bold text-gray-800 whitespace-nowrap">{row.name}</td>
                <td className="p-3 text-gray-400 font-mono text-xs whitespace-nowrap">{row.id}</td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-1">
                    {row.reasons.map((r) => (
                      <span key={r} className={`px-2 py-0.5 rounded-lg border text-xs font-bold whitespace-nowrap ${REASON_META[r].color}`}>
                        {REASON_META[r].short}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="p-3 text-gray-600 max-w-xl">
                  {row.reasons.map((r) => (
                    <p key={r} className="mb-1 last:mb-0">
                      <span className="font-bold">{REASON_META[r].label}:</span> {REASON_META[r].explain(row)}
                    </p>
                  ))}
                </td>
              </tr>
            ))}
            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={4} className="p-8 text-center text-gray-400">
                  אין תרגילים תואמים לסינון הנוכחי
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
