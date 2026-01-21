'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sofa, Footprints, Flame, Coins, Building2, TreePine, Dumbbell, Home, Activity } from 'lucide-react';
import { useOnboardingStore } from '../../store/useOnboardingStore';
import { getOnboardingLocale, type OnboardingLanguage } from '@/lib/i18n/onboarding-locales';
import { Analytics } from '@/features/analytics/AnalyticsService';

interface HistoryStepProps {
  onNext: () => void;
}

export default function HistoryStep({ onNext }: HistoryStepProps) {
  const { updateData, data, addCoins } = useOnboardingStore();
  const [showCoinAnimation, setShowCoinAnimation] = useState(false);
  const [coinsEarned, setCoinsEarned] = useState(false);
  const [hasEarnedReward, setHasEarnedReward] = useState(false);
  
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

  // Get current selections
  const historyFrequency = data.historyFrequency || '';
  const historyTypes = data.historyTypes || [];
  
  // Check if coins should be earned (user has made a selection)
  useEffect(() => {
    if (historyFrequency !== '' || historyTypes.length > 0) {
      setCoinsEarned(true);
    }
  }, [historyFrequency, historyTypes]);

  // Frequency options with gender-aware labels
  const frequencyOptions = [
    {
      id: 'none',
      label: locale.history.frequencyNone,
      icon: Sofa,
      color: 'slate',
      bgClass: 'bg-slate-50',
      borderClass: 'border-slate-200',
      hoverClass: 'hover:bg-slate-100',
      activeClass: 'bg-slate-100 border-slate-400',
      iconColor: 'text-slate-600',
    },
    {
      id: '1-2',
      label: t('מתאמן פעם-פעמיים בשבוע', 'מתאמנת פעם-פעמיים בשבוע'),
      icon: Footprints,
      color: 'blue',
      bgClass: 'bg-blue-50',
      borderClass: 'border-blue-200',
      hoverClass: 'hover:bg-blue-100',
      activeClass: 'bg-blue-100 border-blue-400',
      iconColor: 'text-blue-600',
    },
    {
      id: '3+',
      label: t('נותן בראש (3 אימונים ומעלה)', 'נותנת בראש (3 אימונים ומעלה)'),
      icon: Flame,
      color: 'orange',
      bgClass: 'bg-orange-50',
      borderClass: 'border-orange-200',
      hoverClass: 'hover:bg-orange-100',
      activeClass: 'bg-orange-100 border-orange-400',
      iconColor: 'text-orange-600',
    },
  ];

  // Location options
  const locationOptions = [
    { id: 'gym', label: locale.history.locationGym, icon: Building2 },
    { id: 'street', label: locale.history.locationStreet, icon: TreePine },
    { id: 'studio', label: locale.history.locationStudio, icon: Dumbbell },
    { id: 'home', label: locale.history.locationHome, icon: Home },
    { id: 'cardio', label: locale.history.locationCardio, icon: Activity },
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
    const currentList = historyTypes || [];
    const isAdding = !currentList.includes(locationId);
    const newList = isAdding
      ? [...currentList, locationId]
      : currentList.filter((id) => id !== locationId);

    updateData({ historyTypes: newList });

    // Show coin animation when adding location
    if (isAdding) {
      setShowCoinAnimation(true);
      setTimeout(() => setShowCoinAnimation(false), 1000);
    }
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
    <div dir="rtl" className="w-full max-w-md mx-auto px-6 py-6 pb-10 space-y-4 flex flex-col min-h-screen bg-white">
      {/* Section A: Frequency (Single Select - Stack of 3 Cards) */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-3"
      >
        <div className="flex items-center justify-start gap-2 mb-4 relative">
          <div className="relative">
            <motion.div
              initial={false}
              animate={{
                opacity: hasEarnedReward ? 1 : 0.4,
                scale: showCoinAnimation ? [1, 1.2, 1] : 1,
              }}
              transition={{
                opacity: { duration: 0.3 },
                scale: { duration: 0.4, times: [0, 0.5, 1] }
              }}
              className={`flex items-center gap-1 rounded-full px-2 py-1 shadow-sm border transition-colors ${
                hasEarnedReward 
                  ? 'bg-amber-100 text-amber-700 border-amber-200' 
                  : 'bg-gray-100 text-gray-400 border-gray-200'
              }`}
            >
              <Coins 
                size={16} 
                className={hasEarnedReward ? 'text-amber-700' : 'text-gray-400'} 
                strokeWidth={2.5} 
              />
              <span className={`text-sm font-bold font-simpler ${hasEarnedReward ? 'text-amber-700' : 'text-gray-400'}`}>
                +10
              </span>
            </motion.div>
            {/* Float animation */}
            <AnimatePresence>
              {showCoinAnimation && (
                <motion.div
                  initial={{ opacity: 1, y: 0, scale: 1 }}
                  animate={{ opacity: 0, y: -30, scale: 1.2 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                  className="absolute top-0 left-1/2 -translate-x-1/2 pointer-events-none z-20"
                >
                  <div className="flex items-center gap-1 bg-amber-200 text-amber-800 rounded-full px-2 py-1 shadow-lg border border-amber-300">
                    <Coins size={16} className="text-amber-800" strokeWidth={2.5} />
                    <span className="text-sm font-bold font-simpler">+10</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <h3 className="text-lg font-bold text-slate-900 font-simpler">
            {locale.history.frequencyQuestion}
          </h3>
        </div>

        {/* Frequency Cards - Stack */}
        {frequencyOptions.map((option, index) => {
          const Icon = option.icon;
          const isSelected = historyFrequency === option.id;

          return (
            <motion.button
              key={option.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleFrequencySelect(option.id)}
              className={`w-full bg-white p-5 rounded-2xl shadow-sm border transition-all flex items-center gap-4 min-h-[64px] ${
                isSelected
                  ? 'border-[#60A5FA] bg-[#60A5FA]/5'
                  : 'border-slate-100 hover:border-slate-200'
              }`}
            >
              <div className={`p-2 rounded-xl ${
                isSelected 
                  ? 'bg-[#60A5FA]/10' 
                  : option.bgClass
              }`}>
                <Icon 
                  size={24} 
                  className={isSelected ? 'text-[#60A5FA]' : option.iconColor}
                  strokeWidth={2}
                />
              </div>
              <span className={`text-lg font-simpler flex-1 text-right ${
                isSelected 
                  ? 'font-bold text-slate-900' 
                  : 'font-medium text-slate-700'
              }`}>
                {option.label}
              </span>
            </motion.button>
          );
        })}
      </motion.div>

      {/* Section B: Past Locations (Multi-Select Chips) */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="space-y-4"
      >
        <div className="flex items-center justify-start gap-2 mb-1 relative">
          <div className="relative">
            <motion.div
              initial={false}
              animate={{
                opacity: hasEarnedReward ? 1 : 0.4,
                scale: showCoinAnimation ? [1, 1.2, 1] : 1,
              }}
              transition={{
                opacity: { duration: 0.3 },
                scale: { duration: 0.4, times: [0, 0.5, 1] }
              }}
              className={`flex items-center gap-1 rounded-full px-2 py-1 shadow-sm border transition-colors ${
                hasEarnedReward 
                  ? 'bg-amber-100 text-amber-700 border-amber-200' 
                  : 'bg-gray-100 text-gray-400 border-gray-200'
              }`}
            >
              <Coins 
                size={16} 
                className={hasEarnedReward ? 'text-amber-700' : 'text-gray-400'} 
                strokeWidth={2.5} 
              />
              <span className={`text-sm font-bold font-simpler ${hasEarnedReward ? 'text-amber-700' : 'text-gray-400'}`}>
                +10
              </span>
            </motion.div>
            <AnimatePresence>
              {showCoinAnimation && (
                <motion.div
                  initial={{ opacity: 1, y: 0, scale: 1 }}
                  animate={{ opacity: 0, y: -30, scale: 1.2 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                  className="absolute top-0 left-1/2 -translate-x-1/2 pointer-events-none z-20"
                >
                  <div className="flex items-center gap-1 bg-amber-200 text-amber-800 rounded-full px-2 py-1 shadow-lg border border-amber-300">
                    <Coins size={16} className="text-amber-800" strokeWidth={2.5} />
                    <span className="text-sm font-bold font-simpler">+10</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <h3 className="text-lg font-bold text-slate-900 font-simpler">
            {t('ואיפה בדרך כלל התאמנת עד היום?', 'ואיפה בדרך כלל התאמנת עד היום?')}
          </h3>
        </div>

        {/* Location Chips - Wrap Layout */}
        <div className="flex flex-wrap gap-3">
          {locationOptions.map((location, index) => {
            const Icon = location.icon;
            const isSelected = historyTypes.includes(location.id);

            return (
              <motion.button
                key={location.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.35 + index * 0.05 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleLocationToggle(location.id)}
                className={`px-4 py-3 rounded-xl border transition-all flex items-center gap-2 font-simpler shadow-sm ${
                  isSelected
                    ? 'bg-[#60A5FA]/10 border-[#60A5FA] text-[#60A5FA] font-bold'
                    : 'bg-white border-slate-100 text-slate-700 font-medium hover:border-slate-200 hover:bg-slate-50'
                }`}
              >
                <Icon 
                  size={18} 
                  className={isSelected ? 'text-[#60A5FA]' : 'text-slate-500'}
                  strokeWidth={2}
                />
                <span>{location.label}</span>
              </motion.button>
            );
          })}
        </div>
      </motion.div>

      {/* Spacer to push button to bottom */}
      <div className="flex-grow"></div>

      {/* Continue Button */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="mt-auto pb-10"
      >
        <button
          onClick={handleContinue}
          disabled={!canContinue}
          className={`relative w-full bg-[#60A5FA] hover:bg-[#4a90d9] text-white font-bold py-4 rounded-2xl text-xl shadow-lg shadow-[#60A5FA]/20 transition-all active:scale-[0.98] overflow-hidden ${
            !canContinue ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          <span className="relative z-10 font-bold font-simpler">
            {locale.common.continue}
          </span>
        </button>
      </motion.div>
    </div>
  );
}
