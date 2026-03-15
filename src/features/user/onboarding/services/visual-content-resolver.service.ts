/**
 * Visual Content Resolver
 *
 * Fetches video and copy for assessment sliders from the
 * `visual_assessment_content` collection (managed via /admin/visual-assessment).
 * Selects the best video variant based on user demographics (gender + age).
 */

import { getVisualContentItem, getOnboardingLevels } from './visual-assessment-content.service';
import { getAllPrograms } from '@/features/content/programs/core/program.service';
import { getExercise } from '@/features/content/exercises/core/exercise.service';
import { resolveVideoForLocation } from '@/features/content/exercises/core/exercise.types';
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
      if (!p.isMaster && p.movementPattern && !map.has(p.movementPattern)) {
        map.set(p.movementPattern, p.id);
      }
    }
    categoryProgramMap = map;
  } catch (err) {
    console.error('[ContentResolver] Failed to load category→program map:', err);
    categoryProgramMap = new Map();
  }
  return categoryProgramMap;
}

async function resolveCategoryToProgramId(category: string): Promise<string> {
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

  const cached = getCached(cacheKey);
  if (cached !== undefined) return cached;

  let content = await getVisualContentItem(programId, level);

  // Fallback: if programId differs from raw category and no doc found,
  // try the raw category key (handles legacy docs keyed as push_5 vs pushups_5)
  if (!content && programId !== category) {
    content = await getVisualContentItem(category, level);
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
      raw: null,
    };
    setCache(cacheKey, empty);
    return empty;
  }

  // ── Exercise-linked video priority ────────────────────────────
  // If the content doc has an exerciseId, fetch the exercise and
  // use its video as the primary source.
  let exerciseVideoUrl: string | null = null;
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
    thumbnailUrl: variant?.thumbnailUrl?.trim() || null,
    boldTitle,
    detailedDescription,
    exerciseName,
    onboardingBubbleText: content.onboardingBubbleText?.trim() || null,
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
 * Ask the browser to preload a video URL.
 * Creates a `<link rel="preload" as="video">` in <head>.
 */
export function prefetchVideoUrl(url: string | null): void {
  if (!url || typeof document === 'undefined') return;

  if (document.querySelector(`link[href="${url}"]`)) return;

  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'video';
  link.href = url;
  link.crossOrigin = 'anonymous';
  document.head.appendChild(link);
}

/**
 * Fetch the onboarding-visible levels for a category, resolving through
 * the category → programId mapping. Returns sorted level numbers.
 */
export async function getOnboardingLevelsForCategory(category: string): Promise<number[]> {
  const programId = await resolveCategoryToProgramId(category);
  console.log(`[ContentResolver] getOnboardingLevelsForCategory("${category}") → programId="${programId}"`);
  let levels = await getOnboardingLevels(programId);
  if (levels.length === 0 && programId !== category) {
    console.log(`[ContentResolver] No onboarding levels for "${programId}", trying raw category "${category}"`);
    levels = await getOnboardingLevels(category);
  }
  console.log(`[ContentResolver] Final onboarding levels for "${category}": [${levels.join(', ')}] (${levels.length} total)`);
  return levels;
}

/**
 * Clear the in-memory content cache (e.g. on unmount).
 */
export function clearContentCache(): void {
  contentCache.clear();
  categoryProgramMap = null;
}
