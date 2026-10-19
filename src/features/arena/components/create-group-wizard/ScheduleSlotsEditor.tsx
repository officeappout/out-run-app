'use client';

import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { ScheduleSlot } from '@/types/community.types';
import { DAYS, DAYS_FULL } from './wizard-constants';
import { FieldLabel } from './FieldLabel';
import { WizardV2, V2C } from './wizard-v2';

/** StepWhenWhere's schedule section: weekday + time → weekly slots. */
export function ScheduleSlotsEditor({
  scheduleSlots,
  slotDay,
  slotTime,
  setSlotDay,
  setSlotTime,
  addSlot,
  removeSlot,
}: {
  scheduleSlots: ScheduleSlot[];
  slotDay: number;
  slotTime: string;
  setSlotDay: (d: number) => void;
  setSlotTime: (t: string) => void;
  addSlot: () => void;
  removeSlot: (i: number) => void;
}) {
  const v2 = React.useContext(WizardV2);
  return (
    <div className={`border-t pt-5 space-y-4 ${v2 ? 'border-v2-hairline' : 'border-gray-100'}`}>
      <div>
        <FieldLabel>יום בשבוע</FieldLabel>
        <div className="grid grid-cols-7 gap-1">
          {DAYS.map((d, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setSlotDay(i)}
              aria-pressed={v2 ? slotDay === i : undefined}
              className={
                v2
                  ? `h-10 whitespace-nowrap rounded-full text-[13px] font-extrabold ${V2C.press} ${slotDay === i ? V2C.chipOn : V2C.chipOff}`
                  : `py-2.5 rounded-xl text-xs font-bold transition-all ${
                slotDay === i
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      <div>
        <FieldLabel>שעה</FieldLabel>
        <div className="flex gap-2">
          <input
            type="time"
            value={slotTime}
            onChange={(e) => setSlotTime(e.target.value)}
            className={v2 ? `${V2C.input} flex-1 tabular-nums` : 'flex-1 px-4 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400'}
          />
          <button
            type="button"
            onClick={addSlot}
            disabled={!slotTime.match(/^\d{1,2}:\d{2}$/)}
            className={
              v2
                ? `flex h-12 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-4 text-[14.5px] font-extrabold text-v2-deep shadow-v2-ring disabled:opacity-40 ${V2C.press}`
                : 'px-4 py-3 rounded-xl bg-cyan-500 text-white text-sm font-black flex items-center gap-1.5 disabled:opacity-40 active:scale-95 transition-all'
            }
          >
            <Plus className="w-4 h-4" />
            הוסף
          </button>
        </div>
      </div>

      {scheduleSlots.length > 0 && (
        <div className="space-y-2">
          <FieldLabel>מועדים שנבחרו</FieldLabel>
          {scheduleSlots.map((slot, i) => (
            <div
              key={i}
              className={v2 ? 'flex h-12 items-center justify-between rounded-[16px] bg-white pe-1.5 ps-4 shadow-v2-ring' : 'flex items-center justify-between px-4 py-3 bg-gray-50 rounded-xl border border-gray-100'}
            >
              <span className={v2 ? 'truncate whitespace-nowrap text-[14.5px] font-extrabold tabular-nums text-v2-ink' : 'text-sm font-bold text-gray-800'}>
                יום {DAYS_FULL[slot.dayOfWeek]} · {slot.time}
              </span>
              <button
                type="button"
                onClick={() => removeSlot(i)}
                aria-label="הסרת המועד"
                className={v2 ? `grid h-9 w-9 shrink-0 place-items-center rounded-full text-v2-down ${V2C.press}` : 'p-1.5 rounded-lg text-red-400 hover:text-red-500 hover:bg-red-50 transition-colors'}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {scheduleSlots.length === 0 && (
        <p className={v2 ? `${V2C.hint} py-1 text-center` : 'text-xs text-gray-400 text-center py-1'}>
          ניתן להמשיך ללא לוח זמנים ולעדכן מאוחר יותר
        </p>
      )}
    </div>
  );
}
