'use client';

/**
 * "יש לך היום: 6 × 400 מ׳ · מתאים ב-2 סיבובים · 42 דק׳" — the small card
 * in the route drawer (board M-6j) with "לאימון הזה כאן", which switches the
 * same drawer to today's workout on this route. Rendered only when it fits.
 */

import type { RunPreviewModel } from '../../utils/run-preview/run-preview-model';
import RunKindTile from '../preview-v2/RunKindIcon';

export interface TodayWorkoutFitCardProps {
  model: Pick<RunPreviewModel, 'kind' | 'title' | 'minutes'>;
  /** "מתאים ב-2 סיבובים" / "מתאים". */
  fitLabel: string;
  onOpen: () => void;
}

export default function TodayWorkoutFitCard({ model, fitLabel, onOpen }: TodayWorkoutFitCardProps) {
  const sub = model.minutes ? `${fitLabel} · ${model.minutes} דק׳` : fitLabel;
  return (
    <div className="mt-3 flex items-center gap-2.5 rounded-[18px] bg-white px-3 py-2.5 shadow-v2-card" dir="rtl">
      <RunKindTile kind={model.kind} size={36} />
      <div className="min-w-0 flex-1">
        <div className="truncate whitespace-nowrap text-[13.5px] font-black text-v2-ink">{`יש לך היום: ${model.title}`}</div>
        <div className="truncate whitespace-nowrap text-[12px] font-bold text-v2-muted">{sub}</div>
      </div>
      <button type="button" onClick={onOpen}
        className="h-[34px] shrink-0 whitespace-nowrap rounded-full bg-v2-tint px-3 text-[12.5px] font-extrabold text-v2-deep ring-1 ring-inset ring-v2-accent/40 transition-transform duration-150 ease-v2 active:scale-[0.97]">
        לאימון הזה כאן
      </button>
    </div>
  );
}
