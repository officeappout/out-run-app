'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, ChevronDown, ChevronLeft, Flag, Home as HomeIcon, MapPinPlus, Pencil, Play, Plus, Sparkles, Trees, Users, X, Zap } from 'lucide-react';
import { Button, Card, EASE_V2 } from '@/components/ui/v2';
import LabFrame, { LabStates } from '../_shared/LabFrame';
import { AppIcon, Bolts, BottomNav, ICON, Ring, photo, type NavVariant } from '../_app/parts';
import { AppHeader, BrandFlame, type LogoMode } from '../_app/brand';
import { DayLetters, StreakRow, type StreakDay } from '../_app/week';
import { pick, setDensity, useDensity, type Density } from '../_app/density';
import WorkoutDrawer from './WorkoutDrawer';
import BuilderSheet from './BuilderSheet';
import {
  ACTIVE_MINUTES,
  NEARBY_GROUPS,
  NEARBY_PARKS,
  TODAY_CARDS_HOME,
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

const LOGOS: { id: LogoMode; label: string }[] = [
  { id: 'out', label: 'OUT' },
  { id: 'cobrand', label: 'OUT + עירייה' },
  { id: 'city', label: 'עירייה בלבד' },
];

const NAVS: { id: NavVariant; label: string }[] = [
  { id: 'equal', label: 'שווה (היום)' },
  { id: 'pill', label: 'הלשונית הפעילה בולטת' },
  { id: 'map', label: 'מפה במרכז' },
];

const DENSITIES: { id: Density; label: string }[] = [
  { id: 'dense', label: 'סופי (באמצע)' },
  { id: 'regular', label: 'רגיל' },
  { id: 'compact', label: 'קומפקטי' },
];

const LAB_LINKS = [
  { href: '/design-lab/schedule', label: 'תכנון אימונים' },
  { href: '/design-lab/steps', label: 'צעדים' },
  { href: '/design-lab/park', label: 'דף פארק' },
  { href: '/design-lab/group', label: 'דף קבוצה' },
];

export default function HomeLab() {
  const [state, setState] = useState<TodayState>('planned');
  const [logo, setLogo] = useState<LogoMode>('out');
  const [nav, setNav] = useState<NavVariant>('equal');
  const density = useDensity();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const s = q.get('state');
    if (s === 'planned' || s === 'done' || s === 'rest') setState(s);
    const l = q.get('logo');
    if (l === 'out' || l === 'cobrand' || l === 'city') setLogo(l);
    const n = q.get('nav');
    if (n === 'equal' || n === 'pill' || n === 'map') setNav(n);
    if (q.get('drawer') === '1') setDrawerOpen(true);
    if (q.get('builder') === '1') setBuilderOpen(true);
  }, []);

  return (
    <LabFrame
      panel={
        <div>
          <div className="mb-1 text-[22px] font-black tracking-v2-tight">Design lab · בית</div>
          <p className="mb-6 text-[14px] leading-relaxed text-v2-ink-2">
            סבב 3: לוגו (גם של עירייה), להבת הרצף על הפרופיל, לו״ז עם רצף מחובר, מחולל אימונים מתחת לכרטיס. נתוני דמו בלבד.
          </p>
          <LabStates title="גודל" value={density} options={DENSITIES} onChange={setDensity} />
          <LabStates title="מצב היום" value={state} options={STATES} onChange={setState} />
          <LabStates title="לוגו בראש המסך" value={logo} options={LOGOS} onChange={setLogo} />
          <LabStates title="הבר התחתון" value={nav} options={NAVS} onChange={setNav} />
          <div className="flex flex-wrap gap-2">
            <Button variant="dark" size="sm" onClick={() => setDrawerOpen(true)}>
              דף האימון
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setBuilderOpen(true)}>
              מחולל האימונים
            </Button>
          </div>
          <div className="mb-2 mt-5 text-[13px] font-extrabold text-v2-deep">מסכים נוספים</div>
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
        <AppHeader name={USER.firstName} streak={USER.streakDays + (state === 'done' ? 1 : 0)} logo={logo} />
        <div className="px-4 pb-4 pt-4">
          <div className={`${pick(density, 'text-[24px]', 'text-[22px]', 'text-[20px]')} font-black leading-tight tracking-v2-tight`}>בוקר טוב, {USER.firstName}</div>
          <div className="text-[13.5px] font-bold text-v2-muted">{TODAY_LABEL}</div>
        </div>
        <div className={pick(density, 'space-y-7', 'space-y-7', 'space-y-5')}>
          {state === 'done' && <DoneToday />}
          <WeekSchedule state={state} />
          <TodayCarousel state={state} onOpen={() => setDrawerOpen(true)} onBuild={() => setBuilderOpen(true)} />
          <ProgressTabs state={state} />
          <NearbyGroups />
          <NearbyParks />
        </div>
      </div>
      <PlusFab />
      <BottomNav active="home" variant={nav} />
      <WorkoutDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <BuilderSheet open={builderOpen} onClose={() => setBuilderOpen(false)} />
    </LabFrame>
  );
}

function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  const c = useDensity() !== 'regular';
  return (
    <div className="mb-3 flex items-center justify-between px-4">
      <h2 className={`${c ? 'text-[17px]' : 'text-[19px]'} font-black !tracking-[-0.02em]`}>{children}</h2>
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
          <div className="text-[16px] font-black">אימון בפארק בוצע</div>
          <div className="text-[13px] font-bold text-v2-muted">{WORKOUT.minutes} דק׳ · 24 סטים · +12% נפח</div>
        </div>
        <Button variant="ghost" size="sm">
          סיכום
        </Button>
      </div>
    </section>
  );
}

/* ── weekly schedule (לו״ז) with a connected streak ─────────────────────── */

function WeekSchedule({ state }: { state: TodayState }) {
  const todayIndex = WEEK.findIndex((d) => d.status === 'today');
  const days: StreakDay[] = WEEK.map((d) =>
    d.status === 'today' ? { ...d, status: state === 'done' ? 'done' : state === 'rest' ? 'rest' : 'today' } : d,
  );
  const streak = USER.streakDays + (state === 'done' ? 1 : 0);
  const d = useDensity();
  return (
    <section aria-label="לו״ז אימונים">
      <SectionTitle
        action={
          <Link href="/design-lab/schedule" className="flex items-center gap-1 text-[14px] font-extrabold text-v2-deep">
            <Pencil size={14} strokeWidth={2.6} aria-hidden />
            שינוי לו״ז
          </Link>
        }
      >
        לו״ז אימונים
      </SectionTitle>
      <Link href="/design-lab/schedule" className="mx-4 block rounded-v2-card bg-white px-2 pb-3 pt-3 shadow-v2-card">
        <DayLetters days={WEEK} todayIndex={todayIndex} />
        <StreakRow days={days} todayIndex={todayIndex} cell={pick(d, 44, 40, 36)} />
        <div className="mt-3 flex items-center justify-center gap-1.5 text-[12.5px] font-bold text-v2-muted">
          <BrandFlame size={24} still />
          <span>
            <b className="font-black text-v2-deep">{streak} ימים ברצף</b> · השיא שלך {USER.bestStreak}
          </span>
        </div>
      </Link>
    </section>
  );
}

/* ── today's workouts: carousel of fade-out cards + the generator ───────── */

const GEAR_ICON = { pullBar: ICON.pullBar, bars: ICON.bars, bench: ICON.bench, door: ICON.door, chair: ICON.chair, mat: ICON.mat } as const;

type Place = 'out' | 'home';
const PLACES: { id: Place; label: string; sub: string; icon: typeof Trees }[] = [
  { id: 'out', label: 'בחוץ', sub: 'פארק / מגרש', icon: Trees },
  { id: 'home', label: 'בבית', sub: 'אימון ביתי', icon: HomeIcon },
];

/** The app's AnchorLocationChip: where today's workouts are planned for. */
function LocationChip({ value, onChange }: { value: Place; onChange: (p: Place) => void }) {
  const [open, setOpen] = useState(false);
  const cur = PLACES.find((p) => p.id === value)!;
  const Icon = cur.icon;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`מיקום האימון: ${cur.label}`}
        className="flex h-9 items-center gap-1.5 rounded-full bg-white pe-2.5 ps-3 text-[13.5px] font-extrabold shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
      >
        <Icon size={15} strokeWidth={2.5} className="text-v2-deep" aria-hidden />
        {cur.label}
        <ChevronDown size={14} strokeWidth={2.6} className="text-v2-muted" aria-hidden />
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.18, ease: EASE_V2 }}
            className="v2-glass-card absolute end-0 top-11 z-[6] w-[180px] origin-top-left rounded-[18px] p-1.5"
          >
            {PLACES.map((p) => {
              const I = p.icon;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(p.id);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center gap-2 rounded-[14px] px-3 py-2 text-start ${p.id === value ? 'bg-v2-tint' : ''}`}
                  >
                    <I size={16} strokeWidth={2.4} className={p.id === value ? 'text-v2-deep' : 'text-v2-muted'} aria-hidden />
                    <span>
                      <span className="block text-[14px] font-extrabold">{p.label}</span>
                      <span className="block text-[11.5px] font-bold text-v2-muted">{p.sub}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

const PHRASES = [
  'תבנה אימון שמתאים למה שיש לך היום',
  'אז מה ה־OUT שלך היום?',
  'כמה זמן יש לך? אני אבנה לך אימון מושלם',
  'רוצה לבנות אימון בעצמך?',
];

function GeneratorButton({ onClick }: { onClick: () => void }) {
  const reduce = useReducedMotion();
  const c = useDensity() !== 'regular';
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setI((v) => (v + 1) % PHRASES.length), 3200);
    return () => clearInterval(t);
  }, [reduce]);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative mx-4 flex ${c ? 'h-12' : 'h-[54px]'} w-[calc(100%-2rem)] items-center justify-center gap-2 overflow-hidden rounded-full p-[2px] transition-transform duration-150 ease-v2 active:scale-[0.98]`}
      style={{ background: 'linear-gradient(90deg,#00baf7,#0cf2e3,#00baf7)', backgroundSize: '200% 100%', animation: reduce ? undefined : 'labShimmer 5.5s linear infinite' }}
    >
      <span className="flex h-full w-full items-center justify-center gap-2 rounded-full bg-white/95 px-4">
        <Sparkles size={17} strokeWidth={2.4} className="shrink-0 text-v2-deep" aria-hidden />
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={i}
            initial={reduce ? false : { opacity: 0, y: 8, filter: 'blur(2px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={reduce ? undefined : { opacity: 0, y: -8, filter: 'blur(2px)' }}
            transition={{ duration: 0.28, ease: EASE_V2 }}
            className="truncate text-[15px] font-extrabold text-v2-deep"
          >
            {PHRASES[i]}
          </motion.span>
        </AnimatePresence>
      </span>
      <style>{'@keyframes labShimmer{from{background-position:0% 0}to{background-position:200% 0}}'}</style>
    </button>
  );
}

function TodayCarousel({ state, onOpen, onBuild }: { state: TodayState; onOpen: () => void; onBuild: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const d = useDensity();
  const c = d !== 'regular';
  const W = pick(d, 300, 284, 284);
  const [index, setIndex] = useState(0);
  const [place, setPlace] = useState<Place>('out');
  const base = place === 'home' ? TODAY_CARDS_HOME : TODAY_CARDS;
  const cards = state === 'rest' ? [...base].reverse() : base;

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const w = (el.firstElementChild as HTMLElement | null)?.offsetWidth ?? 1;
    setIndex(Math.round(Math.abs(el.scrollLeft) / (w + 12)));
  };

  return (
    <section aria-label="האימון של היום">
      <SectionTitle action={<LocationChip value={place} onChange={setPlace} />}>
        {state === 'rest' ? 'יום מנוחה — משהו קל?' : state === 'done' ? 'רוצה עוד משהו?' : 'האימון של היום'}
      </SectionTitle>
      <div
        ref={ref}
        onScroll={onScroll}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-5 pt-1 [scrollbar-width:none]"
        style={{ paddingInline: `calc((100% - ${W}px) / 2)` }}
      >
        {cards.map((card) => (
          <article key={card.id} className={`relative shrink-0 snap-center overflow-hidden ${c ? 'rounded-v2-card' : 'rounded-v2-card-lg'} bg-white shadow-v2-card`} style={{ width: W }}>
            <button type="button" onClick={onOpen} className="block w-full text-start" aria-label={`פרטי ${card.title}`}>
              <div className="relative" style={{ height: pick(d, 230, 200, 200) }}>
                <img
                  src={photo(card.photo)}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover object-[60%_30%]"
                  style={{
                    WebkitMaskImage: 'linear-gradient(180deg,#000 50%,transparent 100%)',
                    maskImage: 'linear-gradient(180deg,#000 50%,transparent 100%)',
                  }}
                />
                <span className="v2-glass-chip absolute start-3 top-3 rounded-full px-3 py-1 text-[12px] font-extrabold text-white">{card.label}</span>
                <span className="absolute bottom-7 end-3 grid h-11 w-11 place-items-center rounded-[14px] bg-white/90 shadow-v2-ring">
                  <AppIcon src={GEAR_ICON[card.gear]} size={26} />
                </span>
              </div>
              <div className="px-4 pb-4">
                <div className="flex items-center gap-2 text-[13px] font-bold text-v2-muted">
                  <span>{card.level === 1 ? 'קל' : card.level === 2 ? 'בינוני' : 'מאתגר'}</span>
                  <Bolts level={card.level} size={13} />
                  <span className="h-3 w-px bg-v2-hairline" />
                  <span className="tabular-nums">{card.minutes} דקות</span>
                </div>
                <h3 className={`mt-1 ${c ? 'text-[18px]' : 'text-[20px]'} font-black leading-tight !tracking-[-0.02em]`}>{card.title}</h3>
              </div>
            </button>
            <div className="px-4 pb-4">
              <Button variant="primary" size={c ? 'sm' : 'md'} block onClick={onOpen} className={c ? '!h-10' : ''}>
                <Play size={16} strokeWidth={2.6} className="fill-current" aria-hidden />
                סקרן לדעת מה באימון?
              </Button>
            </div>
          </article>
        ))}
      </div>
      <div className="mb-4 flex justify-center gap-1.5" aria-hidden>
        {cards.map((card, i) => (
          <span
            key={card.id}
            className={`h-1.5 rounded-full transition-[width,background-color] duration-300 ease-v2 ${i === index ? 'w-6 bg-v2-cta' : 'w-1.5 bg-v2-pill-border'}`}
          />
        ))}
      </div>
      <GeneratorButton onClick={onBuild} />
    </section>
  );
}

/* ── progress / health tabs ─────────────────────────────────────────────── */

function ProgressTabs({ state }: { state: TodayState }) {
  const [tab, setTab] = useState<'progress' | 'health'>('progress');
  const reduce = useReducedMotion();
  const minutes = ACTIVE_MINUTES.done + (state === 'done' ? WORKOUT.minutes : 0);
  const stepsPct = Math.round((STEPS_DETAIL.today / STEPS_DETAIL.goal) * 100);
  const d = useDensity();
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
                  <BrandFlame size={26} still />
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
                  <Ring pct={Math.min(100, stepsPct)} size={pick(d, 128, 116, 104)} stroke={pick(d, 16, 14, 12)} from="#00c07a" to="#39d98a" track="#e7f8f0">
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

/* ── nearby groups (the app's NearbyGroupsRow) ──────────────────────────── */

const GROUP_FILTERS = [
  { id: 'all', label: 'הכל' },
  { id: 'walking', label: 'הליכה' },
  { id: 'running', label: 'ריצה' },
  { id: 'calisthenics', label: 'כוח' },
  { id: 'community', label: 'קהילתי' },
];

function NearbyGroups() {
  const [cat, setCat] = useState('all');
  const list = NEARBY_GROUPS.filter((g) => cat === 'all' || g.cat === cat);
  return (
    <section aria-label="קבוצות קרובות אליך">
      <SectionTitle
        action={
          <Link href="/design-lab/group" className="flex items-center gap-0.5 text-[14px] font-extrabold text-v2-deep">
            הכל <ChevronLeft size={15} strokeWidth={2.6} aria-hidden />
          </Link>
        }
      >
        קבוצות קרובות אליך
      </SectionTitle>
      <div className="mb-3 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none]">
        {GROUP_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setCat(f.id)}
            aria-pressed={cat === f.id}
            className={`h-8 shrink-0 rounded-full px-3.5 text-[12.5px] font-extrabold transition-[transform,background-color] duration-150 ease-v2 active:scale-[0.97] ${
              cat === f.id ? 'bg-v2-ink text-white' : 'bg-white text-v2-ink-2 shadow-v2-ring'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
        {list.map((g) => (
          <Link
            key={g.id}
            href="/design-lab/group"
            className="w-[230px] shrink-0 snap-start overflow-hidden rounded-[22px] bg-white shadow-v2-card transition-transform duration-150 ease-v2 active:scale-[0.98]"
          >
            <div className="relative h-[110px]">
              <img
                src={photo(g.photo)}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
                style={{
                  WebkitMaskImage: 'linear-gradient(180deg,#000 55%,transparent 100%)',
                  maskImage: 'linear-gradient(180deg,#000 55%,transparent 100%)',
                }}
              />
              <span className="v2-glass-chip absolute start-2.5 top-2.5 rounded-full px-2.5 py-1 text-[11.5px] font-extrabold text-white">{g.catLabel}</span>
              <span className="absolute end-2.5 top-2.5 rounded-full bg-white/90 px-2.5 py-1 text-[11.5px] font-extrabold">{g.km}</span>
            </div>
            <div className="px-3 pb-3">
              <div className="truncate text-[15px] font-extrabold">{g.name}</div>
              <div className="mt-0.5 text-[12.5px] font-bold text-v2-deep">המפגש הבא: {g.next}</div>
              <div className="mt-2 flex items-center justify-between">
                <span className="flex -space-x-2 space-x-reverse">
                  {g.letters.map((l, i) => (
                    <span
                      key={i}
                      className="grid h-7 w-7 place-items-center rounded-full text-[11px] font-black ring-2 ring-white"
                      style={{ background: ['#bae6fd', '#c7f9e9', '#fde68a'][i % 3] }}
                    >
                      {l}
                    </span>
                  ))}
                </span>
                <span className="text-[12px] font-extrabold text-v2-ink-2">{g.going} מגיעים</span>
              </div>
            </div>
          </Link>
        ))}
        {list.length === 0 && <div className="py-6 text-[14px] font-bold text-v2-muted">אין קבוצות בקטגוריה זו באזורך</div>}
      </div>
    </section>
  );
}

/* ── the unified "+" (same drawer the map "+" opens) ────────────────────── */

const PLUS_GROUPS = [
  {
    title: 'פעילות',
    items: [
      { label: 'יוצא להתאמן', sub: 'שתף שאתה יוצא לאימון — ריצה, הליכה או כוח', icon: Zap },
      { label: 'פתח קבוצה/ליגה', sub: 'התחל קהילה או ליגה חדשה', icon: Users },
    ],
  },
  {
    title: 'תרומה למפה',
    items: [
      { label: 'הוסף מיקום', sub: 'פארק, גינת כושר או נקודת עניין חדשה', icon: MapPinPlus },
      { label: 'דיווח מהיר', sub: 'ציוד פגום, תאורה, ניקיון ועוד', icon: Flag },
    ],
  },
];

function PlusFab() {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  return (
    <>
      <motion.button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="הוסף"
        whileTap={reduce ? undefined : { scale: 0.94 }}
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+88px)] start-4 z-[6] grid h-14 w-14 place-items-center rounded-full bg-white text-v2-deep shadow-v2-float ring-1 ring-v2-hairline"
      >
        <Plus size={26} strokeWidth={2.6} />
      </motion.button>
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-[10]" role="dialog" aria-modal="true" aria-label="מה תרצה לעשות?">
            <motion.button
              type="button"
              aria-label="סגירה"
              className="absolute inset-0 bg-[#0e1419]/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.div
              className="absolute inset-x-0 bottom-0 rounded-t-[28px] bg-white px-4 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-2.5 shadow-v2-sheet"
              initial={reduce ? { opacity: 0 } : { y: '100%' }}
              animate={reduce ? { opacity: 1 } : { y: 0 }}
              exit={reduce ? { opacity: 0 } : { y: '100%' }}
              transition={{ duration: 0.38, ease: [0.32, 0.72, 0, 1] }}
            >
              <div className="mb-3 flex justify-center">
                <span className="h-1.5 w-10 rounded-full bg-v2-pill-border" />
              </div>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[20px] font-black !tracking-[-0.02em]">מה תרצה לעשות?</h2>
                <button type="button" onClick={() => setOpen(false)} aria-label="סגירה" className="grid h-9 w-9 place-items-center rounded-full bg-v2-surface ring-1 ring-inset ring-v2-hairline">
                  <X size={17} strokeWidth={2.6} />
                </button>
              </div>
              {PLUS_GROUPS.map((g) => (
                <div key={g.title} className="mb-3">
                  <div className="mb-1.5 px-1 text-[12px] font-extrabold text-v2-muted">{g.title}</div>
                  <ul className="space-y-2">
                    {g.items.map(({ label, sub, icon: Icon }) => (
                      <li key={label}>
                        <button type="button" className="flex w-full items-center gap-3 rounded-[18px] bg-white p-3 text-start shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.98]">
                          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-v2-tint text-v2-deep">
                            <Icon size={20} strokeWidth={2.4} aria-hidden />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[15.5px] font-black">{label}</span>
                            <span className="block truncate text-[12.5px] font-bold text-v2-muted">{sub}</span>
                          </span>
                          <ChevronLeft size={17} strokeWidth={2.6} className="text-v2-muted" aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
