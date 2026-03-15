'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SlidersHorizontal, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { WEEKS_LOOKUP } from '../../data/running-improvement-branch.draft';
import { DEFAULT_PLAN_WEEKS, type GeneratorTargetDistance } from '@/features/workout-engine/core/services/plan-generator.service';
import StickyActionButton from '@/components/ui/StickyActionButton';

interface PlanLengthStepProps {
  onNext: () => void;
}

type SelectionMode = 'preset' | 'slider' | 'calendar';

const PRESET_WEEKS = [12, 10, 8] as const;

const PRESET_LABELS: Record<number, string> = {
  12: 'מומלץ לתהליך ארוך ומדורג',
  10: 'מומלץ לאימון מאוזן',
  8: 'מומלץ למסלול מהיר',
};

const HE_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

const HE_WEEKDAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

function computeRecommendedWeeks(): number {
  if (typeof window === 'undefined') return 8;
  try {
    const stored = sessionStorage.getItem('onboarding_running_answers');
    if (!stored) return 8;
    const answers = JSON.parse(stored);
    const goalPath = answers.goalPath ?? 'start_running';
    const targetDistance = answers.targetDistance ?? '5k';
    const abilityTier = answers.abilityTier ?? (goalPath === 'improve_time' ? 'runner' : 'none');
    const weeklyFrequency = answers.weeklyFrequency ?? 3;
    const key = `${goalPath}|${targetDistance}|${abilityTier}|${weeklyFrequency}`;
    const fromTable = WEEKS_LOOKUP[key];
    if (fromTable) return fromTable;
    return DEFAULT_PLAN_WEEKS[targetDistance as GeneratorTargetDistance] ?? 8;
  } catch {
    return 8;
  }
}

function formatEndDate(weeks: number): string {
  const end = new Date();
  end.setDate(end.getDate() + weeks * 7);
  return end.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });
}

function weeksFromDate(target: Date): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diffMs = target.getTime() - now.getTime();
  return Math.max(1, Math.round(diffMs / (7 * 24 * 60 * 60 * 1000)));
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function firstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

// ─── Calendar Component ────────────────────────────────────────────

function MiniCalendar({
  selected,
  onChange,
  minDate,
}: {
  selected: Date | null;
  onChange: (d: Date) => void;
  minDate: Date;
}) {
  const [viewYear, setViewYear] = useState(
    selected?.getFullYear() ?? minDate.getFullYear(),
  );
  const [viewMonth, setViewMonth] = useState(
    selected?.getMonth() ?? minDate.getMonth(),
  );

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  };

  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  };

  const totalDays = daysInMonth(viewYear, viewMonth);
  const startDay = firstDayOfMonth(viewYear, viewMonth);
  const blanks = Array.from({ length: startDay }, (_, i) => i);
  const days = Array.from({ length: totalDays }, (_, i) => i + 1);

  const isSameDay = (d: number) =>
    selected &&
    selected.getDate() === d &&
    selected.getMonth() === viewMonth &&
    selected.getFullYear() === viewYear;

  const isPast = (d: number) => {
    const date = new Date(viewYear, viewMonth, d);
    date.setHours(0, 0, 0, 0);
    const min = new Date(minDate);
    min.setHours(0, 0, 0, 0);
    return date < min;
  };

  const formatHeader = () => `${HE_MONTHS[viewMonth]} ${viewYear}`;

  return (
    <div className="flex flex-col rounded-xl p-4" style={{ background: '#1a2b29' }}>
      {/* Month nav */}
      <div className="flex items-center justify-between mb-4 px-1" dir="ltr">
        <button onClick={prevMonth} className="p-1">
          <ChevronLeft size={20} style={{ color: '#00BAF7' }} />
        </button>
        <span className="text-lg font-bold text-slate-100">{formatHeader()}</span>
        <button onClick={nextMonth} className="p-1">
          <ChevronRight size={20} style={{ color: '#00BAF7' }} />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 text-center mb-2">
        {HE_WEEKDAYS.map((d) => (
          <span key={d} className="text-[10px] font-bold text-slate-500">{d}</span>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 text-center gap-y-2">
        {blanks.map((_, i) => (
          <span key={`b-${i}`} />
        ))}
        {days.map((d) => {
          const sel = isSameDay(d);
          const past = isPast(d);
          return (
            <button
              key={d}
              disabled={past}
              onClick={() => onChange(new Date(viewYear, viewMonth, d))}
              className="relative flex items-center justify-center h-9"
            >
              {sel && (
                <div
                  className="absolute w-9 h-9 rounded-full"
                  style={{ background: 'rgba(0,186,247,0.2)', boxShadow: '0 0 0 1px rgba(0,186,247,0.4)' }}
                />
              )}
              <span
                className={`relative z-10 text-sm ${
                  past
                    ? 'text-slate-600'
                    : sel
                    ? 'font-bold'
                    : 'text-slate-100'
                }`}
                style={sel ? { color: '#00BAF7' } : undefined}
              >
                {d}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────

export default function PlanLengthStep({ onNext }: PlanLengthStepProps) {
  const recommended = useMemo(() => computeRecommendedWeeks(), []);

  const [mode, setMode] = useState<SelectionMode>('preset');
  const [selectedPreset, setSelectedPreset] = useState<number>(() => {
    if ((PRESET_WEEKS as readonly number[]).includes(recommended)) return recommended;
    return 8;
  });
  const [sliderWeeks, setSliderWeeks] = useState<number>(recommended);
  const [calendarDate, setCalendarDate] = useState<Date | null>(null);

  const minCalendarDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 28); // minimum 4 weeks
    return d;
  }, []);

  const activeWeeks = useMemo(() => {
    if (mode === 'preset') return selectedPreset;
    if (mode === 'slider') return sliderWeeks;
    if (mode === 'calendar' && calendarDate) return weeksFromDate(calendarDate);
    return selectedPreset;
  }, [mode, selectedPreset, sliderWeeks, calendarDate]);

  const handlePresetSelect = (weeks: number) => {
    setMode('preset');
    setSelectedPreset(weeks);
  };

  const handleContinue = useCallback(() => {
    try {
      const stored = sessionStorage.getItem('onboarding_running_answers');
      const answers = stored ? JSON.parse(stored) : {};
      answers.runningPlanWeeks = activeWeeks;
      sessionStorage.setItem('onboarding_running_answers', JSON.stringify(answers));
    } catch {}
    onNext();
  }, [activeWeeks, onNext]);

  const formatCalendarDisplay = () => {
    if (!calendarDate) return 'בחרו תאריך סיום';
    return calendarDate.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  return (
    <div dir="rtl" className="w-full max-w-md mx-auto px-4 py-4 flex flex-col min-h-screen relative font-simpler">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-2 pt-6 pb-2"
      >
        <h1 className="text-2xl font-black leading-tight text-slate-900 mb-2">
          לכמה שבועות תרצה את התוכנית?
        </h1>
        <p className="text-slate-500 text-sm">
          בחרו את משך התוכנית המועדף עליכם
        </p>
      </motion.div>

      {/* Preset Cards */}
      <div className="flex flex-col gap-3 mb-4">
        {PRESET_WEEKS.map((weeks) => {
          const isSelected = mode === 'preset' && selectedPreset === weeks;
          const isRecommended = weeks === recommended;

          return (
            <motion.button
              key={weeks}
              whileTap={{ scale: 0.98 }}
              onClick={() => handlePresetSelect(weeks)}
              className={`
                relative flex flex-col gap-1 p-4 rounded-xl text-right transition-all duration-200
                ${isSelected
                  ? 'border-2 shadow-md'
                  : 'border border-slate-200 bg-white'
                }
              `}
              style={isSelected ? { borderColor: '#00BAF7', background: 'rgba(0,186,247,0.05)' } : undefined}
            >
              {isRecommended && (
                <span
                  className="absolute top-3 left-3 text-[10px] font-bold px-2.5 py-1 rounded-full text-white"
                  style={{ background: '#0AC2B6' }}
                >
                  מומלץ
                </span>
              )}

              <p className="text-slate-400 text-xs font-medium">
                {PRESET_LABELS[weeks]}
              </p>
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-lg font-bold text-slate-900">{weeks} שבועות</p>
                  <p className="text-slate-400 text-sm">עד {formatEndDate(weeks)}</p>
                </div>
                <div
                  className="w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all"
                  style={isSelected
                    ? { borderColor: '#00BAF7', background: '#00BAF7' }
                    : { borderColor: '#cbd5e1' }
                  }
                >
                  {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Custom Slider Card */}
      <motion.div
        className={`
          flex flex-col gap-3 p-4 rounded-xl text-right transition-all duration-200 mb-3
          ${mode === 'slider'
            ? 'border-2 shadow-md cursor-default'
            : 'border border-slate-200 bg-white cursor-pointer'
          }
        `}
        style={mode === 'slider' ? { borderColor: '#00BAF7', background: 'rgba(0,186,247,0.05)' } : undefined}
        onClick={mode !== 'slider' ? () => setMode('slider') : undefined}
      >
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={18} className="text-slate-400" />
            <p className="text-lg font-bold text-slate-900">בחירה מותאמת אישית</p>
          </div>
          <div
            className="w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all"
            style={mode === 'slider'
              ? { borderColor: '#00BAF7', background: '#00BAF7' }
              : { borderColor: '#cbd5e1' }
            }
          >
            {mode === 'slider' && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
          </div>
        </div>

        <AnimatePresence>
          {mode === 'slider' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex flex-col items-center gap-2 py-2 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="text-4xl font-black tabular-nums" style={{ color: '#00BAF7' }}>
                {sliderWeeks} שבועות
              </span>
              <p className="text-slate-400 text-sm">עד {formatEndDate(sliderWeeks)}</p>

              <div className="relative w-full h-12 flex items-center mt-2" dir="ltr">
                <input
                  type="range"
                  min={4}
                  max={52}
                  value={sliderWeeks}
                  onChange={(e) => setSliderWeeks(Number(e.target.value))}
                  className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, #00BAF7 ${((sliderWeeks - 4) / 48) * 100}%, #e2e8f0 ${((sliderWeeks - 4) / 48) * 100}%)`,
                    accentColor: '#00BAF7',
                  }}
                />
              </div>
              <div className="flex justify-between w-full px-1 text-xs text-slate-400 font-medium" dir="ltr">
                <span>4</span>
                <span>52</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Custom End Date Card */}
      <motion.div
        className={`
          flex flex-col gap-3 p-4 rounded-xl text-right transition-all duration-200 mb-4
          ${mode === 'calendar'
            ? 'border-2 shadow-md cursor-default'
            : 'border border-slate-200 bg-white cursor-pointer'
          }
        `}
        style={mode === 'calendar' ? { borderColor: '#00BAF7', background: 'rgba(0,186,247,0.05)' } : undefined}
        onClick={mode !== 'calendar' ? () => setMode('calendar') : undefined}
      >
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-slate-400" />
            <p className="text-lg font-bold text-slate-900">בחירת תאריך סיום</p>
          </div>
          <div
            className="w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all"
            style={mode === 'calendar'
              ? { borderColor: '#00BAF7', background: '#00BAF7' }
              : { borderColor: '#cbd5e1' }
            }
          >
            {mode === 'calendar' && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
          </div>
        </div>

        <AnimatePresence>
          {mode === 'calendar' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {calendarDate && (
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm text-slate-500">
                    {formatCalendarDisplay()} ({weeksFromDate(calendarDate)} שבועות)
                  </p>
                </div>
              )}

              <MiniCalendar
                selected={calendarDate}
                onChange={setCalendarDate}
                minDate={minCalendarDate}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <div className="flex-grow" />

      <StickyActionButton
        label="המשך"
        disabled={mode === 'calendar' && !calendarDate}
        onPress={handleContinue}
      />
    </div>
  );
}
