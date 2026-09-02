'use client';

/**
 * RunningScheduleStep
 *
 * Running-specific schedule step for the dual-track onboarding flow.
 * Key differences from ScheduleStep:
 *   - Frequency bounded 2–4 (MIN_RUNNING_FREQUENCY..MAX_RUNNING_FREQUENCY,
 *     `src/lib/running-frequency-bounds.ts`) — 1 was removed 01.09.2026;
 *     see that file's module doc for why (a single run/week silently
 *     produced a plan built for 2 runs/week with one of them never able
 *     to land on any calendar day). Max stays 4 for recovery/rest-day reasons.
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
import { Footprints, Clock, Check, RefreshCw, Bell, Timer, AlertCircle } from 'lucide-react';
import { useOnboardingStore } from '../../store/useOnboardingStore';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { Analytics } from '@/features/analytics/AnalyticsService';
import StickyActionButton from '@/components/ui/StickyActionButton';
import { auth } from '@/lib/firebase';
import { completeRunningScheduleFirstChoice } from '@/features/workout-engine/core/services/running-schedule-write.service';
import { MIN_RUNNING_FREQUENCY, MAX_RUNNING_FREQUENCY, clampRunningFrequency } from '@/lib/running-frequency-bounds';
import { getSmartDefaultDays } from '@/lib/running-schedule-smart-defaults';
import { resolveSignupDefaultWrite } from '@/lib/running-schedule-signup-default';

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
// MIN_FREQUENCY/MAX_FREQUENCY mirror the shared bound (David, 01.09.2026:
// "MAX_FREQUENCY נשאר 4. תוסיף MIN_FREQUENCY = 2 באותו מקום") -- declared
// here, next to each other, so the button range below reads as one pair,
// but both trace back to src/lib/running-frequency-bounds.ts rather than
// being a second, disconnected copy of the same numbers.
const MIN_FREQUENCY = MIN_RUNNING_FREQUENCY;
const MAX_FREQUENCY = MAX_RUNNING_FREQUENCY;

// getSmartDefaultDays lives in src/lib/running-schedule-smart-defaults.ts
// (extracted 01.09.2026, David's review -- this file has no jsdom coverage,
// the pure helper does) -- imported above, not redeclared here.

// ============================================================================
// COMPONENT
// ============================================================================

export default function RunningScheduleStep({ onNext, isJIT, isLastStep }: RunningScheduleStepProps) {
  const { updateData, data } = useOnboardingStore();
  const profile = useUserStore((s) => s.profile);
  const refreshProfile = useUserStore((s) => s.refreshProfile);
  const hasHydrated = useUserStore((s) => s._hasHydrated);

  // Single branch point (David, 01.09.2026): in JIT mode this component must
  // never touch useOnboardingStore's debounced sync at all -- zero calls,
  // not "unified" ones -- the JIT write path goes entirely through
  // completeRunningScheduleFirstChoice's own atomic Firestore write instead.
  // One decision here, used everywhere updateData would otherwise be
  // called directly, instead of a flag checked inside five handlers.
  const persistOnboardingData = isJIT ? (() => {}) : updateData;

  // Existing strength schedule days — for hybrid awareness display
  const strengthDays: string[] = profile?.lifestyle?.scheduleDays ?? [];
  const strengthDayIndices = strengthDays
    .map((letter) => DAYS_HEBREW.indexOf(letter))
    .filter((i) => i >= 0);
  const hasStrengthDays = strengthDays.length > 0;

  // The user's CURRENT running frequency (JIT only — a fresh
  // Firestore-backed value from useUserStore, not onboarding-store data
  // which is empty/irrelevant for a JIT entry). Used only to decide
  // whether the load-increase notice below applies; the writer itself
  // recomputes this independently server-side via resolveRunningScheduleChange.
  const oldRunningScheduleDays: string[] = profile?.running?.scheduleDays ?? [];

  // ── State ──────────────────────────────────────────────────────────────────

  // clampRunningFrequency (not a bare Math.max) guards a legacy stored value
  // of 1 -- real in production pre-01.09.2026, see running-frequency-bounds.ts
  // -- without this, a returning user with an old runningWeeklyFrequency=1
  // would land on a frequency the button row below can no longer even render
  // as selected (buttons only go 2-4), leaving nothing highlighted. Computed
  // once, outside useState, so selectedDays' own initializer below can be
  // reconciled against the SAME clamped value (David, 01.09.2026 review: a
  // first version clamped frequency but left a legacy stored day-count of 1
  // untouched, so the two could disagree -- 1 day selected, "2" highlighted,
  // canContinue = selectedDays.length===frequency permanently false, a dead
  // Continue button with no explanation).
  const initialFrequency = clampRunningFrequency(
    (data as any).runningWeeklyFrequency || RECOMMENDED_FREQUENCY,
  );

  const [frequency, setFrequency] = useState<number>(initialFrequency);

  const [selectedDays, setSelectedDays] = useState<number[]>(() => {
    // Same reconciliation rule handleFrequencySelect already applies on
    // every live frequency change below (`if (selectedDays.length !== value)
    // setSelectedDays(getSmartDefaultDays(value))`) -- applied here too, to
    // the initial mount, not just to a later click. A stored day-count that
    // doesn't match the (possibly-clamped) initial frequency is exactly the
    // stale-data case that rule exists to fix; trusting `stored` whenever it
    // was merely non-empty (the old check) is what left frequency and days
    // out of sync for a clamped legacy user.
    const stored = (data as any).runningScheduleDayIndices;
    if (Array.isArray(stored) && stored.length === initialFrequency) return stored;
    return getSmartDefaultDays(initialFrequency);
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

  // 2a signup pass-through (David, 02.09.2026): the interactive picker below
  // is JIT-only now -- the day question moved out of signup entirely (real
  // first choice happens later, in LifestyleWizard, via commit 3's
  // completeRunningScheduleFirstChoice). A first-time signup gets a silent
  // system default instead: write it through the same
  // persistOnboardingData/updateData path signup always used, then advance
  // immediately. `runningScheduleDaysSource:'system-default'` is what lets
  // the home-card gate (commit 4) and LifestyleWizard's own trigger tell
  // this apart from a real confirmed choice later.
  //
  // The route's own onNext (running-schedule/page.tsx's handleNext) was
  // changed to router.replace in this same commit -- without that, this
  // effect firing again on a "back" navigation back to this now-invisible
  // screen would just write the same default and advance again, making the
  // back button silently do nothing. That fix belongs to the route, this
  // effect only needs to not assume it's the route's job to guard re-entry.
  //
  // Gated on hasHydrated (David, 02.09.2026 review), same pattern already
  // used by NextRunWorkoutCard/home/page.tsx: `profile` is
  // useUserStore-async and can still be null on this component's first
  // mount, which would compute `strengthDays` (below) as `[]` and merge a
  // default missing the user's real strength days into `scheduleDays`.
  // Harmless today only because onboarding-sync.service.ts:570's gate
  // currently drops the whole scheduleDays write anyway (tracked
  // separately, parking-lot.md) -- the moment that gate is fixed, this
  // effect would start silently erasing a real user's strength days on
  // every run whose profile hadn't hydrated yet. hasWrittenDefaultRef
  // guards against a double write now that hasHydrated is a second effect
  // dependency (mount could already have hasHydrated=true, then this only
  // runs once; or it flips false->true, which must fire the write exactly
  // once, not on every subsequent render).
  //
  // The actual write-or-not decision (and exactly what to write) is pulled
  // out into resolveSignupDefaultWrite (running-schedule-signup-default.ts)
  // -- this component has no jsdom coverage, that pure function does, and
  // it's what a real test proving this hydration bug needs to exist at all.
  const hasWrittenDefaultRef = useRef(false);
  useEffect(() => {
    if (hasWrittenDefaultRef.current) return;
    const payload = resolveSignupDefaultWrite({ isJIT, hasHydrated, strengthDays, profile });
    if (!payload) return;
    hasWrittenDefaultRef.current = true;

    persistOnboardingData(payload as any);
    onNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isJIT, hasHydrated]);

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
    persistOnboardingData({ runningWeeklyFrequency: value } as any);
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

    if (isJIT) {
      // JIT path — single branch point (see persistOnboardingData above):
      // no useOnboardingStore writes at all, everything goes through the
      // dedicated atomic writer. Build failure is not shown here — the
      // days/time are saved regardless (completeRunningScheduleFirstChoice's
      // own contract), and if activeProgram couldn't be built,
      // NextRunWorkoutCard's existing State A (A1/A2, already merged and
      // device-verified) already handles recovery on the home screen. No
      // second failure-UI duplicated here.
      // StickyActionButton's own onPress/loading/success state machine
      // already prevents a second submit while this await is in flight —
      // no separate isSubmitting state needed here.
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      await completeRunningScheduleFirstChoice({
        uid,
        scheduleDays: runningScheduleDays,
        frequency,
        time,
      });
      // refreshProfile() regardless of ok/false — either way Firestore now
      // has a different running.* shape than what useUserStore is holding
      // (the days/time always land; activeProgram only on success), and
      // the home screen must reflect the real current state, not a stale
      // pre-save snapshot (same lesson as A2: profile is getDoc()-based,
      // not a live listener).
      await refreshProfile();
      onNext();
      return;
    }

    // Signup path — unchanged behavior, only updateData -> persistOnboardingData
    // (persistOnboardingData === updateData here, since isJIT is false).
    const mergedDays = Array.from(new Set([...strengthDays, ...runningScheduleDays]));

    persistOnboardingData({
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
  // Not reachable in JIT — this toggle doesn't render there at all (see
  // render, below): the wizard already has its own separate notifications
  // step (LifestyleWizard.tsx, 'notifications', after 'schedule'), so this
  // one would duplicate it. persistOnboardingData used anyway, for the same
  // single-branch-point consistency as everywhere else in this file.
  const handleNotificationToggle = async () => {
    if (notificationsEnabled) {
      setNotificationsEnabled(false);
      persistOnboardingData({ runningNotificationsEnabled: false } as any);
      return;
    }
    if ('Notification' in window) {
      let permission = Notification.permission;
      if (permission === 'default') {
        try { permission = await Notification.requestPermission(); } catch { /* ignore */ }
      }
      const granted = permission === 'granted' || permission !== 'denied';
      setNotificationsEnabled(granted);
      persistOnboardingData({ runningNotificationsEnabled: granted } as any);
    } else {
      setNotificationsEnabled(true);
      persistOnboardingData({ runningNotificationsEnabled: true } as any);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  // Signup pass-through (see the isJIT-gated effect above) — nothing to show,
  // the effect above writes the default and calls onNext() on mount. A
  // minimal loading state instead of null, matching health/page.tsx's own
  // auto-skip precedent (:141-147), so there's no blank-white flash on a
  // slower device between mount and the navigation this effect triggers.
  if (!isJIT) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center">
        <p className="text-slate-400 text-sm">טוען...</p>
      </div>
    );
  }

  return (
    <div dir="rtl" className="w-full max-w-md mx-auto px-4 py-4 flex flex-col min-h-[100dvh] relative">

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
              אפשר לבחור בהם גם ריצה — שני האימונים יופיעו באותו יום בלוז.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Load-increase notice (JIT only, frequency going UP from the
          user's current running days) — "warns, doesn't block" (David,
          01.09.2026). Shown BEFORE the user saves, not as a fleeting
          post-save success-label, since StickyActionButton's onPress
          calls onNext() at the very end of handleContinue — by the time
          its own internal success-checkmark state would render, this
          screen may already be transitioning away, making a post-save
          message unreliable to actually be seen. Wording DECIDED (David,
          01.09.2026, second round) — the banner shows BEFORE the save
          happens, so past-tense phrasing was wrong; replaced with
          before-the-fact framing that also reassures on the thing that
          actually worries the user (progress isn't lost). */}
      <AnimatePresence>
        {isJIT && frequency > oldRunningScheduleDays.length && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2"
          >
            <AlertCircle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 font-medium text-right leading-relaxed">
              בחרת יותר ימים מהתוכנית הנוכחית שלך.
              <br />
              נעדכן אותה בהתאם — ההתקדמות שלך תישמר.
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
          {Array.from(
            { length: MAX_FREQUENCY - MIN_FREQUENCY + 1 },
            (_, i) => i + MIN_FREQUENCY,
          ).map((num) => {
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

              {/* Calendar Sync toggle — mirrors ScheduleStep. Hidden in JIT
                  (David, 01.09.2026): a global, once-per-user preference
                  that already has a home in the main signup flow — on a
                  screen titled "מתי נרוץ?" it would read as if it were
                  about running specifically, and it isn't. This screen's
                  job here is days only. */}
              {!isJIT && (
                <button
                  onClick={() => {
                    const next = !calendarSyncEnabled;
                    setCalendarSyncEnabled(next);
                    persistOnboardingData({ calendarSyncEnabled: next } as any);
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
              )}
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

                return (
                  <div key={index} className="relative">
                    <motion.button
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => handleDayToggle(index)}
                      aria-label={DAY_NAMES_HE[index]}
                      className={`w-11 h-11 flex items-center justify-center rounded-xl text-lg transition-all duration-200 ${
                        isRunning
                          ? 'text-white shadow-[0_4px_12px_rgba(16,185,129,0.25)]'
                          : isStrength
                          ? 'bg-[#5BC2F2]/20 text-[#5BC2F2] border border-[#5BC2F2]/30'
                          : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
                      }`}
                      style={{
                        fontFamily: 'var(--font-simpler)',
                        fontWeight: isRunning || isStrength ? 700 : 500,
                        ...(isRunning ? { background: '#10B981' } : {}),
                      }}
                    >
                      {day}
                    </motion.button>

                    {/* Small "כ" dot marks a strength day — shown regardless of
                        whether it's also a running day (no more blended "shared"
                        color; the running color always wins the button, this dot
                        is the separate strength marker next to it). */}
                    {isStrength && (
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
                  { color: 'bg-[#10B981]', label: 'ריצה' },
                  { color: 'bg-[#5BC2F2]', label: 'כוח' },
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

              {/* Reminders toggle — hidden in JIT (David, 01.09.2026):
                  duplicates LifestyleWizard's own separate 'notifications'
                  step (LifestyleWizard.tsx, comes right after 'schedule'). */}
              {!isJIT && (
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
              )}
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
