/**
 * Visual Content Resolver
 *
 * Fetches video and copy for assessment sliders from the
 * `visual_assessment_content` collection (managed via /admin/visual-assessment).
 * Selects the best video variant based on user demographics (gender + age).
 */

import { getVisualContentItem, getOnboardingLevels } from './visual-assessment-content.service';
import { getAllPrograms, MASTER_PROGRAM_SLUG_TO_ID } from '@/features/content/programs/core/program.service';
import { getExercise } from '@/features/content/exercises/core/exercise.service';
import { resolveVideoForLocation, resolveImageForLocation } from '@/features/content/exercises/core/exercise.types';
import { getLocalizedText } from '@/features/content/shared/localized-text.types';
import type { UserDemographics, VideoVariant, VisualAssessmentContent } from '../types/visual-assessment.types';
import type { MultilingualText } from '@/types/onboarding-questionnaire';

// ── Category → Program ID mapping ──────────────────────────────────
//
// Assessment sliders use movement-pattern names ("push", "pull", "legs", "core")
// or skill program IDs. This map bridges movementPattern → childProgramId.
// The visual_assessment_content collection stores documents keyed by programId,
// so we need this mapping to translate slider categories to doc lookups.
// ────────────────────────────────────────────────────────────────────

let categoryProgramMap: Map<string, string> | null = null;

async function loadCategoryMap(): Promise<Map<string, string>> {
  if (categoryProgramMap) return categoryProgramMap;
  try {
    const programs = await getAllPrograms();
    const map = new Map<string, string>();
    for (const p of programs) {
      if (p.isMaster) continue;
      // Index by movementPattern (primary key for standard programs)
      if (p.movementPattern && !map.has(p.movementPattern)) {
        map.set(p.movementPattern, p.id);
      }
      // Also index by canonical slug — skill programs (planche, front_lever, etc.)
      // may have a slug field set but no movementPattern, or a movementPattern that
      // differs from the user-facing slug used in sessionStorage / progression.tracks.
      if ((p as { slug?: string }).slug && !map.has((p as { slug?: string }).slug!)) {
        map.set((p as { slug?: string }).slug!, p.id);
      }
    }
    console.log('[DEBUG-RESOLVER] loadCategoryMap built:', Object.fromEntries(map));
    categoryProgramMap = map;
  } catch (err) {
    console.error('[ContentResolver] Failed to load category→program map:', err);
    categoryProgramMap = new Map();
  }
  return categoryProgramMap;
}

async function resolveCategoryToProgramId(category: string): Promise<string> {
  // Master programs (e.g. muscle_up) are absent from loadCategoryMap because
  // loadCategoryMap skips isMaster=true entries. Check the static table first.
  const masterHash = MASTER_PROGRAM_SLUG_TO_ID[category];
  if (masterHash) return masterHash;
  const map = await loadCategoryMap();
  return map.get(category) ?? category;
}

// ── In-memory cache with TTL ────────────────────────────────────────

interface CacheEntry {
  data: ResolvedContent | null;
  timestamp: number;
}

const CACHE_TTL_MS = 2 * 60 * 1000;
const contentCache = new Map<string, CacheEntry>();

function getCached(key: string): ResolvedContent | undefined {
  const entry = contentCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    contentCache.delete(key);
    return undefined;
  }
  return entry.data ?? undefined;
}

function setCache(key: string, data: ResolvedContent | null): void {
  contentCache.set(key, { data, timestamp: Date.now() });
}

// ── Language fallback for MultilingualText ──────────────────────────

const LANG_FALLBACK = ['he', 'en', 'ru'];

export function resolveText(
  text: MultilingualText | undefined,
  lang: string = 'he',
  gender: 'male' | 'female' = 'male',
): string {
  if (!text || typeof text !== 'object') return '';
  const langChain = [lang, ...LANG_FALLBACK.filter((l) => l !== lang)];
  for (const l of langChain) {
    const entry = text[l];
    if (entry) {
      if (gender === 'female' && entry.female) return entry.female;
      if (entry.neutral) return entry.neutral;
    }
  }
  return '';
}

// ── Resolved result type ───────────────────────────────────────────

export interface ResolvedContent {
  category: string;
  level: number;
  videoUrl: string | null;
  videoUrlMov: string | null;
  videoUrlWebm: string | null;
  thumbnailUrl: string | null;
  boldTitle: string;
  detailedDescription: string;
  exerciseName: string | null;
  onboardingBubbleText: string | null;
  /** Target amount for this exercise level, e.g. "8-12". Null if not set by admin. */
  targetReps: string | null;
  /** Whether targetReps is in repetitions or seconds. Always defined when targetReps is set. */
  unitType: 'reps' | 'seconds';
  raw: unknown;
}

// ── Demographic variant selection ──────────────────────────────────

/**
 * Pick the best VideoVariant for the given demographics.
 *
 * Priority:
 *  1. Exact gender match + age in range + isDefault
 *  2. Exact gender match + age in range
 *  3. gender === 'all' + age in range + isDefault
 *  4. gender === 'all' + age in range
 *  5. isDefault (ignore demographics)
 *  6. First variant (ultimate fallback)
 */
function selectVariant(
  variants: VideoVariant[],
  demographics: UserDemographics,
): VideoVariant | null {
  if (variants.length === 0) return null;

  const { age, gender } = demographics;

  const inAgeRange = (v: VideoVariant) =>
    age >= (v.ageRange?.min ?? 0) && age <= (v.ageRange?.max ?? 999);

  const genderMatch = (v: VideoVariant) =>
    v.gender === gender;

  const genderAll = (v: VideoVariant) =>
    v.gender === 'all';

  // Tier 1: exact gender + age + default
  const t1 = variants.find((v) => genderMatch(v) && inAgeRange(v) && v.isDefault);
  if (t1) return t1;

  // Tier 2: exact gender + age
  const t2 = variants.find((v) => genderMatch(v) && inAgeRange(v));
  if (t2) return t2;

  // Tier 3: gender=all + age + default
  const t3 = variants.find((v) => genderAll(v) && inAgeRange(v) && v.isDefault);
  if (t3) return t3;

  // Tier 4: gender=all + age
  const t4 = variants.find((v) => genderAll(v) && inAgeRange(v));
  if (t4) return t4;

  // Tier 5: any default
  const t5 = variants.find((v) => v.isDefault);
  if (t5) return t5;

  // Tier 6: first variant
  return variants[0];
}

// ── Nearest-level fallback ──────────────────────────────────────────

/**
 * Walk downward from `level` until we find a document with at least one
 * video variant that has a non-empty videoUrl (or videoUrlMov/videoUrlWebm).
 * Returns the content from the nearest lower level, or null if nothing found.
 */
async function findNearestLowerContent(
  programId: string,
  startLevel: number,
): Promise<VisualAssessmentContent | null> {
  for (let l = startLevel - 1; l >= 1; l--) {
    const candidate = await getVisualContentItem(programId, l);
    if (!candidate) continue;
    const hasVideo = candidate.videoVariants.some(
      (v) => v.videoUrl?.trim() || v.videoUrlMov?.trim() || v.videoUrlWebm?.trim(),
    );
    if (hasVideo) return candidate;
  }
  return null;
}

/** Check whether a content item has at least one usable video. */
function contentHasVideo(content: VisualAssessmentContent | null): boolean {
  if (!content) return false;
  return content.videoVariants.some(
    (v) => v.videoUrl?.trim() || v.videoUrlMov?.trim() || v.videoUrlWebm?.trim(),
  );
}

// ── Core resolver ──────────────────────────────────────────────────

/**
 * Fetch video and copy from `visual_assessment_content` for a given
 * category + level, selecting the best variant for the user's demographics.
 *
 * **Nearest-level fallback**: if the exact level has no video content,
 * walks downward to find the closest lower level that has a video,
 * while still returning the correct title/description for the original level.
 */
export async function resolveContent(
  category: string,
  level: number,
  demographics: UserDemographics,
  lang: string = 'he',
): Promise<ResolvedContent> {
  const programId = await resolveCategoryToProgramId(category);
  const cacheKey = `${programId}_${level}_${demographics.gender}_${demographics.age}`;

  console.log(
    `[DEBUG-RESOLVER] resolveContent("${category}", ${level}) → programId="${programId}"`,
  );

  const cached = getCached(cacheKey);
  if (cached !== undefined) return cached;

  // Attempt 1: resolved program hash (admin-keyed docs use this as the category)
  let content = await getVisualContentItem(programId, level);
  console.log(`[DEBUG-RESOLVER] attempt1 getVisualContentItem("${programId}", ${level}) → ${content ? 'FOUND' : 'null'}`);

  // Attempt 2: raw category slug — fires even when programId === category so that
  // the fallback is never silently skipped when resolution returned unchanged input.
  if (!content && category !== programId) {
    content = await getVisualContentItem(category, level);
    console.log(`[DEBUG-RESOLVER] attempt2 getVisualContentItem("${category}", ${level}) → ${content ? 'FOUND' : 'null'}`);
  }

  // Attempt 3: static master hash — covers muscle_up and other masters even if
  // resolveCategoryToProgramId() did not resolve them (belt-and-suspenders).
  if (!content) {
    const masterHash = MASTER_PROGRAM_SLUG_TO_ID[category];
    if (masterHash && masterHash !== programId && masterHash !== category) {
      content = await getVisualContentItem(masterHash, level);
      console.log(`[DEBUG-RESOLVER] attempt3 masterHash getVisualContentItem("${masterHash}", ${level}) → ${content ? 'FOUND' : 'null'}`);
    }
  }

  if (!content) {
    const empty: ResolvedContent = {
      category,
      level,
      videoUrl: null,
      videoUrlMov: null,
      videoUrlWebm: null,
      thumbnailUrl: null,
      boldTitle: `שלב ${level}`,
      detailedDescription: '',
      exerciseName: null,
      onboardingBubbleText: null,
      targetReps: null,
      unitType: 'reps',
      raw: null,
    };
    setCache(cacheKey, empty);
    return empty;
  }

  // ── Exercise-linked video priority ────────────────────────────
  // If the content doc has an exerciseId, fetch the exercise and
  // use its video as the primary source.
  let exerciseVideoUrl: string | null = null;
  let exerciseThumbnailUrl: string | null = null;
  let exerciseName: string | null = null;
  if (content.exerciseId) {
    try {
      const exercise = await getExercise(content.exerciseId);
      if (exercise) {
        exerciseName = getLocalizedText(exercise.name, lang as 'he' | 'en') || null;
        const vid = resolveVideoForLocation(exercise);
        if (vid) {
          exerciseVideoUrl = vid;
          console.log(`[ContentResolver] Level ${level} — exercise video resolved: "${exerciseName}" → ${vid.substring(0, 60)}…`);
        }
        const img = resolveImageForLocation(exercise);
        if (img) {
          exerciseThumbnailUrl = img;
        }
      }
    } catch (err) {
      console.warn('[ContentResolver] Failed to fetch exercise:', err);
    }
  }

  // Use the exercise name as title if available, otherwise the admin-set boldTitle, otherwise 'שלב N'
  const adminTitle = resolveText(content.boldTitle, lang, demographics.gender);
  const boldTitle = exerciseName || adminTitle || `שלב ${level}`;
  const detailedDescription =
    resolveText(content.detailedDescription, lang, demographics.gender);

  // Pick video source — exercise video takes priority, then variant, then nearest fallback.
  const resolvedDocCategory = content.category || programId;
  let videoSource = content;
  if (!exerciseVideoUrl && !contentHasVideo(content)) {
    let fallback = await findNearestLowerContent(resolvedDocCategory, level);
    if (!fallback && resolvedDocCategory !== category) {
      fallback = await findNearestLowerContent(category, level);
    }
    if (fallback) {
      console.log(
        `[ContentResolver] Level ${level} missing video — falling back to level ${fallback.level}`,
      );
      videoSource = fallback;
    }
  }

  const variant = selectVariant(videoSource.videoVariants, demographics);

  const result: ResolvedContent = {
    category,
    level,
    videoUrl: exerciseVideoUrl || variant?.videoUrl?.trim() || null,
    videoUrlMov: exerciseVideoUrl ? null : (variant?.videoUrlMov?.trim() || null),
    videoUrlWebm: exerciseVideoUrl ? null : (variant?.videoUrlWebm?.trim() || null),
    thumbnailUrl: exerciseThumbnailUrl || variant?.thumbnailUrl?.trim() || null,
    boldTitle,
    detailedDescription,
    exerciseName,
    onboardingBubbleText: content.onboardingBubbleText?.trim() || null,
    targetReps: content.targetReps?.trim() || null,
    unitType: content.unitType ?? 'reps',
    raw: content,
  };

  setCache(cacheKey, result);
  return result;
}

// ── Prefetching ────────────────────────────────────────────────────

/**
 * Pre-warm the cache for adjacent levels (level ± 1).
 * Fire-and-forget — results land in the in-memory cache.
 * @param minLevel - Optional min level for path-specific range (e.g. Path 1: 1, Path 2: 10)
 * @param maxLevel - Optional max level for path-specific range (e.g. Path 1: 10, Path 2: 20)
 */
export function prefetchAdjacent(
  category: string,
  level: number,
  demographics: UserDemographics,
  lang: string = 'he',
  minLevel: number = 1,
  maxLevel: number = 25,
): void {
  const neighbours = [level - 1, level + 1].filter(
    (l) => l >= minLevel && l <= maxLevel,
  );

  for (const l of neighbours) {
    resolveContent(category, l, demographics, lang).catch(() => {});
  }
}

/**
 * Warm the browser HTTP cache for a video URL using the Fetch API.
 *
 * `<link rel="preload" as="video">` is not a valid spec value and is silently
 * discarded by every browser. Instead we issue a fetch with cache:'force-cache'
 * so the response lands in the HTTP cache before the <video> element requests it.
 * The request is fire-and-forget; errors are swallowed intentionally.
 */
export function prefetchVideoUrl(url: string | null): void {
  if (!url || typeof fetch === 'undefined') return;
  fetch(url, { mode: 'no-cors', cache: 'force-cache' }).catch(() => {});
}

/**
 * Fetch the onboarding-visible levels for a category.
 *
 * Uses a single Firestore `in` query with BOTH the raw string slug (canonical
 * key used across progression.tracks, the workout engine, and the admin panel)
 * AND the program's Firestore hash ID. This guarantees that documents tagged
 * by the admin with either value are found correctly, regardless of whether
 * the admin used the slug or the auto-generated hash in the category dropdown.
 *
 * Master programs (e.g. muscle_up) are resolved via MASTER_PROGRAM_SLUG_TO_ID;
 * non-master skill/movement programs are resolved via the runtime loadCategoryMap.
 */
export async function getOnboardingLevelsForCategory(category: string): Promise<number[]> {
  const programId = await resolveCategoryToProgramId(category);

  // Build a deduplicated candidate array: [rawSlug, hashId].
  // When the slug IS the ID (no mapping found), the Set collapses to one entry
  // and Firestore still receives a valid `in: [singleValue]` query.
  const candidateIds = [...new Set([category, programId])];

  console.log(
    '[DEBUG-RESOLVER] Incoming Category:',
    category,
    'Resolved Candidate IDs:',
    candidateIds,
  );

  const levels = await getOnboardingLevels(candidateIds);

  console.log(
    `[DEBUG-RESOLVER] Final onboarding levels for "${category}": [${levels.join(', ')}] (${levels.length} total)`,
  );
  return levels;
}

/**
 * Background-preload the first two onboarding levels for a single category.
 *
 * Resolves the admin-configured level list for the category, then warms both
 * the content cache (in-memory) and the browser HTTP cache (via fetch
 * force-cache) for the first and second levels. All work is fire-and-forget —
 * failures are swallowed so this never blocks the UI.
 *
 * Designed to be called at page initialisation (while the user is on the tier
 * screen) so that by the time they reach the slider step the video byte range
 * is already in the browser cache.
 */
export async function prefetchCategoryVideos(
  category: string,
  demographics: UserDemographics,
  lang = 'he',
  minLevel = 1,
  maxLevel = 25,
): Promise<void> {
  try {
    const allLevels = await getOnboardingLevelsForCategory(category);
    const filtered = allLevels.filter((l) => l >= minLevel && l <= maxLevel);
    const levelsToFetch = filtered.length >= 2
      ? [filtered[0], filtered[1]]
      : filtered.length === 1
        ? [filtered[0]]
        : [minLevel];

    await Promise.all(
      levelsToFetch.map(async (lvl) => {
        try {
          const content = await resolveContent(category, lvl, demographics, lang);
          if (content.videoUrlWebm) prefetchVideoUrl(content.videoUrlWebm);
          if (content.videoUrlMov) prefetchVideoUrl(content.videoUrlMov);
          if (content.videoUrl) prefetchVideoUrl(content.videoUrl);
        } catch {
          // individual level failures are non-fatal
        }
      }),
    );
  } catch {
    // category-level failures are non-fatal
  }
}

/**
 * Clear the in-memory content cache (e.g. on unmount).
 */
export function clearContentCache(): void {
  contentCache.clear();
  categoryProgramMap = null;
}
