'use client';

/**
 * A planned session's sheet in the planner v2 (enable_week_builder_v1): its title and detail,
 * "שעה מתוכננת" on the shared WheelPicker (hour + quarter hour) saved to the session's
 * schedule entries' EXISTING `startTime` field (savePlannedTime), "להזיז ליום אחר" (opens
 * "סידור השבוע" for its week) and "לאימון" (the workout's own preview, as the agenda does).
 * A run of the running plan has no entry to hold a time — its time row reads as such.
 * z: over the day drawer (z-[200]) — the z-[300]/z-[301] row, portalled.
 */
import { useEffect, useState } from 'react';
import Sheet from '@/components/ui/v2/Sheet';
import Button from '@/components/ui/v2/Button';
import WheelPicker from '@/components/ui/v2/WheelPicker';
import { SHEET_Z } from '@/components/ui/v2/tokens';
import { useUserStore } from '@/features/user';
import { PLANNED_HOURS, PLANNED_MINUTES, initialWheelTime } from '@/features/schedule/week-builder/planner/plannedTime';
import { savePlannedTime } from '@/features/schedule/week-builder/planner/plannedTime.service';
import type { PlannerWbData } from '@/features/schedule/week-builder/planner/plannerWeek';
import type { WbSession } from '@/features/schedule/week-builder/types';
import { useT } from '@/hooks/useT';
import { home } from '@/messages/ns/home';
import { useShownPlannedTime } from '../hooks/useShownPlannedTime';

export interface PlannedSessionSheetProps {
  /** null = closed. */
  session: WbSession<PlannerWbData> | null;
  iso: string;
  isPast: boolean;
  userId: string;
  onClose: () => void;
  onSaved: () => void;
  onMove: () => void;
  onOpenWorkout?: () => void;
}

const pad = (n: number) => String(n).padStart(2, '0');

type ProfileLike = {
  lifestyle?: { recurringTemplate?: Record<string, string[]>; reminders?: { strengthTime?: string; runningTime?: string } };
};

export default function PlannedSessionSheet({ session, iso, isPast, userId, onClose, onSaved, onMove, onOpenWorkout }: PlannedSessionSheetProps) {
  const t = useT(home);
  const shownTime = useShownPlannedTime();
  const lifestyle = useUserStore((s) => (s.profile as ProfileLike | null)?.lifestyle);
  const [h, setH] = useState(7);
  const [m, setM] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  const data = session?.data;
  const editable = !!data && !isPast && (data.entryIds.length > 0 || data.programIds.length > 0);

  useEffect(() => {
    if (!session) return;
    const fallback = session.track === 'run' ? lifestyle?.reminders?.runningTime : lifestyle?.reminders?.strengthTime;
    const init = initialWheelTime(session.data?.startTime, fallback);
    setH(init.h);
    setM(init.m);
    setError(false);
    // Re-seed per opened session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id]);

  const save = async () => {
    if (!data) return;
    setSaving(true);
    setError(false);
    const ok = await savePlannedTime(userId, { date: iso, entryIds: data.entryIds, programIds: data.programIds }, { h, m }, lifestyle?.recurringTemplate ?? {});
    setSaving(false);
    if (!ok) {
      setError(true);
      return;
    }
    onSaved();
    onClose();
  };

  return (
    <Sheet open={!!session} onClose={onClose} title={session?.titleHe ?? ''} zIndex={SHEET_Z.agendaDeletePanel} backdropZIndex={SHEET_Z.agendaDelete} closeLabel={t('plannerV2.close')}>
      {session && (
        <div dir="rtl" className="flex flex-col gap-4 px-5 pb-2">
          {session.detailHe && <p className="-mt-2 text-[14px] font-bold text-v2-muted">{session.detailHe}</p>}

          <div>
            <p className="mb-2 text-[15px] font-extrabold text-v2-ink">{t('plannerV2.time.label')}</p>
            {editable ? (
              <div className="rounded-[18px] bg-v2-surface p-2">
                <WheelPicker
                  columns={[
                    { key: 'h', ariaLabel: t('plannerV2.time.hour'), options: PLANNED_HOURS.map((v) => ({ value: v, label: pad(v) })), value: h, onChange: setH },
                    { key: 'm', ariaLabel: t('plannerV2.time.minute'), options: PLANNED_MINUTES.map((v) => ({ value: v, label: pad(v) })), value: m, onChange: setM },
                  ]}
                />
              </div>
            ) : (
              <p className="rounded-[14px] bg-v2-surface px-3.5 py-3 text-[13.5px] font-bold text-v2-muted">
                {shownTime(session.data?.startTime) ?? (isPast ? t('plannerV2.time.past') : t('plannerV2.time.notForRun'))}
              </p>
            )}
            {error && <p className="mt-2 text-center text-[13px] font-bold text-red-600">{t('plannerV2.saveError')}</p>}
          </div>

          <div className="flex flex-col gap-2">
            {editable && (
              <Button variant="cta" block disabled={saving} onClick={() => void save()}>
                {t('plannerV2.time.save')}
              </Button>
            )}
            {!session.locked && (
              <Button variant="primary" block onClick={onMove}>
                {t('plannerV2.time.move')}
              </Button>
            )}
            {onOpenWorkout && !isPast && (
              <Button variant="ghost" block onClick={onOpenWorkout}>
                {t('plannerV2.time.open')}
              </Button>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}
