'use client';

/**
 * "חוזרים לרוץ" (enable_week_builder_v1, owner 22.10) — after a long break the running plan never
 * changes silently: this drawer shows our recommendation with a one-line why, asks for an
 * optional race / goal date (the race rules, run-race.ts, then say what fits), and offers:
 *   כמו שהמלצנו (default) · להמשיך מאיפה שעצרתי (only within safe limits, else explained) ·
 *   לבנות לי מחדש לפי המירוץ (with a date).
 * Calm copy only — no day counts, no "פספסת" / "נכשלת".
 */
import { useMemo, useState } from 'react';
import Sheet from '@/components/ui/v2/Sheet';
import Button from '@/components/ui/v2/Button';
import { CONFIRM_ACTION_CLASS } from '@/components/ui/v2/ConfirmSheet';
import { SHEET_Z } from '@/components/ui/v2/tokens';
import {
  adaptToRace,
  canResumeWhereStopped,
  catchUpLineHe,
  catchUpWhyHe,
  localDayKey,
} from '@/lib/calm-return';
import type { RunReturnAsk, RunReturnChoice } from '../../hooks/useRunCatchUp';

export interface RunReturnDrawerProps {
  ask: RunReturnAsk | null;
  onChoose: (choice: RunReturnChoice, raceDate: string | null) => Promise<boolean>;
  onClose: () => void;
}

export default function RunReturnDrawer({ ask, onChoose, onClose }: RunReturnDrawerProps) {
  const [raceDate, setRaceDate] = useState<string>(ask?.raceDate ?? '');
  const [busy, setBusy] = useState(false);
  const todayKey = localDayKey(new Date());

  const race = useMemo(() => {
    if (!ask || !raceDate || raceDate <= todayKey) return null;
    return adaptToRace({
      todayKey,
      raceDate,
      weeksNeeded: ask.planWeeks - ask.decision.targetWeek + 1,
      level: ask.level,
    });
  }, [ask, raceDate, todayKey]);

  if (!ask) return null;
  const d = ask.decision;
  const resumeOk = canResumeWhereStopped(d, ask.daysAway);
  const pick = async (choice: RunReturnChoice) => {
    setBusy(true);
    await onChoose(choice, race ? raceDate : null);
    setBusy(false);
  };

  return (
    <Sheet open onClose={onClose} title="חוזרים לרוץ" zIndex={SHEET_Z.drawerPanel} backdropZIndex={SHEET_Z.drawer} frameClassName="mx-auto max-w-md">
      <div dir="rtl" className="flex flex-col gap-4 px-5 pb-2 font-simpler text-v2-ink">
        <div className="rounded-[18px] bg-v2-tint px-4 py-3">
          <p className="text-[15px] font-extrabold">{catchUpLineHe(d)}</p>
          <p className="mt-1 text-[13px] font-bold text-v2-muted">{catchUpWhyHe(d, ask.beginner)}</p>
          {d.offerLevelCheck && <p className="mt-1 text-[13px] font-bold text-v2-deep">אפשר גם לבדוק רמה בדרך</p>}
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-[14px] font-extrabold">יש לך מירוץ / יעד בתאריך?</span>
          <input
            type="date"
            min={todayKey}
            value={raceDate}
            onChange={(e) => setRaceDate(e.target.value)}
            className="h-11 rounded-[14px] bg-white px-3 text-[15px] font-bold shadow-v2-ring"
          />
          {race && <span className="text-[13px] font-bold text-v2-muted">{race.noteHe}</span>}
          {race?.offerShorterGoal && <span className="text-[13px] font-bold text-v2-deep">אפשר גם לבחור יעד קצר יותר</span>}
        </label>

        <div className="flex flex-col gap-2.5">
          <Button variant="cta" block disabled={busy} onClick={() => void pick('recommended')}>
            כמו שהמלצנו
          </Button>
          <button type="button" disabled={busy || !resumeOk} onClick={() => void pick('resume')} className={CONFIRM_ACTION_CLASS.secondary}>
            להמשיך מאיפה שעצרתי
          </button>
          {!resumeOk && (
            <p className="-mt-1 text-center text-[12.5px] font-bold text-v2-muted">אחרי הפסקה ארוכה זה מעמיס מדי — עדיף לחזור בהדרגה</p>
          )}
          {race && (
            <button type="button" disabled={busy} onClick={() => void pick('race')} className={CONFIRM_ACTION_CLASS.secondary}>
              לבנות לי מחדש לפי המירוץ
            </button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
