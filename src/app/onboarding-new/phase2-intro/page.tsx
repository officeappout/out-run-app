'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { CheckCircle2, MapPin, Lock, Coins, ArrowRight } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { getOnboardingLocale, type OnboardingLanguage } from '@/lib/i18n/onboarding-locales';
import OnboardingLayout from '@/features/user/onboarding/components/OnboardingLayout';
import { useOnboardingStore } from '@/features/user/onboarding/store/useOnboardingStore';

export default function Phase2IntroPage() {
  const router = useRouter();
  const { language: storeLanguage } = useAppStore();
  const { addCoins } = useOnboardingStore();
  
  // Local language state
  const [selectedLanguage, setSelectedLanguage] = useState<OnboardingLanguage>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('onboarding_language') as OnboardingLanguage | null;
      if (saved && (saved === 'he' || saved === 'en' || saved === 'ru')) {
        return saved;
      }
    }
    return (storeLanguage === 'he' || storeLanguage === 'en') ? storeLanguage : 'he';
  });
  
  // Get translations for current language
  const locale = getOnboardingLocale(selectedLanguage);
  const direction = selectedLanguage === 'he' ? 'rtl' : 'ltr';

  // Handle continue to Phase 2 Setup Wizard
  const handleContinue = () => {
    addCoins(10); // Add coins reward
    router.push('/onboarding-new/setup');
  };

  // Roadmap steps
  const steps = [
    {
      id: 1,
      label: locale.phase2Intro.step1,
      icon: CheckCircle2,
      status: 'completed' as const,
      color: 'text-slate-400',
      bgColor: 'bg-slate-100',
    },
    {
      id: 2,
      label: locale.phase2Intro.step2,
      icon: MapPin,
      status: 'active' as const,
      color: 'text-[#5BC2F2]',
      bgColor: 'bg-[#5BC2F2]/10',
    },
    {
      id: 3,
      label: locale.phase2Intro.step3,
      icon: Lock,
      status: 'locked' as const,
      color: 'text-slate-400',
      bgColor: 'bg-slate-100',
    },
  ];

  return (
    <OnboardingLayout
      headerType="progress"
      currentStep={7} // Approximate step in overall flow (after Phase 1)
      totalSteps={15}
      initialProgress={45} // Show we're about halfway through
      showBack={false}
    >
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 py-8">
        {/* Title */}
        <motion.h1
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className={`text-3xl font-black text-slate-900 mb-3 text-center font-simpler ${direction === 'rtl' ? 'text-right' : 'text-left'}`}
        >
          {locale.phase2Intro.title}
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className={`text-lg font-medium text-slate-600 mb-12 text-center font-simpler ${direction === 'rtl' ? 'text-right' : 'text-left'}`}
        >
          {locale.phase2Intro.subtitle}
        </motion.p>

        {/* Visual Roadmap - Vertical List */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="w-full max-w-md space-y-6 mb-12"
        >
          {steps.map((step, index) => {
            const Icon = step.icon;
            const isCompleted = step.status === 'completed';
            const isActive = step.status === 'active';
            const isLocked = step.status === 'locked';

            return (
              <motion.div
                key={step.id}
                initial={{ opacity: 0, x: direction === 'rtl' ? 20 : -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + index * 0.1 }}
                className={`flex items-center gap-4 p-5 rounded-2xl border-2 transition-all ${
                  isActive
                    ? 'border-[#5BC2F2] bg-[#5BC2F2]/5 shadow-lg shadow-[#5BC2F2]/20'
                    : isCompleted
                    ? 'border-slate-200 bg-slate-50'
                    : 'border-slate-200 bg-white'
                }`}
              >
                {/* Icon */}
                <div
                  className={`flex-shrink-0 w-14 h-14 rounded-full flex items-center justify-center ${
                    isActive
                      ? 'bg-[#5BC2F2]'
                      : isCompleted
                      ? 'bg-slate-200'
                      : 'bg-slate-100'
                  }`}
                >
                  {isCompleted ? (
                    <CheckCircle2 size={24} className="text-green-500" strokeWidth={2.5} />
                  ) : isActive ? (
                    <Icon size={24} className="text-white" strokeWidth={2.5} />
                  ) : (
                    <Lock size={20} className="text-slate-400" strokeWidth={2.5} />
                  )}
                </div>

                {/* Label */}
                <div className="flex-1">
                  <span
                    className={`text-lg font-bold font-simpler ${
                      isActive
                        ? 'text-[#5BC2F2]'
                        : isCompleted
                        ? 'text-slate-400'
                        : 'text-slate-400'
                    }`}
                  >
                    {step.label}
                  </span>
                </div>

                {/* Status Indicator */}
                {isActive && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.6 + index * 0.1, type: 'spring', stiffness: 200 }}
                    className="flex-shrink-0 w-3 h-3 rounded-full bg-[#5BC2F2]"
                  />
                )}
              </motion.div>
            );
          })}
        </motion.div>

        {/* Continue Button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="w-full max-w-md"
        >
          <button
            onClick={handleContinue}
            className="relative w-full bg-[#5BC2F2] hover:bg-[#4ab0e0] text-white font-black py-5 rounded-3xl text-lg shadow-lg shadow-[#5BC2F2]/30 transition-all active:scale-[0.98] overflow-hidden"
          >
            {/* Coin Reward Badge - Top Left */}
            <div className="absolute top-2 left-3 z-10 bg-yellow-100 text-yellow-700 rounded-full px-2 py-1 flex items-center gap-1 shadow-md">
              <Coins size={12} className="text-yellow-700" strokeWidth={2.5} />
              <span className="text-xs font-bold font-simpler">+10</span>
            </div>

            <span className="relative z-10 font-black font-simpler">
              {locale.phase2Intro.continueButton}
            </span>

            {/* Arrow Icon */}
            <ArrowRight
              size={20}
              className={`absolute top-1/2 -translate-y-1/2 z-10 ${
                direction === 'rtl' ? 'left-4 rotate-180' : 'right-4'
              }`}
              strokeWidth={2.5}
            />
          </button>
        </motion.div>
      </div>
    </OnboardingLayout>
  );
}
