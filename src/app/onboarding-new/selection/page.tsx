'use client';

// Force dynamic rendering to prevent SSR issues with window/localStorage
export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/useAppStore';
import { getOnboardingLocale, type OnboardingLanguage } from '@/lib/i18n/onboarding-locales';

export default function SelectionPage() {
  const router = useRouter();
  const { language: storeLanguage, setLanguage: setStoreLanguage } = useAppStore();
  
  // Local language state (supports 'ru' which store doesn't yet)
  const [selectedLanguage, setSelectedLanguage] = useState<OnboardingLanguage>(() => {
    // Initialize from sessionStorage or store, default to 'he'
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('onboarding_language') as OnboardingLanguage | null;
      if (saved && (saved === 'he' || saved === 'en' || saved === 'ru')) {
        return saved;
      }
    }
    // Fallback to store language or 'he'
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
    // Always save to sessionStorage for onboarding flow
    sessionStorage.setItem('onboarding_language', lang);
  };

  // פונקציה למעבר לשאלון הדינמי
  const handleStartOnboarding = () => {
    router.push('/onboarding-new/roadmap');
  };
  
  const handleGuestMode = () => {
    router.push('/onboarding-new/dynamic?guest=true');
  };

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-between p-8 text-slate-800 font-simpler rtl relative overflow-hidden">
      
      {/* Language Selector - Fixed Segmented Control (Top-Right) - Fixed Width to Prevent Jumping */}
      <div className="fixed top-4 right-4 z-30 inline-flex items-center bg-white/95 backdrop-blur-md rounded-lg p-1 shadow-lg border border-slate-200 overflow-hidden" style={{ width: '140px' }}>
        {(['he', 'en', 'ru'] as OnboardingLanguage[]).map((lang, index) => (
          <button
            key={lang}
            onClick={() => handleLanguageChange(lang)}
            className={`flex-1 px-2 py-2 text-xs font-bold transition-all text-center ${
              selectedLanguage === lang
                ? 'bg-[#38bdf8] text-white shadow-sm'
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
      
      {/* אפקט רקע Mesh עדין */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(at_0%_0%,rgba(56,189,248,0.1)_0px,transparent_50%)]" />
        <div className="absolute bottom-0 right-0 w-full h-full bg-[radial-gradient(at_100%_100%,rgba(56,189,248,0.05)_0px,transparent_50%)]" />
      </div>

      {/* Header - שעון וסוללה */}
      <div className="w-full flex justify-between items-center pt-2 px-4 opacity-60 z-10">
        <span className="text-sm font-semibold text-right">5:13</span>
        <div className="flex items-center gap-1">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 21c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6z" />
          </svg>
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M15.67 4H14V2h-4v2H8.33C7.6 4 7 4.6 7 5.33v15.33C7 21.4 7.6 22 8.33 22h7.33c.74 0 1.34-.6 1.34-1.33V5.33C17 4.6 16.4 4 15.67 4z" />
          </svg>
        </div>
      </div>

      {/* מרכז המסך - לוגו וטקסט */}
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-sm space-y-12 z-10">
        <div className="text-center space-y-2">
          <h1 className="text-7xl font-extrabold tracking-tighter italic text-[#38bdf8] drop-shadow-sm">
            OUT
          </h1>
          <p className="text-sm tracking-[0.2em] font-medium text-slate-400 uppercase">
            {locale.common.runYourWorld}
          </p>
        </div>

        {/* כפתורי פעולה */}
        <div className="w-full space-y-4 pt-12">
          {/* כפתור גוגל */}
          <button 
            className="w-full bg-white flex items-center justify-center gap-3 py-4 px-6 rounded-[1.5rem] shadow-lg shadow-slate-200/50 border border-slate-100 transition-transform active:scale-[0.98]"
          >
            <span className="font-bold text-slate-700">{locale.selection.googleButton}</span>
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.27.81-.57z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
          </button>

          {/* כפתור התחלת תהליך (הניווט לשאלון) */}
          <button 
            onClick={handleStartOnboarding}
            className="w-full bg-[#38bdf8] py-4 px-6 rounded-[1.5rem] shadow-xl shadow-[#38bdf8]/30 text-white font-black text-lg transition-transform active:scale-[0.98] hover:brightness-105"
          >
            {locale.selection.startButton}
          </button>
        </div>
      </div>

      {/* כפתור המשך כאורח */}
      <div className="pb-12 w-full text-center z-10">
        <button 
          onClick={handleGuestMode}
          className="text-[#38bdf8] font-medium text-sm hover:underline underline-offset-4 decoration-2"
        >
          {locale.selection.guestLink}
        </button>
      </div>
    </div>
  );
}