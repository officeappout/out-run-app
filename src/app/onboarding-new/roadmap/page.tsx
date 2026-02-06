'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/store/useAppStore';
import { getOnboardingLocale, type OnboardingLanguage } from '@/lib/i18n/onboarding-locales';
import OnboardingLayout from '@/features/user/onboarding/components/OnboardingLayout';
import { useOnboardingStore } from '@/features/user/onboarding/store/useOnboardingStore';
import { Check } from 'lucide-react';

export default function RoadmapPage() {
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
  
  // Determine direction based on language
  const direction = selectedLanguage === 'he' ? 'rtl' : 'ltr';
  
  // State לניהול השלבים (1=מפה, 2=פרטים אישיים)
  const [currentStep, setCurrentStep] = useState(1);
  
  // Read major roadmap step from store (0=אבחון, 1=התאמה, 2=שריון)
  const majorRoadmapStep = useOnboardingStore((state) => state.majorRoadmapStep);
  const setMajorRoadmapStep = useOnboardingStore((state) => state.setMajorRoadmapStep);
  
  // Restore major step from sessionStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedStep = sessionStorage.getItem('onboarding_major_step');
      if (savedStep !== null) {
        const step = parseInt(savedStep, 10);
        if (!isNaN(step) && step >= 0 && step <= 2) {
          setMajorRoadmapStep(step);
        }
      }
    }
  }, [setMajorRoadmapStep]);
  
  // Get saved name from sessionStorage for personalized header
  const [savedUserName, setSavedUserName] = useState<string>('');
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const name = sessionStorage.getItem('onboarding_personal_name');
      if (name) {
        setSavedUserName(name);
      }
    }
  }, []);
  
  // Sequential animation states for step transitions (when majorRoadmapStep === 1)
  const [animationPhase, setAnimationPhase] = useState<'initial' | 'completing' | 'activating' | 'done'>('done');
  
  // Trigger sequential animation when returning from step 1 completion
  // Timing: 1. Node pops (0.3s) → 2. Line pours (0.8s) → 3. Node 2 activates
  useEffect(() => {
    if (majorRoadmapStep === 1 && savedUserName) {
      // Start the animation sequence
      setAnimationPhase('initial');
      
      // Phase 1 (200ms): Brief pause showing step 0 as active
      const timer1 = setTimeout(() => {
        setAnimationPhase('completing'); // Node 0 pops into checkmark, line starts pouring
      }, 200);
      
      // Phase 2 (1000ms): Line has finished pouring, activate node 1
      const timer2 = setTimeout(() => {
        setAnimationPhase('activating'); // Node 1 springs into active state
      }, 1100); // 200 + 800ms for line + 100ms buffer
      
      // Phase 3 (1400ms): Animation complete
      const timer3 = setTimeout(() => {
        setAnimationPhase('done');
      }, 1500);
      
      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
        clearTimeout(timer3);
      };
    } else {
      setAnimationPhase('done');
    }
  }, [majorRoadmapStep, savedUserName]);
  
  // State לנתוני המשתמש
  const [formData, setFormData] = useState({
    name: '',
    birthDay: '',
    birthMonth: '',
    birthYear: '',
    gender: '' // 'male' | 'female'
  });

  // Refs for DOB inputs (for auto-tabbing)
  const dayInputRef = useRef<HTMLInputElement>(null);
  const monthInputRef = useRef<HTMLInputElement>(null);
  const yearInputRef = useRef<HTMLInputElement>(null);
  
  // Age validation
  const calculateAge = (day: string, month: string, year: string): number | null => {
    const d = parseInt(day, 10);
    const m = parseInt(month, 10);
    const y = parseInt(year, 10);
    
    if (isNaN(d) || isNaN(m) || isNaN(y) || y < 1900 || y > 2100) return null;
    if (d < 1 || d > 31 || m < 1 || m > 12) return null;
    
    const today = new Date();
    const birthDate = new Date(y, m - 1, d);
    
    // Check if date is valid (e.g., Feb 30 would be invalid)
    if (birthDate.getDate() !== d || birthDate.getMonth() !== m - 1) return null;
    
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    
    return age;
  };
  
  // Check DOB validity and age
  const isDobComplete = formData.birthDay.length >= 1 && formData.birthMonth.length >= 1 && formData.birthYear.length === 4;
  const calculatedAge = isDobComplete ? calculateAge(formData.birthDay, formData.birthMonth, formData.birthYear) : null;
  const isAgeValid = calculatedAge !== null && calculatedAge >= 14;
  const isDobInvalid = isDobComplete && calculatedAge === null;
  const isUnder14 = calculatedAge !== null && calculatedAge < 14;
  const hasDobError = isDobInvalid || isUnder14;
  
  // Check if date of birth is complete and valid
  const isDateOfBirthComplete = isDobComplete && isAgeValid;

  // Animation state - simplified (no typewriter, no auto-transition)
  const [showContent, setShowContent] = useState(false);

  const handleContinue = () => {
    // Handle different flows based on majorRoadmapStep
    if (majorRoadmapStep === 1) {
      // Step 2: Lifestyle Adaptation - navigate to the OnboardingWizard (Phase 2)
      router.push('/onboarding-new/setup');
      return;
    }
    
    // Step 1: אבחון flow
    if (currentStep === 1) {
      setCurrentStep(2);
    } else {
      // Save personal details to sessionStorage for the dynamic questionnaire
      if (typeof window !== 'undefined') {
        if (formData.name) {
          sessionStorage.setItem('onboarding_personal_name', formData.name);
        }
        if (formData.gender) {
          sessionStorage.setItem('onboarding_personal_gender', formData.gender);
        }
        if (isDateOfBirthComplete) {
          const dob = `${formData.birthYear}-${formData.birthMonth.padStart(2, '0')}-${formData.birthDay.padStart(2, '0')}`;
          sessionStorage.setItem('onboarding_personal_dob', dob);
        }
      }
      
      // Navigate directly to dynamic questionnaire (no loading screen)
      router.push('/onboarding-new/dynamic');
    }
  };

  const handleBack = () => {
    if (currentStep === 2) {
      setCurrentStep(1);
    } else {
      router.back();
    }
  };

  // Trigger content animation after initial mount
  useEffect(() => {
    if (currentStep === 1) {
      // Small delay to ensure smooth animation start
      const timer = setTimeout(() => {
        setShowContent(true);
          }, 100);
      return () => clearTimeout(timer);
        }
  }, [currentStep]);
    
  // Reset content state when returning to step 1
  useEffect(() => {
    if (currentStep === 1) {
      setShowContent(false);
      // Re-trigger animation
      const timer = setTimeout(() => {
        setShowContent(true);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [currentStep]);

  // 3-Step Progress Bar Logic:
  // Phase 1 (אבחון): Roadmap (0%) + Personal Details (30%)
  // Personal Details screen = 30% of Phase 1
  const phase1Progress = currentStep === 1 ? 0 : 30;
  
  return (
    <div className="relative min-h-screen">
      <OnboardingLayout
        headerType="progress"
        onboardingPhase={1}
        phaseProgress={phase1Progress}
        showBack={currentStep === 2}
        onBack={currentStep === 2 ? handleBack : undefined}
      >
        <div className="flex-1 flex flex-col px-5 pt-4 pb-8 relative z-10 max-w-md mx-auto w-full overflow-hidden min-h-0">
        
        {/* LOGO - sits on the gradient */}
        <div className="text-center mb-6 flex-shrink-0">
          <h1 className="text-4xl font-black text-[#5BC2F2] tracking-tight italic drop-shadow-sm">OUT</h1>
        </div>

        {/* --- STEPS CONTAINER WITH ANIMATE PRESENCE --- */}
        <div className="flex-1 min-h-0 overflow-hidden relative">
          <AnimatePresence mode="wait" initial={false}>
        {currentStep === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="flex flex-col flex-1 min-h-0 absolute inset-0 w-full"
              >
              {/* Header & Description - Fixed height to prevent layout shifts */}
              <div className="text-center mb-8 h-[88px] flex flex-col justify-center">
                <motion.div 
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={showContent ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                  className="space-y-2"
                >
                  {/* Main Title - Personalized when step 1 */}
                  <motion.h2 
                    layout
                    className="text-2xl font-black leading-tight text-slate-900"
                  >
                    {majorRoadmapStep === 1 && savedUserName 
                      ? `מעולה ${savedUserName}, האבחון הושלם!`
                      : locale.roadmap.title}
                  </motion.h2>
                  
                  {/* Description - Different for step 1 */}
                  <motion.p 
                    layout
                    className="text-sm font-normal leading-relaxed text-slate-500 max-w-xs mx-auto"
                  >
                    {majorRoadmapStep === 1 
                      ? 'עכשיו נבנה את המעטפת: ציוד, הרגלים ולו"ז.'
                      : locale.roadmap.description}
                  </motion.p>
                </motion.div>
              </div>
              
              {/* Premium Moovit-Style Timeline - RTL with nodes on RIGHT */}
              <motion.div 
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={showContent ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
                transition={{ delay: 0.15, duration: 0.5, ease: "easeOut" }}
                className="flex-1 relative"
                dir="rtl"
              >
                {/* Timeline Container with Continuous Line Track */}
                <div className="relative flex gap-4">
                  
                  {/* === Timeline Column (RIGHT side in RTL) === */}
                  <div className="w-10 flex-shrink-0 relative">
                    {/* Continuous Grey Background Track - spans full height */}
                    <div 
                      className="absolute w-0 border-l-[3px] border-dashed border-slate-200"
                      style={{ 
                        left: '50%', 
                        transform: 'translateX(-50%)',
                        top: '32px',  // Start at center of first node
                        bottom: '32px' // End at center of last node
                      }} 
                    />
                    
                    {/* Continuous Blue Progress Track - animated pour */}
                    <motion.div 
                      className="absolute w-[3px] bg-[#5BC2F2] rounded-full origin-top"
                      style={{ 
                        left: '50%', 
                        transform: 'translateX(-50%)',
                        top: '32px' // Start at center of first node
                      }}
                      initial={{ height: majorRoadmapStep >= 1 ? '72px' : '0px' }}
                      animate={{ 
                        height: (animationPhase === 'completing' || animationPhase === 'activating' || animationPhase === 'done' || majorRoadmapStep >= 1) 
                          ? (majorRoadmapStep >= 2 ? '144px' : '72px') // 72px per step gap
                          : '0px'
                      }}
                      transition={{ 
                        duration: 0.8, 
                        ease: "easeInOut",
                        delay: animationPhase === 'completing' ? 0.1 : 0
                      }}
                    />
                    
                    {/* Node 0 - אבחון */}
                    <div className="h-16 flex items-center justify-center relative z-10">
                      <div className="bg-gradient-to-b from-[#D8F3FF] to-[#F8FDFF] rounded-full p-0.5">
                        <AnimatePresence mode="wait">
                          {(majorRoadmapStep === 0 || (majorRoadmapStep === 1 && animationPhase === 'initial')) ? (
                            <motion.div
                              key="active-0"
                              layout
                              animate={{
                                boxShadow: [
                                  '0 0 0 0 rgba(91, 194, 242, 0.3)',
                                  '0 0 0 8px rgba(91, 194, 242, 0.1)',
                                  '0 0 0 0 rgba(91, 194, 242, 0)',
                                ]
                              }}
                              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                              className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center"
                            >
                              <div className="w-4 h-4 rounded-full bg-[#5BC2F2]" />
                            </motion.div>
                          ) : (
                            <motion.div 
                              key="complete-0"
                              layout
                              initial={{ scale: 0.3, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              transition={{ type: "spring", stiffness: 400, damping: 15 }}
                              className="w-6 h-6 rounded-full bg-[#5BC2F2] flex items-center justify-center shadow-md"
                            >
                              <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                    
                    {/* Node 1 - התאמה */}
                    <div className="h-16 flex items-center justify-center relative z-10">
                      <div className="bg-gradient-to-b from-[#D8F3FF] to-[#F8FDFF] rounded-full p-0.5">
                        <AnimatePresence mode="wait">
                          {(majorRoadmapStep === 1 && (animationPhase === 'activating' || animationPhase === 'done')) ? (
                            <motion.div
                              key="active-1"
                              layout
                              initial={{ scale: 0.3, opacity: 0 }}
                              animate={{
                                scale: 1,
                                opacity: 1,
                                boxShadow: [
                                  '0 0 0 0 rgba(91, 194, 242, 0.3)',
                                  '0 0 0 8px rgba(91, 194, 242, 0.1)',
                                  '0 0 0 0 rgba(91, 194, 242, 0)',
                                ]
                              }}
                              transition={{ 
                                scale: { type: "spring", stiffness: 400, damping: 15 },
                                opacity: { duration: 0.2 },
                                boxShadow: { duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.3 }
                              }}
                              className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center"
                            >
                              <div className="w-4 h-4 rounded-full bg-[#5BC2F2]" />
                            </motion.div>
                          ) : majorRoadmapStep > 1 ? (
                            <motion.div 
                              key="complete-1"
                              layout
                              className="w-6 h-6 rounded-full bg-[#5BC2F2] flex items-center justify-center shadow-md"
                            >
                              <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                            </motion.div>
                          ) : (
                            <motion.div 
                              key="future-1"
                              layout
                              className="w-4 h-4 rounded-full border-2 border-slate-300 bg-white" 
                            />
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                    
                    {/* Node 2 - שריון */}
                    <div className="h-16 flex items-center justify-center relative z-10">
                      <div className="bg-gradient-to-b from-[#D8F3FF] to-[#F8FDFF] rounded-full p-0.5">
                        {majorRoadmapStep === 2 ? (
                          <motion.div
                            layout
                            animate={{
                              boxShadow: [
                                '0 0 0 0 rgba(91, 194, 242, 0.3)',
                                '0 0 0 8px rgba(91, 194, 242, 0.1)',
                                '0 0 0 0 rgba(91, 194, 242, 0)',
                              ]
                            }}
                            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                            className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center"
                          >
                            <div className="w-4 h-4 rounded-full bg-[#5BC2F2]" />
                          </motion.div>
                        ) : majorRoadmapStep > 2 ? (
                          <div className="w-6 h-6 rounded-full bg-[#5BC2F2] flex items-center justify-center shadow-md">
                            <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                          </div>
                        ) : (
                          <div className="w-4 h-4 rounded-full border-2 border-slate-300 bg-white" />
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* === Cards Column (LEFT side in RTL) === */}
                  <div className="flex-1 flex flex-col">
                    
                    {/* Card 0 - אבחון ודירוג יכולות */}
                    <motion.div
                      layout
                      onClick={(majorRoadmapStep === 0 || (majorRoadmapStep === 1 && animationPhase === 'initial')) ? handleContinue : undefined}
                      initial={false}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.4, ease: "easeOut" }}
                      className={`h-16 flex items-center rounded-2xl py-3 px-5 transition-colors duration-300 ${
                        (majorRoadmapStep === 0 || (majorRoadmapStep === 1 && animationPhase === 'initial'))
                          ? 'bg-white cursor-pointer hover:scale-[1.01] active:scale-[0.98] shadow-[0_10px_40px_rgba(91,194,242,0.12)] border border-[#5BC2F2]/20'
                          : 'bg-[#E8F7FF]/80 border border-[#5BC2F2]/10 cursor-default'
                      }`}
                    >
                      <div className="text-right w-full">
                        <span className={`block leading-tight ${
                          (majorRoadmapStep === 0 || (majorRoadmapStep === 1 && animationPhase === 'initial')) 
                            ? 'font-black text-slate-900 text-lg' 
                            : 'font-semibold text-slate-700 text-base'
                        }`}>
                          {(majorRoadmapStep > 0 && animationPhase !== 'initial') && (
                            <Check className="inline w-4 h-4 text-[#5BC2F2] ml-1" />
                          )}
                          אבחון ודירוג יכולות
                        </span>
                        <span className="mt-0.5 block text-sm text-slate-500">
                          שם, מגדר, מבחן רמת כושר
                        </span>
                      </div>
                    </motion.div>
                    
                    {/* Card 1 - התאמה לסגנון החיים */}
                    <motion.div
                      layout
                      onClick={(majorRoadmapStep === 1 && (animationPhase === 'activating' || animationPhase === 'done')) ? handleContinue : undefined}
                      initial={false}
                      animate={{
                        opacity: 1,
                        boxShadow: (majorRoadmapStep === 1 && (animationPhase === 'activating' || animationPhase === 'done')) 
                          ? '0 10px 40px rgba(91,194,242,0.12)' 
                          : '0 0 0 rgba(0,0,0,0)',
                      }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                      className={`h-16 flex items-center rounded-2xl py-3 px-5 transition-colors duration-300 ${
                        (majorRoadmapStep === 1 && (animationPhase === 'activating' || animationPhase === 'done'))
                          ? 'bg-white cursor-pointer hover:scale-[1.01] active:scale-[0.98] border border-[#5BC2F2]/20'
                          : majorRoadmapStep > 1
                            ? 'bg-[#E8F7FF]/80 border border-[#5BC2F2]/10 cursor-default'
                            : 'bg-slate-50/80 border border-slate-100 cursor-default pointer-events-none select-none'
                      }`}
                    >
                      <div className="text-right w-full">
                        <span className={`block ${
                          (majorRoadmapStep === 1 && (animationPhase === 'activating' || animationPhase === 'done')) 
                            ? 'font-black text-slate-900 text-lg leading-tight' 
                            : majorRoadmapStep > 1 
                              ? 'font-semibold text-slate-700 text-base' 
                              : 'font-semibold text-slate-400 text-base'
                        }`}>
                          {majorRoadmapStep > 1 && <Check className="inline w-4 h-4 text-[#5BC2F2] ml-1" />}
                          התאמה לסגנון החיים
                        </span>
                        <span className={`mt-0.5 block text-sm ${
                          (majorRoadmapStep === 1 && (animationPhase === 'activating' || animationPhase === 'done')) 
                            ? 'text-slate-500' 
                            : majorRoadmapStep > 1
                              ? 'text-slate-500'
                              : 'text-slate-300'
                        }`}>
                          ציוד, הרגלים, לו״ז, שכונה
                        </span>
                      </div>
                    </motion.div>
                    
                    {/* Card 2 - שריון התוכנית ויציאה לדרך */}
                    <motion.div
                      layout
                      onClick={majorRoadmapStep === 2 ? handleContinue : undefined}
                      className={`h-16 flex items-center rounded-2xl py-3 px-5 transition-colors duration-300 ${
                        majorRoadmapStep === 2 
                          ? 'bg-white cursor-pointer hover:scale-[1.01] active:scale-[0.98] shadow-[0_10px_40px_rgba(91,194,242,0.12)] border border-[#5BC2F2]/20'
                          : majorRoadmapStep > 2
                            ? 'bg-[#E8F7FF]/80 border border-[#5BC2F2]/10 cursor-default'
                            : 'bg-slate-50/80 border border-slate-100 cursor-default pointer-events-none select-none'
                      }`}
                    >
                      <div className="text-right w-full">
                        <span className={`block ${
                          majorRoadmapStep === 2 
                            ? 'font-black text-slate-900 text-lg leading-tight' 
                            : majorRoadmapStep > 2 
                              ? 'font-semibold text-slate-700 text-base' 
                              : 'font-semibold text-slate-400 text-base'
                        }`}>
                          {majorRoadmapStep > 2 && <Check className="inline w-4 h-4 text-[#5BC2F2] ml-1" />}
                          שריון התוכנית ויציאה לדרך
                        </span>
                        <span className={`mt-0.5 block text-sm ${
                          majorRoadmapStep === 2 
                            ? 'text-slate-500' 
                            : majorRoadmapStep > 2
                              ? 'text-slate-500'
                              : 'text-slate-300'
                        }`}>
                          סיכום, משפטי, הצהרת בריאות, שמירה
                        </span>
                      </div>
                    </motion.div>
                    
                  </div>
                  {/* End Cards Column */}
                  
              </div>
                {/* End Timeline Container */}
              </motion.div>
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

            <form className="space-y-6 px-1" onSubmit={(e) => e.preventDefault()}>
              {/* Name Input - Premium styling */}
              <div className="space-y-2">
                <label className={`block text-slate-800 font-bold text-sm ${direction === 'rtl' ? 'text-right pr-1' : 'text-left pl-1'}`}>
                  {direction === 'rtl' ? 'איך קוראים לך?' : 'What\'s your name?'}
                </label>
                <div className="relative">
                  <input 
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className={`w-full bg-white text-black placeholder-slate-400 rounded-2xl border-2 border-slate-200 py-4 px-5 shadow-sm focus:border-[#5BC2F2] focus:ring-4 focus:ring-[#5BC2F2]/10 outline-none transition-all font-medium font-simpler ${direction === 'rtl' ? 'text-right' : 'text-left'}`}
                    placeholder={locale.details.namePlaceholder}
                    autoFocus
                  />
                </div>
              </div>

              {/* Date of Birth - Three numeric inputs with auto-tabbing */}
              <div className="space-y-2">
                <label className={`block text-slate-800 font-bold text-sm ${direction === 'rtl' ? 'text-right pr-1' : 'text-left pl-1'}`}>
                  {direction === 'rtl' ? 'מתי נולדת?' : 'Date of birth'}
                </label>
                <div className={`flex gap-3 ${direction === 'rtl' ? 'flex-row' : 'flex-row-reverse'}`}>
                  {/* Day (rightmost in RTL) */}
                  <input
                    ref={dayInputRef}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={2}
                    value={formData.birthDay}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '').slice(0, 2);
                      setFormData({...formData, birthDay: value});
                      // Auto-tab to month when 2 digits entered
                      if (value.length === 2) {
                        monthInputRef.current?.focus();
                      }
                    }}
                    onKeyDown={(e) => {
                      // No backspace logic for first field
                    }}
                    placeholder={direction === 'rtl' ? 'יום' : 'DD'}
                    className={`w-16 bg-white text-black text-center rounded-xl border-2 py-3.5 px-2 shadow-sm focus:ring-4 focus:ring-[#5BC2F2]/10 outline-none transition-all font-semibold font-simpler placeholder:text-slate-300 placeholder:font-normal ${
                      hasDobError ? 'border-red-300 focus:border-red-400' : 'border-slate-200 focus:border-[#5BC2F2]'
                    }`}
                  />
                  
                  {/* Separator */}
                  <span className="text-slate-300 self-center text-lg font-light">/</span>
                  
                  {/* Month */}
                  <input
                    ref={monthInputRef}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={2}
                    value={formData.birthMonth}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '').slice(0, 2);
                      setFormData({...formData, birthMonth: value});
                      // Auto-tab to year when 2 digits entered
                      if (value.length === 2) {
                        yearInputRef.current?.focus();
                      }
                    }}
                    onKeyDown={(e) => {
                      // Backspace to previous field when empty
                      if (e.key === 'Backspace' && formData.birthMonth === '') {
                        dayInputRef.current?.focus();
                      }
                    }}
                    placeholder={direction === 'rtl' ? 'חודש' : 'MM'}
                    className={`w-16 bg-white text-black text-center rounded-xl border-2 py-3.5 px-2 shadow-sm focus:ring-4 focus:ring-[#5BC2F2]/10 outline-none transition-all font-semibold font-simpler placeholder:text-slate-300 placeholder:font-normal ${
                      hasDobError ? 'border-red-300 focus:border-red-400' : 'border-slate-200 focus:border-[#5BC2F2]'
                    }`}
                  />
                  
                  {/* Separator */}
                  <span className="text-slate-300 self-center text-lg font-light">/</span>
                  
                  {/* Year (leftmost in RTL) */}
                  <input
                    ref={yearInputRef}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    value={formData.birthYear}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                      setFormData({...formData, birthYear: value});
                    }}
                    onKeyDown={(e) => {
                      // Backspace to previous field when empty
                      if (e.key === 'Backspace' && formData.birthYear === '') {
                        monthInputRef.current?.focus();
                      }
                    }}
                    placeholder={direction === 'rtl' ? 'שנה' : 'YYYY'}
                    className={`w-20 bg-white text-black text-center rounded-xl border-2 py-3.5 px-2 shadow-sm focus:ring-4 focus:ring-[#5BC2F2]/10 outline-none transition-all font-semibold font-simpler placeholder:text-slate-300 placeholder:font-normal ${
                      hasDobError ? 'border-red-300 focus:border-red-400' : 'border-slate-200 focus:border-[#5BC2F2]'
                    }`}
                  />
                </div>
                
                {/* Error Messages */}
                {isUnder14 && (
                  <p className={`text-red-500 text-sm font-medium ${direction === 'rtl' ? 'text-right' : 'text-left'}`}>
                    {direction === 'rtl' ? 'השימוש באפליקציה מותר מגיל 14 ומעלה' : 'You must be at least 14 years old to use this app'}
                  </p>
                )}
                {isDobInvalid && (
                  <p className={`text-red-500 text-sm font-medium ${direction === 'rtl' ? 'text-right' : 'text-left'}`}>
                    {direction === 'rtl' ? 'תאריך לא תקין' : 'Invalid date'}
                  </p>
                )}
              </div>

              {/* Gender Selection - Clean without coin badges */}
              <div className="space-y-2">
                <label className={`block text-slate-800 font-bold text-sm ${direction === 'rtl' ? 'text-right pr-1' : 'text-left pl-1'}`}>
                  {locale.details.genderQuestion}
                </label>
                <div className="flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setFormData({...formData, gender: 'male'})}
                    className={`flex-1 py-4 rounded-2xl font-semibold transition-all active:scale-[0.97] border-2 flex items-center justify-center gap-2
                      ${formData.gender === 'male' 
                        ? 'border-[#5BC2F2] bg-[#5BC2F2] text-white shadow-md' 
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'}`}
                  >
                    <span className="text-xl">🙋‍♂️</span>
                    <span>{locale.details.male}</span>
                  </button>
                  <button 
                    type="button"
                    onClick={() => setFormData({...formData, gender: 'female'})}
                    className={`flex-1 py-4 rounded-2xl font-semibold transition-all active:scale-[0.97] border-2 flex items-center justify-center gap-2
                      ${formData.gender === 'female' 
                        ? 'border-[#5BC2F2] bg-[#5BC2F2] text-white shadow-md' 
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'}`}
                  >
                    <span className="text-xl">🙋‍♀️</span>
                    <span>{locale.details.female}</span>
                  </button>
                </div>
              </div>
            </form>
              </motion.div>
            )}
          </AnimatePresence>
          </div>

        {/* Action Button - THE ONLY clickable element to proceed */}
        <div className="mt-auto pt-4 pb-6 flex-shrink-0">
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={showContent || currentStep === 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
            transition={{ delay: currentStep === 1 ? (majorRoadmapStep === 1 ? 1.5 : 0.4) : 0, duration: 0.5 }}
            onClick={handleContinue}
            disabled={currentStep === 2 && (!formData.name || !isDateOfBirthComplete || !formData.gender)}
            className={`w-full text-white text-lg font-black py-4 rounded-3xl transition-all cursor-pointer active:scale-[0.98]
              ${currentStep === 2 && (!formData.name || !isDateOfBirthComplete || !formData.gender)
                ? 'bg-slate-300 cursor-not-allowed shadow-none'
                : 'bg-[#5BC2F2] hover:bg-[#4ab0e0] hover:shadow-[0_6px_25px_rgba(91,194,242,0.5)] shadow-[0_4px_20px_rgba(91,194,242,0.4)]'}`}
          >
            <span className="font-black">
              {currentStep === 1 
                ? (majorRoadmapStep === 0 ? 'בואו נתחיל באבחון' : 'בואו נמשיך להתאמה')
                : (formData.gender === 'female' ? locale.common.continueFemale : locale.common.continue)}
            </span>
          </motion.button>
        </div>

        </div>
      </OnboardingLayout>
    </div>
  );
}
