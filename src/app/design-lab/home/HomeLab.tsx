'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, ChevronDown, ChevronLeft, MessageCircle, Pencil, Play, Search, Users } from 'lucide-react';
import { Button, Card, EASE_V2 } from '@/components/ui/v2';
import LabFrame, { LabStates } from '../_shared/LabFrame';
import { AppIcon, Bolts, BottomNav, Faces, ICON, Ring, photo } from '../_app/parts';
import WorkoutDrawer from './WorkoutDrawer';
import {
  ACTIVE_MINUTES,
  AGENDA,
  NEARBY_PARKS,
  STEPS_DETAIL,
  TODAY_CARDS,
  TODAY_LABEL,
  USER,
  WEEK,
  WORKOUT,
  type TodayState,
} from './fixtures';

const STATES: { id: TodayState; label: string }[] = [
  { id: 'planned', label: 'יש אימון היום' },
  { id: 'done', label: 'האימון הושלם' },
  { id: 'rest', label: 'יום מנוחה' },
];

const LAB_LINKS = [
  { href: '/design-lab/schedule', label: 'תכנון אימונים' },
  { href: '/design-lab/steps', label: 'צעדים' },
  { href: '/design-lab/park', label: 'דף פארק' },
  { href: '/design-lab/group', label: 'דף קבוצה' },
];

export default function HomeLab() {
  const [state, setState] = useState<TodayState>('planned');
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const s = q.get('state');
    if (s === 'planned' || s === 'done' || s === 'rest') setState(s);
    if (q.get('drawer') === '1') setDrawerOpen(true);
  }, []);

  return (
    <LabFrame
      panel={
        <div>
          <div className="mb-1 text-[22px] font-black tracking-v2-tight">Design lab · בית</div>
          <p className="mb-6 text-[14px] leading-relaxed text-v2-ink-2">
            סבב 2: הלו״ז מעל האימון, כרטיס עם פייד־אאוט לבן, טאבים להתקדמות ולמדדי בריאות. נתוני דמו בלבד.
          </p>
          <LabStates title="מצב היום" value={state} options={STATES} onChange={setState} />
          <Button variant="dark" size="sm" onClick={() => setDrawerOpen(true)}>
            פתח את דף האימון
          </Button>
          <div className="mt-5 mb-2 text-[13px] font-extrabold text-v2-deep">מסכים נוספים</div>
          <div className="flex flex-wrap gap-2">
            {LAB_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="h-9 rounded-full bg-white px-4 text-[13px] font-extrabold leading-9 shadow-v2-ring">
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      }
    >
      <div className="h-full overflow-y-auto overscroll-contain pb-32">
        <HomeHeader />
        <div className="space-y-7">
          {state === 'done' && <DoneToday />}
          <WeekSchedule state={state} />
          <TodayCarousel state={state} onOpen={() => setDrawerOpen(true)} />
          <ProgressTabs state={state} />
          <NearbyParks />
        </div>
      </div>
      <BottomNav active="home" />
      <WorkoutDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </LabFrame>
  );
}

/* ── header ─────────────────────────────────────────────────────────────── */

function HomeHeader() {
  return (
    <header className="flex items-center gap-3 px-4 pb-5 pt-[calc(env(safe-area-inset-top)+18px)]">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-v2-cta text-[17px] font-black text-v2-on-cta shadow-v2-cta">
        {USER.firstName[0]}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[22px] font-black leading-tight tracking-v2-tight">בוקר טוב, {USER.firstName}</div>
        <div className="truncate text-[13px] font-bold text-v2-muted">{TODAY_LABEL}</div>
      </div>
      <span className="flex h-10 items-center gap-1 rounded-full bg-white pe-3 ps-2 shadow-v2-ring" aria-label={`${USER.streakDays} ימים ברצף`}>
        <AppIcon src={ICON.flameStrength} size={22} />
        <span className="text-[14px] font-black tabular-nums">{USER.streakDays}</span>
      </span>
      {[
        { icon: Search, label: 'חיפוש' },
        { icon: MessageCircle, label: 'הודעות' },
      ].map(({ icon: Icon, label }) => (
        <button
          key={label}
          type="button"
          aria-label={label}
          className="grid h-10 w-10 place-items-center rounded-full bg-white shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
        >
          <Icon size={18} strokeWidth={2.4} />
        </button>
      ))}
    </header>
  );
}

function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between px-4">
      <h2 className="text-[19px] font-black !tracking-[-0.02em]">{children}</h2>
      {action}
    </div>
  );
}

/* ── done today ─────────────────────────────────────────────────────────── */

function DoneToday() {
  return (
    <section aria-label="הפעילות שלי היום" className="px-4">
      <div className="flex items-center gap-3 rounded-v2-card bg-white p-3 shadow-v2-card">
        <span className="relative grid h-12 w-12 place-items-center rounded-[14px] bg-v2-tint">
          <AppIcon src={ICON.strength} size={26} />
          <span className="absolute -bottom-1 -end-1 grid h-5 w-5 place-items-center rounded-full bg-v2-cta text-v2-on-cta ring-2 ring-white">
            <Check size={12} strokeWidth={3.2} aria-hidden />
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-black">אימון כוח בוצע</div>
          <div className="text-[13px] font-bold text-v2-muted">{WORKOUT.minutes} דק׳ · 24 סטים · +12% נפח</div>
        </div>
        <Button variant="ghost" size="sm">
          סיכום
        </Button>
      </div>
    </section>
  );
}

/* ── weekly schedule (לו״ז), expandable ─────────────────────────────────── */

function DayMark({ status, kind, state }: { status: string; kind?: string; state: TodayState }) {
  const today = status === 'today';
  const isRest = status === 'rest' || (today && state === 'rest');
  const done = status === 'done' || (today && state === 'done');
  const icon = kind === 'walk' ? ICON.flameSteps : ICON.flameStrength;
  return (
    <span
      className={`relative grid h-11 w-11 place-items-center rounded-[14px] ${
        today ? 'bg-v2-tint ring-2 ring-v2-accent' : done ? 'bg-v2-surface' : ''
      }`}
    >
      {isRest ? (
        <span className="text-[14px] font-black italic text-v2-muted/70">
          z<sup className="text-[9px]">z</sup>
        </span>
      ) : (
        <AppIcon src={icon} size={24} className={status === 'missed' ? 'opacity-30 grayscale' : status === 'planned' ? 'opacity-50' : ''} />
      )}
      {done && (
        <span className="absolute -bottom-1 -end-1 grid h-[18px] w-[18px] place-items-center rounded-full bg-v2-cta text-v2-on-cta ring-2 ring-white">
          <Check size={11} strokeWidth={3.4} aria-hidden />
        </span>
      )}
    </span>
  );
}

function WeekSchedule({ state }: { state: TodayState }) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const agenda = state === 'rest' ? AGENDA.filter((a) => a.kind !== 'strength') : AGENDA;
  return (
    <section aria-label="הלו״ז שלי">
      <SectionTitle
        action={
          <Link href="/design-lab/schedule" className="flex items-center gap-1 text-[14px] font-extrabold text-v2-deep">
            <Pencil size={14} strokeWidth={2.6} aria-hidden />
            שינוי לו״ז
          </Link>
        }
      >
        הלו״ז שלי
      </SectionTitle>
      <div className="mx-4 overflow-hidden rounded-v2-card bg-white shadow-v2-card">
        <ol className="grid grid-cols-7 px-1.5 pt-3">
          {WEEK.map((d) => {
            const today = d.status === 'today';
            return (
              <li key={d.date} className="flex flex-col items-center gap-1">
                <span className={`text-[12px] font-extrabold ${today ? 'text-v2-deep' : 'text-v2-muted'}`}>{d.short}</span>
                <DayMark status={d.status} kind={d.kind} state={state} />
                <span className={`text-[11px] font-bold tabular-nums ${today ? 'text-v2-deep' : 'text-v2-muted/80'}`}>{d.date}</span>
              </li>
            );
          })}
        </ol>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="mt-2 flex w-full items-center justify-between border-t border-v2-hairline px-4 py-3 text-start"
        >
          <span>
            <span className="block text-[15px] font-extrabold">מה אפשר לעשות היום</span>
            <span className="block text-[12.5px] font-bold text-v2-muted">{agenda.length} אפשרויות · שישי, 16 באוקטובר</span>
          </span>
          <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.25, ease: EASE_V2 }} className="grid h-8 w-8 place-items-center rounded-full bg-v2-surface">
            <ChevronDown size={17} strokeWidth={2.6} aria-hidden />
          </motion.span>
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
              animate={reduce ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
              exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={{ duration: 0.32, ease: EASE_V2 }}
              className="overflow-hidden"
            >
              <ol className="space-y-1.5 px-3 pb-3">
                {agenda.map((a) => {
                  const done = a.kind === 'strength' && state === 'done';
                  const now = a.now && state === 'planned';
                  const icon = a.kind === 'strength' ? ICON.strength : a.kind === 'steps' ? ICON.walk : null;
                  const row = (
                    <span className={`flex items-center gap-3 rounded-[16px] px-2.5 py-2.5 ${now ? 'bg-v2-tint' : 'bg-v2-surface/60'}`}>
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px] bg-white shadow-v2-ring">
                        {icon ? <AppIcon src={icon} size={20} /> : <Users size={18} strokeWidth={2.4} className="text-v2-deep" aria-hidden />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-[14.5px] font-extrabold ${done ? 'text-v2-muted line-through' : ''}`}>{a.title}</span>
                        <span className="block truncate text-[12px] font-bold text-v2-muted">
                          <span className="tabular-nums text-v2-ink-2">{a.time}</span> · {a.meta}
                        </span>
                      </span>
                      {a.kind === 'group' ? (
                        <Faces letters={['מ', 'ר', 'א']} />
                      ) : now ? (
                        <span className="rounded-full bg-v2-cta px-2.5 py-1 text-[11.5px] font-extrabold text-v2-on-cta">עכשיו</span>
                      ) : done ? (
                        <Check size={18} strokeWidth={3} className="text-v2-deep" aria-label="בוצע" />
                      ) : null}
                    </span>
                  );
                  return (
                    <li key={a.time}>
                      {a.kind === 'group' ? (
                        <Link href="/design-lab/group" className="block">
                          {row}
                        </Link>
                      ) : (
                        row
                      )}
                    </li>
                  );
                })}
              </ol>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

/* ── today's workouts: carousel of fade-out cards ───────────────────────── */

const GEAR_ICON = { pullBar: ICON.pullBar, bars: ICON.bars, bench: ICON.bench } as const;

function TodayCarousel({ state, onOpen }: { state: TodayState; onOpen: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const cards = state === 'rest' ? [...TODAY_CARDS].reverse() : TODAY_CARDS;

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const w = (el.firstElementChild as HTMLElement | null)?.offsetWidth ?? 1;
    setIndex(Math.round(Math.abs(el.scrollLeft) / (w + 12)));
  };

  return (
    <section aria-label="האימון של היום">
      <SectionTitle>{state === 'rest' ? 'יום מנוחה — משהו קל?' : state === 'done' ? 'רוצה עוד משהו?' : 'האימון של היום'}</SectionTitle>
      <div
        ref={ref}
        onScroll={onScroll}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-[calc((100%-300px)/2)] pb-5 pt-1 [scrollbar-width:none]"
      >
        {cards.map((c, i) => (
          <article
            key={c.id}
            className="relative w-[300px] shrink-0 snap-center overflow-hidden rounded-v2-card-lg bg-white shadow-v2-card"
          >
            <button type="button" onClick={onOpen} className="block w-full text-start" aria-label={`פרטי ${c.title}`}>
              <div className="relative h-[230px]">
                <img
                  src={photo(c.photo)}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover object-[60%_30%]"
                  style={{
                    WebkitMaskImage: 'linear-gradient(180deg,#000 50%,transparent 100%)',
                    maskImage: 'linear-gradient(180deg,#000 50%,transparent 100%)',
                  }}
                />
                <span className="absolute bottom-7 end-3 grid h-11 w-11 place-items-center rounded-[14px] bg-white/90 shadow-v2-ring">
                  <AppIcon src={GEAR_ICON[c.gear]} size={26} />
                </span>
                {i === 0 && state === 'planned' && (
                  <span className="absolute start-3 top-3 rounded-full bg-white/90 px-3 py-1 text-[12px] font-extrabold text-v2-deep shadow-v2-ring">
                    לפי התוכנית שלך
                  </span>
                )}
              </div>
              <div className="px-4 pb-4">
                <div className="flex items-center gap-2 text-[13px] font-bold text-v2-muted">
                  <span>{c.level === 1 ? 'קל' : c.level === 2 ? 'בינוני' : 'מאתגר'}</span>
                  <Bolts level={c.level} size={13} />
                  <span className="h-3 w-px bg-v2-hairline" />
                  <span className="tabular-nums">{c.minutes} דקות</span>
                </div>
                <h3 className="mt-1 text-[20px] font-black leading-tight !tracking-[-0.02em]">{c.title}</h3>
              </div>
            </button>
            <div className="px-4 pb-4">
              <Button variant="primary" block onClick={onOpen}>
                <Play size={16} strokeWidth={2.6} className="fill-current" aria-hidden />
                סקרן לדעת מה באימון?
              </Button>
            </div>
          </article>
        ))}
      </div>
      <div className="flex justify-center gap-1.5" aria-hidden>
        {cards.map((c, i) => (
          <span
            key={c.id}
            className={`h-1.5 rounded-full transition-[width,background-color] duration-300 ease-v2 ${i === index ? 'w-6 bg-v2-cta' : 'w-1.5 bg-v2-pill-border'}`}
          />
        ))}
      </div>
    </section>
  );
}

/* ── progress / health tabs ─────────────────────────────────────────────── */

function ProgressTabs({ state }: { state: TodayState }) {
  const [tab, setTab] = useState<'progress' | 'health'>('progress');
  const reduce = useReducedMotion();
  const minutes = ACTIVE_MINUTES.done + (state === 'done' ? WORKOUT.minutes : 0);
  const stepsPct = Math.round((STEPS_DETAIL.today / STEPS_DETAIL.goal) * 100);
  return (
    <section aria-label="ההתקדמות שלי">
      <div className="mx-4 mb-3 grid grid-cols-2 border-b border-v2-hairline" role="tablist">
        {[
          { id: 'progress' as const, label: 'התקדמות שבועית' },
          { id: 'health' as const, label: 'מדדי בריאות' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`relative pb-3 text-[16px] font-black transition-colors duration-200 ${tab === t.id ? 'text-v2-deep' : 'text-v2-muted'}`}
          >
            {t.label}
            {tab === t.id && (
              <motion.span
                layoutId="home-progress-tab"
                className="absolute inset-x-0 -bottom-px h-[3px] rounded-full bg-v2-cta"
                transition={{ duration: reduce ? 0 : 0.32, ease: EASE_V2 }}
              />
            )}
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? undefined : { opacity: 0, y: -6 }}
          transition={{ duration: 0.22, ease: EASE_V2 }}
          className="grid grid-cols-[1.35fr_1fr] gap-3 px-4"
        >
          {tab === 'progress' ? (
            <>
              <Card padding="md" className="col-span-2 flex items-center gap-4">
                <Ring pct={11} size={84} stroke={10}>
                  <span className="text-[19px] font-black tabular-nums">11%</span>
                </Ring>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[15px] font-black">
                    <AppIcon src={ICON.strength} size={18} />
                    דגל אנושי
                  </div>
                  <div className="mt-1 text-[14px] font-extrabold">רמה 6 מתוך 10</div>
                  <div className="text-[12.5px] font-bold text-v2-muted">עוד 89% לרמה 7 · 3 אימונים בערך</div>
                </div>
              </Card>
              <Card padding="md">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 text-[13px] font-extrabold text-v2-muted">
                    <AppIcon src={ICON.strength} size={16} />
                    כוח
                  </span>
                  <span className="text-[18px] font-black tabular-nums">{state === 'done' ? 2 : 1}/3</span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-1">
                  {[0, 1, 2].map((n) => (
                    <span key={n} className={`h-1.5 rounded-full ${n < (state === 'done' ? 2 : 1) ? 'bg-v2-cta' : 'bg-v2-tint'}`} />
                  ))}
                </div>
                <div className="mt-3 text-[12px] font-bold leading-snug text-v2-muted">אימונים השבוע לפי התוכנית</div>
              </Card>
              <Card padding="md">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-extrabold text-v2-muted">רצף</span>
                  <AppIcon src={ICON.flameStrength} size={22} />
                </div>
                <div className="mt-2 text-[26px] font-black leading-none tabular-nums tracking-v2-tighter">
                  {USER.streakDays} <span className="text-[13px] font-bold text-v2-muted">ימים</span>
                </div>
                <div className="mt-2 text-[12px] font-bold leading-snug text-v2-muted">השיא שלך: 12 ימים</div>
              </Card>
            </>
          ) : (
            <>
              <Link href="/design-lab/steps" className="block">
                <Card padding="md" className="grid place-items-center">
                  <Ring pct={Math.min(100, stepsPct)} size={128} stroke={16} from="#00c07a" to="#39d98a" track="#e7f8f0">
                    <span className="block text-[22px] font-black leading-none tabular-nums tracking-v2-tighter">
                      {STEPS_DETAIL.today.toLocaleString('he-IL')}
                    </span>
                    <span className="mt-1 block text-[11.5px] font-bold text-v2-muted">מתוך {STEPS_DETAIL.goal.toLocaleString('he-IL')}</span>
                  </Ring>
                  <span className="mt-2 flex items-center gap-1 text-[13px] font-extrabold text-[#00865a]">
                    צעדים היום <ChevronLeft size={14} strokeWidth={2.6} aria-hidden />
                  </span>
                </Card>
              </Link>
              <Card padding="md" className="flex flex-col">
                <div className="text-[13px] font-extrabold text-v2-muted">פעילות שבועית</div>
                <div className="mt-2 text-[30px] font-black leading-none tabular-nums tracking-v2-tighter">
                  {minutes} <span className="text-[14px] font-bold text-v2-muted">דק׳</span>
                </div>
                <div className="mt-1 text-[12.5px] font-bold text-v2-muted">מתוך {ACTIVE_MINUTES.goal} דק׳</div>
                <div className="mt-auto pt-3">
                  <div className="h-2 overflow-hidden rounded-full bg-v2-tint">
                    <motion.div
                      className="h-full origin-right rounded-full bg-v2-cta"
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: Math.min(1, minutes / ACTIVE_MINUTES.goal) }}
                      transition={{ duration: 0.8, ease: EASE_V2 }}
                    />
                  </div>
                  <div className="mt-2 text-[11px] font-bold leading-snug text-v2-muted">המלצת ארגון הבריאות העולמי</div>
                </div>
              </Card>
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </section>
  );
}

/* ── nearby parks ───────────────────────────────────────────────────────── */

function NearbyParks() {
  return (
    <section aria-label="גינות כושר קרובות">
      <SectionTitle
        action={
          <Link href="/design-lab/park" className="flex items-center gap-0.5 text-[14px] font-extrabold text-v2-deep">
            הכל <ChevronLeft size={15} strokeWidth={2.6} aria-hidden />
          </Link>
        }
      >
        גינות כושר קרובות
      </SectionTitle>
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
        {NEARBY_PARKS.map((p) => (
          <Link
            key={p.id}
            href="/design-lab/park"
            className="w-[200px] shrink-0 snap-start overflow-hidden rounded-[22px] bg-white shadow-v2-card transition-transform duration-150 ease-v2 active:scale-[0.98]"
          >
            <div className="relative h-[120px]">
              <img
                src={photo(p.photo)}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
                style={{
                  WebkitMaskImage: 'linear-gradient(180deg,#000 55%,transparent 100%)',
                  maskImage: 'linear-gradient(180deg,#000 55%,transparent 100%)',
                }}
              />
              <span className="absolute start-2.5 top-2.5 rounded-full bg-white/90 px-2.5 py-1 text-[12px] font-extrabold">{p.distance}</span>
            </div>
            <div className="px-3 pb-3">
              <div className="truncate text-[15px] font-extrabold">{p.name}</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[12.5px] font-bold text-v2-muted">
                <span className="h-2 w-2 rounded-full bg-activity-steps" />
                {p.active} מתאמנים עכשיו
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
