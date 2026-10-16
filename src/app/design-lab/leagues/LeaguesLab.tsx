'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Bell,
  ChevronUp,
  ChevronDown,
  Crown,
  Dumbbell,
  Footprints,
  Home,
  Info,
  Map as MapIcon,
  Shield,
  Swords,
  Timer,
  User,
  UserPlus,
  Users,
  Wind,
  Zap,
} from 'lucide-react';
import { Button, Card, Chip, IconTile, EASE_V2 } from '@/components/ui/v2';
import LabFrame, { LabStates } from '../_shared/LabFrame';
import {
  BATTLE,
  CITIES,
  CITY_CHALLENGE,
  DIVISIONS,
  MY_DIVISION,
  NEIGHBORHOODS,
  POINTS_RULES,
  SEASON,
  UNITS,
  type LeagueTab,
} from './fixtures';

const TABS: { id: LeagueTab; label: string }[] = [
  { id: 'people', label: 'אישי' },
  { id: 'neighborhoods', label: 'שכונות' },
  { id: 'cities', label: 'ערים' },
  { id: 'units', label: 'חטיבות' },
];

export default function LeaguesLab() {
  const [tab, setTab] = useState<LeagueTab>('people');
  const reduce = useReducedMotion();

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    if (TABS.some((x) => x.id === t)) setTab(t as LeagueTab);
  }, []);

  return (
    <LabFrame
      panel={
        <div>
          <div className="mb-1 text-[22px] font-black tracking-v2-tight">Design lab · ליגות</div>
          <p className="mb-6 text-[14px] leading-relaxed text-v2-ink-2">
            תחרות בין אנשים, שכונות, ערים וחטיבות. הניקוד הוא ממוצע למשתתף פעיל, כך שגם קבוצה קטנה יכולה לנצח. נתוני דמו בלבד.
          </p>
          <LabStates title="ליגה" value={tab} options={TABS} onChange={setTab} />
        </div>
      }
    >
      <div className="h-full overflow-y-auto overscroll-contain pb-32">
        <header className="px-4 pb-4 pt-[calc(env(safe-area-inset-top)+18px)]">
          <div className="flex items-center justify-between">
            <h1 className="text-[30px] font-black leading-none !tracking-[-0.03em]">ליגות</h1>
            <button
              type="button"
              aria-label="התראות"
              className="grid h-10 w-10 place-items-center rounded-full bg-white shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
            >
              <Bell size={18} strokeWidth={2.4} />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Chip tone="accent">
              {SEASON.name} · שבוע {SEASON.week} מתוך {SEASON.weeks}
            </Chip>
            <Chip tone="neutral" icon={<Timer size={13} strokeWidth={2.6} aria-hidden />}>
              השבוע נסגר בעוד {SEASON.daysLeft} ימים
            </Chip>
          </div>
        </header>

        <div className="sticky top-0 z-[2] bg-v2-surface/95 px-4 pb-3 pt-1">
          <div className="grid grid-cols-4 rounded-full bg-white p-1 shadow-v2-ring" role="tablist">
            {TABS.map((t) => {
              const on = t.id === tab;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setTab(t.id)}
                  className={`relative h-10 rounded-full text-[14px] font-extrabold transition-colors duration-200 ${on ? 'text-white' : 'text-v2-ink-2'}`}
                >
                  {on && (
                    <motion.span
                      layoutId="lab-league-tab"
                      className="absolute inset-0 rounded-full bg-v2-ink"
                      transition={{ duration: reduce ? 0 : 0.32, ease: EASE_V2 }}
                    />
                  )}
                  <span className="relative">{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            className="space-y-4 px-4"
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -6 }}
            transition={{ duration: 0.24, ease: EASE_V2 }}
          >
            {tab === 'people' && <PeopleLeague />}
            {tab === 'neighborhoods' && <NeighborhoodLeague />}
            {tab === 'cities' && <CityLeague />}
            {tab === 'units' && <UnitLeague />}
          </motion.div>
        </AnimatePresence>
      </div>
      <BottomNav />
    </LabFrame>
  );
}

/* ── shared pieces ──────────────────────────────────────────────────────── */

function Delta({ value, inverted = false }: { value: number; inverted?: boolean }) {
  if (value === 0) return <span className={`w-7 text-center text-[12px] font-extrabold ${inverted ? 'text-white/40' : 'text-v2-muted'}`}>–</span>;
  const up = value > 0;
  const Icon = up ? ChevronUp : ChevronDown;
  const color = up ? (inverted ? 'text-[#5ff0b6]' : 'text-[#00845a]') : inverted ? 'text-[#ff9b9e]' : 'text-[#c8353a]';
  return (
    <span className={`flex w-7 items-center justify-center text-[12px] font-extrabold tabular-nums ${color}`} aria-label={up ? `עלה ${value}` : `ירד ${-value}`}>
      <Icon size={14} strokeWidth={3} aria-hidden />
      {Math.abs(value)}
    </span>
  );
}

function RankTile({ rank, inverted = false, me = false }: { rank: number; inverted?: boolean; me?: boolean }) {
  if (rank === 1)
    return (
      <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-v2-gold text-v2-on-gold">
        <Crown size={15} strokeWidth={2.4} className="fill-current" aria-label="מקום ראשון" />
      </span>
    );
  return (
    <span
      className={`grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full text-[14px] font-black tabular-nums ${
        inverted ? 'bg-white/10' : me ? 'bg-white text-v2-ink' : 'bg-v2-surface text-v2-ink-2'
      }`}
    >
      {rank}
    </span>
  );
}

/** Light table row — neighborhoods, cities, units. */
function Row({
  rank,
  name,
  sub,
  value,
  unit,
  delta,
  me = false,
  extra,
}: {
  rank: number;
  name: string;
  sub?: string;
  value: string;
  unit: string;
  delta: number;
  me?: boolean;
  extra?: ReactNode;
}) {
  return (
    <li className={`flex items-center gap-3 rounded-[16px] px-3 py-3 ${me ? 'bg-v2-tint ring-1 ring-inset ring-v2-accent/30' : ''}`}>
      <RankTile rank={rank} me={me} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[15px] font-extrabold">{name}</span>
          {me && <span className="rounded-full bg-v2-ink px-2 py-0.5 text-[10.5px] font-extrabold text-white">שלך</span>}
        </span>
        {sub && <span className="block truncate text-[12.5px] font-bold text-v2-muted">{sub}</span>}
        {extra}
      </span>
      <span className="text-end">
        <span className="block text-[16px] font-black leading-none tabular-nums">{value}</span>
        <span className="text-[11px] font-bold text-v2-muted">{unit}</span>
      </span>
      <Delta value={delta} />
    </li>
  );
}

function FairNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-[16px] bg-white px-3 py-2.5 text-[12.5px] font-bold leading-snug text-v2-ink-2 shadow-v2-ring">
      <Info size={15} strokeWidth={2.4} className="mt-px shrink-0 text-v2-deep" aria-hidden />
      <span>{children}</span>
    </div>
  );
}

/* ── personal league: divisions with promotion and relegation ───────────── */

function PeopleLeague() {
  const d = MY_DIVISION;
  const current = DIVISIONS.findIndex((x) => x.id === d.division);
  const next = DIVISIONS[current + 1];
  const promoLine = d.rows[d.promoteTop - 1].points;
  const pct = Math.min(100, Math.round((d.me.points / promoLine) * 100));
  return (
    <>
      <Card variant="dark" padding="none" className="overflow-hidden !rounded-v2-card-lg">
        <div className="relative p-5 pb-4">
          <div className="pointer-events-none absolute -end-12 -top-20 h-52 w-52 rounded-full bg-v2-cta opacity-20 blur-2xl" />
          <div className="relative flex items-center gap-3">
            <span
              className="grid h-12 w-12 place-items-center rounded-[14px]"
              style={{ background: `${DIVISIONS[current].color}33`, color: DIVISIONS[current].color }}
            >
              <Shield size={24} strokeWidth={2.4} className="fill-current" aria-hidden />
            </span>
            <div className="flex-1">
              <div className="text-[20px] font-black leading-tight">ליגת {DIVISIONS[current].label}</div>
              <div className="text-[13px] font-bold text-white/60">{d.size} מתאמנים ברמה שלך · מתעדכן כל שעה</div>
            </div>
            <div className="text-end">
              <div className="text-[28px] font-black leading-none tabular-nums tracking-v2-tighter">#{d.me.rank}</div>
              <div className="text-[12px] font-bold text-white/60">{d.me.points} נק׳</div>
            </div>
          </div>
          <div className="relative mt-4">
            <div className="mb-1.5 flex justify-between text-[12.5px] font-bold">
              <span className="text-white/80">עוד {d.me.toPromotion} נק׳ לאזור העלייה</span>
              {next && <span className="text-white/50">ליגת {next.label}</span>}
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <motion.div
                className="h-full origin-right rounded-full bg-v2-cta"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: pct / 100 }}
                transition={{ duration: 0.8, ease: EASE_V2 }}
              />
            </div>
          </div>
          <ol className="relative mt-4 flex items-center gap-1.5" aria-label="דרגות הליגה">
            {DIVISIONS.map((x, i) => (
              <li
                key={x.id}
                className={`flex-1 rounded-full py-1 text-center text-[12px] font-extrabold ${
                  i === current ? 'bg-white text-v2-ink' : i < current ? 'bg-white/10 text-white/60' : 'bg-white/[0.04] text-white/35'
                }`}
              >
                {x.label}
              </li>
            ))}
          </ol>
        </div>

        <ol className="space-y-1.5 px-3 pb-3">
          {d.rows.map((r, i) => {
            const rank = i + 1;
            return (
              <li key={r.name}>
                <div
                  className={`flex items-center gap-3 rounded-[16px] px-3.5 py-3 ${
                    r.me ? 'bg-gradient-to-l from-[#00baf7]/40 to-[#0cf2e3]/20' : 'bg-white/[0.06]'
                  }`}
                >
                  <RankTile rank={rank} inverted />
                  <span className="flex-1 text-[15px] font-extrabold">{r.name}</span>
                  <span className="text-[15px] font-black tabular-nums">
                    {r.points} <small className="text-[11px] font-bold text-white/60">נק׳</small>
                  </span>
                  <Delta value={r.delta} inverted />
                </div>
                {rank === d.promoteTop && (
                  <div className="flex items-center gap-2 px-2 py-2 text-[11.5px] font-extrabold text-[#5ff0b6]">
                    <ChevronUp size={14} strokeWidth={3} aria-hidden />
                    עולים לליגת {next?.label}
                    <span className="h-px flex-1 border-t border-dashed border-[#5ff0b6]/40" />
                  </div>
                )}
              </li>
            );
          })}
          <li className="py-1 text-center text-[13px] font-black tracking-[0.3em] text-white/30">···</li>
          <li className="flex items-center gap-2 px-2 pb-1 text-[11.5px] font-extrabold text-[#ff9b9e]">
            <ChevronDown size={14} strokeWidth={3} aria-hidden />
            יורדים לליגת {DIVISIONS[current - 1]?.label}
            <span className="h-px flex-1 border-t border-dashed border-[#ff9b9e]/40" />
          </li>
          {d.bottom.map((r) => (
            <li key={r.name} className="flex items-center gap-3 rounded-[16px] bg-[#e5484d]/[0.10] px-3.5 py-3">
              <RankTile rank={r.rank} inverted />
              <span className="flex-1 text-[15px] font-extrabold text-white/80">{r.name}</span>
              <span className="text-[15px] font-black tabular-nums text-white/80">
                {r.points} <small className="text-[11px] font-bold text-white/50">נק׳</small>
              </span>
              <Delta value={r.delta} inverted />
            </li>
          ))}
        </ol>
      </Card>

      <Card padding="lg">
        <div className="mb-3 text-[17px] font-black">איך צוברים נקודות</div>
        <ul className="space-y-2">
          {POINTS_RULES.map((r, i) => (
            <li key={r.label} className="flex items-center gap-3">
              <IconTile icon={[Dumbbell, Wind, Footprints, Users][i]} tone={i === 2 ? 'steps' : i === 1 ? 'run' : 'accent'} size="sm" />
              <span className="flex-1 text-[14.5px] font-bold text-v2-ink-2">{r.label}</span>
              <span className="text-[15px] font-black tabular-nums">{r.pts}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12.5px] font-bold leading-snug text-v2-muted">
          מתחרים מול אנשים ברמה דומה, לא מול כל העיר. כל סוג פעילות נחשב.
        </p>
      </Card>

      <Button variant="ghost" size="lg" block>
        <UserPlus size={18} strokeWidth={2.4} aria-hidden />
        אתגר חבר לשבוע הזה
      </Button>
    </>
  );
}

/* ── neighborhoods: weekly head-to-head + the city table ────────────────── */

function TugBar({ a, b, aLabel, bLabel }: { a: number; b: number; aLabel: string; bLabel: string }) {
  const pct = Math.round((a / (a + b)) * 100);
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-v2-ink/90" aria-label={`${aLabel} ${pct}% מול ${bLabel}`}>
        <motion.div
          className="h-full rounded-full bg-v2-cta"
          initial={{ width: '50%' }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.9, ease: EASE_V2 }}
        />
      </div>
    </div>
  );
}

function NeighborhoodLeague() {
  const b = BATTLE;
  const lead = b.mine.perMember - b.rival.perMember;
  return (
    <>
      <div className="rounded-v2-card-lg border border-v2-hairline-cool bg-gradient-to-br from-[#e8f9fe] to-[#e9fdfb] p-5">
        <div className="flex items-center gap-3">
          <span className="grid h-[42px] w-[42px] place-items-center rounded-[14px] bg-white text-v2-deep">
            <Swords size={20} strokeWidth={2.4} aria-hidden />
          </span>
          <div className="flex-1">
            <div className="text-[17px] font-black">קרב השבוע</div>
            <div className="text-[13px] font-bold text-v2-ink-2">נסגר בעוד {b.daysLeft} ימים</div>
          </div>
          <Chip tone="accent">מובילים ב־{lead} נק׳</Chip>
        </div>

        <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-end gap-2">
          <div>
            <div className="text-[14px] font-extrabold">{b.mine.name}</div>
            <div className="text-[34px] font-black leading-none tabular-nums tracking-v2-tighter">{b.mine.perMember}</div>
            <div className="text-[12px] font-bold text-v2-muted">{b.mine.active} פעילים</div>
          </div>
          <span className="mb-5 grid h-9 w-9 place-items-center rounded-full bg-white text-v2-amber shadow-v2-ring">
            <Zap size={18} className="fill-current" aria-hidden />
          </span>
          <div className="text-end">
            <div className="text-[14px] font-extrabold">{b.rival.name}</div>
            <div className="text-[34px] font-black leading-none tabular-nums tracking-v2-tighter text-v2-ink-2">{b.rival.perMember}</div>
            <div className="text-[12px] font-bold text-v2-muted">{b.rival.active} פעילים</div>
          </div>
        </div>
        <div className="mt-3">
          <TugBar a={b.mine.perMember} b={b.rival.perMember} aLabel={b.mine.name} bLabel={b.rival.name} />
        </div>
        <p className="mt-2 text-[12px] font-bold text-v2-muted">נקודות בממוצע למשתתף פעיל</p>

        <div className="mt-4 flex items-center gap-3 rounded-[18px] bg-white px-4 py-3">
          <IconTile icon={User} size="sm" />
          <div className="flex-1">
            <div className="text-[13px] font-bold text-v2-muted">התרומה שלך השבוע</div>
            <div className="text-[15px] font-extrabold">{b.myContribution.minutes} דק׳ · {b.myContribution.share}% מהשכונה</div>
          </div>
        </div>
        <Button variant="primary" size="lg" block className="mt-3">
          הליכה קבוצתית היום ב־18:30
        </Button>
      </div>

      <Card padding="sm">
        <div className="flex items-baseline justify-between px-2 pb-1 pt-1">
          <span className="text-[17px] font-black">שכונות תל אביב־יפו</span>
          <span className="text-[12px] font-bold text-v2-muted">השבוע</span>
        </div>
        <ol>
          {NEIGHBORHOODS.map((n, i) => (
            <Row
              key={n.name}
              rank={i + 1}
              name={n.name}
              sub={`${n.active} פעילים`}
              value={String(n.perMember)}
              unit="נק׳ למשתתף"
              delta={n.delta}
              me={n.me}
            />
          ))}
        </ol>
      </Card>
      <FairNote>נווה צדק במקום השלישי עם 97 פעילים בלבד: הניקוד הוא ממוצע למשתתף, לא סכום, ולכן גודל השכונה לא קובע.</FairNote>
    </>
  );
}

/* ── cities ─────────────────────────────────────────────────────────────── */

const SIZE_FILTERS = [
  { id: 'all', label: 'כל הערים' },
  { id: 'small', label: 'קטנות' },
  { id: 'medium', label: 'בינוניות' },
  { id: 'large', label: 'גדולות' },
] as const;

function CityLeague() {
  const [size, setSize] = useState<(typeof SIZE_FILTERS)[number]['id']>('all');
  const rows = CITIES.filter((c) => size === 'all' || c.size === size);
  const c = CITY_CHALLENGE;
  return (
    <>
      <Card variant="dark" padding="lg" className="!rounded-v2-card-lg">
        <div className="flex items-center gap-2 text-[13px] font-extrabold text-white/60">
          <Zap size={14} className="fill-v2-amber text-v2-amber" aria-hidden />
          אתגר הערים · אוקטובר
        </div>
        <div className="mt-1 text-[20px] font-black leading-tight">{c.goal}</div>
        <div className="mt-4 space-y-3">
          {[
            { name: c.a, pct: c.aPct, me: true },
            { name: c.b, pct: c.bPct },
          ].map((x) => (
            <div key={x.name}>
              <div className="mb-1.5 flex justify-between text-[14px] font-extrabold">
                <span>
                  {x.name}
                  {x.me && <span className="ms-1.5 rounded-full bg-white/15 px-2 py-0.5 text-[10.5px]">שלך</span>}
                </span>
                <span className="tabular-nums">{x.pct}%</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
                <motion.div
                  className={`h-full origin-right rounded-full ${x.me ? 'bg-v2-cta' : 'bg-white/50'}`}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: x.pct / 100 }}
                  transition={{ duration: 0.9, ease: EASE_V2 }}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none]">
        {SIZE_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setSize(f.id)}
            aria-pressed={size === f.id}
            className={`h-9 shrink-0 rounded-full px-4 text-[13px] font-extrabold transition-[transform,background-color] duration-150 ease-v2 active:scale-[0.97] ${
              size === f.id ? 'bg-v2-ink text-white' : 'bg-white text-v2-ink-2 shadow-v2-ring'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <Card padding="sm">
        <div className="flex items-baseline justify-between px-2 pb-1 pt-1">
          <span className="text-[17px] font-black">ליגת הערים</span>
          <span className="text-[12px] font-bold text-v2-muted">החודש</span>
        </div>
        <ol>
          {rows.map((r, i) => (
            <Row
              key={r.name}
              rank={i + 1}
              name={r.name}
              sub={`${r.active.toLocaleString('he-IL')} פעילים`}
              value={String(r.perMember)}
              unit="נק׳ למשתתף"
              delta={r.delta}
              me={r.me}
            />
          ))}
        </ol>
      </Card>
      <FairNote>אפשר להשוות ערים בגודל דומה. עיר קטנה עם תושבים פעילים מנצחת עיר גדולה.</FairNote>
    </>
  );
}

/* ── units: battalions within the brigade, brigades across the corps ────── */

function UnitLeague() {
  const u = UNITS;
  return (
    <>
      <div className="flex items-center gap-2">
        <Chip tone="neutral" icon={<Shield size={13} strokeWidth={2.6} aria-hidden />}>
          מוצג רק למשרתים ביחידה
        </Chip>
      </div>

      <Card variant="dark" padding="lg" className="!rounded-v2-card-lg">
        <div className="text-[13px] font-extrabold text-white/60">דירוג החטיבות</div>
        <ol className="mt-3 grid grid-cols-3 items-end gap-2">
          {[u.brigades[1], u.brigades[0], u.brigades[2]].map((b) => {
            const rank = u.brigades.indexOf(b) + 1;
            const h = rank === 1 ? 'h-[92px]' : rank === 2 ? 'h-[70px]' : 'h-[56px]';
            return (
              <li key={b.name} className="flex flex-col items-center gap-2 text-center">
                <span className="text-[13px] font-extrabold leading-tight">{b.name}</span>
                <div
                  className={`flex w-full flex-col items-center justify-start gap-1 rounded-t-[16px] pt-2.5 ${h} ${
                    b.me ? 'bg-gradient-to-b from-[#00baf7]/50 to-[#0cf2e3]/15' : 'bg-white/[0.07]'
                  }`}
                >
                  <RankTile rank={rank} inverted />
                  <span className="text-[13px] font-black tabular-nums">{b.score}</span>
                </div>
              </li>
            );
          })}
        </ol>
      </Card>

      <Card padding="sm">
        <div className="flex items-baseline justify-between px-2 pb-1 pt-1">
          <span className="text-[17px] font-black">גדודי {u.brigade}</span>
          <span className="text-[12px] font-bold text-v2-muted">השבוע</span>
        </div>
        <ol>
          {u.rows.map((r, i) => (
            <Row
              key={r.name}
              rank={i + 1}
              name={r.name}
              value={`${r.participation}%`}
              unit="השתתפות"
              delta={r.delta}
              me={r.me}
              extra={
                <span className="mt-1.5 flex items-center gap-2">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-v2-surface">
                    <span className="block h-full rounded-full bg-v2-cta" style={{ width: `${r.participation}%` }} />
                  </span>
                  <span className="text-[11.5px] font-bold tabular-nums text-v2-muted">{r.avgMinutes} דק׳ ממוצע</span>
                </span>
              }
            />
          ))}
        </ol>
      </Card>

      <div className="rounded-[22px] border border-v2-hairline-cool bg-gradient-to-br from-[#e8f9fe] to-[#e9fdfb] p-4">
        <div className="text-[15px] font-black">{u.myCompany.name} קרובה למקום הראשון</div>
        <p className="mt-1 text-[14px] leading-snug text-v2-ink-2">
          עוד {u.myCompany.toTop} לוחמים שמתאמנים השבוע, והגדוד עולה למקום הראשון בחטיבה.
        </p>
        <Button variant="dark" size="sm" className="mt-3">
          שלח תזכורת לפלוגה
        </Button>
      </div>
      <FairNote>הדירוג לפי אחוז הלוחמים שהתאמנו, ולא לפי כמות הדקות של הבודדים החזקים. כל לוחם נחשב.</FairNote>
    </>
  );
}

/* ── bottom nav ─────────────────────────────────────────────────────────── */

function BottomNav() {
  const items = [
    { label: 'בית', icon: Home },
    { label: 'מפה', icon: MapIcon },
    { label: 'קהילה', icon: Users, active: true },
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
