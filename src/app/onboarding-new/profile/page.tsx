'use client';

export const dynamic = 'force-dynamic';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import OnboardingStoryBar from '@/features/user/onboarding/components/OnboardingStoryBar';
import { STRENGTH_PHASES } from '@/features/user/onboarding/constants/onboarding-phases';
import { firePhaseConfetti } from '@/features/user/onboarding/utils/onboarding-confetti';

/**
 * Resolve uid from multiple sources (in priority order):
 * 1. onAuthStateChanged user
 * 2. auth.currentUser (synchronous snapshot)
 * 3. sessionStorage fallback written by Gateway
 */
function resolveUid(authUser: User | null): string | null {
  if (authUser?.uid) return authUser.uid;
  if (auth.currentUser?.uid) return auth.currentUser.uid;
  try { return sessionStorage.getItem('gateway_uid'); } catch { return null; }
}

export default function IdentityProfilePage() {
  const router = useRouter();
  const { profile } = useUserStore();
  const direction = 'rtl';

  // Auth state — resolved via onAuthStateChanged so we never hit a stale null
  const [authUser, setAuthUser] = useState<User | null>(auth.currentUser);
  const [authReady, setAuthReady] = useState(!!auth.currentUser);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    birthDay: '',
    birthMonth: '',
    birthYear: '',
    gender: '' as 'male' | 'female' | '',
  });

  // Refs for auto-tabbing
  const dayInputRef = useRef<HTMLInputElement>(null);
  const monthInputRef = useRef<HTMLInputElement>(null);
  const yearInputRef = useRef<HTMLInputElement>(null);

  // Validation states
  const [hasDobError, setHasDobError] = useState(false);
  const [isUnder14, setIsUnder14] = useState(false);
  const [isDobInvalid, setIsDobInvalid] = useState(false);
  const [loading, setLoading] = useState(false);

  // Pre-fill from existing profile if available
  useEffect(() => {
    if (profile?.core?.name) setFormData(prev => ({ ...prev, name: profile.core.name }));
    if (profile?.core?.gender) setFormData(prev => ({ ...prev, gender: profile.core.gender as 'male' | 'female' }));
    if (profile?.core?.birthDate) {
      const bd = profile.core.birthDate;
      const date = bd instanceof Date ? bd : new Date(bd);
      if (!isNaN(date.getTime())) {
        setFormData(prev => ({
          ...prev,
          birthDay: String(date.getDate()).padStart(2, '0'),
          birthMonth: String(date.getMonth() + 1).padStart(2, '0'),
          birthYear: String(date.getFullYear()),
        }));
      }
    }
  }, [profile]);

  // Validate DOB
  const validateDOB = useCallback(() => {
    const { birthDay, birthMonth, birthYear } = formData;
    
    if (!birthDay || !birthMonth || !birthYear) {
      setHasDobError(false);
      setIsUnder14(false);
      setIsDobInvalid(false);
      return false;
    }

    const day = parseInt(birthDay, 10);
    const month = parseInt(birthMonth, 10);
    const year = parseInt(birthYear, 10);

    // Check valid date
    if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > new Date().getFullYear()) {
      setIsDobInvalid(true);
      setHasDobError(true);
      setIsUnder14(false);
      return false;
    }

    const birthDate = new Date(year, month - 1, day);
    if (birthDate.getDate() !== day || birthDate.getMonth() !== month - 1) {
      setIsDobInvalid(true);
      setHasDobError(true);
      setIsUnder14(false);
      return false;
    }

    // Check age >= 14
    const today = new Date();
    const age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    const dayDiff = today.getDate() - birthDate.getDate();
    const adjustedAge = (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) ? age - 1 : age;

    if (adjustedAge < 14) {
      setIsUnder14(true);
      setHasDobError(true);
      setIsDobInvalid(false);
      return false;
    }

    setHasDobError(false);
    setIsUnder14(false);
    setIsDobInvalid(false);
    return true;
  }, [formData]);

  useEffect(() => {
    if (formData.birthDay && formData.birthMonth && formData.birthYear) {
      validateDOB();
    }
  }, [formData.birthDay, formData.birthMonth, formData.birthYear, validateDOB]);

  // Check if form is complete
  const isFormComplete = 
    formData.name.trim().length > 0 &&
    formData.birthDay.length === 2 &&
    formData.birthMonth.length === 2 &&
    formData.birthYear.length === 4 &&
    formData.gender !== '' &&
    !hasDobError;

  // Handle submit
  const handleContinue = async () => {
    if (!isFormComplete || loading) return;

    setLoading(true);
    try {
      // Triple-source uid resolution: onAuthStateChanged → auth.currentUser → sessionStorage
      const uid = resolveUid(authUser);
      if (!uid) {
        console.error('[Profile] No uid from any source — waiting for auth');
        alert('לא נמצא משתמש מחובר. נסה לרענן את הדף.');
        setLoading(false);
        return;
      }

      // Construct DOB
      const birthDate = new Date(
        parseInt(formData.birthYear),
        parseInt(formData.birthMonth) - 1,
        parseInt(formData.birthDay)
      );

      // Save to sessionStorage for dynamic questionnaire
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('onboarding_personal_name', formData.name);
        sessionStorage.setItem('onboarding_personal_gender', formData.gender);
        sessionStorage.setItem('onboarding_personal_dob', birthDate.toISOString().split('T')[0]);
      }

      // Update Firestore — includes scaffold fields so Gateway doesn't need
      // to write anything (auth-only). merge:true keeps any existing data.
      await setDoc(doc(db, 'users', uid), {
        id: uid,
        onboardingPath: 'FULL_PROGRAM',
        onboardingStatus: 'IN_PROGRESS',
        onboardingStep: 'IDENTITY',
        onboardingProgress: 0,
        core: {
          name: formData.name,
          gender: formData.gender,
          birthDate: birthDate,
          initialFitnessTier: 1,
          trackingMode: 'wellness',
          mainGoal: 'healthy_lifestyle',
          weight: 0,
          accessLevel: 1,
          affiliations: [],
          unlockedProgramIds: [],
          isVerified: false,
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true });

      firePhaseConfetti();

      router.push('/onboarding-new/program-path');
    } catch (error) {
      console.error('[Identity] Error saving profile:', error);
      alert('שגיאה בשמירת הפרופיל');
      setLoading(false);
    }
  };

  // ── Auth guard: don't render the form until we have a confirmed uid ──
  const resolvedUid = resolveUid(authUser);

  // Redirect to Gateway only after hydration so we don't redirect before
  // sessionStorage (gateway_uid) has been read.
  useEffect(() => {
    if (!isHydrated) return;
    if (authReady && !resolveUid(authUser)) {
      console.warn('[Profile] Auth settled with no uid — redirecting to /gateway');
      router.replace('/gateway');
    }
  }, [authReady, isHydrated, authUser, router]);

  if (!resolvedUid) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50 flex flex-col items-center justify-center" dir={direction}>
        <Loader2 size={36} className="text-[#5BC2F2] animate-spin mb-4" />
        <p className="text-slate-400 text-sm font-medium" style={{ fontFamily: 'var(--font-simpler)' }}>
          מאמת זהות...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50 flex flex-col" dir={direction}>
      {/* Story bar + phase label */}
      <div style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <OnboardingStoryBar
          totalPhases={STRENGTH_PHASES.TOTAL}
          currentPhase={STRENGTH_PHASES.PROFILE}
          phaseLabel={STRENGTH_PHASES.labels[STRENGTH_PHASES.PROFILE]}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col w-full max-w-md mx-auto px-6 py-8 overflow-y-auto">
        {/* Title */}
        <h2 className="text-2xl font-black text-slate-900 mb-2">בואו נכיר</h2>

        {/* Subheader */}
        <p className="mb-8 text-base font-medium text-slate-600 text-right">
          כמה פרטים קצרים כדי שנוכל לבנות לך תוכנית מדויקת
        </p>

        <form className="space-y-6 px-1" onSubmit={(e) => e.preventDefault()}>
          {/* Name Input */}
          <div className="space-y-2">
            <label className="block text-slate-800 font-bold text-sm text-right pr-1">
              איך קוראים לך?
            </label>
            <div className="relative">
              <input 
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                className="w-full bg-white text-black placeholder-slate-400 rounded-2xl border-2 border-slate-200 py-4 px-5 shadow-sm focus:border-[#5BC2F2] focus:ring-4 focus:ring-[#5BC2F2]/10 outline-none transition-all font-medium font-simpler text-right"
                placeholder="השם שלי הוא..."
                autoFocus
              />
            </div>
          </div>

          {/* Date of Birth */}
          <div className="space-y-2">
            <label className="block text-slate-800 font-bold text-sm text-right pr-1">
              מתי נולדת?
            </label>
            <div className="flex gap-3 flex-row">
              {/* Day */}
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
                  if (value.length === 2) monthInputRef.current?.focus();
                }}
                placeholder="יום"
                className={`w-16 bg-white text-black text-center rounded-xl border-2 py-3.5 px-2 shadow-sm focus:ring-4 focus:ring-[#5BC2F2]/10 outline-none transition-all font-semibold font-simpler placeholder:text-slate-300 placeholder:font-normal ${
                  hasDobError ? 'border-red-300 focus:border-red-400' : 'border-slate-200 focus:border-[#5BC2F2]'
                }`}
              />
              
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
                  if (value.length === 2) yearInputRef.current?.focus();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Backspace' && formData.birthMonth === '') dayInputRef.current?.focus();
                }}
                placeholder="חודש"
                className={`w-16 bg-white text-black text-center rounded-xl border-2 py-3.5 px-2 shadow-sm focus:ring-4 focus:ring-[#5BC2F2]/10 outline-none transition-all font-semibold font-simpler placeholder:text-slate-300 placeholder:font-normal ${
                  hasDobError ? 'border-red-300 focus:border-red-400' : 'border-slate-200 focus:border-[#5BC2F2]'
                }`}
              />
              
              <span className="text-slate-300 self-center text-lg font-light">/</span>
              
              {/* Year */}
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
                  if (e.key === 'Backspace' && formData.birthYear === '') monthInputRef.current?.focus();
                }}
                placeholder="שנה"
                className={`w-20 bg-white text-black text-center rounded-xl border-2 py-3.5 px-2 shadow-sm focus:ring-4 focus:ring-[#5BC2F2]/10 outline-none transition-all font-semibold font-simpler placeholder:text-slate-300 placeholder:font-normal ${
                  hasDobError ? 'border-red-300 focus:border-red-400' : 'border-slate-200 focus:border-[#5BC2F2]'
                }`}
              />
            </div>
            
            {/* Error Messages */}
            {isUnder14 && (
              <p className="text-red-500 text-sm font-medium text-right">
                השימוש באפליקציה מותר מגיל 14 ומעלה
              </p>
            )}
            {isDobInvalid && (
              <p className="text-red-500 text-sm font-medium text-right">
                תאריך לא תקין
              </p>
            )}
          </div>

          {/* Gender Selection */}
          <div className="space-y-2">
            <label className="block text-slate-800 font-bold text-sm text-right pr-1">
              מה המגדר שלך?
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
                <span>זכר</span>
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
                <span>נקבה</span>
              </button>
            </div>
          </div>

        </form>
      </div>

      {/* Action Button */}
      <div className="w-full max-w-md mx-auto px-6 pb-safe pb-6">
        <motion.button
          onClick={handleContinue}
          disabled={!isFormComplete || loading}
          whileTap={{ scale: isFormComplete && !loading ? 0.97 : 1 }}
          className={`w-full py-4 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-2 shadow-lg ${
            isFormComplete && !loading
              ? 'bg-[#5BC2F2] text-white hover:bg-[#4AB1E1] active:shadow-xl' 
              : 'bg-slate-200 text-slate-400 cursor-not-allowed'
          }`}
        >
          {loading ? (
            <span>שומר...</span>
          ) : (
            <>
              <span>המשך</span>
              <ChevronLeft size={20} />
            </>
          )}
        </motion.button>
      </div>
    </div>
  );
}
