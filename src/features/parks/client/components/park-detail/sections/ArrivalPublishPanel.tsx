'use client';

import { Calendar, Users } from 'lucide-react';
import DualRangeSlider from '@/features/partners/components/DualRangeSlider';
import type { DayFilter } from '@/features/parks/core/hooks/useCommunityEnrichment';
import { minutesToLabel, RANGE_MIN, RANGE_MAX, RANGE_STEP_MIN } from '../utils/park-detail-format';

interface ArrivalPublishPanelProps {
  v2: boolean;
  hasSessions: boolean;
  dayFilter: DayFilter;
  showTimePicker: boolean;
  onToggleTimePicker: () => void;
  pickedDate: string;
  onPickDate: (value: string) => void;
  timeRangeMinutes: [number, number];
  onTimeRangeChange: (range: [number, number]) => void;
  publishing: boolean;
  onPublish: () => void;
}

/**
 * Always-visible publish row ("אני מגיע…") — outside the empty-state branch
 * so the user can announce an arrival whether or not others already did.
 * Time-window picker:
 *   • today/tomorrow → dual-range slider only (date implied by the chip)
 *   • week           → date input + dual-range slider
 */
export default function ArrivalPublishPanel({
  v2,
  hasSessions,
  dayFilter,
  showTimePicker,
  onToggleTimePicker,
  pickedDate,
  onPickDate,
  timeRangeMinutes,
  onTimeRangeChange,
  publishing,
  onPublish,
}: ArrivalPublishPanelProps) {
  return (
    <div className={v2 ? 'mb-2 overflow-hidden rounded-[20px] bg-v2-surface ring-1 ring-inset ring-v2-hairline' : 'bg-emerald-50/50 border border-emerald-100 rounded-xl overflow-hidden mb-2'}>
      <div className={v2 ? 'flex items-center gap-3 px-3.5 py-3' : 'flex items-center gap-3 py-2.5 px-3'}>
        <Users size={16} className={v2 ? 'flex-shrink-0 text-v2-deep' : 'text-emerald-500 flex-shrink-0'} />
        <span className={v2 ? 'flex-1 text-[14px] font-bold text-v2-ink-2' : 'text-xs text-emerald-700 font-bold flex-1'}>
          {!hasSessions
            ? 'אף אחד עוד לא פרסם שהוא מגיע...'
            : 'גם אתה מתכנן להגיע?'}
        </span>
        <button
          onClick={onToggleTimePicker}
          className={
            v2
              ? 'h-9 flex-shrink-0 whitespace-nowrap rounded-full bg-v2-cta px-4 text-[13px] font-extrabold text-v2-on-cta shadow-v2-cta transition-transform duration-150 ease-v2 active:scale-[0.97]'
              : 'flex-shrink-0 px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-[11px] font-bold active:scale-[0.97] transition-transform'
          }
        >
          {v2 ? 'אני מגיע…' : 'אני מגיע ב...'}
        </button>
      </div>
      {showTimePicker && (
        <div className="px-3 pb-3 pt-2 border-t border-emerald-100 space-y-3">
          {/* Date input — only in השבוע mode; today/tomorrow fix the date. */}
          {dayFilter === 'week' && (
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-emerald-500 flex-shrink-0" />
              <input
                type="date"
                value={pickedDate}
                onChange={(e) => onPickDate(e.target.value)}
                className="flex-1 bg-white border border-emerald-200 rounded-lg px-2 py-1.5 text-sm text-gray-800 font-bold text-center"
                dir="ltr"
              />
            </div>
          )}

          {/* Dual-handle time-range slider over minutes-of-day (0..1440,
              step 15). The window summary stays LTR ("17:00 - 19:00") so the
              dash reads correctly under the page-level RTL direction. */}
          <div className="px-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold text-emerald-700">
                חלון הגעה
              </span>
              <span
                className="text-[12px] font-black text-emerald-600"
                dir="ltr"
              >
                {minutesToLabel(timeRangeMinutes[0])} - {minutesToLabel(timeRangeMinutes[1])}
              </span>
            </div>
            <DualRangeSlider
              min={RANGE_MIN}
              max={RANGE_MAX}
              step={RANGE_STEP_MIN}
              values={timeRangeMinutes}
              onChange={onTimeRangeChange}
              formatLabel={minutesToLabel}
              ariaLabelMin="שעת התחלה"
              ariaLabelMax="שעת סיום"
            />
          </div>

          <div className="flex justify-end">
            <button
              onClick={onPublish}
              disabled={publishing}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white rounded-lg text-[11px] font-bold transition-colors"
            >
              {publishing ? '...' : 'פרסם'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
