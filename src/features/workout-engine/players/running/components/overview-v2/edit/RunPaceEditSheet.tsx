'use client';

/**
 * "התאם קצב" (board M-7a, enable_home_v2) — the shared v2 Sheet over the run
 * overview: ±5″ on the target band, the runner's personal range as context
 * (a zone bar, fast on the right), a warning outside it, "שמור לאימון הזה"
 * (this workout only) or "איפוס לקצב שלך". Logic: run-pace-override.ts.
 */

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button, Sheet, SheetHeader, SHEET_Z } from '@/components/ui/v2';
import { fmtBand, fmtClock } from '../../../lib/planned-rep-results';
import {
  PACE_STEP_SEC, paceVerdict, paceZoneBar, personalRange, sameBand, shiftBand,
  type PaceBand, type PaceEditTarget,
} from '../../../utils/run-overview/run-pace-override';

export interface RunPaceEditSheetProps {
  target: PaceEditTarget | null;
  /** The target's colour (the reps' red, the warm-up's green) for the range on the bar. */
  color?: string;
  /** null = back to the plan's pace. */
  onSave: (key: string, band: PaceBand | null) => void;
  onClose: () => void;
}

const WARN: Record<'fast' | 'slow', string> = {
  fast: 'מהיר מדי לרמה שלך — עלול לפגוע בתוכנית. אפשר לשמור, אבל עדיף להישאר בטווח.',
  slow: 'איטי מהטווח שלך — האימון יהיה קל מהמתוכנן. אפשר לשמור, אבל עדיף להישאר בטווח.',
};

const STEP_BTN = 'h-12 w-16 whitespace-nowrap rounded-2xl bg-white text-[15px] font-black text-v2-deep shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]';

export default function RunPaceEditSheet({ target, color = '#e5484d', onSave, onClose }: RunPaceEditSheetProps) {
  const [draft, setDraft] = useState<PaceBand | null>(target?.current ?? null);
  const key = target?.key ?? null;
  useEffect(() => {
    setDraft(target?.current ?? null);
    // A new target (or reopening) starts from what the workout runs now.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, target?.current.min, target?.current.max]);

  const open = !!target && !!draft;
  const range = target ? personalRange(target.planned) : null;
  const verdict = draft && range ? paceVerdict(draft, range) : null;
  const bar = draft && range ? paceZoneBar(range, draft) : null;
  const repSec = draft && target?.repMeters ? Math.round((target.repMeters / 1000) * ((draft.min + draft.max) / 2)) : null;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      zIndex={SHEET_Z.freeRunGoalPanel}
      backdropZIndex={SHEET_Z.freeRunGoal}
      ariaLabel="התאם קצב"
      closeOnEscape
      header={target ? (
        <SheetHeader
          onClose={onClose}
          className="flex items-start justify-between gap-2.5 px-5 pb-1"
          title={(
            <>
              התאם קצב
              <span className="block whitespace-nowrap text-[13px] font-bold !tracking-normal text-v2-muted">{`${target.subtitle} · לאימון הזה בלבד`}</span>
            </>
          )}
        />
      ) : undefined}
      bodyClassName="px-5"
      footer={target && draft ? (
        <div className="flex flex-col gap-2 px-5 pt-3.5">
          <Button variant="cta" block onClick={() => onSave(target.key, sameBand(draft, target.planned) ? null : draft)}>
            שמור לאימון הזה
          </Button>
          <button type="button" onClick={() => onSave(target.key, null)}
            className="h-10 whitespace-nowrap text-[14px] font-extrabold text-v2-muted transition-transform duration-150 ease-v2 active:scale-[0.97]">
            {`איפוס לקצב שלך (${fmtBand(target.planned.min, target.planned.max)})`}
          </button>
        </div>
      ) : undefined}
    >
      {target && draft && range && bar && (
        <div dir="rtl">
          <div className="mt-[18px] flex items-center justify-between gap-2.5">
            <button type="button" dir="ltr" aria-label="מהר יותר ב-5 שניות" className={STEP_BTN}
              onClick={() => setDraft((d) => (d ? shiftBand(d, -PACE_STEP_SEC) : d))}>−5″</button>
            <div className="text-center">
              <div dir="ltr" className="whitespace-nowrap text-[30px] font-black !tracking-[-0.02em] text-v2-ink">{fmtBand(draft.min, draft.max)}</div>
              <div className="whitespace-nowrap text-[12px] font-extrabold text-v2-muted">
                {repSec ? `דק׳ לק״מ · ~${fmtClock(repSec)} לחזרה` : 'דק׳ לק״מ'}
              </div>
            </div>
            <button type="button" dir="ltr" aria-label="לאט יותר ב-5 שניות" className={STEP_BTN}
              onClick={() => setDraft((d) => (d ? shiftBand(d, PACE_STEP_SEC) : d))}>+5″</button>
          </div>

          <div className="mt-4 rounded-[18px] bg-v2-surface p-3 ring-1 ring-inset ring-v2-hairline">
            <div className="flex justify-between gap-2 whitespace-nowrap text-[12.5px] font-extrabold text-v2-ink-2">
              <span>הטווח שלך: <bdi dir="ltr">{fmtBand(range.min, range.max)}</bdi></span>
              <span className="text-v2-muted">מהפרופיל שלך</span>
            </div>
            <div className="relative mt-2.5 h-[22px]" aria-hidden>
              <div className="absolute inset-x-0 top-2 h-1.5 rounded-full bg-v2-hairline" />
              <div className="absolute top-2 h-1.5 rounded-full" style={{ right: `${bar.range.right}%`, width: `${bar.range.width}%`, background: `${color}55` }} />
              <div className="absolute top-[3px] h-4 rounded-md shadow-[0_0_0_2px_#fff]"
                style={{ right: `${bar.band.right}%`, width: `${bar.band.width}%`, background: verdict ? '#f59e0b' : '#00baf7' }} />
            </div>
            <div className="flex justify-between text-[11px] font-extrabold text-v2-muted">
              <span>מהיר</span>
              <span>איטי</span>
            </div>
          </div>

          {verdict && (
            <div role="status" className="mt-2.5 flex items-start gap-2 rounded-2xl bg-[#FFFBEB] px-3 py-2.5 ring-1 ring-inset ring-[#FDE68A]">
              <AlertTriangle size={16} strokeWidth={2.3} className="mt-px shrink-0 text-[#B45309]" aria-hidden />
              <span className="text-[12.5px] font-bold leading-normal text-[#B45309]">{WARN[verdict]}</span>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
