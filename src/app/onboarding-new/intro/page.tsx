'use client';

// Force dynamic rendering to prevent SSR issues with window/localStorage
export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAppStore } from '@/store/useAppStore';
import { getOnboardingLocale, type OnboardingLanguage } from '@/lib/i18n/onboarding-locales';
import OnboardingLayout from '@/features/user/onboarding/components/OnboardingLayout';
import { useOnboardingStore } from '@/features/user/onboarding/store/useOnboardingStore';
import { getOnboardingPref, setOnboardingPref } from '@/lib/onboardingPrefs';
import { captureMarketingAttribution } from '@/lib/marketingAttribution';

export default function OnboardingIntroPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { language: storeLanguage, setLanguage: setStoreLanguage } = useAppStore();
  const { coins, addCoins } = useOnboardingStore();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [localCoins, setLocalCoins] = useState(coins); // Local state for immediate UI update

  // ── Growth Hub Phase 3 — Marketing Attribution capture ────────────────
  // Inspect the inbound URL query for UTM tags / ad click IDs and stash
  // them into sessionStorage. Idempotent — re-renders within the same
  // session never overwrite the original click attribution.
  useEffect(() => {
    captureMarketingAttribution(searchParams);
  }, [searchParams]);
  
  // Local language state (supports 'ru' which store doesn't yet)
  const [selectedLanguage, setSelectedLanguage] = useState<OnboardingLanguage>(() => {
    // Initialize from onboardingPrefs (durable across hard close), then store, then 'he'.
    const saved = getOnboardingPref('onboarding_language') as OnboardingLanguage | null;
    if (saved && (saved === 'he' || saved === 'en' || saved === 'ru')) {
      return saved;
    }
    return (storeLanguage === 'he' || storeLanguage === 'en') ? storeLanguage : 'he';
  });
  
  // Get translations for current language
  const locale = getOnboardingLocale(selectedLanguage);
  
  const handleLanguageChange = (lang: OnboardingLanguage) => {
    setSelectedLanguage(lang);
    // Update store if language is supported ('he' or 'en')
    if (lang === 'he' || lang === 'en') {
      setStoreLanguage(lang);
    }
    // Persist via onboardingPrefs — survives hard close on iOS.
    setOnboardingPref('onboarding_language', lang);
  };

  // נתונים עבור הסליידר (תמונות וטקסטים משתנים)
  const slides = [
    {
      image: 'https://images.unsplash.com/photo-1571731956622-39bd5953240a?q=80&w=1000&auto=format&fit=crop',
      title: 'תוכנית פלג גוף עליון',
      level: '10/20',
      progress: '80%',
      offset: 47.75 // 20% חסר
    },
    {
      image: 'https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5?q=80&w=1000&auto=format&fit=crop',
      title: 'אימון פונקציונלי מלא',
      level: '5/20',
      progress: '25%',
      offset: 179.07 // 75% חסר
    },
    {
      image: 'https://images.unsplash.com/photo-1599058917232-d750c1859d7c?q=80&w=1000&auto=format&fit=crop',
      title: 'ריצה וסיבולת',
      level: '15/20',
      progress: '60%',
      offset: 95.5 // 40% חסר
    }
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  // Handle coin reward
  const handleCoinReward = (amount: number) => {
    addCoins(amount);
    setLocalCoins(localCoins + amount);
  };

  // Sync local coins with store
  useEffect(() => {
    setLocalCoins(coins);
  }, [coins]);

  const direction = selectedLanguage === 'he' ? 'rtl' : 'ltr';

  return (
    <OnboardingLayout
      headerType="progress"
      currentStep={1}
      totalSteps={15}
      showBack={false}
      onContinue={() => {
        handleCoinReward(10);
        router.push('/onboarding-new/selection');
      }}
      continueLabel={locale.intro.continue}
    >
      <div className="relative w-full">
        {/* Language Selector - Fixed Segmented Control (Top-Right) */}
        <div className="fixed top-16 right-4 z-30 inline-flex items-center bg-white/95 backdrop-blur-md rounded-lg p-1 shadow-lg border border-slate-200 overflow-hidden" style={{ width: '140px' }}>
          {(['he', 'en', 'ru'] as OnboardingLanguage[]).map((lang, index) => (
            <button
              key={lang}
              onClick={() => handleLanguageChange(lang)}
              className={`flex-1 px-2 py-2 text-xs font-bold transition-all text-center ${
                selectedLanguage === lang
                  ? 'bg-[#5BC2F2] text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              } ${
                index === 0 ? 'rounded-r-md' : index === 2 ? 'rounded-l-md' : ''
              }`}
              style={{ minWidth: '44px' }}
            >
              {lang.toUpperCase()}
            </button>
          ))}
        </div>

        {/* מיכל תמונה עם אפקט Mask */}
        <div className="relative w-full h-[50vh] overflow-hidden">
          <img 
            alt="Workout" 
            className="w-full h-full object-cover transition-opacity duration-1000 ease-in-out" 
            src={slides[currentSlide].image}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-white pointer-events-none"></div>
          
          {/* אינדיקטורים עליונים */}
          <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-20">
            <div className="flex items-center gap-1.5">
              {slides.map((_, index) => (
                <div 
                  key={index} 
                  className={`w-1.5 h-1.5 rounded-full transition-all duration-500 ${currentSlide === index ? 'bg-white w-4' : 'bg-white/40'}`} 
                />
              ))}
            </div>
          </div>
        </div>

        {/* כרטיס התקדמות (Progress Card) */}
        <div className="relative w-full px-6 -mt-20 z-10 flex flex-col items-center">
          <div className="w-full bg-white rounded-[1.5rem] p-6 shadow-xl flex items-center justify-between border border-slate-100">
            <div className="relative flex items-center justify-center">
              <svg className="w-24 h-24">
                <circle 
                  className="text-slate-100" 
                  cx="48" cy="48" fill="transparent" r="38" 
                  stroke="currentColor" strokeWidth="8"
                />
                <circle 
                  className="text-[#5BC2F2] transition-all duration-1000" 
                  cx="48" cy="48" fill="transparent" r="38" 
                  stroke="currentColor" 
                  strokeDasharray="238.76" 
                  strokeDashoffset={slides[currentSlide].offset} 
                  strokeLinecap="round" strokeWidth="8"
                  style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xl font-bold text-slate-800">
                  {slides[currentSlide].progress}
                </span>
              </div>
            </div>
            
            <div className="flex-1 mr-6 flex flex-col items-start">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-black text-slate-900 leading-tight">
                  {slides[currentSlide].title}
                </h3>
                <span className="text-[#5BC2F2] text-xl">🏋️‍♂️</span>
              </div>
              <div className="flex flex-col gap-0.5 text-right">
                <p className="text-slate-500 text-base font-medium">
                  רמה {slides[currentSlide].level}
                </p>
                <p className="text-slate-400 text-sm font-medium">
                  עוד {100 - parseInt(slides[currentSlide].progress)}% לרמה הבאה
                </p>
              </div>
            </div>
          </div>

          {/* טקסט כותרת */}
          <div className="mt-12 text-center">
            <h1 className="text-4xl font-black text-[#5BC2F2] tracking-widest mb-4 italic">OUT</h1>
            <h2 className="text-2xl font-black text-slate-800 px-4">
              {locale.intro.title}
            </h2>
          </div>
        </div>

      </div>
    </OnboardingLayout>
  );
}