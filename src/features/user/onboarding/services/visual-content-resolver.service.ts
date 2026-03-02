/**
 * Visual Content Resolver
 *
 * Fetches video and copy for assessment sliders directly from
 * ProgramLevelSettings (Admin Panel source of truth). No fallback or
 * automatic content searching — Admin data is the only source.
 */

import { getProgramLevelSetting } from '@/features/content/programs/core/programLevelSettings.service';
import { getAllPrograms } from '@/features/content/programs/core/program.service';
import type { UserDemographics } from '../types/visual-assessment.types';
import type { MultilingualText } from '@/types/onboarding-questionnaire';

// ── Category → Program ID mapping ──────────────────────────────────
//
// Assessment sliders use movement-pattern names ("push", "pull", "legs", "core")
// or skill program IDs. This map bridges movementPattern → childProgramId.
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
  raw: unknown;
}

// ── Core resolver ──────────────────────────────────────────────────

/**
 * Fetch video and copy from ProgramLevelSettings for a given category + level.
 * Admin Panel is the source of truth — no fallback logic.
 */
export async function resolveContent(
  category: string,
  level: number,
  _demographics: UserDemographics,
  _lang: string = 'he',
): Promise<ResolvedContent> {
  const programId = await resolveCategoryToProgramId(category);
  const cacheKey = `${programId}_${level}`;

  const cached = getCached(cacheKey);
  if (cached !== undefined) return cached;

  const settings = await getProgramLevelSetting(programId, level);

  if (!settings) {
    const empty: ResolvedContent = {
      category,
      level,
      videoUrl: null,
      videoUrlMov: null,
      videoUrlWebm: null,
      thumbnailUrl: null,
      boldTitle: `${category} — רמה ${level}`,
      detailedDescription: '',
      raw: null,
    };
    setCache(cacheKey, empty);
    return empty;
  }

  const boldTitle =
    settings.assessmentBoldTitle?.trim() ||
    settings.levelDescription?.trim() ||
    `${category} — רמה ${level}`;
  const detailedDescription = settings.levelDescription?.trim() || '';

  const result: ResolvedContent = {
    category,
    level,
    videoUrl: settings.assessmentVideoUrl?.trim() || null,
    videoUrlMov: settings.assessmentVideoUrlMov?.trim() || null,
    videoUrlWebm: settings.assessmentVideoUrlWebm?.trim() || null,
    thumbnailUrl: settings.assessmentThumbnailUrl?.trim() || null,
    boldTitle,
    detailedDescription,
    raw: settings,
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
 * Clear the in-memory content cache (e.g. on unmount).
 */
export function clearContentCache(): void {
  contentCache.clear();
  categoryProgramMap = null;
}
