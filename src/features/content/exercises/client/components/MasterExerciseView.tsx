'use client';

/**
 * MasterExerciseView — the unified, read-only exercise detail surface.
 *
 * Consolidates the old ExerciseDetailSheet body and ExerciseDetailDrawer's
 * ExerciseDetailContent into ONE component. Consumers supply only the sheet
 * chrome (portal, backdrop, drag handle) and pass the exercise down.
 *
 * Vertical hierarchy (strict):
 *   1. Hero video (network-aware 1080p preview loop)
 *   2. Horizontal metadata capsules (track level | location + gear)
 *   3. Mini 3-node progression chain (prev ↘ / current = / next ↗)
 *   4. Personal performance dashboard (light card, history-gated)
 *   5. Deep tutorial embed (lazy — only if a full tutorial exists)
 *   6. Horizontal anatomy slider (primaryMuscle + secondaryMuscles only)
 *   7. Execution cues
 *   + Details (description / goal / instructions / tips) appended below cues
 *     so no existing library content is lost.
 */

import { useEffect, useMemo, useState } from 'react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import {
  Target, PersonStanding, Lock, Check,
  Home, Trees, Dumbbell, MapPin, ChevronDown,
  type LucideIcon,
} from 'lucide-react';
import {
  Exercise,
  ExecutionMethod,
  ExternalVideo,
  getLocalizedText,
  findMethodForLocation,
  resolvePreviewForLang,
  resolveTutorialForLang,
} from '../../core/exercise.types';
import ExerciseVideoPlayer from './ExerciseVideoPlayer';
import {
  ensureEquipmentCachesLoaded,
  getMuscleGroupLabel,
  resolveEquipmentLabel,
  resolveEquipmentSvgPathList,
} from '@/features/workout-engine/shared/utils/gear-mapping.utils';
import { buildBunnyThumbnailUrl } from '@/lib/bunny/bunny.config';
import {
  useExerciseMasterData,
  getExerciseLevel,
  type ProgressionChain,
} from '../hooks/useExerciseMasterData';

// ── Visual tokens (shared with ExerciseDetailSheet) ────────────────────────
const PILL_BORDER = '0.5px solid #E0E9FF';
const SECTION_FONT = { fontFamily: 'var(--font-simpler)' } as const;

// ── Execution-location metadata (label + icon) for the method switcher ─────
const LOCATION_META: Record<string, { label: string; Icon: LucideIcon }> = {
  home:    { label: 'בית',          Icon: Home },
  park:    { label: 'פארק',         Icon: Trees },
  gym:     { label: 'חדר כושר',     Icon: Dumbbell },
  street:  { label: 'רחוב',         Icon: MapPin },
  office:  { label: 'משרד',         Icon: MapPin },
  school:  { label: 'בית ספר',      Icon: MapPin },
  airport: { label: 'שדה תעופה',    Icon: MapPin },
  library: { label: 'ספרייה',       Icon: MapPin },
  desk:    { label: 'שולחן',        Icon: MapPin },
};

function locationMeta(loc: string): { label: string; Icon: LucideIcon } {
  return LOCATION_META[loc] ?? { label: loc, Icon: MapPin };
}

/**
 * Returns the canonical location(s) an ExecutionMethod covers.
 * Methods often use `locationMapping: ['home','park']` without a `location`
 * field — we read both so the switcher catches every variant.
 */
function methodLocations(m: ExecutionMethod): string[] {
  const out = new Set<string>();
  if (m.location) out.add(m.location);
  m.locationMapping?.forEach((l) => l && out.add(l));
  return Array.from(out);
}

/**
 * A method is selectable only when it actually has a playable video.
 * Accepts: `mainVideoUrl` (Bunny CDN link stored by the bulk-upload script),
 * `previewVideo.he.videoId` (Bunny ID from Phase-5 normalizer),
 * or `fullTutorial.he.videoId`.
 * Treats empty-string and null as absent.
 */
function methodHasVideo(m: ExecutionMethod): boolean {
  const main = m.media?.mainVideoUrl;
  if (main && typeof main === 'string' && main.trim() !== '') return true;
  if (resolvePreviewForLang(m.media as any, 'he')?.videoId) return true;
  if (resolveTutorialForLang(m.media as any, 'he')?.videoId) return true;
  return false;
}

import { MUSCLE_ICON_PATHS, MUSCLE_FALLBACK_ICON } from '@/lib/muscle-icons.const';

// ── Difficulty trend icons (identical to ExerciseReplacementModal) ─────────
const LEVEL_ICONS: Record<'lower' | 'same' | 'higher', { src: string; color: string }> = {
  lower:  { src: '/assets/icons/ui/level_down.svg', color: 'text-orange-500' },
  same:   { src: '/assets/icons/ui/level_same.svg', color: 'text-[#00BAF7]' },
  higher: { src: '/assets/icons/ui/level_up.svg',   color: 'text-emerald-500' },
};

const IMAGE_PLACEHOLDER = '/images/park-placeholder.svg';

export interface MasterExerciseViewProps {
  exercise: Exercise;
  filterLocation?: 'home' | 'park' | 'gym' | null;
  /** programId → Hebrew label map for the "תוכניות" badges (consumer supplies). */
  programLabels?: Record<string, string>;
  /** Tapping the performance card routes here. Consumer owns navigation. */
  onNavigateToAnalytics?: (exerciseId: string, exerciseName: string) => void;
  /** Tapping "מפה מלאה ←" routes to the full roadmap for this movement family. */
  onNavigateToRoadmap?: (baseMovementId: string) => void;
  /**
   * OPTIONAL method-writer. Only the workout-preview context passes it (gated by
   * SWAP_ALL_ENABLED); when present, picking a method also persists that choice to the
   * live workout exercise so a single per-exercise location swap reaches the runner.
   * Absent everywhere else (exercise library / master view) → MEV stays strictly
   * read-only, byte-identical to today.
   */
  onMethodChange?: (method: ExecutionMethod, methodIdx: number) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Extract a Bunny CDN video UUID from any CDN URL.
 * Matches paths like: /{uuid}/play_360p.mp4, /{uuid}/playlist.m3u8, /{uuid}/thumbnail.jpg
 */
function extractBunnyVideoId(url: string): string | null {
  const m = url.match(
    /\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\//i,
  );
  return m ? m[1] : null;
}

/**
 * Resolve the best thumbnail for a chain node (prev / current / next).
 *
 * Resolution waterfall for a single method:
 *   a) method.media.imageUrl                                   (explicit stored image)
 *   b) buildBunnyThumbnailUrl(uuid from mainVideoUrl)          (video-derived poster)
 *   c) buildBunnyThumbnailUrl(previewVideo.he.videoId)         (preview Bunny ID)
 *   d) buildBunnyThumbnailUrl(tutorialVideo.he.videoId)        (tutorial Bunny ID)
 *
 * Method priority:
 *   1. Method matching `preferredLocation` — exact context match
 *   2. First method with ANY resolvable thumbnail — graceful sibling fallback
 *   3. Root-level exercise.media.imageUrl                      (legacy cover, last resort)
 *   4. IMAGE_PLACEHOLDER
 */
function resolveThumbnail(ex: Exercise, preferredLocation: string | null): string {
  const methods = (ex.execution_methods ?? ex.executionMethods ?? []) as ExecutionMethod[];

  /** Best thumbnail from a single method, trying all video-ID paths. */
  function methodThumb(m: ExecutionMethod): string | null {
    const media = m?.media as Record<string, any> | undefined;
    if (!media) return null;

    // a) Explicit stored imageUrl.
    if (media.imageUrl) return media.imageUrl as string;

    // b) Derive thumbnail from mainVideoUrl Bunny CDN path.
    const mainUrl: string | undefined = media.mainVideoUrl;
    if (mainUrl) {
      const vid = extractBunnyVideoId(mainUrl);
      if (vid) return buildBunnyThumbnailUrl(vid);
    }

    // c) Bunny preview videoId (e.g. previewVideo.he.videoId).
    const preview = resolvePreviewForLang(media as any, 'he');
    if (preview?.videoId) return buildBunnyThumbnailUrl(preview.videoId);

    // d) Bunny tutorial videoId.
    const tutorial = resolveTutorialForLang(media as any, 'he');
    if (tutorial?.videoId) return buildBunnyThumbnailUrl(tutorial.videoId);

    return null;
  }

  // 1. Location-matched method.
  if (preferredLocation) {
    const matched = findMethodForLocation(ex, preferredLocation);
    if (matched) {
      const thumb = methodThumb(matched);
      if (thumb) return thumb;
    }
  }

  // 2. First method with any resolvable thumbnail (sibling exercise fallback).
  for (const m of methods) {
    const thumb = methodThumb(m);
    if (thumb) return thumb;
  }

  // 3. Root-level cover image (last resort).
  const rootImage =
    (ex as any).media?.imageUrl as string | undefined ??
    (ex as any).imageUrl as string | undefined;
  if (rootImage) return rootImage;

  return IMAGE_PLACEHOLDER;
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    const v = value as { toDate?: () => Date; seconds?: number };
    if (typeof v.toDate === 'function') return v.toDate();
    if (typeof v.seconds === 'number') return new Date(v.seconds * 1000);
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function relativeDayLabel(date: Date | null): string {
  if (!date) return '';
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return 'היום';
  if (days === 1) return 'אתמול';
  if (days < 7) return `לפני ${days} ימים`;
  if (days < 30) return `לפני ${Math.floor(days / 7)} שבועות`;
  return `לפני ${Math.floor(days / 30)} חודשים`;
}

// ── Progression chain node ───────────────────────────────────────────────

function ChainNode({
  exercise,
  variant,
  location,
  locked,
  completed = false,
}: {
  exercise: Exercise;
  variant: 'lower' | 'same' | 'higher';
  location: string | null;
  locked: boolean;
  /** Prev node — the user already surpassed it → satisfied/completed look. */
  completed?: boolean;
}) {
  const cfg = LEVEL_ICONS[variant];
  const isCurrent = variant === 'same';
  const thumb = resolveThumbnail(exercise, location);
  const level = getExerciseLevel(exercise);
  const name = getLocalizedText(exercise.name, 'he');

  // Only locked (un-reached) nodes get dimmed. Completed/current stay vivid.
  const ringClass = isCurrent
    ? 'ring-2 ring-[#00BAF7]'
    : completed
      ? 'ring-2 ring-emerald-400'
      : '';

  return (
    <div
      className={`flex flex-col items-center gap-1.5 ${locked ? 'opacity-60' : ''}`}
      style={{ width: isCurrent ? 84 : 72 }}
    >
      <div
        className={`relative rounded-2xl overflow-hidden bg-slate-200 flex-shrink-0 ${ringClass}`}
        style={{ width: isCurrent ? 80 : 64, height: isCurrent ? 80 : 64 }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumb}
          alt={name}
          className="w-full h-full object-cover"
          loading="lazy"
          decoding="async"
          onError={(e) => { (e.target as HTMLImageElement).src = IMAGE_PLACEHOLDER; }}
        />
        {locked && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/45">
            <Lock size={16} className="text-white" />
          </div>
        )}
        {completed && !locked && (
          <div className="absolute -top-1 -right-1 bg-emerald-500 rounded-full p-0.5 shadow-sm">
            <Check size={11} strokeWidth={3} className="text-white" />
          </div>
        )}
      </div>

      <span
        className="text-[11px] font-medium text-slate-800 text-center leading-tight line-clamp-2"
        style={{ ...SECTION_FONT, minHeight: 26 }}
      >
        {name}
      </span>

      <div className={`flex items-center gap-1 ${cfg.color}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={cfg.src} alt="" width={14} height={14} className="object-contain" />
        <span className="text-[11px] font-semibold">רמה {level}</span>
      </div>
    </div>
  );
}

function ProgressionChainRow({
  chain,
  location,
  userLevelInTrack,
  onNavigateToRoadmap,
  exercise,
}: {
  chain: ProgressionChain;
  location: string | null;
  userLevelInTrack: number | null;
  onNavigateToRoadmap?: (baseMovementId: string) => void;
  exercise: Exercise;
}) {
  // SAFETY GATE: only render when there is a real progression lineage
  // (a prev OR a next variation). No fake/single-node chains.
  if (!chain.current || (!chain.prev && !chain.next)) return null;

  const nextLocked =
    chain.next != null &&
    userLevelInTrack != null &&
    userLevelInTrack < getExerciseLevel(chain.next);

  const baseMovementId = exercise.base_movement_id ?? null;

  return (
    <section className="mb-6" dir="rtl">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-right text-[16px] font-semibold text-slate-800" style={SECTION_FONT}>
          מסלול ההתקדמות
        </h3>
        {baseMovementId && onNavigateToRoadmap && (
          <button
            type="button"
            onClick={() => onNavigateToRoadmap(baseMovementId)}
            className="text-[11px] font-bold text-[#00ADEF] active:opacity-70"
          >
            מפה מלאה ←
          </button>
        )}
      </div>

      {/* Strict 3-node chain (prev · current · next) — no connector assets, so
          the three thumbnails cache instantly and render lightning-fast. */}
      <div className="flex items-start justify-center gap-6">
        {chain.prev && (
          <ChainNode exercise={chain.prev} variant="lower" location={location} locked={false} completed />
        )}

        <ChainNode exercise={chain.current} variant="same" location={location} locked={false} />

        {chain.next && (
          <ChainNode exercise={chain.next} variant="higher" location={location} locked={nextLocked} />
        )}
      </div>
    </section>
  );
}

// ── Component ────────────────────────────────────────────────────────────

export default function MasterExerciseView({
  exercise,
  filterLocation = null,
  programLabels,
  onNavigateToAnalytics,
  onNavigateToRoadmap,
  onMethodChange,
}: MasterExerciseViewProps) {
  // Equipment caches power the gear/equipment labels + icons.
  useEffect(() => {
    void ensureEquipmentCachesLoaded();
  }, []);

  // ── Execution-method switcher ──────────────────────────────────────────
  // Keyed by METHOD INDEX so two methods at the same location with different
  // gear are separate options. One entry per unique (method-index) — we do NOT
  // explode locationMapping into multiple entries (which caused the duplicate
  // "Home" rows in the switcher).

  interface MethodOption {
    /** Original array index into execution_methods. */
    idx: number;
    /** Best label location for the badge. Prefers m.location; falls back to
     *  the first entry of locationMapping. */
    location: string;
    /** Every location this method covers (for initial-seed matching). */
    allLocations: string[];
    /** Resolved gear for display inside the option row. */
    gear: { id: string; label: string; icon: string | null }[];
  }

  const methodOptions = useMemo<MethodOption[]>(() => {
    const methods = exercise.execution_methods ?? exercise.executionMethods ?? [];
    const seenIdx = new Set<number>();
    const out: MethodOption[] = [];
    for (let i = 0; i < methods.length; i++) {
      const m = methods[i];
      if (seenIdx.has(i)) continue;
      if (!methodHasVideo(m)) continue;
      seenIdx.add(i);

      const allLocations = methodLocations(m);
      // Canonical label: scalar `location` wins; first of locationMapping otherwise.
      const loc = m.location ?? allLocations[0] ?? 'park';

      const rawGearIds: string[] = [];
      m.gearIds?.forEach((id) => id && rawGearIds.push(id));
      m.equipmentIds?.forEach((id) => id && rawGearIds.push(id));
      if (m.gearId) rawGearIds.push(m.gearId);
      if (m.equipmentId) rawGearIds.push(m.equipmentId);
      const uniqueGearIds = Array.from(new Set(rawGearIds));

      const gear: MethodOption['gear'] = [];
      for (const id of uniqueGearIds) {
        const label = resolveEquipmentLabel(id);
        if (!label || label === 'ציוד לא מזוהה') continue;
        gear.push({ id, label, icon: resolveEquipmentSvgPathList(id)[0] ?? null });
      }

      // eslint-disable-next-line no-console
      console.log(
        `[MEV] method[${i}] location="${loc}" allLocations=${JSON.stringify(allLocations)}`,
        `hasVideo=${methodHasVideo(m)} gear=${uniqueGearIds.join(',')||'none'}`,
        `mainVideoUrl=${m.media?.mainVideoUrl ?? '–'}`,
      );

      out.push({ idx: i, location: loc, allLocations, gear });
    }
    // eslint-disable-next-line no-console
    console.log('[MEV] methodOptions final:', out.map((o) => `${o.location}[${o.idx}]`));
    return out;
  }, [exercise]);

  // ── Stable initial-seed (never depends on memo object references) ────────
  // We compute the starting index directly from raw exercise data so deps can
  // be plain primitives. If deps included `methodOptions` or any memo-object,
  // React would fire the effect on EVERY render and immediately reset the
  // user's tap — that is THE click-freeze bug.
  //
  // Fix 3: Normalize the incoming `filterLocation` prop. Consumers sometimes
  // pass the string literal "null" (e.g. from a URL param) instead of `null`.
  function normalizeLoc(loc: string | null | undefined): string | null {
    if (!loc || loc === 'null' || loc === 'undefined') return null;
    return loc;
  }

  function computeSeedIdx(ex: Exercise, loc: string | null): number | null {
    const normalizedLoc = normalizeLoc(loc);
    const methods = ex.execution_methods ?? ex.executionMethods ?? [];
    // Priority 1: method whose locations include the caller's filterLocation.
    if (normalizedLoc) {
      for (let i = 0; i < methods.length; i++) {
        if (methodHasVideo(methods[i]) && methodLocations(methods[i]).includes(normalizedLoc)) {
          // eslint-disable-next-line no-console
          console.log(`[MEV] 🌱 seed: filterLocation="${normalizedLoc}" → method[${i}]`);
          return i;
        }
      }
    }
    // Priority 2 (no filterLocation or no match): if method[0] is multi-location
    // it's a "universal" method — prefer it. Otherwise take the first with a video.
    for (let i = 0; i < methods.length; i++) {
      if (methodHasVideo(methods[i])) {
        const locs = methodLocations(methods[i]);
        if (i === 0 && locs.length > 1) {
          // eslint-disable-next-line no-console
          console.log(`[MEV] 🌱 seed multi-location method[0] locs=${JSON.stringify(locs)}`);
          return 0;
        }
        // eslint-disable-next-line no-console
        console.log(`[MEV] 🌱 seed fallback → method[${i}]`);
        return i;
      }
    }
    return null;
  }

  // Normalize once so both the initial seed and the re-seed effect use the same value.
  const normalizedFilterLocation = normalizeLoc(filterLocation);

  const [selectedMethodIdx, setSelectedMethodIdx] = useState<number | null>(
    () => computeSeedIdx(exercise, normalizedFilterLocation),
  );

  // Re-seed ONLY when exercise.id or the normalized filterLocation changes.
  useEffect(() => {
    const next = computeSeedIdx(exercise, normalizedFilterLocation);
    // eslint-disable-next-line no-console
    console.log(`[MEV] 🔄 re-seed exercise="${exercise.id}" filterLocation="${normalizedFilterLocation}" → method[${next}]`);
    setSelectedMethodIdx(next);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercise.id, normalizedFilterLocation]);

  // ── Fix 1: index-driven data pipeline ─────────────────────────────────────
  // `activeLocation` is kept ONLY for the ChainNode thumbnail resolver
  // (which takes a location string). It is NO LONGER passed to
  // `useExerciseMasterData` as the data driver — `selectedMethodIdx` is.
  // This removes the ambiguity: two methods at `locationMapping: ['home']`
  // now remain distinct because we pass the exact index, not the string.
  const activeLocation = useMemo<string | null>(() => {
    const methods = exercise.execution_methods ?? exercise.executionMethods ?? [];
    const m = selectedMethodIdx !== null ? methods[selectedMethodIdx] : null;
    if (m) {
      const allLocs = methodLocations(m);
      // Prefer the caller's filterLocation when the method covers it.
      if (normalizedFilterLocation && allLocs.includes(normalizedFilterLocation)) {
        return normalizedFilterLocation;
      }
      return m.location ?? allLocs[0] ?? normalizedFilterLocation;
    }
    return normalizedFilterLocation;
  }, [selectedMethodIdx, exercise, normalizedFilterLocation]);

  // eslint-disable-next-line no-console
  console.log(`[MEV] selectedMethodIdx=${selectedMethodIdx} activeLocation="${activeLocation}"`);

  // Pass `selectedMethodIdx` as the 4th arg so the hook resolves the exact
  // method via array index — `buildSheetData` receives the pre-resolved method
  // object and skips `findMethodForLocation` entirely.
  const { sheetData, trend, isLoadingTrend, progressionChain, userLevelInTrack, programs } =
    useExerciseMasterData(exercise, activeLocation, programLabels, selectedMethodIdx);


  const [switcherOpen, setSwitcherOpen] = useState(false);
  // Tracks whether the user has explicitly tapped the method switcher (בית/פארק).
  // false = show fullTutorial by default; true = show the selected method's per-method video.
  const [hasUserPickedMethod, setHasUserPickedMethod] = useState(false);
  useEffect(() => { setSwitcherOpen(false); setHasUserPickedMethod(false); }, [exercise.id]);

  // Show the location badge only when at least 1 video method exists.
  const hasSwitcher = methodOptions.length >= 1;
  // Allow switching only when ≥2 distinct options.
  const canSwitch = methodOptions.length >= 2;
  const selectedOption =
    methodOptions.find((o) => o.idx === selectedMethodIdx) ?? methodOptions[0] ?? null;

  // Strict muscle sourcing — primaryMuscle / secondaryMuscles only (no legacy).
  const primaryMuscle = exercise.primaryMuscle ?? null;
  const secondaryMuscles = useMemo(
    () => (exercise.secondaryMuscles ?? []).filter((m) => m && m !== primaryMuscle),
    [exercise.secondaryMuscles, primaryMuscle],
  );

  // Equipment badges (resolved once, dedup-safe via sheetData.equipmentIds).
  const equipmentBadges = useMemo<{ id: string; label: string; icon: string | null }[]>(() => {
    if (!sheetData) return [];
    const out: { id: string; label: string; icon: string | null }[] = [];
    for (const id of sheetData.equipmentIds) {
      const label = resolveEquipmentLabel(id);
      if (!label || label === 'ציוד לא מזוהה') continue;
      out.push({ id, label, icon: resolveEquipmentSvgPathList(id)[0] ?? null });
    }
    return out;
  }, [sheetData]);

  // Sparkline data (ascending) + PB + last-session label for Section 4.
  const perf = useMemo(() => {
    if (!trend || trend.length === 0) return null;
    const pb = Math.max(...trend.map((t) => t.maxReps));
    const last = trend[0]; // service returns newest-first
    const lastSets = Array.isArray(last?.reps) ? last.reps.length : 0;
    const lastLabel = relativeDayLabel(toDate(last?.date));
    const chartData = [...trend]
      .reverse()
      .map((t, i) => ({ session: i, maxReps: t.maxReps }));
    return { pb, lastSets, lastLabel, chartData, count: trend.length };
  }, [trend]);

  // ── Fix 2: Hero video resolved directly from the selected method index ───
  // We derive heroVideo / heroPoster from the exact method object so the
  // player re-renders the correct Bunny video on EVERY index change, before
  // sheetData even finishes re-computing (avoids one-frame stale video).
  interface HeroAssets {
    video: ExternalVideo | undefined;
    legacy: string | null;
    posterUrl: string | null;
  }
  const heroAssets = useMemo<HeroAssets>(() => {
    const methods = exercise.execution_methods ?? exercise.executionMethods ?? [];
    const m = selectedMethodIdx !== null ? methods[selectedMethodIdx] : null;
    if (!m) return { video: undefined, legacy: null, posterUrl: null };
    // Prefer the Bunny ExternalVideo (preview → tutorial chain).
    const video: ExternalVideo | undefined =
      resolvePreviewForLang(m.media as any, 'he') ??
      resolveTutorialForLang(m.media as any, 'he') ??
      undefined;
    // mainVideoUrl is the CDN string stored by the bulk-upload script.
    const legacy = m.media?.mainVideoUrl ?? null;
    // Poster: method-level image first, then exercise-level.
    const posterUrl = m.media?.imageUrl ?? exercise.media?.imageUrl ?? null;
    return { video, legacy, posterUrl };
  }, [exercise, selectedMethodIdx]);

  if (!sheetData) return null;

  // Show the tutorial player (controls, HLS) when there is any playable video source.
  const tutorialAsHero = !!sheetData.tutorial || !!heroAssets.legacy;
  const heroVideo  = sheetData.tutorial ?? heroAssets.video;
  const heroMode   = tutorialAsHero ? 'tutorial' : 'preview';

  // ── Video source routing ───────────────────────────────────────────────────
  // Default (hasUserPickedMethod = false):
  //   • If fullTutorial exists → pass video=fullTutorial, no legacyVideoUrl.
  //     ExerciseVideoPlayer shows the fullTutorial by default.
  //   • If no fullTutorial (heroVideo=undefined) → pass legacyVideoUrl=mainVideoUrl
  //     so the method's short clip still plays on load.
  //
  // After explicit method pick (hasUserPickedMethod = true):
  //   • If method has mainVideoUrl → pass video=undefined + legacyVideoUrl=mainVideoUrl.
  //     ExerciseVideoPlayer extracts the UUID and loads that stream via HLS.
  //   • If method has no mainVideoUrl → fall back to fullTutorial (unchanged).
  const preferPerMethod = hasUserPickedMethod || !heroVideo;
  const heroVideoForPlayer  = (preferPerMethod && !!heroAssets.legacy) ? undefined : heroVideo;
  const heroLegacyForPlayer = preferPerMethod ? heroAssets.legacy : null;

  return (
    <div dir="rtl">
      {/* ── Section 1: Hero video ──────────────────────────────────────────── */}
      <div
        className={`relative w-full overflow-hidden ${tutorialAsHero ? 'bg-[#F8FAFC]' : 'bg-slate-900'}`}
        style={{ aspectRatio: '9 / 16', maxHeight: '55vh' }}
      >
        <ExerciseVideoPlayer
          video={heroVideoForPlayer}
          legacyVideoUrl={heroLegacyForPlayer}
          posterUrl={heroAssets.posterUrl}
          mode={heroMode}
          className="absolute inset-0 w-full h-full"
        />
        {/* Soft gradient fade at the bottom of the video — always visible.
            pointer-events: none keeps controls and taps fully working. */}
        <div className="absolute inset-x-0 bottom-0 h-12 z-10 bg-gradient-to-t from-white to-transparent pointer-events-none" />
      </div>

      <div className="px-4 pt-4 pb-6">
        {/* Title */}
        <h2 className="text-xl font-bold text-slate-900 mb-4 text-right" style={SECTION_FONT}>
          {sheetData.name}
        </h2>

        {/* ── Programs (right) + Equipment (left) — symmetrical 2-col grid ──
            Each column owns its header + an independently horizontally-scrolling
            badge row. The equipment column also stays visible when a method
            switcher is available (so the user can always change variant). */}
        {(() => {
          // Show the equipment column when:
          //  a) there is actual resolved gear for the active variant, OR
          //  b) the user CAN switch between variants (needs the badge even if bodyweight).
          // A single-method bodyweight exercise gets NO equipment column at all.
          const showEquipmentCol = equipmentBadges.length > 0 || canSwitch;
          if (programs.length === 0 && !showEquipmentCol) return null;
          return (
            <div className="grid grid-cols-2 gap-4 mb-6">
              {/* Right column — Programs */}
              {programs.length > 0 && (
                <section className={`min-w-0 ${!showEquipmentCol ? 'col-span-2' : ''}`}>
                  <h3 className="text-right text-[16px] font-semibold text-slate-800 mb-2 leading-[30px]" style={SECTION_FONT}>
                    תוכניות
                  </h3>
                  <div className="flex flex-row overflow-x-auto gap-2 no-scrollbar">
                    {programs.map((p, i) => (
                      <div
                        key={`${p.programId}-${i}`}
                        className="flex-shrink-0 flex items-center gap-1.5 bg-white shadow-sm rounded-lg px-3"
                        style={{ border: PILL_BORDER, height: 30 }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/icons/programs/full_body.svg" alt="" width={16} height={16} className="object-contain flex-shrink-0" />
                        <span className="text-xs font-normal text-gray-800 whitespace-nowrap" style={SECTION_FONT}>
                          {p.label} · רמה {p.level}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Left column — Equipment + execution-method switcher */}
              {showEquipmentCol && (
                <section className={`min-w-0 ${programs.length === 0 ? 'col-span-2' : ''}`}>
                  {/* Header row: "ציוד" + (left) the location switcher badge */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h3 className="text-right text-[16px] font-semibold text-slate-800 leading-[30px]" style={SECTION_FONT}>
                      ציוד
                    </h3>
                    {hasSwitcher && selectedOption && (() => {
                      // Badge location priority (highest → lowest):
                      //  1. activeLocation — the single source of truth: already incorporates
                      //     normalizedFilterLocation when the selected method covers it, and
                      //     falls back to the method's own location when it doesn't.
                      //     This means switching to a park method via the dropdown immediately
                      //     updates the badge to "פארק 🌳" even if filterLocation was "home".
                      //  2. selectedOption.location — structural scalar, last resort
                      const badgeLocation: string =
                        activeLocation
                          ?? selectedOption.location;
                      const activeMeta = locationMeta(badgeLocation);
                      const ActiveIcon = activeMeta.Icon;
                      return (
                        <div className="relative flex-shrink-0">
                          {/* Active-variant badge / trigger */}
                          <button
                            type="button"
                            onClick={canSwitch ? () => setSwitcherOpen((o) => !o) : undefined}
                            className={`inline-flex items-center gap-1 bg-white rounded-lg px-2.5 shadow-sm ${canSwitch ? 'active:scale-95 transition-transform cursor-pointer' : 'cursor-default'}`}
                            style={{ border: PILL_BORDER, height: 30 }}
                            aria-haspopup={canSwitch ? 'listbox' : undefined}
                            aria-expanded={canSwitch ? switcherOpen : undefined}
                          >
                            <ActiveIcon size={14} className="text-slate-500 flex-shrink-0" />
                            <span className="text-xs font-semibold text-slate-700 whitespace-nowrap" style={SECTION_FONT}>
                              {activeMeta.label}
                            </span>
                            {canSwitch && (
                              <ChevronDown
                                size={14}
                                className={`text-slate-400 flex-shrink-0 transition-transform ${switcherOpen ? 'rotate-180' : ''}`}
                              />
                            )}
                          </button>

                          {switcherOpen && (
                            <>
                              {/* Click-away catcher — must be `fixed` but framer-motion
                                  sheets apply a CSS transform which breaks `position:fixed`.
                                  We use a large absolutely-positioned backdrop instead so it
                                  stays in the correct stacking/paint context. */}
                              <button
                                type="button"
                                aria-label="סגור"
                                onPointerDown={() => setSwitcherOpen(false)}
                                className="absolute z-40 cursor-default"
                                style={{ inset: '-200vh -200vw' }}
                              />
                              {/* Option list — keyed by method index for uniqueness */}
                              <div
                                role="listbox"
                                dir="rtl"
                                className="absolute top-full left-0 mt-2 z-50 min-w-[190px] bg-white rounded-2xl shadow-floating border border-slate-100 p-1.5"
                              >
                                {methodOptions.map((opt) => {
                                  const optMeta = locationMeta(opt.location);
                                  const OptIcon = optMeta.Icon;
                                  const isActive = opt.idx === selectedMethodIdx;
                                  return (
                                    <button
                                      key={opt.idx}
                                      type="button"
                                      role="option"
                                      aria-selected={isActive}
                                      // onPointerDown fires before the browser can decide
                                      // this is a scroll gesture — critical for mobile
                                      // inside an overflow-y-auto sheet.
                                      onPointerDown={(e) => {
                                        e.stopPropagation();
                                        // eslint-disable-next-line no-console
                                        console.log(
                                          `🎯 [Switcher Click] Row tapped! Index: ${opt.idx}`,
                                          `Location: ${opt.location}`,
                                          `Gear: [${opt.gear.map((g) => g.id).join(', ')}]`,
                                        );
                                        // eslint-disable-next-line no-console
                                        console.log(`🔄 [Switcher State] Updating active index to: ${opt.idx}`);
                                        setSelectedMethodIdx(opt.idx);
                                        setHasUserPickedMethod(true);
                                        // Persist the pick to the live workout (workout-preview
                                        // context only; no-op read-only elsewhere).
                                        const chosenMethod = (exercise.execution_methods ?? exercise.executionMethods ?? [])[opt.idx];
                                        if (chosenMethod) onMethodChange?.(chosenMethod, opt.idx);
                                        setSwitcherOpen(false);
                                      }}
                                      className={`w-full flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                                        isActive
                                          ? 'bg-cyan-50 text-cyan-700 font-bold'
                                          : 'text-slate-700 hover:bg-slate-50 active:bg-slate-100'
                                      }`}
                                      style={SECTION_FONT}
                                    >
                                      {/* Location icon */}
                                      <OptIcon
                                        size={16}
                                        className={`flex-shrink-0 mt-0.5 ${isActive ? 'text-cyan-600' : 'text-slate-400'}`}
                                      />

                                      <span className="flex-1 text-start">
                                        {/* Location label */}
                                        <span className={`block text-xs font-semibold ${isActive ? 'text-cyan-700' : 'text-slate-800'}`}>
                                          {optMeta.label}
                                        </span>

                                        {/* Gear sub-row: per-item icon + label chips */}
                                        {opt.gear.length > 0 ? (
                                          <span className="flex flex-row flex-wrap gap-x-1.5 gap-y-0.5 mt-0.5">
                                            {opt.gear.map((g, gi) => (
                                              <span key={g.id} className="inline-flex items-center gap-0.5">
                                                {gi > 0 && (
                                                  <span className="text-slate-300 text-[10px] me-0.5">+</span>
                                                )}
                                                {g.icon ? (
                                                  // eslint-disable-next-line @next/next/no-img-element
                                                  <img
                                                    src={g.icon}
                                                    alt=""
                                                    width={12}
                                                    height={12}
                                                    className="object-contain flex-shrink-0 opacity-60"
                                                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                                                  />
                                                ) : (
                                                  <Dumbbell size={12} className="text-slate-400 flex-shrink-0" />
                                                )}
                                                <span className="text-[11px] font-normal text-slate-500 whitespace-nowrap">
                                                  {g.label}
                                                </span>
                                              </span>
                                            ))}
                                          </span>
                                        ) : (
                                          /* Bodyweight placeholder */
                                          <span className="inline-flex items-center gap-0.5 mt-0.5">
                                            <PersonStanding size={12} className="text-slate-400 flex-shrink-0" />
                                            <span className="text-[11px] font-normal text-slate-500">משקל גוף</span>
                                          </span>
                                        )}
                                      </span>

                                      {isActive && (
                                        <Check size={14} className="flex-shrink-0 mt-0.5 text-cyan-600" />
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {equipmentBadges.length > 0 ? (
                    <div className="flex flex-row overflow-x-auto gap-2 no-scrollbar">
                      {equipmentBadges.map((b) => (
                        <div
                          key={b.id}
                          className="flex-shrink-0 flex items-center gap-2 bg-white shadow-sm rounded-lg px-3"
                          style={{ border: PILL_BORDER, height: 30 }}
                        >
                          {b.icon ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={b.icon}
                              alt=""
                              width={16}
                              height={16}
                              className="object-contain flex-shrink-0"
                              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                            />
                          ) : (
                            <PersonStanding size={16} className="text-slate-400 flex-shrink-0" />
                          )}
                          <span className="text-xs font-normal text-gray-800 whitespace-nowrap" style={SECTION_FONT}>
                            {b.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : canSwitch ? (
                    // Bodyweight variant — show a placeholder only when the user
                    // CAN switch (keeps the layout balanced below the badge).
                    <span
                      className="inline-flex items-center gap-1.5 bg-white shadow-sm rounded-lg px-3 text-xs font-normal text-gray-800"
                      style={{ border: PILL_BORDER, height: 30 }}
                    >
                      <PersonStanding size={16} className="text-slate-400 flex-shrink-0" />
                      משקל גוף
                    </span>
                  ) : null}
                </section>
              )}
            </div>
          );
        })()}

        {/* ── Section 3: Progression chain ──────────────────────────────── */}
        <ProgressionChainRow
          chain={progressionChain}
          location={activeLocation}
          userLevelInTrack={userLevelInTrack}
          onNavigateToRoadmap={onNavigateToRoadmap}
          exercise={exercise}
        />

        {/* ── Section 4: Personal performance dashboard ─────────────────── */}
        {isLoadingTrend ? (
          <section className="mb-6 animate-pulse">
            <div className="rounded-2xl bg-white border border-slate-100 p-4 shadow-sm">
              <div className="h-5 w-1/3 bg-slate-100 rounded mb-3" />
              <div className="h-16 w-full bg-slate-50 rounded" />
            </div>
          </section>
        ) : perf ? (
          <section className="mb-6">
            <button
              type="button"
              onClick={() => onNavigateToAnalytics?.(exercise.id, sheetData.name)}
              className="w-full text-right rounded-2xl bg-white border border-slate-100 p-4 shadow-subtle cursor-pointer active:scale-[0.98] transition-transform"
              aria-label="לצפייה בהתקדמות המלאה"
            >
              <div className="flex items-baseline gap-1.5 mb-1">
                <span className="text-2xl font-black text-slate-900 tabular-nums">{perf.pb}</span>
                <span className="text-xs font-bold text-slate-400">שיא חזרות ברצף</span>
                <span className="text-[10px] font-bold text-slate-400 ms-auto">
                  {perf.count} אימונים
                </span>
              </div>

              <p className="text-[11px] text-slate-500 mb-2" style={SECTION_FONT}>
                {perf.lastSets > 0
                  ? `ביצעת ${perf.lastSets} סטים ${perf.lastLabel}`
                  : `אימון אחרון ${perf.lastLabel}`}
              </p>

              {perf.count >= 2 ? (
                <div className="w-full h-16">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={perf.chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id={`mev_${exercise.id}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%"  stopColor="#00ADEF" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#00ADEF" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <Area
                        type="monotone"
                        dataKey="maxReps"
                        stroke="#00ADEF"
                        strokeWidth={2.5}
                        fill={`url(#mev_${exercise.id})`}
                        isAnimationActive={false}
                        dot={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                // Single session — keep a clean collapsed spacer, no chart.
                <div className="h-1" />
              )}
            </button>
          </section>
        ) : null}

        {/* Section 5 (tutorial embed) was here — tutorial is now shown directly
            as the hero video when fullTutorial exists, so no button needed. */}

        {/* ── Section 6: Anatomy — primary (right) + secondary slider (left) ──
            Both sides share identical icon bounding boxes (44×44), line-heights
            and `items-start` baseline alignment so the rows line up exactly. */}
        {(primaryMuscle || secondaryMuscles.length > 0) && (
          <section className="mb-6">
            <div className="flex flex-row items-start gap-4">
              {/* Right: primary muscle */}
              {primaryMuscle && (
                <div className="flex-shrink-0">
                  <h3 className="text-right text-[16px] font-semibold text-slate-800 mb-2 leading-6" style={SECTION_FONT}>
                    שריר ראשי
                  </h3>
                  <div className="flex flex-col items-center gap-1.5">
                    <div className="h-11 w-11 flex items-center justify-center flex-shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={MUSCLE_ICON_PATHS[primaryMuscle] ?? MUSCLE_FALLBACK_ICON}
                        alt=""
                        className="max-h-full max-w-full object-contain"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    </div>
                    <span className="text-[11px] font-medium text-slate-700 whitespace-nowrap leading-tight text-center" style={SECTION_FONT}>
                      {getMuscleGroupLabel(primaryMuscle)}
                    </span>
                  </div>
                </div>
              )}

              {/* Left: secondary muscles — horizontal scrolling slider */}
              {secondaryMuscles.length > 0 && (
                <div className="flex-1 min-w-0">
                  <h3 className="text-right text-[16px] font-semibold text-slate-800 mb-2 leading-6" style={SECTION_FONT}>
                    שרירים משניים
                  </h3>
                  <div className="flex flex-row items-start gap-4 overflow-x-auto no-scrollbar pb-1">
                    {secondaryMuscles.map((m) => (
                      <div key={m} className="flex-shrink-0 flex flex-col items-center gap-1.5">
                        <div className="h-11 w-11 flex items-center justify-center flex-shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={MUSCLE_ICON_PATHS[m] ?? MUSCLE_FALLBACK_ICON}
                            alt=""
                            className="max-h-full max-w-full object-contain"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        </div>
                        <span className="text-[11px] font-medium text-slate-500 whitespace-nowrap leading-tight text-center" style={SECTION_FONT}>
                          {getMuscleGroupLabel(m)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── Section 7: Execution cues ─────────────────────────────────── */}
        {sheetData.cues.length > 0 && (
          <section className="mb-6">
            <h3 className="text-right text-[16px] font-semibold text-slate-800 mb-3" style={SECTION_FONT}>
              דגשים
            </h3>
            <ol className="space-y-2.5">
              {sheetData.cues.map((cue, i) => (
                <li key={i} className="flex gap-3 items-start">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full text-white text-xs font-bold flex items-center justify-center bg-cyan-500">
                    {i + 1}
                  </span>
                  <span className="text-sm text-slate-700 flex-1 leading-relaxed" style={SECTION_FONT}>
                    {cue}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* ── Appended details (preserve existing library content) ──────── */}
        {sheetData.description && (
          <section className="mb-6">
            <h3 className="text-right text-[16px] font-semibold text-slate-800 mb-3" style={SECTION_FONT}>
              תיאור
            </h3>
            <p className="text-sm text-slate-700 leading-relaxed" style={SECTION_FONT}>
              {sheetData.description}
            </p>
          </section>
        )}

        {sheetData.goal && (
          <section className="mb-6">
            <h3 className="text-right text-[16px] font-semibold text-slate-800 mb-3" style={SECTION_FONT}>
              מטרות
            </h3>
            <div className="flex items-start gap-3 bg-slate-50 rounded-xl p-4" style={{ border: PILL_BORDER }}>
              <Target size={18} className="flex-shrink-0 mt-0.5 text-cyan-600" />
              <p className="text-sm text-slate-700 leading-relaxed" style={SECTION_FONT}>
                {sheetData.goal}
              </p>
            </div>
          </section>
        )}

        {sheetData.instructions && sheetData.instructions !== sheetData.description && (
          <section className="mb-6">
            <h3 className="text-right text-[16px] font-semibold text-slate-800 mb-3" style={SECTION_FONT}>
              הוראות ביצוע
            </h3>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line" style={SECTION_FONT}>
              {sheetData.instructions}
            </p>
          </section>
        )}

        {sheetData.tips.length > 0 && (
          <section className="mb-6">
            <h3 className="text-right text-[16px] font-semibold text-slate-800 mb-3" style={SECTION_FONT}>
              טיפים
            </h3>
            <ul className="space-y-2">
              {sheetData.tips.map((tip, i) => (
                <li key={i} className="flex gap-2 items-start">
                  <span className="flex-shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  <span className="text-sm text-slate-700 flex-1 leading-relaxed" style={SECTION_FONT}>
                    {tip}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
