'use client';

import { useState } from 'react';
import { AnimatePresence, motion, useDragControls, useReducedMotion, type PanInfo } from 'framer-motion';
import { ArrowLeftRight, Clock, Dumbbell, Layers, MapPin, Play, Trees, X, Zap } from 'lucide-react';
import { Button, Chip, IconTile, EASE_V2 } from '@/components/ui/v2';
import {
  DIFFICULTY_LABEL,
  EQUIPMENT,
  EXERCISES,
  LOCATIONS,
  PARKS,
  WORKOUT,
  type LabExercise,
  type WorkoutLocation,
} from './fixtures';

/**
 * The workout drawer (today's WorkoutPreviewDrawer) in the site language:
 * photo hero with glass chips, a location switch that re-plans the workout,
 * the exercise list as numbered rows with a swap action, nearby parks, and a
 * pinned start button. Drag the handle down or tap outside to close.
 */
export default function WorkoutDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const reduce = useReducedMotion();
  const [location, setLocation] = useState<WorkoutLocation>('park');
  const plan = EXERCISES[location];
  // Only the handle starts a drag, so the list keeps its native scroll.
  const drag = useDragControls();

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 600) onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[10]" role="dialog" aria-modal="true" aria-label="פרטי האימון">
          <motion.button
            type="button"
            aria-label="סגירה"
            className="absolute inset-0 bg-[#0e1419]/45"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
          />
          <motion.div
            className="absolute inset-x-0 bottom-0 flex h-[93%] flex-col overflow-hidden rounded-t-[28px] bg-white shadow-v2-sheet"
            initial={reduce ? { opacity: 0 } : { y: '100%' }}
            animate={reduce ? { opacity: 1 } : { y: 0 }}
            exit={reduce ? { opacity: 0 } : { y: '100%' }}
            transition={{ duration: 0.42, ease: [0.32, 0.72, 0, 1] }}
            drag={reduce ? false : 'y'}
            dragControls={drag}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.04, bottom: 0.7 }}
            onDragEnd={onDragEnd}
          >
            <div
              className="flex shrink-0 cursor-grab touch-none justify-center pb-2 pt-2.5"
              onPointerDown={(e) => drag.start(e)}
            >
              <span className="h-1.5 w-10 rounded-full bg-v2-pill-border" />
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain pb-40">
              {/* hero */}
              <div className="relative mx-4 h-[210px] overflow-hidden rounded-[22px]">
                <img src={WORKOUT.photo} alt="" className="absolute inset-0 h-full w-full object-cover object-[60%_30%]" />
                <span className="absolute inset-0 bg-gradient-to-t from-[#0e1419]/55 to-transparent" />
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="סגירה"
                  className="v2-glass-chip absolute end-3 top-3 grid h-9 w-9 place-items-center rounded-full text-white transition-transform duration-150 ease-v2 active:scale-[0.97]"
                >
                  <X size={18} strokeWidth={2.6} />
                </button>
                <span className="absolute bottom-3 start-3 flex gap-1.5">
                  <Chip tone="glass-dark">{WORKOUT.program}</Chip>
                </span>
              </div>

              <div className="px-5 pt-4">
                <h2 className="text-[26px] font-black leading-[1.05] !tracking-[-0.02em]">{WORKOUT.title}</h2>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <Stat icon={<Clock size={16} strokeWidth={2.4} />} value={`${WORKOUT.minutes} דק׳`} label="משך" />
                  <Stat icon={<Layers size={16} strokeWidth={2.4} />} value={`${WORKOUT.sets}`} label="סטים" />
                  <Stat
                    icon={
                      <span className="flex gap-px">
                        {[1, 2, 3].map((n) => (
                          <Zap
                            key={n}
                            size={13}
                            strokeWidth={2.2}
                            className={n <= WORKOUT.difficulty ? 'fill-v2-amber text-v2-amber' : 'text-v2-pill-border'}
                          />
                        ))}
                      </span>
                    }
                    value={DIFFICULTY_LABEL[WORKOUT.difficulty]}
                    label="רמת קושי"
                  />
                </div>

                {/* location switch */}
                <div className="mt-5 text-[13px] font-extrabold text-v2-muted">איפה מתאמנים היום?</div>
                <div className="relative mt-2 grid grid-cols-3 rounded-full bg-v2-surface p-1 ring-1 ring-inset ring-v2-hairline" role="radiogroup">
                  {LOCATIONS.map((l) => {
                    const on = l.id === location;
                    return (
                      <button
                        key={l.id}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => setLocation(l.id)}
                        className={`relative h-10 rounded-full text-[14px] font-extrabold transition-colors duration-200 ${on ? 'text-white' : 'text-v2-ink-2'}`}
                      >
                        {on && (
                          <motion.span
                            layoutId="lab-location-pill"
                            className="absolute inset-0 rounded-full bg-v2-ink"
                            transition={{ duration: reduce ? 0 : 0.32, ease: EASE_V2 }}
                          />
                        )}
                        <span className="relative">{l.label}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {EQUIPMENT[location].map((e) => (
                    <Chip key={e} tone="accent" icon={<Dumbbell size={13} strokeWidth={2.6} aria-hidden />}>
                      {e}
                    </Chip>
                  ))}
                  {WORKOUT.muscles.map((m) => (
                    <Chip key={m} tone="neutral">
                      {m}
                    </Chip>
                  ))}
                </div>

                {/* exercises */}
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={location}
                    initial={reduce ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduce ? undefined : { opacity: 0, y: -6 }}
                    transition={{ duration: 0.22, ease: EASE_V2 }}
                  >
                    <ExerciseGroup title="חימום" items={plan.warmup} muted />
                    <ExerciseGroup title="האימון" items={plan.main} numbered />
                    <ExerciseGroup title="מתיחות" items={plan.cooldown} muted />
                  </motion.div>
                </AnimatePresence>

                {/* parks */}
                {location === 'park' && (
                  <>
                    <div className="mb-3 mt-7 text-[17px] font-black">איפה כדאי להתאמן?</div>
                    <div className="-mx-5 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
                      {PARKS.map((p, i) => (
                        <div
                          key={p.name}
                          className="w-[210px] shrink-0 snap-start overflow-hidden rounded-[20px] bg-white shadow-v2-card"
                        >
                          <div
                            className="relative h-[84px]"
                            style={{
                              background:
                                i === 0
                                  ? 'linear-gradient(135deg,#bff0c9,#8fdcb0)'
                                  : i === 1
                                    ? 'linear-gradient(135deg,#c7ecfb,#9fdcf0)'
                                    : 'linear-gradient(135deg,#d9f3e3,#b6e7d6)',
                            }}
                          >
                            <Trees size={34} strokeWidth={2} className="absolute bottom-3 end-3 text-[#0e1419]/25" aria-hidden />
                            <span className="absolute start-2.5 top-2.5 rounded-full bg-white/90 px-2.5 py-1 text-[12px] font-extrabold">
                              {p.distance}
                            </span>
                          </div>
                          <div className="p-3">
                            <div className="truncate text-[14.5px] font-extrabold">{p.name}</div>
                            <div className="mt-0.5 flex items-center gap-1 text-[12.5px] font-bold text-v2-muted">
                              <MapPin size={12} strokeWidth={2.6} aria-hidden />
                              {p.gear}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* pinned footer */}
            <div className="absolute inset-x-0 bottom-0 border-t border-v2-hairline bg-white/95 px-5 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3">
              {location === 'park' && (
                <div className="mb-2.5 flex items-center justify-center gap-2 text-[13px] font-bold text-v2-ink-2">
                  <span className="h-2 w-2 rounded-full bg-activity-steps" />3 אנשים מתאמנים כוח קרוב אליך
                </div>
              )}
              <Button variant="primary" size="lg" block>
                <Play size={18} strokeWidth={2.6} className="fill-current" aria-hidden />
                התחל אימון
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="rounded-[16px] bg-v2-surface px-3 py-2.5 ring-1 ring-inset ring-v2-hairline">
      <div className="flex items-center gap-1.5 text-v2-deep">{icon}</div>
      <div className="mt-1 text-[16px] font-black leading-tight tabular-nums">{value}</div>
      <div className="text-[12px] font-bold text-v2-muted">{label}</div>
    </div>
  );
}

function ExerciseGroup({
  title,
  items,
  numbered = false,
  muted = false,
}: {
  title: string;
  items: LabExercise[];
  numbered?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="mt-6">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[17px] font-black">{title}</span>
        <span className="text-[13px] font-bold text-v2-muted">{items.length} תרגילים</span>
      </div>
      <ol className="space-y-2">
        {items.map((ex, i) => (
          <li key={ex.name} className="flex items-center gap-3 rounded-[18px] bg-white p-2.5 shadow-v2-ring">
            {numbered ? (
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-v2-tile bg-v2-tint">
                <span className="v2-step-numeral text-[20px]">{String(i + 1).padStart(2, '0')}</span>
              </span>
            ) : (
              <IconTile icon={muted ? Layers : Dumbbell} tone="neutral" size="lg" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-extrabold">{ex.name}</span>
              <span className="block text-[13px] font-bold tabular-nums text-v2-muted">{ex.detail}</span>
            </span>
            {numbered && (
              <button
                type="button"
                aria-label={`החלפת ${ex.name}`}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-v2-deep ring-1 ring-inset ring-v2-pill-border transition-transform duration-150 ease-v2 active:scale-[0.97]"
              >
                <ArrowLeftRight size={16} strokeWidth={2.4} />
              </button>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
