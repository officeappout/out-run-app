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

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import {
  Target, PersonStanding, Lock, Check,
  Home, Dumbbell, BarChart3, ChevronLeft,
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
import ExerciseHeroV2 from './ExerciseHeroV2';
import LocationVariantSwitcher, {
  type LocationSwitcherOption,
} from './LocationVariantSwitcher';
import ProgramPathSwitcher, { type ProgramPathOption } from './ProgramPathSwitcher';
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
  getExerciseLevelForProgram,
  type ProgressionChain,
} from '../hooks/useExerciseMasterData';
import { resolveTreeProgramId, resolveExerciseProgressionMapHref } from '@/lib/progression-map-config';
import { useT } from '@/hooks/useT';
import { library, type LibraryKey } from '@/messages/ns/library';
import type { MessageValues } from '@/lib/i18n/core/i18n-core';

/** The `library` translator, passed into this file's pure helpers. */
type LibraryT = (key: LibraryKey, values?: MessageValues) => string;

// ── Visual tokens (shared with ExerciseDetailSheet) ────────────────────────
const PILL_BORDER = '0.5px solid #E0E9FF';
const SECTION_FONT = { fontFamily: 'var(--font-simpler)' } as const;

// Execution-location metadata (label + icon) + the method-switcher visual moved to the
// shared LocationVariantSwitcher — ONE source of truth for the per-exercise single
// toggle (here) and the workout-level bulk toggle (WorkoutLocationSwitcher).

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
import { useUserStore } from '@/features/user';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { hasPersona } from '@/features/workout-engine/services/user-profile.utils';

// ── Difficulty trend icons (identical to ExerciseReplacementModal) ─────────
const LEVEL_ICONS: Record<'lower' | 'same' | 'higher', { src: string; color: string }> = {
  lower:  { src: '/assets/icons/ui/level_down.svg', color: 'text-orange-500' },
  same:   { src: '/assets/icons/ui/level_same.svg', color: 'text-[#00BAF7]' },
  higher: { src: '/assets/icons/ui/level_up.svg',   color: 'text-emerald-500' },
};

const IMAGE_PLACEHOLDER = '/images/park-placeholder.svg';

/**
 * Home v2 (enable_home_v2) styling switch for this file's sub-components —
 * provided by MasterExerciseView. false → today's UI, byte-identical.
 */
const MevV2 = createContext(false);

/** Splits free-text instructions into steps (one per non-empty line). */
function splitSteps(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:\d+[.)]|[-•*])\s*/, '').trim())
    .filter(Boolean);
}

/** One numbered step row (v2) — tint numeral, never a filled black/brand disc. */
function V2Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-v2-tint text-[13px] font-black tabular-nums text-v2-deep ring-1 ring-inset ring-v2-accent/40">
        {n}
      </span>
      <span className="flex-1 pt-[3px] text-[14.5px] leading-relaxed text-v2-ink-2" style={SECTION_FONT}>
        {children}
      </span>
    </li>
  );
}

/** v2 key-fact tile (muscle / equipment / level). */
function V2FactTile({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col items-start gap-1.5 rounded-[18px] bg-white px-3 py-2.5 shadow-v2-ring">
      <span className="grid h-8 w-8 place-items-center rounded-full bg-v2-tint text-v2-deep">{icon}</span>
      <span className="whitespace-nowrap text-[11.5px] font-bold text-v2-muted">{label}</span>
      <span className="w-full truncate whitespace-nowrap text-[13.5px] font-extrabold text-v2-ink" style={SECTION_FONT}>
        {value}
      </span>
    </div>
  );
}

export interface MasterExerciseViewProps {
  exercise: Exercise;
  filterLocation?: 'home' | 'park' | 'gym' | null;
  /** programId → Hebrew label map for the "תוכניות" badges (consumer supplies). */
  programLabels?: Record<string, string>;
  /**
   * Feature #5 (program/path switcher, Phase 1): the initially-selected
   * program when the exercise belongs to 2+ (targetPrograms). Opened from a
   * Skill Tree → the caller passes that tree's own programId (SkillTreeScreen
   * already knows it — the route param). Omitted (undefined) → falls back to
   * resolveTreeProgramId(exercise) (the same pick "מפה מלאה" already used),
   * then targetPrograms[0] — byte-identical default to before this prop
   * existed for every caller that doesn't pass it.
   */
  defaultProgramId?: string | null;
  /** Tapping the performance card routes here. Consumer owns navigation. */
  onNavigateToAnalytics?: (exerciseId: string, exerciseName: string) => void;
  /**
   * Tapping "מפה מלאה ←" routes here with the progression-map href. Resolved
   * by THIS component from its own activeProgramId (the switcher's current
   * selection), not re-derived by the consumer — see progressionMapHref.
   * When the active path has no progression map the link is not rendered at
   * all, so this is only ever called with a real /progression-map/<id> href.
   */
  onNavigateToRoadmap?: (progressionMapHref: string) => void;
  /**
   * Optional short notice banner shown at the very top of the sheet — e.g.
   * "above your current level" when opened from a locked Progression Map
   * tree node. Absent for every ordinary caller (undefined/null → nothing
   * rendered, byte-identical to before this prop existed).
   */
  notice?: string | null;
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

function relativeDayLabel(date: Date | null, t: LibraryT): string {
  if (!date) return '';
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return t('exercises.detail.perf.when.today');
  if (days === 1) return t('exercises.detail.perf.when.yesterday');
  if (days < 7) return t('exercises.detail.perf.when.days', { n: String(days) });
  if (days < 30) return t('exercises.detail.perf.when.weeks', { n: String(Math.floor(days / 7)) });
  return t('exercises.detail.perf.when.months', { n: String(Math.floor(days / 30)) });
}

// ── Progression chain node ───────────────────────────────────────────────

function ChainNode({
  exercise,
  variant,
  location,
  locked,
  completed = false,
  activeProgramId,
}: {
  exercise: Exercise;
  variant: 'lower' | 'same' | 'higher';
  location: string | null;
  locked: boolean;
  /** Prev node — the user already surpassed it → satisfied/completed look. */
  completed?: boolean;
  /** Feature #5: show this node's level in the switcher's currently-selected path when it's tagged to it; falls back to the legacy targetPrograms[0] pick otherwise. */
  activeProgramId?: string | null;
}) {
  const t = useT(library);
  const v2 = useContext(MevV2);
  const cfg = LEVEL_ICONS[variant];
  const isCurrent = variant === 'same';
  const thumb = resolveThumbnail(exercise, location);
  const level = getExerciseLevelForProgram(exercise, activeProgramId);
  const name = getLocalizedText(exercise.name, 'he');

  if (v2) {
    const size = isCurrent ? 88 : 72;
    return (
      <div className="relative z-10 flex min-w-0 flex-1 flex-col items-center gap-1.5">
        <div className="grid h-[88px] place-items-center">
        <div className="relative" style={{ width: size, height: size }}>
          <div
            className={`h-full w-full overflow-hidden rounded-[22px] ${locked ? 'bg-v2-tint' : 'bg-white'} ${
              isCurrent
                ? 'shadow-v2-float ring-[3px] ring-v2-accent'
                : completed
                  ? 'shadow-v2-card ring-2 ring-v2-accent/50'
                  : 'shadow-v2-ring ring-[3px] ring-white'
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumb}
              alt={name}
              className="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
              style={locked ? { filter: 'grayscale(70%) saturate(0.8)', opacity: 0.72 } : undefined}
              onError={(e) => { (e.target as HTMLImageElement).src = IMAGE_PLACEHOLDER; }}
            />
          </div>
          {locked && (
            <div className="absolute bottom-1.5 left-1/2 grid h-6 w-6 -translate-x-1/2 place-items-center rounded-full bg-white/95 text-v2-muted shadow-v2-ring">
              <Lock size={12} strokeWidth={2.5} />
            </div>
          )}
          {completed && !locked && (
            <div className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full bg-v2-accent text-white shadow-v2-card ring-2 ring-white">
              <Check size={12} strokeWidth={3} />
            </div>
          )}
        </div>
        </div>
        <span className={`whitespace-nowrap text-[11.5px] font-extrabold ${isCurrent ? 'text-v2-deep' : 'text-v2-muted'}`}>
          {t('exercises.detail.chain.node', { variant, level: String(level) })}
        </span>
        <span
          className={`w-full truncate whitespace-nowrap text-center text-[12.5px] font-extrabold ${locked ? 'text-v2-muted' : 'text-v2-ink'}`}
          style={SECTION_FONT}
          title={name}
        >
          {name}
        </span>
      </div>
    );
  }

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
        <span className="text-[11px] font-semibold">{/* i18n-allow-hebrew: legacy v1 (enable_home_v2 on) */}רמה {level}</span>
      </div>
    </div>
  );
}

function ProgressionChainRow({
  chain,
  location,
  userLevelInTrack,
  activeProgramId,
  onOpenProgressionMap,
}: {
  chain: ProgressionChain;
  location: string | null;
  userLevelInTrack: number | null;
  /** Feature #5: the switcher's current selection — passed through to each ChainNode's level display and used for the lock comparison below. */
  activeProgramId?: string | null;
  /** Present only when the active path has a progression map — absent → no "מפה מלאה" link. */
  onOpenProgressionMap?: () => void;
}) {
  const t = useT(library);
  const v2 = useContext(MevV2);
  // SAFETY GATE: only render when there is a real progression lineage
  // (a prev OR a next variation). No fake/single-node chains.
  if (!chain.current || (!chain.prev && !chain.next)) return null;

  const nextLocked =
    chain.next != null &&
    userLevelInTrack != null &&
    userLevelInTrack < getExerciseLevelForProgram(chain.next, activeProgramId);

  if (v2) {
    return (
      <section className="mb-6" dir="rtl">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="whitespace-nowrap text-right text-[17px] font-black text-v2-ink" style={SECTION_FONT}>
            {t('exercises.detail.chain.title')}
          </h3>
          {onOpenProgressionMap && (
            <button
              type="button"
              onClick={onOpenProgressionMap}
              className="flex h-8 items-center gap-0.5 whitespace-nowrap rounded-full bg-white pe-2 ps-3 text-[13px] font-extrabold text-v2-deep shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
            >
              {t('exercises.detail.chain.fullMap')}
              <ChevronLeft size={15} strokeWidth={2.5} />
            </button>
          )}
        </div>

        {/* Visual strip: prev · current · next on one dashed trail */}
        <div className="relative rounded-v2-card bg-white px-3 pb-3.5 pt-4 shadow-v2-card">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-10 top-[60px] border-t-[3px] border-dashed border-v2-accent/40"
          />
          <div className="flex items-start justify-center gap-2">
            {chain.prev && (
              <ChainNode exercise={chain.prev} variant="lower" location={location} locked={false} completed activeProgramId={activeProgramId} />
            )}
            <ChainNode exercise={chain.current} variant="same" location={location} locked={false} activeProgramId={activeProgramId} />
            {chain.next && (
              <ChainNode exercise={chain.next} variant="higher" location={location} locked={nextLocked} activeProgramId={activeProgramId} />
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-6" dir="rtl">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-right text-[16px] font-semibold text-slate-800" style={SECTION_FONT}>
          {t('exercises.detail.chain.title')}
        </h3>
        {onOpenProgressionMap && (
          <button
            type="button"
            onClick={onOpenProgressionMap}
            className="text-[11px] font-bold text-[#00ADEF] active:opacity-70"
          >
            {/* i18n-allow-hebrew: legacy v1 (enable_home_v2 on) */}מפה מלאה ←
          </button>
        )}
      </div>

      {/* Strict 3-node chain (prev · current · next) — no connector assets, so
          the three thumbnails cache instantly and render lightning-fast. */}
      <div className="flex items-start justify-center gap-6">
        {chain.prev && (
          <ChainNode exercise={chain.prev} variant="lower" location={location} locked={false} completed activeProgramId={activeProgramId} />
        )}

        <ChainNode exercise={chain.current} variant="same" location={location} locked={false} activeProgramId={activeProgramId} />

        {chain.next && (
          <ChainNode exercise={chain.next} variant="higher" location={location} locked={nextLocked} activeProgramId={activeProgramId} />
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
  defaultProgramId,
  onNavigateToAnalytics,
  onNavigateToRoadmap,
  onMethodChange,
  notice,
}: MasterExerciseViewProps) {
  const t = useT(library);
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

  const mevProfile = useUserStore((s) => s.profile);
  // Home v2 (enable_home_v2): styling only — every handler/data path below is shared.
  const v2 = useFeatureFlags(
    !!(mevProfile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin,
  ).flags.enableHomeV2;
  const isMilitaryPersona = mevProfile ? hasPersona(mevProfile, 'military') : false;

  const methodOptions = useMemo<MethodOption[]>(() => {
    const methods = exercise.execution_methods ?? exercise.executionMethods ?? [];
    const seenIdx = new Set<number>();
    const out: MethodOption[] = [];
    for (let i = 0; i < methods.length; i++) {
      const m = methods[i];
      if (seenIdx.has(i)) continue;
      if (!methodHasVideo(m)) continue;
      // Persona gate: hide the 'service' (military) variant from non-military users.
      if (!isMilitaryPersona && (m.location === 'service' || methodLocations(m).includes('service'))) continue;
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
        if (!label || label === 'ציוד לא מזוהה') continue; // i18n-allow-hebrew: data — compared with resolveEquipmentLabel's fallback
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
  }, [exercise, isMilitaryPersona]);

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
        // Persona gate: never seed to a 'service' (military) method for non-military users.
        if (!isMilitaryPersona && (methods[i].location === 'service' || methodLocations(methods[i]).includes('service'))) continue;
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
      if (!isMilitaryPersona && (methods[i].location === 'service' || methodLocations(methods[i]).includes('service'))) continue;
      if (methodHasVideo(methods[i])) {
        const locs = methodLocations(methods[i]);
        if (i === 0 && locs.length > 1) {
          // eslint-disable-next-line no-console
          console.log(`[MEV] 🌱 seed multi-location method[0] locs=${JSON.stringify(locs)}`);
          // Measurement only (execution-method-identity-plan.md, Stage 1) — no
          // exact-location match was found, so this is a "different method than
          // requested" landing. Logged, never blocked; zero behavior change.
          if (normalizedLoc) {
            // eslint-disable-next-line no-console
            console.log('[MEV-MISMATCH]', JSON.stringify({
              exerciseId: ex.id, requestedLocation: normalizedLoc,
              resolvedLocation: locs.join(','), resolvedIdx: 0,
              tier: 'multi-location-default',
            }));
          }
          return 0;
        }
        // eslint-disable-next-line no-console
        console.log(`[MEV] 🌱 seed fallback → method[${i}]`);
        // Measurement only (execution-method-identity-plan.md, Stage 1) — same
        // reasoning as above: no exact-location match, first-video-having method
        // wins regardless of its own tagged location.
        if (normalizedLoc) {
          // eslint-disable-next-line no-console
          console.log('[MEV-MISMATCH]', JSON.stringify({
            exerciseId: ex.id, requestedLocation: normalizedLoc,
            resolvedLocation: locs.join(','), resolvedIdx: i,
            tier: 'first-with-video-fallback',
          }));
        }
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
  }, [exercise.id, normalizedFilterLocation, isMilitaryPersona]);

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

  // ── Program/path switcher (Feature #5, Phase 1) ────────────────────────
  // Default: the caller's explicit defaultProgramId (SkillTreeScreen passes
  // its own tree's programId) wins; otherwise resolveTreeProgramId(exercise)
  // — the SAME pick "מפה מלאה" always used — so the default path stays
  // whichever program the sheet already routed to before this feature
  // existed; finally targetPrograms[0], matching the legacy level/lock
  // display's own fallback, only when no program is allow-listed at all.
  const resolveInitialProgramId = (): string | null =>
    defaultProgramId ?? resolveTreeProgramId(exercise) ?? exercise.targetPrograms?.[0]?.programId ?? null;

  const [activeProgramId, setActiveProgramId] = useState<string | null>(resolveInitialProgramId);
  const [programSwitcherOpen, setProgramSwitcherOpen] = useState(false);
  useEffect(() => {
    setActiveProgramId(resolveInitialProgramId());
    setProgramSwitcherOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercise.id, defaultProgramId]);

  // Phase 1.1: whether the CALLER established a deliberate program context
  // (SkillTreeScreen passes defaultProgramId; ExerciseLibraryPage doesn't).
  // activeProgramId above is NOT itself a reliable "is there an active
  // program" signal — it always resolves to SOMETHING via a fallback
  // (resolveTreeProgramId/targetPrograms[0]) purely so the switcher chip
  // always has something to show, even in the plain library sheet. Only
  // hasActiveProgramContext gates the progression-strip's ladder-vs-family
  // mode (see useExerciseMasterData's progressionChain) — the switcher chip
  // itself, and its "מפה מלאה" destination, are unaffected and keep using
  // the raw activeProgramId regardless of context, unchanged from Phase 1.
  const hasActiveProgramContext = defaultProgramId != null;
  const stripProgramId = hasActiveProgramContext ? activeProgramId : null;

  // Pass `selectedMethodIdx` as the 4th arg so the hook resolves the exact
  // method via array index — `buildSheetData` receives the pre-resolved method
  // object and skips `findMethodForLocation` entirely. 5th arg
  // (stripProgramId) makes userLevelInTrack AND progressionChain follow the
  // active program ONLY in a deliberate program context — see
  // hasActiveProgramContext above.
  const { sheetData, trend, isLoadingTrend, progressionChain, userLevelInTrack, programs } =
    useExerciseMasterData(exercise, activeLocation, programLabels, selectedMethodIdx, stripProgramId);

  // Switcher only when 2+ targetPrograms entries — a single-program exercise
  // gets a static chip (no chevron, no panel), same rule LocationVariantSwitcher
  // uses for a single-method exercise.
  const canSwitchProgram = programs.length >= 2;
  const programSwitcherOptions: ProgramPathOption[] = programs.map((p) => ({
    programId: p.programId,
    label: p.label,
    level: p.level,
    iconKey: p.iconKey,
    isActive: p.programId === activeProgramId,
  }));
  const activeProgramOption =
    programSwitcherOptions.find((o) => o.isActive) ?? programSwitcherOptions[0] ?? null;

  // Resolves the "מפה מלאה" destination from the CURRENTLY SELECTED path
  // (not a fresh resolveTreeProgramId(exercise) re-derive, which could
  // disagree with what the switcher is showing) — see
  // MasterExerciseViewProps.onNavigateToRoadmap's doc comment.
  // null when the active path has no progression map → no link at all.
  const progressionMapHref = resolveExerciseProgressionMapHref(activeProgramId);
  const handleOpenProgressionMap =
    progressionMapHref && onNavigateToRoadmap
      ? () => onNavigateToRoadmap(progressionMapHref)
      : undefined;

  const [switcherOpen, setSwitcherOpen] = useState(false);
  useEffect(() => { setSwitcherOpen(false); }, [exercise.id]);

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
      if (!label || label === 'ציוד לא מזוהה') continue; // i18n-allow-hebrew: data — compared with resolveEquipmentLabel's fallback
      out.push({ id, label, icon: resolveEquipmentSvgPathList(id)[0] ?? null });
    }
    return out;
  }, [sheetData]);

  // Sparkline data (ascending) + PB + last-session label for Section 4.
  const perf = useMemo(() => {
    if (!trend || trend.length === 0) return null;
    const pb = Math.max(...trend.map((entry) => entry.maxReps));
    const last = trend[0]; // service returns newest-first
    const lastSets = Array.isArray(last?.reps) ? last.reps.length : 0;
    const lastLabel = relativeDayLabel(toDate(last?.date), t);
    const chartData = [...trend]
      .reverse()
      .map((entry, i) => ({ session: i, maxReps: entry.maxReps }));
    return { pb, lastSets, lastLabel, chartData, count: trend.length };
  }, [trend, t]);

  // ── Fix 2: Hero video resolved directly from the selected method index ───
  // We derive heroVideo / heroPoster from the exact method object so the
  // player re-renders the correct Bunny video on EVERY index change, before
  // sheetData even finishes re-computing (avoids one-frame stale video).
  interface HeroAssets {
    full: ExternalVideo | undefined;
    preview: ExternalVideo | undefined;
    legacy: string | null;
    posterUrl: string | null;
  }
  const heroAssets = useMemo<HeroAssets>(() => {
    const methods = exercise.execution_methods ?? exercise.executionMethods ?? [];
    const m = selectedMethodIdx !== null ? methods[selectedMethodIdx] : null;
    if (!m) return { full: undefined, preview: undefined, legacy: null, posterUrl: null };
    // Method-LOCKED to the selected method's OWN media only (never root, never another method).
    const full = resolveTutorialForLang(m.media as any, 'he') ?? undefined;
    const preview = resolvePreviewForLang(m.media as any, 'he') ?? undefined;
    // mainVideoUrl is the CDN string stored by the bulk-upload script.
    const legacy = m.media?.mainVideoUrl ?? null;
    // Poster: method-level image first, then exercise-level.
    const posterUrl = m.media?.imageUrl ?? exercise.media?.imageUrl ?? null;
    return { full, preview, legacy, posterUrl };
  }, [exercise, selectedMethodIdx]);

  if (!sheetData) return null;

  // ── Head video — method-LOCKED, full-first, stable across ANY number of toggles ──
  //   1) the selected method's OWN full tutorial (long) → 2) else its OWN preview (short) →
  //   3) else its OWN legacy mainVideoUrl (short clip). Never another method's media; never the
  //   exercise-ROOT full (which would leak PARK's full onto a home/service method that only has a
  //   preview). Independent of any "user picked" flag → stable across unlimited toggles.
  const headExternal = heroAssets.full ?? heroAssets.preview;          // Bunny: full-first, else preview
  const heroVideoForPlayer = headExternal;
  const heroLegacyForPlayer = headExternal ? null : heroAssets.legacy; // legacy only when no Bunny source
  // Last-resort exercise-ROOT full is DISABLED on purpose (prefer a clean poster over PARK's full
  // under a home method). Enable ONLY if a no-full/preview/legacy method shows a broken/empty
  // player instead of the poster:
  //   const rootFull = (!headExternal && !heroLegacyForPlayer)
  //     ? (resolveTutorialForLang(exercise.media as any, 'he') ?? undefined) : undefined;
  const tutorialAsHero = !!heroAssets.full || !!heroLegacyForPlayer;
  const heroMode   = tutorialAsHero ? 'tutorial' : 'preview';

  // ── v2 key facts (muscle · equipment · level) — read-only summary of data
  // already resolved above; the full switchers stay below.
  const v2Facts: { key: string; icon: ReactNode; label: string; value: string }[] = [];
  if (v2) {
    if (primaryMuscle) {
      v2Facts.push({
        key: 'muscle',
        icon: (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={MUSCLE_ICON_PATHS[primaryMuscle] ?? MUSCLE_FALLBACK_ICON}
            alt=""
            className="h-5 w-5 object-contain"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ),
        label: t('exercises.detail.facts.muscle'),
        value: getMuscleGroupLabel(primaryMuscle),
      });
    }
    v2Facts.push({
      key: 'gear',
      icon: equipmentBadges[0]?.icon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={equipmentBadges[0].icon}
          alt=""
          className="h-5 w-5 object-contain"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
      ) : equipmentBadges.length > 0 ? (
        <Dumbbell size={16} strokeWidth={2.5} />
      ) : (
        <PersonStanding size={16} strokeWidth={2.5} />
      ),
      label: t('exercises.detail.facts.gear'),
      value:
        equipmentBadges.length === 0
          ? t('exercises.detail.facts.bodyweight')
          : equipmentBadges.length === 1
            ? equipmentBadges[0].label
            : `${equipmentBadges[0].label} +${equipmentBadges.length - 1}`,
    });
    if (activeProgramOption && activeProgramOption.level != null) {
      v2Facts.push({
        key: 'level',
        icon: <BarChart3 size={16} strokeWidth={2.5} />,
        label: t('exercises.detail.facts.level'),
        value: t('exercises.detail.facts.levelValue', { level: String(activeProgramOption.level) }),
      });
    }
  }
  const v2InstructionSteps =
    v2 && sheetData.instructions && sheetData.instructions !== sheetData.description
      ? splitSteps(sheetData.instructions)
      : [];
  const v2H3 = 'text-right text-[17px] font-black text-v2-ink whitespace-nowrap';

  return (
    <MevV2.Provider value={v2}>
    <div dir="rtl" className={v2 ? 'bg-v2-surface' : undefined}>
      {notice && (
        <div
          className={
            v2
              ? 'mx-4 mb-2 mt-5 rounded-[14px] bg-v2-tint px-4 py-2.5 text-center text-[13px] font-extrabold text-v2-deep ring-1 ring-inset ring-v2-accent/30'
              : 'px-4 py-2.5 bg-slate-100 text-slate-500 text-[13px] font-semibold text-center'
          }
        >
          {notice}
        </div>
      )}

      {/* ── Section 1: Hero video ──────────────────────────────────────────── */}
      {v2 ? (
        <ExerciseHeroV2
          hasVideo={!!heroVideoForPlayer || !!heroLegacyForPlayer}
          posterUrl={heroAssets.posterUrl}
          withControls={heroMode === 'tutorial'}
          title={sheetData.name}
        >
          <ExerciseVideoPlayer
            video={heroVideoForPlayer}
            legacyVideoUrl={heroLegacyForPlayer}
            posterUrl={heroAssets.posterUrl}
            mode={heroMode}
            className="absolute inset-0 w-full h-full"
          />
        </ExerciseHeroV2>
      ) : (
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
      )}

      <div className={v2 ? 'px-4 pt-5 pb-6' : 'px-4 pt-4 pb-6'}>
        {/* Title */}
        <h2
          className={v2 ? 'mb-4 text-right text-[24px] font-black leading-tight !tracking-[-0.02em] text-v2-ink' : 'text-xl font-bold text-slate-900 mb-4 text-right'}
          style={SECTION_FONT}
        >
          {sheetData.name}
        </h2>

        {/* v2: key facts row */}
        {v2 && v2Facts.length > 0 && (
          <div
            className="mb-6 grid gap-2"
            style={{ gridTemplateColumns: `repeat(${v2Facts.length}, minmax(0, 1fr))` }}
          >
            {v2Facts.map((f) => (
              <V2FactTile key={f.key} icon={f.icon} label={f.label} value={f.value} />
            ))}
          </div>
        )}

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
              {/* Right column — Programs. Feature #5 (Phase 1): the badge
                  list is now a single active-path CHIP (name+level, same
                  visual weight as the ציוד column's location switcher) that
                  expands into a panel when the exercise belongs to 2+
                  programs — same interaction pattern as LocationVariantSwitcher,
                  mirrored (not reused directly — see ProgramPathSwitcher.tsx's
                  own header comment) since program content differs from
                  location/gear content. Single-program exercises get the
                  SAME chip rendered statically (no chevron/panel) via
                  canSwitch={false} — never an empty state, never a dead list.
                  Phase 1.1: the chip moved to its OWN row below the "תוכניות"
                  heading (was inline beside it via justify-between) — at a
                  narrow column width a long program name + level ("שכיבות
                  סמיכה בעמידת ידיים · רמה 5") is whitespace-nowrap and could
                  overflow past this half-width grid column, visually
                  overlapping the LEFT column's "ציוד" heading sitting on the
                  same line. Stacking removes that shared-line competition —
                  the two headers are simply never on the same row anymore. */}
              {programs.length > 0 && activeProgramOption && (
                <section className={`min-w-0 ${!showEquipmentCol ? 'col-span-2' : ''}`}>
                  <h3 className={v2 ? `${v2H3} mb-2 leading-[30px]` : 'text-right text-[16px] font-semibold text-slate-800 mb-2 leading-[30px]'} style={SECTION_FONT}>
                    {t('exercises.detail.programs')}
                  </h3>
                  <ProgramPathSwitcher
                    activeOption={activeProgramOption}
                    options={programSwitcherOptions}
                    canSwitch={canSwitchProgram}
                    open={programSwitcherOpen}
                    onToggleOpen={() => setProgramSwitcherOpen((o) => !o)}
                    onClose={() => setProgramSwitcherOpen(false)}
                    onSelect={(opt) => {
                      setActiveProgramId(opt.programId);
                      setProgramSwitcherOpen(false);
                    }}
                  />
                </section>
              )}

              {/* Left column — Equipment + execution-method switcher */}
              {showEquipmentCol && (
                <section className={`min-w-0 ${programs.length === 0 ? 'col-span-2' : ''}`}>
                  {/* Header row: "ציוד" + (left) the location switcher badge */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h3 className={v2 ? `${v2H3} leading-[30px]` : 'text-right text-[16px] font-semibold text-slate-800 leading-[30px]'} style={SECTION_FONT}>
                      {t('exercises.detail.gear')}
                    </h3>
                    {hasSwitcher && selectedOption && (
                      <LocationVariantSwitcher
                        activeLocation={activeLocation ?? selectedOption.location}
                        canSwitch={canSwitch}
                        open={switcherOpen}
                        onToggleOpen={() => setSwitcherOpen((o) => !o)}
                        onClose={() => setSwitcherOpen(false)}
                        options={methodOptions.map((opt): LocationSwitcherOption => ({
                          key: String(opt.idx),
                          location: opt.location,
                          gear: opt.gear,
                          isActive: opt.idx === selectedMethodIdx,
                        }))}
                        onSelect={(opt) => {
                          const idx = Number(opt.key);
                          setSelectedMethodIdx(idx);
                          // Persist the pick to the live workout (workout-preview context
                          // only; no-op read-only elsewhere).
                          const chosenMethod = (exercise.execution_methods ?? exercise.executionMethods ?? [])[idx];
                          if (chosenMethod) onMethodChange?.(chosenMethod, idx);
                          setSwitcherOpen(false);
                        }}
                      />
                    )}
                  </div>

                  {equipmentBadges.length > 0 ? (
                    <div className="flex flex-row overflow-x-auto gap-2 no-scrollbar">
                      {equipmentBadges.map((b) => (
                        <div
                          key={b.id}
                          className={v2 ? 'flex h-[30px] flex-shrink-0 items-center gap-2 rounded-full bg-white px-3 shadow-v2-ring' : 'flex-shrink-0 flex items-center gap-2 bg-white shadow-sm rounded-lg px-3'}
                          style={v2 ? undefined : { border: PILL_BORDER, height: 30 }}
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
                          <span className={v2 ? 'whitespace-nowrap text-[12.5px] font-bold text-v2-ink-2' : 'text-xs font-normal text-gray-800 whitespace-nowrap'} style={SECTION_FONT}>
                            {b.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : canSwitch ? (
                    // Bodyweight variant — show a placeholder only when the user
                    // CAN switch (keeps the layout balanced below the badge).
                    <span
                      className={v2 ? 'inline-flex h-[30px] items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-3 text-[12.5px] font-bold text-v2-ink-2 shadow-v2-ring' : 'inline-flex items-center gap-1.5 bg-white shadow-sm rounded-lg px-3 text-xs font-normal text-gray-800'}
                      style={v2 ? undefined : { border: PILL_BORDER, height: 30 }}
                    >
                      <PersonStanding size={16} className="text-slate-400 flex-shrink-0" />
                      {t('exercises.detail.bodyweight')}
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
          activeProgramId={stripProgramId}
          onOpenProgressionMap={handleOpenProgressionMap}
        />

        {/* ── Section 4: Personal performance dashboard ─────────────────── */}
        {isLoadingTrend ? (
          <section className="mb-6 animate-pulse">
            <div className={v2 ? 'rounded-v2-card bg-white p-4 shadow-v2-card' : 'rounded-2xl bg-white border border-slate-100 p-4 shadow-sm'}>
              <div className="h-5 w-1/3 bg-slate-100 rounded mb-3" />
              <div className="h-16 w-full bg-slate-50 rounded" />
            </div>
          </section>
        ) : perf ? (
          <section className="mb-6">
            <button
              type="button"
              onClick={() => onNavigateToAnalytics?.(exercise.id, sheetData.name)}
              className={v2 ? 'w-full cursor-pointer rounded-v2-card bg-white p-4 text-right shadow-v2-card transition-transform duration-150 ease-v2 active:scale-[0.97]' : 'w-full text-right rounded-2xl bg-white border border-slate-100 p-4 shadow-subtle cursor-pointer active:scale-[0.98] transition-transform'}
              aria-label={t('exercises.detail.perf.open')}
            >
              <div className="flex items-baseline gap-1.5 mb-1">
                <span className={v2 ? 'text-[28px] font-black tabular-nums text-v2-ink' : 'text-2xl font-black text-slate-900 tabular-nums'}>{perf.pb}</span>
                <span className={v2 ? 'whitespace-nowrap text-[13px] font-extrabold text-v2-deep' : 'text-xs font-bold text-slate-400'}>{t('exercises.detail.perf.best')}</span>
                <span className={v2 ? 'ms-auto whitespace-nowrap text-[12px] font-bold text-v2-muted' : 'text-[10px] font-bold text-slate-400 ms-auto'}>
                  {t('exercises.detail.perf.sessions', { count: String(perf.count) })}
                </span>
              </div>

              <p className={v2 ? 'mb-2 text-[12.5px] font-bold text-v2-muted' : 'text-[11px] text-slate-500 mb-2'} style={SECTION_FONT}>
                {perf.lastSets > 0
                  ? t('exercises.detail.perf.lastSets', { sets: String(perf.lastSets), when: perf.lastLabel })
                  : t('exercises.detail.perf.last', { when: perf.lastLabel })}
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

        {v2 ? (
          <>
            {/* ── v2 Anatomy — primary (tint) + secondary tiles in one strip ── */}
            {(primaryMuscle || secondaryMuscles.length > 0) && (
              <section className="mb-6">
                <h3 className={`${v2H3} mb-3`} style={SECTION_FONT}>{t('exercises.detail.muscles')}</h3>
                <div className="-mx-4 flex flex-row items-stretch gap-2 overflow-x-auto px-4 pb-1 no-scrollbar">
                  {[...(primaryMuscle ? [primaryMuscle] : []), ...secondaryMuscles].map((m, i) => {
                    const isPrimary = !!primaryMuscle && i === 0;
                    return (
                      <div
                        key={m}
                        className={`flex w-[84px] flex-shrink-0 flex-col items-center gap-1.5 rounded-[18px] px-2 py-2.5 ${
                          isPrimary ? 'bg-v2-tint ring-1 ring-inset ring-v2-accent/40' : 'bg-white shadow-v2-ring'
                        }`}
                      >
                        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={MUSCLE_ICON_PATHS[m] ?? MUSCLE_FALLBACK_ICON}
                            alt=""
                            className="max-h-full max-w-full object-contain"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        </div>
                        <span
                          className={`w-full truncate whitespace-nowrap text-center text-[12px] font-extrabold ${isPrimary ? 'text-v2-deep' : 'text-v2-ink-2'}`}
                          style={SECTION_FONT}
                        >
                          {getMuscleGroupLabel(m)}
                        </span>
                        <span className="whitespace-nowrap text-[11px] font-bold text-v2-muted">
                          {isPrimary ? t('exercises.detail.musclePrimary') : t('exercises.detail.muscleSecondary')}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ── v2 Instructions — numbered steps ── */}
            {v2InstructionSteps.length > 0 && (
              <section className="mb-6">
                <h3 className={`${v2H3} mb-3`} style={SECTION_FONT}>{t('exercises.detail.instructions')}</h3>
                {v2InstructionSteps.length > 1 ? (
                  <ol className="space-y-3 rounded-v2-card bg-white p-4 shadow-v2-card">
                    {v2InstructionSteps.map((step, i) => (
                      <V2Step key={i} n={i + 1}>{step}</V2Step>
                    ))}
                  </ol>
                ) : (
                  <p className="rounded-v2-card bg-white p-4 text-[14.5px] leading-relaxed text-v2-ink-2 shadow-v2-card" style={SECTION_FONT}>
                    {v2InstructionSteps[0]}
                  </p>
                )}
              </section>
            )}

            {/* ── v2 Execution cues ── */}
            {sheetData.cues.length > 0 && (
              <section className="mb-6">
                <h3 className={`${v2H3} mb-3`} style={SECTION_FONT}>{t('exercises.detail.cues')}</h3>
                <ol className="space-y-3 rounded-v2-card bg-white p-4 shadow-v2-card">
                  {sheetData.cues.map((cue, i) => (
                    <V2Step key={i} n={i + 1}>{cue}</V2Step>
                  ))}
                </ol>
              </section>
            )}

            {sheetData.description && (
              <section className="mb-6">
                <h3 className={`${v2H3} mb-3`} style={SECTION_FONT}>{t('exercises.detail.description')}</h3>
                <p className="text-[14.5px] leading-relaxed text-v2-ink-2" style={SECTION_FONT}>
                  {sheetData.description}
                </p>
              </section>
            )}

            {sheetData.goal && (
              <section className="mb-6">
                <h3 className={`${v2H3} mb-3`} style={SECTION_FONT}>{t('exercises.detail.goals')}</h3>
                <div className="flex items-start gap-3 rounded-[20px] bg-white p-4 shadow-v2-ring">
                  <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-v2-tint text-v2-deep">
                    <Target size={16} strokeWidth={2.5} />
                  </span>
                  <p className="flex-1 pt-1 text-[14.5px] leading-relaxed text-v2-ink-2" style={SECTION_FONT}>
                    {sheetData.goal}
                  </p>
                </div>
              </section>
            )}

            {sheetData.tips.length > 0 && (
              <section className="mb-6">
                <h3 className={`${v2H3} mb-3`} style={SECTION_FONT}>{t('exercises.detail.tips')}</h3>
                <ul className="space-y-2.5">
                  {sheetData.tips.map((tip, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-v2-accent" />
                      <span className="flex-1 text-[14.5px] leading-relaxed text-v2-ink-2" style={SECTION_FONT}>
                        {tip}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        ) : (
          <>
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
                    {/* i18n-allow-hebrew: legacy v1 (enable_home_v2 on) */}שריר ראשי
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
                    {/* i18n-allow-hebrew: legacy v1 (enable_home_v2 on) */}שרירים משניים
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
              {t('exercises.detail.cues')}
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
              {t('exercises.detail.description')}
            </h3>
            <p className="text-sm text-slate-700 leading-relaxed" style={SECTION_FONT}>
              {sheetData.description}
            </p>
          </section>
        )}

        {sheetData.goal && (
          <section className="mb-6">
            <h3 className="text-right text-[16px] font-semibold text-slate-800 mb-3" style={SECTION_FONT}>
              {t('exercises.detail.goals')}
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
              {t('exercises.detail.instructions')}
            </h3>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line" style={SECTION_FONT}>
              {sheetData.instructions}
            </p>
          </section>
        )}

        {sheetData.tips.length > 0 && (
          <section className="mb-6">
            <h3 className="text-right text-[16px] font-semibold text-slate-800 mb-3" style={SECTION_FONT}>
              {t('exercises.detail.tips')}
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
          </>
        )}
      </div>
    </div>
    </MevV2.Provider>
  );
}
