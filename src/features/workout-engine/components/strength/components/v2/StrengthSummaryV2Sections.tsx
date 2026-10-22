'use client';

/**
 * Home-v2 (enable_home_v2) sections of the strength summary — the approved
 * A-6c design. Presentational only: every number comes from real
 * session/plan/activity data computed by the page (utils/phase-summary.ts,
 * utils/summary-v2.mapping.ts, useSummaryAnalytics, the activity store).
 * No XP here and no "פירוט התקדמות" (owner decision); sections without
 * data are hidden by their caller.
 */

import React, { useId } from 'react';
import { Dumbbell, Flame, Wind, Timer } from 'lucide-react';
import {
  Card,
  ExerciseSetsTable,
  ImprovementCard,
  ProgramProgressRing,
  SetsLegend,
  StatNumber,
  StreakDotsStrip,
  IconTile,
  tonesPresent,
  type SetTile,
  type StreakWeekBar,
  type WeekDot,
  type ProgramProgressItem,
} from '@/components/ui/v2';
import {
  formatWorkSeconds,
  type PhaseSummary,
  type SessionTotals,
  type SummaryPhase,
} from '../../utils/phase-summary';
import { exerciseRows, heroSetGroups, improvementItems } from '../../utils/summary-v2.mapping';
import { useT } from '@/hooks/useT';
import { player, type PlayerKey, type PlayerT } from '@/messages/ns/player';

// ── Hero ────────────────────────────────────────────────────────────────────

export interface SummaryHeroV2Props {
  formattedDuration: string;
  calories: number;
  totals: SessionTotals;
  phases: PhaseSummary[];
}

const RING = 84;
const RING_STROKE = 8;
const RING_R = RING / 2 - RING_STROKE / 2 - 1;

function CompletionRing({ percent }: { percent: number }) {
  const t = useT(player);
  const gid = useId().replace(/:/g, '');
  const c = 2 * Math.PI * RING_R;
  const off = c * (1 - Math.max(0, Math.min(100, percent)) / 100);
  return (
    <div className="relative shrink-0" style={{ width: RING, height: RING }}>
      <svg width={RING} height={RING} viewBox={`0 0 ${RING} ${RING}`} aria-hidden>
        <defs>
          <linearGradient id={`done-${gid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#00baf7" />
            <stop offset="100%" stopColor="#0cf2e3" />
          </linearGradient>
        </defs>
        <circle cx={RING / 2} cy={RING / 2} r={RING_R} fill="none" stroke="#eef8fc" strokeWidth={RING_STROKE} />
        <circle
          cx={RING / 2}
          cy={RING / 2}
          r={RING_R}
          fill="none"
          stroke={`url(#done-${gid})`}
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={off}
          transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[19px] font-black leading-none tabular-nums text-v2-ink">{percent}%</span>
        <span className="mt-0.5 whitespace-nowrap text-[11px] font-bold text-v2-muted">{t('strengthSummary.hero.done')}</span>
      </div>
    </div>
  );
}

const MINI_TONE: Record<SetTile['tone'], string> = {
  in: 'bg-v2-accent',
  below: 'bg-v2-amber',
  missed: 'border border-dashed border-v2-muted bg-white',
};

/** "17/18 סטים · 168 חזרות" + one small box per set, grouped by exercise. */
function SetsStrip({ totals, phases }: { totals: SessionTotals; phases: PhaseSummary[] }) {
  const t = useT(player);
  const groups = heroSetGroups(phases);
  if (groups.length === 0) return null;
  const setsLabel = totals.setsPlanned !== null ? `${totals.setsDone}/${totals.setsPlanned}` : String(totals.setsDone);
  const second =
    totals.reps > 0
      ? t('strengthSummary.hero.reps', { reps: String(totals.reps) })
      : totals.workSeconds > 0
        ? t('strengthSummary.hero.workTime', { time: formatWorkSeconds(totals.workSeconds) })
        : null;
  const tones = tonesPresent(groups.flat());
  return (
    <div className="mt-4 border-t border-v2-hairline pt-4">
      <div className="flex items-baseline gap-1.5">
        <span className="text-[22px] font-black leading-none tabular-nums tracking-[-0.03em] text-v2-ink">{setsLabel}</span>
        <span className="whitespace-nowrap text-[14px] font-black text-v2-ink">{t('strengthSummary.hero.sets')}</span>
        {second && <span className="whitespace-nowrap text-[12.5px] font-bold text-v2-muted">· {second}</span>}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-[7px] gap-y-1.5" aria-hidden>
        {groups.map((g, gi) => (
          <span key={gi} className="inline-flex gap-[3px]">
            {g.map((tile, i) => (
              <span key={i} className={`h-3.5 w-3.5 rounded-[4px] ${MINI_TONE[tile.tone]}`} />
            ))}
          </span>
        ))}
      </div>
      <div className="mt-2">
        <SetsLegend tones={tones} />
      </div>
    </div>
  );
}

export function SummaryHeroV2({ formattedDuration, calories, totals, phases }: SummaryHeroV2Props) {
  const t = useT(player);
  return (
    <Card padding="lg">
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <StatNumber value={0} format={() => formattedDuration} size="hero" label={t('strengthSummary.hero.duration')} />
          {calories > 0 && (
            <p className="mt-1 whitespace-nowrap text-[12px] font-bold text-v2-muted">{t('strengthSummary.hero.calories', { calories: String(calories) })}</p>
          )}
        </div>
        {totals.completionPercent !== null && <CompletionRing percent={totals.completionPercent} />}
      </div>
      <SetsStrip totals={totals} phases={phases} />
    </Card>
  );
}

// ── This week (real activity-store numbers, incl. this session) ─────────────

export interface WeekCardV2Props {
  /** Bar label, e.g. "אימוני כוח השבוע". */
  categoryLabel: string;
  sessions: number;
  /** Sessions the user scheduled per week (profile.lifestyle.scheduleDays), if set. */
  plannedSessions: number | null;
  /** Strength + cardio minutes this week (WHO aerobic baseline basis). */
  minutes: number;
  /** WHO baseline (150). */
  whoMinutes: number;
}

export function weekBars(t: PlayerT, week: WeekCardV2Props | null): StreakWeekBar[] | undefined {
  if (!week) return undefined;
  return [
    { label: week.categoryLabel, value: week.sessions, max: week.plannedSessions },
    { label: t('strengthSummary.week.activeMinutes'), value: week.minutes, max: week.whoMinutes },
  ];
}

export function StreakCardV2({
  streak,
  best,
  days,
  week,
}: {
  streak: number;
  best: number;
  days: WeekDot[];
  week: WeekCardV2Props | null;
}) {
  const t = useT(player);
  return <StreakDotsStrip streak={streak} best={best} days={days} bars={weekBars(t, week)} />;
}

// ── Program progress + improvements ─────────────────────────────────────────

export function ProgramCardV2({ item }: { item: ProgramProgressItem | null }) {
  if (!item) return null;
  return <ProgramProgressRing items={[item]} />;
}

export function ImprovementsCardV2({ phases }: { phases: PhaseSummary[] }) {
  const items = improvementItems(phases);
  if (items.length === 0) return null;
  return <ImprovementCard items={items} />;
}

// ── Phase breakdown (F-3g exercise table) ───────────────────────────────────

const PHASE_META: Record<SummaryPhase, { labelKey: PlayerKey; icon: typeof Flame }> = {
  warmup: { labelKey: 'strengthSummary.phase.warmup', icon: Flame },
  main: { labelKey: 'strengthSummary.phase.main', icon: Dumbbell },
  cooldown: { labelKey: 'strengthSummary.phase.cooldown', icon: Wind },
};

const PROTOCOL_LABEL: Record<string, PlayerKey> = {
  superset: 'strengthSummary.protocol.superset',
  pyramid: 'strengthSummary.protocol.pyramid',
  tabata: 'strengthSummary.protocol.tabata',
  emom: 'strengthSummary.protocol.emom',
  amrap: 'strengthSummary.protocol.amrap',
};

function blockTitle(t: PlayerT, phase: SummaryPhase, b: PhaseSummary['blocks'][number]): string {
  const n = b.exercises.length;
  const count = t('strengthSummary.phase.exerciseCount', { count: n, n: String(n) });
  if (phase !== 'main') return count;
  const protoKey =
    b.protocol && Object.prototype.hasOwnProperty.call(PROTOCOL_LABEL, b.protocol) ? PROTOCOL_LABEL[b.protocol] : undefined;
  const proto = protoKey ? t(protoKey) : undefined;
  const parts = [b.title, proto].filter((x): x is string => !!x && x.length > 0);
  return parts.length > 0 ? parts.join(' · ') : count;
}

function PhaseCard({ phase }: { phase: PhaseSummary }) {
  const t = useT(player);
  const meta = PHASE_META[phase.phase];
  const tot = phase.totals;
  const setsChip =
    tot.setsPlanned !== null
      ? t('strengthSummary.phase.setsOf', { done: String(tot.setsDone), planned: String(tot.setsPlanned) })
      : t('strengthSummary.phase.sets', { done: String(tot.setsDone) });
  return (
    <Card padding="none" className="px-3.5 pb-3.5 pt-4">
      <div className="mb-3 flex items-center gap-2.5">
        <IconTile icon={meta.icon} tone="accent" size="sm" />
        <h3 className="min-w-0 flex-1 truncate text-[17px] font-black text-v2-ink">{t(meta.labelKey)}</h3>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="inline-flex h-7 items-center whitespace-nowrap rounded-full bg-v2-tint px-3 text-[12px] font-extrabold tabular-nums text-v2-deep">
            {setsChip}
          </span>
          {tot.workSeconds > 0 ? (
            <span className="inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-full bg-white px-3 text-[12px] font-extrabold tabular-nums text-v2-ink-2 shadow-v2-ring">
              <Timer size={13} strokeWidth={2.6} aria-hidden />
              {formatWorkSeconds(tot.workSeconds)}
            </span>
          ) : (
            tot.reps > 0 && (
              <span className="inline-flex h-7 items-center whitespace-nowrap rounded-full bg-white px-3 text-[12px] font-extrabold tabular-nums text-v2-ink-2 shadow-v2-ring">
                {t('strengthSummary.phase.reps', { reps: String(tot.reps) })}
              </span>
            )
          )}
        </div>
      </div>
      <div className="space-y-3.5">
        {phase.blocks.map((b) => (
          <ExerciseSetsTable key={b.id} title={blockTitle(t, phase.phase, b)} rows={exerciseRows(b.exercises)} />
        ))}
      </div>
    </Card>
  );
}

export function PhaseBreakdownV2({ phases }: { phases: PhaseSummary[] }) {
  const t = useT(player);
  if (phases.length === 0) {
    return (
      <Card padding="lg">
        <p className="text-center text-[14px] font-bold text-v2-muted">{t('strengthSummary.breakdown.empty')}</p>
      </Card>
    );
  }
  return (
    <>
      {phases.map((p) => (
        <PhaseCard key={p.phase} phase={p} />
      ))}
    </>
  );
}
