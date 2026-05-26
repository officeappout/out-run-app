'use client';

export const dynamic = 'force-dynamic';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { ChevronRight } from 'lucide-react';
import OnboardingStoryBar from '@/features/user/onboarding/components/OnboardingStoryBar';
import { STRENGTH_PHASES } from '@/features/user/onboarding/constants/onboarding-phases';
import { firePhaseConfetti } from '@/features/user/onboarding/utils/onboarding-confetti';
import { getOnboardingPref } from '@/lib/onboardingPrefs';

/**
 * Resolve uid from multiple sources (in priority order):
 * 1. onAuthStateChanged user
 * 2. auth.currentUser (synchronous snapshot)
 * 3. onboardingPrefs fallback written by Gateway (localStorage backed
 *    by @capacitor/preferences on native — survives iOS hard close)
 */
function resolveUid(authUser: User | null): string | null {
  if (authUser?.uid) return authUser.uid;
  if (auth.currentUser?.uid) return auth.currentUser.uid;
  return getOnboardingPref('gateway_uid');
}

export default function IdentityProfilePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  /** When true the page was opened mid-session to collect a missing name only. */
  const isProfileOnly = searchParams.get('context') === 'profile-only';
  const { profile, updateProfile } = useUserStore();
  const direction = 'rtl';

  // Auth state — always start null so SSR and first client render match
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    birthDay: '',
    birthMonth: '',
    birthYear: '',
    gender: '' as 'male' | 'female' | 'other' | '',
  });

  // Refs for auto-tabbing
  const nameInputRef = useRef<HTMLInputElement>(null);
  const dayInputRef = useRef<HTMLInputElement>(null);
  const monthInputRef = useRef<HTMLInputElement>(null);
  const yearInputRef = useRef<HTMLInputElement>(null);
  const genderSectionRef = useRef<HTMLDivElement>(null);

  // Validation states
  const [hasDobError, setHasDobError] = useState(false);
  const [isUnder14, setIsUnder14] = useState(false);
  const [isDobInvalid, setIsDobInvalid] = useState(false);
  const [loading, setLoading] = useState(false);

  // Pre-fill from existing profile if available
  useEffect(() => {
    if (profile?.core?.name) setFormData(prev => ({ ...prev, name: profile.core.name }));
    if (profile?.core?.gender) setFormData(prev => ({ ...prev, gender: profile.core.gender as 'male' | 'female' | 'other' }));
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

  // Check if form is complete — standard onboarding flow (requires zero-padded inputs)
  const isFormComplete = 
    formData.name.trim().length > 0 &&
    formData.birthDay.length === 2 &&
    formData.birthMonth.length === 2 &&
    formData.birthYear.length === 4 &&
    formData.gender !== '' &&
    !hasDobError;

  // Relaxed gate for the profile-only detour from the community wizard.
  // Checks parsed integer ranges so single-digit day/month entries ("5", "3")
  // are accepted without requiring zero-padding ("05", "03").
  const parsedDay   = parseInt(formData.birthDay, 10);
  const parsedMonth = parseInt(formData.birthMonth, 10);
  const parsedYear  = parseInt(formData.birthYear, 10);
  const isProfileOnlyComplete =
    formData.name.trim().length >= 2 &&
    formData.gender !== '' &&
    parsedDay >= 1 && parsedDay <= 31 &&
    parsedMonth >= 1 && parsedMonth <= 12 &&
    formData.birthYear.length === 4 && parsedYear >= 1900 && parsedYear <= new Date().getFullYear() &&
    !hasDobError;

  /** Single source of truth for the button's enabled state. */
  const canSubmit = isProfileOnly ? isProfileOnlyComplete : isFormComplete;

  // Handle submit
  const handleContinue = async () => {
    if (!canSubmit || loading) return;

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

      if (isProfileOnly) {
        // ── Profile-only context (entered from community wizard) ─────────────
        // Only patch the three identity fields; never touch onboarding status
        // or any other core fields the user already has.
        await updateDoc(doc(db, 'users', uid), {
          'core.name': formData.name,
          'core.gender': formData.gender,
          'core.birthDate': birthDate,
          updatedAt: serverTimestamp(),
        });

        // Optimistic in-memory sync — spread the existing core so TypeScript
        // sees a complete CoreProfile, then override the three changed fields.
        // updateProfile deep-merges into core, so every other field
        // (authorityId, affiliations, accessLevel, etc.) is preserved.
        // calculateProfileCompletion() re-runs synchronously on the next render
        // of ProfileCompletionWidget / ProfileProgressBar, instantly ticking the
        // "שם מלא" (name) and "תאריך לידה" (dob) checklist items green.
        if (profile?.core) {
          updateProfile({
            core: {
              ...profile.core,
              name: formData.name,
              gender: formData.gender as 'male' | 'female' | 'other',
              birthDate,
            },
          });
        }

        router.push('/community?openCreate=true');
      } else {
        // ── Standard onboarding flow ─────────────────────────────────────────
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
      }
    } catch (error) {
      console.error('[Identity] Error saving profile:', error);
      alert('שגיאה בשמירת הפרופיל');
      setLoading(false);
    }
  };

  // Only resolve uid after hydration so SSR and first client render both
  // produce null → loading spinner (no mismatch).
  const resolvedUid = isHydrated ? resolveUid(authUser) : null;

  useEffect(() => {
    if (!isHydrated) return;
    if (authReady && !resolveUid(authUser)) {
      console.warn('[Profile] Auth settled with no uid — redirecting to /gateway');
      router.replace('/gateway');
    }
  }, [authReady, isHydrated, authUser, router]);

  if (!resolvedUid) {
    return (
      <div className="h-[100dvh] bg-gradient-to-b from-slate-50 via-white to-slate-50 flex flex-col items-center justify-center overflow-hidden" dir={direction}>
        <Loader2 size={36} className="text-[#5BC2F2] animate-spin mb-4" />
        <p className="text-slate-400 text-sm font-medium" style={{ fontFamily: 'var(--font-simpler)' }}>
          מאמת זהות...
        </p>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] bg-gradient-to-b from-slate-50 via-white to-slate-50 flex flex-col overflow-hidden" dir={direction}>
      {/* Story bar — fixed to top so it never scrolls with form content */}
      {!isProfileOnly && (
        <div
          className="relative flex-shrink-0 bg-white z-10"
          style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
        >
          <OnboardingStoryBar
            totalPhases={STRENGTH_PHASES.TOTAL}
            currentPhase={STRENGTH_PHASES.PROFILE}
            phaseLabel={STRENGTH_PHASES.labels[STRENGTH_PHASES.PROFILE]}
          />
          {/* Back button — exits to /gateway (the entry point for this page) */}
          <button
            onClick={() => {
              const hasHistory = typeof window !== 'undefined' && window.history.length > 1;
              if (hasHistory) router.back();
              else router.push('/gateway');
            }}
            className="absolute right-3 top-0 z-20 flex items-center justify-center w-11 h-11 rounded-full bg-white/70 shadow-sm active:scale-95 transition-transform"
            style={{ marginTop: 'env(safe-area-inset-top, 0px)' }}
            aria-label="חזרה"
          >
            <ChevronRight size={22} className="text-slate-600" />
          </button>
        </div>
      )}

      {/* Main Content — only this region scrolls on small viewports */}
      <div className="flex-1 min-h-0 overflow-y-auto w-full max-w-md mx-auto px-6 pt-4 pb-2">
        {/* Title + Lemur Guide */}
        <div className="flex flex-row items-center gap-4 mb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/lemur/lemur_notepad.png"
            alt=""
            className="w-1/4 max-w-[100px] shrink-0 object-contain drop-shadow-md pointer-events-none"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
          <div className="flex-1 text-right">
            <h2 className="text-2xl font-black text-slate-900 mb-1">נעים להכיר! 👋</h2>
            <div className="text-sm font-medium text-slate-500 leading-relaxed">
              {isProfileOnly ? (
                <>
                  היי אני קלי המאמן האישי שלך! כדי להקים את הקהילה החדשה, נשאר רק להגדיר כמה פרטים בסיסיים בפרופיל.
                </>
              ) : (
                <>
                  אני קלי, המאמן האישי שלך.
                  <br />
                  כדי שנתפור לך תוכנית מדויקת, אני צריך רק כמה פרטים קטנים.
                </>
              )}
            </div>
          </div>
        </div>

        <form className="space-y-5 px-1" onSubmit={(e) => e.preventDefault()}>
          {/* Name Input */}
          <div className="space-y-2">
            <label className="block text-slate-800 font-bold text-sm text-right pr-1">
              איך קוראים לך?
            </label>
            <div className="relative">
              <input
                ref={nameInputRef}
                type="text"
                enterKeyHint="next"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); dayInputRef.current?.focus(); }
                }}
                className="w-full bg-white text-black placeholder-slate-400 rounded-2xl border-2 border-slate-200 py-4 px-5 shadow-sm focus:border-[#5BC2F2] focus:ring-4 focus:ring-[#5BC2F2]/10 outline-none transition-all font-medium font-simpler text-right"
                placeholder="השם שלך כאן..."
                autoFocus
              />
            </div>
          </div>

          {/* Date of Birth */}
          <div className="space-y-2">
            <label className="block text-slate-800 font-bold text-sm text-right pr-1">
              מתי חוגגים לך יום הולדת? 🎂
            </label>
            <p className="text-sm text-gray-400 text-right pr-1">
              עוזר לנו להתאים את עצימות האימון לגילך.
            </p>
            <div className="flex gap-3 flex-row">
              {/* Day */}
              <input
                ref={dayInputRef}
                type="text"
                inputMode="numeric"
                enterKeyHint="next"
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
                enterKeyHint="next"
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
                enterKeyHint="done"
                pattern="[0-9]*"
                maxLength={4}
                value={formData.birthYear}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                  setFormData({...formData, birthYear: value});
                  if (value.length === 4) {
                    yearInputRef.current?.blur();
                    genderSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }
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
          <div className="space-y-2" ref={genderSectionRef}>
            <label className="block text-slate-800 font-bold text-sm text-right pr-1">
              מה המגדר שלך?
            </label>
            <p className="text-sm text-gray-400 text-right pr-1">
              קריטי לאלגוריתם שלנו לחישוב מדדי כוח והוצאה קלורית.
            </p>
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
                <span>גבר</span>
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
                <span>אישה</span>
              </button>
              <button 
                type="button"
                onClick={() => setFormData({...formData, gender: 'other'})}
                className={`flex-1 py-4 rounded-2xl font-semibold transition-all active:scale-[0.97] border-2 flex items-center justify-center gap-1.5 text-sm
                  ${formData.gender === 'other' 
                    ? 'border-[#5BC2F2] bg-[#5BC2F2] text-white shadow-md' 
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'}`}
              >
                <span className="text-lg">✨</span>
                <span>אחר</span>
              </button>
            </div>
          </div>

        </form>
      </div>

      {/* Action Button — sits outside the scroll area, always visible */}
      <div className="flex-shrink-0 w-full max-w-md mx-auto px-6" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
        <motion.button
          onClick={handleContinue}
          disabled={!canSubmit || loading}
          whileTap={{ scale: canSubmit && !loading ? 0.97 : 1 }}
          className={`w-full py-4 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-2 shadow-lg ${
            canSubmit && !loading
              ? 'bg-[#5BC2F2] text-white hover:bg-[#4AB1E1] active:shadow-xl' 
              : 'bg-slate-200 text-slate-400 cursor-not-allowed'
          }`}
        >
          {loading ? (
            <span>שומר...</span>
          ) : isProfileOnly ? (
            <>
              <span>שמור וחזור ליצירת הקהילה</span>
              <ChevronLeft size={20} />
            </>
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
