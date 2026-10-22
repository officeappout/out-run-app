'use client';

/**
 * The big planner, v2 (enable_week_builder_v1 + enable_home_v2; boards "לו״ז גדול · סבב 2",
 * PL2-*). Rendered by TrainingPlannerOverlay inside its slide-up shell when the flag is on.
 *
 *   header      "הלו״ז שלי" · Kelly star (→ the Kelly chat over this week, builder mode) · ✕
 *   plan line   "כוח + ריצה · 3 + 3 בשבוע" · אייקונים / טבעות
 *   month strip months top to bottom (icons or rings per day), today's row first
 *   week        the selected week: "השבוע" · שבוע N · סידור השבוע · done / planned, the calm
 *               offer, day rows with drag
 *
 * Kelly's proposal opens "סידור השבוע" with its moves applied (nothing saves until the
 * user confirms there). No extra screens. Tap a day → the day drawer (rings, done, planned);
 * tap a planned session → its sheet (planned time on the wheel, move, open).
 */
import { useCallback, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import ErrorBoundary from '@/components/ErrorBoundary';
import SegmentedPicker from '@/components/ui/v2/SegmentedPicker';
import { KellyWeekLauncher, plannedMovesOf } from '@/features/ai-coach/components/KellyWeekChip';
import { useUserStore } from '@/features/user';
import { resolveRunningCurrentWeek } from '@/features/workout-engine/shared/utils/running-current-week.utils';
import { isDateWithinRunningPlan } from '@/lib/running-plan-date-range';
import PlannerWeekSheet, { type PlannerWeekMode } from '@/features/schedule/week-builder/planner/components/PlannerWeekSheet';
import { usePlannerWeek } from '@/features/schedule/week-builder/planner/usePlannerWeek';
import type { PlannerWbData } from '@/features/schedule/week-builder/planner/plannerWeek';
import type { WbPlannedMove } from '@/features/schedule/week-builder/applyMoves';
import type { WbSession } from '@/features/schedule/week-builder/types';
import { weekContextLineHe } from '@/features/schedule/week-builder/weekContext';
import { builderContextOf } from '@/lib/ai/coach/schedule-proposal/builder-context';
import { useT } from '@/hooks/useT';
import { home } from '@/messages/ns/home';
import { coach } from '@/messages/ns/coach';
import { usePlannerMonths } from '../hooks/usePlannerMonths';
import { stripMonths } from '../lib/monthCells';
import { planLineOf, sundayOfKey } from '../lib/weekSummary';
import KellyStarButton from './KellyStarButton';
import PlannerMonthStrip, { type PlannerView } from './PlannerMonthStrip';
import PlannerWeekSection from './PlannerWeekSection';
import PlannerDayDrawer from './PlannerDayDrawer';
import PlannedSessionSheet from './PlannedSessionSheet';
import type { ProgressWorkout } from '@/features/progression-hub/v2/utils/progress-model';

const NO_WORKOUTS: ProgressWorkout[] = [];

export interface PlannerV2Props {
  userId: string;
  onClose: () => void;
  /** Bumped by the host after any schedule change. */
  refreshKey: number;
  /** After a save here (drag, "סידור השבוע", planned time). */
  onSaved: () => void;
  /** Done workout → its summary (home's handleHeroPress → tryOpenCompletedWorkout). */
  onStartWorkout?: (date: string, skipCompletedLookup?: boolean) => void;
}

interface SheetRequest {
  sunday: string;
  mode: PlannerWeekMode;
  initialMoves: WbPlannedMove[] | null;
}

const todayKeyOf = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export default function PlannerV2({ userId, onClose, refreshKey, onSaved, onStartWorkout }: PlannerV2Props) {
  const t = useT(home);
  const tc = useT(coach);
  const [view, setView] = useState<PlannerView>('icons');
  const [todayKey] = useState(todayKeyOf);
  const currentSunday = useMemo(() => sundayOfKey(todayKey), [todayKey]);
  const [weekSunday, setWeekSunday] = useState(currentSunday);
  const [selectedIso, setSelectedIso] = useState<string | null>(todayKey);
  const [sheet, setSheet] = useState<SheetRequest | null>(null);
  const [dayIso, setDayIso] = useState<string | null>(null);
  const [sessionSheet, setSessionSheet] = useState<{ session: WbSession<PlannerWbData>; iso: string } | null>(null);

  const months = useMemo(() => stripMonths(new Date(`${todayKey}T00:00:00`)), [todayKey]);
  const monthsData = usePlannerMonths(userId, months, refreshKey);
  const weekState = usePlannerWeek(userId, weekSunday, refreshKey);
  const model = weekState.status === 'ready' ? weekState.model : null;

  const programStartDate = useUserStore((s) => (s.profile as { running?: { activeProgram?: { startDate?: unknown } } } | null)?.running?.activeProgram?.startDate ?? null);
  const weekNumber = useMemo((): number | null => {
    const sunday = new Date(`${weekSunday}T00:00:00`);
    // Same rule as the classic planner header (isDateWithinRunningPlan first).
    if (programStartDate && !isDateWithinRunningPlan(programStartDate as never, sunday)) return null;
    return resolveRunningCurrentWeek(programStartDate as never, null, sunday) ?? null;
  }, [weekSunday, programStartDate]);

  const planLine = useMemo(() => {
    if (!model) return '';
    const line = planLineOf(model.week);
    if (line.tracks.length === 0) return '';
    return t('plannerV2.planLine', {
      tracks: line.tracks.map((k) => t(`plannerV2.track.${k}`)).join(' + '),
      counts: line.counts.join(' + '),
    });
  }, [model, t]);

  const handleSaved = useCallback(() => onSaved(), [onSaved]);

  const openDay = useCallback((iso: string) => {
    setSelectedIso(iso);
    setWeekSunday(sundayOfKey(iso));
    setDayIso(iso);
  }, []);

  // Done → that workout's summary; planned → its sheet (time / move / open).
  const openSession = useCallback(
    (s: WbSession<PlannerWbData>, iso: string) => {
      if (s.status === 'done') onStartWorkout?.(iso);
      else setSessionSheet({ session: s, iso });
    },
    [onStartWorkout],
  );

  const daySessions = useMemo(() => {
    if (!dayIso || !model) return [];
    const dow = weekState.keys.indexOf(dayIso);
    return dow < 0 ? [] : model.week.days[dow].sessions;
  }, [dayIso, model, weekState.keys]);

  const viewOptions = useMemo(
    () => [
      { key: 'icons' as const, label: t('plannerV2.view.icons') },
      { key: 'rings' as const, label: t('plannerV2.view.rings') },
    ],
    [t],
  );

  return (
    <div dir="rtl" className="flex min-h-0 flex-1 flex-col font-simpler text-v2-ink">
      <div className="flex-1 overflow-y-auto pb-8" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top, 24px))' }}>
        <div className="mx-auto w-full max-w-md">
          {/* Header */}
          <div className="flex items-center gap-2.5 px-5 pb-1 pt-2.5">
            <h2 className="whitespace-nowrap text-[26px] font-black leading-8 !tracking-[-0.02em] text-v2-ink">{t('plannerV2.title')}</h2>
            <ErrorBoundary fallback={null}>
              <KellyWeekLauncher
                weekLineHe={model ? weekContextLineHe(model.week) : ''}
                builderContext={model ? () => builderContextOf(model.week, model.rules) : null}
                onApplyMoves={model ? (moves) => setSheet({ sunday: weekSunday, mode: 'arrange', initialMoves: plannedMovesOf(moves) }) : null}
                contextOf={(line) => (line ? tc('weekChip.contextPlanner', { week: line }) : tc('weekChip.contextEmpty'))}
              >
                {(open) => <KellyStarButton onPress={open} />}
              </KellyWeekLauncher>
            </ErrorBoundary>
            <span className="flex-1" />
            <button
              type="button"
              onClick={onClose}
              aria-label={t('plannerV2.close')}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-white text-v2-ink shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
            >
              <X size={18} strokeWidth={2.2} aria-hidden />
            </button>
          </div>

          {/* Plan line + view toggle */}
          <div className="flex items-center justify-between gap-2.5 px-5 pb-3">
            <span className="min-w-0 truncate whitespace-nowrap text-[13.5px] font-bold text-v2-muted">{planLine}</span>
            <SegmentedPicker className="!w-[168px] shrink-0" options={viewOptions} value={view} onChange={setView} ariaLabel={t('plannerV2.view.aria')} />
          </div>

          {/* Month strip */}
          <div className="px-4">
            <ErrorBoundary fallback={null}>
              {monthsData.sections.length > 0 ? (
                <PlannerMonthStrip sections={monthsData.sections} view={view} selectedIso={selectedIso} stepGoal={monthsData.stepGoal} onDayTap={openDay} />
              ) : (
                <p role="status" className="rounded-[24px] bg-white px-4 py-10 text-center text-[14px] font-bold text-v2-muted shadow-v2-card">
                  {monthsData.status === 'error' ? t('plannerV2.error') : t('plannerV2.loading')}
                </p>
              )}
            </ErrorBoundary>
          </div>

          {/* Week */}
          <ErrorBoundary fallback={null}>
            <PlannerWeekSection
              userId={userId}
              state={weekState}
              isCurrentWeek={weekSunday === currentSunday}
              weekNumber={weekNumber}
              onArrange={() => setSheet({ sunday: weekSunday, mode: 'arrange', initialMoves: null })}
              onReplan={() => setSheet({ sunday: currentSunday, mode: 'replan', initialMoves: null })}
              onSaved={handleSaved}
              onOpenDay={openDay}
              onOpenSession={openSession}
            />
          </ErrorBoundary>
        </div>
      </div>

      <ErrorBoundary fallback={null}>
        <PlannerDayDrawer
          iso={dayIso}
          todayKey={todayKey}
          workouts={dayIso ? monthsData.workoutsByDate[dayIso] ?? NO_WORKOUTS : NO_WORKOUTS}
          day={dayIso ? monthsData.daysByDate[dayIso] : undefined}
          stepGoal={monthsData.stepGoal}
          sessions={daySessions}
          onClose={() => setDayIso(null)}
          onOpenWorkout={(iso) => onStartWorkout?.(iso)}
          onOpenSession={openSession}
        />
        <PlannedSessionSheet
          session={sessionSheet?.session ?? null}
          iso={sessionSheet?.iso ?? todayKey}
          isPast={!!sessionSheet && sessionSheet.iso < todayKey}
          userId={userId}
          onClose={() => setSessionSheet(null)}
          onSaved={handleSaved}
          onMove={() => {
            const iso = sessionSheet?.iso;
            setSessionSheet(null);
            setDayIso(null);
            if (iso) setSheet({ sunday: sundayOfKey(iso), mode: 'arrange', initialMoves: null });
          }}
          onOpenWorkout={onStartWorkout && sessionSheet ? () => onStartWorkout(sessionSheet.iso, true) : undefined}
        />
      </ErrorBoundary>

      <ErrorBoundary fallback={null}>
        <PlannerWeekSheet
          userId={userId}
          sunday={sheet?.sunday ?? null}
          mode={sheet?.mode ?? 'arrange'}
          initialMoves={sheet?.initialMoves ?? null}
          tellKellyRow
          onClose={() => setSheet(null)}
          onSaved={handleSaved}
        />
      </ErrorBoundary>
    </div>
  );
}
