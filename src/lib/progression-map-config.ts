/**
 * Progression Map — Phase 1 config.
 *
 * The v1 allow-list of leaf programs that get a Skill Tree, and the
 * deterministic rule for picking which tree an exercise's "מפה מלאה" link
 * opens. Lives in src/lib/ (not inside src/features/progression-map/ or
 * src/features/content/exercises/) so both of those domains can import it
 * without a cross-domain violation (CLAUDE.md Law 7).
 *
 * Phase 4c-2 (Item 2, "Model A"): מאסל אפ / עליית כוח (fTLWzjP9gH2VNpamyCZF)
 * was added to this list — it was intentionally excluded through Phase 1
 * because it was mis-flagged isMaster=true in production (14 exercises
 * tagged directly to it, never routed through a real leaf tree). Adding it
 * here is one of TWO changes that must land together to avoid a split-brain
 * state: this list controls whether the Skill-Tree UI (useProgramCardState,
 * useGatedProgramBuckets) routes a program through the real
 * derivePrerequisites/evaluateProgramGate pipeline at all — the Firestore
 * isMaster:false flip (a separate data write, tracked alongside this) does
 * NOT by itself make that happen. Its prerequisite (push L10 AND pull L10 —
 * an AND of two domains, a new shape; see MANUAL_PREREQUISITE_OVERRIDES in
 * prerequisite-derivation.service.ts) is a manual override, not derived from
 * its own exercise data — confirmed via a live audit that none of its 14
 * tagged exercises carry a usable domain tag for this purpose.
 *
 * Phase 4c-1: the 4 canonical domains (משיכה/דחיפה/ליבה/רגליים) were
 * added — confirmed via a live, read-only Firestore audit (not fixture
 * guessing) to be real leaf Program docs (isMaster:false) with genuinely
 * populated exercise trees (47-89 tagged exercises each, real levels up to
 * 13-22), previously excluded from this list for no data reason — they
 * were simply out of Phase 1's original 6-skill scope. Adding them here is
 * exactly what makes each open as a real Skill-Tree page instead of
 * rendering a dead "מבוסס על התוכניות שלך" master-style card (the
 * not_started_master fold in program-card-state.service.ts applies to any
 * !isProgressionMapLeafProgram program stuck in the 'available' state —
 * domains were hitting that fold purely because they weren't on this list,
 * not because of any real master/leaf distinction; all 4 are isMaster:false
 * in Firestore, same as every skill already here).
 *
 * Real Hebrew names below are normally the live Program docs' own `.name`
 * field — EXCEPT legs (OrAmOH3F375dVio5yGdU): Firestore's own `.name` for
 * it is still "פלג גוף תחתון" (a naming gap flagged since Phase 0), but
 * this list's `nameHe` was corrected to "רגליים" in Phase 4c-2 per David's
 * explicit rename request. Note this constant is NOT actually consumed by
 * the Skill-Tree page's own title — SkillTreeScreen.tsx reads
 * `programMeta?.name` directly from the live Firestore doc, bypassing this
 * list entirely (getProgressionMapProgramName below has zero production
 * callers, only its own test) — so this correction alone does not change
 * what's on screen. The visible fix requires updating the Firestore doc's
 * `.name` field itself (tracked as a Phase 4c-2 data-hygiene item, same
 * category as the full_body/legs subPrograms cleanup).
 *
 * visibleInHub is set to false for all 4, same as handstand's existing
 * precedent — but note (confirmed while making this change, not assumed):
 * that flag currently has NO live consumer. DiscoverMoreSection.tsx imports
 * PROGRESSION_MAP_LEAF_PROGRAMS directly (not the visibleInHub-filtered
 * PROGRESSION_MAP_HUB_PROGRAMS, which is now dead code — zero real
 * importers, only referenced by its own test). So domains WILL appear in
 * "גלה עוד" once unassessed, same as any other leaf program on this list —
 * which matches this phase's own goal (real tree, real discoverability),
 * not a side effect being suppressed. Flagged here rather than silently
 * assumed either way.
 */
import type { Exercise } from '@/features/content/exercises';
import { resolveSlugToId } from '@/features/workout-engine/services/program-hierarchy.utils';

export interface ProgressionMapLeafProgram {
  programId: string;
  nameHe: string;
  /**
   * Whether this skill's card shows in the "המפות שלי" grid on the
   * /progression hub (progression-hub feature). Independent of the tree
   * route itself being reachable — every allow-listed program's
   * /progression-map/[programId] route already works regardless of this
   * flag (see the route guard's own comment). This flag only controls
   * discoverability from the hub grid; flipping one entry to `true` is the
   * entire "add a skill to the hub" change, no layout code touched.
   */
  visibleInHub: boolean;
}

export const PROGRESSION_MAP_LEAF_PROGRAMS: readonly ProgressionMapLeafProgram[] = [
  { programId: 'mFcuYlNgKXLqWVUFo0zt', nameHe: 'פרונט לבר', visibleInHub: true },
  { programId: 'pCI5NHXpowu2ySucqDn8', nameHe: 'פלאנץ׳', visibleInHub: true },
  { programId: 'cC0BOmm6KIqYAyQynEIo', nameHe: 'מתח יד אחת', visibleInHub: true },
  { programId: 'IOfBZFeorTTDkcz3tOA6', nameHe: 'עמידת ידיים', visibleInHub: false },
  { programId: 'PAxprHuT7HjqrWU4wl0T', nameHe: 'שכיבות סמיכה בעמידת ידיים', visibleInHub: true },
  { programId: 'EtY8YCol0qpF6DzgcTx1', nameHe: 'דגל אנושי', visibleInHub: false },
  // Phase 4c-2 Item 2 — muscle_up "Model A". See file header for why this
  // must land together with the isMaster:false Firestore flip. visibleInHub
  // follows the same false-by-default precedent as handstand/human_flag —
  // David didn't ask for hub visibility, only the gating fix.
  { programId: 'fTLWzjP9gH2VNpamyCZF', nameHe: 'עליית כוח', visibleInHub: false },
  // Phase 4c-1 — the 4 canonical domains. See file header for the recon
  // behind this addition. Real Hebrew names (live Program.name field).
  { programId: 'UPDBtTdCvX748dtBlWYj', nameHe: 'משיכה', visibleInHub: false },
  { programId: 'J0fLpmJhG0KDN2tQouxh', nameHe: 'דחיפה', visibleInHub: false },
  { programId: 'kDMpobbKsuVTByTIKUpe', nameHe: 'ליבה', visibleInHub: false },
  { programId: 'OrAmOH3F375dVio5yGdU', nameHe: 'רגליים', visibleInHub: false },
] as const;

export const PROGRESSION_MAP_LEAF_PROGRAM_IDS: ReadonlySet<string> = new Set(
  PROGRESSION_MAP_LEAF_PROGRAMS.map((p) => p.programId),
);

/** The visibleInHub subset, in the same order — the /progression hub's grid source. */
export const PROGRESSION_MAP_HUB_PROGRAMS: readonly ProgressionMapLeafProgram[] =
  PROGRESSION_MAP_LEAF_PROGRAMS.filter((p) => p.visibleInHub);

/** Reference/first-build skill, per the brief — front lever. */
export const PROGRESSION_MAP_REFERENCE_PROGRAM_ID = 'mFcuYlNgKXLqWVUFo0zt';

export function isProgressionMapLeafProgram(programId: string): boolean {
  return PROGRESSION_MAP_LEAF_PROGRAM_IDS.has(programId);
}

/**
 * Shared "where does tapping this program go" resolver — the single place
 * both the /progression hub (SkillMapCard) and the profile Skills tab
 * (ProgramsSection) decide this, so the same program always lands on the
 * same destination in both places.
 *
 * Accepts either identifier form real program data actually mixes for the
 * same logical program (see program-bucketing.service.ts's own header
 * comment: "activePrograms/tracks data mixes raw Firestore ids and slugs"):
 * a raw Firestore programId (what this list is keyed by), or a
 * human-readable slug (e.g. 'front_lever'). Tries the id form first, then
 * resolves slug→id and tries again — so a genuine leaf skill is never
 * missed just because one particular caller happened to hold the slug
 * form. A composite/master program (no tree of its own) falls back to
 * /profile, where its detail already lives.
 */
export function resolveProgressionMapDestination(idOrSlug: string): string {
  if (isProgressionMapLeafProgram(idOrSlug)) return `/progression-map/${idOrSlug}`;
  const resolvedId = resolveSlugToId(idOrSlug);
  if (resolvedId && isProgressionMapLeafProgram(resolvedId)) return `/progression-map/${resolvedId}`;
  return '/profile';
}

export function getProgressionMapProgramName(programId: string): string | null {
  return PROGRESSION_MAP_LEAF_PROGRAMS.find((p) => p.programId === programId)?.nameHe ?? null;
}

/**
 * Deterministic rule for "which Phase-1 tree does this exercise's מפה מלאה
 * link open" — an exercise's targetPrograms is an array with no uniqueness
 * constraint, so more than one entry can be on the allow-list at once
 * (confirmed structurally possible, e.g. the handstand/HSPU diagnostic-triad
 * pair). Rule: first targetPrograms entry, in array order, whose programId is
 * on the allow-list. Matches this codebase's existing ambient convention of
 * taking targetPrograms[0]-style "first in array order" elsewhere
 * (exercise-replacement.service.ts's getExerciseLevel, useExerciseMasterData's
 * getExerciseLevel) — just scoped to the 6-program allow-list here.
 *
 * Returns null when no allow-listed program resolves — the common case for
 * most of the exercise library today (only these 6 skills are wired in v1).
 * Callers must leave existing behavior untouched in that case, not hide or
 * change anything for the exercise's other, non-Phase-1 program tags.
 */
export function resolveTreeProgramId(exercise: Pick<Exercise, 'targetPrograms'>): string | null {
  const match = exercise.targetPrograms?.find((tp) => PROGRESSION_MAP_LEAF_PROGRAM_IDS.has(tp.programId));
  return match?.programId ?? null;
}

/**
 * Scenic background assets. Config constants only — swap the art by
 * replacing these PNGs under public/images/progression-map/, no logic
 * change needed anywhere that imports them. See SkillTreeBackground.tsx.
 *
 * Three zones, composited top to bottom (round 3 — replaced the round-2
 * single-repeating-tile version, which repeated path-tile.png's OWN sky
 * strip mid-scroll, producing visible turquoise bands cutting across the
 * map):
 *   sky.png      — pinned at the very top only, never repeated.
 *   pathMid.png  — seamless-ish green (grass + side trees, no sky),
 *                  repeated vertically to cover any tree length. Each
 *                  repeat alternates a vertical mirror flip (see
 *                  SkillTreeBackground's MidBand) so the seam is pixel-
 *                  identical regardless of how seamless the source art
 *                  actually is.
 *   pathTile.png — the full park/garden scene (equipment, benches),
 *                  anchored at the BOTTOM only, never repeated — the
 *                  target node's destination.
 *
 * All three images share the same 1536×2752 native aspect ratio.
 */
export const PROGRESSION_MAP_SKY_IMAGE = '/images/progression-map/sky.png';
export const PROGRESSION_MAP_PATH_MID_IMAGE = '/images/progression-map/path-mid.png';
export const PROGRESSION_MAP_PATH_TILE_IMAGE = '/images/progression-map/path-tile.png';
export const PROGRESSION_MAP_BG_NATIVE_ASPECT = 1536 / 2752;
