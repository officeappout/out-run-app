'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { hapticTap } from '@/lib/haptics';
import { SlidersHorizontal, Calendar, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { WEEKS_LOOKUP } from '../../data/running-improvement-branch.draft';
import { DEFAULT_PLAN_WEEKS, type GeneratorTargetDistance } from '@/features/workout-engine/core/services/plan-generator.service';
import StickyActionButton from '@/components/ui/StickyActionButton';
import { useOnboardingV2 } from '../../hooks/useOnboardingV2';
import { CustomLengthIcon, RaceBibIcon, WeeksCalendarIcon } from '../running-v2/PlanLengthIcons';
import { useT } from '@/hooks/useT';
import { onboarding } from '@/messages/ns/onboarding';

interface PlanLengthStepProps {
  onNext: () => void;
}

type SelectionMode = 'preset' | 'slider' | 'calendar';

const PRESET_WEEKS = [12, 10, 8] as const;

const PRESET_LABELS: Record<number, string> = {
  12: 'מומלץ לתהליך ארוך ומדורג', // i18n-allow-hebrew: legacy v1 (enable_home_v2 on)
  10: 'מומלץ לאימון מאוזן', // i18n-allow-hebrew: legacy v1 (enable_home_v2 on)
  8: 'מומלץ למסלול מהיר', // i18n-allow-hebrew: legacy v1 (enable_home_v2 on)
};

const HE_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', // i18n-allow-hebrew: month names (wave 3, fmt)
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר', // i18n-allow-hebrew: month names (wave 3, fmt)
];

const HE_WEEKDAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']; // i18n-allow-hebrew: weekday letters (wave 3, fmt)

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

// v2 (enable_home_v2) — R5-prop-planlength order and copy (labels: `steps.planLength.preset.line`).
const V2_PRESET_WEEKS = [8, 10, 12] as const;
/** The weeks bar under each preset card is drawn out of this many segments. */
const WEEKS_BAR_SEGMENTS = 16;

/** Distances with a label (`steps.planLength.dist`). */
const PLAN_DISTANCES = new Set(['2k', '3k', '5k', '10k']);

/** The target distance from the running answers ("10k"), or null (e.g. maintenance). */
function planDistanceKey(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = sessionStorage.getItem('onboarding_running_answers');
    const d = stored ? JSON.parse(stored).targetDistance : null;
    return typeof d === 'string' && PLAN_DISTANCES.has(d) ? d : null;
  } catch {
    return null;
  }
}

/** "13 בדצמבר" — the v2 cards' short end date. */
function formatShortEndDate(weeks: number): string {
  const end = new Date();
  end.setDate(end.getDate() + weeks * 7);
  return end.toLocaleDateString('he-IL', { day: 'numeric', month: 'long' });
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
  v2 = false,
}: {
  selected: Date | null;
  onChange: (d: Date) => void;
  minDate: Date;
  /** enable_home_v2 — light calendar (white card, tint selected day). */
  v2?: boolean;
}) {
  const t = useT(onboarding);
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

  if (v2) {
    return (
      <div className="flex flex-col rounded-[18px] bg-v2-surface p-3 ring-1 ring-inset ring-v2-hairline">
        <div className="mb-3 flex items-center justify-between px-1" dir="ltr">
          <button
            type="button"
            onClick={prevMonth}
            aria-label={t('steps.planLength.calendar.prevMonth')}
            className="grid h-9 w-9 place-items-center rounded-full bg-white shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
          >
            <ChevronLeft size={18} className="text-v2-deep" />
          </button>
          <span className="whitespace-nowrap text-[16px] font-black text-v2-ink">{formatHeader()}</span>
          <button
            type="button"
            onClick={nextMonth}
            aria-label={t('steps.planLength.calendar.nextMonth')}
            className="grid h-9 w-9 place-items-center rounded-full bg-white shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
          >
            <ChevronRight size={18} className="text-v2-deep" />
          </button>
        </div>
        <div className="mb-1.5 grid grid-cols-7 text-center">
          {HE_WEEKDAYS.map((d) => (
            <span key={d} className="text-[11px] font-extrabold text-v2-muted">{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-1 text-center">
          {blanks.map((_, i) => (
            <span key={`b-${i}`} />
          ))}
          {days.map((d) => {
            const sel = isSameDay(d);
            const past = isPast(d);
            return (
              <button
                key={d}
                type="button"
                disabled={past}
                onClick={() => onChange(new Date(viewYear, viewMonth, d))}
                className="flex h-9 items-center justify-center"
              >
                <span
                  className={`grid h-9 w-9 place-items-center rounded-full text-[14px] tabular-nums ${
                    past
                      ? 'text-v2-pill-border'
                      : sel
                        ? 'bg-v2-tint font-black text-v2-deep ring-1 ring-inset ring-v2-accent/40'
                        : 'font-bold text-v2-ink'
                  }`}
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
  const v2 = useOnboardingV2();
  const t = useT(onboarding);
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
    if (!calendarDate) return t('steps.planLength.race.pickEnd');
    return calendarDate.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  // ── v2 (enable_home_v2) — owner-approved R5-prop-planlength ─────
  // Same state, same handlers, same saved value (runningPlanWeeks):
  // presets 8/10/12, "יש לי מרוץ" = the calendar mode (race date → weeks,
  // weeksFromDate), "אחר" = the 4–52 slider. Fills OnboardingLayout's
  // scroll area (flex-1) — <main> already pads both safe-area insets.
  if (v2) {
    const radio = (on: boolean) => (
      <span
        aria-hidden
        className={`grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full transition-colors duration-150 ${
          on ? 'bg-v2-cta' : 'bg-v2-surface ring-[1.5px] ring-inset ring-v2-pill-border'
        }`}
      >
        {on && <Check size={14} strokeWidth={3.2} className="text-v2-on-cta" />}
      </span>
    );
    const cardCls = (on: boolean) =>
      `rounded-[22px] bg-white transition-shadow duration-200 ease-v2 ${on ? 'shadow-v2-card ring-2 ring-v2-accent' : 'shadow-v2-ring'}`;
    const iconTile = (node: React.ReactNode) => (
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-v2-tint text-v2-deep" aria-hidden>
        {node}
      </span>
    );
    const distKey = planDistanceKey();
    const distLabel = distKey ? t('steps.planLength.dist', { dist: distKey }) : null;
    const expand = {
      initial: { opacity: 0, height: 0 },
      animate: { opacity: 1, height: 'auto' },
      exit: { opacity: 0, height: 0 },
      transition: { duration: 0.28, ease: [0.23, 1, 0.32, 1] },
    } as const;

    return (
      <div dir="rtl" className="relative mx-auto flex w-full max-w-md flex-1 flex-col bg-v2-surface font-simpler text-v2-ink">
        <div className="px-4 pb-2 pt-1">
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-4 px-1">
            <h1 className="text-[24px] font-black leading-[1.2] !tracking-[-0.02em]">{t('steps.planLength.title')}</h1>
            <p className="mt-1 text-[14px] font-medium text-v2-ink-2">
              {distLabel ? t('steps.planLength.subtitle.withDist', { dist: distLabel }) : t('steps.planLength.subtitle.plain')}
            </p>
          </motion.div>

          <div role="radiogroup" aria-label={t('steps.planLength.options.aria')} className="flex flex-col gap-2.5">
            {V2_PRESET_WEEKS.map((weeks) => {
              const on = mode === 'preset' && selectedPreset === weeks;
              const isRecommended = weeks === recommended;
              return (
                <button
                  key={weeks}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => handlePresetSelect(weeks)}
                  className={`${cardCls(on)} w-full p-3.5 text-right transition-transform duration-150 ease-v2 active:scale-[0.97]`}
                >
                  <span className="flex items-center gap-3">
                    {iconTile(<WeeksCalendarIcon weeks={weeks} />)}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="whitespace-nowrap text-[17px] font-black !tracking-[-0.01em]">{t('steps.planLength.preset.weeks', { weeks: String(weeks) })}</span>
                        {isRecommended && (
                          <span className="whitespace-nowrap rounded-full bg-v2-tint px-2 py-0.5 text-[11px] font-extrabold text-v2-deep">
                            {t('steps.planLength.preset.recommended')}
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block truncate whitespace-nowrap text-[12.5px] font-bold text-v2-muted">
                        {t('steps.planLength.preset.line', { weeks: String(weeks), date: formatShortEndDate(weeks) })}
                      </span>
                    </span>
                    {radio(on)}
                  </span>
                  <span className="mt-2.5 flex gap-[2px]" aria-hidden>
                    {Array.from({ length: WEEKS_BAR_SEGMENTS }, (_, i) => (
                      <span
                        key={i}
                        className={`h-1.5 flex-1 rounded-[2px] ${i < weeks ? (on ? 'bg-v2-accent' : 'bg-v2-accent/70') : 'bg-v2-hairline'}`}
                      />
                    ))}
                  </span>
                </button>
              );
            })}

            {/* I have a race → the end-date calendar (race date → weeks) */}
            <div className={cardCls(mode === 'calendar')}>
              <button
                type="button"
                role="radio"
                aria-checked={mode === 'calendar'}
                onClick={() => setMode('calendar')}
                className="flex w-full items-center gap-3 p-3.5 text-right"
              >
                {iconTile(<RaceBibIcon />)}
                <span className="min-w-0 flex-1">
                  <span className="block whitespace-nowrap text-[17px] font-black !tracking-[-0.01em]">{t('steps.planLength.race.title')}</span>
                  <span className="mt-0.5 block truncate whitespace-nowrap text-[12.5px] font-bold text-v2-muted">
                    {calendarDate
                      ? t('steps.planLength.race.chosen', { date: formatCalendarDisplay(), weeks: String(weeksFromDate(calendarDate)) })
                      : t('steps.planLength.race.hint')}
                  </span>
                </span>
                {radio(mode === 'calendar')}
              </button>
              <AnimatePresence initial={false}>
                {mode === 'calendar' && (
                  <motion.div {...expand} className="overflow-hidden">
                    <div className="px-3 pb-3">
                      <MiniCalendar selected={calendarDate} onChange={setCalendarDate} minDate={minCalendarDate} v2 />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Other → the 4–52 slider */}
            <div className={cardCls(mode === 'slider')}>
              <button
                type="button"
                role="radio"
                aria-checked={mode === 'slider'}
                onClick={() => setMode('slider')}
                className="flex w-full items-center gap-3 p-3.5 text-right"
              >
                {iconTile(<CustomLengthIcon />)}
                <span className="min-w-0 flex-1">
                  <span className="block whitespace-nowrap text-[17px] font-black !tracking-[-0.01em]">{t('steps.planLength.custom.title')}</span>
                  <span className="mt-0.5 block truncate whitespace-nowrap text-[12.5px] font-bold text-v2-muted">
                    {mode === 'slider'
                      ? t('steps.planLength.custom.chosen', { weeks: String(sliderWeeks), date: formatShortEndDate(sliderWeeks) })
                      : t('steps.planLength.custom.hint')}
                  </span>
                </span>
                {radio(mode === 'slider')}
              </button>
              <AnimatePresence initial={false}>
                {mode === 'slider' && (
                  <motion.div {...expand} className="overflow-hidden">
                    <div className="flex flex-col items-center gap-1 px-4 pb-4">
                      <span className="whitespace-nowrap text-[30px] font-black tabular-nums !tracking-[-0.02em] text-v2-deep">
                        {t('steps.planLength.custom.value', { weeks: String(sliderWeeks) })}
                      </span>
                      <div className="relative mt-1 flex h-10 w-full items-center" dir="ltr">
                        <input
                          type="range"
                          min={4}
                          max={52}
                          value={sliderWeeks}
                          onChange={(e) => { const w = Number(e.target.value); if (w !== sliderWeeks) hapticTap('selection'); setSliderWeeks(w); }}
                          aria-label={t('steps.planLength.custom.aria')}
                          className="h-1.5 w-full cursor-pointer appearance-none rounded-full"
                          style={{
                            background: `linear-gradient(to right, #00baf7 ${((sliderWeeks - 4) / 48) * 100}%, #e6edf2 ${((sliderWeeks - 4) / 48) * 100}%)`,
                            accentColor: '#00baf7',
                          }}
                        />
                      </div>
                      <div className="flex w-full justify-between px-1 text-[12px] font-bold text-v2-muted" dir="ltr">
                        <span>4</span>
                        <span>52</span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        <div className="flex-grow" />

        <StickyActionButton
          variant="v2"
          label={t('steps.planLength.cta')}
          disabled={mode === 'calendar' && !calendarDate}
          onPress={handleContinue}
        />
      </div>
    );
  }

  return (
    <div dir="rtl" className="w-full max-w-md mx-auto px-4 py-4 flex flex-col min-h-[100dvh] relative font-simpler">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-2 pt-6 pb-2"
      >
        <h1 className="text-2xl font-black leading-tight text-slate-900 mb-2">
          {/* i18n-allow-hebrew: legacy v1 (enable_home_v2 on) */}לכמה שבועות תרצה את התוכנית?
        </h1>
        <p className="text-slate-500 text-sm">
          {/* i18n-allow-hebrew: legacy v1 (enable_home_v2 on) */}בחרו את משך התוכנית המועדף עליכם
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
                  {/* i18n-allow-hebrew: legacy v1 (enable_home_v2 on) */}מומלץ
                </span>
              )}

              <p className="text-slate-400 text-xs font-medium">
                {PRESET_LABELS[weeks]}
              </p>
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-lg font-bold text-slate-900">{/* i18n-allow-hebrew: legacy v1 (enable_home_v2 on) */}{weeks} שבועות</p>
                  <p className="text-slate-400 text-sm">{/* i18n-allow-hebrew: legacy v1 (enable_home_v2 on) */}עד {formatEndDate(weeks)}</p>
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
            <p className="text-lg font-bold text-slate-900">{/* i18n-allow-hebrew: legacy v1 (enable_home_v2 on) */}בחירה מותאמת אישית</p>
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
                {/* i18n-allow-hebrew: legacy v1 (enable_home_v2 on) */}{sliderWeeks} שבועות
              </span>
              <p className="text-slate-400 text-sm">{/* i18n-allow-hebrew: legacy v1 (enable_home_v2 on) */}עד {formatEndDate(sliderWeeks)}</p>

              <div className="relative w-full h-12 flex items-center mt-2" dir="ltr">
                <input
                  type="range"
                  min={4}
                  max={52}
                  value={sliderWeeks}
                  onChange={(e) => { const w = Number(e.target.value); if (w !== sliderWeeks) hapticTap('selection'); setSliderWeeks(w); }}
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
            <p className="text-lg font-bold text-slate-900">{/* i18n-allow-hebrew: legacy v1 (enable_home_v2 on) */}בחירת תאריך סיום</p>
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
                    {/* i18n-allow-hebrew: legacy v1 (enable_home_v2 on) */}{formatCalendarDisplay()} ({weeksFromDate(calendarDate)} שבועות)
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
        label="המשך" // i18n-allow-hebrew: legacy v1 (enable_home_v2 on)
        disabled={mode === 'calendar' && !calendarDate}
        onPress={handleContinue}
      />
    </div>
  );
}
