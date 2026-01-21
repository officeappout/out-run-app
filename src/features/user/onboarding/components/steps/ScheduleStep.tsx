'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Coins, Check } from 'lucide-react';
import { useOnboardingStore } from '../../store/useOnboardingStore';
import { getOnboardingLocale, type OnboardingLanguage } from '@/lib/i18n/onboarding-locales';
import { Analytics } from '@/features/analytics/AnalyticsService';

interface ScheduleStepProps {
  onNext: () => void;
}

const DAYS_HEBREW = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

// Coin Fly Animation Component
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
  if (!startPos || !endPos) return null;

  return (
    <motion.div
      initial={{ 
        x: startPos.x - 30, // Center the coin on the badge
        y: startPos.y - 12,
        scale: 1,
        opacity: 1
      }}
      animate={{ 
        x: endPos.x - 30, // Center the coin on the target
        y: endPos.y - 12,
        scale: [1, 1.3, 0.8],
        opacity: [1, 1, 0]
      }}
      exit={{ opacity: 0, scale: 0 }}
      transition={{ 
        duration: 0.9,
        ease: [0.25, 0.46, 0.45, 0.94], // Creates smooth curved arc effect
      }}
      onAnimationComplete={onComplete}
      className="fixed pointer-events-none z-[9999]"
      style={{ 
        left: 0, 
        top: 0,
        pointerEvents: 'none' // Force pointer-events none
      }}
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

  // Get gender from sessionStorage
  const gender = typeof window !== 'undefined'
    ? (sessionStorage.getItem('onboarding_personal_gender') || 'male') as 'male' | 'female'
    : 'male';
  
  // Gender-aware translation helper
  const t = (male: string, female: string) => gender === 'female' ? female : male;

  // State
  const [frequency, setFrequency] = useState<number>(data.trainingDays || 3);
  const [selectedDays, setSelectedDays] = useState<number[]>(() => {
    // Initialize from existing data or default to first N days
    if (data.trainingDays) {
      return Array.from({ length: Math.min(data.trainingDays, 7) }, (_, i) => i);
    }
    return [];
  });
  const [time, setTime] = useState<string>(data.trainingTime || '18:00');
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(true); // Default to checked (dev bypass)
  
  // Coin animation states
  const [flyingCoin, setFlyingCoin] = useState<{ 
    startPos: { x: number; y: number } | null;
    endPos: { x: number; y: number } | null;
    amount: number;
  } | null>(null);
  
  // Refs for badge positions (for coin fly animation)
  const frequencyBadgeRef = useRef<HTMLDivElement>(null);
  const daysBadgeRef = useRef<HTMLDivElement>(null);
  const timeBadgeRef = useRef<HTMLDivElement>(null);
  const notificationBadgeRef = useRef<HTMLDivElement>(null);
  
  // Target position for coins (top-right corner where counter would be)
  const coinTargetPos = useRef<{ x: number; y: number }>({ x: 50, y: 50 });
  
  // Update target position on mount
  useEffect(() => {
    // Target is top-right corner (adjust based on your header layout)
    coinTargetPos.current = { 
      x: typeof window !== 'undefined' ? window.innerWidth - 80 : 300,
      y: 80
    };
  }, []);
  
  // Trigger coin fly animation
  const triggerCoinFly = (badgeRef: React.RefObject<HTMLDivElement>, amount: number) => {
    if (!badgeRef.current) return;
    
    const badgeRect = badgeRef.current.getBoundingClientRect();
    const startPos = {
      x: badgeRect.left + badgeRect.width / 2,
      y: badgeRect.top + badgeRect.height / 2
    };
    
    setFlyingCoin({
      startPos,
      endPos: coinTargetPos.current,
      amount
    });
  };
  
  // Handle coin fly complete
  const handleCoinFlyComplete = () => {
    setFlyingCoin(null);
  };
  
  // Progressive disclosure states
  const [showDaysSection, setShowDaysSection] = useState(false);
  const [showTimeSection, setShowTimeSection] = useState(false);

  // Derived variables - parse time
  const [hours, minutes] = time.split(':').map(Number);

  // Smart default day selection based on frequency (with rest day logic)
  const getSmartDefaultDays = (freq: number): number[] => {
    switch (freq) {
      case 2: return [0, 3]; // Sunday (א) and Wednesday (ד)
      case 3: return [0, 2, 4]; // Sunday (א), Tuesday (ג), Thursday (ה)
      case 4: return [0, 1, 3, 4]; // Sunday (א), Monday (ב), Wednesday (ד), Thursday (ה)
      case 5: return [0, 1, 2, 4, 5]; // Sunday (א), Monday (ב), Tuesday (ג), Thursday (ה), Friday (ו)
      case 6: return [0, 1, 2, 3, 4, 5]; // Sun-Fri (Saturday ש as rest day)
      default: return Array.from({ length: Math.min(freq, 7) }, (_, i) => i);
    }
  };

  // Initialize selectedDays from frequency if not set
  useEffect(() => {
    if (selectedDays.length === 0 && frequency > 0) {
      setSelectedDays(getSmartDefaultDays(frequency));
    }
  }, []);

  // Progressive disclosure: Show/hide time section based on days matching frequency
  useEffect(() => {
    if (selectedDays.length === frequency && frequency > 0) {
      // Show time section after 600ms if days match
      if (!showTimeSection) {
        const timer = setTimeout(() => {
          setShowTimeSection(true);
        }, 600);
        return () => clearTimeout(timer);
      }
    } else {
      // Hide time section immediately if days don't match
      if (showTimeSection) {
        setShowTimeSection(false);
      }
    }
  }, [selectedDays.length, frequency, showTimeSection]);

  // Handle frequency selection
  const handleFrequencySelect = (value: number) => {
    setFrequency(value);
    // Auto-select smart default days if current selection is empty or doesn't match
    if (selectedDays.length !== value) {
      setSelectedDays(getSmartDefaultDays(value));
    }
    
    // Hide time section when frequency changes (will show again if days match)
    if (showTimeSection && selectedDays.length !== value) {
      setShowTimeSection(false);
    }
    
    // Trigger coin animation and award coins only once using claimReward
    if (!hasClaimedReward('SCHEDULE_FREQUENCY_REWARD')) {
      const wasClaimed = claimReward('SCHEDULE_FREQUENCY_REWARD', 20);
      if (wasClaimed) {
        triggerCoinFly(frequencyBadgeRef, 20);
      }
    }
    
    // Progressive disclosure: Show days section after 600ms
    if (!showDaysSection) {
      setTimeout(() => {
        setShowDaysSection(true);
      }, 600);
    }
  };

  // Handle day toggle
  const handleDayToggle = (dayIndex: number) => {
    let newSelectedDays: number[];
    
    if (selectedDays.includes(dayIndex)) {
      // Allow deselecting - user can swap days
      // Only prevent if we're trying to go below 1 day
      if (selectedDays.length <= 1) {
        return; // Must have at least 1 day selected
      }
      newSelectedDays = selectedDays.filter((i) => i !== dayIndex);
    } else {
      // Allow selecting up to frequency, but if at max, replace the last one
      if (selectedDays.length >= frequency) {
        // Replace the last selected day with the new one
        newSelectedDays = [...selectedDays.slice(0, -1), dayIndex];
      } else {
        newSelectedDays = [...selectedDays, dayIndex];
      }
    }
    
    setSelectedDays(newSelectedDays);
    
    // Trigger coin animation and award coins only once using claimReward
    if (newSelectedDays.length === frequency && !hasClaimedReward('SCHEDULE_DAYS_REWARD')) {
      const wasClaimed = claimReward('SCHEDULE_DAYS_REWARD', 30);
      if (wasClaimed) {
        triggerCoinFly(daysBadgeRef, 30);
      }
    }
    
    // Time section visibility is handled by useEffect based on selectedDays.length === frequency
  };


  // Handle notification toggle - request permission first (Desktop-friendly with fallback)
  const handleNotificationToggle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const isChecked = e.target.checked;
    
    // If unchecking, just toggle the state
    if (!isChecked) {
      setNotificationsEnabled(false);
      return;
    }

    // If checking, request permission first
    if ('Notification' in window && window.Notification) {
      try {
        let permission = Notification.permission;
        
        // Request permission if not already asked
        if (permission === 'default') {
          try {
            permission = await Notification.requestPermission();
          } catch (permError) {
            console.warn('Permission request failed, using fallback:', permError);
            // Fallback: Allow toggle for development/testing
            setNotificationsEnabled(true);
            return;
          }
        }
        
        if (permission === 'granted') {
          setNotificationsEnabled(true);
          // Award coins only if permission was granted using claimReward
          if (!hasClaimedReward('SCHEDULE_NOTIFICATION_REWARD')) {
            const wasClaimed = claimReward('SCHEDULE_NOTIFICATION_REWARD', 100);
            if (wasClaimed) {
              triggerCoinFly(notificationBadgeRef, 100);
            }
          }
        } else if (permission === 'denied') {
          // Permission denied - keep checkbox unchecked
          setNotificationsEnabled(false);
          // Reset the checkbox visually
          e.target.checked = false;
        } else {
          // Default state or unknown - allow toggle as fallback
          setNotificationsEnabled(true);
        }
      } catch (error) {
        console.error('Error requesting notification permission:', error);
        // Fallback: Allow toggle even if permission request fails
        setNotificationsEnabled(true);
      }
    } else {
      // Notifications not supported - allow toggle for testing
      setNotificationsEnabled(true);
    }
  };

  // Handle continue
  const handleContinue = async () => {
    // Validate
    if (selectedDays.length !== frequency) {
      return;
    }

    // Convert selected day indices to Hebrew day letters
    const dayMap = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
    const scheduleDays = selectedDays.map(index => dayMap[index]).sort();

    // Save to store - include both frequency and actual selected days
    updateData({
      trainingDays: frequency,
      trainingTime: time,
      scheduleDayIndices: selectedDays, // Save indices for reference
      scheduleDays: scheduleDays, // Save Hebrew day letters
      ...(notificationsEnabled && { notificationsEnabled: true } as any),
    });

    // Log analytics
    await Analytics.logOnboardingStepComplete('SCHEDULE', 0);
    
    // Don't add coins here - they should have been awarded when selections were made
    // Only add notification bonus if it wasn't already awarded
    // (Individual rewards are already handled in their respective handlers)
    
    // Move to next step
    onNext();
  };

  // Validation - All conditions must be met:
  // 1. Frequency is selected (always true if frequency > 0, but checking explicitly)
  // 2. Days match the frequency
  // 3. Time is selected (time is always set, but checking if user has interacted)
  // 4. Smart Reminders checkbox is checked
  const canContinue = 
    frequency > 0 && 
    selectedDays.length === frequency && 
    hasClaimedReward('SCHEDULE_TIME_REWARD') && // Time has been selected/interacted with
    notificationsEnabled; // Smart Reminders must be checked

  // Get history frequency for smart recommendations
  const historyFrequency = data.historyFrequency || '';
  
  // Calculate recommendation messages
  const showRecommendationA = historyFrequency === 'none' && frequency >= 3;
  const showRecommendationB = (historyFrequency === '1-2' || historyFrequency === '3+') && frequency === 1;
  

  return (
    <div dir="rtl" className="w-full max-w-md mx-auto px-6 py-6 pb-8 flex flex-col min-h-screen bg-white relative">
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
      {/* Header */}
      <div className="pt-4 mb-8">
        {/* Progress Dots - 4/6 active (Dots only, no background bars) */}
        <div className="flex gap-2 mb-6 justify-center">
          <div className="w-2 h-2 bg-[#60A5FA] rounded-full"></div>
          <div className="w-2 h-2 bg-[#60A5FA] rounded-full"></div>
          <div className="w-2 h-2 bg-[#60A5FA] rounded-full"></div>
          <div className="w-2 h-2 bg-[#60A5FA] rounded-full"></div>
          <div className="w-2 h-2 bg-gray-200 rounded-full"></div>
          <div className="w-2 h-2 bg-gray-200 rounded-full"></div>
        </div>
        
        {/* Title */}
        <div className="relative flex justify-center items-center">
          <h1 className="text-4xl font-extrabold tracking-tighter text-[#60A5FA]">OUT</h1>
        </div>
      </div>

      {/* Section 1: Frequency */}
      <section className="mb-10 text-right">
        <div className="flex items-center justify-start gap-2 mb-1">
          <div className="relative">
            <motion.div
              initial={false}
              animate={{
                opacity: hasClaimedReward('SCHEDULE_FREQUENCY_REWARD') ? 1 : 0.4,
              }}
              transition={{
                opacity: { duration: 0.3 },
                scale: { duration: 0.4, times: [0, 0.5, 1] }
              }}
              className={`flex items-center gap-1 rounded-full px-2 py-1 shadow-sm border transition-colors ${
                hasClaimedReward('SCHEDULE_FREQUENCY_REWARD')
                  ? 'bg-amber-100 text-amber-700 border-amber-200' 
                  : 'bg-gray-100 text-gray-400 border-gray-200'
              }`}
            >
              <Coins size={14} className={hasClaimedReward('SCHEDULE_FREQUENCY_REWARD') ? 'text-amber-700' : 'text-gray-400'} strokeWidth={2.5} />
              <span className={`text-xs font-bold font-simpler ${hasClaimedReward('SCHEDULE_FREQUENCY_REWARD') ? 'text-amber-700' : 'text-gray-400'}`}>
                {hasClaimedReward('SCHEDULE_FREQUENCY_REWARD') ? '20 🪙' : '+20'}
              </span>
            </motion.div>
          </div>
          <h2 className="text-xl font-bold text-slate-900">כמה פעמים בשבוע נוח לך להתאמן?</h2>
        </div>
        <p className="text-sm text-slate-500 mb-4">ניתן לבחור מטרה אחת</p>
        <div className="flex flex-wrap justify-center gap-2">
          {[1, 2, 3, 4, 5, 6, 7].map((num) => (
            <motion.button
              key={num}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleFrequencySelect(num)}
              className={`w-14 h-14 flex items-center justify-center bg-white border rounded-xl shadow-lg text-2xl font-bold transition-all ${
                frequency === num
                  ? 'border-2 border-[#60A5FA] ring-2 ring-[#60A5FA]/10 text-[#60A5FA]'
                  : 'border-slate-100 text-slate-700'
              }`}
            >
              {num}
            </motion.button>
          ))}
        </div>
        
        {/* Conditional Recommendation A: Long break + 3+ days */}
        <AnimatePresence>
          {showRecommendationA && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="mt-4 p-4 bg-orange-50 border border-orange-200 rounded-xl text-sm text-orange-800"
            >
              <p className="font-medium font-simpler">
                היי, שמנו לב שלא התאמנת הרבה זמן. אנחנו ממליצים להתחיל מ-1-2 פעמים בשבוע כדי לבנות בסיס חזק.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Conditional Recommendation B: Active background + only 1 day */}
        <AnimatePresence>
          {showRecommendationB && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="mt-4 p-4 bg-orange-50 border border-orange-200 rounded-xl text-sm text-orange-800"
            >
              <p className="font-medium font-simpler">
                {t(
                  'שימו לב, ראינו שיש לך רקע קודם. אנחנו ממליצים לשלב לפחות 2 אימונים בשבוע. אל תדאג, אנחנו נעזור לך!',
                  'שימי לב, ראינו שיש לך רקע קודם. אנחנו ממליצים לשלב לפחות 2 אימונים בשבוע. אל תדאגי, אנחנו נעזור לך!'
                )}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* Section 2: Days Selection - Progressive Disclosure */}
      <AnimatePresence>
        {showDaysSection && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="mb-10 text-right"
          >
        <div className="flex items-center justify-start gap-2 mb-1">
          <div className="relative" ref={daysBadgeRef}>
            <motion.div
              initial={false}
              animate={{
                opacity: hasClaimedReward('SCHEDULE_DAYS_REWARD') ? 1 : 0.4,
              }}
              transition={{
                opacity: { duration: 0.3 },
                scale: { duration: 0.4, times: [0, 0.5, 1] }
              }}
              className={`flex items-center gap-1 rounded-full px-2 py-1 shadow-sm border transition-colors ${
                hasClaimedReward('SCHEDULE_DAYS_REWARD')
                  ? 'bg-amber-100 text-amber-700 border-amber-200' 
                  : 'bg-gray-100 text-gray-400 border-gray-200'
              }`}
            >
              <Coins size={14} className={hasClaimedReward('SCHEDULE_DAYS_REWARD') ? 'text-amber-700' : 'text-gray-400'} strokeWidth={2.5} />
              <span className={`text-xs font-bold font-simpler ${hasClaimedReward('SCHEDULE_DAYS_REWARD') ? 'text-amber-700' : 'text-gray-400'}`}>
                {hasClaimedReward('SCHEDULE_DAYS_REWARD') ? '30 🪙' : '+30'}
              </span>
            </motion.div>
          </div>
          <h2 className="text-xl font-bold text-slate-900">באילו ימים?</h2>
        </div>
        <p className={`text-sm font-bold mb-4 ${
            selectedDays.length === frequency 
              ? 'text-green-600' 
              : 'text-orange-500'
          }`}>
          נבחרו {selectedDays.length} מתוך {frequency} ימים
        </p>
        <p className="text-sm text-slate-500 mb-4">מומלץ לנוח בין 24-48 שעות בין האימונים.</p>
        <div className="flex flex-wrap justify-center gap-2">
          {DAYS_HEBREW.map((day, index) => {
            const isSelected = selectedDays.includes(index);
            return (
              <motion.button
                key={index}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleDayToggle(index)}
                className={`w-14 h-14 flex items-center justify-center bg-white border rounded-xl shadow-lg text-2xl font-bold transition-all ${
                  isSelected
                    ? 'border-2 border-[#60A5FA] text-[#60A5FA]'
                    : 'border-slate-100 text-slate-700'
                }`}
              >
                {day}
              </motion.button>
            );
          })}
        </div>
      </motion.section>
        )}
      </AnimatePresence>

      {/* Section 3: Time Picker - Progressive Disclosure */}
      <AnimatePresence>
        {showTimeSection && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="mb-6 text-right"
          >
        <div className="flex items-center justify-start gap-2 mb-6">
          <div className="relative" ref={timeBadgeRef}>
            <motion.div
              initial={false}
              animate={{
                opacity: hasClaimedReward('SCHEDULE_TIME_REWARD') ? 1 : 0.4,
              }}
              transition={{
                opacity: { duration: 0.3 },
                scale: { duration: 0.4, times: [0, 0.5, 1] }
              }}
              className={`flex items-center gap-1 rounded-full px-2 py-1 shadow-sm border transition-colors ${
                hasClaimedReward('SCHEDULE_TIME_REWARD')
                  ? 'bg-amber-100 text-amber-700 border-amber-200' 
                  : 'bg-gray-100 text-gray-400 border-gray-200'
              }`}
            >
              <Coins size={14} className={hasClaimedReward('SCHEDULE_TIME_REWARD') ? 'text-amber-700' : 'text-gray-400'} strokeWidth={2.5} />
              <span className={`text-xs font-bold font-simpler ${hasClaimedReward('SCHEDULE_TIME_REWARD') ? 'text-amber-700' : 'text-gray-400'}`}>
                {hasClaimedReward('SCHEDULE_TIME_REWARD') ? '20 🪙' : '+20'}
              </span>
            </motion.div>
          </div>
          <h2 className="text-xl font-bold text-slate-900">
            באיזו שעה {t('אתה מתאמן', 'את מתאמנת')} בדרך כלל?
          </h2>
        </div>
        
        {/* Compact Time Picker - 3 Row Display */}
        <div className="relative py-4 flex justify-center items-center select-none">
          <div className="flex gap-8 items-center">
            {/* Hours */}
            <div className="flex flex-col gap-1">
              {[hours - 1, hours, hours + 1].map((h, idx) => {
                const displayHour = h < 0 ? 23 : h > 23 ? 0 : h;
                const isSelected = displayHour === hours;
                return (
                  <button
                    key={`${displayHour}-${idx}`}
                    onClick={() => {
                      const newHours = displayHour;
                      setTime((prevTime) => {
                        const [, prevMinutes] = prevTime.split(':');
                        return `${String(newHours).padStart(2, '0')}:${prevMinutes}`;
                      });
                      if (!hasClaimedReward('SCHEDULE_TIME_REWARD')) {
                        const wasClaimed = claimReward('SCHEDULE_TIME_REWARD', 20);
                        if (wasClaimed) {
                          triggerCoinFly(timeBadgeRef, 20);
                        }
                      }
                    }}
                    className={`w-16 h-10 rounded-lg flex items-center justify-center font-bold transition-all ${
                      isSelected
                        ? 'bg-[#60A5FA] text-white border-2 border-[#60A5FA] text-lg shadow-md font-black'
                        : 'bg-slate-100 text-slate-400 text-sm border border-slate-200 hover:bg-slate-200'
                    }`}
                  >
                    {String(displayHour).padStart(2, '0')}
                  </button>
                );
              })}
            </div>
            
            {/* Separator */}
            <span className="text-2xl font-bold text-slate-900">:</span>
            
            {/* Minutes */}
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
                    key={`${displayMinute}-${idx}`}
                    onClick={() => {
                      const newMinutes = displayMinute;
                      setTime((prevTime) => {
                        const [prevHours] = prevTime.split(':');
                        return `${prevHours}:${String(newMinutes).padStart(2, '0')}`;
                      });
                      if (!hasClaimedReward('SCHEDULE_TIME_REWARD')) {
                        const wasClaimed = claimReward('SCHEDULE_TIME_REWARD', 20);
                        if (wasClaimed) {
                          triggerCoinFly(timeBadgeRef, 20);
                        }
                      }
                    }}
                    className={`w-16 h-10 rounded-lg flex items-center justify-center font-bold transition-all ${
                      isSelected
                        ? 'bg-[#60A5FA] text-white border-2 border-[#60A5FA] text-lg shadow-md font-black'
                        : 'bg-slate-100 text-slate-400 text-sm border border-slate-200 hover:bg-slate-200'
                    }`}
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

      {/* Section 4: Habit Builder Checkbox - Progressive Disclosure */}
      <AnimatePresence>
        {showTimeSection && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="mb-6"
          >
        <div className="bg-gradient-to-br from-yellow-50 to-orange-50 rounded-xl py-3 px-4 border border-yellow-200 shadow-sm">
          <div className="flex items-center justify-between gap-3 relative" style={{ pointerEvents: 'auto' }}>
            {/* Left: Coin Badge */}
            <motion.div
              ref={notificationBadgeRef}
              initial={false}
              animate={{
                opacity: hasClaimedReward('SCHEDULE_NOTIFICATION_REWARD') ? 1 : 0.4,
              }}
              transition={{
                opacity: { duration: 0.3 },
              }}
              className={`flex items-center gap-1 rounded-full px-2 py-1 shadow-sm transition-colors ${
                hasClaimedReward('SCHEDULE_NOTIFICATION_REWARD')
                  ? 'bg-yellow-200 text-yellow-800' 
                  : 'bg-gray-200 text-gray-500'
              }`}
            >
              <Coins size={14} className={hasClaimedReward('SCHEDULE_NOTIFICATION_REWARD') ? 'text-yellow-800' : 'text-gray-500'} strokeWidth={2.5} />
              <span className={`text-xs font-bold font-simpler ${hasClaimedReward('SCHEDULE_NOTIFICATION_REWARD') ? 'text-yellow-800' : 'text-gray-500'}`}>
                {hasClaimedReward('SCHEDULE_NOTIFICATION_REWARD') ? '100 🪙' : '+100 🪙'}
              </span>
            </motion.div>
            
            {/* Center: Label & Description */}
            <div className="flex-1 text-right">
              <label 
                htmlFor="smart-reminders-checkbox"
                className="text-base font-bold text-slate-900 font-simpler cursor-pointer block mb-1"
              >
                {t('אשר תזכורות חכמות', 'אשרי תזכורות חכמות')}
              </label>
              <p className="text-xs text-slate-600 font-simpler">
                {t(
                  'אנחנו כאן כדי לעזור לך, OUTer, לייצר הרגל מנצח! 🏆',
                  'אנחנו כאן כדי לעזור לך, OUTer, לייצר הרגל מנצח! 🏆'
                )}
              </p>
            </div>
            
            {/* Right: Checkbox */}
            <div className="flex-shrink-0 relative z-[100]">
              <input
                id="smart-reminders-checkbox"
                type="checkbox"
                checked={notificationsEnabled}
                onChange={handleNotificationToggle}
                onClick={(e) => e.stopPropagation()}
                className="w-5 h-5 rounded border-slate-300 text-[#60A5FA] focus:ring-2 focus:ring-[#60A5FA] cursor-pointer relative z-[100]"
                style={{ pointerEvents: 'auto', position: 'relative' }}
              />
            </div>
          </div>
        </div>
      </motion.section>
        )}
      </AnimatePresence>

      {/* Spacer to push button to bottom */}
      <div className="flex-grow"></div>

      {/* Footer - Continue Button */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="mt-auto pb-8"
      >
        <button
          onClick={handleContinue}
          disabled={!canContinue}
          className={`w-full font-bold py-4 rounded-2xl shadow-lg transition-all active:scale-[0.98] text-xl ${
            canContinue 
              ? 'bg-[#60A5FA] hover:bg-[#4a90d9] text-white shadow-[#60A5FA]/20' 
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          המשך
        </button>
      </motion.div>
    </div>
  );
}
