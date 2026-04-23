'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Target, Dumbbell, PersonStanding } from 'lucide-react';
import { getMuscleGroupLabel, resolveEquipmentLabel, resolveEquipmentSvgPathList } from '@/features/workout-engine/shared/utils/gear-mapping.utils';
import { useCachedMediaUrl } from '@/features/favorites/hooks/useCachedMedia';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

const OFFLINE_PLACEHOLDER = '/images/park-placeholder.svg';

const PILL_BORDER = '0.5px solid #E0E9FF';
const SECTION_FONT = { fontFamily: 'var(--font-simpler)' } as const;
const WHITE_FADE = 'linear-gradient(to top, white 0%, white 15%, rgba(255,255,255,0.4) 40%, transparent 100%)';

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

function extractYouTubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=))([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

export interface ProgramRef {
  name: string;
  level: number;
}

export interface ExerciseDetailContentProps {
  exerciseName: string;
  videoUrl: string | null;
  /** Poster/thumbnail image shown while video loads */
  posterUrl?: string | null;
  youtubeUrl?: string | null;
  /** @deprecated Use `programs` array instead */
  programName?: string | null;
  /** @deprecated Use `programs` array instead */
  programLevel?: number | null;
  /** Multi-program support: list of resolved programs with levels */
  programs?: ProgramRef[];
  equipment?: string[];
  /** Workout location for location-aware equipment icons (park/home/gym) */
  workoutLocation?: string | null;
  /** Primary muscle (rendered with full cyan icon) */
  primaryMuscle?: string | null;
  /** Secondary muscles (rendered with desaturated grey icons) */
  secondaryMuscles?: string[];
  /** @deprecated Use primaryMuscle + secondaryMuscles instead */
  muscleGroups?: string[];
  cues?: string[];
  goal?: string | null;
  /** Free-text description of the exercise */
  description?: string | null;
  /** Step-by-step instructions for performing the exercise */
  instructions?: string | null;
  /** Additional notes / tips */
  notes?: string[];
  hideHeroVideo?: boolean;
  hideTitle?: boolean;
}

export default function ExerciseDetailContent({
  exerciseName,
  videoUrl,
  posterUrl,
  youtubeUrl,
  programName,
  programLevel,
  programs,
  equipment,
  workoutLocation,
  primaryMuscle,
  secondaryMuscles,
  muscleGroups,
  cues,
  goal,
  description,
  instructions,
  notes,
  hideHeroVideo = false,
  hideTitle = false,
}: ExerciseDetailContentProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ytLoaded, setYtLoaded] = useState(false);
  const [videoReady, setVideoReady] = useState(false);

  const isOnline = useOnlineStatus();

  // Offline-cached media resolution
  const rawCachedVideoUrl = useCachedMediaUrl(videoUrl);
  const rawCachedPosterUrl = useCachedMediaUrl(posterUrl);

  const cachedVideoUrl = rawCachedVideoUrl?.startsWith('blob:') ? rawCachedVideoUrl
    : isOnline ? rawCachedVideoUrl : null;
  const cachedPosterUrl = rawCachedPosterUrl?.startsWith('blob:') ? rawCachedPosterUrl
    : isOnline ? rawCachedPosterUrl : OFFLINE_PLACEHOLDER;

  const handleVideoLoaded = useCallback(() => {
    setVideoReady(true);
  }, []);

  useEffect(() => {
    setVideoReady(false);
    if (videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  }, [cachedVideoUrl]);

  const ytId = youtubeUrl ? extractYouTubeId(youtubeUrl) : null;
  const hasEquipment = equipment && equipment.length > 0;
  const hasCues = cues && cues.length > 0;
  const hasNotes = notes && notes.length > 0;

  const resolvedPrograms: ProgramRef[] = programs && programs.length > 0
    ? programs
    : programName
      ? [{ name: programName, level: programLevel ?? 1 }]
      : [];
  const hasPrograms = resolvedPrograms.length > 0;
  const hasPills = hasPrograms || hasEquipment;

  const resolvedPrimary = primaryMuscle || (muscleGroups && muscleGroups.length > 0 ? muscleGroups[0] : null);
  const resolvedSecondary = secondaryMuscles && secondaryMuscles.length > 0
    ? secondaryMuscles
    : (muscleGroups && muscleGroups.length > 1 ? muscleGroups.slice(1) : []);
  const hasMuscles = !!resolvedPrimary || resolvedSecondary.length > 0;

  return (
    <div dir="rtl">
      {/* ── Hero Video — poster-first loading, white fade to content ── */}
      {!hideHeroVideo && (
        <div className="relative w-full aspect-video bg-slate-900 overflow-hidden m-0 p-0">
          {/* Poster thumbnail — always rendered as base layer */}
          {cachedPosterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cachedPosterUrl}
              alt={exerciseName}
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${videoReady ? 'opacity-0' : 'opacity-100'}`}
              onError={(e) => { (e.target as HTMLImageElement).src = OFFLINE_PLACEHOLDER; }}
            />
          ) : !cachedVideoUrl ? (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
              <Dumbbell size={48} className="text-slate-600" />
            </div>
          ) : null}

          {/* Video — fades in once loaded */}
          {cachedVideoUrl && (
            <video
              ref={videoRef}
              src={cachedVideoUrl}
              autoPlay
              loop
              muted
              playsInline
              onLoadedData={handleVideoLoaded}
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${videoReady ? 'opacity-100' : 'opacity-0'}`}
            />
          )}

          {/* White fade — video melts seamlessly into the white content sheet */}
          <div
            className="absolute bottom-0 inset-x-0 h-[85%] pointer-events-none"
            style={{ background: WHITE_FADE }}
          />

          {/* Exercise name — sits inside the solid-white zone of the fade */}
          <div className="absolute bottom-0 inset-x-0 z-10 px-4 pb-2">
            <h2
              className="text-[20px] font-bold text-gray-900 dark:text-white text-right leading-snug"
              style={SECTION_FONT}
            >
              {exerciseName}
            </h2>
          </div>
        </div>
      )}

      {/* ── White content area ── */}
      <div className="bg-white dark:bg-slate-900 px-4 pt-4 pb-12">
        {/* Exercise Title — only when hero is hidden (StrengthRunner already shows it in the card header) */}
        {hideHeroVideo && !hideTitle && (
          <h2
            className="text-[20px] font-bold text-gray-900 dark:text-white text-right mb-4"
            style={SECTION_FONT}
          >
            {exerciseName}
          </h2>
        )}

        {/* ── YouTube Technical Video — directly below title ── */}
        {ytId && (
          <section style={{ marginBottom: 16 }}>
            <h3 className="text-right text-[16px] font-semibold mb-3" style={SECTION_FONT}>
              סרטון טכניקה מפורט
            </h3>
            <div className="relative w-full rounded-lg overflow-hidden bg-black" style={{ aspectRatio: '16 / 9' }}>
              {ytLoaded ? (
                <iframe
                  src={`https://www.youtube.com/embed/${ytId}?rel=0&modestbranding=1`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="absolute inset-0 w-full h-full"
                />
              ) : (
                <button
                  onClick={() => setYtLoaded(true)}
                  className="absolute inset-0 w-full h-full"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://img.youtube.com/vi/${ytId}/hqdefault.jpg`}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/30" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center shadow-xl">
                      <svg viewBox="0 0 24 24" fill="white" width="32" height="32"><polygon points="9.5,7.5 16.5,12 9.5,16.5" /></svg>
                    </div>
                  </div>
                </button>
              )}
            </div>
          </section>
        )}

        {/* ── Metadata Pills — 30px Hug ── */}
        {hasPills && (
          <div style={{ marginBottom: 16 }}>
            <div className="flex flex-wrap gap-3 w-full" style={{ maxWidth: 358 }}>
              {/* תוכניות (Programs) — each program shows name + level */}
              {hasPrograms && (
                <div className="flex flex-col gap-1.5" style={{ minWidth: 100 }}>
                  <h4 className="text-right text-[16px] font-semibold text-gray-900 dark:text-white" style={SECTION_FONT}>
                    {resolvedPrograms.length > 1 ? 'תוכניות' : 'תוכנית'}
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {resolvedPrograms.map((p, idx) => (
                      <div
                        key={idx}
                        className="flex-shrink-0 flex items-center gap-2 bg-white dark:bg-slate-800/90 shadow-sm rounded-lg px-3"
                        style={{ border: PILL_BORDER, height: 30 }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/icons/programs/full_body.svg" alt="" width={16} height={16} className="flex-shrink-0 opacity-60" />
                        <span className="text-xs font-normal text-gray-800 dark:text-gray-100 whitespace-nowrap">
                          {p.name} · רמה {p.level}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ציוד (Equipment) — hidden when empty */}
              {hasEquipment && (
                <div className="flex flex-col gap-1.5" style={{ minWidth: 80 }}>
                  <h4 className="text-right text-[16px] font-semibold text-gray-900 dark:text-white" style={SECTION_FONT}>ציוד</h4>
                  <div className="flex flex-wrap gap-2">
                    {equipment!.map((eqId) => {
                      const label = resolveEquipmentLabel(eqId);
                      const svgPaths = resolveEquipmentSvgPathList(eqId, workoutLocation);
                      const iconSrc = svgPaths[0] ?? null;
                      return (
                        <div
                          key={eqId}
                          className="flex-shrink-0 flex items-center gap-2 bg-white dark:bg-slate-800/90 shadow-sm rounded-lg px-3"
                          style={{ border: PILL_BORDER, height: 30 }}
                        >
                          {iconSrc ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={iconSrc}
                              alt=""
                              width={16}
                              height={16}
                              className="object-contain"
                              onError={(e) => {
                                const img = e.currentTarget as HTMLImageElement;
                                img.removeAttribute('src');
                                img.style.display = 'none';
                              }}
                            />
                          ) : (
                            <PersonStanding size={16} className="text-slate-400 flex-shrink-0" />
                          )}
                          <span className="text-xs font-normal text-gray-800 dark:text-gray-100 whitespace-nowrap">{label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Muscles — Primary vs Secondary, original icon colors, 36px ── */}
        {hasMuscles && (
          <section className="mb-6">
            {/* Primary Muscle — original asset color, 36px */}
            {resolvedPrimary && (
              <div style={{ marginBottom: resolvedSecondary.length > 0 ? 12 : 0 }}>
                <h3 className="text-right text-[16px] font-semibold mb-3" style={SECTION_FONT}>
                  שריר ראשי
                </h3>
                <div className="flex flex-wrap gap-2">
                  {(() => {
                    const label = getMuscleGroupLabel(resolvedPrimary);
                    const iconSrc = MUSCLE_ICON_PATHS[resolvedPrimary] || '/icons/programs/muscle.svg';
                    return (
                      <div className="flex-shrink-0 flex items-center gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={iconSrc} alt="" width={36} height={36} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        <span className="text-sm font-normal text-gray-800 dark:text-gray-200">{label}</span>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* Secondary Muscles — original asset color, 36px, font-normal */}
            {resolvedSecondary.length > 0 && (
              <div>
                <h3 className="text-right text-[16px] font-semibold mb-3" style={SECTION_FONT}>
                  שרירים משניים
                </h3>
                <div className="flex flex-wrap gap-2">
                  {resolvedSecondary.map((m) => {
                    const label = getMuscleGroupLabel(m);
                    const iconSrc = MUSCLE_ICON_PATHS[m] || '/icons/programs/muscle.svg';
                    return (
                      <div key={m} className="flex-shrink-0 flex items-center gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={iconSrc} alt="" width={36} height={36} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        <span className="text-sm font-normal text-gray-800 dark:text-gray-200">{label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        )}

        {/* ── Description (תיאור) ── */}
        {description && (
          <section className="mb-6">
            <h3 className="text-right text-[16px] font-semibold mb-3" style={SECTION_FONT}>
              תיאור
            </h3>
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed" style={SECTION_FONT}>
              {description}
            </p>
          </section>
        )}

        {/* ── Goal (מטרות) ── */}
        {goal && (
          <section className="mb-6">
            <h3 className="text-right text-[16px] font-semibold mb-3" style={SECTION_FONT}>
              מטרות
            </h3>
            <div className="flex items-start gap-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4" style={{ border: PILL_BORDER }}>
              <Target size={18} className="flex-shrink-0 mt-0.5 text-cyan-600" />
              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed" style={SECTION_FONT}>
                {goal}
              </p>
            </div>
          </section>
        )}

        {/* ── Instructions (הוראות ביצוע) ── */}
        {instructions && (
          <section className="mb-6">
            <h3 className="text-right text-[16px] font-semibold mb-3" style={SECTION_FONT}>
              הוראות ביצוע
            </h3>
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line" style={SECTION_FONT}>
              {instructions}
            </p>
          </section>
        )}

        {/* ── Cues (דגשים) ── */}
        {hasCues && (
          <section className="mb-6">
            <h3 className="text-right text-[16px] font-semibold mb-3" style={SECTION_FONT}>
              דגשים
            </h3>
            <ol className="space-y-2.5">
              {cues!.map((cue, i) => (
                <li key={i} className="flex gap-3 items-start">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full text-white text-xs font-bold flex items-center justify-center bg-cyan-500">
                    {i + 1}
                  </span>
                  <span className="text-sm text-slate-700 dark:text-slate-300 flex-1 leading-relaxed" style={SECTION_FONT}>
                    {cue}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* ── Notes (טיפים) ── */}
        {hasNotes && (
          <section className="mb-6">
            <h3 className="text-right text-[16px] font-semibold mb-3" style={SECTION_FONT}>
              טיפים
            </h3>
            <ul className="space-y-2">
              {notes!.map((note, i) => (
                <li key={i} className="flex gap-2 items-start">
                  <span className="flex-shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  <span className="text-sm text-slate-600 dark:text-slate-400 flex-1 leading-relaxed" style={SECTION_FONT}>
                    {note}
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
