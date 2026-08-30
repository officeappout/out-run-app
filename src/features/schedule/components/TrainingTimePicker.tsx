'use client';

/**
 * TrainingTimePicker — extracted from ScheduleStep.tsx (30.08.2026).
 *
 * Unlike the other 3 extracted components, this one was NOT purely
 * presentational in its original inline form — both the `setTime` state
 * mutation and the coin-claim logic (hasClaimedReward/claimReward/
 * triggerCoinFly) were inlined directly in the hours/minutes onClick
 * handlers. That logic was pulled out into ScheduleStep.tsx's own
 * `handleTimeChange`. No isHebrew prop — the original 1240-1315 range has
 * no Hebrew/English branching inside it (the "what time do you train"
 * header text sits just outside the extracted range, in ScheduleStep.tsx).
 *
 * `onTimeChange` takes a partial `{hours?, minutes?}` patch, not a rebuilt
 * `HH:MM` string — the original used `setTime((prevTime) => ...)`, a
 * functional updater that reads the LATEST state at commit time. Rebuilding
 * the full string from this component's own `hours`/`minutes` props (a
 * snapshot from the previous render) would silently regress that: two
 * clicks in the same render cycle (hour, then minute) would have the
 * second handler overwrite the first with a stale value. Passing a partial
 * patch lets the caller apply its own functional updater and reproduces the
 * original semantics exactly — see ScheduleStep.tsx's `handleTimeChange`.
 */

export interface TrainingTimePickerProps {
  hours: number;
  minutes: number;
  onTimeChange: (patch: { hours?: number; minutes?: number }) => void;
}

export default function TrainingTimePicker({
  hours,
  minutes,
  onTimeChange,
}: TrainingTimePickerProps) {
  return (
    <div className="relative py-3 flex justify-center items-center select-none">
      <div className="flex items-center gap-4" style={{ direction: 'ltr' }}>
        {/* Hours Column (LEFT - first in LTR) */}
        <div className="flex flex-col gap-1">
          {[hours - 1, hours, hours + 1].map((h, idx) => {
            const displayHour = h < 0 ? 23 : h > 23 ? 0 : h;
            const isSelected = displayHour === hours;
            return (
              <button
                key={`hour-${displayHour}-${idx}`}
                onClick={() => onTimeChange({ hours: displayHour })}
                className={`w-14 h-9 rounded-xl flex items-center justify-center transition-all duration-200 ${
                  isSelected
                    ? 'bg-[#5BC2F2] text-white text-lg shadow-[0_4px_12px_rgba(91,194,242,0.2)]'
                    : 'bg-white text-slate-400 text-sm border border-slate-200 hover:border-slate-300'
                }`}
                style={{ fontFamily: 'var(--font-simpler)', fontWeight: isSelected ? 700 : 500 }}
              >
                {String(displayHour).padStart(2, '0')}
              </button>
            );
          })}
        </div>

        {/* Separator */}
        <span className="text-2xl font-bold text-slate-900">:</span>

        {/* Minutes Column (RIGHT - second in LTR) */}
        <div className="flex flex-col gap-1">
          {[
            Math.round(minutes / 5) * 5 - 5,
            Math.round(minutes / 5) * 5,
            Math.round(minutes / 5) * 5 + 5,
          ].map((m, idx) => {
            let displayMinute = m;
            if (m < 0) displayMinute = 55;
            else if (m > 55) displayMinute = 0;
            const roundedMinutes = Math.round(minutes / 5) * 5;
            const isSelected = displayMinute === roundedMinutes;
            return (
              <button
                key={`min-${displayMinute}-${idx}`}
                onClick={() => onTimeChange({ minutes: displayMinute })}
                className={`w-14 h-9 rounded-xl flex items-center justify-center transition-all duration-200 ${
                  isSelected
                    ? 'bg-[#5BC2F2] text-white text-lg shadow-[0_4px_12px_rgba(91,194,242,0.2)]'
                    : 'bg-white text-slate-400 text-sm border border-slate-200 hover:border-slate-300'
                }`}
                style={{ fontFamily: 'var(--font-simpler)', fontWeight: isSelected ? 700 : 500 }}
              >
                {String(displayMinute).padStart(2, '0')}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
