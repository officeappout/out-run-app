'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import OnboardingStoryBar from '@/features/user/onboarding/components/OnboardingStoryBar';
import { STRENGTH_PHASES } from '@/features/user/onboarding/constants/onboarding-phases';
import { firePhaseConfetti } from '@/features/user/onboarding/utils/onboarding-confetti';
import { getOnboardingPref } from '@/lib/onboardingPrefs';
import { resolveJoinLanding } from '@/lib/resolveJoinLanding';

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

const GENDER_OPTIONS = [
  { value: 'male',   label: 'גבר',  emoji: '🙋‍♂️' },
  { value: 'female', label: 'אישה', emoji: '🙋‍♀️' },
  { value: 'other',  label: 'אחר',  emoji: '✨' },
] as const;

type Gender = 'male' | 'female' | 'other' | '';

export default function IdentityProfilePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  /** When true the page was opened mid-session to collect a missing name only. */
  const isProfileOnly = searchParams.get('context') === 'profile-only';
  /** Fast path: collect identity then land at the deep-link destination. */
  const isExpress = searchParams.get('context') === 'express';
  const { profile, updateProfile, refreshProfile } = useUserStore();
  const direction = 'rtl';

  // Auth state — always start null so SSR and first client render match
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  // Group name stored by the join page when routing here from a group invite link.
  const [pendingGroupName, setPendingGroupName] = useState<string | null>(null);

  useEffect(() => {
    setIsHydrated(true);
    if (isExpress) {
      setPendingGroupName(localStorage.getItem('pending_invite_group_name'));
    }
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthReady(true);
    });
    return () => unsub();
  }, [isExpress]);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    birthDay: '',
    birthMonth: '',
    birthYear: '',
    gender: '' as Gender,
  });

  // Focus refs for the automated flow:
  // Gender tap → dayInputRef → monthInputRef → yearInputRef → nameInputRef
  const dayInputRef   = useRef<HTMLInputElement>(null);
  const monthInputRef = useRef<HTMLInputElement>(null);
  const yearInputRef  = useRef<HTMLInputElement>(null);
  const nameInputRef  = useRef<HTMLInputElement>(null);

  // Validation states
  const [hasDobError, setHasDobError]   = useState(false);
  const [isUnder14, setIsUnder14]       = useState(false);
  const [isDobInvalid, setIsDobInvalid] = useState(false);
  const [loading, setLoading]           = useState(false);

  // True only in express mode AND when a group invite is pending — drives context-specific copy.
  const isJoinContext = isExpress && !!pendingGroupName;

  // Pre-fill from existing profile if available
  useEffect(() => {
    if (profile?.core?.name)
      setFormData(prev => ({ ...prev, name: profile.core.name }));
    if (profile?.core?.gender)
      setFormData(prev => ({ ...prev, gender: profile.core.gender as Gender }));
    if (profile?.core?.birthDate) {
      const bd = profile.core.birthDate;
      const date = bd instanceof Date ? bd : new Date(bd);
      if (!isNaN(date.getTime())) {
        setFormData(prev => ({
          ...prev,
          birthDay:   String(date.getDate()).padStart(2, '0'),
          birthMonth: String(date.getMonth() + 1).padStart(2, '0'),
          birthYear:  String(date.getFullYear()),
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

    const day   = parseInt(birthDay,   10);
    const month = parseInt(birthMonth, 10);
    const year  = parseInt(birthYear,  10);

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

    const today      = new Date();
    const age        = today.getFullYear() - birthDate.getFullYear();
    const monthDiff  = today.getMonth()   - birthDate.getMonth();
    const dayDiff    = today.getDate()    - birthDate.getDate();
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

  // Completion gates
  // Use parseInt range checks for day/month so single-digit entries (e.g. '5'
  // for May) are accepted without requiring a leading zero. The onBlur handler
  // below will auto-pad to '05' on field exit, but the gate must not block
  // the user before that normalisation runs.
  const _parsedGateDay   = parseInt(formData.birthDay,   10);
  const _parsedGateMonth = parseInt(formData.birthMonth, 10);
  const _parsedGateYear  = parseInt(formData.birthYear,  10);
  const isFormComplete =
    formData.name.trim().length > 0 &&
    _parsedGateDay   >= 1 && _parsedGateDay   <= 31 &&
    _parsedGateMonth >= 1 && _parsedGateMonth <= 12 &&
    formData.birthYear.length === 4 && _parsedGateYear >= 1900 && _parsedGateYear <= new Date().getFullYear() &&
    formData.gender !== '' &&
    !hasDobError;

  // Relaxed gate for the profile-only detour (single-digit day/month accepted)
  const parsedDay   = parseInt(formData.birthDay,   10);
  const parsedMonth = parseInt(formData.birthMonth, 10);
  const parsedYear  = parseInt(formData.birthYear,  10);
  const isProfileOnlyComplete =
    formData.name.trim().length >= 2 &&
    formData.gender !== '' &&
    parsedDay   >= 1 && parsedDay   <= 31 &&
    parsedMonth >= 1 && parsedMonth <= 12 &&
    formData.birthYear.length === 4 && parsedYear >= 1900 && parsedYear <= new Date().getFullYear() &&
    !hasDobError;

  const canSubmit = isProfileOnly ? isProfileOnlyComplete : isFormComplete;

  // Submit handler
  const handleContinue = async () => {
    if (!canSubmit || loading) return;
    setLoading(true);
    try {
      const uid = resolveUid(authUser);
      if (!uid) {
        console.error('[Profile] No uid from any source — waiting for auth');
        alert('לא נמצא משתמש מחובר. נסה לרענן את הדף.');
        setLoading(false);
        return;
      }

      // ID token for the server route — ageGroup is computed server-side only.
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        alert('שגיאה באימות המשתמש. נסה לרענן את הדף.');
        setLoading(false);
        return;
      }

      const birthDay   = parseInt(formData.birthDay,   10);
      const birthMonth = parseInt(formData.birthMonth, 10);
      const birthYear  = parseInt(formData.birthYear,  10);

      const res = await fetch('/api/user/complete-profile', {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          name:      formData.name,
          gender:    formData.gender,
          birthDay,
          birthMonth,
          birthYear,
          // isNewUser drives the full setDoc scaffold in the API route
          isNewUser: !isProfileOnly && !isExpress,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const errCode = (err as { error?: string }).error ?? 'Server error';
        if (errCode === 'under-minimum-age') {
          setIsUnder14(true);
          setHasDobError(true);
          setLoading(false);
          return;
        }
        throw new Error(errCode);
      }

      const data = await res.json() as { ok: boolean; ageGroup: 'minor' | 'adult' };
      const birthDate = new Date(birthYear, birthMonth - 1, birthDay);

      // Sync ageGroup to the local store so downstream screens (join page gate,
      // presence logic) see it immediately without waiting for Firestore re-sync.
      if (profile?.core) {
        updateProfile({
          core: {
            ...profile.core,
            name:      formData.name,
            gender:    formData.gender as 'male' | 'female' | 'other',
            birthDate,
            ageGroup:  data.ageGroup,
          },
        });
      } else {
        // New anonymous user — no profile in store yet.
        // Load the document that complete-profile just wrote so downstream
        // gates (ageGroup checks, join confirmation) see a populated profile.
        await refreshProfile();
      }

      // Navigate
      if (isProfileOnly) {
        router.push('/community?openCreate=true');
      } else if (isExpress) {
        // Resolve the stored deep-link target (set by native/init.ts)
        const pendingCode    = localStorage.getItem('pending_institution_code');
        const pendingInvite  = localStorage.getItem('pending_invite_code');
        const pendingSession = localStorage.getItem('pending_session_token');
        const pendingGroup   = localStorage.getItem('pending_community_group_id');

        if (pendingCode) {
          router.push(`/onboarding-new/access-code?code=${encodeURIComponent(pendingCode)}`);
        } else if (pendingInvite) {
          // Confirm membership inline — no second tap needed. The user clicked
          // "הצטרף" → identity screen → "המשך" → community. One linear flow.
          try {
            const confirmToken = await auth.currentUser?.getIdToken();
            if (confirmToken) {
              const confirmRes = await fetch('/api/join/confirm', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${confirmToken}` },
                body:    JSON.stringify({ inviteCode: pendingInvite }),
              });
              if (confirmRes.ok) {
                const { groupId } = await confirmRes.json() as { groupId: string };
                localStorage.removeItem('pending_invite_code');
                router.push(resolveJoinLanding(groupId));
              } else {
                // Confirm failed — fall back to the join page where the user can retry.
                router.push(`/join/${encodeURIComponent(pendingInvite)}`);
              }
            } else {
              router.push(`/join/${encodeURIComponent(pendingInvite)}`);
            }
          } catch {
            router.push(`/join/${encodeURIComponent(pendingInvite)}`);
          }
        } else if (pendingSession) {
          router.push(`/session/${encodeURIComponent(pendingSession)}`);
        } else if (pendingGroup) {
          router.push(`/community?groupId=${encodeURIComponent(pendingGroup)}`);
        } else {
          router.push('/home');
        }
      } else {
        // Full onboarding: pass identity to downstream screens via sessionStorage
        sessionStorage.setItem('onboarding_personal_name',   formData.name);
        sessionStorage.setItem('onboarding_personal_gender', formData.gender);
        sessionStorage.setItem('onboarding_personal_dob',    birthDate.toISOString().split('T')[0]);
        firePhaseConfetti();
        router.push('/onboarding-new/program-path');
      }
    } catch (error) {
      console.error('[Identity] Error saving profile:', error);
      alert('שגיאה בשמירת הפרופיל');
      setLoading(false);
    }
  };

  const resolvedUid = isHydrated ? resolveUid(authUser) : null;

  useEffect(() => {
    if (!isHydrated) return;
    if (authReady && !resolveUid(authUser)) {
      // Guard: if an express join flow is in progress, the anon auth created by
      // handleJoinClick may not have propagated to onAuthStateChanged yet.
      // resolveUid already checks auth.currentUser synchronously as a fallback,
      // but if that also returns null AND we have a pending invite, wait rather
      // than bouncing back to gateway — the auth state will arrive momentarily.
      if (
        isExpress &&
        typeof window !== 'undefined' &&
        localStorage.getItem('pending_invite_code')
      ) {
        return;
      }
      console.warn('[Profile] Auth settled with no uid — redirecting to /gateway');
      router.replace('/gateway');
    }
  }, [authReady, isHydrated, authUser, isExpress, router]);

  if (!resolvedUid) {
    return (
      <div
        className="h-full bg-gradient-to-b from-slate-50 via-white to-slate-50 flex flex-col items-center justify-center overflow-hidden"
        dir={direction}
      >
        <Loader2 size={36} className="text-[#5BC2F2] animate-spin mb-4" />
        <p className="text-slate-400 text-sm font-medium" style={{ fontFamily: 'var(--font-simpler)' }}>
          מאמת זהות...
        </p>
      </div>
    );
  }

  // Shared input class builders
  const dateInputClass = (hasError: boolean) =>
    `bg-white text-black text-center rounded-xl border-2 py-3.5 px-2 shadow-sm focus:ring-4 focus:ring-[#5BC2F2]/10 outline-none transition-all font-semibold font-simpler placeholder:text-slate-300 placeholder:font-normal ${
      hasError ? 'border-red-300 focus:border-red-400' : 'border-slate-200 focus:border-[#5BC2F2]'
    }`;

  return (
    <div
      className="h-full bg-gradient-to-b from-slate-50 via-white to-slate-50 flex flex-col overflow-hidden"
      dir={direction}
    >
      {/* Navigation header — in-flow flex row, never absolutely positioned */}
      {!isProfileOnly && (
        <header
          className="flex-shrink-0 bg-white z-10 flex items-center gap-2 px-3 pb-2.5"
          style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
        >
          <button
            onClick={() => {
              const hasHistory = typeof window !== 'undefined' && window.history.length > 1;
              if (hasHistory) router.back();
              else router.push('/gateway');
            }}
            className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-full bg-slate-100/80 active:bg-slate-200 transition-colors touch-manipulation"
            aria-label="חזרה"
          >
            <ChevronRight size={22} className="text-slate-600" />
          </button>

          <div className="flex-1 min-h-[36px] flex flex-col justify-center">
            <OnboardingStoryBar
              totalPhases={isExpress ? 1 : STRENGTH_PHASES.TOTAL}
              currentPhase={isExpress ? 1 : STRENGTH_PHASES.PROFILE}
              phaseLabel={isExpress ? undefined : STRENGTH_PHASES.labels[STRENGTH_PHASES.PROFILE]}
              noPadding
            />
          </div>

          <div className="flex-shrink-0 w-9" aria-hidden />
        </header>
      )}

      {/* Scrollable content */}
      <div className="flex-1 min-h-0 overflow-y-auto w-full max-w-md mx-auto px-6 pt-4 pb-2">
        {/* ── Page entry animation ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        >

        {/* Mascot + intro */}
        <div className="mb-6">
          {/* Top row: character (pop-in) + heading */}
          <div className="flex flex-row items-center gap-3">
            <motion.div
              style={{ flexShrink: 0 }}
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.35, ease: [0.34, 1.56, 0.64, 1] }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/assets/lemur/lemur_notepad.png"
                alt=""
                className="w-32 h-32 object-contain drop-shadow-md pointer-events-none -scale-x-100"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
              />
            </motion.div>
            <h2 className="text-2xl font-black text-slate-900 text-right">נעים להכיר! 👋</h2>
          </div>

          {/* Speech bubble — full width, tail points up-right toward the lemur */}
          <motion.div
            className="relative mt-3 bg-white border border-slate-200 rounded-2xl px-4 py-3 shadow-sm"
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.28, delay: 0.2, ease: 'easeOut' }}
          >
            {/* Tail — border layer (upward triangle, right-aligned toward lemur) */}
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                top: '-9px',
                right: '52px',
                width: 0,
                height: 0,
                borderLeft: '9px solid transparent',
                borderRight: '9px solid transparent',
                borderBottom: '9px solid #e2e8f0',
              }}
            />
            {/* Tail — white fill layer */}
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                top: '-7px',
                right: '53px',
                width: 0,
                height: 0,
                borderLeft: '8px solid transparent',
                borderRight: '8px solid transparent',
                borderBottom: '8px solid white',
              }}
            />

            {isJoinContext ? (
              /* Join-context two-line layout — group name prominent, no word animation */
              <div className="text-right" dir="rtl">
                <p className="text-base font-black text-slate-900 mb-1">
                  מצטרפים לקבוצת {pendingGroupName}
                </p>
                <p className="text-sm font-medium text-slate-600">
                  היי, אני קלי 👋 עוד כמה פרטים קטנים ומצטרפים.
                </p>
              </div>
            ) : (
              /* Word-by-word mist-in animation for non-join contexts */
              <motion.p
                className="text-sm font-medium text-slate-600 leading-relaxed text-right"
                dir="rtl"
                variants={{
                  hidden: {},
                  show: { transition: { delayChildren: 0.35, staggerChildren: 0.05 } },
                }}
                initial="hidden"
                animate="show"
              >
                {(isProfileOnly
                  ? 'היי אני קלי המאמן האישי שלך! כדי להקים את הקהילה החדשה, נשאר רק להגדיר כמה פרטים בסיסיים בפרופיל.'
                  : 'אני קלי, המאמן האישי שלך. כדי שנתפור לך תוכנית מדויקת, אני צריך רק כמה פרטים קטנים.'
                ).split(' ').map((word, i) => (
                  <React.Fragment key={i}>
                    <motion.span
                      variants={{
                        hidden: { opacity: 0, y: 4, filter: 'blur(4px)' },
                        show:   { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.35, ease: 'easeOut' } },
                      }}
                      style={{ display: 'inline-block' }}
                    >
                      {word}
                    </motion.span>
                    {' '}
                  </React.Fragment>
                ))}
              </motion.p>
            )}
          </motion.div>
        </div>

        <form className="space-y-8 px-1" onSubmit={(e) => e.preventDefault()}>

          {/* ── Step 1: Gender ──────────────────────────────────────────────── */}
          {/* No keyboard opens on mount — user taps a gender button first.     */}
          {/* Tapping auto-advances focus to the Day field (Step 2).            */}
          <div className="space-y-2">
            <label className="block text-slate-900 font-black text-lg text-right pr-1">
              איך היית רוצה שנפנה אלייך?
            </label>
            <p className="text-sm text-gray-400 text-right pr-1">
              {isJoinContext
                ? 'רק כדי לדעת איך לפנות.'
                : 'רק כדי שנדע מתי לפרגן לך ב\'כל הכבוד מלך!\' ומתי ב\'אלופה, שברת את המסך!\' 👑 (ובשביל דיוק המדדים הפיזיולוגיים שלך, כמובן).'}
            </p>
            <div className="flex gap-3">
              {GENDER_OPTIONS.map(({ value, label, emoji }) => (
                <motion.button
                  key={value}
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                  onClick={() => {
                    setFormData(prev => ({ ...prev, gender: value }));
                    // Auto-advance: move focus to the Day field so the numeric
                    // keyboard opens immediately. Called directly in the click
                    // handler so iOS treats it as a user-gesture focus.
                    dayInputRef.current?.focus();
                  }}
                  className={`flex-1 py-3 rounded-full font-semibold transition-colors border-2 flex items-center justify-center gap-2 ${
                    value === 'other' ? 'text-sm gap-1.5' : ''
                  } ${
                    formData.gender === value
                      ? 'border-[#00BAF7] bg-[#00BAF7]/10 text-[#0090CC] shadow-sm'
                      : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  <span className={value === 'other' ? 'text-lg' : 'text-xl'}>{emoji}</span>
                  <span>{label}</span>
                </motion.button>
              ))}
            </div>
          </div>

          {/* ── Step 2: Date of Birth ──────────────────────────────────────── */}
          {/* Day→Month→Year auto-tab on 2/2/4 digits.                         */}
          {/* Year complete → auto-advance focus to the Name field (Step 3).   */}
          <div className="space-y-2">
            <label className="block text-slate-900 font-black text-lg text-right pr-1">
              מתי חוגגים לך יום הולדת? 🎂
            </label>
            <p className="text-sm text-gray-400 text-right pr-1">
              {isJoinContext ? 'כדי שנתאים את החוויה לגיל.' : 'עוזר לנו להתאים את עצימות האימון לגילך.'}
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
                  setFormData(prev => ({ ...prev, birthDay: value }));
                  if (value.length === 2) monthInputRef.current?.focus();
                }}
                onBlur={() => {
                  // Normalise single-digit day to '05' style on field exit.
                  // This restores the auto-tab focus chain and satisfies the
                  // submit gate for users who don't type a leading zero.
                  if (formData.birthDay.length === 1) {
                    setFormData(prev => ({ ...prev, birthDay: prev.birthDay.padStart(2, '0') }));
                  }
                }}
                placeholder="יום"
                className={`w-16 ${dateInputClass(hasDobError)}`}
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
                  setFormData(prev => ({ ...prev, birthMonth: value }));
                  if (value.length === 2) yearInputRef.current?.focus();
                }}
                onBlur={() => {
                  // Normalise single-digit month to '05' style on field exit.
                  if (formData.birthMonth.length === 1) {
                    setFormData(prev => ({ ...prev, birthMonth: prev.birthMonth.padStart(2, '0') }));
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Backspace' && formData.birthMonth === '')
                    dayInputRef.current?.focus();
                }}
                onFocus={() => {
                  setTimeout(() => {
                    monthInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }, 150);
                }}
                placeholder="חודש"
                className={`w-16 ${dateInputClass(hasDobError)}`}
              />

              <span className="text-slate-300 self-center text-lg font-light">/</span>

              {/* Year */}
              <input
                ref={yearInputRef}
                type="text"
                inputMode="numeric"
                enterKeyHint="next"
                pattern="[0-9]*"
                maxLength={4}
                value={formData.birthYear}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                  setFormData(prev => ({ ...prev, birthYear: value }));
                  if (value.length === 4) {
                    // Auto-advance: switch from numeric to text keyboard by focusing name.
                    // Direct call inside onChange = still a user-gesture context on iOS.
                    nameInputRef.current?.focus();
                    // Scroll the name field into view after the keyboard transition settles.
                    setTimeout(() => {
                      nameInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 150);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Backspace' && formData.birthYear === '')
                    monthInputRef.current?.focus();
                }}
                onFocus={() => {
                  setTimeout(() => {
                    yearInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }, 150);
                }}
                placeholder="שנה"
                className={`w-20 ${dateInputClass(hasDobError)}`}
              />
            </div>

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

          {/* ── Step 3: Name ───────────────────────────────────────────────── */}
          {/* No autoFocus — keyboard arrives only after Year is filled.        */}
          {/* Enter key submits the form if all fields are complete.            */}
          <div className="space-y-2">
            <label className="block text-slate-900 font-black text-lg text-right pr-1">
              איך קוראים לך?
            </label>
            <input
              ref={nameInputRef}
              type="text"
              enterKeyHint="done"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (canSubmit && !loading) handleContinue();
                }
              }}
              onFocus={() => {
                setTimeout(() => {
                  nameInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 150);
              }}
              className="w-full bg-white text-black placeholder-slate-400 rounded-2xl border-2 border-slate-200 py-4 px-5 shadow-sm focus:border-[#5BC2F2] focus:ring-4 focus:ring-[#5BC2F2]/10 outline-none transition-all font-medium font-simpler text-right"
              placeholder="השם שלך כאן..."
            />
          </div>

        </form>
        </motion.div>
      </div>

      {/* Continue button — pinned outside the scroll area */}
      <div
        className="flex-shrink-0 w-full max-w-md mx-auto px-6"
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
      >
        <motion.button
          onClick={handleContinue}
          disabled={!canSubmit || loading}
          whileTap={{ scale: canSubmit && !loading ? 0.97 : 1 }}
          className={`w-full py-4 rounded-full font-black text-lg transition-all duration-200 flex items-center justify-center gap-2 ${
            canSubmit && !loading
              ? 'text-white active:scale-95'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
          }`}
          style={canSubmit && !loading ? {
            background: 'linear-gradient(98deg, #0CF2E3 0%, #00BAF7 98%)',
            boxShadow: '0 8px 24px rgba(0,186,247,0.35)',
            fontFamily: 'var(--font-simpler)',
          } : { fontFamily: 'var(--font-simpler)' }}
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
              <span>{formData.gender === 'female' ? 'המשיכי' : 'המשך'}</span>
              <ChevronLeft size={20} />
            </>
          )}
        </motion.button>
      </div>
    </div>
  );
}
