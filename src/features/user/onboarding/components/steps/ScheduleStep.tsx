'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Coins, Check, Calendar, Clock, ChevronDown, Lightbulb, RefreshCw,
  Sofa, Footprints, Flame, Building2, TreePine, Dumbbell, Home as HomeIcon,
  Bike, Sparkles, Heart, Zap,
} from 'lucide-react';
import { useOnboardingStore } from '../../store/useOnboardingStore';
import { getOnboardingLocale, type OnboardingLanguage } from '@/lib/i18n/onboarding-locales';
import { Analytics } from '@/features/analytics/AnalyticsService';
import { IS_COIN_SYSTEM_ENABLED } from '@/config/feature-flags';
import StickyActionButton from '@/components/ui/StickyActionButton';
import { useSuppressBottomNav } from '@/features/parks/core/hooks/useSuppressBottomNav';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import {
  buildDefaultTemplate,
  validateSchedule,
  validateInitial,
  partitionWarnings,
} from '@/features/schedule/engine/scheduleRules';
import {
  type ScheduleDay,
  type ScheduleItemId,
} from '@/features/schedule/types/smartSchedule.types';
import {
  resolveScheduleSeed,
  type ScheduleSeedProfileInput,
} from '@/features/schedule/services/scheduleSeed.service';
import { rehydrateScheduleGrid } from '@/features/schedule/services/scheduleRehydration';
import ScheduleFrequencyPicker from '@/features/schedule/components/ScheduleFrequencyPicker';
import ScheduleDayBand from '@/features/schedule/components/ScheduleDayBand';
import ScheduleWarningsPanel from '@/features/schedule/components/ScheduleWarningsPanel';
import TrainingTimePicker from '@/features/schedule/components/TrainingTimePicker';

interface ScheduleStepProps {
  onNext: () => void;
  isJIT?: boolean;
  isLastStep?: boolean;
}

// Coin Fly Animation Component - COIN_SYSTEM_PAUSED: Hidden when disabled
function CoinFly({ 
  startPos, 
  endPos, 
  amount, 
  onComplete 
}: { 
  startPos: { x: number; y: number } | null; 
  endPos: { x: number; y: number } | null;
  amount: number;
  onComplete: () => void;
}) {
  // COIN_SYSTEM_PAUSED: Re-enable in April
  if (!IS_COIN_SYSTEM_ENABLED) {
    // Still trigger onComplete to not break the flow
    React.useEffect(() => {
      onComplete();
    }, [onComplete]);
    return null;
  }
  if (!startPos || !endPos) return null;

  return (
    <motion.div
      initial={{ 
        x: startPos.x - 30,
        y: startPos.y - 12,
        scale: 1,
        opacity: 1
      }}
      animate={{ 
        x: endPos.x - 30,
        y: endPos.y - 12,
        scale: [1, 1.3, 0.8],
        opacity: [1, 1, 0]
      }}
      exit={{ opacity: 0, scale: 0 }}
      transition={{ 
        duration: 0.9,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
      onAnimationComplete={onComplete}
      className="fixed pointer-events-none z-[9999]"
      style={{ left: 0, top: 0, pointerEvents: 'none' }}
    >
      <motion.div 
        className="flex items-center gap-1 bg-yellow-200 text-yellow-800 rounded-full px-2 py-1 shadow-lg"
        animate={{ rotate: [0, 180, 360] }}
        transition={{ duration: 0.9, ease: "linear" }}
      >
        <Coins size={16} className="text-yellow-800" strokeWidth={2.5} />
        <span className="text-xs font-bold font-simpler">+{amount}</span>
      </motion.div>
    </motion.div>
  );
}


export default function ScheduleStep({ onNext, isJIT, isLastStep }: ScheduleStepProps) {
  // Focus mode — suppress global bottom navbar while wizard is active.
  useSuppressBottomNav();

  const { updateData, data, claimReward, hasClaimedReward, coins } = useOnboardingStore();

  // ── [Smart Schedule v1.3] Seed derivation ─────────────────────────────────
  // sessionStorage reads moved out of resolveScheduleSeed into their own
  // memos here (mirrors the savedLanguage/gender pattern just below) so the
  // extracted function stays pure/testable — see scheduleSeed.service.ts's
  // own header for why.
  const userProfile = useUserStore((s) => s.profile);

  const skillFocusSlugs = useMemo<string[] | undefined>(() => {
    if (typeof window === 'undefined') return undefined;
    try {
      const raw = sessionStorage.getItem('onboarding_skill_focus');
      return raw ? JSON.parse(raw) : undefined;
    } catch { return undefined; }
  }, []);
  const programPath = useMemo<string | undefined>(() => {
    if (typeof window === 'undefined') return undefined;
    return sessionStorage.getItem('onboarding_program_path') ?? undefined;
  }, []);

  const { activeWizardOptions, seedPrograms, seedSkills } = useMemo(
    () => resolveScheduleSeed(userProfile as ScheduleSeedProfileInput | null | undefined, { skillFocusSlugs, programPath }),
    [userProfile, skillFocusSlugs, programPath],
  );

  // Get current language
  const savedLanguage = typeof window !== 'undefined'
    ? (sessionStorage.getItem('onboarding_language') || 'he') as OnboardingLanguage
    : 'he';
  const locale = getOnboardingLocale(savedLanguage);
  const isHebrew = savedLanguage === 'he';

  // Get gender from sessionStorage
  const gender = typeof window !== 'undefined'
    ? (sessionStorage.getItem('onboarding_personal_gender') || 'male') as 'male' | 'female'
    : 'male';
  
  // Gender-aware translation helper
  const t = (male: string, female: string) => gender === 'female' ? female : male;

  // ── Deep History (merged from HistoryStep) ──────────────────────
  const [historyFreq, setHistoryFreq] = useState<string>(data.historyFrequency || '');
  const [historyLocs, setHistoryLocs] = useState<string[]>(data.historyLocations || []);
  const [historySpts, setHistorySpts] = useState<string[]>(data.historySports || []);
  const historyDone = historyFreq !== '';

  const FREQ_OPTIONS = [
    { id: 'none',  label: isHebrew ? 'לא התאמנתי' : "I didn't train", icon: Sofa,       bg: 'bg-slate-50', color: 'text-slate-500' },
    { id: '1-2',   label: isHebrew ? '1-2 פעמים בשבוע' : '1-2/week',   icon: Footprints, bg: 'bg-blue-50',  color: 'text-blue-500'  },
    { id: '3+',    label: isHebrew ? '3+ פעמים בשבוע' : '3+/week',     icon: Flame,      bg: 'bg-orange-50',color: 'text-orange-500' },
  ];
  const LOC_OPTIONS = [
    { id: 'studio', label: isHebrew ? 'סטודיו/חוגים' : 'Studio',  icon: Building2 },
    { id: 'park',   label: isHebrew ? 'גינת כושר' : 'Park',       icon: TreePine },
    { id: 'home',   label: isHebrew ? 'בית' : 'Home',              icon: HomeIcon },
    { id: 'gym',    label: isHebrew ? 'חדר כושר' : 'Gym',          icon: Dumbbell },
  ];
  const SPORT_OPTIONS = [
    { id: 'running',  label: isHebrew ? 'ריצה' : 'Running',      icon: Zap },
    { id: 'swimming', label: isHebrew ? 'שחייה' : 'Swimming',    icon: Heart },
    { id: 'yoga',     label: isHebrew ? 'יוגה/פילאטיס' : 'Yoga', icon: Sparkles },
    { id: 'cycling',  label: isHebrew ? 'רכיבה' : 'Cycling',     icon: Bike },
    { id: 'strength', label: isHebrew ? 'כוח' : 'Strength',      icon: Dumbbell },
    { id: 'cardio',   label: isHebrew ? 'קרדיו' : 'Cardio',      icon: Heart },
    { id: 'crossfit', label: isHebrew ? 'קרוספיט' : 'CrossFit',  icon: Flame },
  ];

  // Local-only until handleContinue's single consolidated updateData() call —
  // these used to also call updateData() per-click, but every value they
  // touch is already local state that handleContinue re-sends in full, so
  // that was a pure redundant write, not a resume/checkpoint mechanism
  // (David, 31.08.2026: write on step-completion, not on field-touch).
  const handleHistoryFreq = (id: string) => {
    setHistoryFreq(id);
  };
  const toggleHistoryLoc = (id: string) => {
    const next = historyLocs.includes(id) ? historyLocs.filter(l => l !== id) : [...historyLocs, id];
    setHistoryLocs(next);
  };
  const toggleHistorySport = (id: string) => {
    const next = historySpts.includes(id) ? historySpts.filter(s => s !== id) : [...historySpts, id];
    setHistorySpts(next);
  };

  // Recommended frequency (default 3, can be based on goal)
  const RECOMMENDED_FREQUENCY = 3;

  // State - Default to recommended frequency
  const [frequency, setFrequency] = useState<number>(data.trainingDays || RECOMMENDED_FREQUENCY);

  // ── [Smart Schedule v1.3] Pre-template gating (§2.3) — ERR_DAYS_MIN only ──
  // Runs before the grid exists — skill-count/frequency feasibility, not
  // grid content. WARN-level (reconnected 01.09.2026). Merged into the
  // same liveErrors/liveWarns stream below, not a second display.
  //
  // validateInitial() also returns ERR_03 (>4 hard skills) — deliberately
  // not consumed here. David, 01.09.2026: ERR_03 has nothing this screen
  // can do about it (hardCount comes from seedSkills, fixed at mount —
  // nothing here changes it), while ERR_DAYS_MIN is genuinely actionable
  // here (frequency is adjustable right on this screen). Showing one
  // non-actionable warning next to one actionable one burns trust in both
  // — the user learns a warning can be decorative and stops reading
  // either. ERR_03's real home is program-path/page.tsx, where hardCount
  // is actually chosen — see scheduleRules.ts for that pointer.
  //
  // Allow-list, not deny-list, on purpose: a future rule added to
  // validateInitial() must not appear here until someone explicitly adds
  // its code below — otherwise it lands on this screen by default, with
  // no one deciding or reviewing that it belongs here. That silent-
  // appearance failure mode is exactly what today's whole validation
  // round was about.
  const initialWarnings = useMemo(
    () => validateInitial(seedSkills.map((s) => s.id), frequency).filter((w) => w.code === 'ERR_DAYS_MIN'),
    [seedSkills, frequency],
  );

  // ── [Smart Schedule v1.3] Schedule grid state ───────────────────────────
  // Source of truth for the per-day plan. Replaces the legacy `selectedDays`
  // numeric array. `selectedDays` is now derived for downstream gating
  // (canContinue, reward animation triggers) so the rest of the file does
  // not need to know about the new data shape.
  const initialFrequency = data.trainingDays || RECOMMENDED_FREQUENCY;
  const [scheduleGrid, setScheduleGrid] = useState<ScheduleDay[]>(() =>
    rehydrateScheduleGrid({
      scheduleGridSessions: data.scheduleGridSessions,
      scheduleDayIndices: data.scheduleDayIndices,
      seedPrograms,
      seedSkills,
      frequency: initialFrequency,
    }),
  );

  // Derived: which day indices currently have at least one session.
  const selectedDays = useMemo(
    () => scheduleGrid.filter((d) => d.sessions.length > 0).map((d) => d.dayOfWeek as number),
    [scheduleGrid],
  );

  // Live validation — re-runs whenever the grid mutates. `liveWarnings`
  // stays grid-only (it also feeds ScheduleDayBand's per-day highlighting,
  // which initialWarnings has no affectedDays for and shouldn't touch);
  // initialWarnings is merged in only for the errors/warns partition below,
  // so ScheduleWarningsPanel sees both sources through the one stream.
  const liveWarnings = useMemo(() => validateSchedule(scheduleGrid), [scheduleGrid]);
  const { errors: liveErrors, warns: liveWarns } = useMemo(
    () => partitionWarnings([...initialWarnings, ...liveWarnings]),
    [initialWarnings, liveWarnings],
  );

  // Popover state — which day card has its bubble open (-1 = closed).
  const [openPopoverDay, setOpenPopoverDay] = useState<number>(-1);
  const [time, setTime] = useState<string>(data.trainingTime || '18:00');
  // Notification permission is now handled exclusively by the dedicated
  // "notifications" step in LifestyleWizard (which invokes the native
  // FCM pipeline via initPushNotifications + saveNotificationPrefs).
  // The legacy inline Web Notification.requestPermission toggle was
  // removed here to eliminate the dual-API conflict.
  const [calendarSyncEnabled, setCalendarSyncEnabled] = useState<boolean>(() => {
    return (data as any).calendarSyncEnabled ?? true; // ON by default
  });
  const [showRecommendation, setShowRecommendation] = useState<boolean>(false);
  
  // Auto-reveal animation states
  const [showDaysSection, setShowDaysSection] = useState<boolean>(false);
  const [daysPulse, setDaysPulse] = useState<boolean>(false);
  
  // Coin animation states
  const [flyingCoin, setFlyingCoin] = useState<{ 
    startPos: { x: number; y: number } | null;
    endPos: { x: number; y: number } | null;
    amount: number;
  } | null>(null);
  
  // Refs for badge positions
  const frequencyBadgeRef = useRef<HTMLDivElement>(null);
  const daysBadgeRef = useRef<HTMLDivElement>(null);
  const timeBadgeRef = useRef<HTMLDivElement>(null);
  const coinTargetPos = useRef<{ x: number; y: number }>({ x: 50, y: 50 });
  
  useEffect(() => {
    coinTargetPos.current = { 
      x: typeof window !== 'undefined' ? window.innerWidth - 80 : 300,
      y: 80
    };
  }, []);
  
  const triggerCoinFly = (badgeRef: React.RefObject<HTMLDivElement | HTMLButtonElement>, amount: number) => {
    if (!badgeRef.current) return;
    const badgeRect = badgeRef.current.getBoundingClientRect();
    setFlyingCoin({
      startPos: { x: badgeRect.left + badgeRect.width / 2, y: badgeRect.top + badgeRect.height / 2 },
      endPos: coinTargetPos.current,
      amount
    });
  };
  
  const handleCoinFlyComplete = () => setFlyingCoin(null);
  
  // Progressive disclosure - Show time section when days are fully selected
  const [showTimeSection, setShowTimeSection] = useState(false);

  const [hours, minutes] = time.split(':').map(Number);

  // Strict Progressive Disclosure - Auto-reveal Days section after 800ms on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowDaysSection(true);
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  // Show time section with staggered delay after days section appears
  useEffect(() => {
    // Only reveal time section if:
    // 1. Days section is visible
    // 2. AND days selection matches frequency (can continue)
    if (showDaysSection && selectedDays.length === frequency && frequency > 0) {
      if (!showTimeSection) {
        // Wait 400ms after days are ready to reveal time picker
        const timer = setTimeout(() => setShowTimeSection(true), 400);
        return () => clearTimeout(timer);
      }
    } else {
      if (showTimeSection) setShowTimeSection(false);
    }
  }, [showDaysSection, selectedDays.length, frequency, showTimeSection]);

  const handleFrequencySelect = (value: number) => {
    setFrequency(value);
    // Regenerate the schedule grid via the rule engine when frequency changes,
    // using the user's real active programs so the auto-fill is correct.
    setScheduleGrid(buildDefaultTemplate(seedPrograms, seedSkills, value));
    setOpenPopoverDay(-1);
    // Trigger pulse animation on Days section
    setDaysPulse(true);
    setTimeout(() => setDaysPulse(false), 500);
    if (showTimeSection) {
      setShowTimeSection(false);
    }
    if (!hasClaimedReward('SCHEDULE_FREQUENCY_REWARD')) {
      const wasClaimed = claimReward('SCHEDULE_FREQUENCY_REWARD', 20);
      if (wasClaimed) triggerCoinFly(frequencyBadgeRef, 20);
    }
  };

  // ── Day card / popover handlers ──────────────────────────────────────
  const handleDayCardClick = (dayIndex: number) => {
    setOpenPopoverDay((prev) => (prev === dayIndex ? -1 : dayIndex));
  };

  const handleClosePopover = () => setOpenPopoverDay(-1);

  // Toggle a single program/skill on a given day. Maintains the
  // sessions[] array shape and the isRestDay flag.
  const handleSessionToggle = (dayIndex: number, optionId: ScheduleItemId) => {
    setScheduleGrid((prev) =>
      prev.map((day) => {
        if (day.dayOfWeek !== dayIndex) return day;
        const exists = day.sessions.some((s) => s.skillId === optionId);
        const nextSessions = exists
          ? day.sessions.filter((s) => s.skillId !== optionId)
          : [
              ...day.sessions,
              { skillId: optionId, volumePercent: 100, sessionType: 'FULL' as const },
            ];
        return {
          ...day,
          sessions: nextSessions,
          isRestDay: nextSessions.length === 0,
        };
      }),
    );
    if (
      selectedDays.length + 1 === frequency &&
      !hasClaimedReward('SCHEDULE_DAYS_REWARD')
    ) {
      const wasClaimed = claimReward('SCHEDULE_DAYS_REWARD', 30);
      if (wasClaimed) triggerCoinFly(daysBadgeRef, 30);
    }
  };

  // Mark the day as a rest day — clears all sessions.
  const handleSetRestDay = (dayIndex: number) => {
    setScheduleGrid((prev) =>
      prev.map((day) =>
        day.dayOfWeek === dayIndex
          ? { ...day, sessions: [], isRestDay: true }
          : day,
      ),
    );
  };

  // Applies a partial {hours?, minutes?} patch from TrainingTimePicker via a
  // functional updater — reads the latest `prev` at commit time, exactly
  // like the original inline setTime((prevTime) => ...) handlers did. Two
  // taps in the same render cycle (hour, then minute) must not have the
  // second overwrite the first with a stale half — that's what the
  // functional updater (not this component's own hours/minutes props)
  // guards against.
  const handleTimeChange = (patch: { hours?: number; minutes?: number }) => {
    setTime((prev) => {
      const [h, m] = prev.split(':');
      const nextH = patch.hours != null ? String(patch.hours).padStart(2, '0') : h;
      const nextM = patch.minutes != null ? String(patch.minutes).padStart(2, '0') : m;
      return `${nextH}:${nextM}`;
    });
    if (!hasClaimedReward('SCHEDULE_TIME_REWARD')) {
      const wasClaimed = claimReward('SCHEDULE_TIME_REWARD', 20);
      if (wasClaimed) triggerCoinFly(timeBadgeRef, 20);
    }
  };

  const handleContinue = async () => {
    if (selectedDays.length === 0) return;

    const dayMap = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
    const scheduleDays = selectedDays.map((index) => dayMap[index]).sort();

    // ── [Smart Schedule v1.3] UTS Bridge — build recurringTemplate ───────
    // Maps Hebrew day letter → array of program/skill IDs for that day.
    // This is what the UTS hydrator reads to seed userSchedule documents,
    // achieving parity with the running onboarding flow.
    const recurringTemplate: Record<string, string[]> = {};
    const scheduleGridSessions = scheduleGrid.map((d) => ({
      dayOfWeek: d.dayOfWeek as number,
      skillIds: d.sessions.map((s) => s.skillId as string),
    }));
    for (const day of scheduleGrid) {
      if (day.sessions.length === 0) continue;
      const letter = dayMap[day.dayOfWeek];
      // Only the persisted program/skill IDs go into the template.
      // HANDSTAND is intentionally retained as a valid template entry —
      // upstream UTS treats unknown program IDs as opaque pass-through
      // and falls back to lifestyle.scheduleDays when no program matches.
      recurringTemplate[letter] = day.sessions.map((s) => s.skillId as string);
    }

    updateData({
      trainingDays: frequency,
      trainingTime: time,
      scheduleDayIndices: selectedDays,
      scheduleDays: scheduleDays,
      recurringTemplate,
      scheduleGridSessions,
      historyFrequency: historyFreq,
      historyLocations: historyLocs,
      historySports: historySpts,
      ...(calendarSyncEnabled && { calendarSyncEnabled: true } as any),
    });

    await Analytics.logOnboardingStepComplete('SCHEDULE', 0);
    onNext();
  };

  // Can continue when at least one training day is set and there are no
  // hard ERR-level violations from the rule engine. Soft warnings do NOT
  // block — the user is informed but can proceed.
  const canContinue =
    frequency > 0 &&
    selectedDays.length > 0 &&
    liveErrors.length === 0;

  // Recommendation logic — uses the local historyFreq state (synced to store)
  const showRecommendationA = historyFreq === 'none' && frequency >= 3;
  const showRecommendationB = (historyFreq === '1-2' || historyFreq === '3+') && frequency === 1;
  const hasRecommendation = showRecommendationA || showRecommendationB;

  return (
    <div dir="rtl" className="w-full max-w-md mx-auto px-4 py-4 flex flex-col min-h-[100dvh] relative">
      {/* Coin Fly Animation */}
      <AnimatePresence>
        {flyingCoin && (
          <CoinFly
            startPos={flyingCoin.startPos}
            endPos={flyingCoin.endPos}
            amount={flyingCoin.amount}
            onComplete={handleCoinFlyComplete}
          />
        )}
      </AnimatePresence>
      
      {/* Compact Header - Icon Inline with Title */}
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-4"
      >
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 bg-[#5BC2F2]/10 rounded-xl flex items-center justify-center flex-shrink-0">
            <Calendar size={20} className="text-[#5BC2F2]" />
          </div>
          <h2 className="text-xl font-black text-slate-900">
            {isHebrew ? 'מתי נתאמן?' : 'When do we train?'}
          </h2>
        </div>
        <p className="text-sm text-slate-500 mr-[52px]">
          {isHebrew ? 'נתאים את התוכנית לזמינות שלך' : "We'll adapt to your availability"}
        </p>
      </motion.div>

      {/* Collapsible Recommendation ("Smart Tip") */}
      <AnimatePresence>
        {hasRecommendation && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4"
          >
            <button
              onClick={() => setShowRecommendation(!showRecommendation)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 transition-all hover:bg-amber-100"
            >
              <div className="flex items-center gap-2">
                <Lightbulb size={16} className="text-amber-600" />
                <span className="text-sm font-bold">{isHebrew ? 'המלצה שלנו' : 'Our Recommendation'}</span>
              </div>
              <motion.div
                animate={{ rotate: showRecommendation ? 180 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronDown size={18} className="text-amber-600" />
              </motion.div>
            </button>
            
            <AnimatePresence>
              {showRecommendation && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="pt-2 px-3 pb-3 text-sm text-amber-800 bg-amber-50/50 rounded-b-xl border-x border-b border-amber-200 -mt-1">
                    {showRecommendationA && (
                      <p className="font-medium font-simpler">
                        {isHebrew 
                          ? 'היי, שמנו לב שלא התאמנת הרבה זמן. אנחנו ממליצים להתחיל מ-1-2 פעמים בשבוע כדי לבנות בסיס חזק.'
                          : "Hey, we noticed you haven't trained in a while. We recommend starting with 1-2 times a week to build a strong foundation."
                        }
                      </p>
                    )}
                    {showRecommendationB && (
                      <p className="font-medium font-simpler">
                        {t(
                          'שים לב, ראינו שיש לך רקע קודם. אנחנו ממליצים לשלב לפחות 2 אימונים בשבוע. אל תדאג, אנחנו נעזור לך!',
                          'שימי לב, ראינו שיש לך רקע קודם. אנחנו ממליצים לשלב לפחות 2 אימונים בשבוע. אל תדאגי, אנחנו נעזור לך!'
                        )}
                      </p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Deep History Section (merged from HistoryStep) ────────── */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-5 p-4 bg-white rounded-2xl border border-slate-100 shadow-sm text-right space-y-4"
      >
        {/* Q1: Frequency */}
        <div className="space-y-2">
          <h4 className="text-sm font-bold text-slate-800">
            {t('איך נראתה שגרת האימונים שלך בחודש האחרון?', 'איך נראתה שגרת האימונים שלך בחודש האחרון?')}
          </h4>
          <div className="space-y-1.5">
            {FREQ_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const sel = historyFreq === opt.id;
              return (
                <motion.button
                  key={opt.id}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleHistoryFreq(opt.id)}
                  className={`w-full p-3 rounded-xl border transition-all flex items-center gap-3 ${
                    sel ? 'bg-[#00C9F2]/8 border-[#00C9F2]/50' : 'bg-white border-slate-100'
                  }`}
                >
                  <div className={`p-1.5 rounded-lg ${sel ? 'bg-[#00C9F2]/15' : opt.bg}`}>
                    <Icon size={16} className={sel ? 'text-[#00C9F2]' : opt.color} strokeWidth={2} />
                  </div>
                  <span className={`text-sm flex-1 text-right ${sel ? 'font-bold text-slate-900' : 'font-medium text-slate-600'}`}>
                    {opt.label}
                  </span>
                  <div className={`w-4 h-4 rounded-full flex items-center justify-center ${sel ? 'bg-[#00C9F2]' : 'bg-slate-100'}`}>
                    {sel && <Check size={10} className="text-white" strokeWidth={3} />}
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Q2+Q3: Location + Sports (revealed after Q1) */}
        <AnimatePresence>
          {historyDone && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-4 overflow-hidden"
            >
              <div className="h-px bg-slate-100" />
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-slate-800">
                  {t('איפה התאמנת בדרך כלל?', 'איפה התאמנת בדרך כלל?')}
                </h4>
                <div className="flex flex-wrap gap-2">
                  {LOC_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    const sel = historyLocs.includes(opt.id);
                    return (
                      <motion.button
                        key={opt.id}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => toggleHistoryLoc(opt.id)}
                        className={`px-3 py-1.5 rounded-xl border text-sm flex items-center gap-1.5 transition-all ${
                          sel ? 'bg-[#00C9F2]/10 border-[#00C9F2]/50 text-[#00C9F2] font-semibold' : 'bg-white border-slate-100 text-slate-600'
                        }`}
                      >
                        <Icon size={13} strokeWidth={2} />
                        <span>{opt.label}</span>
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-bold text-slate-800">
                  {isHebrew ? 'באילו ענפי ספורט?' : 'Which sports?'}
                </h4>
                <div className="flex flex-wrap gap-2">
                  {SPORT_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    const sel = historySpts.includes(opt.id);
                    return (
                      <motion.button
                        key={opt.id}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => toggleHistorySport(opt.id)}
                        className={`px-3 py-1.5 rounded-xl border text-sm flex items-center gap-1.5 transition-all ${
                          sel ? 'bg-[#00C9F2]/10 border-[#00C9F2]/50 text-[#00C9F2] font-semibold' : 'bg-white border-slate-100 text-slate-600'
                        }`}
                      >
                        <Icon size={13} strokeWidth={2} />
                        <span>{opt.label}</span>
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.section>

      {/* Section 1: Frequency */}
      <section className="mb-5 text-right">
        <div className="flex items-center justify-start gap-2 mb-2">
          {IS_COIN_SYSTEM_ENABLED && (
            <div className="relative" ref={frequencyBadgeRef}>
              <motion.div
                initial={false}
                animate={{ opacity: hasClaimedReward('SCHEDULE_FREQUENCY_REWARD') ? 1 : 0.4 }}
                className={`flex items-center gap-1 rounded-full px-2 py-1 shadow-sm border transition-colors ${
                  hasClaimedReward('SCHEDULE_FREQUENCY_REWARD')
                    ? 'bg-amber-100 text-amber-700 border-amber-200' 
                    : 'bg-gray-100 text-gray-400 border-gray-200'
                }`}
              >
                <Coins size={14} strokeWidth={2.5} />
                <span className="text-xs font-bold font-simpler">
                  {hasClaimedReward('SCHEDULE_FREQUENCY_REWARD') ? '20 🪙' : '+20'}
                </span>
              </motion.div>
            </div>
          )}
          <h3 className="text-base font-bold text-slate-900">
            {isHebrew ? 'כמה פעמים בשבוע?' : 'How many times a week?'}
          </h3>
        </div>
        
        <ScheduleFrequencyPicker
          frequency={frequency}
          recommendedValue={RECOMMENDED_FREQUENCY}
          isHebrew={isHebrew}
          onSelect={handleFrequencySelect}
        />
      </section>

      {/* Section 2: Days Selection - Auto-reveal after 800ms with height animation */}
      <AnimatePresence>
        {showDaysSection && (
      <motion.section
        initial={{ opacity: 0, height: 0, y: 10 }}
        animate={{ 
          opacity: 1, 
          height: 'auto',
          y: 0,
          scale: daysPulse ? [1, 1.02, 1] : 1
        }}
        exit={{ opacity: 0, height: 0, y: -10 }}
        transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
        className="mb-5 text-right overflow-hidden"
      >
        <div className="flex items-center justify-between mb-2">
          {/* Right side: Title with coin badge */}
          <div className="flex items-center gap-2">
            {IS_COIN_SYSTEM_ENABLED && (
              <div className="relative" ref={daysBadgeRef}>
                <motion.div
                  initial={false}
                  animate={{ opacity: hasClaimedReward('SCHEDULE_DAYS_REWARD') ? 1 : 0.4 }}
                  className={`flex items-center gap-1 rounded-full px-2 py-1 shadow-sm border transition-colors ${
                    hasClaimedReward('SCHEDULE_DAYS_REWARD')
                      ? 'bg-amber-100 text-amber-700 border-amber-200' 
                      : 'bg-gray-100 text-gray-400 border-gray-200'
                  }`}
                >
                  <Coins size={14} strokeWidth={2.5} />
                  <span className="text-xs font-bold font-simpler">
                    {hasClaimedReward('SCHEDULE_DAYS_REWARD') ? '30 🪙' : '+30'}
                  </span>
                </motion.div>
              </div>
            )}
            <h3 className="text-base font-bold text-slate-900">
              {isHebrew ? 'באילו ימים?' : 'Which days?'}
            </h3>
          </div>
          
          {/* Left side: Calendar Sync Toggle (inline) - Delicate styling */}
          <button
            onClick={() => {
              // Local-only until handleContinue's consolidated write — see
              // the note above handleHistoryFreq.
              setCalendarSyncEnabled(!calendarSyncEnabled);
            }}
            className={`flex items-center gap-1 px-2 py-1 rounded-md transition-all duration-200 ${
              calendarSyncEnabled 
                ? 'bg-[#5BC2F2]/10 text-[#5BC2F2]' 
                : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
            }`}
          >
            <RefreshCw size={10} strokeWidth={1.5} className={calendarSyncEnabled ? 'text-[#5BC2F2]' : 'text-slate-400'} />
            <span className="text-[11px] font-medium">{isHebrew ? 'סנכרון ליומן' : 'Sync'}</span>
            {/* Subtle check mark indicator */}
            <div className={`w-3 h-3 rounded-full flex items-center justify-center transition-all ${
              calendarSyncEnabled 
                ? 'bg-[#5BC2F2]' 
                : 'bg-slate-200'
            }`}>
              {calendarSyncEnabled && <Check size={7} className="text-white" strokeWidth={2.5} />}
            </div>
          </button>
        </div>
        
        <p className={`text-xs font-bold mb-2 ${
          selectedDays.length === frequency ? 'text-green-600' : 'text-orange-500'
        }`}>
          {isHebrew
            ? `נבחרו ${selectedDays.length} מתוך ${frequency} ימים`
            : `${selectedDays.length} of ${frequency} days selected`}
        </p>

        <ScheduleDayBand
          scheduleGrid={scheduleGrid}
          openPopoverDay={openPopoverDay}
          activeWizardOptions={activeWizardOptions}
          liveWarnings={liveWarnings}
          isHebrew={isHebrew}
          onDayCardClick={handleDayCardClick}
          onSessionToggle={handleSessionToggle}
          onSetRestDay={handleSetRestDay}
          onClosePopover={handleClosePopover}
        />

        <ScheduleWarningsPanel
          liveErrors={liveErrors}
          liveWarns={liveWarns}
          isHebrew={isHebrew}
        />
      </motion.section>
        )}
      </AnimatePresence>

      {/* Section 3: Time Picker - Progressive Disclosure with height animation */}
      <AnimatePresence>
        {showTimeSection && (
          <motion.section
            initial={{ opacity: 0, height: 0, y: 10 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: -10 }}
            transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
            className="mb-5 text-right overflow-hidden"
          >
            <div className="flex items-center gap-2 mb-3">
              {IS_COIN_SYSTEM_ENABLED && (
                <div className="relative" ref={timeBadgeRef}>
                  <motion.div
                    initial={false}
                    animate={{ opacity: hasClaimedReward('SCHEDULE_TIME_REWARD') ? 1 : 0.4 }}
                    className={`flex items-center gap-1 rounded-full px-2 py-1 shadow-sm border transition-colors ${
                      hasClaimedReward('SCHEDULE_TIME_REWARD')
                        ? 'bg-amber-100 text-amber-700 border-amber-200'
                        : 'bg-gray-100 text-gray-400 border-gray-200'
                    }`}
                  >
                    <Coins size={14} strokeWidth={2.5} />
                    <span className="text-xs font-bold font-simpler">
                      {hasClaimedReward('SCHEDULE_TIME_REWARD') ? '20 🪙' : '+20'}
                    </span>
                  </motion.div>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Clock size={16} className="text-[#5BC2F2]" />
                <h3 className="text-base font-bold text-slate-900">
                  {isHebrew
                    ? t('באיזו שעה אתה מתאמן?', 'באיזו שעה את מתאמנת?')
                    : 'What time do you train?'
                  }
                </h3>
              </div>
            </div>
            
            <TrainingTimePicker
              hours={hours}
              minutes={minutes}
              onTimeChange={handleTimeChange}
            />
          </motion.section>
        )}
      </AnimatePresence>

      {/* Section 4 removed - Calendar Sync & Reminders are now inline in their respective section headers */}

      {/* Spacer */}
      <div className="flex-grow"></div>

      <StickyActionButton
        variant="premium"
        label={isJIT
          ? (savedLanguage === 'he' ? 'שמירת שינויים' : 'Save Changes')
          : isLastStep
            ? (savedLanguage === 'he' ? 'בואו נתחיל!' : "Let's Go!")
            : (savedLanguage === 'he' ? t('המשך', 'המשיכי') : locale.common.continue)}
        successLabel={isJIT
          ? (savedLanguage === 'he' ? 'הלו״ז עודכן!' : 'Schedule Updated!')
          : undefined}
        disabled={!canContinue}
        onPress={handleContinue}
      />
    </div>
  );
}
