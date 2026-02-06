'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Coins, Check, Calendar, Clock, ChevronDown, Lightbulb, Bell, RefreshCw } from 'lucide-react';
import { useOnboardingStore } from '../../store/useOnboardingStore';
import { getOnboardingLocale, type OnboardingLanguage } from '@/lib/i18n/onboarding-locales';
import { Analytics } from '@/features/analytics/AnalyticsService';
import { IS_COIN_SYSTEM_ENABLED } from '@/config/feature-flags';

interface ScheduleStepProps {
  onNext: () => void;
}

const DAYS_HEBREW = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

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


export default function ScheduleStep({ onNext }: ScheduleStepProps) {
  const { updateData, data, claimReward, hasClaimedReward, coins } = useOnboardingStore();
  
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

  // Recommended frequency (default 3, can be based on goal)
  const RECOMMENDED_FREQUENCY = 3;
  
  // State - Default to recommended frequency
  const [frequency, setFrequency] = useState<number>(data.trainingDays || RECOMMENDED_FREQUENCY);
  const [selectedDays, setSelectedDays] = useState<number[]>(() => {
    if (data.scheduleDayIndices && data.scheduleDayIndices.length > 0) {
      return data.scheduleDayIndices;
    }
    // Pre-select smart default days for recommended frequency
    return [0, 2, 4]; // Sun, Tue, Thu for 3 days
  });
  const [time, setTime] = useState<string>(data.trainingTime || '18:00');
  // Initialize toggle states - BOTH ON by default for recommended experience
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(() => {
    return (data as any).notificationsEnabled ?? true;
  });
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
  const notificationBadgeRef = useRef<HTMLButtonElement>(null);
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

  // Smart default day selection
  const getSmartDefaultDays = (freq: number): number[] => {
    switch (freq) {
      case 2: return [0, 3];
      case 3: return [0, 2, 4];
      case 4: return [0, 1, 3, 4];
      case 5: return [0, 1, 2, 4, 5];
      case 6: return [0, 1, 2, 3, 4, 5];
      default: return Array.from({ length: Math.min(freq, 7) }, (_, i) => i);
    }
  };

  // Strict Progressive Disclosure - Auto-reveal Days section after 800ms on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowDaysSection(true);
    }, 800);
    return () => clearTimeout(timer);
  }, []);
  
  // Initialize selectedDays if empty
  useEffect(() => {
    if (selectedDays.length === 0 && frequency > 0) {
      setSelectedDays(getSmartDefaultDays(frequency));
    }
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
    if (selectedDays.length !== value) {
      setSelectedDays(getSmartDefaultDays(value));
      // Trigger pulse animation on Days section
      setDaysPulse(true);
      setTimeout(() => setDaysPulse(false), 500);
    }
    if (showTimeSection && selectedDays.length !== value) {
      setShowTimeSection(false);
    }
    if (!hasClaimedReward('SCHEDULE_FREQUENCY_REWARD')) {
      const wasClaimed = claimReward('SCHEDULE_FREQUENCY_REWARD', 20);
      if (wasClaimed) triggerCoinFly(frequencyBadgeRef, 20);
    }
  };

  const handleDayToggle = (dayIndex: number) => {
    let newSelectedDays: number[];
    
    if (selectedDays.includes(dayIndex)) {
      if (selectedDays.length <= 1) return;
      newSelectedDays = selectedDays.filter((i) => i !== dayIndex);
    } else {
      if (selectedDays.length >= frequency) {
        newSelectedDays = [...selectedDays.slice(0, -1), dayIndex];
      } else {
        newSelectedDays = [...selectedDays, dayIndex];
      }
    }
    
    setSelectedDays(newSelectedDays);
    
    if (newSelectedDays.length === frequency && !hasClaimedReward('SCHEDULE_DAYS_REWARD')) {
      const wasClaimed = claimReward('SCHEDULE_DAYS_REWARD', 30);
      if (wasClaimed) triggerCoinFly(daysBadgeRef, 30);
    }
  };

  const handleContinue = async () => {
    if (selectedDays.length !== frequency) return;

    const dayMap = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
    const scheduleDays = selectedDays.map(index => dayMap[index]).sort();

    updateData({
      trainingDays: frequency,
      trainingTime: time,
      scheduleDayIndices: selectedDays,
      scheduleDays: scheduleDays,
      ...(notificationsEnabled && { notificationsEnabled: true } as any),
      ...(calendarSyncEnabled && { calendarSyncEnabled: true } as any),
    });

    await Analytics.logOnboardingStepComplete('SCHEDULE', 0);
    onNext();
  };

  // Can continue when frequency and days are set - time is pre-selected, no need to wait for reward
  const canContinue = 
    frequency > 0 && 
    selectedDays.length === frequency;

  // Recommendation logic
  const historyFrequency = data.historyFrequency || '';
  const showRecommendationA = historyFrequency === 'none' && frequency >= 3;
  const showRecommendationB = (historyFrequency === '1-2' || historyFrequency === '3+') && frequency === 1;
  const hasRecommendation = showRecommendationA || showRecommendationB;

  return (
    <div dir="rtl" className="w-full max-w-md mx-auto px-4 py-4 flex flex-col min-h-screen relative">
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
        
        <div className="flex flex-wrap justify-center gap-2">
          {[1, 2, 3, 4, 5, 6, 7].map((num) => {
            const isRecommended = num === RECOMMENDED_FREQUENCY;
            const isSelected = frequency === num;
            
            return (
              <div key={num} className="relative">
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => handleFrequencySelect(num)}
                  className={`w-11 h-11 flex items-center justify-center rounded-2xl text-lg transition-all duration-200 ${
                    isSelected
                      ? 'bg-[#5BC2F2] text-white shadow-[0_4px_12px_rgba(91,194,242,0.2)]'
                      : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
                  }`}
                  style={{ fontFamily: 'var(--font-simpler)', fontWeight: isSelected ? 700 : 500 }}
                >
                  {num}
                </motion.button>
                
                {/* "מומלץ עבורך" badge for recommended frequency */}
                {isRecommended && isSelected && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap"
                  >
                    <span 
                      className="text-[10px] px-2 py-0.5 rounded-full bg-[#5BC2F2]/10 text-[#5BC2F2]"
                      style={{ fontWeight: 600 }}
                    >
                      {isHebrew ? 'מומלץ עבורך' : 'Recommended'}
                    </span>
                  </motion.div>
                )}
              </div>
            );
          })}
        </div>
        
        {/* Spacer for the badge */}
        <div className="h-3" />
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
              const newValue = !calendarSyncEnabled;
              setCalendarSyncEnabled(newValue);
              // Sync to store immediately
              updateData({ calendarSyncEnabled: newValue } as any);
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
            : `${selectedDays.length} of ${frequency} days selected`
          }
        </p>
        
        <div className="flex flex-wrap justify-center gap-2">
          {DAYS_HEBREW.map((day, index) => {
            const isSelected = selectedDays.includes(index);
            return (
              <motion.button
                key={index}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => handleDayToggle(index)}
                className={`w-11 h-11 flex items-center justify-center rounded-xl text-lg transition-all duration-200 ${
                  isSelected
                    ? 'bg-[#5BC2F2] text-white shadow-[0_4px_12px_rgba(91,194,242,0.2)]'
                    : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
                }`}
                style={{ fontFamily: 'var(--font-simpler)', fontWeight: isSelected ? 700 : 500 }}
              >
                {day}
              </motion.button>
            );
          })}
        </div>
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
            <div className="flex items-center justify-between mb-3">
              {/* Right side: Title with coin badge */}
              <div className="flex items-center gap-2">
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
              
              {/* Left side: Reminders Toggle (inline) - Delicate styling */}
              <button
                onClick={async () => {
                  if (notificationsEnabled) {
                    setNotificationsEnabled(false);
                    // Sync to store immediately
                    updateData({ notificationsEnabled: false } as any);
                    return;
                  }
                  
                  if ('Notification' in window && window.Notification) {
                    try {
                      let permission = Notification.permission;
                      if (permission === 'default') {
                        try {
                          permission = await Notification.requestPermission();
                        } catch {
                          setNotificationsEnabled(true);
                          updateData({ notificationsEnabled: true } as any);
                          return;
                        }
                      }
                      
                      if (permission === 'granted') {
                        setNotificationsEnabled(true);
                        updateData({ notificationsEnabled: true } as any);
                        if (!hasClaimedReward('SCHEDULE_NOTIFICATION_REWARD')) {
                          const wasClaimed = claimReward('SCHEDULE_NOTIFICATION_REWARD', 100);
                          if (wasClaimed) triggerCoinFly(notificationBadgeRef, 100);
                        }
                      } else if (permission === 'denied') {
                        setNotificationsEnabled(false);
                        updateData({ notificationsEnabled: false } as any);
                      } else {
                        setNotificationsEnabled(true);
                        updateData({ notificationsEnabled: true } as any);
                      }
                    } catch {
                      setNotificationsEnabled(true);
                      updateData({ notificationsEnabled: true } as any);
                    }
                  } else {
                    setNotificationsEnabled(true);
                    updateData({ notificationsEnabled: true } as any);
                  }
                }}
                className={`flex items-center gap-1 px-2 py-1 rounded-md transition-all duration-200 ${
                  notificationsEnabled 
                    ? 'bg-amber-50 text-amber-700' 
                    : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                }`}
                ref={notificationBadgeRef}
              >
                <Bell size={10} strokeWidth={1.5} className={notificationsEnabled ? 'text-amber-600' : 'text-slate-400'} />
                <span className="text-[11px] font-medium">{isHebrew ? 'תזכורת' : 'Reminder'}</span>
                {/* Subtle check mark indicator */}
                <div className={`w-3 h-3 rounded-full flex items-center justify-center transition-all ${
                  notificationsEnabled 
                    ? 'bg-amber-500' 
                    : 'bg-slate-200'
                }`}>
                  {notificationsEnabled && <Check size={7} className="text-white" strokeWidth={2.5} />}
                </div>
              </button>
            </div>
            
            {/* Time Picker - Fixed: HH : MM (Hours LEFT, Minutes RIGHT) */}
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
                        onClick={() => {
                          setTime((prevTime) => {
                            const [, prevMinutes] = prevTime.split(':');
                            return `${String(displayHour).padStart(2, '0')}:${prevMinutes}`;
                          });
                          if (!hasClaimedReward('SCHEDULE_TIME_REWARD')) {
                            const wasClaimed = claimReward('SCHEDULE_TIME_REWARD', 20);
                            if (wasClaimed) triggerCoinFly(timeBadgeRef, 20);
                          }
                        }}
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
                    Math.round(minutes / 5) * 5 + 5
                  ].map((m, idx) => {
                    let displayMinute = m;
                    if (m < 0) displayMinute = 55;
                    else if (m > 55) displayMinute = 0;
                    const roundedMinutes = Math.round(minutes / 5) * 5;
                    const isSelected = displayMinute === roundedMinutes;
                    return (
                      <button
                        key={`min-${displayMinute}-${idx}`}
                        onClick={() => {
                          setTime((prevTime) => {
                            const [prevHours] = prevTime.split(':');
                            return `${prevHours}:${String(displayMinute).padStart(2, '0')}`;
                          });
                          if (!hasClaimedReward('SCHEDULE_TIME_REWARD')) {
                            const wasClaimed = claimReward('SCHEDULE_TIME_REWARD', 20);
                            if (wasClaimed) triggerCoinFly(timeBadgeRef, 20);
                          }
                        }}
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
          </motion.section>
        )}
      </AnimatePresence>

      {/* Section 4 removed - Calendar Sync & Reminders are now inline in their respective section headers */}

      {/* Spacer */}
      <div className="flex-grow"></div>

      {/* Footer - Continue Button with Pulse Animation */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="mt-auto pt-4 pb-6"
      >
        <motion.button
          onClick={handleContinue}
          disabled={!canContinue}
          animate={canContinue ? {
            boxShadow: [
              '0 10px 25px rgba(91, 194, 242, 0.3)',
              '0 15px 35px rgba(91, 194, 242, 0.5)',
              '0 10px 25px rgba(91, 194, 242, 0.3)',
            ],
          } : {}}
          transition={canContinue ? {
            boxShadow: {
              repeat: Infinity,
              duration: 2,
              ease: 'easeInOut',
            },
          } : {}}
          className={`w-full font-black py-4 rounded-2xl text-lg transition-all duration-300 ${
            canContinue 
              ? 'bg-[#5BC2F2] hover:bg-[#4AADE3] text-white hover:scale-[1.02] active:scale-[0.98]' 
              : 'bg-slate-200 text-slate-400 cursor-not-allowed'
          }`}
        >
          {locale.common.continue}
        </motion.button>
      </motion.div>
    </div>
  );
}
