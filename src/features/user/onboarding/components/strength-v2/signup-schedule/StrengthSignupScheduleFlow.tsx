'use client';

/**
 * Strength schedule inside LifestyleWizard — recommendation first
 * (enable_home_v2, journey 1: boards jr/J1-07..J1-09, sch/S-5a..S-5c).
 * count (pre-filled) → days + time of day (pre-marked) → the ready week.
 * Flag off never mounts this (the wizard keeps ScheduleStep).
 *
 * Owns the selection state; the week is engine v2 over the user's strength
 * seed (the same resolveScheduleSeed ScheduleStep uses). Confirming writes
 * ScheduleStep's own onboarding-store fields (strengthWeekRecommendation's
 * buildStrengthScheduleWrite); the wizard's final submit then applies them
 * through the #517 guard (buildLifestyleWizardFinalWrite).
 * `sub` lives in the wizard so its header back button can step back here.
 */
import { useMemo, useState } from 'react';
import { auth } from '@/lib/firebase';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { Analytics } from '@/features/analytics/AnalyticsService';
import { computeBaseLevel } from '@/features/home/utils/dailyStrengthTarget';
import { resolveScheduleSeed, type ScheduleSeedProfileInput } from '@/features/schedule/services/scheduleSeed.service';
import type { TimeWindow } from '@/features/schedule/engine-v2/types';
import { toggleRunDay } from '@/features/schedule/utils/runWeekRecommendation';
import { comingDayOfMonthByDow, comingWeek } from '@/features/schedule/utils/comingWeekDates';
import {
  DEFAULT_STRENGTH_WINDOW,
  buildStrengthScheduleWrite,
  recommendStrengthFrequency,
  recommendStrengthWeek,
  recommendedStrengthDays,
  strengthItemCounts,
  strengthPlanLine,
  strengthRecommendationTitle,
  strengthTrainingLevel,
  strengthWhyLine,
  windowForTime,
  type StrengthSeed,
  type StrengthWeekRecommendation,
} from '@/features/schedule/utils/strengthWeekRecommendation';
import { scheduleIdNameHe } from '@/features/schedule/engine/strengthVocabulary';
import { useOnboardingStore } from '../../../store/useOnboardingStore';
import { useWizardIdentity } from '../../../hooks/useWizardIdentity';
import RunDaysStep from '../../running-v2/signup-schedule/RunDaysStep';
import StrengthCountStep, { type HistoryFrequency } from './StrengthCountStep';
import StrengthWeekStep from './StrengthWeekStep';

export const STRENGTH_SCHEDULE_SUBSTEPS = 3;

export interface StrengthSignupScheduleFlowProps {
  sub: number;
  setSub: (n: number) => void;
  /** "אישור השבוע" — the store already holds the week. */
  onConfirmed: (week: StrengthWeekRecommendation) => void | Promise<void>;
  /** "רוצה להוסיף ריצה?" — the store already holds the week. */
  onAddRun: (week: StrengthWeekRecommendation) => void | Promise<void>;
}

function readSessionJson<T>(key: string): T | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

const isHistory = (v: unknown): v is HistoryFrequency => v === 'none' || v === '1-2' || v === '3+';

export default function StrengthSignupScheduleFlow({ sub, setSub, onConfirmed, onAddRun }: StrengthSignupScheduleFlowProps) {
  const { data, updateData } = useOnboardingStore();
  const profile = useUserStore((s) => s.profile);
  const { gender } = useWizardIdentity();

  // The same seed ScheduleStep builds (sessionStorage reads kept here, the
  // resolver stays pure).
  const seed = useMemo<StrengthSeed>(() => {
    const skillFocusSlugs = readSessionJson<string[]>('onboarding_skill_focus');
    const programPath = typeof window !== 'undefined' ? sessionStorage.getItem('onboarding_program_path') ?? undefined : undefined;
    const r = resolveScheduleSeed(profile as ScheduleSeedProfileInput | null | undefined, { skillFocusSlugs, programPath });
    return { programs: r.seedPrograms, skills: r.seedSkills };
    // Seed is fixed for the life of the step (ScheduleStep's own rule).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const level = useMemo(() => {
    const prog = profile?.progression as { tracks?: Record<string, { currentLevel?: number }>; domains?: Record<string, { currentLevel?: number }> } | undefined;
    return prog?.tracks || prog?.domains ? computeBaseLevel(prog?.tracks, prog?.domains) : null;
  }, [profile]);
  const engineLevel = strengthTrainingLevel(level);

  const personaIds = useMemo(() => {
    const store = data as { selectedPersonaIds?: string[]; selectedPersonaId?: string };
    if (store.selectedPersonaIds?.length) return store.selectedPersonaIds;
    if (store.selectedPersonaId) return [store.selectedPersonaId];
    return ((profile as { personas?: Array<{ id?: string }> } | null)?.personas ?? []).map((p) => p.id).filter((id): id is string => !!id);
  }, [data, profile]);

  const rec = useMemo(() => recommendStrengthFrequency({ seed, personaIds }), [seed, personaIds]);
  const defaultWindow: TimeWindow =
    windowForTime((profile?.lifestyle as { trainingTime?: string } | undefined)?.trainingTime) ?? DEFAULT_STRENGTH_WINDOW;

  const [frequency, setFrequency] = useState<number>(rec.frequency);
  const [days, setDays] = useState<number[]>(() => recommendedStrengthDays(seed, rec.frequency, engineLevel));
  const [windows, setWindows] = useState<Partial<Record<number, TimeWindow>>>({});
  const [history, setHistory] = useState<HistoryFrequency | null>(() => (isHistory(data.historyFrequency) ? data.historyFrequency : null));

  const windowsWithDefault = useMemo(() => {
    const out: Partial<Record<number, TimeWindow>> = {};
    for (const d of days) out[d] = windows[d] ?? defaultWindow;
    return out;
  }, [days, windows, defaultWindow]);

  const week = useMemo(
    () => recommendStrengthWeek({ seed, frequency, days, windows: windowsWithDefault, level: engineLevel }),
    [seed, frequency, days, windowsWithDefault, engineLevel],
  );

  const coming = useMemo(() => comingWeek(), []);
  const dates = useMemo(() => comingDayOfMonthByDow(), []);

  const handleFrequency = (n: number) => {
    setFrequency(n);
    setDays((cur) => (cur.length === n ? cur : recommendedStrengthDays(seed, n, engineLevel)));
  };

  const save = async () => {
    updateData(buildStrengthScheduleWrite({ week, historyFrequency: history }));
    await Analytics.logOnboardingStepComplete('SCHEDULE', 0);
  };

  if (sub === 0) {
    return (
      <StrengthCountStep
        recommendationTitle={strengthRecommendationTitle(seed, days)}
        whyLine={strengthWhyLine({ level, recoveryHours: week.recoveryHours, personaNoteHe: rec.personaNoteHe })}
        planLine={strengthPlanLine(seed)}
        recommendedFrequency={rec.frequency}
        frequency={frequency}
        onFrequency={handleFrequency}
        history={history}
        onHistory={setHistory}
        question={gender === 'female' ? 'כמה ימים בשבוע את פנויה להתאמן?' : 'כמה ימים בשבוע אתה פנוי להתאמן?'}
        onNext={() => setSub(1)}
      />
    );
  }
  if (sub === 1) {
    return (
      <RunDaysStep
        frequency={frequency}
        days={days}
        windows={windowsWithDefault}
        dates={dates}
        onToggleDay={(dow) => setDays((cur) => toggleRunDay(cur, dow, frequency))}
        onWindow={(dow, w) => setWindows((cur) => ({ ...cur, [dow]: w }))}
        onNext={() => setSub(2)}
      />
    );
  }
  const counts = strengthItemCounts(week).map((c) => `${scheduleIdNameHe(c.id)} ×${c.count}`);
  return (
    <StrengthWeekStep
      subtitle={['כוח', ...counts, 'מוכן לאישור'].join(' · ')}
      week={week}
      coming={coming}
      userId={auth.currentUser?.uid ?? profile?.id ?? 'preview'}
      frequency={frequency}
      onFrequency={handleFrequency}
      onAddRun={async () => {
        await save();
        await onAddRun(week);
      }}
      onConfirm={async () => {
        await save();
        await onConfirmed(week);
      }}
    />
  );
}
