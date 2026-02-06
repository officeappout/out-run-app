'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Sofa, 
  Footprints, 
  Flame, 
  Coins, 
  Building2, 
  TreePine, 
  Dumbbell, 
  Home,
  Check,
  Users,
  Bike,
  Sparkles,
  Heart,
  Zap
} from 'lucide-react';
import { useOnboardingStore } from '../../store/useOnboardingStore';
import { getOnboardingLocale, type OnboardingLanguage } from '@/lib/i18n/onboarding-locales';
import { Analytics } from '@/features/analytics/AnalyticsService';

interface HistoryStepProps {
  onNext: () => void;
}

export default function HistoryStep({ onNext }: HistoryStepProps) {
  const { updateData, data, addCoins } = useOnboardingStore();
  const [showCoinAnimation, setShowCoinAnimation] = useState(false);
  const [hasEarnedReward, setHasEarnedReward] = useState(false);
  
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

  // Get current selections
  const historyFrequency = data.historyFrequency || '';
  const historyLocations = data.historyLocations || [];
  const historySports = data.historySports || [];
  
  // Check if coins should be earned (user has made a selection)
  useEffect(() => {
    if (historyFrequency !== '' && !hasEarnedReward) {
      setHasEarnedReward(true);
    }
  }, [historyFrequency, hasEarnedReward]);

  // Frequency options - simplified labels
  const frequencyOptions = [
    {
      id: 'none',
      label: isHebrew ? 'לא התאמנתי' : "I didn't train",
      icon: Sofa,
      bgClass: 'bg-slate-50',
      iconColor: 'text-slate-500',
    },
    {
      id: '1-2',
      label: isHebrew ? '1-2 פעמים בשבוע' : '1-2 times a week',
      icon: Footprints,
      bgClass: 'bg-blue-50',
      iconColor: 'text-blue-500',
    },
    {
      id: '3+',
      label: isHebrew ? '3+ פעמים בשבוע' : '3+ times a week',
      icon: Flame,
      bgClass: 'bg-orange-50',
      iconColor: 'text-orange-500',
    },
  ];

  // Location options - updated tags
  const locationOptions = [
    { id: 'studio', label: isHebrew ? 'סטודיו/חוגים' : 'Studio/Classes', icon: Users },
    { id: 'park', label: isHebrew ? 'גינת כושר' : 'Outdoor Gym', icon: TreePine },
    { id: 'home', label: isHebrew ? 'אימון ביתי' : 'Home Workout', icon: Home },
    { id: 'gym', label: isHebrew ? 'חדר כושר' : 'Gym', icon: Dumbbell },
  ];

  // Sport types options
  const sportOptions = [
    { id: 'running', label: isHebrew ? 'ריצה' : 'Running', icon: Zap },
    { id: 'yoga', label: isHebrew ? 'יוגה/פילאטיס' : 'Yoga/Pilates', icon: Sparkles },
    { id: 'cycling', label: isHebrew ? 'רכיבה' : 'Cycling', icon: Bike },
    { id: 'strength', label: isHebrew ? 'כוח' : 'Strength', icon: Dumbbell },
    { id: 'cardio', label: isHebrew ? 'קרדיו' : 'Cardio', icon: Heart },
    { id: 'crossfit', label: isHebrew ? 'קרוספיט' : 'CrossFit', icon: Flame },
  ];

  // Handle frequency selection (single select)
  const handleFrequencySelect = (frequencyId: string) => {
    const isNewSelection = historyFrequency !== frequencyId;
    updateData({ historyFrequency: frequencyId });
    
    // Show coin animation and award coins on new selection
    if (isNewSelection && !hasEarnedReward) {
      setHasEarnedReward(true);
      setShowCoinAnimation(true);
      addCoins(10);
      setTimeout(() => setShowCoinAnimation(false), 1000);
    }
  };

  // Handle location toggle (multi-select)
  const handleLocationToggle = (locationId: string) => {
    const currentList = historyLocations || [];
    const isAdding = !currentList.includes(locationId);
    const newList = isAdding
      ? [...currentList, locationId]
      : currentList.filter((id: string) => id !== locationId);

    updateData({ historyLocations: newList });
  };

  // Handle sport toggle (multi-select)
  const handleSportToggle = (sportId: string) => {
    const currentList = historySports || [];
    const isAdding = !currentList.includes(sportId);
    const newList = isAdding
      ? [...currentList, sportId]
      : currentList.filter((id: string) => id !== sportId);

    updateData({ historySports: newList });
  };

  // Handle continue
  const handleContinue = async () => {
    // Log analytics
    await Analytics.logOnboardingStepComplete('HISTORY', 0);
    
    // Add coins only once
    if (!hasEarnedReward) {
      addCoins(10);
      setHasEarnedReward(true);
    }
    
    // Move to next step
    onNext();
  };

  // Check if can continue (frequency must be selected)
  const canContinue = historyFrequency !== '';

  return (
    <div dir="rtl" className="w-full max-w-md mx-auto px-4 py-4 pb-8 flex flex-col min-h-screen bg-slate-50/50">
      {/* Main Premium Card Container */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="premium-card p-5 space-y-6"
      >
        {/* Section 1: Routine Frequency */}
        <div className="space-y-3">
          {/* Header with coin badge */}
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900">
              {t(
                'איך נראתה שגרת האימונים שלך בחודש האחרון?',
                'איך נראתה שגרת האימונים שלך בחודש האחרון?'
              )}
            </h3>
            
            {/* Coin Badge */}
            <div className="relative">
              <motion.div
                initial={false}
                animate={{
                  opacity: hasEarnedReward ? 1 : 0.5,
                  scale: showCoinAnimation ? [1, 1.2, 1] : 1,
                }}
                transition={{
                  opacity: { duration: 0.3 },
                  scale: { duration: 0.4, times: [0, 0.5, 1] }
                }}
                className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold transition-colors ${
                  hasEarnedReward 
                    ? 'bg-amber-100 text-amber-700' 
                    : 'bg-slate-100 text-slate-400'
                }`}
              >
                <Coins size={12} strokeWidth={2.5} />
                <span>+10</span>
              </motion.div>
              
              {/* Float animation */}
              <AnimatePresence>
                {showCoinAnimation && (
                  <motion.div
                    initial={{ opacity: 1, y: 0, scale: 1 }}
                    animate={{ opacity: 0, y: -20, scale: 1.2 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                    className="absolute top-0 left-1/2 -translate-x-1/2 pointer-events-none z-20"
                  >
                    <div className="flex items-center gap-1 bg-amber-200 text-amber-800 rounded-full px-2 py-0.5 text-xs font-bold shadow-lg">
                      <Coins size={12} strokeWidth={2.5} />
                      <span>+10</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Frequency Options - Compact Cards */}
          <div className="space-y-2">
            {frequencyOptions.map((option, index) => {
              const Icon = option.icon;
              const isSelected = historyFrequency === option.id;

              return (
                <motion.button
                  key={option.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleFrequencySelect(option.id)}
                  className={`w-full p-3.5 rounded-2xl border transition-all flex items-center gap-3 ${
                    isSelected
                      ? 'bg-[#5BC2F2]/8 border-[#5BC2F2]/50'
                      : 'bg-white border-slate-100 hover:border-slate-200'
                  }`}
                >
                  {/* Icon */}
                  <div className={`p-2 rounded-xl ${isSelected ? 'bg-[#5BC2F2]/15' : option.bgClass}`}>
                    <Icon 
                      size={20} 
                      className={isSelected ? 'text-[#5BC2F2]' : option.iconColor}
                      strokeWidth={2}
                    />
                  </div>
                  
                  {/* Label */}
                  <span className={`text-sm flex-1 text-right ${
                    isSelected ? 'font-bold text-slate-900' : 'font-medium text-slate-600'
                  }`}>
                    {option.label}
                  </span>
                  
                  {/* Selection Indicator */}
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                    isSelected ? 'bg-[#5BC2F2]' : 'bg-slate-100'
                  }`}>
                    {isSelected && <Check size={12} className="text-white" strokeWidth={3} />}
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-slate-100" />

        {/* Section 2: Background (Location + Sports) */}
        <div className="space-y-5">
          {/* Location Question */}
          <div className="space-y-3">
            <h3 className="text-base font-bold text-slate-900">
              {t(
                'איפה התאמנת בדרך כלל עד היום?',
                'איפה התאמנת בדרך כלל עד היום?'
              )}
            </h3>
            
            {/* Location Tags */}
            <div className="flex flex-wrap gap-2">
              {locationOptions.map((location, index) => {
                const Icon = location.icon;
                const isSelected = historyLocations.includes(location.id);

                return (
                  <motion.button
                    key={location.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.1 + index * 0.03 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleLocationToggle(location.id)}
                    className={`px-3 py-2 rounded-2xl border transition-all flex items-center gap-1.5 text-sm ${
                      isSelected
                        ? 'bg-[#5BC2F2]/10 border-[#5BC2F2]/50 text-[#5BC2F2] font-semibold'
                        : 'bg-white border-slate-100 text-slate-600 font-medium hover:border-slate-200'
                    }`}
                  >
                    <Icon size={14} strokeWidth={2} />
                    <span>{location.label}</span>
                  </motion.button>
                );
              })}
            </div>
          </div>

          {/* Sports Question */}
          <div className="space-y-3">
            <h3 className="text-base font-bold text-slate-900">
              {isHebrew ? 'ובאילו ענפי ספורט?' : 'Which sports?'}
            </h3>
            
            {/* Sport Tags */}
            <div className="flex flex-wrap gap-2">
              {sportOptions.map((sport, index) => {
                const Icon = sport.icon;
                const isSelected = historySports.includes(sport.id);

                return (
                  <motion.button
                    key={sport.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.15 + index * 0.03 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleSportToggle(sport.id)}
                    className={`px-3 py-2 rounded-xl border transition-all flex items-center gap-1.5 text-sm ${
                      isSelected
                        ? 'bg-[#5BC2F2]/10 border-[#5BC2F2]/50 text-[#5BC2F2] font-semibold'
                        : 'bg-white border-slate-100 text-slate-600 font-medium hover:border-slate-200'
                    }`}
                  >
                    <Icon size={14} strokeWidth={2} />
                    <span>{sport.label}</span>
                  </motion.button>
                );
              })}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Spacer */}
      <div className="flex-grow min-h-[40px]" />

      {/* Continue Button */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="mt-auto"
      >
        <button
          onClick={handleContinue}
          disabled={!canContinue}
          className={`w-full bg-[#5BC2F2] hover:bg-[#4AADE3] text-white font-bold py-4 rounded-2xl text-lg shadow-xl shadow-[#5BC2F2]/25 transition-all active:scale-[0.98] ${
            !canContinue ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          {locale.common.continue}
        </button>
      </motion.div>
    </div>
  );
}
