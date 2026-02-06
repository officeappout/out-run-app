'use client';

// Force dynamic rendering to prevent SSR issues with window/localStorage
export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAppStore } from '@/store/useAppStore';
import { useUserStore } from '@/features/user';
import { useOnboardingStore } from '@/features/user/onboarding/store/useOnboardingStore';
import { getOnboardingLocale, type OnboardingLanguage } from '@/lib/i18n/onboarding-locales';
import { signInGuest, signInWithGooglePopup } from '@/lib/auth.service';
import { syncOnboardingToFirestore } from '@/features/user/onboarding/services/onboarding-sync.service';
import { Loader2, ChevronLeft, Sparkles } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function SelectionPage() {
  const router = useRouter();
  const { language: storeLanguage, setLanguage: setStoreLanguage } = useAppStore();
  const { hasCompletedOnboarding, profile } = useUserStore();
  const { reset: resetOnboarding } = useOnboardingStore();
  
  // Loading states
  const [isStartingTraining, setIsStartingTraining] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isAppleLoading, setIsAppleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Local language state (supports 'ru' which store doesn't yet)
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
  
  const handleLanguageChange = (lang: OnboardingLanguage) => {
    setSelectedLanguage(lang);
    if (lang === 'he' || lang === 'en') {
      setStoreLanguage(lang);
    }
    sessionStorage.setItem('onboarding_language', lang);
  };

  /**
   * Start Training - Anonymous Auth Flow
   * Creates anonymous user with "ONBOARDING" status
   */
  const handleStartTraining = async () => {
    setError(null);
    setIsStartingTraining(true);
    
    try {
      // Reset onboarding store for fresh start
      resetOnboarding();
      
      // Sign in anonymously
      const { user, error: authError } = await signInGuest();
      
      if (authError || !user) {
        setError(authError || 'שגיאה בהתחברות. אנא נסה שוב.');
        setIsStartingTraining(false);
        return;
      }
      
      console.log('[Selection] Anonymous user created:', user.uid);
      
      // Sync to Firestore with ONBOARDING status (this creates the user document)
      await syncOnboardingToFirestore('LOCATION', {});
      
      // Navigate to roadmap
      router.push('/onboarding-new/roadmap');
      
    } catch (err: any) {
      console.error('[Selection] Error starting training:', err);
      setError('שגיאה בהתחברות. אנא נסה שוב.');
      setIsStartingTraining(false);
    }
  };

  /**
   * Google Sign In - For Returning Users
   * If user has completed onboarding, redirect to /home
   * Otherwise, continue with onboarding
   */
  const handleGoogleSignIn = async () => {
    setError(null);
    setIsGoogleLoading(true);
    
    try {
      const { user, error: authError } = await signInWithGooglePopup();
      
      if (authError || !user) {
        setError(authError || 'שגיאה בהתחברות עם Google. אנא נסה שוב.');
        setIsGoogleLoading(false);
        return;
      }
      
      console.log('[Selection] Google sign-in successful:', user.uid);
      
      // Check if user has completed onboarding by checking Firestore
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const hasCompleted = userData?.onboardingStatus === 'COMPLETED' || 
                            (userData?.lifestyle?.scheduleDays && userData.lifestyle.scheduleDays.length > 0);
        
        if (hasCompleted) {
          // Returning user - go to home
          console.log('[Selection] Returning user detected, redirecting to /home');
          router.push('/home');
          return;
        }
      }
      
      // New user or incomplete onboarding - continue with onboarding
      console.log('[Selection] New user or incomplete onboarding, continuing...');
      await syncOnboardingToFirestore('LOCATION', {});
      router.push('/onboarding-new/roadmap');
      
    } catch (err: any) {
      console.error('[Selection] Error with Google sign-in:', err);
      setError('שגיאה בהתחברות עם Google. אנא נסה שוב.');
      setIsGoogleLoading(false);
    }
  };

  /**
   * Apple Sign In - For Returning Users
   * Similar flow to Google
   */
  const handleAppleSignIn = async () => {
    setError(null);
    setIsAppleLoading(true);
    
    // Apple sign-in not yet implemented
    // Show coming soon message
    setTimeout(() => {
      setError('התחברות עם Apple תהיה זמינה בקרוב');
      setIsAppleLoading(false);
    }, 500);
  };
  
  /**
   * Guest Mode - Direct to Home
   * No tracking, no assessment progress
   */
  const handleGuestMode = () => {
    router.push('/home');
  };

  const isLoading = isStartingTraining || isGoogleLoading || isAppleLoading;

  return (
    <div 
      className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex flex-col items-center justify-between p-6 text-slate-800 font-simpler relative overflow-hidden"
      dir={direction}
    >
      {/* Subtle Background Effects */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-[radial-gradient(circle,rgba(91,194,242,0.08)_0%,transparent_60%)]" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-[radial-gradient(circle,rgba(91,194,242,0.05)_0%,transparent_70%)]" />
      </div>

      {/* Language Selector - Fixed Top Right */}
      <div className="fixed top-4 right-4 z-30 inline-flex items-center bg-white/95 backdrop-blur-md rounded-xl p-1 shadow-lg border border-slate-200/80" style={{ width: '140px' }}>
        {(['he', 'en', 'ru'] as OnboardingLanguage[]).map((lang, index) => (
          <button
            key={lang}
            onClick={() => handleLanguageChange(lang)}
            disabled={isLoading}
            className={`flex-1 px-2 py-2 text-xs font-bold transition-all text-center rounded-lg ${
              selectedLanguage === lang
                ? 'bg-[#5BC2F2] text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
            style={{ minWidth: '44px' }}
          >
            {lang.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-sm z-10 pt-16">
        
        {/* Logo Section */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center space-y-3 mb-16"
        >
          <h1 className="text-8xl font-black tracking-tighter italic text-[#5BC2F2] drop-shadow-sm">
            OUT
          </h1>
          <p className="text-sm tracking-[0.15em] font-semibold text-slate-400 uppercase">
            {locale.common.runYourWorld}
          </p>
        </motion.div>

        {/* Error Message */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-sm text-center"
          >
            {error}
          </motion.div>
        )}

        {/* Primary CTA - Start Training */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="w-full mb-6"
        >
          <button 
            onClick={handleStartTraining}
            disabled={isLoading}
            className={`w-full relative overflow-hidden bg-gradient-to-r from-[#5BC2F2] to-[#4AADE3] py-5 px-6 rounded-2xl shadow-xl shadow-[#5BC2F2]/30 text-white font-black text-xl transition-all active:scale-[0.98] hover:brightness-105 ${
              isLoading ? 'opacity-70 cursor-not-allowed' : ''
            }`}
          >
            {/* Shimmer Effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
            
            {/* Sparkles Icon */}
            <span className="relative flex items-center justify-center gap-3">
              {isStartingTraining ? (
                <Loader2 className="animate-spin" size={24} />
              ) : (
                <Sparkles size={24} />
              )}
              <span>{selectedLanguage === 'he' ? 'מתחילים עכשיו' : selectedLanguage === 'ru' ? 'Начать сейчас' : 'Start Training'}</span>
            </span>
          </button>
          
          <p className="text-xs text-center text-slate-400 mt-3">
            {selectedLanguage === 'he' 
              ? 'בדוק את רמת הכושר שלך ובנה תוכנית אישית' 
              : selectedLanguage === 'ru'
              ? 'Проверьте свой уровень и создайте личный план'
              : 'Check your fitness level and build a personal plan'}
          </p>
        </motion.div>

        {/* Divider */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="w-full flex items-center gap-4 my-6"
        >
          <div className="flex-1 h-px bg-slate-200" />
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
            {selectedLanguage === 'he' ? 'או התחבר' : selectedLanguage === 'ru' ? 'или войти' : 'or sign in'}
          </span>
          <div className="flex-1 h-px bg-slate-200" />
        </motion.div>

        {/* Social Login Buttons */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.4 }}
          className="w-full space-y-3"
        >
          {/* Google Button */}
          <button 
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className={`w-full bg-white flex items-center justify-center gap-3 py-4 px-6 rounded-2xl shadow-md shadow-slate-200/50 border border-slate-200 transition-all active:scale-[0.98] hover:border-slate-300 hover:shadow-lg ${
              isLoading ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {isGoogleLoading ? (
              <Loader2 className="animate-spin text-slate-600" size={20} />
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.27.81-.57z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
            )}
            <span className="font-bold text-slate-700">
              {selectedLanguage === 'he' ? 'המשך עם Google' : selectedLanguage === 'ru' ? 'Продолжить с Google' : 'Continue with Google'}
            </span>
          </button>

          {/* Apple Button */}
          <button 
            onClick={handleAppleSignIn}
            disabled={isLoading}
            className={`w-full bg-black flex items-center justify-center gap-3 py-4 px-6 rounded-2xl shadow-md shadow-slate-300/50 transition-all active:scale-[0.98] hover:bg-gray-900 ${
              isLoading ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {isAppleLoading ? (
              <Loader2 className="animate-spin text-white" size={20} />
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="white">
                <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
              </svg>
            )}
            <span className="font-bold text-white">
              {selectedLanguage === 'he' ? 'המשך עם Apple' : selectedLanguage === 'ru' ? 'Продолжить с Apple' : 'Continue with Apple'}
            </span>
          </button>
        </motion.div>
      </div>

      {/* Guest Link - Bottom */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="pb-8 w-full text-center z-10"
      >
        <button 
          onClick={handleGuestMode}
          disabled={isLoading}
          className={`text-slate-400 font-medium text-sm hover:text-slate-600 transition-colors underline-offset-4 decoration-1 hover:underline ${
            isLoading ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          {selectedLanguage === 'he' ? 'המשך כאורח' : selectedLanguage === 'ru' ? 'Продолжить как гость' : 'Continue as Guest'}
        </button>
        <p className="text-[10px] text-slate-300 mt-1">
          {selectedLanguage === 'he' 
            ? 'ללא מעקב התקדמות' 
            : selectedLanguage === 'ru'
            ? 'Без отслеживания прогресса'
            : 'Without progress tracking'}
        </p>
      </motion.div>

      {/* Custom CSS for shimmer animation */}
      <style jsx>{`
        @keyframes shimmer {
          100% {
            transform: translateX(100%);
          }
        }
      `}</style>
    </div>
  );
}
