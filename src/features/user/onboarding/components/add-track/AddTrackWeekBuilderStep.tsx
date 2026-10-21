'use client';

/**
 * Add track · the week builder (enable_week_builder_v1; boards S-6b / S-6c on the S-2c
 * builder). Replaces AddTrackWeekStep: two tracks are always a complex week. The engine's
 * combined week comes in ready (add-track mode: keep the user's week, move only what a hard
 * rule forces); the priority slider is the add-track preset ↔ balanced ↔ the other way, the
 * "keep it as it was" alternative stays, and the user's own moves keep each session's home
 * day so the save knows what moved (wbToAddTrackDays → planAddTrackSave).
 */
import { useMemo, useState, type ReactNode } from 'react';
import { useT } from '@/hooks/useT';
import { onboarding, type OnboardingKey } from '@/messages/ns/onboarding';
import type { SchedulePriority } from '@/features/schedule/engine-v2/types';
import type { AddedTrack } from '@/features/schedule/add-track/addTrackProfile';
import type { AddTrackDayView, AddTrackWeekView } from '@/features/schedule/add-track/addTrackWeek';
import { createWeekEngine, type WbRules, type WbWeek } from '@/features/schedule/week-builder';
import { addTrackWeekToWb, wbToAddTrackDays, type AddTrackWbData } from '@/features/schedule/week-builder/adapters/addTrack';
import WeekBuilder from '@/features/schedule/week-builder/components/WeekBuilder';

const COPY: Record<AddedTrack, { title: OnboardingKey; subtitle: OnboardingKey }> = {
  running: { title: 'signup.addTrack.running.title', subtitle: 'signup.addTrack.running.subtitle' },
  strength: { title: 'signup.addTrack.strength.title', subtitle: 'signup.addTrack.strength.subtitle' },
};

export interface AddTrackWeekBuilderStepProps {
  added: AddedTrack;
  week: AddTrackWeekView;
  openDays: number[];
  times: { run: string; strength: string };
  /** The engine caps this week was built with (addTrackRules over addTrackEngineInput). */
  rules: WbRules;
  dates: number[];
  priority: SchedulePriority;
  onPriority: (p: SchedulePriority) => void;
  keepOnly: boolean;
  onToggleKeepOnly: (() => void) | null;
  headerAction?: ReactNode;
  error: string | null;
  onConfirm: (days: AddTrackDayView[]) => void | Promise<void>;
}

export default function AddTrackWeekBuilderStep(p: AddTrackWeekBuilderStepProps) {
  const t = useT(onboarding);
  const copy = COPY[p.added];
  const rules = p.rules;
  const ctx = useMemo(() => ({ openDays: p.openDays, times: p.times }), [p.openDays, p.times]);
  const fresh = useMemo(() => addTrackWeekToWb(p.week, ctx, rules), [p.week, ctx, rules]);
  // Edits belong to the engine week they were made on (a new priority / keep-only starts clean).
  const [edited, setEdited] = useState<{ base: AddTrackWeekView; wb: WbWeek<AddTrackWbData> } | null>(null);
  const wb = edited?.base === p.week ? edited.wb : fresh;
  const engine = useMemo(() => createWeekEngine<AddTrackWbData>(rules), [rules]);
  const days = wbToAddTrackDays(wb);
  const newCount = days.reduce((n, d) => n + d.sessions.filter((s) => s.status === 'new').length, 0);

  return (
    <WeekBuilder
      title={t(copy.title)}
      subtitle={t(copy.subtitle)}
      week={wb}
      engine={engine}
      onChange={(next) => setEdited({ base: p.week, wb: next })}
      dates={p.dates}
      headerAction={p.headerAction}
      priority={{ value: p.priority, onChange: p.onPriority }}
      extra={
        p.onToggleKeepOnly && (
          <button
            type="button"
            onClick={p.onToggleKeepOnly}
            className="mx-auto mt-3 flex h-[34px] items-center whitespace-nowrap px-3 text-[13.5px] font-extrabold text-v2-deep transition-transform duration-150 ease-v2 active:scale-[0.97]"
          >
            {p.keepOnly ? t('signup.addTrack.keepOnly.back') : t('signup.addTrack.keepOnly.offer')}
          </button>
        )
      }
      error={p.error}
      confirmLabel={t('signup.addTrack.confirm')}
      confirmDisabled={newCount === 0}
      onConfirm={() => p.onConfirm(days)}
    />
  );
}
