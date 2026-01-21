'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/store/useAppStore';
import { getOnboardingLocale, type OnboardingLanguage } from '@/lib/i18n/onboarding-locales';
import LoadingAIBuilder from '@/features/onboarding/components/LoadingAIBuilder';
import OnboardingLayout from '@/features/onboarding/components/OnboardingLayout';
import { useOnboardingStore } from '@/features/onboarding/store/useOnboardingStore';
import { CheckCircle2, Target, Footprints, Coins } from 'lucide-react';

export default function RoadmapPage() {
  const router = useRouter();
  const { language: storeLanguage, setLanguage: setStoreLanguage } = useAppStore();
  const { addCoins } = useOnboardingStore();
  
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
  
  // Determine direction based on language
  const direction = selectedLanguage === 'he' ? 'rtl' : 'ltr';
  
  // State לניהול השלבים (1=מפה, 2=פרטים אישיים, 3=loading AI)
  const [currentStep, setCurrentStep] = useState(1);
  const [showLoadingAI, setShowLoadingAI] = useState(false);
  
  // State לנתוני המשתמש
  const [formData, setFormData] = useState({
    name: '',
    gender: '' // 'male' | 'female'
  });

  // Typewriter effect state
  const [typedText, setTypedText] = useState('');
  const [isTypingComplete, setIsTypingComplete] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  
  // Auto-transition timer state
  const [progress, setProgress] = useState(0);
  const [autoTransitionStarted, setAutoTransitionStarted] = useState(false);

  const handleContinue = () => {
    if (currentStep === 1) {
      setCurrentStep(2);
    } else {
      // Save personal details to sessionStorage for the dynamic questionnaire
      if (formData.name) {
        sessionStorage.setItem('onboarding_personal_name', formData.name);
      }
      if (formData.gender) {
        sessionStorage.setItem('onboarding_personal_gender', formData.gender);
      }
      
      // Show loading AI screen before navigating
      setShowLoadingAI(true);
    }
  };

  const handleLoadingComplete = () => {
    // Navigate to dynamic questionnaire after loading screen
    router.push('/onboarding-new/dynamic');
  };

  const handleBack = () => {
    if (currentStep === 2) {
      setCurrentStep(1);
    } else {
      router.back();
    }
  };

  // Typewriter effect for description - starts after step 1 animation completes
  useEffect(() => {
    if (currentStep !== 1) return;
    
    let typingInterval: NodeJS.Timeout | null = null;
    
    // Wait for spring animation to settle (~400ms) before starting typewriter
    const animationDelay = setTimeout(() => {
      const fullText = locale.roadmap.description;
      let currentIndex = 0;
      
      typingInterval = setInterval(() => {
        if (currentIndex < fullText.length) {
          setTypedText(fullText.slice(0, currentIndex + 1));
          currentIndex++;
        } else {
          setIsTypingComplete(true);
          if (typingInterval) clearInterval(typingInterval);
          // Trigger steps animation after typing completes
          setTimeout(() => {
            setShowSteps(true);
          }, 300);
        }
      }, 60); // Slower, more rhythmic typing: 60ms per character
    }, 400); // Wait for spring animation to complete
    
    return () => {
      clearTimeout(animationDelay);
      if (typingInterval) clearInterval(typingInterval);
    };
  }, [currentStep, locale.roadmap.description]);

  // Auto-transition timer with progress bar
  useEffect(() => {
    if (currentStep !== 1 || !isTypingComplete || !showSteps) return;
    
    setAutoTransitionStarted(true);
    const totalDuration = 7000; // 7 seconds - gives user time to read
    const intervalDuration = 16; // ~60fps
    const increment = (100 / totalDuration) * intervalDuration;
    
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        const newProgress = prev + increment;
        if (newProgress >= 100) {
          clearInterval(progressInterval);
          // Auto-transition to Step 2
          setTimeout(() => {
            setCurrentStep(2);
            setProgress(0);
            setAutoTransitionStarted(false);
          }, 100);
          return 100;
        }
        return newProgress;
      });
    }, intervalDuration);
    
    return () => clearInterval(progressInterval);
  }, [currentStep, isTypingComplete, showSteps]);

  // Reset states when returning to step 1
  useEffect(() => {
    if (currentStep === 1) {
      setTypedText('');
      setIsTypingComplete(false);
      setShowSteps(false);
      setProgress(0);
      setAutoTransitionStarted(false);
    }
  }, [currentStep]);

  // Show loading AI screen if triggered
  if (showLoadingAI) {
    return (
      <LoadingAIBuilder
        language={selectedLanguage}
        onComplete={handleLoadingComplete}
      />
    );
  }

  // Calculate progress based on step position in overall flow
  // Step 1 (Roadmap overview) = Step 1 of 15
  // Step 2 (Name/Gender) = Step 2 of 15
  const totalOnboardingSteps = 15; // Total steps in entire onboarding flow
  const currentProgressStep = currentStep; // 1 or 2
  
  return (
    <div className="relative min-h-screen bg-white">
      {/* Top Gradient - Only show on Step 1 */}
      {currentStep === 1 && (
        <div className="absolute top-0 left-0 w-full h-64 bg-gradient-to-b from-[#5BC2F2]/10 to-transparent pointer-events-none z-0" />
      )}
      
      <OnboardingLayout
        headerType="progress"
        currentStep={currentProgressStep}
        totalSteps={totalOnboardingSteps}
        showBack={currentStep === 2}
        onBack={currentStep === 2 ? handleBack : undefined}
      >
        <div className="flex-1 flex flex-col px-5 pt-4 pb-8 relative z-10 max-w-md mx-auto w-full overflow-hidden min-h-0">
        
        {/* LOGO */}
        <div className="text-center mb-6 flex-shrink-0">
          <h1 className="text-4xl font-black text-[#5BC2F2] tracking-tight italic">OUT</h1>
        </div>

        {/* --- STEPS CONTAINER WITH ANIMATE PRESENCE --- */}
        <div className="flex-1 min-h-0 overflow-hidden relative">
          <AnimatePresence mode="wait" initial={false}>
        {currentStep === 1 && (
              <motion.div
                key="step1"
                initial={{ x: direction === 'rtl' ? 20 : -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: direction === 'rtl' ? -20 : 20, opacity: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="flex flex-col flex-1 min-h-0 absolute inset-0 w-full"
              >
              <div className="text-center mb-6 space-y-3">
                <h2 className="text-xl font-black leading-tight text-slate-900">
                  {locale.roadmap.title}
              </h2>
                <p className="text-sm font-medium leading-relaxed text-slate-500 min-h-[3rem]">
                  {typedText}
                  {!isTypingComplete && (
                    <span className="inline-block w-0.5 h-4 bg-[#5BC2F2] ml-1 animate-pulse" />
                  )}
                </p>
              </div>
              
              {/* Steps List with Staggered Animation - Moved Higher */}
              <div className="space-y-4 flex-1 -mt-4">
                {showSteps && (
                  <>
                    {/* Stage 1 - COMPLETED */}
                    <motion.div
                      initial={{ opacity: 0, y: 30 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0, duration: 0.4, ease: "easeOut" }}
                      className={`bg-white rounded-2xl p-5 border border-gray-200 flex items-center justify-between ${direction === 'rtl' ? 'flex-row' : 'flex-row-reverse'}`}
                    >
                      <span className="font-medium text-slate-400 text-base line-through">{locale.roadmap.steps.personalDetails}</span>
                      <CheckCircle2 size={24} className="text-[#5BC2F2]" fill="#5BC2F2" />
                    </motion.div>
                    
                    {/* Stage 2 - ACTIVE */}
                    <motion.div
                      initial={{ opacity: 0, y: 30 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2, duration: 0.4, ease: "easeOut" }}
                      className={`bg-white rounded-2xl p-5 border border-[#5BC2F2] shadow-lg shadow-blue-100/50 flex items-center justify-between transform scale-105 transition-all ${direction === 'rtl' ? 'flex-row' : 'flex-row-reverse'}`}
                    >
                      <span className="font-black text-slate-900 text-base">{locale.roadmap.steps.fitnessLevel}</span>
                      <Target size={24} className="text-[#5BC2F2]" strokeWidth={2} />
                    </motion.div>
                    
                    {/* Stage 3 - LOCKED */}
                    <motion.div
                      initial={{ opacity: 0, y: 30 }}
                      animate={{ opacity: 0.6, y: 0 }}
                      transition={{ delay: 0.4, duration: 0.4, ease: "easeOut" }}
                      className={`bg-slate-50 rounded-2xl p-5 border border-transparent flex items-center justify-between ${direction === 'rtl' ? 'flex-row' : 'flex-row-reverse'}`}
                    >
                      <span className="font-medium text-slate-400 text-base">{locale.roadmap.steps.goal}</span>
                      <span className="material-icons-round text-slate-300 text-2xl">lock</span>
                    </motion.div>
                  </>
                )}
              </div>
              </motion.div>
        )}

        {currentStep === 2 && (
              <motion.div
                key="step2"
                initial={{ x: direction === 'rtl' ? 20 : -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: direction === 'rtl' ? -20 : 20, opacity: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="flex flex-col flex-1 min-h-0 absolute inset-0 w-full"
              >
            
            {/* Step Header - Removed, handled by OnboardingLayout back button */}
            
            {/* Title */}
            <h2 className="text-2xl font-black text-slate-900 mb-2">{locale.details.header}</h2>

            {/* Subheader */}
            <p className={`mb-8 text-base font-medium text-slate-600 ${direction === 'rtl' ? 'text-right' : 'text-left'}`}>
              {locale.details.subheader}
            </p>

            <form className="space-y-8 px-1" onSubmit={(e) => e.preventDefault()}>
              {/* Name Input */}
              <div className="space-y-3">
                <div className="relative group">
                  <input 
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className={`w-full bg-white text-black placeholder-slate-400 rounded-2xl border border-[#E2E8F0] py-4 px-5 shadow-[0_8px_30px_rgba(0,0,0,0.12)] focus:ring-2 focus:ring-[#5BC2F2]/50 outline-none transition-all font-medium font-simpler ${direction === 'rtl' ? 'text-right' : 'text-left'}`}
                    placeholder={locale.details.namePlaceholder}
                    autoFocus
                  />
                </div>
              </div>

              {/* Gender Selection */}
              <div className="space-y-3">
                <label className={`block text-slate-800 font-black text-base ${direction === 'rtl' ? 'text-right pr-1' : 'text-left pl-1'}`}>
                  {locale.details.genderQuestion}
                </label>
                <div className="flex gap-4">
                  <button 
                    type="button"
                    onClick={() => {
                      const wasEmpty = !formData.gender;
                      setFormData({...formData, gender: 'male'});
                      if (wasEmpty) addCoins(10); // Only add coins once when first selecting
                    }}
                    className={`relative flex-1 py-4 rounded-2xl font-medium transition-all active:scale-95 border-2 flex items-center justify-center gap-2
                      ${formData.gender === 'male' 
                        ? 'border-[#5BC2F2] bg-[#5BC2F2] text-white shadow-lg' 
                        : 'border-transparent bg-white text-slate-700 hover:bg-slate-50 shadow-sm'}`}
                  >
                    {/* Coin Reward Badge - Top Left */}
                    {formData.gender !== 'male' && (
                      <div className="absolute top-2 left-2 z-10 bg-yellow-100 text-yellow-700 rounded-full px-2 py-1 flex items-center gap-1 shadow-md">
                        <Coins size={12} className="text-yellow-700" strokeWidth={2.5} />
                        <span className="text-xs font-bold font-simpler">+10</span>
                      </div>
                    )}
                    <span>{locale.details.male}</span>
                    <span className="text-xl">🙋‍♂️</span>
                  </button>
                  <button 
                    type="button"
                    onClick={() => {
                      const wasEmpty = !formData.gender;
                      setFormData({...formData, gender: 'female'});
                      if (wasEmpty) addCoins(10); // Only add coins once when first selecting
                    }}
                    className={`relative flex-1 py-4 rounded-2xl font-medium transition-all active:scale-95 border-2 flex items-center justify-center gap-2
                      ${formData.gender === 'female' 
                        ? 'border-[#5BC2F2] bg-[#5BC2F2] text-white shadow-lg' 
                        : 'border-transparent bg-white text-slate-700 hover:bg-slate-50 shadow-sm'}`}
                  >
                    {/* Coin Reward Badge - Top Left */}
                    {formData.gender !== 'female' && (
                      <div className="absolute top-2 left-2 z-10 bg-yellow-100 text-yellow-700 rounded-full px-2 py-1 flex items-center gap-1 shadow-md">
                        <Coins size={12} className="text-yellow-700" strokeWidth={2.5} />
                        <span className="text-xs font-bold font-simpler">+10</span>
                      </div>
                    )}
                    <span>{locale.details.female}</span>
                    <span className="text-xl">🙋‍♀️</span>
                  </button>
                </div>
              </div>
            </form>
              </motion.div>
            )}
          </AnimatePresence>
          </div>

        {/* Action Button - Increased Bottom Spacing - Fixed Position */}
        <div className="mt-auto pt-6 pb-8 flex-shrink-0">
          <button 
            onClick={() => {
              if (currentStep === 2 && formData.name && formData.gender) {
                addCoins(10); // Add coins when continuing from Name/Gender step
              }
              handleContinue();
            }}
            disabled={currentStep === 2 && (!formData.name || !formData.gender)}
            className={`w-full text-white text-lg font-black py-4 rounded-3xl transition-all active:scale-[0.98] relative overflow-hidden
              ${currentStep === 2 && (!formData.name || !formData.gender)
                ? 'bg-slate-300 cursor-not-allowed shadow-none'
                : 'bg-[#5BC2F2] hover:bg-[#4ab0e0] shadow-[0_4px_20px_rgba(91,194,242,0.4)]'}`}
          >
            {/* Coin Reward Badge - Top Left (only on Step 2 Continue button) */}
            {currentStep === 2 && formData.name && formData.gender && (
              <div className="absolute top-2 left-3 z-10 bg-yellow-100 text-yellow-700 rounded-full px-2 py-1 flex items-center gap-1 shadow-md">
                <Coins size={12} className="text-yellow-700" strokeWidth={2.5} />
                <span className="text-xs font-bold font-simpler">+10</span>
              </div>
            )}
            {/* Progress Bar Overlay */}
            {currentStep === 1 && autoTransitionStarted && (
              <motion.div
                className="absolute top-0 left-0 h-full bg-white/30"
                initial={{ width: '0%' }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.1, ease: 'linear' }}
              />
            )}
            <span className="relative z-10 font-black">
              {currentStep === 1 
                ? locale.common.startAssessment 
                : (formData.gender === 'female' ? locale.common.continueFemale : locale.common.continue)}
            </span>
          </button>
        </div>

        </div>
      </OnboardingLayout>
    </div>
  );
}