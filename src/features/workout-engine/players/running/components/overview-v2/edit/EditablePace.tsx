'use client';

/**
 * A pace on the run overview's axis that opens "התאם קצב" (board M-7a,
 * enable_home_v2): dotted underline + a small pencil; an edited pace gets
 * the "מותאם" tag.
 *   row  — a group row's pace (brand blue, 12.5px black)
 *   pill — an aerobic leg's pace pill (dashed, the leg's green)
 */

import { Pencil } from 'lucide-react';
import type { AxisPaceSlot } from '@/features/parks/core/components/overview/axis/axis-decor';
import { useT } from '@/hooks/useT';
import { player } from '@/messages/ns/player';

export function EditedTag() {
  const t = useT(player);
  return (
    <span className="shrink-0 whitespace-nowrap rounded-full bg-v2-tint px-2 py-0.5 text-[11px] font-extrabold text-v2-deep ring-1 ring-inset ring-v2-accent/35">
      {t('run.overview.edit.editedTag')}
    </span>
  );
}

export default function EditablePace({ slot, onEdit }: { slot: AxisPaceSlot; onEdit: (key: string) => void }) {
  const t = useT(player);
  const open = () => onEdit(slot.paceKey);
  if (slot.tone === 'pill') {
    return (
      <span className="inline-flex items-center gap-1.5">
        <button type="button" onClick={open} aria-label={t('run.overview.edit.paceAria', { pace: slot.text })} dir="ltr"
          className="inline-flex items-center gap-[3px] whitespace-nowrap rounded-full border border-dashed border-[#3f621266] bg-v2-surface px-2 py-0.5 text-[11px] font-extrabold text-[#3f6212] transition-transform duration-150 ease-v2 active:scale-[0.97]">
          <Pencil size={10} strokeWidth={2.4} aria-hidden />
          {t('run.overview.edit.pacePerKm', { pace: slot.text })}
        </button>
        {slot.edited && <EditedTag />}
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-[5px]">
      {slot.edited && <EditedTag />}
      <button type="button" onClick={open} aria-label={t('run.overview.edit.paceAria', { pace: slot.text })} dir="ltr"
        className="inline-flex items-center gap-[3px] whitespace-nowrap border-b-[1.5px] border-dotted border-v2-deep pb-px text-[12.5px] font-black text-v2-deep transition-transform duration-150 ease-v2 active:scale-[0.97]">
        <Pencil size={11} strokeWidth={2.4} aria-hidden />
        <bdi dir="ltr">{slot.text}</bdi>
      </button>
    </span>
  );
}
