'use client';

/**
 * RunningScheduleStep
 *
 * Running-specific schedule step for the dual-track onboarding flow.
 * Key differences from ScheduleStep:
 *   - Frequency capped at 1–4 (running recovery requires rest days)
 *   - Recommended badge on 3 days
 *   - Smart defaults: 2→Mon/Thu, 3→Sun/Tue/Thu, 4→Mon/Tue/Thu/Fri
 *   - Default time 07:00 (morning runs are more common)
 *   - Sky Blue (#00BAF7) accent color to match running brand
 *   - Hybrid awareness: shows existing strength days as faded cyan so
 *     the user can see conflicts at a glance
 *   - Writes: runningWeeklyFrequency, runningScheduleDays, runningScheduleTime,
 *     and merges running days into the global lifestyle.scheduleDays
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Footprints, Clock, Check, RefreshCw, Bell, Timer } from 'lucide-react';
import { useOnboardingStore } from '../../store/useOnboardingStore';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { Analytics } from '@/features/analytics/AnalyticsService';
import StickyActionButton from '@/components/ui/StickyActionButton';

// ============================================================================
// CONSTANTS
// ============================================================================

interface RunningScheduleStepProps {
  onNext: () => void;
  isJIT?: boolean;
  isLastStep?: boolean;
}

const DAYS_HEBREW = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
const DAY_NAMES_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

const RECOMMENDED_FREQUENCY = 3;
const MAX_FREQUENCY = 4;

/** Smart default day indices per frequency (Sun=0 … Sat=6) */
const getSmartDefaultDays = (freq: number): number[] => {
  switch (freq) {
    case 1: return [0];          // Sun
    case 2: return [1, 4];       // Mon, Thu
    case 3: return [0, 2, 4];    // Sun, Tue, Thu
    case 4: return [1, 2, 4, 5]; // Mon, Tue, Thu, Fri
    default: return [0];
  }
};

// ============================================================================
// COMPONENT
// ============================================================================

export default function RunningScheduleStep({ onNext, isJIT, isLastStep }: RunningScheduleStepProps) {
  const { updateData, data } = useOnboardingStore();
  const profile = useUserStore((s) => s.profile);

  // Existing strength schedule days — for hybrid awareness display
  const strengthDays: string[] = profile?.lifestyle?.scheduleDays ?? [];
  const strengthDayIndices = strengthDays
    .map((letter) => DAYS_HEBREW.indexOf(letter))
    .filter((i) => i >= 0);
  const hasStrengthDays = strengthDays.length > 0;

  // ── State ──────────────────────────────────────────────────────────────────

  const [frequency, setFrequency] = useState<number>(
    (data as any).runningWeeklyFrequency || RECOMMENDED_FREQUENCY
  );

  const [selectedDays, setSelectedDays] = useState<number[]>(() => {
    const stored = (data as any).runningScheduleDayIndices;
    if (Array.isArray(stored) && stored.length > 0) return stored;
    return getSmartDefaultDays(RECOMMENDED_FREQUENCY);
  });

  // Default to morning time for running
  const [time, setTime] = useState<string>((data as any).runningScheduleTime || '07:00');

  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(
    (data as any).runningNotificationsEnabled ?? true
  );
  const [calendarSyncEnabled, setCalendarSyncEnabled] = useState<boolean>(
    (data as any).calendarSyncEnabled ?? true
  );

  // Progressive disclosure
  const [showDaysSection, setShowDaysSection] = useState(false);
  const [daysPulse, setDaysPulse] = useState(false);
  const [showTimeSection, setShowTimeSection] = useState(false);

  const notificationBtnRef = useRef<HTMLButtonElement>(null);

  const [hours, minutes] = time.split(':').map(Number);

  // ── Effects ────────────────────────────────────────────────────────────────

  // Auto-reveal days section after 800 ms (matches ScheduleStep behaviour)
  useEffect(() => {
    const timer = setTimeout(() => setShowDaysSection(true), 800);
    return () => clearTimeout(timer);
  }, []);

  // Reveal time picker only when days selection is complete
  useEffect(() => {
    if (showDaysSection && selectedDays.length === frequency && frequency > 0) {
      if (!showTimeSection) {
        const timer = setTimeout(() => setShowTimeSection(true), 400);
        return () => clearTimeout(timer);
      }
    } else {
      if (showTimeSection) setShowTimeSection(false);
    }
  }, [showDaysSection, selectedDays.length, frequency, showTimeSection]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleFrequencySelect = (value: number) => {
    setFrequency(value);
    if (selectedDays.length !== value) {
      setSelectedDays(getSmartDefaultDays(value));
      setDaysPulse(true);
      setTimeout(() => setDaysPulse(false), 500);
    }
    if (showTimeSection && selectedDays.length !== value) {
      setShowTimeSection(false);
    }
    updateData({ runningWeeklyFrequency: value } as any);
  };

  const handleDayToggle = (dayIndex: number) => {
    let next: number[];
    if (selectedDays.includes(dayIndex)) {
      if (selectedDays.length <= 1) return; // keep at least 1
      next = selectedDays.filter((i) => i !== dayIndex);
    } else {
      next =
        selectedDays.length >= frequency
          ? [...selectedDays.slice(0, -1), dayIndex]
          : [...selectedDays, dayIndex];
    }
    setSelectedDays(next);
  };

  const handleContinue = async () => {
    if (selectedDays.length !== frequency) return;

    const runningScheduleDays = selectedDays.map((i) => DAYS_HEBREW[i]).sort();

    // Merge running days with existing strength days for global scheduleDays
    const mergedDays = Array.from(new Set([...strengthDays, ...runningScheduleDays]));

    updateData({
      runningWeeklyFrequency: frequency,
      runningScheduleDays,
      runningScheduleDayIndices: selectedDays,
      runningScheduleTime: time,
      runningNotificationsEnabled: notificationsEnabled,
      // Global fields consumed by the sync service and Dashboard
      scheduleDays: mergedDays,
      calendarSyncEnabled,
    } as any);

    await Analytics.logOnboardingStepComplete('SCHEDULE', 0);
    onNext();
  };

  const canContinue = frequency > 0 && selectedDays.length === frequency;

  // ── Notification permission helper (mirrors ScheduleStep) ──────────────────
  const handleNotificationToggle = async () => {
    if (notificationsEnabled) {
      setNotificationsEnabled(false);
      updateData({ runningNotificationsEnabled: false } as any);
      return;
    }
    if ('Notification' in window) {
      let permission = Notification.permission;
      if (permission === 'default') {
        try { permission = await Notification.requestPermission(); } catch { /* ignore */ }
      }
      const granted = permission === 'granted' || permission !== 'denied';
      setNotificationsEnabled(granted);
      updateData({ runningNotificationsEnabled: granted } as any);
    } else {
      setNotificationsEnabled(true);
      updateData({ runningNotificationsEnabled: true } as any);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div dir="rtl" className="w-full max-w-md mx-auto px-4 py-4 flex flex-col min-h-screen relative">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-4"
      >
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(0,186,247,0.1)' }}>
            <Footprints size={20} style={{ color: '#00BAF7' }} />
          </div>
          <h2 className="text-xl font-black text-slate-900">מתי נרוץ?</h2>
        </div>
        <p className="text-sm text-slate-500 mr-[52px]">
          נבנה תוכנית ריצה שמתאימה לסדר היום שלך
        </p>
      </motion.div>

      {/* ── Hybrid Notice (only when strength days already exist) ────────── */}
      <AnimatePresence>
        {hasStrengthDays && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4 px-3 py-2.5 bg-blue-50 border border-blue-200 rounded-xl"
          >
            <p className="text-xs text-blue-700 font-medium text-right leading-relaxed">
              ימי הכוח שלך ({strengthDays.join(', ')}) מסומנים בכחול.
              בחר ימי ריצה — ימים משותפים יוצגו בסגול.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Section 1: Frequency (1–4 only) ─────────────────────────────── */}
      <section className="mb-5 text-right">
        <h3 className="text-base font-bold text-slate-900 mb-3">
          כמה אימוני ריצה בשבוע?
        </h3>

        <div className="flex gap-3 justify-center">
          {Array.from({ length: MAX_FREQUENCY }, (_, i) => i + 1).map((num) => {
            const isRecommended = num === RECOMMENDED_FREQUENCY;
            const isSelected = frequency === num;
            return (
              <div key={num} className="relative">
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => handleFrequencySelect(num)}
                  className={`w-14 h-14 flex items-center justify-center rounded-2xl text-xl transition-all duration-200 ${
                    isSelected
                      ? 'text-white shadow-[0_4px_12px_rgba(0,186,247,0.3)]'
                      : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
                  }`}
                  style={{
                    fontFamily: 'var(--font-simpler)',
                    fontWeight: isSelected ? 700 : 500,
                    ...(isSelected ? { background: '#00BAF7' } : {}),
                  }}
                  aria-label={`${num} ${num === 1 ? 'יום' : 'ימים'} בשבוע`}
                >
                  {num}
                </motion.button>

                {isRecommended && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap"
                  >
                    <span
                      className="text-[10px] px-2 py-0.5 rounded-full text-white"
                      style={{ fontWeight: 600, background: '#0AC2B6' }}
                    >
                      מומלץ עבורך
                    </span>
                  </motion.div>
                )}
              </div>
            );
          })}
        </div>
        <div className="h-7" />
      </section>

      {/* ── Section 2: Day Selector ──────────────────────────────────────── */}
      <AnimatePresence>
        {showDaysSection && (
          <motion.section
            initial={{ opacity: 0, height: 0, y: 10 }}
            animate={{
              opacity: 1,
              height: 'auto',
              y: 0,
              scale: daysPulse ? [1, 1.02, 1] : 1,
            }}
            exit={{ opacity: 0, height: 0, y: -10 }}
            transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
            className="mb-5 text-right overflow-hidden"
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-base font-bold text-slate-900">באילו ימים?</h3>

              {/* Calendar Sync toggle — mirrors ScheduleStep */}
              <button
                onClick={() => {
                  const next = !calendarSyncEnabled;
                  setCalendarSyncEnabled(next);
                  updateData({ calendarSyncEnabled: next } as any);
                }}
                className="flex items-center gap-1 px-2 py-1 rounded-md transition-all duration-200"
                style={calendarSyncEnabled
                  ? { background: 'rgba(0,186,247,0.1)', color: '#00BAF7' }
                  : { background: '#f8fafc', color: '#64748b' }
                }
              >
                <RefreshCw
                  size={10}
                  strokeWidth={1.5}
                  style={{ color: calendarSyncEnabled ? '#00BAF7' : '#94a3b8' }}
                />
                <span className="text-[11px] font-medium">סנכרון ליומן</span>
                <div
                  className="w-3 h-3 rounded-full flex items-center justify-center transition-all"
                  style={{ background: calendarSyncEnabled ? '#00BAF7' : '#e2e8f0' }}
                >
                  {calendarSyncEnabled && (
                    <Check size={7} className="text-white" strokeWidth={2.5} />
                  )}
                </div>
              </button>
            </div>

            <p
              className={`text-xs font-bold mb-2 ${
                selectedDays.length === frequency ? 'text-green-600' : ''
              }`}
              style={selectedDays.length !== frequency ? { color: '#00BAF7' } : undefined}
            >
              נבחרו {selectedDays.length} מתוך {frequency} ימים
            </p>

            <div className="flex flex-wrap justify-center gap-2">
              {DAYS_HEBREW.map((day, index) => {
                const isRunning = selectedDays.includes(index);
                const isStrength = strengthDayIndices.includes(index);
                const isShared = isRunning && isStrength;

                return (
                  <div key={index} className="relative">
                    <motion.button
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => handleDayToggle(index)}
                      aria-label={DAY_NAMES_HE[index]}
                      className={`w-11 h-11 flex items-center justify-center rounded-xl text-lg transition-all duration-200 ${
                        isShared
                          ? 'bg-purple-500 text-white shadow-[0_4px_12px_rgba(168,85,247,0.25)]'
                          : isRunning
                          ? 'text-white shadow-[0_4px_12px_rgba(0,186,247,0.25)]'
                          : isStrength
                          ? 'bg-[#5BC2F2]/20 text-[#5BC2F2] border border-[#5BC2F2]/30'
                          : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
                      }`}
                      style={{
                        fontFamily: 'var(--font-simpler)',
                        fontWeight: isRunning || isStrength ? 700 : 500,
                        ...(isRunning && !isShared ? { background: '#00BAF7' } : {}),
                      }}
                    >
                      {day}
                    </motion.button>

                    {/* Small "כ" dot on strength-only days */}
                    {isStrength && !isRunning && (
                      <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-[#5BC2F2] flex items-center justify-center pointer-events-none">
                        <span className="text-[7px] text-white font-bold leading-none">כ</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Colour legend — shown only in hybrid mode */}
            {hasStrengthDays && (
              <div className="mt-3 flex flex-wrap gap-3 justify-center">
                {[
                  { color: 'bg-[#00BAF7]', label: 'ריצה' },
                  { color: 'bg-[#5BC2F2]', label: 'כוח' },
                  { color: 'bg-purple-500', label: 'שניהם' },
                ].map(({ color, label }) => (
                  <div key={label} className="flex items-center gap-1">
                    <div className={`w-3 h-3 rounded-full ${color}`} />
                    <span className="text-[10px] text-slate-500">{label}</span>
                  </div>
                ))}
              </div>
            )}
          </motion.section>
        )}
      </AnimatePresence>

      {/* ── Section 3: Time Picker ───────────────────────────────────────── */}
      <AnimatePresence>
        {showTimeSection && (
          <motion.section
            initial={{ opacity: 0, height: 0, y: 10 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: -10 }}
            transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
            className="mb-5 text-right overflow-hidden"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Timer size={16} style={{ color: '#00BAF7' }} />
                <h3 className="text-base font-bold text-slate-900">באיזו שעה תרוץ?</h3>
              </div>

              {/* Reminders toggle */}
              <button
                ref={notificationBtnRef}
                onClick={handleNotificationToggle}
                className={`flex items-center gap-1 px-2 py-1 rounded-md transition-all duration-200 ${
                  notificationsEnabled
                    ? 'bg-amber-50 text-amber-700'
                    : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                }`}
              >
                <Bell
                  size={10}
                  strokeWidth={1.5}
                  className={notificationsEnabled ? 'text-amber-600' : 'text-slate-400'}
                />
                <span className="text-[11px] font-medium">תזכורת</span>
                <div
                  className={`w-3 h-3 rounded-full flex items-center justify-center transition-all ${
                    notificationsEnabled ? 'bg-amber-500' : 'bg-slate-200'
                  }`}
                >
                  {notificationsEnabled && (
                    <Check size={7} className="text-white" strokeWidth={2.5} />
                  )}
                </div>
              </button>
            </div>

            {/* Hour : Minute scroll picker — identical mechanics to ScheduleStep */}
            <div className="relative py-3 flex justify-center items-center select-none">
              <div className="flex items-center gap-4" style={{ direction: 'ltr' }}>
                {/* Hours column */}
                <div className="flex flex-col gap-1">
                  {[hours - 1, hours, hours + 1].map((h, idx) => {
                    const displayHour = h < 0 ? 23 : h > 23 ? 0 : h;
                    const isSelected = displayHour === hours;
                    return (
                      <button
                        key={`hour-${displayHour}-${idx}`}
                        onClick={() =>
                          setTime(
                            (prev) =>
                              `${String(displayHour).padStart(2, '0')}:${prev.split(':')[1]}`
                          )
                        }
                        className={`w-14 h-9 rounded-xl flex items-center justify-center transition-all duration-200 ${
                          isSelected
                            ? 'text-white text-lg shadow-[0_4px_12px_rgba(0,186,247,0.25)]'
                            : 'bg-white text-slate-400 text-sm border border-slate-200 hover:border-slate-300'
                        }`}
                        style={{
                          fontFamily: 'var(--font-simpler)',
                          fontWeight: isSelected ? 700 : 500,
                          ...(isSelected ? { background: '#00BAF7' } : {}),
                        }}
                      >
                        {String(displayHour).padStart(2, '0')}
                      </button>
                    );
                  })}
                </div>

                <span className="text-2xl font-bold text-slate-900">:</span>

                {/* Minutes column (5-min steps) */}
                <div className="flex flex-col gap-1">
                  {[
                    Math.round(minutes / 5) * 5 - 5,
                    Math.round(minutes / 5) * 5,
                    Math.round(minutes / 5) * 5 + 5,
                  ].map((m, idx) => {
                    const displayMinute = m < 0 ? 55 : m > 55 ? 0 : m;
                    const roundedMinutes = Math.round(minutes / 5) * 5;
                    const isSelected = displayMinute === roundedMinutes;
                    return (
                      <button
                        key={`min-${displayMinute}-${idx}`}
                        onClick={() =>
                          setTime(
                            (prev) =>
                              `${prev.split(':')[0]}:${String(displayMinute).padStart(2, '0')}`
                          )
                        }
                        className={`w-14 h-9 rounded-xl flex items-center justify-center transition-all duration-200 ${
                          isSelected
                            ? 'text-white text-lg shadow-[0_4px_12px_rgba(0,186,247,0.25)]'
                            : 'bg-white text-slate-400 text-sm border border-slate-200 hover:border-slate-300'
                        }`}
                        style={{
                          fontFamily: 'var(--font-simpler)',
                          fontWeight: isSelected ? 700 : 500,
                          ...(isSelected ? { background: '#00BAF7' } : {}),
                        }}
                      >
                        {String(displayMinute).padStart(2, '0')}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      <div className="flex-grow" />

      <StickyActionButton
        label={
          isJIT
            ? 'שמירת שינויים'
            : isLastStep
            ? 'בואו נרוץ!'
            : 'המשך'
        }
        successLabel={isJIT ? 'לוח ריצה עודכן!' : undefined}
        disabled={!canContinue}
        onPress={handleContinue}
      />
    </div>
  );
}
