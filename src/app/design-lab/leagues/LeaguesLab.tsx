'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Bell,
  Briefcase,
  Building2,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Crown,
  Globe,
  GraduationCap,
  Heart,
  Home,
  Info,
  Plus,
  Shield,
  SlidersHorizontal,
  Swords,
  Timer,
  UserPlus,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { Button, Card, Chip, EASE_V2 } from '@/components/ui/v2';
import LabFrame, { LabStates } from '../_shared/LabFrame';
import { BottomNav } from '../_app/parts';
import {
  BATTLE,
  CITY_CHALLENGE,
  INVITES,
  PEOPLE_BOARD,
  MY_LEAGUES,
  NEIGHBORHOODS_ALL,
  REGIONS,
  SETTLEMENTS,
  SETTLEMENT_KINDS,
  type Region,
  type SettlementKind,
  POINTS_RULES,
  SEASON,
  UNITS,
  type LeagueTab,
} from './fixtures';

const TABS: { id: LeagueTab; label: string }[] = [
  { id: 'people', label: 'אישי' },
  { id: 'neighborhoods', label: 'שכונות' },
  { id: 'cities', label: 'יישובים' },
  { id: 'units', label: 'חטיבות' },
];

type Sheet = null | 'pick' | 'create';

export default function LeaguesLab() {
  const [tab, setTab] = useState<LeagueTab>('people');
  const [sheet, setSheet] = useState<Sheet>(null);
  const [leagueId, setLeagueId] = useState(MY_LEAGUES[0].id);
  const reduce = useReducedMotion();

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const t = q.get('tab');
    if (TABS.some((x) => x.id === t)) setTab(t as LeagueTab);
    const s = q.get('sheet');
    if (s === 'pick' || s === 'create') setSheet(s);
  }, []);

  return (
    <LabFrame
      panel={
        <div>
          <div className="mb-1 text-[22px] font-black tracking-v2-tight">Design lab · ליגות</div>
          <p className="mb-6 text-[14px] leading-relaxed text-v2-ink-2">
            תחרות בין אנשים, שכונות, ערים וחטיבות. ליגות שפותחים לבד, פודיום, ונקודות על הזמנת חברים. נתוני דמו בלבד.
          </p>
          <LabStates title="ליגה" value={tab} options={TABS} onChange={setTab} />
          <div className="flex flex-wrap gap-2">
            <Button variant="dark" size="sm" onClick={() => setSheet('pick')}>
              בחירת ליגה
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSheet('create')}>
              פתיחת ליגה חדשה
            </Button>
          </div>
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
                  className={`relative h-10 rounded-full text-[14px] font-extrabold transition-colors duration-200 ${on ? 'text-v2-on-cta' : 'text-v2-ink-2'}`}
                >
                  {on && (
                    <motion.span
                      layoutId="lab-league-tab"
                      className="absolute inset-0 rounded-full bg-v2-cta shadow-v2-cta"
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
            {tab === 'people' && <PeopleLeague leagueId={leagueId} onPick={() => setSheet('pick')} />}
            {tab === 'neighborhoods' && <NeighborhoodLeague />}
            {tab === 'cities' && <CityLeague />}
            {tab === 'units' && <UnitLeague />}
          </motion.div>
        </AnimatePresence>
      </div>
      <BottomNav active="friends" />
      <LeagueSheets
        sheet={sheet}
        leagueId={leagueId}
        onPick={(id) => {
          setLeagueId(id);
          setTab('people');
          setSheet(null);
        }}
        onCreate={() => setSheet('create')}
        onClose={() => setSheet(null)}
      />
    </LabFrame>
  );
}

/* ── shared pieces ──────────────────────────────────────────────────────── */

const AVATAR_TINTS = ['#bae6fd', '#c7f9e9', '#fde68a', '#e9d5ff', '#fecdd3', '#d9f99d'];

function Avatar({ name, size = 36, ring }: { name: string; size?: number; ring?: string }) {
  const tint = AVATAR_TINTS[name.charCodeAt(0) % AVATAR_TINTS.length];
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full font-black text-v2-ink"
      style={{ width: size, height: size, background: tint, fontSize: size * 0.4, boxShadow: ring ? `0 0 0 3px ${ring}` : undefined }}
    >
      {name[0]}
    </span>
  );
}

function Delta({ value }: { value: number }) {
  if (value === 0) return <span className="w-7 text-center text-[12px] font-extrabold text-v2-muted">–</span>;
  const up = value > 0;
  const Icon = up ? ChevronUp : ChevronDown;
  return (
    <span
      className={`flex w-7 items-center justify-center text-[12px] font-extrabold tabular-nums ${up ? 'text-[#00845a]' : 'text-[#c8353a]'}`}
      aria-label={up ? `עלה ${value}` : `ירד ${-value}`}
    >
      <Icon size={14} strokeWidth={3} aria-hidden />
      {Math.abs(value)}
    </span>
  );
}

function RankTile({ rank, me = false }: { rank: number; me?: boolean }) {
  return (
    <span
      className={`grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full text-[14px] font-black tabular-nums ${
        me ? 'bg-v2-cta text-v2-on-cta' : 'bg-v2-surface text-v2-ink-2 ring-1 ring-inset ring-v2-hairline'
      }`}
    >
      {rank}
    </span>
  );
}

interface PodiumItem {
  name: string;
  value: string;
  unit: string;
  me?: boolean;
  sub?: string;
}

const MEDAL = {
  1: { block: 'bg-v2-cta text-v2-on-cta shadow-v2-cta', h: 'h-[92px]', ring: '#ffc83d' },
  2: { block: 'bg-[#eaf1f5] text-v2-ink', h: 'h-[68px]', ring: '#c5d2db' },
  3: { block: 'bg-[#f7ebe0] text-[#7a4a1c]', h: 'h-[52px]', ring: '#e2b48d' },
} as const;

/** Top three on pedestals — second, first, third from the right. */
function Podium({ items, avatars = true }: { items: PodiumItem[]; avatars?: boolean }) {
  const reduce = useReducedMotion();
  const order: (1 | 2 | 3)[] = [2, 1, 3];
  return (
    <ol className="grid grid-cols-3 items-end gap-2 px-1 pt-2" aria-label="שלושת הראשונים">
      {order.map((rank, i) => {
        const it = items[rank - 1];
        const m = MEDAL[rank];
        return (
          <li key={it.name} className="flex min-w-0 flex-col items-center text-center">
            <span className="relative mb-2">
              {rank === 1 && (
                <Crown
                  size={20}
                  strokeWidth={2.4}
                  className="absolute -top-5 left-1/2 -translate-x-1/2 fill-v2-gold text-v2-gold"
                  aria-hidden
                />
              )}
              {avatars ? (
                <Avatar name={it.name} size={rank === 1 ? 54 : 44} ring={m.ring} />
              ) : (
                <span
                  className="grid place-items-center rounded-[14px] bg-v2-tint text-v2-deep"
                  style={{ width: rank === 1 ? 50 : 42, height: rank === 1 ? 50 : 42, boxShadow: `0 0 0 3px ${m.ring}` }}
                >
                  <Building2 size={rank === 1 ? 22 : 18} strokeWidth={2.4} aria-hidden />
                </span>
              )}
            </span>
            <span className="flex max-w-full items-center gap-1">
              <span className="truncate text-[13.5px] font-extrabold">{it.name}</span>
            </span>
            {it.me ? (
              <span className="mb-1 rounded-full bg-v2-ink px-2 py-0.5 text-[10px] font-extrabold text-white">שלך</span>
            ) : (
              it.sub && <span className="mb-1 truncate text-[11px] font-bold text-v2-muted">{it.sub}</span>
            )}
            <motion.div
              className={`flex w-full origin-bottom flex-col items-center justify-start rounded-t-[16px] pt-2 ${m.block} ${m.h}`}
              initial={reduce ? false : { scaleY: 0.2, opacity: 0 }}
              animate={{ scaleY: 1, opacity: 1 }}
              transition={{ duration: 0.55, ease: EASE_V2, delay: reduce ? 0 : i * 0.06 }}
            >
              <span className="text-[20px] font-black leading-none">{rank}</span>
              <span className="mt-1 text-[12.5px] font-black tabular-nums">
                {it.value} <small className="text-[10px] font-bold opacity-70">{it.unit}</small>
              </span>
            </motion.div>
          </li>
        );
      })}
    </ol>
  );
}

/** Table row from 4th place down. */
function Row({
  rank,
  name,
  sub,
  value,
  unit,
  delta,
  me = false,
  extra,
  avatar = false,
}: {
  rank: number;
  name: string;
  sub?: string;
  value: string;
  unit: string;
  delta: number;
  me?: boolean;
  extra?: ReactNode;
  avatar?: boolean;
}) {
  return (
    <li className={`flex items-center gap-3 rounded-[16px] px-3 py-2.5 ${me ? 'bg-v2-tint ring-1 ring-inset ring-v2-accent/40' : ''}`}>
      <RankTile rank={rank} me={me} />
      {avatar && <Avatar name={name} size={34} />}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[15px] font-extrabold">{name}</span>
          {me && <span className="rounded-full bg-v2-ink px-2 py-0.5 text-[10.5px] font-extrabold text-white">שלך</span>}
        </span>
        {sub && <span className="block truncate text-[12.5px] font-bold text-v2-muted">{sub}</span>}
        {extra}
      </span>
      <span className="shrink-0 text-end">
        <span className="block whitespace-nowrap text-[16px] font-black leading-none tabular-nums">{value}</span>
        <span className="block whitespace-nowrap text-[11px] font-bold text-v2-muted">{unit}</span>
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

function BoardHead({ title, period, children }: { title: string; period: string; children?: ReactNode }) {
  return (
    <div className="px-2 pb-1 pt-1">
      <div className="flex items-baseline justify-between">
        <span className="text-[17px] font-black">{title}</span>
        <span className="text-[12px] font-bold text-v2-muted">{period}</span>
      </div>
      {children && <div className="mt-2.5">{children}</div>}
    </div>
  );
}

function ProgressBar({ pct, className = '' }: { pct: number; className?: string }) {
  return (
    <div className={`h-2 overflow-hidden rounded-full bg-v2-tint ${className}`}>
      <motion.div
        className="h-full origin-right rounded-full bg-v2-cta"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: pct / 100 }}
        transition={{ duration: 0.8, ease: EASE_V2 }}
      />
    </div>
  );
}

/** 2,410,000 → "2.4 מיליון"; smaller numbers get thousands separators. */
function big(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString('he-IL', { maximumFractionDigits: 1 })} מיליון`;
  return n.toLocaleString('he-IL');
}

type Measure = 'avg' | 'total';

/** Average per active member (the fair ranking) vs the group's total. */
function MeasureToggle({ value, onChange, avgLabel, totalLabel }: { value: Measure; onChange: (m: Measure) => void; avgLabel: string; totalLabel: string }) {
  const reduce = useReducedMotion();
  const opts: { id: Measure; label: string }[] = [
    { id: 'avg', label: avgLabel },
    { id: 'total', label: totalLabel },
  ];
  return (
    <div className="grid grid-cols-2 rounded-full bg-v2-surface p-1 ring-1 ring-inset ring-v2-hairline" role="radiogroup" aria-label="שיטת דירוג">
      {opts.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.id)}
            className={`relative h-9 rounded-full text-[13px] font-extrabold transition-colors duration-200 ${on ? 'text-v2-ink' : 'text-v2-muted'}`}
          >
            {on && (
              <motion.span
                layoutId={`measure-${avgLabel}`}
                className="absolute inset-0 rounded-full bg-white shadow-v2-ring"
                transition={{ duration: reduce ? 0 : 0.28, ease: EASE_V2 }}
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ── personal leagues ───────────────────────────────────────────────────── */

const LEAGUE_ICON = { neighborhood: Home, city: Building2, private: Users, national: Globe } as const;

function LeagueSwitcher({ leagueId, onPick }: { leagueId: string; onPick: () => void }) {
  const l = MY_LEAGUES.find((x) => x.id === leagueId) ?? MY_LEAGUES[0];
  const Icon = LEAGUE_ICON[l.kind];
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex w-full items-center gap-3 rounded-[22px] bg-white p-3 text-start shadow-v2-card transition-transform duration-150 ease-v2 active:scale-[0.98]"
    >
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-v2-tint text-v2-deep">
        <Icon size={22} strokeWidth={2.4} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 text-[17px] font-black">
          {l.name}
          <ChevronDown size={16} strokeWidth={2.6} className="text-v2-muted" aria-hidden />
        </span>
        <span className="block truncate text-[13px] font-bold text-v2-muted">
          {l.sub} · {MY_LEAGUES.length} ליגות שלי
        </span>
      </span>
      <span className="rounded-[14px] bg-v2-tint px-3 py-1.5 text-center">
        <span className="block text-[18px] font-black leading-none tabular-nums text-v2-deep">#{l.rank}</span>
        <span className="text-[11px] font-bold text-v2-muted">דירוג</span>
      </span>
    </button>
  );
}

function InviteCard() {
  const i = INVITES;
  return (
    <div className="rounded-v2-card border border-v2-hairline-cool bg-gradient-to-br from-[#e8f9fe] to-[#e9fdfb] p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[14px] bg-white text-v2-deep">
          <UserPlus size={20} strokeWidth={2.4} aria-hidden />
        </span>
        <div className="flex-1">
          <div className="text-[16px] font-black">חבר שמצטרף = +{i.perFriend} נק׳</div>
          <p className="mt-0.5 text-[13.5px] leading-snug text-v2-ink-2">
            הנקודות נכנסות לכל הליגות שלך, עד {i.cap} חברים בעונה.
          </p>
        </div>
      </div>
      <ol className="mt-3 flex gap-1.5" aria-label={`${i.joined} מתוך ${i.cap} חברים הצטרפו`}>
        {Array.from({ length: i.cap }, (_, n) => (
          <li
            key={n}
            className={`grid h-9 flex-1 place-items-center rounded-full text-[12px] font-extrabold ${
              n < i.joined
                ? 'bg-v2-cta text-v2-on-cta'
                : n < i.joined + i.pending
                  ? 'border-2 border-dashed border-v2-accent/60 bg-white text-v2-deep'
                  : 'bg-white/70 text-v2-muted'
            }`}
          >
            {n < i.joined ? <Check size={15} strokeWidth={3} aria-hidden /> : n < i.joined + i.pending ? 'ממתין' : `+${i.perFriend}`}
          </li>
        ))}
      </ol>
      <Button variant="primary" block className="mt-3">
        <UserPlus size={17} strokeWidth={2.6} aria-hidden />
        הזמנת חבר
      </Button>
    </div>
  );
}

function PeopleLeague({ leagueId, onPick }: { leagueId: string; onPick: () => void }) {
  const d = PEOPLE_BOARD;
  const nextPoints = d.me.points + d.me.toNext;
  const pct = Math.min(100, Math.round((d.me.points / nextPoints) * 100));
  const top: PodiumItem[] = d.rows.slice(0, 3).map((r) => ({ name: r.name, value: String(r.points), unit: 'נק׳', me: r.me }));
  return (
    <>
      <LeagueSwitcher leagueId={leagueId} onPick={onPick} />

      <Card padding="none" className="overflow-hidden !rounded-v2-card-lg">
        <div className="bg-gradient-to-b from-[#e8f9fe] to-white p-4 pb-2">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-extrabold text-v2-deep">{d.size} משתתפים השבוע</span>
            <span className="text-[12px] font-bold text-v2-muted">מתעדכן כל שעה</span>
          </div>
          <div className="mt-3 flex items-center gap-3 rounded-[18px] bg-white px-3.5 py-3 shadow-v2-ring">
            <span className="text-[26px] font-black leading-none tabular-nums tracking-v2-tighter text-v2-deep">#{d.me.rank}</span>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-extrabold">
                עוד {d.me.toNext} נק׳ ועוקפים את {d.me.nextName}
              </div>
              <ProgressBar pct={pct} className="mt-1.5" />
            </div>
            <span className="text-[13px] font-black tabular-nums text-v2-ink-2">{d.me.points} נק׳</span>
          </div>
          <div className="mt-5">
            <Podium items={top} />
          </div>
        </div>
        <ol className="px-2 pb-2">
          {d.rows.slice(3).map((r, i) => (
            <Row key={r.name} rank={i + 4} name={r.name} value={String(r.points)} unit="נק׳" delta={r.delta} me={r.me} avatar />
          ))}
        </ol>
      </Card>

      <InviteCard />

      <Card padding="lg">
        <div className="mb-3 text-[17px] font-black">איך צוברים נקודות</div>
        <ul className="divide-y divide-v2-hairline">
          {POINTS_RULES.map((r) => (
            <li key={r.label} className="flex items-center justify-between py-2">
              <span className="text-[14.5px] font-bold text-v2-ink-2">{r.label}</span>
              <span className="rounded-full bg-v2-tint px-2.5 py-0.5 text-[14px] font-black tabular-nums text-v2-deep">{r.pts}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12.5px] font-bold leading-snug text-v2-muted">כל סוג פעילות נחשב: כוח, ריצה, הליכה וצעדים.</p>
      </Card>
    </>
  );
}

/* ── board controls: activity, ranking mode, filters ───────────────────── */

type Activity = 'all' | 'steps' | 'strength' | 'run';
type RankMode = 'avg' | 'total' | 'improve';
const ACTIVITIES: { id: Activity; label: string }[] = [
  { id: 'all', label: 'כל הפעילות' },
  { id: 'steps', label: 'צעדים' },
  { id: 'strength', label: 'כוח' },
  { id: 'run', label: 'ריצה' },
];
const RANK_MODES: { id: RankMode; label: string }[] = [
  { id: 'avg', label: 'ממוצע' },
  { id: 'total', label: 'סה״כ' },
  { id: 'improve', label: 'הכי משתפרים' },
];

/** Demo only: a stable per-name factor so each activity reorders the board a bit. */
function actFactor(name: string, a: Activity): number {
  if (a === 'all') return 1;
  let h = 7;
  for (const c of name + a) h = (h * 31 + c.charCodeAt(0)) % 997;
  return 0.7 + (h % 60) / 100;
}

interface Scored {
  name: string;
  perMember: number;
  totalSteps: number;
  improve: number;
}

function score(x: Scored, a: Activity, m: RankMode): number {
  const f = actFactor(x.name, a);
  if (m === 'improve') return x.improve * f;
  if (m === 'total') return x.totalSteps * f;
  return x.perMember * f;
}

function display(x: Scored, a: Activity, m: RankMode): { value: string; unit: string; short: string } {
  const f = actFactor(x.name, a);
  if (m === 'improve') {
    const v = Math.round(x.improve * f);
    const t = `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}%`;
    return { value: t, unit: 'מהשבוע שעבר', short: t };
  }
  if (m === 'total') {
    if (a === 'strength') {
      const v = big(Math.round((x.totalSteps / 400) * f));
      return { value: v, unit: 'דק׳ כוח', short: v };
    }
    if (a === 'run') {
      const v = big(Math.round((x.totalSteps / 1300) * f));
      return { value: v, unit: 'ק״מ', short: v };
    }
    const v = big(Math.round(x.totalSteps * f));
    return { value: v, unit: 'צעדים', short: v };
  }
  const v = String(Math.round(x.perMember * f));
  return { value: v, unit: 'נק׳ למשתתף', short: v };
}

function PillToggle<T extends string>({ value, onChange, options, id }: { value: T; onChange: (v: T) => void; options: { id: T; label: string }[]; id: string }) {
  const reduce = useReducedMotion();
  return (
    <div
      className="grid rounded-full bg-v2-surface p-1 ring-1 ring-inset ring-v2-hairline"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      role="radiogroup"
    >
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.id)}
            className={`relative h-9 rounded-full text-[13px] font-extrabold transition-colors duration-200 ${on ? 'text-v2-ink' : 'text-v2-muted'}`}
          >
            {on && (
              <motion.span
                layoutId={`pill-${id}`}
                className="absolute inset-0 rounded-full bg-white shadow-v2-ring"
                transition={{ duration: reduce ? 0 : 0.28, ease: EASE_V2 }}
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function ChipRow<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { id: T; label: string }[] }) {
  return (
    <div className="-mx-2 flex gap-1.5 overflow-x-auto px-2 [scrollbar-width:none]">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          className={`h-8 shrink-0 rounded-full px-3.5 text-[12.5px] font-extrabold transition-[transform,background-color] duration-150 ease-v2 active:scale-[0.97] ${
            value === o.id ? 'bg-v2-cta text-v2-on-cta' : 'bg-white text-v2-ink-2 ring-1 ring-inset ring-v2-hairline'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function FilterButton({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-white px-3 text-[12.5px] font-extrabold text-v2-ink ring-1 ring-inset ring-v2-hairline transition-transform duration-150 ease-v2 active:scale-[0.97]"
    >
      <SlidersHorizontal size={14} strokeWidth={2.6} aria-hidden />
      סינון
      {count > 0 && (
        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-v2-cta px-1 text-[11px] font-black text-v2-on-cta">{count}</span>
      )}
    </button>
  );
}

interface Filters {
  regions: Region[];
  size: 'all' | 'small' | 'medium' | 'large';
  age: 'all' | 'youth' | 'adults' | 'golden';
  period: 'week' | 'month' | 'season';
}
const EMPTY_FILTERS: Filters = { regions: [], size: 'all', age: 'all', period: 'week' };
const filterCount = (f: Filters) =>
  f.regions.length + (f.size !== 'all' ? 1 : 0) + (f.age !== 'all' ? 1 : 0) + (f.period !== 'week' ? 1 : 0);

function FilterSheet({
  open,
  value,
  onApply,
  onClose,
  showSize,
}: {
  open: boolean;
  value: Filters;
  onApply: (f: Filters) => void;
  onClose: () => void;
  showSize: boolean;
}) {
  const reduce = useReducedMotion();
  const [f, setF] = useState<Filters>(value);
  useEffect(() => {
    if (open) setF(value);
  }, [open, value]);
  const toggleRegion = (r: Region) =>
    setF((x) => ({ ...x, regions: x.regions.includes(r) ? x.regions.filter((y) => y !== r) : [...x.regions, r] }));
  const chip = (on: boolean) =>
    `h-9 rounded-full px-4 text-[13px] font-extrabold transition-[transform,background-color] duration-150 ease-v2 active:scale-[0.97] ${
      on ? 'bg-v2-cta text-v2-on-cta' : 'bg-white text-v2-ink-2 shadow-v2-ring'
    }`;
  const Section = ({ title, children }: { title: string; children: ReactNode }) => (
    <div>
      <div className="mb-2 text-[13px] font-extrabold text-v2-muted">{title}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[10]" role="dialog" aria-modal="true" aria-label="סינון">
          <motion.button
            type="button"
            aria-label="סגירה"
            className="absolute inset-0 bg-[#0e1419]/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="absolute inset-x-0 bottom-0 max-h-[85%] overflow-y-auto rounded-t-[28px] bg-white px-4 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-2.5 shadow-v2-sheet"
            initial={reduce ? { opacity: 0 } : { y: '100%' }}
            animate={reduce ? { opacity: 1 } : { y: 0 }}
            exit={reduce ? { opacity: 0 } : { y: '100%' }}
            transition={{ duration: 0.42, ease: [0.32, 0.72, 0, 1] }}
          >
            <div className="mb-3 flex justify-center">
              <span className="h-1.5 w-10 rounded-full bg-v2-pill-border" />
            </div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[22px] font-black !tracking-[-0.02em]">סינון</h2>
              <button type="button" onClick={() => setF(EMPTY_FILTERS)} className="text-[14px] font-extrabold text-v2-deep">
                ניקוי
              </button>
            </div>
            <div className="space-y-5">
              <Section title="אזור">
                {REGIONS.map((r) => (
                  <button key={r.id} type="button" aria-pressed={f.regions.includes(r.id)} onClick={() => toggleRegion(r.id)} className={chip(f.regions.includes(r.id))}>
                    {r.label}
                  </button>
                ))}
              </Section>
              {showSize && (
                <Section title="גודל">
                  {(
                    [
                      ['all', 'הכל'],
                      ['small', 'קטנים'],
                      ['medium', 'בינוניים'],
                      ['large', 'גדולים'],
                    ] as const
                  ).map(([id, label]) => (
                    <button key={id} type="button" aria-pressed={f.size === id} onClick={() => setF((x) => ({ ...x, size: id }))} className={chip(f.size === id)}>
                      {label}
                    </button>
                  ))}
                </Section>
              )}
              <Section title="קבוצת גיל">
                {(
                  [
                    ['all', 'כל הגילים'],
                    ['youth', 'נוער'],
                    ['adults', 'מבוגרים'],
                    ['golden', 'גיל הזהב 65+'],
                  ] as const
                ).map(([id, label]) => (
                  <button key={id} type="button" aria-pressed={f.age === id} onClick={() => setF((x) => ({ ...x, age: id }))} className={chip(f.age === id)}>
                    {label}
                  </button>
                ))}
              </Section>
              <Section title="תקופה">
                {(
                  [
                    ['week', 'השבוע'],
                    ['month', 'החודש'],
                    ['season', 'העונה'],
                  ] as const
                ).map(([id, label]) => (
                  <button key={id} type="button" aria-pressed={f.period === id} onClick={() => setF((x) => ({ ...x, period: id }))} className={chip(f.period === id)}>
                    {label}
                  </button>
                ))}
              </Section>
              <Button
                variant="primary"
                size="lg"
                block
                onClick={() => {
                  onApply(f);
                  onClose();
                }}
              >
                הצגת תוצאות
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

const AGE_LABEL = { youth: 'נוער', adults: 'מבוגרים', golden: 'גיל הזהב' } as const;
const PERIOD_LABEL = { week: 'השבוע', month: 'החודש', season: 'העונה' } as const;

/** Activity chips + filter button, then the ranking-mode toggle. */
function BoardControls({
  activity,
  setActivity,
  mode,
  setMode,
  filters,
  onFilter,
  id,
}: {
  activity: Activity;
  setActivity: (a: Activity) => void;
  mode: RankMode;
  setMode: (m: RankMode) => void;
  filters: Filters;
  onFilter: () => void;
  id: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <div className="min-w-0 flex-1">
          <ChipRow value={activity} onChange={setActivity} options={ACTIVITIES} />
        </div>
        <FilterButton count={filterCount(filters)} onClick={onFilter} />
      </div>
      <PillToggle id={id} value={mode} onChange={setMode} options={RANK_MODES} />
    </div>
  );
}

/* ── neighborhoods ──────────────────────────────────────────────────────── */

type HoodScope = 'city' | 'near' | 'all';
const HOOD_SCOPES: { id: HoodScope; label: string }[] = [
  { id: 'city', label: 'בעיר שלי' },
  { id: 'near', label: 'קרובות אליי' },
  { id: 'all', label: 'כל הארץ' },
];

function NeighborhoodLeague() {
  const [scope, setScope] = useState<HoodScope>('city');
  const [activity, setActivity] = useState<Activity>('all');
  const [mode, setMode] = useState<RankMode>('avg');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const b = BATTLE;
  const lead = b.mine.perMember - b.rival.perMember;
  const pct = Math.round((b.mine.perMember / (b.mine.perMember + b.rival.perMember)) * 100);
  const pool = NEIGHBORHOODS_ALL.filter((n) => (scope === 'city' ? n.city === 'תל אביב־יפו' : scope === 'near' ? n.near : true));
  const sorted = [...pool].sort((x, y) => score(y, activity, mode) - score(x, activity, mode));
  const title = scope === 'city' ? 'שכונות תל אביב־יפו' : scope === 'near' ? 'שכונות קרובות אליי' : 'השכונות בכל הארץ';
  const sub = (n: (typeof NEIGHBORHOODS_ALL)[number]) => (scope === 'city' ? `${n.active} פעילים` : `${n.city} · ${n.active} פעילים`);
  const top: PodiumItem[] = sorted.slice(0, 3).map((n) => {
    const d = display(n, activity, mode);
    return { name: n.name, value: d.short, unit: mode === 'avg' ? 'נק׳' : '', me: n.me, sub: scope === 'city' ? `${n.active} פעילים` : n.city };
  });
  const period = PERIOD_LABEL[filters.period];
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
            <div className="text-[34px] font-black leading-none tabular-nums tracking-v2-tighter text-v2-deep">{b.mine.perMember}</div>
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
        <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-white" aria-label={`${pct}% מול ${100 - pct}%`}>
          <motion.div
            className="h-full rounded-full bg-v2-cta"
            initial={{ width: '50%' }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.9, ease: EASE_V2 }}
          />
        </div>
        <p className="mt-2 text-[12px] font-bold text-v2-muted">נקודות בממוצע למשתתף פעיל</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {[b.mine, b.rival].map((x) => (
            <div key={x.name} className="rounded-[16px] bg-white/80 px-3 py-2">
              <div className="text-[18px] font-black leading-tight tabular-nums">{big(x.totalSteps)}</div>
              <div className="text-[11.5px] font-bold text-v2-muted">צעדים השבוע ב{x.name}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-3 rounded-[18px] bg-white px-4 py-3">
          <Avatar name="אתה" size={34} />
          <div className="flex-1">
            <div className="text-[13px] font-bold text-v2-muted">התרומה שלך השבוע</div>
            <div className="text-[15px] font-extrabold">
              {b.myContribution.minutes} דק׳ · {b.myContribution.share}% מהשכונה
            </div>
          </div>
        </div>
        <Button variant="primary" size="lg" block className="mt-3">
          הליכה קבוצתית היום ב־18:30
        </Button>
      </div>

      <Card padding="sm">
        <BoardHead title={title} period={period + (filters.age !== 'all' ? ` · ${AGE_LABEL[filters.age]}` : '')}>
          <div className="space-y-2">
            <PillToggle id="hood-scope" value={scope} onChange={setScope} options={HOOD_SCOPES} />
            <BoardControls
              id="hood-mode"
              activity={activity}
              setActivity={setActivity}
              mode={mode}
              setMode={setMode}
              filters={filters}
              onFilter={() => setFilterOpen(true)}
            />
          </div>
        </BoardHead>
        <Podium key={scope + activity + mode} items={top} avatars={false} />
        <ol className="mt-2">
          {sorted.slice(3).map((n, i) => {
            const d = display(n, activity, mode);
            return <Row key={n.name} rank={i + 4} name={n.name} sub={sub(n)} value={d.value} unit={d.unit} delta={n.delta} me={n.me} />;
          })}
        </ol>
      </Card>
      <FairNote>
        {mode === 'avg'
          ? 'בממוצע למשתתף, גודל השכונה לא קובע: גם שכונה עם 97 פעילים יכולה לנצח.'
          : mode === 'total'
            ? 'בסה״כ, שכונות גדולות מובילות. הדירוג הרשמי של הליגה הוא לפי ממוצע למשתתף.'
            : 'הכי משתפרים: מי שהוסיף הכי הרבה מהשבוע שעבר. כל שכונה יכולה להגיע לראש.'}
      </FairNote>
      <FilterSheet open={filterOpen} value={filters} onApply={setFilters} onClose={() => setFilterOpen(false)} showSize={false} />
    </>
  );
}

/* ── settlements: cities, local councils, kibbutzim, moshavim ───────────── */

const KIND_ONE: Record<SettlementKind, string> = { city: 'עיר', local: 'מועצה מקומית', kibbutz: 'קיבוץ', moshav: 'מושב' };

function CityLeague() {
  const [kind, setKind] = useState<'all' | SettlementKind>('all');
  const [activity, setActivity] = useState<Activity>('all');
  const [mode, setMode] = useState<RankMode>('avg');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const rows = SETTLEMENTS.filter(
    (c) =>
      (kind === 'all' || c.kind === kind) &&
      (filters.regions.length === 0 || filters.regions.includes(c.region)) &&
      (filters.size === 'all' || c.size === filters.size),
  ).sort((x, y) => score(y, activity, mode) - score(x, activity, mode));
  const c = CITY_CHALLENGE;
  const regionLabel = (r: Region) => REGIONS.find((x) => x.id === r)!.label;
  const top: PodiumItem[] = rows.slice(0, 3).map((r) => {
    const d = display(r, activity, mode);
    return { name: r.name, value: d.short, unit: mode === 'avg' ? 'נק׳' : '', me: r.me, sub: `${r.active.toLocaleString('he-IL')} פעילים` };
  });
  const podium = top.length === 3;
  return (
    <>
      <Card padding="lg" className="!rounded-v2-card-lg">
        <div className="flex items-center gap-2 text-[13px] font-extrabold text-v2-deep">
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
                  {x.me && <span className="ms-1.5 rounded-full bg-v2-ink px-2 py-0.5 text-[10.5px] text-white">שלך</span>}
                </span>
                <span className="tabular-nums">{x.pct}%</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-v2-tint">
                <motion.div
                  className={`h-full origin-right rounded-full ${x.me ? 'bg-v2-cta' : 'bg-v2-ink-2/40'}`}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: x.pct / 100 }}
                  transition={{ duration: 0.9, ease: EASE_V2 }}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card padding="sm">
        <BoardHead
          title="ליגת היישובים"
          period={PERIOD_LABEL[filters.period] + (filters.age !== 'all' ? ` · ${AGE_LABEL[filters.age]}` : '')}
        >
          <div className="space-y-2">
            <ChipRow value={kind} onChange={setKind} options={[{ id: 'all' as const, label: 'כל היישובים' }, ...SETTLEMENT_KINDS]} />
            <BoardControls
              id="city-mode"
              activity={activity}
              setActivity={setActivity}
              mode={mode}
              setMode={setMode}
              filters={filters}
              onFilter={() => setFilterOpen(true)}
            />
          </div>
        </BoardHead>
        {podium && <Podium key={kind + activity + mode + filterCount(filters)} items={top} avatars={false} />}
        <ol className="mt-2">
          {rows.slice(podium ? 3 : 0).map((r, i) => {
            const d = display(r, activity, mode);
            return (
              <Row
                key={r.name}
                rank={i + (podium ? 4 : 1)}
                name={r.name}
                sub={`${KIND_ONE[r.kind]} · ${regionLabel(r.region)}`}
                value={d.value}
                unit={d.unit}
                delta={r.delta}
                me={r.me}
              />
            );
          })}
          {rows.length === 0 && <li className="px-3 py-6 text-center text-[14px] font-bold text-v2-muted">אין יישובים שמתאימים לסינון</li>}
        </ol>
      </Card>
      <FairNote>
        {mode === 'avg'
          ? 'בממוצע לתושב פעיל, קיבוץ קטן יכול לנצח עיר גדולה.'
          : mode === 'total'
            ? 'בסה״כ, ערים גדולות מובילות. אפשר לסנן לפי גודל או סוג יישוב להשוואה הוגנת.'
            : 'הכי משתפרים: מי שהוסיף הכי הרבה מהשבוע שעבר.'}
      </FairNote>
      <FilterSheet open={filterOpen} value={filters} onApply={setFilters} onClose={() => setFilterOpen(false)} showSize />
    </>
  );
}

/* ── units ──────────────────────────────────────────────────────────────── */

function UnitLeague() {
  const [measure, setMeasure] = useState<Measure>('avg');
  const u = UNITS;
  const brigades = [...u.brigades].sort((x, y) => (measure === 'avg' ? y.score - x.score : y.totalMinutes - x.totalMinutes));
  const brigadeTop: PodiumItem[] = brigades.map((b) => ({
    name: b.name,
    value: measure === 'avg' ? String(b.score) : big(b.totalMinutes),
    unit: measure === 'avg' ? 'ציון' : 'דק׳',
    me: b.me,
  }));
  const rows = [...u.rows].sort((x, y) => (measure === 'avg' ? y.participation - x.participation : y.totalMinutes - x.totalMinutes));
  return (
    <>
      <Chip tone="neutral" icon={<Shield size={13} strokeWidth={2.6} aria-hidden />}>
        מוצג רק למשרתים ביחידה
      </Chip>

      <MeasureToggle value={measure} onChange={setMeasure} avgLabel="אחוז השתתפות" totalLabel="סה״כ דקות" />

      <Card padding="sm" className="!rounded-v2-card-lg">
        <BoardHead title="דירוג החטיבות" period="החודש" />
        <Podium key={measure} items={brigadeTop} avatars={false} />
      </Card>

      <Card padding="sm">
        <BoardHead title={`גדודי ${u.brigade}`} period="השבוע" />
        <ol>
          {rows.map((r, i) => (
            <Row
              key={r.name}
              rank={i + 1}
              name={r.name}
              value={measure === 'avg' ? `${r.participation}%` : big(r.totalMinutes)}
              unit={measure === 'avg' ? 'השתתפות' : 'דקות'}
              delta={r.delta}
              me={r.me}
              extra={
                <span className="mt-1.5 flex items-center gap-2">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-v2-tint">
                    <span className="block h-full rounded-full bg-v2-cta" style={{ width: `${r.participation}%` }} />
                  </span>
                  <span className="text-[11.5px] font-bold tabular-nums text-v2-muted">
                    {measure === 'avg' ? `${big(r.totalMinutes)} דק׳ סה״כ` : `${r.participation}% השתתפות`}
                  </span>
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
        <Button variant="primary" size="sm" className="mt-3">
          שלח תזכורת לפלוגה
        </Button>
      </div>
      <FairNote>
        {measure === 'avg'
          ? 'הדירוג לפי אחוז הלוחמים שהתאמנו, ולא לפי הדקות של הבודדים החזקים. כל לוחם נחשב.'
          : 'סה״כ הדקות של כל היחידה. יחידות גדולות מובילות כאן, והדירוג הרשמי לפי אחוז השתתפות.'}
      </FairNote>
    </>
  );
}

/* ── sheets: pick a league / open a new one ─────────────────────────────── */

/** The league types the app's create wizard (/arena/create) already supports. */
const CREATE_TYPES = [
  { id: 'neighborhood', label: 'שכונה', icon: Home, join: 'open', how: 'ליגה ציבורית: שכנים מוצאים אותה ומצטרפים בלי קוד.' },
  { id: 'friends', label: 'חברים', icon: Users, join: 'link', how: 'ליגה פרטית: מצטרפים רק דרך קישור ההזמנה שלך.' },
  { id: 'family', label: 'משפחה', icon: Heart, join: 'link', how: 'ליגה פרטית: מצטרפים רק דרך קישור ההזמנה שלך.' },
  { id: 'work', label: 'עבודה', icon: Briefcase, join: 'request', how: 'שולחים בקשה לארגון, והוא פותח ליגה לכל העובדים.' },
  { id: 'school', label: 'בית ספר', icon: GraduationCap, join: 'code', how: 'מצטרפים עם קוד הגישה שבית הספר נתן.' },
  { id: 'military', label: 'יחידה', icon: Shield, join: 'code', how: 'מצטרפים עם קוד הגישה של היחידה.' },
] as const;
const CREATE_METRICS = ['כל הפעילות', 'צעדים', 'דקות כוח', 'ריצה'];

function LeagueSheets({
  sheet,
  leagueId,
  onPick,
  onCreate,
  onClose,
}: {
  sheet: Sheet;
  leagueId: string;
  onPick: (id: string) => void;
  onCreate: () => void;
  onClose: () => void;
}) {
  const reduce = useReducedMotion();
  const [type, setType] = useState<(typeof CREATE_TYPES)[number]['id']>('friends');
  const [isPublic, setIsPublic] = useState(true);
  const t = CREATE_TYPES.find((x) => x.id === type)!;
  const [metric, setMetric] = useState(CREATE_METRICS[0]);
  return (
    <AnimatePresence>
      {sheet && (
        <div className="fixed inset-0 z-[10]" role="dialog" aria-modal="true" aria-label={sheet === 'pick' ? 'בחירת ליגה' : 'פתיחת ליגה חדשה'}>
          <motion.button
            type="button"
            aria-label="סגירה"
            className="absolute inset-0 bg-[#0e1419]/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            key={sheet}
            className="absolute inset-x-0 bottom-0 max-h-[88%] overflow-y-auto rounded-t-[28px] bg-white px-4 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-2.5 shadow-v2-sheet"
            initial={reduce ? { opacity: 0 } : { y: '100%' }}
            animate={reduce ? { opacity: 1 } : { y: 0 }}
            exit={reduce ? { opacity: 0 } : { y: '100%' }}
            transition={{ duration: 0.42, ease: [0.32, 0.72, 0, 1] }}
          >
            <div className="mb-3 flex justify-center">
              <span className="h-1.5 w-10 rounded-full bg-v2-pill-border" />
            </div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[22px] font-black !tracking-[-0.02em]">{sheet === 'pick' ? 'הליגות שלי' : 'ליגה חדשה'}</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="סגירה"
                className="grid h-9 w-9 place-items-center rounded-full bg-v2-surface ring-1 ring-inset ring-v2-hairline"
              >
                <X size={17} strokeWidth={2.6} />
              </button>
            </div>

            {sheet === 'pick' ? (
              <ul className="space-y-2">
                {MY_LEAGUES.map((l) => {
                  const Icon = LEAGUE_ICON[l.kind];
                  const on = l.id === leagueId;
                  return (
                    <li key={l.id}>
                      <button
                        type="button"
                        onClick={() => onPick(l.id)}
                        className={`flex w-full items-center gap-3 rounded-[20px] p-3 text-start transition-transform duration-150 ease-v2 active:scale-[0.98] ${
                          on ? 'bg-v2-tint ring-2 ring-v2-accent' : 'bg-white shadow-v2-ring'
                        }`}
                      >
                        <span className={`grid h-11 w-11 place-items-center rounded-[14px] ${on ? 'bg-white' : 'bg-v2-tint'} text-v2-deep`}>
                          <Icon size={20} strokeWidth={2.4} aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[16px] font-black">{l.name}</span>
                          <span className="block truncate text-[12.5px] font-bold text-v2-muted">{l.sub}</span>
                        </span>
                        <span className="text-center">
                          <span className="block text-[16px] font-black tabular-nums text-v2-deep">#{l.rank}</span>
                          <span className="text-[11px] font-bold text-v2-muted">{l.members.toLocaleString('he-IL')} חברים</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
                <li>
                  <button
                    type="button"
                    onClick={onCreate}
                    className="flex w-full items-center gap-3 rounded-[20px] border-2 border-dashed border-v2-pill-border p-3 text-start text-v2-ink-2 transition-colors duration-150 hover:bg-v2-surface"
                  >
                    <span className="grid h-11 w-11 place-items-center rounded-full border-2 border-dashed border-v2-pill-border">
                      <Plus size={20} strokeWidth={2.4} aria-hidden />
                    </span>
                    <span>
                      <span className="block text-[16px] font-black text-v2-ink">פתיחת ליגה חדשה</span>
                      <span className="block text-[12.5px] font-bold">שכונה, חברים, משפחה, עבודה, או כניסה עם קוד</span>
                    </span>
                  </button>
                </li>
              </ul>
            ) : (
              <div className="space-y-5">
                <div>
                  <span className="mb-1.5 block text-[13px] font-extrabold text-v2-muted">איזו ליגה?</span>
                  <div className="grid grid-cols-3 gap-2">
                    {CREATE_TYPES.map(({ id, label, icon: Icon }) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setType(id)}
                        aria-pressed={type === id}
                        className={`flex h-16 flex-col items-center justify-center gap-1 rounded-[16px] text-[13px] font-extrabold transition-[transform,background-color] duration-150 ease-v2 active:scale-[0.97] ${
                          type === id ? 'bg-v2-tint text-v2-deep ring-2 ring-v2-accent' : 'bg-white text-v2-ink-2 shadow-v2-ring'
                        }`}
                      >
                        <Icon size={20} strokeWidth={2.4} aria-hidden />
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2.5 flex items-start gap-2 rounded-[14px] bg-v2-surface px-3 py-2.5 text-[13px] font-bold leading-snug text-v2-ink-2">
                    <Info size={15} strokeWidth={2.4} className="mt-px shrink-0 text-v2-deep" aria-hidden />
                    {t.how}
                  </p>
                </div>

                {t.join === 'code' ? (
                  <label className="block">
                    <span className="mb-1.5 block text-[13px] font-extrabold text-v2-muted">קוד גישה</span>
                    <input
                      dir="ltr"
                      placeholder="OUT-XXXX"
                      className="h-12 w-full rounded-[14px] border border-v2-hairline bg-v2-surface px-4 text-start text-[18px] font-black tracking-[0.15em] outline-none focus:border-v2-accent focus:ring-[3px] focus:ring-v2-accent/20"
                    />
                  </label>
                ) : t.join === 'request' ? (
                  <label className="block">
                    <span className="mb-1.5 block text-[13px] font-extrabold text-v2-muted">שם מקום העבודה</span>
                    <input
                      placeholder="למשל: עיריית תל אביב"
                      className="h-12 w-full rounded-[14px] border border-v2-hairline bg-v2-surface px-4 text-[16px] font-extrabold outline-none focus:border-v2-accent focus:ring-[3px] focus:ring-v2-accent/20"
                    />
                  </label>
                ) : (
                  <>
                    <label className="block">
                      <span className="mb-1.5 block text-[13px] font-extrabold text-v2-muted">שם הליגה</span>
                      <input
                        defaultValue={type === 'neighborhood' ? 'הצפון הישן' : type === 'family' ? 'משפחת כהן' : 'החבר׳ה מהשכונה'}
                        className="h-12 w-full rounded-[14px] border border-v2-hairline bg-v2-surface px-4 text-[16px] font-extrabold outline-none focus:border-v2-accent focus:ring-[3px] focus:ring-v2-accent/20"
                      />
                    </label>
                    <div>
                      <span className="mb-1.5 block text-[13px] font-extrabold text-v2-muted">על מה מתחרים</span>
                      <div className="flex flex-wrap gap-1.5">
                        {CREATE_METRICS.map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setMetric(m)}
                            aria-pressed={metric === m}
                            className={`h-9 rounded-full px-4 text-[13px] font-extrabold transition-[transform,background-color] duration-150 ease-v2 active:scale-[0.97] ${
                              metric === m ? 'bg-v2-cta text-v2-on-cta' : 'bg-white text-v2-ink-2 shadow-v2-ring'
                            }`}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    </div>
                    {t.join === 'open' ? (
                      <button
                        type="button"
                        role="switch"
                        aria-checked={isPublic}
                        onClick={() => setIsPublic((v) => !v)}
                        className="flex w-full items-center gap-3 rounded-[18px] bg-v2-surface px-4 py-3 text-start ring-1 ring-inset ring-v2-hairline"
                      >
                        <span className="flex-1">
                          <span className="block text-[14.5px] font-extrabold">{isPublic ? 'ציבורית · בלי קוד' : 'פרטית · עם קישור הזמנה'}</span>
                          <span className="block text-[12px] font-bold text-v2-muted">
                            {isPublic ? 'כל מי שגר בשכונה יכול למצוא ולהצטרף' : 'רק מי שקיבל ממך קישור'}
                          </span>
                        </span>
                        <span className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200 ${isPublic ? 'bg-v2-cta' : 'bg-v2-pill-border'}`}>
                          <span
                            className="absolute top-1 h-5 w-5 rounded-full bg-white shadow-v2-ring transition-[inset-inline-start] duration-200 ease-v2"
                            style={{ insetInlineStart: isPublic ? 24 : 4 }}
                          />
                        </span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-3 rounded-[18px] bg-v2-surface px-4 py-3 ring-1 ring-inset ring-v2-hairline">
                        <div className="min-w-0 flex-1">
                          <div className="text-[12.5px] font-bold text-v2-muted">קישור הזמנה</div>
                          <div dir="ltr" className="truncate text-start text-[15px] font-black">outrun.co.il/join/4K7Q</div>
                        </div>
                        <button type="button" aria-label="העתקת הקישור" className="grid h-10 w-10 place-items-center rounded-full bg-white text-v2-deep shadow-v2-ring">
                          <Copy size={17} strokeWidth={2.4} />
                        </button>
                      </div>
                    )}
                  </>
                )}
                {t.join !== 'code' && t.join !== 'request' && (
                  <p className="text-[12.5px] font-bold leading-snug text-v2-muted">
                    כל חבר שמצטרף לאפליקציה דרך ההזמנה שלך מוסיף לך +{INVITES.perFriend} נק׳.
                  </p>
                )}
                <Button variant="primary" size="lg" block>
                  {t.join === 'code' ? 'כניסה עם הקוד' : t.join === 'request' ? 'שליחת בקשה לארגון' : (
                    <>
                      <UserPlus size={18} strokeWidth={2.6} aria-hidden />
                      {t.join === 'open' && isPublic ? 'פתיחת הליגה' : 'פתיחה והזמנת חברים'}
                    </>
                  )}
                </Button>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
