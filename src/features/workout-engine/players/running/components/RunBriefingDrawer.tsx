'use client';

import React, { useMemo, useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { Play, X, MapPin, ArrowRight } from 'lucide-react';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { useRunningConfigStore } from '@/features/workout-engine/core/store/useRunningConfigStore';
import { computeZones, formatPaceSeconds } from '@/features/workout-engine/core/services/running-engine.service';
import { useNearbyParks, PARK_FALLBACK_IMAGE } from '@/features/parks/core/hooks/useNearbyParks';
import ExerciseDetailContent from '@/features/workout-engine/players/strength/components/ExerciseDetailContent';
import RunBlockBriefingCard from './RunBlockBriefingCard';
import type RunWorkout from '../types/run-workout.type';
import type { RunBlock } from '../types/run-block.type';
import type { RunZoneType, RunnerProfileType } from '@/features/workout-engine/core/types/running.types';

const DRAWER_HEIGHT = '95vh';
const CLOSE_THRESHOLD = 200;
const PILL_BORDER = '0.5px solid #E0E9FF';
const HERO_FALLBACK = '/images/park-placeholder.svg';
const BOLT_FILTER_CYAN = 'brightness(0) saturate(100%) invert(68%) sepia(65%) saturate(2000%) hue-rotate(160deg) brightness(102%) contrast(101%)';
const BOLT_FILTER_DARK = 'brightness(0) saturate(100%) invert(22%) sepia(10%) saturate(750%) hue-rotate(176deg) brightness(95%) contrast(90%)';
const DIFF_LABELS: Record<number, string> = { 1: 'קל', 2: 'בינוני', 3: 'קשה' };

// ── Intensity rank mapping ──

const ZONE_INTENSITY_RANK: Record<RunZoneType, number> = {
  walk: 1, jogging: 1.5, recovery: 2, easy: 2.5, long_run: 2.5,
  fartlek_medium: 3.5, tempo: 4, fartlek_fast: 4,
  interval_long: 4.5, interval_short: 5, sprint: 5,
};
const EFFORT_RANK: Record<string, number> = { moderate: 3, hard: 4, max: 5 };

function getBlockIntensityRank(block: RunBlock): number {
  if (block.zoneType) return ZONE_INTENSITY_RANK[block.zoneType] ?? 2;
  if (block.effortConfig?.effortLevel) return EFFORT_RANK[block.effortConfig.effortLevel] ?? 3;
  return 2;
}

function rankToHeightPercent(rank: number): number {
  return 30 + ((Math.min(Math.max(rank, 1), 5) - 1) / 4) * 70;
}

function getDifficultyLevel(blocks: RunBlock[]): number {
  const avgRank = blocks.reduce((s, b) => s + getBlockIntensityRank(b), 0) / (blocks.length || 1);
  if (avgRank >= 3.5) return 3;
  if (avgRank >= 2.5) return 2;
  return 1;
}

// ── Section grouping ──

interface BriefingSection {
  title: string;
  laps?: number;
  blocks: { block: RunBlock; originalIndex: number }[];
}

function isStrideBlock(block: RunBlock): boolean {
  return !!block._isDynamicWrapper && block.type === 'run' && block.blockMode === 'effort' && block.label.includes('סטריידס');
}

function groupBlocksIntoSections(workout: RunWorkout): BriefingSection[] {
  const warmupSection: BriefingSection = { title: 'חימום', blocks: [] };
  const cooldownSection: BriefingSection = { title: 'מתיחות', blocks: [] };
  const middleSections: BriefingSection[] = [];
  const { blocks } = workout;
  let i = 0;

  while (i < blocks.length) {
    const block = blocks[i];

    // 1. Cooldown — always last, check BEFORE _isDynamicWrapper
    if (block.type === 'cooldown') {
      cooldownSection.blocks.push({ block, originalIndex: i });
      i++;
      continue;
    }

    // 2. Strides — group like intervals (work+rest with lap count)
    if (isStrideBlock(block)) {
      const workBlock = block;
      let lapCount = 1;
      let j = i + 1;

      while (j < blocks.length) {
        const next = blocks[j];
        if (next._isSynthesizedRest || next.type === 'walk' || next.type === 'recovery') {
          j++;
          if (j < blocks.length && isStrideBlock(blocks[j])) {
            lapCount++;
            j++;
            continue;
          }
          break;
        }
        if (isStrideBlock(next)) {
          lapCount++;
          j++;
          continue;
        }
        break;
      }

      const uniqueBlocks: { block: RunBlock; originalIndex: number }[] = [{ block: workBlock, originalIndex: i }];
      const firstRest = blocks.slice(i + 1, j).find(b => b._isSynthesizedRest || b.type === 'walk' || b.type === 'recovery');
      if (firstRest) {
        const restIdx = blocks.indexOf(firstRest);
        uniqueBlocks.push({ block: firstRest, originalIndex: restIdx });
      }

      middleSections.push({ title: 'מתגברות', laps: lapCount, blocks: uniqueBlocks });
      i = j;
      continue;
    }

    // 3. Warmup (pure warmup or dynamic wrapper that ISN'T strides/cooldown)
    if (block.type === 'warmup' || (block._isDynamicWrapper && block.type !== 'run')) {
      warmupSection.blocks.push({ block, originalIndex: i });
      i++;
      continue;
    }

    // 4. Interval / run pattern grouping
    if (block.type === 'interval' || block.type === 'run') {
      const isIntervalZone = block.zoneType && ['interval_short', 'interval_long', 'sprint', 'fartlek_fast', 'fartlek_medium', 'tempo'].includes(block.zoneType);

      if (isIntervalZone || block.type === 'interval') {
        const workBlock = block;
        let lapCount = 1;
        let j = i + 1;

        while (j < blocks.length) {
          const nextBlock = blocks[j];
          if (nextBlock._isSynthesizedRest || nextBlock.type === 'recovery' || nextBlock.type === 'walk') {
            j++;
            if (j < blocks.length) {
              const afterRest = blocks[j];
              const sameWork =
                afterRest.type === workBlock.type &&
                afterRest.zoneType === workBlock.zoneType &&
                afterRest.durationSeconds === workBlock.durationSeconds &&
                afterRest.distanceMeters === workBlock.distanceMeters;
              if (sameWork) { lapCount++; j++; continue; }
            }
            break;
          }
          const sameWork =
            nextBlock.type === workBlock.type &&
            nextBlock.zoneType === workBlock.zoneType &&
            nextBlock.durationSeconds === workBlock.durationSeconds &&
            nextBlock.distanceMeters === workBlock.distanceMeters;
          if (sameWork) { lapCount++; j++; continue; }
          break;
        }

        const uniqueBlocks: { block: RunBlock; originalIndex: number }[] = [{ block: workBlock, originalIndex: i }];
        const restBlock = blocks.slice(i + 1, j).find(b => b._isSynthesizedRest || b.type === 'recovery' || b.type === 'walk');
        if (restBlock) {
          const restIdx = blocks.indexOf(restBlock);
          uniqueBlocks.push({ block: restBlock, originalIndex: restIdx });
        }

        middleSections.push({
          title: workBlock.label || 'אינטרוולים',
          laps: lapCount > 1 ? lapCount : undefined,
          blocks: uniqueBlocks,
        });
        i = j;
        continue;
      }
    }

    // 5. Default standalone
    middleSections.push({
      title: block.label,
      blocks: [{ block, originalIndex: i }],
    });
    i++;
  }

  const result: BriefingSection[] = [];
  if (warmupSection.blocks.length > 0) result.push(warmupSection);
  result.push(...middleSections);
  if (cooldownSection.blocks.length > 0) result.push(cooldownSection);
  return result;
}

// ── Surface cards ──

const SURFACE_CARDS = [
  { id: 'track', label: 'מסלול ריצה', icon: '🏟️', tip: 'מדויק לפי קילומטר, מושלם לאינטרוולים', color: '#00BAF7' },
  { id: 'trail', label: 'שביל טבע',  icon: '🌲', tip: 'עדין על המפרקים, אידיאלי לריצות שחרור',  color: '#10B981' },
  { id: 'road',  label: 'סטוריית ת"א', icon: '🛣️', tip: 'מהיר וזורם, מצוין לריצות ארוכות', color: '#F59E0B' },
] as const;

// ── Bolt icon (matches Strength drawer) ──

function BoltIcon({ filled }: { filled: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/icons/ui/Bolt.svg" alt="" width={14} height={14}
      style={{ filter: filled ? BOLT_FILTER_CYAN : BOLT_FILTER_DARK }}
    />
  );
}

// ── Component ──

interface RunBriefingDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onGo: () => void;
  workout: RunWorkout | null;
  isLoading?: boolean;
}

export default function RunBriefingDrawer({
  isOpen, onClose, onGo, workout, isLoading,
}: RunBriefingDrawerProps) {
  const profile = useUserStore((s) => s.profile);
  const config = useRunningConfigStore((s) => s.config);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollY, setScrollY] = useState(0);

  const y = useMotionValue(0);
  const opacity = useTransform(y, [0, 300], [1, 0]);

  const paceProfile = profile?.running?.paceProfile;
  const basePace = paceProfile?.basePace ?? 0;
  const profileType: RunnerProfileType = paceProfile?.profileType ?? 3;
  const showNumbers = profileType !== 3;

  const zones = useMemo(() => {
    if (basePace <= 0) return null;
    return computeZones(basePace, profileType, config);
  }, [basePace, profileType, config]);

  const totalDuration = useMemo(
    () => workout?.blocks.reduce((s, b) => s + (b.durationSeconds ?? 0), 0) ?? 0,
    [workout],
  );

  const diffLevel = useMemo(
    () => workout ? getDifficultyLevel(workout.blocks) : 2,
    [workout],
  );

  const sections = useMemo(
    () => workout ? groupBlocksIntoSections(workout) : [],
    [workout],
  );

  const nearbyParks = useNearbyParks(isOpen);
  const [activeDrillBlock, setActiveDrillBlock] = useState<RunBlock | null>(null);

  const handleDragEnd = (_: unknown, info: { offset: { y: number }; velocity: { y: number } }) => {
    if (info.offset.y > CLOSE_THRESHOLD || info.velocity.y > 500) onClose();
  };

  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !isOpen) return;
    const handleScroll = () => setScrollY(el.scrollTop);
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [isOpen]);

  function getPaceLabel(block: RunBlock): string {
    if (!showNumbers || basePace <= 0) return '';
    if (block.zoneType && zones) {
      const z = zones[block.zoneType];
      return `${formatPaceSeconds(z.minPace)}–${formatPaceSeconds(z.maxPace)}`;
    }
    if (block.targetPacePercentage) {
      const min = Math.round(basePace * block.targetPacePercentage.min / 100);
      const max = Math.round(basePace * block.targetPacePercentage.max / 100);
      return `${formatPaceSeconds(min)}–${formatPaceSeconds(max)}`;
    }
    return '';
  }

  function getMetaLabel(block: RunBlock): string {
    if (block.durationSeconds) return fmtBlockDur(block.durationSeconds);
    if (block.distanceMeters) return fmtBlockDist(block.distanceMeters);
    return '';
  }

  const heroBaseHeight = 240;
  const dynamicHeight = Math.max(0, heroBaseHeight - scrollY * 0.8);
  const imageOpacity = Math.max(0, 1 - scrollY / 180);
  const headerOpacity = Math.min(1, (scrollY - 120) / 60);

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={onClose}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100]"
            />

            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={0.2}
              onDragEnd={handleDragEnd}
              transition={{ type: 'spring', damping: 40, stiffness: 260, mass: 0.8 }}
              style={{ y, opacity, height: DRAWER_HEIGHT, maxHeight: '95vh', fontFamily: 'var(--font-simpler)', willChange: 'transform' }}
              className="fixed bottom-0 left-0 right-0 z-[100] bg-white rounded-t-[32px] shadow-2xl overflow-hidden"
              dir="rtl"
            >
              {/* Drag Handle */}
              <div className="absolute top-0 left-0 right-0 z-[60] flex justify-center pt-3 pb-1 pointer-events-none">
                <div className="w-10 h-1.5 rounded-full bg-gray-300" />
              </div>

              {/* Sticky header on scroll */}
              <div
                className={`absolute top-0 left-0 right-0 z-50 bg-white border-b border-gray-200 transition-opacity duration-300 ${
                  headerOpacity > 0 ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
                style={{ opacity: headerOpacity }}
              >
                <div className="flex items-center justify-between px-4 pt-10 pb-3">
                  <button onClick={onClose}
                    className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                  ><X size={20} className="text-gray-700" /></button>
                  <h1 className="text-lg font-black text-gray-900 flex-1 text-center px-4">{workout?.title}</h1>
                  <div className="w-10" />
                </div>
              </div>

              {/* Scrollable content */}
              <div ref={scrollRef} className="h-full overflow-y-auto pb-36">
                {isLoading || !workout ? (
                  <div className="flex flex-col items-center justify-center py-32 gap-3">
                    <div className="w-8 h-8 border-[3px] border-[#00BAF7] border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm font-bold text-gray-400">טוען אימון...</span>
                  </div>
                ) : (
                  <>
                    {/* ── Hero Image (matches Strength drawer) ── */}
                    <div
                      className="relative w-full overflow-hidden transition-all duration-300"
                      style={{ height: `${dynamicHeight}px`, opacity: imageOpacity }}
                    >
                      <img src={HERO_FALLBACK} alt={workout.title}
                        className="absolute inset-0 w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                      <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/25 to-transparent pointer-events-none" />
                      <div className="absolute bottom-0 inset-x-0 h-[85%] pointer-events-none"
                        style={{ background: 'linear-gradient(to top, white 15%, rgba(255,255,255,0.6) 50%, transparent 100%)' }}
                      />
                      <div className={`absolute top-0 left-0 right-0 p-4 pt-14 flex justify-between items-start z-10 transition-opacity duration-300 ${imageOpacity > 0.5 ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                        <button onClick={onClose}
                          className="w-10 h-10 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center shadow-lg text-white active:scale-90 transition-transform"
                        ><X size={20} /></button>
                        <div className="w-10" />
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 p-6 z-10">
                        <h1 className="text-[20px] font-bold text-gray-900 leading-snug">{workout.title}</h1>
                      </div>
                    </div>

                    {/* ── Content ── */}
                    <div className="bg-white -mt-12 relative z-10 px-4 pt-4 pb-8">

                      {/* ── Metadata pills (exact Strength parity) ── */}
                      <div className="flex items-center gap-3 flex-wrap mb-4" dir="rtl">
                        {/* Difficulty pill — 3 bolt icons */}
                        <div className="flex-shrink-0 flex items-center gap-2 bg-white shadow-sm rounded-lg px-4 py-2"
                          style={{ border: PILL_BORDER }} dir="rtl"
                        >
                          <div className="flex items-center gap-0.5">
                            {[1, 2, 3].map((n) => (
                              <BoltIcon key={n} filled={n <= diffLevel} />
                            ))}
                          </div>
                          <span className="text-sm font-normal text-gray-800">{DIFF_LABELS[diffLevel] || ''}</span>
                        </div>

                        {/* Duration pill — same SVG clock as Strength */}
                        {totalDuration > 0 && (
                          <div className="flex-shrink-0 flex items-center gap-2 bg-white shadow-sm rounded-lg px-4 py-2"
                            style={{ border: PILL_BORDER }} dir="rtl"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 flex-shrink-0">
                              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                            </svg>
                            <span className="text-sm font-normal text-gray-800">{fmtDuration(totalDuration)}</span>
                          </div>
                        )}

                        {workout.isQualityWorkout && (
                          <div className="flex-shrink-0 flex items-center gap-2 bg-emerald-50 shadow-sm rounded-lg px-4 py-2"
                            style={{ border: PILL_BORDER }}
                          >
                            <span className="text-sm font-bold text-emerald-600">אימון איכות</span>
                          </div>
                        )}
                      </div>

                      {/* ── Description (logicCue > description, matches Strength typography) ── */}
                      {(workout.logicCue || workout.description) && (
                        <section className="mb-6">
                          <p className="text-slate-600 text-right leading-relaxed text-sm">
                            {workout.logicCue || workout.description}
                          </p>
                        </section>
                      )}

                      {/* ── Intensity graph ── */}
                      <div className="mb-6">
                        <h3 className="text-[16px] font-semibold mb-3" style={{ fontFamily: 'var(--font-simpler)' }}>תקציר קצבים</h3>
                        <div className="flex items-end gap-[3px] h-12 bg-transparent">
                          {workout.blocks.map((block, i) => {
                            const rank = getBlockIntensityRank(block);
                            const heightPct = rankToHeightPercent(rank);
                            const weight = block.durationSeconds || block.distanceMeters || 60;
                            return (
                              <div key={block.id ?? i} className="rounded-t-sm"
                                style={{ flex: weight, height: `${heightPct}%`, backgroundColor: block.colorHex || '#D1D5DB' }}
                              />
                            );
                          })}
                        </div>
                      </div>

                      {/* ── Grouped block list ── */}
                      <div className="space-y-4">
                        {sections.map((section, si) => (
                          <div key={si} className="rounded-2xl border border-slate-200 overflow-hidden">
                            {/* Section header */}
                            <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                              <span className="text-sm font-bold text-slate-900">{section.title}</span>
                              {section.laps != null && section.laps > 0 && (
                                <span className="text-xs font-bold text-slate-500 bg-white px-2.5 py-1 rounded-full" style={{ border: PILL_BORDER }}>
                                  🔄 {section.laps} הקפות
                                </span>
                              )}
                            </div>
                            <div className="divide-y divide-slate-100">
                              {section.blocks.map(({ block, originalIndex }) => (
                                <RunBlockBriefingCard
                                  key={block.id ?? originalIndex}
                                  block={block}
                                  index={originalIndex}
                                  paceLabel={getPaceLabel(block)}
                                  metaLabel={getMetaLabel(block)}
                                  onDrillTap={block.drillRef ? () => setActiveDrillBlock(block) : undefined}
                                />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* ── Where to Run ── */}
                      <section className="mt-8 mb-2">
                        <h3 className="text-right font-bold text-lg mb-3">איפה כדאי לי לרוץ?</h3>
                        <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1">
                          {SURFACE_CARDS.map((card) => (
                            <div key={card.id} className="flex-shrink-0 w-[150px] rounded-2xl overflow-hidden bg-white shadow-sm" style={{ border: PILL_BORDER }}>
                              <div className="h-14 flex items-center justify-center text-2xl" style={{ backgroundColor: `${card.color}10` }}>
                                {card.icon}
                              </div>
                              <div className="p-3">
                                <p className="font-bold text-sm text-gray-900">{card.label}</p>
                                <p className="text-[11px] text-gray-400 mt-1 leading-snug">{card.tip}</p>
                              </div>
                            </div>
                          ))}
                        </div>

                        {nearbyParks.length > 0 && (
                          <div className="mt-5">
                            <p className="text-xs font-bold text-gray-400 mb-2">פארקים ומגרשים בקרבת מקום</p>
                            <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1">
                              {nearbyParks.map((park, idx) => (
                                <motion.div key={park.id}
                                  initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }}
                                  transition={{ delay: idx * 0.08, duration: 0.35 }}
                                  className="flex-shrink-0 w-[200px] rounded-2xl overflow-hidden bg-white shadow-sm" style={{ border: PILL_BORDER }}
                                >
                                  <ParkCardImage src={park.imageUrl} fallback={PARK_FALLBACK_IMAGE} alt={park.name} eager={idx < 2} />
                                  <div className="p-3">
                                    <p className="font-bold text-sm text-gray-900 truncate">{park.name}</p>
                                    <div className="flex items-center gap-1 mt-1.5 text-slate-500">
                                      <MapPin size={13} className="shrink-0" />
                                      <span className="text-xs font-medium">
                                        {park.walkingMinutes <= 1 ? 'דקה הליכה ממך' : `${park.walkingMinutes} דקות הליכה ממך`}
                                      </span>
                                    </div>
                                  </div>
                                </motion.div>
                              ))}
                            </div>
                          </div>
                        )}
                      </section>
                    </div>
                  </>
                )}
              </div>

              {/* ── Sticky GO button ── */}
              {workout && !isLoading && (
                <div className="absolute bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-gray-200/50 px-4 pt-3"
                  style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 12px))' }}
                >
                  <button onClick={onGo}
                    className="w-full h-[42px] rounded-full text-white font-extrabold text-lg active:scale-[0.97] transition-transform flex items-center justify-center gap-2 border-0 outline-none"
                    style={{ background: 'linear-gradient(to left, #0CF2E3, #00BAF7)' }}
                  >
                    <Play size={20} fill="currentColor" />
                    <span>התחל אימון</span>
                  </button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Drill detail panel ── */}
      <AnimatePresence>
        {activeDrillBlock?.drillRef && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-[110]" onClick={() => setActiveDrillBlock(null)} />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 260, mass: 0.8 }}
              className="fixed inset-x-0 bottom-0 top-8 z-[110] bg-white rounded-t-[28px] overflow-y-auto"
              dir="rtl" style={{ fontFamily: 'var(--font-simpler)' }}
            >
              <div className="flex items-center justify-between px-5 pt-5 pb-2 sticky top-0 bg-white z-10">
                <button onClick={() => setActiveDrillBlock(null)}
                  className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center active:scale-90 transition-transform"
                ><ArrowRight size={18} className="text-gray-500" /></button>
                <h2 className="text-base font-black text-gray-900 flex-1 text-center px-4">{activeDrillBlock.label}</h2>
                <div className="w-9" />
              </div>
              <div className="px-5 pb-10">
                <ExerciseDetailContent
                  exerciseName={activeDrillBlock.label}
                  videoUrl={activeDrillBlock.drillRef.videoUrl ?? null}
                  posterUrl={activeDrillBlock.drillRef.thumbnailUrl}
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

// ── Park card image ──

function ParkCardImage({ src, fallback, alt, eager }: { src?: string; fallback: string; alt: string; eager: boolean }) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const resolvedSrc = errored ? fallback : (src || fallback);
  return (
    <div className="relative w-full h-[100px] overflow-hidden bg-gray-200">
      {!loaded && <div className="absolute inset-0 animate-pulse bg-gray-200" />}
      <img src={resolvedSrc} alt={alt}
        className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        loading={eager ? 'eager' : 'lazy'}
        onLoad={() => setLoaded(true)}
        onError={() => { setErrored(true); setLoaded(true); }}
      />
    </div>
  );
}

// ── Format helpers ──

function fmtBlockDur(s: number): string {
  if (s < 60) return `${s} שנ'`;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return sec > 0 ? `${m}:${sec.toString().padStart(2, '0')} דק'` : `${m} דק'`;
}

function fmtBlockDist(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1)} ק"מ`;
  return `${m} מ'`;
}

function fmtDuration(s: number): string {
  if (s < 60) return `${s} שניות`;
  const m = Math.floor(s / 60);
  return `${m} דק'`;
}
