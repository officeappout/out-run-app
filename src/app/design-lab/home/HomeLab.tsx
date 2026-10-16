'use client';

import { useEffect, useState, type ComponentType } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Bell,
  Check,
  ChevronLeft,
  Clock,
  Dumbbell,
  Flame,
  Footprints,
  Home,
  Map as MapIcon,
  Moon,
  Play,
  Plus,
  Sparkles,
  Swords,
  User,
  Users,
  Wind,
  Zap,
  type LucideProps,
} from 'lucide-react';
import { BarChart, Button, Card, Chip, IconTile, StatNumber, EASE_V2 } from '@/components/ui/v2';
import LabFrame, { LabStates } from '../_shared/LabFrame';
import WorkoutDrawer from './WorkoutDrawer';
import {
  ACTIVE_MINUTES,
  AGENDA,
  DIFFICULTY_LABEL,
  PROGRAM,
  STEPS,
  SUGGESTIONS,
  TODAY_LABEL,
  USER,
  WEEK,
  WORKOUT,
  type DayStatus,
  type TodayState,
} from './fixtures';

const STATES: { id: TodayState; label: string }[] = [
  { id: 'planned', label: 'יש אימון היום' },
  { id: 'done', label: 'האימון הושלם' },
  { id: 'rest', label: 'יום מנוחה' },
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
            דף הבית בשפת האתר: כרטיס האימון, הלו״ז, הווידג׳טים ומגירת האימון. נתוני דמו בלבד.
          </p>
          <LabStates title="מצב היום" value={state} options={STATES} onChange={setState} />
          <Button variant="dark" size="sm" onClick={() => setDrawerOpen(true)}>
            פתח את מגירת האימון
          </Button>
        </div>
      }
    >
      <div className="h-full overflow-y-auto overscroll-contain pb-32">
        <HomeHeader />
        <div className="space-y-7 px-4">
          <section aria-label="האימון של היום">
            <SectionTitle>האימון של היום</SectionTitle>
            {state === 'planned' && <WorkoutHeroCard onOpen={() => setDrawerOpen(true)} />}
            {state === 'done' && <WorkoutDoneCard />}
            {state === 'rest' && <RestDayCard />}
            <Suggestions />
          </section>

          <WeekSchedule state={state} />

          <section aria-label="ההתקדמות שלי" className="space-y-3">
            <SectionTitle>ההתקדמות שלי</SectionTitle>
            <StepsCard />
            <div className="grid grid-cols-2 gap-3">
              <ProgramCard />
              <ActiveMinutesCard state={state} />
            </div>
          </section>

          <BattleTeaser />
        </div>
      </div>
      <BottomNav />
      <WorkoutDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </LabFrame>
  );
}

/* ── header ─────────────────────────────────────────────────────────────── */

function HomeHeader() {
  return (
    <header className="flex items-center gap-3 px-4 pb-5 pt-[calc(env(safe-area-inset-top)+18px)]">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-v2-cta text-[17px] font-black text-v2-on-cta">
        {USER.firstName[0]}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[22px] font-black leading-tight tracking-v2-tight">בוקר טוב, {USER.firstName}</div>
        <div className="text-[13px] font-bold text-v2-muted">{TODAY_LABEL}</div>
      </div>
      <Chip tone="accent" icon={<Flame size={14} strokeWidth={2.6} aria-hidden />}>
        {USER.streakDays} ימים ברצף
      </Chip>
      <button
        type="button"
        aria-label="התראות"
        className="relative grid h-10 w-10 place-items-center rounded-full bg-white shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
      >
        <Bell size={18} strokeWidth={2.4} />
        <span className="absolute end-2 top-2 h-2 w-2 rounded-full bg-v2-accent ring-2 ring-white" />
      </button>
    </header>
  );
}

function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between">
      <h2 className="text-[19px] font-black !tracking-[-0.02em]">{children}</h2>
      {action}
    </div>
  );
}

/* ── today's workout ────────────────────────────────────────────────────── */

function Bolts({ level, inverted = false }: { level: 1 | 2 | 3; inverted?: boolean }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`רמת קושי: ${DIFFICULTY_LABEL[level]}`}>
      {[1, 2, 3].map((n) => (
        <Zap
          key={n}
          size={14}
          strokeWidth={2.2}
          aria-hidden
          className={n <= level ? 'fill-v2-amber text-v2-amber' : inverted ? 'text-white/40' : 'text-v2-pill-border'}
        />
      ))}
    </span>
  );
}

function WorkoutHeroCard({ onOpen }: { onOpen: () => void }) {
  const reduce = useReducedMotion();
  const weekPct = (WORKOUT.weekDone / WORKOUT.weekTarget) * 100;
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE_V2 }}
    >
      <Card padding="none" className="overflow-hidden !rounded-v2-card-lg">
        <button type="button" onClick={onOpen} className="relative block h-[232px] w-full text-start" aria-label="פרטי האימון">
          <img src={WORKOUT.photo} alt="" className="absolute inset-0 h-full w-full object-cover object-[60%_30%]" />
          <span className="absolute inset-0 bg-gradient-to-t from-[#0e1419]/80 via-[#0e1419]/10 to-transparent" />
          <span className="absolute inset-x-4 top-4 flex items-center justify-between">
            <Chip tone="glass-dark">{WORKOUT.program}</Chip>
            <Chip tone="glass-dark" icon={<Bolts level={WORKOUT.difficulty} inverted />}>
              {DIFFICULTY_LABEL[WORKOUT.difficulty]}
            </Chip>
          </span>
          <span className="absolute inset-x-4 bottom-4 text-white">
            <span className="block text-[26px] font-black leading-[1.05] tracking-v2-tight">{WORKOUT.title}</span>
            <span className="mt-1 block text-[14px] font-bold text-white/80">
              {WORKOUT.minutes} דק׳ · {WORKOUT.sets} סטים · {WORKOUT.muscles.slice(0, 3).join(' · ')}
            </span>
          </span>
        </button>
        <div className="p-4">
          <div className="mb-4 flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-v2-tint">
              <div className="h-full rounded-full bg-v2-cta" style={{ width: `${weekPct}%` }} />
            </div>
            <span className="text-[13px] font-extrabold tabular-nums text-v2-ink-2">
              אימון {WORKOUT.weekDone + 1} מתוך {WORKOUT.weekTarget} השבוע
            </span>
          </div>
          <div className="flex gap-2">
            <Button variant="primary" size="lg" block className="flex-1">
              <Play size={18} strokeWidth={2.6} className="fill-current" aria-hidden />
              בואו נתחיל
            </Button>
            <Button variant="ghost" size="lg" onClick={onOpen} className="!px-5">
              מה באימון?
            </Button>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

function WorkoutDoneCard() {
  return (
    <Card variant="dark" padding="none" className="overflow-hidden !rounded-v2-card-lg">
      <div className="relative p-5">
        <div className="pointer-events-none absolute -end-10 -top-16 h-48 w-48 rounded-full bg-v2-cta opacity-25 blur-2xl" />
        <div className="relative flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-v2-cta text-v2-on-cta">
            <Check size={26} strokeWidth={3} aria-hidden />
          </span>
          <div>
            <div className="text-[22px] font-black leading-tight tracking-v2-tight">כל הכבוד, {USER.firstName}!</div>
            <div className="text-[14px] font-bold text-white/70">{WORKOUT.title} הושלם</div>
          </div>
        </div>
        <div className="relative mt-5 grid grid-cols-3 gap-2">
          {[
            { v: '35', u: 'דק׳', l: 'משך' },
            { v: '24', u: 'סטים', l: 'בוצעו' },
            { v: '+12%', u: '', l: 'נפח מול שבוע שעבר' },
          ].map((s) => (
            <div key={s.l} className="rounded-[16px] bg-white/[0.07] px-3 py-3">
              <div className="text-[22px] font-black leading-none tabular-nums tracking-v2-tighter">
                {s.v} <span className="text-[12px] font-bold text-white/60">{s.u}</span>
              </div>
              <div className="mt-1.5 text-[12px] font-bold leading-snug text-white/60">{s.l}</div>
            </div>
          ))}
        </div>
        <div className="relative mt-5 flex gap-2">
          <Button variant="primary" block className="flex-1">
            לסיכום האימון
          </Button>
          <Button variant="ghost" className="!border-white/20 !bg-white/10 !text-white">
            שתף
          </Button>
        </div>
      </div>
    </Card>
  );
}

function RestDayCard() {
  return (
    <div className="rounded-v2-card-lg border border-v2-hairline-cool bg-gradient-to-br from-[#e8f9fe] to-[#e9fdfb] p-5">
      <span className="grid h-12 w-12 place-items-center rounded-[14px] bg-white text-v2-deep">
        <Moon size={22} strokeWidth={2.4} aria-hidden />
      </span>
      <div className="mt-4 text-[22px] font-black leading-tight tracking-v2-tight">יום מנוחה</div>
      <p className="mt-1 text-[15px] leading-relaxed text-v2-ink-2">
        השרירים נבנים בזמן המנוחה. הליכה קלה או מתיחות יעזרו לגוף להתאושש.
      </p>
      <div className="mt-4 flex items-center justify-between rounded-[18px] bg-white px-4 py-3">
        <div>
          <div className="text-[13px] font-bold text-v2-muted">האימון הבא</div>
          <div className="text-[15px] font-extrabold">שבת · הליכה קבוצתית 18:30</div>
        </div>
        <ChevronLeft size={18} strokeWidth={2.4} className="text-v2-muted" aria-hidden />
      </div>
      <Button variant="ghost" block className="mt-3">
        הליכה קלה של 20 דק׳
      </Button>
    </div>
  );
}

const SUGGESTION_ICON: Record<'run' | 'steps' | 'accent', ComponentType<LucideProps>> = {
  run: Wind,
  steps: Footprints,
  accent: Sparkles,
};

function Suggestions() {
  return (
    <div className="-mx-4 mt-3 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
      {SUGGESTIONS.map((s) => (
        <button
          key={s.title}
          type="button"
          className="flex w-[200px] shrink-0 snap-start items-center gap-3 rounded-[20px] bg-white p-3 text-start shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
        >
          <IconTile icon={SUGGESTION_ICON[s.tone]} tone={s.tone} />
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-extrabold">{s.title}</span>
            <span className="block truncate text-[12.5px] font-bold text-v2-muted">{s.meta}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

/* ── weekly schedule (לו״ז) ─────────────────────────────────────────────── */

function DayDot({ status, date, state }: { status: DayStatus; date: number; state: TodayState }) {
  const s: DayStatus = status === 'today' && state === 'done' ? 'done' : status;
  const isToday = status === 'today';
  const base = 'grid h-10 w-10 place-items-center rounded-full text-[15px] font-black tabular-nums';
  if (s === 'done')
    return (
      <span className={`${base} bg-v2-cta text-v2-on-cta ${isToday ? 'ring-2 ring-v2-ink ring-offset-2' : ''}`}>
        <Check size={18} strokeWidth={3} aria-hidden />
      </span>
    );
  if (s === 'today')
    return <span className={`${base} bg-v2-ink text-white ${state === 'rest' ? 'opacity-90' : ''}`}>{date}</span>;
  if (s === 'planned')
    return <span className={`${base} border-2 border-dashed border-v2-accent/70 text-v2-ink`}>{date}</span>;
  if (s === 'missed') return <span className={`${base} bg-v2-surface text-v2-muted line-through decoration-2`}>{date}</span>;
  return <span className={`${base} text-v2-muted`}>{date}</span>;
}

const KIND_ICON = { strength: Dumbbell, walk: Footprints, run: Wind } as const;

function WeekSchedule({ state }: { state: TodayState }) {
  const done = WEEK.filter((d) => d.status === 'done').length + (state === 'done' ? 1 : 0);
  const agenda = state === 'rest' ? AGENDA.filter((a) => a.kind !== 'strength') : AGENDA;
  return (
    <section aria-label="הלו״ז שלי">
      <SectionTitle
        action={
          <button type="button" className="text-[14px] font-extrabold text-v2-deep">
            עריכה
          </button>
        }
      >
        הלו״ז שלי
      </SectionTitle>
      <Card padding="none" className="overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-4">
          <span className="text-[13px] font-extrabold text-v2-muted">11–17 באוקטובר</span>
          <Chip tone="accent">
            {done} מתוך 4 אימונים
          </Chip>
        </div>
        <ol className="grid grid-cols-7 px-2 pb-4 pt-3">
          {WEEK.map((d) => {
            const Icon = d.kind ? KIND_ICON[d.kind] : null;
            const isToday = d.status === 'today';
            return (
              <li key={d.date} className="flex flex-col items-center gap-1.5">
                <span className={`text-[12px] font-extrabold ${isToday ? 'text-v2-ink' : 'text-v2-muted'}`}>{d.short}</span>
                <DayDot status={d.status} date={d.date} state={state} />
                <span className="h-3.5">
                  {Icon && !(isToday && state === 'rest') && (
                    <Icon size={13} strokeWidth={2.4} className="text-v2-muted" aria-hidden />
                  )}
                </span>
              </li>
            );
          })}
        </ol>
        <div className="border-t border-v2-hairline px-4 py-3">
          <div className="mb-2 text-[13px] font-extrabold text-v2-muted">היום</div>
          <ol className="relative space-y-1">
            {agenda.map((a) => {
              const now = a.now && state === 'planned';
              const doneRow = a.kind === 'strength' && state === 'done';
              const Icon = a.kind === 'strength' ? Dumbbell : a.kind === 'steps' ? Footprints : Users;
              const tone = a.kind === 'steps' ? 'steps' : 'accent';
              return (
                <li
                  key={a.time}
                  className={`flex items-center gap-3 rounded-[16px] px-2 py-2 ${now ? 'bg-v2-tint' : ''}`}
                >
                  <span className="w-11 shrink-0 text-[13px] font-extrabold tabular-nums text-v2-muted">{a.time}</span>
                  {doneRow ? (
                    <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-v2-cta text-v2-on-cta">
                      <Check size={16} strokeWidth={3} aria-hidden />
                    </span>
                  ) : (
                    <IconTile icon={Icon} tone={tone} size="sm" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-[15px] font-extrabold ${doneRow ? 'text-v2-muted line-through' : ''}`}>
                      {a.title}
                    </span>
                    <span className="block truncate text-[12.5px] font-bold text-v2-muted">{a.meta}</span>
                  </span>
                  {a.kind === 'group' && <Faces count={3} />}
                  {now && <span className="text-[12px] font-extrabold text-v2-deep">עכשיו</span>}
                </li>
              );
            })}
          </ol>
          <button
            type="button"
            className="mt-2 flex h-10 w-full items-center justify-center gap-1.5 rounded-full text-[14px] font-extrabold text-v2-deep transition-colors duration-150 hover:bg-v2-tint"
          >
            <Plus size={16} strokeWidth={2.6} aria-hidden />
            הוספה ללו״ז
          </button>
        </div>
      </Card>
    </section>
  );
}

function Faces({ count }: { count: number }) {
  const colors = ['#00baf7', '#0cf2e3', '#ffc83d', '#39d98a'];
  const letters = ['מ', 'ר', 'א', 'ע'];
  return (
    <span className="flex shrink-0 -space-x-2 space-x-reverse ps-1" aria-label={`${count} משתתפים`}>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="grid h-7 w-7 place-items-center rounded-full text-[11px] font-black text-v2-on-cta ring-2 ring-white"
          style={{ background: colors[i % colors.length] }}
        >
          {letters[i % letters.length]}
        </span>
      ))}
    </span>
  );
}

/* ── widgets ────────────────────────────────────────────────────────────── */

function StepsCard() {
  const pct = Math.min(100, Math.round((STEPS.today / STEPS.goal) * 100));
  return (
    <Card padding="lg">
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <IconTile icon={Footprints} tone="steps" />
          <div>
            <div className="text-[13px] font-extrabold text-v2-muted">צעדים היום</div>
            <StatNumber value={STEPS.today} unit={`/ ${STEPS.goal.toLocaleString('he-IL')}`} size="md" countUp />
          </div>
        </div>
        <span className="rounded-full bg-activity-steps/10 px-3 py-1 text-[13px] font-extrabold tabular-nums text-[#00865a]">
          {pct}%
        </span>
      </div>
      <BarChart
        data={STEPS.week}
        goal={STEPS.goal}
        goalLabel="יעד"
        highlightKey="fr"
        color="#00c07a"
        height={84}
        dir="rtl"
        ariaLabel="צעדים השבוע"
      />
    </Card>
  );
}

function Ring({ pct, size = 76, stroke = 8, track = 'rgba(255,255,255,0.12)' }: { pct: number; size?: number; stroke?: number; track?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const reduce = useReducedMotion();
  const id = `ring-${size}-${stroke}`;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#00baf7" />
          <stop offset="1" stopColor="#0cf2e3" />
        </linearGradient>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={`url(#${id})`}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        initial={reduce ? false : { strokeDashoffset: c }}
        animate={{ strokeDashoffset: c * (1 - pct / 100) }}
        transition={{ duration: 0.9, ease: EASE_V2 }}
      />
    </svg>
  );
}

function ProgramCard() {
  return (
    <Card variant="dark" padding="md" className="flex flex-col">
      <div className="text-[13px] font-extrabold text-white/60">התוכנית שלי</div>
      <div className="text-[16px] font-black">{PROGRAM.name}</div>
      <div className="relative my-3 self-center">
        <Ring pct={PROGRAM.pct} />
        <span className="absolute inset-0 grid place-items-center text-center">
          <span>
            <span className="block text-[11px] font-bold leading-none text-white/60">רמה</span>
            <span className="block text-[24px] font-black leading-none tabular-nums">{PROGRAM.level}</span>
          </span>
        </span>
      </div>
      <div className="text-center text-[12.5px] font-bold leading-snug text-white/70">
        עוד {PROGRAM.toNext} אימונים לרמה {PROGRAM.level + 1}
      </div>
    </Card>
  );
}

function ActiveMinutesCard({ state }: { state: TodayState }) {
  const done = ACTIVE_MINUTES.done + (state === 'done' ? WORKOUT.minutes : 0);
  const pct = Math.min(100, Math.round((done / ACTIVE_MINUTES.goal) * 100));
  return (
    <Card padding="md" className="flex flex-col">
      <div className="flex items-center gap-2">
        <IconTile icon={Clock} size="sm" />
        <div className="text-[13px] font-extrabold text-v2-muted">דקות פעילות</div>
      </div>
      <div className="mt-3">
        <StatNumber value={done} unit={`/ ${ACTIVE_MINUTES.goal}`} size="md" />
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-v2-tint">
        <motion.div
          className="h-full origin-right rounded-full bg-v2-cta"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: pct / 100 }}
          transition={{ duration: 0.8, ease: EASE_V2 }}
        />
      </div>
      <p className="mt-auto pt-3 text-[12px] font-bold leading-snug text-v2-muted">
        ארגון הבריאות העולמי ממליץ על 150 דקות פעילות בשבוע
      </p>
    </Card>
  );
}

function BattleTeaser() {
  return (
    <section aria-label="קרב השבוע">
      <button
        type="button"
        className="grid w-full justify-items-start gap-1.5 rounded-[22px] border border-v2-hairline-cool bg-gradient-to-br from-[#e8f9fe] to-[#e9fdfb] p-5 text-start transition-transform duration-150 ease-v2 active:scale-[0.98]"
      >
        <span className="mb-1 grid h-[42px] w-[42px] place-items-center rounded-[14px] bg-white text-v2-deep">
          <Swords size={20} strokeWidth={2.4} aria-hidden />
        </span>
        <span className="text-[17px] font-black">קרב השבוע</span>
        <span className="text-[14.5px] leading-normal text-v2-ink-2">השכונה שלך מובילה ב־340 דקות. נשארו יומיים.</span>
        <span className="mt-1 flex items-center gap-2.5 text-v2-amber">
          <i className="rounded-full bg-white px-3 py-1.5 text-[14px] font-extrabold not-italic text-v2-ink">הצפון הישן</i>
          <Zap size={16} className="fill-current" aria-hidden />
          <i className="rounded-full bg-white px-3 py-1.5 text-[14px] font-extrabold not-italic text-v2-ink">פלורנטין</i>
        </span>
      </button>
    </section>
  );
}

/* ── bottom nav ─────────────────────────────────────────────────────────── */

function BottomNav() {
  const items = [
    { label: 'בית', icon: Home, active: true },
    { label: 'מפה', icon: MapIcon },
    { label: 'קהילה', icon: Users },
    { label: 'פרופיל', icon: User },
  ];
  return (
    <nav
      aria-label="ניווט ראשי"
      className="v2-glass-bar fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+14px)] z-[5] flex h-16 items-center justify-around rounded-full shadow-v2-float"
    >
      {items.map(({ label, icon: Icon, active }) => (
        <button
          key={label}
          type="button"
          aria-current={active ? 'page' : undefined}
          className={`flex h-12 min-w-[64px] flex-col items-center justify-center gap-0.5 rounded-full text-[11px] font-extrabold transition-transform duration-150 ease-v2 active:scale-[0.97] ${
            active ? 'text-v2-ink' : 'text-v2-muted'
          }`}
        >
          <Icon size={21} strokeWidth={active ? 2.6 : 2.2} aria-hidden />
          {label}
          <span className={`h-1 w-4 rounded-full ${active ? 'bg-v2-cta' : 'bg-transparent'}`} />
        </button>
      ))}
    </nav>
  );
}
