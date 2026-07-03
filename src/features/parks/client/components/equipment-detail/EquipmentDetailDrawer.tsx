'use client';

/**
 * EquipmentDetailDrawer — bottom-sheet detail view for a single piece
 * of park gym equipment.
 *
 * Visual pattern is a direct copy of the LEAN variant of
 * `ExerciseDetailSheet` (the read-only library twin of
 * `ExerciseDetailContent`):
 *   • Backdrop + portaled `motion.div` flying in from the bottom.
 *   • Drag-handle strip at the top — drag down ≥ 140px to close.
 *   • Hero block: brand image (or equipment SVG, or `Dumbbell` glyph).
 *   • White scrolling card with sections styled identically to the
 *     exercise drawer:
 *         · Title (+ brand line)
 *         · Pill row: רמה / ציוד פונקציונלי
 *         · שריר ראשי         — same MUSCLE_ICON_PATHS map
 *         · שרירים משניים    — same icons / chips
 *         · דגשים             — derived auto-tips when no doc data
 *         · סרטון הדגמה      — YouTube/Vimeo iframe
 *         · מותגים זמינים    — brand selector chips
 *
 * Why a drawer (not a route):
 *   The user opens this from inside `ParkDetailSheet` (already a
 *   z-[100] sheet). Pushing a route would tear them out of the park
 *   they were exploring — the drawer keeps the discovery context
 *   intact and matches the exercise-detail UX from /library.
 *
 * Z-index:
 *   The drawer sits ABOVE ParkDetailSheet (z-[100]) so it can be
 *   reached from inside that sheet. We re-use the existing "nested
 *   modal" tier z-[200] documented in the cursorrules z-budget for
 *   this exact case (Post-workout summary nested UI is the original
 *   precedent — same pattern: a modal opened from inside another
 *   sheet that should win every stacking battle).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Dumbbell,
  Loader2,
  Video as VideoIcon,
  AlertTriangle,
  Target,
} from 'lucide-react';
import { getGymEquipment } from '@/features/content/equipment/gym/core/gym-equipment.service';
import type {
  EquipmentBrand,
  GymEquipment,
} from '@/features/content/equipment/gym/core/gym-equipment.types';
import { getMuscleGroupLabel } from '@/features/workout-engine/shared/utils/gear-mapping.utils';

// ── Visual tokens — copied from ExerciseDetailSheet so the two
//    drawers feel like the same product surface. Keep these in sync
//    with `ExerciseDetailSheet.tsx` if either side evolves. ─────────
const PILL_BORDER = '0.5px solid #E0E9FF';
const SECTION_FONT = { fontFamily: 'var(--font-simpler)' } as const;

// Same muscle-icon registry the exercise drawer uses. Inlined here
// (rather than imported) so this drawer doesn't pull a strength /
// player feature into the parks bundle just for the path map.
const MUSCLE_ICON_PATHS: Record<string, string> = {
  chest: '/icons/muscles/male/chest.svg',
  back: '/icons/muscles/male/back.svg',
  shoulders: '/icons/muscles/male/shoulders.svg',
  biceps: '/icons/muscles/male/biceps.svg',
  triceps: '/icons/muscles/male/triceps.svg',
  forearms: '/icons/muscles/male/forearms.svg',
  traps: '/icons/muscles/male/traps.svg',
  lats: '/icons/muscles/male/back.svg',
  upper_back: '/icons/muscles/male/back.svg',
  quads: '/icons/muscles/male/quads.svg',
  hamstrings: '/icons/muscles/male/hamstrings.svg',
  glutes: '/icons/muscles/male/glutes.svg',
  calves: '/icons/muscles/male/calves.svg',
  core: '/icons/muscles/male/abs.svg',
  abs: '/icons/muscles/male/abs.svg',
  obliques: '/icons/muscles/male/obliques.svg',
  legs: '/icons/programs/leg.svg',
  full_body: '/icons/programs/full_body.svg',
};

/**
 * Extract a YouTube or Vimeo video id from a free-form url so we can
 * render an `<iframe>` embed. Returns null when the url doesn't match
 * either provider — the caller falls back to an "open in external"
 * link instead.
 */
function parseVideoEmbed(url: string | undefined): { src: string } | null {
  if (!url) return null;
  const yt = url.match(
    /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/,
  );
  if (yt) return { src: `https://www.youtube.com/embed/${yt[1]}` };
  const vimeo = url.match(/(?:vimeo\.com\/)(\d+)/);
  if (vimeo) return { src: `https://player.vimeo.com/video/${vimeo[1]}` };
  if (/iframe\.bunnycdn\.com\/embed\//.test(url)) return { src: url };
  return null;
}

/**
 * Sanitize an admin-form name field — equipment names occasionally
 * arrive as `{ he, en }` localisation objects from CSV imports.
 */
function resolveName(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object') {
    const v = raw as Record<string, unknown>;
    return String(v.he ?? v.en ?? '').trim();
  }
  return '';
}

/**
 * Auto-derive a small set of "דגשים" (technique cues) when the
 * equipment doc doesn't carry its own. We pivot on the primary muscle
 * group so the cues feel relevant — generic "stay engaged, breathe
 * controlled" tips that apply to any rep on the targeted area.
 *
 * NOTE: This is intentionally heuristic. If/when the admin form gains
 * a `cues` / `highlights` field on the equipment doc, the resolver
 * will prefer those persisted strings and only fall back to this map
 * for legacy data — keeping the section non-empty either way.
 */
const AUTO_CUES_BY_MUSCLE: Record<string, string[]> = {
  chest: [
    'שמור על שכמות סגורות לאורך כל התנועה',
    'הורד את הגוף בקצב מבוקר ועלה במלוא הטווח',
  ],
  back: [
    'התחל את המשיכה משכמות, לא ממרפקים',
    'שמור על ליבה אסופה — אל תקשת את הגב התחתון',
  ],
  shoulders: [
    'ייצב את שרירי הליבה לפני כל חזרה',
    'אל תיכנס לטווח כואב — עצור איפה שזה מרגיש בשליטה',
  ],
  biceps: [
    'הצמד את המרפקים לגוף — אל תפתח אותם החוצה',
    'נשוף בעת המשיכה, שאף בירידה',
  ],
  triceps: [
    'שמור על המרפקים קרוב לגוף לאורך כל התנועה',
    'נצל את מלוא הטווח — יישור מלא בקצה החזרה',
  ],
  abs: [
    'שמור על נשימה רציפה — אל תעצור את האוויר',
    'רכז את הכיווץ בבטן, לא בכתפיים',
  ],
  core: [
    'שמור על נשימה רציפה — אל תעצור את האוויר',
    'רכז את הכיווץ בבטן, לא בכתפיים',
  ],
  obliques: [
    'התנועה מגיעה מהמותן, לא מהזרועות',
    'שמור על אגן יציב — תוריד את הקצב לטובת איכות',
  ],
  quads: [
    'הברכיים בקו אחד עם האצבעות — לא נכנסות פנימה',
    'הורד עד 90° לפחות, שמור על משקל באמצע כף הרגל',
  ],
  hamstrings: [
    'תהליך אקצנטרי איטי — 3 שניות בירידה',
    'שמור על גב ניטרלי, אגן נעול',
  ],
  glutes: [
    'דחוף דרך העקבים, לא דרך אצבעות',
    'נעל את האגן בנקודת השיא — סחיטה מלאה',
  ],
  calves: [
    'עלייה איטית, מתיחה מלאה למטה',
    'אל תקפיץ — תאים בכל חזרה',
  ],
  full_body: [
    'התחל בקצב מבוקר עד שאתה מרגיש את הטכניקה',
    'נשוף במאמץ, שאף בשלב הקל',
  ],
  legs: [
    'שמור על משקל באמצע כף הרגל לאורך כל החזרה',
    'אל תקרוס פנימה בברכיים — דחוף החוצה במכוון',
  ],
};

function deriveAutoCues(equipment: GymEquipment): string[] {
  const primary = equipment.muscleGroups?.[0];
  if (primary && AUTO_CUES_BY_MUSCLE[primary]) {
    return AUTO_CUES_BY_MUSCLE[primary];
  }
  return [
    'שמור על תנועה מבוקרת — אין צורך להאיץ',
    'רכז כל חזרה בשריר היעד, לא בתאוצה',
  ];
}

// ── Props ─────────────────────────────────────────────────────────

export interface EquipmentDetailDrawerProps {
  /** Whether the drawer is open. Driven by `ParkDetailSheet`. */
  isOpen: boolean;
  /** Close handler — typically the host's `setSelectedEquipment(null)`. */
  onClose: () => void;
  /**
   * `gym_equipment` doc id to load. The drawer fetches the document
   * itself rather than receiving a pre-fetched object so it stays
   * decoupled from any caller (and so the cache can be warmed at
   * drawer open without pre-loading every equipment doc on the host).
   */
  equipmentId: string | null;
  /**
   * Optional brand name the host wants pinned as the active hero.
   * Mirrors the `?brand=` query param the old route version used.
   * Falls through to index 0 when no match is found.
   */
  brandName?: string | null;
}

// ── Component ─────────────────────────────────────────────────────

export default function EquipmentDetailDrawer({
  isOpen,
  onClose,
  equipmentId,
  brandName,
}: EquipmentDetailDrawerProps) {
  // Portal mount guard so the drawer never renders during SSR.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const [equipment, setEquipment] = useState<GymEquipment | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeBrandIndex, setActiveBrandIndex] = useState(0);

  // Fetch the equipment doc when the drawer opens or the id changes.
  // We keep the previous data on screen during refetch so the drawer
  // doesn't flash the loader when the user switches between two
  // equipment cards in quick succession.
  useEffect(() => {
    if (!isOpen || !equipmentId) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getGymEquipment(equipmentId)
      .then((eq) => {
        if (cancelled) return;
        if (!eq) {
          setEquipment(null);
          setError('not-found');
          return;
        }
        setEquipment(eq);
        // Pin the requested brand (if any) — same logic the old
        // /equipment/[id] route used. Falls through to index 0 if
        // we can't find a match (e.g. case mismatch, stale brand
        // name, single-brand equipment).
        if (brandName && eq.brands?.length) {
          const idx = eq.brands.findIndex(
            (b) =>
              b.brandName?.toLowerCase().trim() ===
              brandName.toLowerCase().trim(),
          );
          setActiveBrandIndex(idx >= 0 ? idx : 0);
        } else {
          setActiveBrandIndex(0);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[EquipmentDetailDrawer] Load failed:', err);
        setError('load-failed');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, equipmentId, brandName]);

  // Reset state when the drawer closes so the next open starts clean.
  useEffect(() => {
    if (!isOpen) {
      // Clearing equipment here is intentional — keeping a stale doc
      // around would briefly render the wrong content if the user
      // re-opens the drawer for a different id before the network
      // response lands.
      const t = setTimeout(() => {
        setEquipment(null);
        setError(null);
      }, 300); // wait out the slide-down animation
      return () => clearTimeout(t);
    }
    return;
  }, [isOpen]);

  // Lock body scroll while the drawer is open. ParkDetailSheet
  // already locks it for itself, but we set our own lock too so the
  // drawer behaves correctly when used standalone in the future.
  useEffect(() => {
    if (!isOpen) return;
    if (typeof document === 'undefined') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  const activeBrand: EquipmentBrand | null = useMemo(() => {
    if (!equipment?.brands?.length) return null;
    return equipment.brands[activeBrandIndex] ?? equipment.brands[0] ?? null;
  }, [equipment, activeBrandIndex]);

  const videoEmbed = useMemo(
    () => parseVideoEmbed(activeBrand?.videoUrl),
    [activeBrand?.videoUrl],
  );

  const equipmentName = useMemo(
    () => resolveName(equipment?.name),
    [equipment?.name],
  );

  const primaryMuscle = equipment?.muscleGroups?.[0];
  const secondaryMuscles = useMemo(
    () => equipment?.muscleGroups?.slice(1) ?? [],
    [equipment?.muscleGroups],
  );

  const cues = useMemo(
    () => (equipment ? deriveAutoCues(equipment) : []),
    [equipment],
  );

  // ── Sheet body ───────────────────────────────────────────────────
  const sheet = (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop — z-[200] tier (nested-modal precedent set by
              the post-workout summary). Click anywhere outside the
              drawer to dismiss. */}
          <motion.div
            key="equipment-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-[200]"
          />

          <motion.div
            key="equipment-sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.25}
            onDragEnd={(_, info) => {
              if (info.offset.y > 140) onClose();
            }}
            className="fixed bottom-0 left-0 right-0 z-[201] bg-white dark:bg-slate-900 rounded-t-3xl shadow-drawer flex flex-col"
            style={{ maxHeight: '90vh' }}
            dir="rtl"
          >
            {/* Drag handle — same dimensions as ExerciseDetailSheet */}
            <div className="flex justify-center pt-2 pb-1 flex-shrink-0">
              <div className="w-10 h-1 rounded-full bg-gray-200 dark:bg-slate-700" />
            </div>

            {/* Close button */}
            <button
              type="button"
              onClick={onClose}
              aria-label="סגור"
              className="absolute top-3 left-3 p-2 text-gray-500 hover:text-gray-700 rounded-full bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm z-30 shadow-sm"
            >
              <X size={18} />
            </button>

            {/* Body — single scroll region (matches the lean exercise-sheet variant) */}
            <div className="flex-auto min-h-0 overflow-y-auto overscroll-contain">
              {loading && !equipment ? (
                <div className="min-h-[40vh] flex items-center justify-center">
                  <Loader2 size={28} className="animate-spin text-cyan-500" />
                </div>
              ) : error || !equipment ? (
                <div className="min-h-[40vh] flex flex-col items-center justify-center px-6 gap-3">
                  <AlertTriangle size={32} className="text-amber-500" />
                  <p className="text-sm font-bold text-gray-700 dark:text-gray-200 text-center">
                    {error === 'not-found'
                      ? 'המתקן לא נמצא'
                      : 'אירעה שגיאה בטעינת המתקן'}
                  </p>
                </div>
              ) : (
                <>
                  {/* Hero — brand image with graceful fallback chain
                      (brand image → equipment SVG icon → Dumbbell glyph).
                      Aspect-ratio fixed so the drawer never jumps when
                      the user switches between brands with different
                      photo dimensions. */}
                  <div
                    className="relative w-full bg-gray-100 dark:bg-slate-800"
                    style={{ aspectRatio: '4 / 3' }}
                  >
                    {activeBrand?.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={activeBrand.imageUrl}
                        alt={equipmentName}
                        className="absolute inset-0 w-full h-full object-cover"
                        loading="lazy"
                        decoding="async"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        {equipment.iconKey ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`/assets/icons/equipment/${equipment.iconKey}.svg`}
                            alt={equipmentName}
                            className="w-24 h-24 object-contain opacity-80"
                          />
                        ) : (
                          <Dumbbell
                            size={64}
                            className="text-gray-300 dark:text-slate-600"
                          />
                        )}
                      </div>
                    )}
                  </div>

                  {/* Title block + content sections */}
                  <div className="px-5 pt-5 pb-12">
                    {/* Title + brand line */}
                    <div className="mb-4">
                      <h1
                        className="text-[20px] font-bold text-gray-900 dark:text-white leading-snug"
                        style={SECTION_FONT}
                      >
                        {equipmentName}
                      </h1>
                      {activeBrand?.brandName && (
                        <p
                          className="mt-1 text-sm text-gray-500 dark:text-gray-400"
                          style={SECTION_FONT}
                        >
                          מותג:{' '}
                          <span className="font-bold text-gray-700 dark:text-gray-200">
                            {activeBrand.brandName}
                          </span>
                        </p>
                      )}
                    </div>

                    {/* Quick-meta pill row — level + functional flag */}
                    <div className="flex flex-wrap gap-2 mb-6">
                      {typeof equipment.recommendedLevel === 'number' && (
                        <span
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300"
                          style={{
                            border:
                              '1px solid rgba(8, 145, 178, 0.2)',
                          }}
                        >
                          רמה מומלצת {equipment.recommendedLevel}
                        </span>
                      )}
                      {equipment.isFunctional && (
                        <span
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
                          style={{
                            border:
                              '1px solid rgba(16, 185, 129, 0.2)',
                          }}
                        >
                          ציוד פונקציונלי
                        </span>
                      )}
                    </div>

                    {/* Primary muscle (mirrors שריר ראשי block in ExerciseDetailSheet) */}
                    {primaryMuscle && (
                      <section className="mb-6">
                        <h3
                          className="text-right text-[16px] font-semibold mb-3"
                          style={SECTION_FONT}
                        >
                          שריר ראשי
                        </h3>
                        <div className="flex items-center gap-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={
                              MUSCLE_ICON_PATHS[primaryMuscle] ??
                              '/icons/programs/muscle.svg'
                            }
                            alt=""
                            width={36}
                            height={36}
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                          <span
                            className="text-sm font-normal text-gray-800 dark:text-gray-200"
                            style={SECTION_FONT}
                          >
                            {getMuscleGroupLabel(primaryMuscle)}
                          </span>
                        </div>
                      </section>
                    )}

                    {/* Secondary muscles */}
                    {secondaryMuscles.length > 0 && (
                      <section className="mb-6">
                        <h3
                          className="text-right text-[16px] font-semibold mb-3"
                          style={SECTION_FONT}
                        >
                          שרירים משניים
                        </h3>
                        <div className="flex flex-wrap gap-x-6 gap-y-3">
                          {secondaryMuscles.map((m) => (
                            <div
                              key={m}
                              className="flex-shrink-0 flex items-center gap-2"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={
                                  MUSCLE_ICON_PATHS[m] ??
                                  '/icons/programs/muscle.svg'
                                }
                                alt=""
                                width={36}
                                height={36}
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                              <span
                                className="text-sm font-normal text-gray-800 dark:text-gray-200"
                                style={SECTION_FONT}
                              >
                                {getMuscleGroupLabel(m)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}

                    {/* Cues / דגשים — numbered cyan circles, matching
                        the exercise drawer exactly. Falls back to
                        muscle-derived auto-cues when the doc has no
                        explicit field (the admin form doesn't expose
                        one yet). */}
                    {cues.length > 0 && (
                      <section className="mb-6">
                        <h3
                          className="text-right text-[16px] font-semibold mb-3"
                          style={SECTION_FONT}
                        >
                          דגשים
                        </h3>
                        <ol className="space-y-2.5">
                          {cues.map((cue, i) => (
                            <li
                              key={`${cue}_${i}`}
                              className="flex gap-3 items-start"
                            >
                              <span className="flex-shrink-0 w-6 h-6 rounded-full text-white text-xs font-bold flex items-center justify-center bg-cyan-500">
                                {i + 1}
                              </span>
                              <span
                                className="text-sm text-slate-700 dark:text-slate-300 flex-1 leading-relaxed"
                                style={SECTION_FONT}
                              >
                                {cue}
                              </span>
                            </li>
                          ))}
                        </ol>
                      </section>
                    )}

                    {/* Goal-style summary card when the equipment doc
                        also has a description-like text. We don't yet
                        store one, but if/when the admin form adds it
                        this section will surface it without further
                        component changes. The render is gated by the
                        existence of the field so the drawer doesn't
                        show an empty card today. */}
                    {(equipment as any).description && (
                      <section className="mb-6">
                        <h3
                          className="text-right text-[16px] font-semibold mb-3"
                          style={SECTION_FONT}
                        >
                          תיאור
                        </h3>
                        <div
                          className="flex items-start gap-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl p-4"
                          style={{ border: PILL_BORDER }}
                        >
                          <Target
                            size={18}
                            className="flex-shrink-0 mt-0.5 text-cyan-600"
                          />
                          <p
                            className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed"
                            style={SECTION_FONT}
                          >
                            {(equipment as any).description}
                          </p>
                        </div>
                      </section>
                    )}

                    {/* Video embed — YouTube / Vimeo. Only rendered
                        when the active brand carries a `videoUrl`. */}
                    {activeBrand?.videoUrl && (
                      <section className="mb-6">
                        <h3
                          className="text-right text-[16px] font-semibold mb-3 flex items-center gap-1.5"
                          style={SECTION_FONT}
                        >
                          <VideoIcon size={16} className="text-cyan-500" />
                          סרטון הדגמה
                        </h3>
                        {videoEmbed ? (
                          <div
                            className="relative w-full overflow-hidden rounded-2xl bg-black"
                            style={{ aspectRatio: '16 / 9' }}
                          >
                            <iframe
                              src={videoEmbed.src}
                              className="absolute inset-0 w-full h-full"
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                              allowFullScreen
                              title={`${equipmentName} demo video`}
                            />
                          </div>
                        ) : (
                          <a
                            href={activeBrand.videoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-sm font-bold text-center"
                          >
                            פתח סרטון בחלון חיצוני
                          </a>
                        )}
                      </section>
                    )}

                    {/* Brand selector — only when more than one brand
                        is registered for this equipment. Tapping a
                        chip swaps the hero image + the video preview. */}
                    {equipment.brands && equipment.brands.length > 1 && (
                      <section className="mb-6">
                        <h3
                          className="text-right text-[16px] font-semibold mb-3"
                          style={SECTION_FONT}
                        >
                          מותגים זמינים
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {equipment.brands.map((b, i) => {
                            const isActive = i === activeBrandIndex;
                            return (
                              <button
                                key={`${b.brandName}_${i}`}
                                type="button"
                                onClick={() => setActiveBrandIndex(i)}
                                className={`flex items-center gap-2 px-3 py-2 rounded-full transition-colors ${
                                  isActive
                                    ? 'bg-cyan-500 text-white shadow-sm'
                                    : 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-200'
                                }`}
                              >
                                {b.imageUrl && (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={b.imageUrl}
                                    alt=""
                                    className="w-5 h-5 rounded-full object-cover bg-white"
                                    onError={(e) => {
                                      (
                                        e.currentTarget as HTMLImageElement
                                      ).style.display = 'none';
                                    }}
                                  />
                                )}
                                <span className="text-xs font-bold">
                                  {b.brandName || `מותג ${i + 1}`}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    )}
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  if (!mounted) return null;
  return createPortal(sheet, document.body);
}
