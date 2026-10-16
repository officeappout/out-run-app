'use client';

import { useState } from 'react';
import { AnimatePresence, motion, useDragControls, useReducedMotion, type PanInfo } from 'framer-motion';
import { Clock, Download, Heart, Play, RefreshCw, Share2, Users, VolumeX } from 'lucide-react';
import { Button, EASE_V2 } from '@/components/ui/v2';
import { AppIcon, Bolts, FadeHero, Faces, GlassClose, ICON, Segmented, thumb } from '../_app/parts';
import { EQUIPMENT, EXERCISES, LOCATIONS, PARKS, WORKOUT, type LabExercise, type WorkoutLocation } from './fixtures';

type Level = 1 | 2 | 3;
const LEVELS: { id: Level; label: string; minutes: number }[] = [
  { id: 1, label: 'קל', minutes: 25 },
  { id: 2, label: 'בינוני', minutes: 35 },
  { id: 3, label: 'קשה', minutes: 45 },
];

const MUSCLE_ICON: Record<string, string> = {
  גב: ICON.back,
  חזה: ICON.chest,
  כתפיים: ICON.shoulders,
  'יד אחורית': ICON.triceps,
};

/**
 * The workout page (today's WorkoutPreviewDrawer): the white fade-out hero
 * the app already has, then a level picker, a location switch that re-plans
 * the workout, muscles, the exercise list with real thumbnails and a swap
 * action, nearby parks, and a pinned start bar with "share that I'm going".
 */
export default function WorkoutDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const reduce = useReducedMotion();
  const [location, setLocation] = useState<WorkoutLocation>('park');
  const [level, setLevel] = useState<Level>(2);
  const [share, setShare] = useState(true);
  const plan = EXERCISES[location];
  const drag = useDragControls();
  const minutes = LEVELS.find((l) => l.id === level)!.minutes;

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
            className="absolute inset-x-0 bottom-0 flex h-[95%] flex-col overflow-hidden rounded-t-[28px] bg-white shadow-v2-sheet"
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
            <div className="flex-1 overflow-y-auto overscroll-contain pb-44">
              <div className="relative">
                <FadeHero src={WORKOUT.photo} height={290} position="60% 30%" />
                <div
                  className="absolute inset-x-0 top-0 flex cursor-grab touch-none justify-center pt-2.5"
                  onPointerDown={(e) => drag.start(e)}
                >
                  <span className="h-1.5 w-10 rounded-full bg-white/80 shadow-v2-ring" />
                </div>
                <div className="absolute end-4 top-5">
                  <GlassClose onClick={onClose} />
                </div>
              </div>

              <div className="-mt-6 px-5">
                <h2 className="flex items-center gap-2 text-[25px] font-black leading-[1.08] !tracking-[-0.02em]">
                  <AppIcon src={ICON.strength} size={26} />
                  {WORKOUT.title}
                </h2>

                {/* level */}
                <div className="mt-4 grid grid-cols-3 gap-1 rounded-[22px] bg-white p-1 shadow-v2-card" role="radiogroup" aria-label="רמת קושי">
                  {LEVELS.map((l) => {
                    const on = l.id === level;
                    return (
                      <button
                        key={l.id}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => setLevel(l.id)}
                        className="relative flex h-[62px] flex-col items-center justify-center gap-0.5 rounded-[18px]"
                      >
                        {on && (
                          <motion.span
                            layoutId="lab-level"
                            className="absolute inset-0 rounded-[18px] bg-v2-tint ring-1 ring-inset ring-v2-accent/40"
                            transition={{ duration: reduce ? 0 : 0.3, ease: EASE_V2 }}
                          />
                        )}
                        <span className="relative">
                          <Bolts level={l.id} size={15} />
                        </span>
                        <span className={`relative text-[13px] font-extrabold tabular-nums ${on ? 'text-v2-deep' : 'text-v2-ink-2'}`}>
                          {l.label} · {l.minutes}′
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* meta + actions */}
                <div className="mt-4 flex items-center gap-2">
                  <span className="flex h-10 items-center gap-1.5 rounded-full bg-v2-surface px-3.5 text-[14px] font-extrabold tabular-nums ring-1 ring-inset ring-v2-hairline">
                    <Clock size={15} strokeWidth={2.4} className="text-v2-deep" aria-hidden />
                    {minutes} דק׳
                  </span>
                  <span className="flex h-10 items-center gap-1.5 rounded-full bg-v2-surface px-3.5 text-[14px] font-extrabold tabular-nums ring-1 ring-inset ring-v2-hairline">
                    {WORKOUT.sets} סטים
                  </span>
                  <span className="flex-1" />
                  {[
                    { icon: Share2, label: 'שיתוף' },
                    { icon: Heart, label: 'שמירה' },
                    { icon: Download, label: 'הורדה לצפייה בלי רשת' },
                  ].map(({ icon: Icon, label }) => (
                    <button
                      key={label}
                      type="button"
                      aria-label={label}
                      className="grid h-10 w-10 place-items-center rounded-full text-v2-ink-2 ring-1 ring-inset ring-v2-pill-border transition-transform duration-150 ease-v2 active:scale-[0.97]"
                    >
                      <Icon size={17} strokeWidth={2.4} />
                    </button>
                  ))}
                </div>

                <p className="mt-3 rounded-[16px] bg-v2-tint px-3.5 py-2.5 text-[14px] font-bold leading-snug text-v2-deep">
                  ישנת טוב והאימון האחרון הלך חזק, אז התאמתי לך היום אימון בינוני.
                </p>

                {/* location */}
                <div className="mb-2 mt-5 text-[13px] font-extrabold text-v2-muted">איפה מתאמנים היום?</div>
                <Segmented id="lab-location" options={LOCATIONS} value={location} onChange={setLocation} dark />
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {EQUIPMENT[location].map((e) => (
                    <span key={e} className="rounded-full bg-v2-surface px-3 py-1 text-[12.5px] font-bold text-v2-ink-2 ring-1 ring-inset ring-v2-hairline">
                      {e}
                    </span>
                  ))}
                </div>

                {/* muscles */}
                <div className="mb-2 mt-6 text-[17px] font-black">שרירים</div>
                <div className="grid grid-cols-4 gap-2">
                  {WORKOUT.muscles.map((m) => (
                    <div key={m} className="flex flex-col items-center gap-1 rounded-[16px] bg-v2-surface py-2.5 ring-1 ring-inset ring-v2-hairline">
                      <AppIcon src={MUSCLE_ICON[m] ?? ICON.chest} size={30} />
                      <span className="text-[12px] font-extrabold">{m}</span>
                    </div>
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
                    <ExerciseGroup title="חימום" rounds="1 סבב" items={plan.warmup} />
                    <ExerciseGroup title="האימון" rounds="3 סבבים" items={plan.main} numbered />
                    <ExerciseGroup title="מתיחות" rounds="1 סבב" items={plan.cooldown} />
                  </motion.div>
                </AnimatePresence>

                {location === 'park' && (
                  <>
                    <div className="mb-3 mt-7 text-[17px] font-black">איפה כדאי להתאמן?</div>
                    <div className="-mx-5 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
                      {PARKS.map((p) => (
                        <div key={p.name} className="w-[200px] shrink-0 snap-start rounded-[20px] bg-white p-3 shadow-v2-card">
                          <div className="flex items-center justify-between">
                            <span className="rounded-full bg-v2-tint px-2.5 py-0.5 text-[12px] font-extrabold text-v2-deep">{p.distance}</span>
                            <span className="flex items-center gap-1 text-[12px] font-bold text-v2-muted">
                              <span className="h-2 w-2 rounded-full bg-activity-steps" />
                              {p.people} עכשיו
                            </span>
                          </div>
                          <div className="mt-2 truncate text-[14.5px] font-extrabold">{p.name}</div>
                          <div className="text-[12.5px] font-bold text-v2-muted">{p.gear}</div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* pinned footer */}
            <div className="absolute inset-x-0 bottom-0 border-t border-v2-hairline bg-white/95 px-4 pb-[calc(env(safe-area-inset-bottom)+14px)] pt-3">
              <button
                type="button"
                role="switch"
                aria-checked={share}
                onClick={() => setShare((v) => !v)}
                className="mb-3 flex w-full items-center gap-3 text-start"
              >
                <Users size={20} strokeWidth={2.4} className="shrink-0 text-v2-deep" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14.5px] font-extrabold">שתף שאני יוצא לאימון</span>
                  <span className="block truncate text-[12px] font-bold text-v2-muted">
                    {share ? 'חברים ומתאמנים קרובים יראו שאתה בדרך' : 'האימון יישאר פרטי'}
                  </span>
                </span>
                {share && <Faces letters={['ר', 'מ']} more={1} />}
                <span className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200 ${share ? 'bg-v2-cta' : 'bg-v2-pill-border'}`}>
                  <span
                    className="absolute top-1 h-5 w-5 rounded-full bg-white shadow-v2-ring transition-[inset-inline-start] duration-200 ease-v2"
                    style={{ insetInlineStart: share ? 24 : 4 }}
                  />
                </span>
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  aria-label="השתקת קול"
                  className="grid h-14 w-14 shrink-0 place-items-center rounded-full ring-1 ring-inset ring-v2-pill-border"
                >
                  <VolumeX size={20} strokeWidth={2.4} />
                </button>
                <Button variant="primary" size="lg" block className="flex-1">
                  <Play size={18} strokeWidth={2.6} className="fill-current" aria-hidden />
                  התחלת אימון
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function ExerciseGroup({
  title,
  rounds,
  items,
  numbered = false,
}: {
  title: string;
  rounds: string;
  items: LabExercise[];
  numbered?: boolean;
}) {
  return (
    <div className="mt-6">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[17px] font-black">{title}</span>
        <span className="text-[13px] font-bold text-v2-muted">
          {items.length} תרגילים · {rounds}
        </span>
      </div>
      <ol className="space-y-2">
        {items.map((ex, i) => (
          <li key={ex.name} className="flex items-center gap-3 overflow-hidden rounded-[18px] bg-white shadow-v2-ring">
            <span className="relative h-[72px] w-[84px] shrink-0 overflow-hidden">
              <img src={thumb(ex.video)} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
              {numbered && (
                <span className="absolute start-1.5 top-1.5 grid h-6 min-w-6 place-items-center rounded-full bg-white/90 px-1.5 text-[11px] font-black tabular-nums text-v2-ink">
                  {String(i + 1).padStart(2, '0')}
                </span>
              )}
            </span>
            <span className="min-w-0 flex-1 py-2">
              <span className="block truncate text-[15px] font-extrabold">{ex.name}</span>
              <span className="block text-[13px] font-bold tabular-nums text-v2-muted">{ex.detail}</span>
            </span>
            <button
              type="button"
              aria-label={`החלפת ${ex.name}`}
              className="me-3 grid h-9 w-9 shrink-0 place-items-center rounded-full text-v2-deep ring-1 ring-inset ring-v2-pill-border transition-transform duration-150 ease-v2 active:scale-[0.97]"
            >
              <RefreshCw size={16} strokeWidth={2.4} />
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
