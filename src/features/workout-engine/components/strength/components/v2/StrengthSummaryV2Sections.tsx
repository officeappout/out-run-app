'use client';

/**
 * Home-v2 (enable_home_v2) sections of the strength summary. Presentational
 * only — every number comes from real session/plan/activity data computed by
 * the page (see utils/phase-summary.ts and useSummaryAnalytics). Nothing here
 * owns a handler; the XP row keeps its own retry callback from the page.
 */

import React, { useId } from 'react';
import { Dumbbell, Flame, Flag, Wind, TrendingUp, Check, CalendarDays, Timer, Trophy } from 'lucide-react';
import AnimatedFlame from '@/components/ui/AnimatedFlame';
import { Card, CardTile, IconTile, StatNumber } from '@/components/ui/v2';
import type { ActivityType } from '@/features/activity/types/activity.types';
import type { WorkoutCompletionResult } from '@/features/user/core/types/progression.types';
import {
  formatWorkSeconds,
  type ExerciseSummary,
  type PhaseSummary,
  type SessionTotals,
  type SetSummary,
  type SummaryPhase,
} from '../../utils/phase-summary';

// ── Hero ────────────────────────────────────────────────────────────────────

export interface SummaryHeroV2Props {
  formattedDuration: string;
  calories: number;
  totals: SessionTotals;
  streak: number;
  streakFlameType: ActivityType;
  streakChainReady: boolean;
  /** XP row (keeps its own animation controls + retry handler). */
  xpSlot?: React.ReactNode;
}

const RING = 84;
const RING_STROKE = 8;
const RING_R = RING / 2 - RING_STROKE / 2 - 1;

function CompletionRing({ percent }: { percent: number }) {
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
        <span className="mt-0.5 whitespace-nowrap text-[11px] font-bold text-v2-muted">הושלם</span>
      </div>
    </div>
  );
}

export function SummaryHeroV2({
  formattedDuration,
  calories,
  totals,
  streak,
  streakFlameType,
  streakChainReady,
  xpSlot,
}: SummaryHeroV2Props) {
  const setsLabel =
    totals.setsPlanned !== null ? `${totals.setsDone}/${totals.setsPlanned}` : String(totals.setsDone);
  return (
    <Card padding="lg">
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <StatNumber value={0} format={() => formattedDuration} size="hero" label="זמן אימון" />
          {calories > 0 && (
            <p className="mt-1 whitespace-nowrap text-[12px] font-bold text-v2-muted">≈ {calories} קלוריות (הערכה)</p>
          )}
        </div>
        {totals.completionPercent !== null && <CompletionRing percent={totals.completionPercent} />}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <CardTile className="px-3 py-3">
          <IconTile icon={Dumbbell} tone="accent" size="sm" className="mb-2" />
          <StatNumber value={0} format={() => setsLabel} size="sm" label="סטים" />
        </CardTile>
        <CardTile className="px-3 py-3">
          <IconTile icon={totals.reps > 0 ? Check : Timer} tone="accent" size="sm" className="mb-2" />
          {totals.reps > 0 ? (
            <StatNumber value={totals.reps} size="sm" label="חזרות" />
          ) : (
            <StatNumber value={0} format={() => formatWorkSeconds(totals.workSeconds)} size="sm" label="שניות עבודה" />
          )}
        </CardTile>
        <CardTile className="px-3 py-3">
          <span className="mb-2 flex h-8 items-center">
            {streakChainReady ? (
              <AnimatedFlame activityType={streakFlameType} previousType="none" />
            ) : (
              <IconTile icon={Flag} tone="accent" size="sm" />
            )}
          </span>
          <StatNumber value={streak} size="sm" label="אימונים ברצף" />
        </CardTile>
      </div>

      {xpSlot}
    </Card>
  );
}

// ── This week (real activity-store numbers, incl. this session) ─────────────

export interface WeekCardV2Props {
  /** 'strength' | 'cardio' — which ring this session fills. */
  categoryLabel: string;
  sessions: number;
  /** Sessions the user scheduled per week (profile.lifestyle.scheduleDays), if set. */
  plannedSessions: number | null;
  /** Strength + cardio minutes this week (WHO aerobic baseline basis). */
  minutes: number;
  /** WHO baseline (150). */
  whoMinutes: number;
}

function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-v2-tint">
      <div className="h-full rounded-full bg-v2-accent transition-[width] duration-500 ease-v2" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function WeekCardV2({ categoryLabel, sessions, plannedSessions, minutes, whoMinutes }: WeekCardV2Props) {
  return (
    <Card padding="lg">
      <div className="flex items-center gap-2">
        <IconTile icon={CalendarDays} tone="accent" size="sm" />
        <h3 className="whitespace-nowrap text-[16px] font-black text-v2-ink">השבוע שלך</h3>
      </div>

      <div className="mt-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-[14px] font-bold text-v2-ink-2">{categoryLabel}</span>
          <span className="whitespace-nowrap text-[15px] font-black tabular-nums text-v2-ink">
            {plannedSessions ? `${sessions}/${plannedSessions}` : sessions}
          </span>
        </div>
        {plannedSessions ? (
          <>
            <Bar value={sessions} max={plannedSessions} />
            <p className="mt-1.5 text-[12px] font-bold text-v2-muted">מתוך {plannedSessions} אימונים שתכננת לשבוע</p>
          </>
        ) : (
          <p className="mt-1 text-[12px] font-bold text-v2-muted">כולל האימון הזה</p>
        )}
      </div>

      <div className="mt-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-[14px] font-bold text-v2-ink-2">דקות פעילות</span>
          <span className="whitespace-nowrap text-[15px] font-black tabular-nums text-v2-ink">
            {Math.round(minutes)}/{whoMinutes}
          </span>
        </div>
        <Bar value={minutes} max={whoMinutes} />
        <p className="mt-1.5 text-[12px] font-bold text-v2-muted">המלצת ארגון הבריאות העולמי: {whoMinutes} דקות בשבוע</p>
      </div>
    </Card>
  );
}

// ── Level-gain breakdown (only real progression components) ────────────────

export function GainCardV2({ progressionResult }: { progressionResult: WorkoutCompletionResult | null }) {
  if (!progressionResult?.success) return null;
  const g = progressionResult.activeProgramGain;
  const totalGoals = progressionResult.goalProgress.length;
  const metGoals = progressionResult.goalProgress.filter((x) => x.achieved).length;
  const rows: { label: string; value: string }[] = [
    { label: 'השלמת אימון', value: `${(Math.round(progressionResult.sessionCompletionPercent * 10) / 10).toFixed(1)}%` },
  ];
  if (totalGoals > 0) rows.push({ label: `יעדים שהושגו (${metGoals}/${totalGoals})`, value: `${Math.round((metGoals / totalGoals) * 100)}%` });
  if (g.bonusGain > 0) rows.push({ label: 'בונוס ביצוע מעל היעד', value: `+${g.bonusGain.toFixed(1)}%` });
  if (g.goalBonusGain > 0) rows.push({ label: 'בונוס יעדי רמה', value: `+${g.goalBonusGain.toFixed(1)}%` });
  if (g.masteryBonusGain > 0) rows.push({ label: 'בונוס שליטה במיומנות', value: `+${g.masteryBonusGain.toFixed(1)}%` });

  return (
    <Card padding="lg">
      <div className="flex items-center gap-2">
        <IconTile icon={TrendingUp} tone="accent" size="sm" />
        <h3 className="whitespace-nowrap text-[16px] font-black text-v2-ink">פירוט התקדמות</h3>
      </div>
      <div className="mt-3 space-y-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-3">
            <span className="truncate text-[14px] font-semibold text-v2-ink-2">{r.label}</span>
            <span className="whitespace-nowrap text-[14px] font-extrabold tabular-nums text-v2-ink">{r.value}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-v2-hairline pt-3">
        <span className="whitespace-nowrap text-[15px] font-black text-v2-ink">סה״כ התקדמות ברמה</span>
        <span className="whitespace-nowrap text-[17px] font-black tabular-nums text-v2-deep">+{g.totalGain.toFixed(1)}%</span>
      </div>
    </Card>
  );
}

// ── Improvements vs the previous session (real Progression Memory) ──────────

export function ImprovementsCardV2({ phases }: { phases: PhaseSummary[] }) {
  const improved = phases
    .flatMap((p) => p.blocks.flatMap((b) => b.exercises))
    .filter((e) => e.improvedBy !== null);
  if (improved.length === 0) return null;
  return (
    <Card padding="lg" className="!bg-v2-tint">
      <div className="flex items-center gap-2">
        <IconTile icon={Trophy} tone="gold" size="sm" />
        <h3 className="whitespace-nowrap text-[16px] font-black text-v2-ink">שיפור מהפעם הקודמת</h3>
      </div>
      <div className="mt-3 space-y-2">
        {improved.map((e) => (
          <div key={e.key} className="flex items-center justify-between gap-3">
            <span className="truncate text-[14px] font-bold text-v2-ink">{e.name}</span>
            <span className="inline-flex items-center gap-1 whitespace-nowrap text-[13px] font-extrabold tabular-nums text-v2-deep">
              <TrendingUp size={14} strokeWidth={2.6} aria-hidden />+{e.improvedBy} {unitShort(e.unit)}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Phase breakdown ─────────────────────────────────────────────────────────

const PHASE_META: Record<SummaryPhase, { label: string; icon: typeof Flame }> = {
  warmup: { label: 'חימום', icon: Flame },
  main: { label: 'חלק עיקרי', icon: Dumbbell },
  cooldown: { label: 'שחרור ומתיחות', icon: Wind },
};

const PROTOCOL_LABEL: Record<string, string> = {
  superset: 'סופר סט',
  pyramid: 'פירמידה',
  tabata: 'טבטה',
  emom: 'EMOM',
  amrap: 'AMRAP',
};

function unitShort(unit: ExerciseSummary['unit']): string {
  return unit === 'seconds' ? 'שנ׳' : unit === 'reps' ? 'חזרות' : '';
}

function plannedLabel(ex: ExerciseSummary): string | null {
  if (ex.plannedSets === null || ex.plannedSets === 0) return null;
  const targets = ex.sets.slice(0, ex.plannedSets).map((s) => s.target);
  const known = targets.filter((t): t is number => t !== null);
  const unit = unitShort(ex.unit);
  if (known.length === 0) return `${ex.plannedSets} סטים`;
  const uniform = known.every((t) => t === known[0]) && known.length === targets.length;
  const body = uniform ? `${ex.plannedSets} × ${known[0]}` : known.join('-');
  return `${body}${unit ? ` ${unit}` : ''}`;
}

function SetPill({ set }: { set: SetSummary }) {
  if (set.mark === 'missed') {
    return (
      <span className="inline-flex h-7 min-w-[2.25rem] items-center justify-center rounded-full bg-v2-surface px-2 text-[12px] font-bold text-v2-muted ring-1 ring-inset ring-v2-hairline">
        –
      </span>
    );
  }
  if (set.mark === 'partial') {
    return (
      <span className="inline-flex h-7 min-w-[2.25rem] items-center justify-center whitespace-nowrap rounded-full bg-v2-amber/10 px-2 text-[12px] font-extrabold tabular-nums text-[#b45309] ring-1 ring-inset ring-v2-amber/30">
        {set.done}/{set.target}
      </span>
    );
  }
  return (
    <span className="inline-flex h-7 min-w-[2.25rem] items-center justify-center whitespace-nowrap rounded-full bg-v2-tint px-2 text-[12px] font-extrabold tabular-nums text-v2-deep ring-1 ring-inset ring-v2-accent/40">
      {set.done}
    </span>
  );
}

function ExerciseRowV2({ ex }: { ex: ExerciseSummary }) {
  const planned = plannedLabel(ex);
  const unit = unitShort(ex.unit);
  const statusText =
    ex.status === 'skipped' ? 'לא בוצע' : ex.status === 'done' ? 'הושלם' : 'בוצע חלקית';
  const statusClass =
    ex.status === 'skipped'
      ? 'text-v2-muted'
      : ex.status === 'done'
        ? 'text-v2-deep'
        : 'text-[#b45309]';
  return (
    <div className={`py-3 ${ex.status === 'skipped' ? 'opacity-70' : ''}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-[15px] font-extrabold text-v2-ink">{ex.name}</span>
        <span className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[12px] font-extrabold ${statusClass}`}>
          {ex.status === 'done' && <Check size={14} strokeWidth={3} aria-hidden />}
          {statusText}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px] font-bold text-v2-muted">
        {planned && <span className="whitespace-nowrap">תוכנן: {planned}</span>}
        <span className="whitespace-nowrap">
          בוצע: {ex.doneSets} {ex.doneSets === 1 ? 'סט' : 'סטים'}
          {ex.total > 0 && ` · ${ex.unit === 'seconds' ? formatWorkSeconds(ex.total) : ex.total}${unit ? ` ${unit}` : ''}`}
        </span>
        {ex.improvedBy !== null && (
          <span className="inline-flex items-center gap-0.5 whitespace-nowrap text-v2-deep">
            <TrendingUp size={12} strokeWidth={2.8} aria-hidden />+{ex.improvedBy}
          </span>
        )}
      </div>
      {ex.sets.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5" aria-label="סטים">
          {ex.sets.map((s, i) => (
            <SetPill key={i} set={s} />
          ))}
        </div>
      )}
    </div>
  );
}

function PhaseCard({ phase, showBlockTitles }: { phase: PhaseSummary; showBlockTitles: boolean }) {
  const meta = PHASE_META[phase.phase];
  const t = phase.totals;
  const setsChip = t.setsPlanned !== null ? `${t.setsDone}/${t.setsPlanned} סטים` : `${t.setsDone} סטים`;
  return (
    <Card padding="none" className="overflow-hidden">
      <div className="flex items-center gap-3 px-4 pb-2 pt-4">
        <IconTile icon={meta.icon} tone="accent" size="sm" />
        <h3 className="min-w-0 flex-1 truncate text-[17px] font-black text-v2-ink">{meta.label}</h3>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="inline-flex h-7 items-center whitespace-nowrap rounded-full bg-v2-tint px-3 text-[12px] font-extrabold tabular-nums text-v2-deep">
            {setsChip}
          </span>
          {t.workSeconds > 0 && (
            <span className="inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-full bg-white px-3 text-[12px] font-extrabold tabular-nums text-v2-ink-2 shadow-v2-ring">
              <Timer size={13} strokeWidth={2.6} aria-hidden />
              {formatWorkSeconds(t.workSeconds)}
            </span>
          )}
          {t.reps > 0 && (
            <span className="inline-flex h-7 items-center whitespace-nowrap rounded-full bg-white px-3 text-[12px] font-extrabold tabular-nums text-v2-ink-2 shadow-v2-ring">
              {t.reps} חזרות
            </span>
          )}
        </div>
      </div>
      <div className="px-4 pb-2">
        {phase.blocks.map((b) => (
          <div key={b.id} className="border-t border-v2-hairline first:border-t-0">
            {showBlockTitles && (b.title || (b.protocol && PROTOCOL_LABEL[b.protocol])) && (
              <div className="flex items-center gap-2 pt-3">
                {b.title && <span className="truncate text-[13px] font-extrabold text-v2-deep">{b.title}</span>}
                {b.protocol && PROTOCOL_LABEL[b.protocol] && (
                  <span className="inline-flex h-6 items-center whitespace-nowrap rounded-full bg-v2-surface px-2.5 text-[11px] font-bold text-v2-ink-2 ring-1 ring-inset ring-v2-hairline">
                    {PROTOCOL_LABEL[b.protocol]}
                  </span>
                )}
              </div>
            )}
            <div className="divide-y divide-v2-hairline">
              {b.exercises.map((ex) => (
                <ExerciseRowV2 key={ex.key} ex={ex} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function PhaseBreakdownV2({ phases }: { phases: PhaseSummary[] }) {
  if (phases.length === 0) {
    return (
      <Card padding="lg">
        <p className="text-center text-[14px] font-bold text-v2-muted">אין תרגילים להצגה</p>
      </Card>
    );
  }
  return (
    <>
      {phases.map((p) => (
        <PhaseCard key={p.phase} phase={p} showBlockTitles={p.phase === 'main' || p.blocks.length > 1} />
      ))}
    </>
  );
}
