'use client';

/**
 * ExerciseDetailSheet — bottom drawer for the /library Exercise detail view.
 *
 * Visual design is a read-only twin of ExerciseDetailContent (workout player).
 * Same constants, same section styles, same equipment pills, same muscle icons.
 *
 * ── Architecture (tutorial mode) ──────────────────────────────────────────
 * The hero video is ABSOLUTELY POSITIONED — it lives outside the scroll flow.
 * The scroll container sits on top (absolute inset-0, z-20) and uses a
 * MotionValue-driven `paddingTop` that tracks the video height frame-by-frame.
 * Because the video never participates in layout flow, its spring animation
 * cannot alter scroll geometry, eliminating all jitter / scrollTop jumps.
 *
 *   Sheet (fixed 90vh)
 *   ├─ [z-10]  Video (absolute, top: HANDLE_H, height: videoHeightMV)
 *   ├─ [z-20]  Scroll container (absolute inset-0, paddingTop: scrollPaddingTop)
 *   │           └─ White card (rounded-t-[40px], no negative margin)
 *   ├─ [z-30]  Tap overlay   — SPOTLIGHT only, covers video area
 *   ├─ [z-30]  "Learn more"  — FULLSCREEN only
 *   └─ [z-40]  Drag handle / Close / Shrink buttons
 *
 * ── Architecture (lean / no-tutorial mode) ────────────────────────────────
 * Classic flex-col sheet with a static video thumbnail in scroll flow.
 * No animated heights, no jitter risk.
 *
 * Sections:
 *   1. Video — fullTutorial → execution-method → legacy URL
 *   2. Equipment — icon + Hebrew label pill
 *   3. Primary muscle — SVG icon + label
 *   4. Secondary muscles — same
 *   5. Description
 *   6. Goal card
 *   7. Instructions
 *   8. Cues (specificCues) — numbered cyan circles
 *   9. Tips (highlights + notes) — cyan dot bullets
 *
 * z-[60]/z-[61] per z-index budget; portal to escape stacking contexts.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import {
  motion,
  AnimatePresence,
  animate,
  useMotionValue,
  useTransform,
} from 'framer-motion';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { X, Target, PersonStanding, ChevronDown, Minimize2, TrendingUp } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { getExerciseTrend } from '@/features/workout-engine/services/exercise-history.service';
import type { ExerciseSessionEntry } from '@/features/workout-engine/services/exercise-history.service';
import { useExerciseLibraryStore } from '../store/useExerciseLibraryStore';
import {
  Exercise,
  ExternalVideo,
  getLocalizedText,
  resolveTutorialForLang,
} from '../../core/exercise.types';
import ExerciseVideoPlayer from './ExerciseVideoPlayer';
import {
  ensureEquipmentCachesLoaded,
  getMuscleGroupLabel,
  resolveEquipmentLabel,
  resolveEquipmentSvgPathList,
} from '@/features/workout-engine/shared/utils/gear-mapping.utils';

// ── Visual tokens (exact copy from ExerciseDetailContent) ─────────────────
const PILL_BORDER = '0.5px solid #E0E9FF';
const SECTION_FONT = { fontFamily: 'var(--font-simpler)' } as const;
const WHITE_FADE =
  'linear-gradient(to top, white 0%, white 15%, rgba(255,255,255,0.4) 40%, transparent 100%)';

// ── Muscle icon paths (exact copy from ExerciseDetailContent) ──────────────
const MUSCLE_ICON_PATHS: Record<string, string> = {
  chest:      '/icons/muscles/male/chest.svg',
  back:       '/icons/muscles/male/back.svg',
  shoulders:  '/icons/muscles/male/shoulders.svg',
  biceps:     '/icons/muscles/male/biceps.svg',
  triceps:    '/icons/muscles/male/triceps.svg',
  forearms:   '/icons/muscles/male/forearms.svg',
  traps:      '/icons/muscles/male/traps.svg',
  lats:       '/icons/muscles/male/back.svg',
  upper_back: '/icons/muscles/male/back.svg',
  quads:      '/icons/muscles/male/quads.svg',
  hamstrings: '/icons/muscles/male/hamstrings.svg',
  glutes:     '/icons/muscles/male/glutes.svg',
  calves:     '/icons/muscles/male/calves.svg',
  core:       '/icons/muscles/male/abs.svg',
  abs:        '/icons/muscles/male/abs.svg',
  obliques:   '/icons/muscles/male/obliques.svg',
  legs:       '/icons/programs/leg.svg',
  full_body:  '/icons/programs/full_body.svg',
};

// ── Tutorial layout constants ──────────────────────────────────────────────
// HANDLE_H: height of the drag-handle strip at the top of the sheet (px).
const HANDLE_H = 16;
// CARD_OVERLAP: how many px the white content card overlaps the video bottom.
// This creates the "card sitting on top of video" visual seam and also acts
// as the scroll threshold for FULLSCREEN → SPOTLIGHT demotion.
const CARD_OVERLAP = 40;

// Lazy pixel-height helpers (avoids SSR window access at module load time).
const getSpotlightPx  = () => (typeof window !== 'undefined' ? window.innerHeight * 0.6          : 400);
const getFullscreenPx = () => (typeof window !== 'undefined' ? window.innerHeight * 0.9 - HANDLE_H : 700);

// ── Progression section ────────────────────────────────────────────────────

interface ChartDatum {
  session: string;
  maxReps: number;
}

/** Ghost chart: 5 static rising points rendered desaturated behind the overlay. */
const GHOST_POINTS: ChartDatum[] = [
  { session: '#1', maxReps: 5  },
  { session: '#2', maxReps: 8  },
  { session: '#3', maxReps: 7  },
  { session: '#4', maxReps: 11 },
  { session: '#5', maxReps: 10 },
];

/**
 * MeasuredChartBox — eliminates Recharts' "width/height of -1" warning at the
 * source by gating chart mount on a real ResizeObserver measurement instead
 * of using <ResponsiveContainer> (which races the parent's first paint and
 * fires the warning before its own observer has a stable measurement).
 *
 * Children receive concrete numeric `width` and `height` in pixels — pass
 * them straight to <AreaChart width={...} height={...}>, no ResponsiveContainer.
 */
function MeasuredChartBox({
  children,
  className,
}: {
  children: (size: { width: number; height: number }) => React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let raf = 0;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      // Guard: only commit when both dims are strictly positive (animations,
      // display:none branches, and 0-width parents are all rejected here).
      if (width > 0 && height > 0) {
        cancelAnimationFrame(raf);
        // Defer one frame so the paint after layout completes before recharts
        // runs its own ResizeObserver — prevents the -1 warning entirely.
        raf = requestAnimationFrame(() => {
          setSize((prev) =>
            prev && prev.width === width && prev.height === height
              ? prev
              : { width, height },
          );
        });
      }
    });
    ro.observe(el);
    return () => { ro.disconnect(); cancelAnimationFrame(raf); };
  }, []);

  return (
    <div ref={ref} className={className}>
      {size ? children(size) : null}
    </div>
  );
}

/**
 * Compact progression preview card shown inside ExerciseDetailSheet.
 *
 * Displays only שיא חזרות ברצף (personal-best max-reps) — no volume toggle.
 * The PR is the all-time maximum across all fetched sessions.
 * The entire card is a clickable gateway to the full analytics page.
 */
function ExerciseProgressionSection({
  exerciseId,
  exerciseName,
}: {
  exerciseId: string;
  exerciseName: string;
}) {
  const router = useRouter();
  const [sessions, setSessions] = useState<ChartDatum[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) { setLoading(false); return; }
    let cancelled = false;
    getExerciseTrend(uid, exerciseId, 10)
      .then((entries: ExerciseSessionEntry[]) => {
        if (cancelled) return;
        setSessions(entries.map((s, i) => ({ session: `#${i + 1}`, maxReps: s.maxReps })));
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [exerciseId]);

  const personalBest = sessions.length > 0 ? Math.max(...sessions.map((s) => s.maxReps)) : 0;
  const isSingle     = sessions.length === 1;
  const gradId       = `prog_${exerciseId}`;

  const handleNavigate = () => {
    router.push(`/profile/exercise/${exerciseId}?name=${encodeURIComponent(exerciseName)}`);
  };

  if (loading) {
    return (
      <section className="mb-6 animate-pulse" dir="rtl">
        <div className="flex items-center justify-between mb-3">
          <div className="h-4 bg-gray-100 rounded w-1/3" />
          <div className="h-3 bg-gray-100 rounded w-12" />
        </div>
        <div className="w-full aspect-[2/1] min-h-[150px] bg-gray-50 rounded-2xl" />
      </section>
    );
  }

  if (sessions.length === 0) {
    return (
      <section className="mb-6" dir="rtl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-right text-[16px] font-semibold" style={SECTION_FONT}>
            ההתקדמות שלי
          </h3>
          <span className="text-[11px] font-bold text-[#00ADEF] flex items-center gap-0.5">
            לפרטים נוספים ←
          </span>
        </div>

        <button
          type="button"
          onClick={handleNavigate}
          className="w-full text-right relative rounded-2xl overflow-hidden border border-gray-100 cursor-pointer active:scale-[0.98] transition-transform"
          aria-label="לצפייה בהתקדמות המלאה"
        >
          <div className="opacity-[0.18] grayscale pointer-events-none select-none" aria-hidden>
            <MeasuredChartBox className="w-full aspect-[2/1] min-h-[150px]">
              {({ width, height }) => (
                <AreaChart
                  width={width}
                  height={height}
                  data={GHOST_POINTS}
                  margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id={`${gradId}_g`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"  stopColor="#00ADEF" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#00ADEF" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 6" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="session" tick={{ fontSize: 10, fill: '#CBD5E1' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#CBD5E1' }} axisLine={false} tickLine={false} width={28} />
                  <Area
                    type="monotone" dataKey="maxReps"
                    stroke="#00ADEF" strokeWidth={2.5}
                    fill={`url(#${gradId}_g)`}
                    dot={{ r: 4, fill: '#fff', stroke: '#00ADEF', strokeWidth: 2 }}
                    isAnimationActive={false}
                  />
                </AreaChart>
              )}
            </MeasuredChartBox>
          </div>

          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 bg-white/60 backdrop-blur-[2px]">
            <TrendingUp className="w-9 h-9 text-[#00ADEF] mb-2 opacity-60" />
            <p className="text-[13px] font-bold text-gray-700 leading-snug">
              עדיין לא ביצעת את התרגיל הזה.
            </p>
            <p className="text-xs text-gray-500 mt-1">זה הזמן לקבוע שיא ראשון! 🏆</p>
          </div>
        </button>
      </section>
    );
  }

  return (
    <section className="mb-6" dir="rtl">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-right text-[16px] font-semibold" style={SECTION_FONT}>
          ההתקדמות שלי
        </h3>
        <button
          type="button"
          onClick={handleNavigate}
          className="text-[11px] font-bold text-[#00ADEF] hover:underline active:opacity-70"
        >
          לפרטים נוספים ←
        </button>
      </div>

      <button
        type="button"
        onClick={handleNavigate}
        className="w-full text-right rounded-2xl border border-gray-100 bg-white p-4 shadow-sm cursor-pointer active:scale-[0.98] transition-transform"
        aria-label="לצפייה בהתקדמות המלאה"
      >
        <div className="flex items-baseline gap-1.5 mb-3">
          <span className="text-2xl font-black text-gray-900 tabular-nums">{personalBest}</span>
          <span className="text-xs font-bold text-gray-400">שיא חזרות ברצף</span>
          <span className="text-[10px] font-bold text-gray-400 ms-auto">
            {sessions.length} אימונים
          </span>
        </div>

        {isSingle && (
          <p className="text-[11px] text-gray-400 text-center mb-2">
            נתון ראשון נרשם — הגרף יתחיל אחרי האימון הבא.
          </p>
        )}

        <MeasuredChartBox className="w-full aspect-[2/1] min-h-[150px]">
          {({ width, height }) => (
            <AreaChart
              width={width}
              height={height}
              data={sessions}
              margin={{ top: 4, right: 4, left: -12, bottom: 0 }}
            >
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"  stopColor="#00ADEF" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#00ADEF" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 6" stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="session" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} width={32} />
              <Tooltip
                contentStyle={{
                  background: '#1E293B', border: 'none', borderRadius: 10,
                  fontSize: 11, fontWeight: 700, color: '#fff', padding: '6px 10px',
                }}
                formatter={(value: number) => [`${value} חזרות`, '']}
                labelFormatter={() => ''}
                cursor={{ stroke: '#00ADEF', strokeWidth: 1, strokeDasharray: '4 4' }}
              />
              <Area
                type="monotone" dataKey="maxReps"
                stroke="#00ADEF" strokeWidth={2.5}
                fill={`url(#${gradId})`}
                dot={{ r: 4, fill: '#fff', stroke: '#00ADEF', strokeWidth: 2 }}
                activeDot={{ r: 6, fill: '#00ADEF', stroke: '#fff', strokeWidth: 2 }}
                isAnimationActive={!isSingle}
              />
            </AreaChart>
          )}
        </MeasuredChartBox>

        <div className="flex items-center gap-1.5 mt-2">
          <div className="w-2.5 h-2.5 rounded-full bg-[#00ADEF]" />
          <span className="text-[10px] font-bold text-gray-500">שיא חזרות ברצף</span>
        </div>
      </button>
    </section>
  );
}

// ── Data helpers ───────────────────────────────────────────────────────────

function pickFullTutorial(ex: Exercise, lang = 'he'): ExternalVideo | undefined {
  const top = resolveTutorialForLang(ex.media as any, lang as any);
  if (top) return top;
  const methods = ex.execution_methods ?? ex.executionMethods ?? [];
  for (const m of methods) {
    const mt = resolveTutorialForLang(m?.media as any, lang as any);
    if (mt) return mt;
  }
  return undefined;
}

function pickLegacyVideoUrl(ex: Exercise): string | null {
  if (ex.media?.videoUrl) return ex.media.videoUrl;
  const methods = ex.execution_methods ?? ex.executionMethods ?? [];
  for (const m of methods) {
    if (m?.media?.mainVideoUrl) return m.media.mainVideoUrl;
  }
  return null;
}

function collectEquipmentIds(ex: Exercise): string[] {
  const ids = new Set<string>();
  (ex.equipment ?? []).filter((e) => e !== 'none').forEach((e) => ids.add(e));
  (ex.requiredUserGear ?? []).forEach((id) => id && ids.add(id));
  const methods = ex.execution_methods ?? ex.executionMethods ?? [];
  for (const m of methods) {
    m.gearIds?.forEach((id) => id && ids.add(id));
    m.equipmentIds?.forEach((id) => id && ids.add(id));
    if (m.gearId) ids.add(m.gearId);
    if (m.equipmentId) ids.add(m.equipmentId);
  }
  return Array.from(ids);
}

function extractString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    return String(v.he ?? v.en ?? v.male ?? v.female ?? '').trim();
  }
  return '';
}

function buildSheetData(exercise: Exercise) {
  const tutorial = pickFullTutorial(exercise);
  const legacy   = pickLegacyVideoUrl(exercise);

  // Best available static poster image shown while the video buffers.
  // Priority: exercise-level image → Bunny-generated thumbnail from tutorial.
  const posterUrl: string | null =
    exercise.media?.imageUrl
    ?? tutorial?.thumbnailUrl
    ?? null;

  const primaryKey  = exercise.primaryMuscle ?? exercise.muscleGroups?.[0];
  const secondaryKeys: string[] =
    exercise.secondaryMuscles && exercise.secondaryMuscles.length > 0
      ? exercise.secondaryMuscles
      : (exercise.muscleGroups?.slice(1) ?? []);

  const equipmentIds = collectEquipmentIds(exercise);

  const description = exercise.content?.description
    ? getLocalizedText(exercise.content.description)
    : '';
  const goal =
    !description && exercise.content?.goal ? exercise.content.goal : '';
  const instructions = exercise.content?.instructions
    ? getLocalizedText(exercise.content.instructions)
    : '';

  const methods = exercise.execution_methods ?? exercise.executionMethods ?? [];

  const cueSet = new Set<string>();
  (exercise.content?.specificCues ?? []).forEach((c) => {
    const s = extractString(c); if (s) cueSet.add(s);
  });
  methods.forEach((m) => {
    ((m as any).specificCues ?? []).forEach((c: unknown) => {
      const s = extractString(c); if (s) cueSet.add(s);
    });
  });
  if (cueSet.size === 0) {
    methods.forEach((m) => {
      (m.highlights ?? []).forEach((h) => {
        const s = extractString(h); if (s) cueSet.add(s);
      });
    });
  }
  const cues = Array.from(cueSet);

  const tipSet = new Set<string>();
  (exercise.content?.highlights ?? []).forEach((h) => {
    const s = extractString(h); if (s && !cueSet.has(s)) tipSet.add(s);
  });
  (exercise.content?.notes ?? []).forEach((n) => {
    const s = extractString(n); if (s && !cueSet.has(s)) tipSet.add(s);
  });
  if (cueSet.size > 0) {
    methods.forEach((m) => {
      (m.highlights ?? []).forEach((h) => {
        const s = extractString(h);
        if (s && !cueSet.has(s) && !tipSet.has(s)) tipSet.add(s);
      });
    });
  }
  const tips = Array.from(tipSet);

  return {
    name: getLocalizedText(exercise.name),
    tutorial,
    legacy,
    posterUrl,
    primaryKey,
    secondaryKeys,
    equipmentIds,
    description,
    goal,
    instructions,
    cues,
    tips,
  };
}

// ── Component ──────────────────────────────────────────────────────────────

export default function ExerciseDetailSheet() {
  // ── Store reads ──────────────────────────────────────────────────────────
  const isOpen   = useExerciseLibraryStore((s) => s.isDetailOpen);
  const exercise = useExerciseLibraryStore((s) => s.selectedExercise);
  const close    = useExerciseLibraryStore((s) => s.closeDetail);

  // ── Local state ──────────────────────────────────────────────────────────
  const [mounted,      setMounted]      = useState(false);
  const [cacheVersion, setCacheVersion] = useState(0);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    ensureEquipmentCachesLoaded()
      .then(() => { if (!cancelled) setCacheVersion((v) => v + 1); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isOpen]);

  // ── Body scroll lock ─────────────────────────────────────────────────────
  // Locks the page behind the sheet so wheel/touch events on the dimmed area
  // don't scroll the library underneath ("scroll leak"). Compensates for the
  // disappearing scrollbar by adding equivalent padding-right, preventing a
  // visible reflow of the page when the sheet opens/closes.
  useEffect(() => {
    if (!isOpen) return;
    if (typeof document === 'undefined') return;

    const { body, documentElement: html } = document;
    const prevBodyOverflow    = body.style.overflow;
    const prevBodyPaddingRight = body.style.paddingRight;
    const prevHtmlOverflow    = html.style.overflow;

    const scrollbarGutter = window.innerWidth - html.clientWidth;
    body.style.overflow = 'hidden';
    html.style.overflow = 'hidden';
    if (scrollbarGutter > 0) {
      body.style.paddingRight = `${scrollbarGutter}px`;
    }

    return () => {
      body.style.overflow      = prevBodyOverflow;
      body.style.paddingRight  = prevBodyPaddingRight;
      html.style.overflow      = prevHtmlOverflow;
    };
  }, [isOpen]);

  const data = useMemo(
    () => (exercise ? buildSheetData(exercise) : null),
    [exercise, cacheVersion],
  );

  const hasFullTutorial = !!(data?.tutorial || data?.legacy);

  type VideoMode = 'FULLSCREEN' | 'SPOTLIGHT';
  const [videoMode, setVideoMode] = useState<VideoMode>('SPOTLIGHT');

  // ── Refs & MotionValues ──────────────────────────────────────────────────
  const scrollRef = useRef<HTMLDivElement>(null);

  // scrollY tracks the scroll container's scrollTop for the iOS rubber-band
  // scale effect on the video (heroScale below).
  const scrollY = useMotionValue(0);

  // videoHeightMV is animated frame-by-frame by the `animate()` utility when
  // videoMode changes. Both the video element's height and the scroll
  // container's paddingTop are bound to this single MotionValue so they stay
  // pixel-perfect in sync — no layout recalculation, no jitter.
  const videoHeightMV = useMotionValue(getSpotlightPx());

  // scrollPaddingTop = videoHeight + HANDLE_H - CARD_OVERLAP.
  // This positions the top of the white card exactly CARD_OVERLAP px before
  // the video's bottom edge, creating the "card sitting on video" seam.
  const scrollPaddingTop = useTransform(
    videoHeightMV,
    (h) => h + HANDLE_H - CARD_OVERLAP,
  );

  // Mirror live state in refs so scroll/touch handlers never hold stale
  // closures, and critically so `videoMode` is NOT in the scroll-listener
  // effect's dep array (adding it forces listener re-registration on every
  // mode change, creating a gap with no listener — a primary jitter source).
  const videoModeRef       = useRef(videoMode);
  const hasFullTutorialRef = useRef(hasFullTutorial);
  videoModeRef.current       = videoMode;
  hasFullTutorialRef.current = hasFullTutorial;

  // Reset state + snap videoHeightMV (no animation) on each open so the user
  // always lands in canonical SPOTLIGHT view.
  useEffect(() => {
    if (isOpen) {
      setVideoMode('SPOTLIGHT');
      videoHeightMV.set(getSpotlightPx());
    }
  }, [isOpen, videoHeightMV]);

  // Spring-animate videoHeightMV whenever videoMode changes.
  // Because videoHeightMV drives BOTH the video height and paddingTop, the
  // two move in lock-step every frame — the geometry is always consistent.
  useEffect(() => {
    const target = videoMode === 'FULLSCREEN' ? getFullscreenPx() : getSpotlightPx();
    const ctrl = animate(videoHeightMV, target, {
      type: 'spring',
      stiffness: 280,
      damping: 32,
    });
    return () => ctrl.stop();
  }, [videoMode, videoHeightMV]);

  // Attach scroll listener — minimal stable deps; videoMode/hasFullTutorial
  // are read via refs so the listener survives mode changes without re-registration.
  useEffect(() => {
    if (!isOpen) return;
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const y = el.scrollTop;
      scrollY.set(y);
      // iOS rubber-band overscroll to negative territory while in SPOTLIGHT
      // → promote to FULLSCREEN (pull-down expands the video).
      if (y < -30 && videoModeRef.current === 'SPOTLIGHT' && hasFullTutorialRef.current) {
        setVideoMode('FULLSCREEN');
      }
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
    // videoMode / hasFullTutorial intentionally omitted — read via refs above.
  }, [isOpen, scrollY]);

  // When entering FULLSCREEN, clear any lingering scrollTop so the video
  // fill is clean. This is safe in the new architecture because the video
  // is absolutely positioned — setting scrollTop on the scroll container
  // does NOT affect the video's layout or trigger a reflow cascade.
  useEffect(() => {
    if (videoMode === 'FULLSCREEN' && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [videoMode]);

  // ── Mode handlers ────────────────────────────────────────────────────────

  // Tap on the video (SPOTLIGHT only) → promote to FULLSCREEN.
  const handleVideoTap = useCallback(() => {
    if (!hasFullTutorialRef.current) return;
    setVideoMode('FULLSCREEN');
  }, []);

  const shrinkToSpotlight = useCallback(() => setVideoMode('SPOTLIGHT'), []);

  // Cross-platform pull-down at scrollTop === 0 → promote to FULLSCREEN.
  const touchStartY = useRef<number | null>(null);

  const promoteFromPullDown = useCallback(() => {
    setVideoMode((m) =>
      m === 'SPOTLIGHT' && hasFullTutorialRef.current ? 'FULLSCREEN' : m,
    );
  }, []);

  // Only attached in SPOTLIGHT mode (see JSX), so videoMode check is omitted.
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!hasFullTutorialRef.current) return;
    const sc = scrollRef.current;
    if (sc && sc.scrollTop > 0) return;
    touchStartY.current = e.touches[0]?.clientY ?? null;
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (touchStartY.current == null) return;
      const sc = scrollRef.current;
      if (sc && sc.scrollTop > 0) { touchStartY.current = null; return; }
      const dy = (e.touches[0]?.clientY ?? 0) - touchStartY.current;
      if (dy > 70) {
        promoteFromPullDown();
        touchStartY.current = null;
      }
    },
    [promoteFromPullDown],
  );

  const handleTouchEnd = useCallback(() => { touchStartY.current = null; }, []);

  // Wheel in SPOTLIGHT: negative deltaY (scroll-up) at top → promote to FULLSCREEN.
  // Wheel in FULLSCREEN is handled on the outer sheet div (see JSX) so it
  // reaches the handler even though the scroll container has pointer-events:none.
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!hasFullTutorialRef.current) return;
      const sc = scrollRef.current;
      if (sc && sc.scrollTop === 0 && e.deltaY < -30) {
        promoteFromPullDown();
      }
    },
    [promoteFromPullDown],
  );

  // Subtle rubber-band scale on the video when the user overscrolls downward
  // (iOS only — scrollTop goes negative). Purely cosmetic; no-op elsewhere.
  const heroScale = useTransform(scrollY, [-120, 0], [1.08, 1], { clamp: true });

  // ── Shared content body (used in both layout branches) ───────────────────
  const contentBody = data && (
    <>
      {exercise && (
        <ExerciseProgressionSection
          exerciseId={exercise.id}
          exerciseName={data.name}
        />
      )}

      {/* Equipment */}
      {data.equipmentIds.length > 0 && (
        <section className="mb-6">
          <h3 className="text-right text-[16px] font-semibold mb-3" style={SECTION_FONT}>
            ציוד
          </h3>
          <div className="flex flex-wrap gap-2">
            {data.equipmentIds.map((eqId) => {
              const label    = resolveEquipmentLabel(eqId);
              if (label === 'ציוד לא מזוהה') return null;
              const svgPaths = resolveEquipmentSvgPathList(eqId);
              const iconSrc  = svgPaths[0] ?? null;
              return (
                <div
                  key={eqId}
                  className="flex-shrink-0 flex items-center gap-2 bg-white shadow-sm rounded-lg px-3"
                  style={{ border: PILL_BORDER, height: 30 }}
                >
                  {iconSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={iconSrc}
                      alt=""
                      width={16}
                      height={16}
                      className="object-contain flex-shrink-0"
                      onError={(e) => {
                        const img = e.currentTarget as HTMLImageElement;
                        img.removeAttribute('src');
                        img.style.display = 'none';
                      }}
                    />
                  ) : (
                    <PersonStanding size={16} className="text-slate-400 flex-shrink-0" />
                  )}
                  <span className="text-xs font-normal text-gray-800 whitespace-nowrap" style={SECTION_FONT}>
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Muscles */}
      {(data.primaryKey || data.secondaryKeys.length > 0) && (
        <section className="mb-6">
          {data.primaryKey && (
            <div style={{ marginBottom: data.secondaryKeys.length > 0 ? 16 : 0 }}>
              <h3 className="text-right text-[16px] font-semibold mb-3" style={SECTION_FONT}>
                שריר ראשי
              </h3>
              <div className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={MUSCLE_ICON_PATHS[data.primaryKey] ?? '/icons/programs/muscle.svg'}
                  alt=""
                  width={36}
                  height={36}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
                <span className="text-sm font-normal text-gray-800" style={SECTION_FONT}>
                  {getMuscleGroupLabel(data.primaryKey)}
                </span>
              </div>
            </div>
          )}

          {data.secondaryKeys.length > 0 && (
            <div>
              <h3 className="text-right text-[16px] font-semibold mb-3" style={SECTION_FONT}>
                שרירים משניים
              </h3>
              <div className="flex flex-wrap gap-x-6 gap-y-3">
                {data.secondaryKeys.map((m) => (
                  <div key={m} className="flex-shrink-0 flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={MUSCLE_ICON_PATHS[m] ?? '/icons/programs/muscle.svg'}
                      alt=""
                      width={36}
                      height={36}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    <span className="text-sm font-normal text-gray-800" style={SECTION_FONT}>
                      {getMuscleGroupLabel(m)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Description */}
      {data.description && (
        <section className="mb-6">
          <h3 className="text-right text-[16px] font-semibold mb-3" style={SECTION_FONT}>
            תיאור
          </h3>
          <p className="text-sm text-slate-700 leading-relaxed" style={SECTION_FONT}>
            {data.description}
          </p>
        </section>
      )}

      {/* Goal */}
      {data.goal && (
        <section className="mb-6">
          <h3 className="text-right text-[16px] font-semibold mb-3" style={SECTION_FONT}>
            מטרות
          </h3>
          <div className="flex items-start gap-3 bg-slate-50 rounded-xl p-4" style={{ border: PILL_BORDER }}>
            <Target size={18} className="flex-shrink-0 mt-0.5 text-cyan-600" />
            <p className="text-sm text-slate-700 leading-relaxed" style={SECTION_FONT}>
              {data.goal}
            </p>
          </div>
        </section>
      )}

      {/* Instructions */}
      {data.instructions && data.instructions !== data.description && (
        <section className="mb-6">
          <h3 className="text-right text-[16px] font-semibold mb-3" style={SECTION_FONT}>
            הוראות ביצוע
          </h3>
          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line" style={SECTION_FONT}>
            {data.instructions}
          </p>
        </section>
      )}

      {/* Cues — numbered cyan circles */}
      {data.cues.length > 0 && (
        <section className="mb-6">
          <h3 className="text-right text-[16px] font-semibold mb-3" style={SECTION_FONT}>
            דגשים
          </h3>
          <ol className="space-y-2.5">
            {data.cues.map((cue, i) => (
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

      {/* Tips — cyan dot bullets */}
      {data.tips.length > 0 && (
        <section className="mb-6">
          <h3 className="text-right text-[16px] font-semibold mb-3" style={SECTION_FONT}>
            טיפים
          </h3>
          <ul className="space-y-2">
            {data.tips.map((tip, i) => (
              <li key={i} className="flex gap-2 items-start">
                <span className="flex-shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full bg-cyan-400" />
                <span className="text-sm text-slate-600 flex-1 leading-relaxed" style={SECTION_FONT}>
                  {tip}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );

  // ── Sheet JSX ─────────────────────────────────────────────────────────────
  const sheet = (
    <AnimatePresence>
      {isOpen && data && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            className="fixed inset-0 bg-black/50 z-[60]"
          />

          {hasFullTutorial ? (
            // ────────────────────────────────────────────────────────────────
            // TUTORIAL LAYOUT
            // Video is absolutely positioned — completely outside the scroll
            // flow. Only videoHeightMV and scrollPaddingTop change during a
            // mode transition; scroll geometry is never disturbed.
            // ────────────────────────────────────────────────────────────────
            <motion.div
              key="sheet-tutorial"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              // Desktop: any downward wheel event in FULLSCREEN → shrink.
              // This handler lives on the sheet (not the scroll container)
              // so it fires even when the scroll container has pointer-events:none.
              onWheel={
                videoMode === 'FULLSCREEN'
                  ? (e) => { if (e.deltaY > 5) shrinkToSpotlight(); }
                  : undefined
              }
              className="fixed bottom-0 left-0 right-0 z-[61] bg-white rounded-t-3xl shadow-drawer overflow-hidden"
              style={{ height: '90vh' }}
              dir="rtl"
            >
              {/* ── [z-10] Hero video ──────────────────────────────────────
                  Absolutely positioned. Height is a MotionValue — the spring
                  animation never touches the scroll container's layout.
                  scale: heroScale applies a subtle rubber-band zoom on iOS
                  overscroll (purely cosmetic). ──────────────────────────── */}
              <motion.div
                style={{
                  height: videoHeightMV,
                  top: HANDLE_H,
                  scale: heroScale,
                  transformOrigin: 'top center',
                }}
                className="absolute inset-x-0 bg-slate-900 overflow-hidden z-10"
              >
                <ExerciseVideoPlayer
                  video={data.tutorial}
                  legacyVideoUrl={data.legacy}
                  posterUrl={data.posterUrl}
                  mode="tutorial"
                  className="absolute inset-0 w-full h-full"
                />

                {/* White fade — SPOTLIGHT only.
                    Purpose: softens the seam between the video bottom and the
                    white card below (CARD_OVERLAP = 40px).
                    MUST be hidden in FULLSCREEN: the gradient is fully white
                    at the bottom (see WHITE_FADE constant), which would paint
                    over the native video timeline / controls chrome and make
                    them both invisible and unclickable-looking.
                    AnimatePresence gives a quick cross-fade so the gradient
                    doesn't snap on/off during the spring transition. */}
                <AnimatePresence>
                  {videoMode === 'SPOTLIGHT' && (
                    <motion.div
                      key="white-fade"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="absolute bottom-0 inset-x-0 h-[55%] pointer-events-none z-[15]"
                      style={{ background: WHITE_FADE }}
                    />
                  )}
                </AnimatePresence>
              </motion.div>

              {/* ── [z-20] Scroll container ────────────────────────────────
                  Always overflow-y-auto — no class switching required.
                  paddingTop (MotionValue) tracks videoHeightMV in real-time,
                  so the white card always starts exactly CARD_OVERLAP px
                  before the video's bottom edge.
                  pointer-events:none in FULLSCREEN lets taps reach the video
                  player controls (play/pause, scrubber). ────────────────── */}
              <motion.div
                ref={scrollRef}
                style={{
                  paddingTop: scrollPaddingTop,
                  pointerEvents: videoMode === 'FULLSCREEN' ? 'none' : 'auto',
                }}
                onWheel={videoMode === 'SPOTLIGHT' ? handleWheel : undefined}
                onTouchStart={videoMode === 'SPOTLIGHT' ? handleTouchStart : undefined}
                onTouchMove={videoMode === 'SPOTLIGHT'  ? handleTouchMove  : undefined}
                onTouchEnd={videoMode === 'SPOTLIGHT'   ? handleTouchEnd   : undefined}
                className="absolute inset-0 z-20 overflow-y-auto overscroll-contain"
              >
                {/* White content card — no negative margin needed.
                    Its top is naturally positioned by paddingTop. */}
                <div
                  className="relative bg-white rounded-t-[40px] px-4 pt-9 pb-24 shadow-[0_-12px_32px_-8px_rgba(0,0,0,0.18)]"
                  dir="rtl"
                >
                  {/* Title fades in SPOTLIGHT, hidden in FULLSCREEN */}
                  <AnimatePresence initial={false}>
                    {videoMode === 'SPOTLIGHT' && (
                      <motion.h1
                        key="ex-title"
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.16, ease: 'easeOut' }}
                        className="text-[20px] font-bold text-gray-900 text-right leading-snug mb-5"
                        style={SECTION_FONT}
                      >
                        {data.name}
                      </motion.h1>
                    )}
                  </AnimatePresence>

                  {contentBody}
                </div>
              </motion.div>

              {/* ── [z-30] Tap overlay — SPOTLIGHT only ───────────────────
                  Covers the exact video area (top: HANDLE_H, height: videoHeightMV).
                  Any tap here promotes to FULLSCREEN. Removed in FULLSCREEN
                  so player controls are reachable. ──────────────────────── */}
              <AnimatePresence>
                {videoMode === 'SPOTLIGHT' && (
                  <motion.button
                    key="tap-overlay"
                    type="button"
                    style={{ height: videoHeightMV, top: HANDLE_H }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.1 }}
                    onClick={handleVideoTap}
                    className="absolute inset-x-0 z-30 bg-transparent border-0 focus:outline-none cursor-pointer"
                    aria-label="הרחב סרטון למסך מלא"
                  />
                )}
              </AnimatePresence>

              {/* ── [z-40] Drag handle ─────────────────────────────────────
                  The ONLY draggable element. A 16px strip at the very top.
                  Drag down >100px → shrink to SPOTLIGHT (if FULLSCREEN)
                  or close the sheet (if SPOTLIGHT). ─────────────────────── */}
              <motion.div
                drag="y"
                dragConstraints={{ top: 0 }}
                dragElastic={0.15}
                onDragEnd={(_, info) => {
                  if (info.offset.y > 100) {
                    if (videoMode === 'FULLSCREEN') shrinkToSpotlight();
                    else close();
                  }
                }}
                className="absolute top-0 inset-x-0 z-40 flex justify-center pt-2 cursor-grab"
                style={{ height: HANDLE_H }}
              >
                <div className="w-10 h-1 rounded-full bg-gray-200" />
              </motion.div>

              {/* [z-40] Close */}
              <button
                type="button"
                onClick={close}
                className="absolute top-3 left-3 p-2 text-gray-500 hover:text-gray-700 rounded-full bg-white/80 backdrop-blur-sm z-40 shadow-sm"
                aria-label="סגור"
              >
                <X size={18} />
              </button>

              {/* [z-40] Shrink — explicit FULLSCREEN exit */}
              <AnimatePresence>
                {videoMode === 'FULLSCREEN' && (
                  <motion.button
                    key="shrink-btn"
                    type="button"
                    onClick={shrinkToSpotlight}
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.85 }}
                    transition={{ duration: 0.15 }}
                    className="absolute top-3 right-3 p-2 text-white rounded-full bg-black/45 backdrop-blur-md z-40 shadow-sm hover:bg-black/60"
                    aria-label="כווץ סרטון"
                  >
                    <Minimize2 size={18} />
                  </motion.button>
                )}
              </AnimatePresence>

              {/* [z-30] "Learn more" hint — FULLSCREEN only */}
              <AnimatePresence>
                {videoMode === 'FULLSCREEN' && (
                  <motion.div
                    key="hint"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.16, ease: 'easeOut' }}
                    className="absolute bottom-16 inset-x-0 z-30 flex justify-center pointer-events-none"
                  >
                    <motion.div
                      animate={{ y: [0, 4, 0] }}
                      transition={{ repeat: Infinity, duration: 1.4, ease: 'easeInOut' }}
                      className="flex items-center gap-1.5 rounded-full bg-black/45 backdrop-blur-md px-3.5 py-1.5 shadow-md"
                    >
                      <span className="text-[12px] font-bold text-white tracking-wide" style={SECTION_FONT}>
                        למידע נוסף
                      </span>
                      <ChevronDown size={16} strokeWidth={2.5} className="text-white" />
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ) : (
            // ────────────────────────────────────────────────────────────────
            // LEAN LAYOUT (no tutorial video)
            // Classic flex-col sheet. Nothing animates, no jitter risk.
            // ────────────────────────────────────────────────────────────────
            <motion.div
              key="sheet-lean"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={0.25}
              onDragEnd={(_, info) => { if (info.offset.y > 140) close(); }}
              className="fixed bottom-0 left-0 right-0 z-[61] bg-white rounded-t-3xl shadow-drawer flex flex-col"
              style={{ maxHeight: '90vh' }}
              dir="rtl"
            >
              {/* Drag handle */}
              <div className="flex justify-center pt-2 pb-1 flex-shrink-0">
                <div className="w-10 h-1 rounded-full bg-gray-200" />
              </div>

              {/* Close */}
              <button
                type="button"
                onClick={close}
                className="absolute top-3 left-3 p-2 text-gray-500 hover:text-gray-700 rounded-full bg-white/80 backdrop-blur-sm z-30 shadow-sm"
                aria-label="סגור"
              >
                <X size={18} />
              </button>

              {/* Scrollable body */}
              <div
                ref={scrollRef}
                className="flex-auto min-h-0 overflow-y-auto overscroll-contain"
              >
                <div className="px-4 pt-6 pb-12" dir="rtl">
                  <h1
                    className="text-[20px] font-bold text-gray-900 text-right leading-snug mb-5"
                    style={SECTION_FONT}
                  >
                    {data.name}
                  </h1>
                  {contentBody}
                </div>
              </div>
            </motion.div>
          )}
        </>
      )}
    </AnimatePresence>
  );

  if (!mounted) return null;
  return createPortal(sheet, document.body);
}
