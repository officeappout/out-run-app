'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, AlertTriangle, X } from 'lucide-react';
import { linkWithGoogleAccount, linkWithAppleAccount } from '@/lib/auth.service';
import { useOnboardingV2 } from '../../hooks/useOnboardingV2';
import { useT } from '@/hooks/useT';
import { onboarding } from '@/messages/ns/onboarding';
import type { NamespaceKey } from '@/lib/i18n/catalogs';

interface AccountSecureStepProps {
  onNext: (secured: boolean, method?: string, email?: string) => void;
  onSkip: () => void;
}

export default function AccountSecureStep({ onNext, onSkip }: AccountSecureStepProps) {
  // enable_home_v2 — styling only; auth handlers/order/brand marks unchanged.
  const v2 = useOnboardingV2();
  const t = useT(onboarding);
  const [loading, setLoading] = useState<'google' | 'apple' | null>(null);
  // The error's catalog key — translated at render.
  const [error, setError] = useState<NamespaceKey<typeof onboarding> | null>(null);
  const [showWarningModal, setShowWarningModal] = useState(false);

  // Hide Apple button on Android — ASAuthorizationController is iOS-only.
  const [isAndroid, setIsAndroid] = useState(false);
  useEffect(() => {
    const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
    setIsAndroid(cap?.getPlatform?.() === 'android');
  }, []);

  // Get user name from sessionStorage
  const userName = typeof window !== 'undefined'
    ? sessionStorage.getItem('onboarding_personal_name') || 'OUTer'
    : 'OUTer';

  // Handle Google account linking
  const handleGoogleLink = async () => {
    setLoading('google');
    setError(null);

    try {
      const { user, error: linkError } = await linkWithGoogleAccount();

      if (linkError) {
        if (linkError === 'google_canceled') {
          // User dismissed the native sheet — silent no-op
          setLoading(null);
          return;
        }
        if (linkError === 'google_timeout') {
          setError('steps.account.error.googleTimeout');
          setLoading(null);
          return;
        }
        if (linkError === 'google_account_exists') {
          setError('steps.account.error.googleExists');
        } else if (linkError === 'popup_closed') {
          setError('steps.account.error.popupClosed');
        } else if (linkError === 'not_anonymous') {
          // Already authenticated - auto-proceed
          onNext(true, 'google');
          return;
        } else {
          setError('steps.account.error.google');
        }
        setLoading(null);
        return;
      }

      if (user) {
        onNext(true, 'google', user.email || undefined);
      }
    } catch {
      setError('steps.account.error.unexpected');
      setLoading(null);
    }
  };

  // Handle Apple account linking — native ASAuthorizationController sheet
  const handleAppleLink = async () => {
    setLoading('apple');
    setError(null);

    try {
      const { user, error: linkError } = await linkWithAppleAccount();

      if (linkError) {
        if (linkError === 'apple_canceled') {
          setLoading(null);
          return;
        }
        if (linkError === 'apple_timeout') {
          setError('steps.account.error.appleTimeout');
          setLoading(null);
          return;
        }
        if (linkError === 'apple_account_exists') {
          setError('steps.account.error.appleExists');
        } else if (linkError === 'not_anonymous') {
          onNext(true, 'apple');
          return;
        } else {
          setError('steps.account.error.apple');
        }
        setLoading(null);
        return;
      }

      if (user) {
        onNext(true, 'apple', user.email || undefined);
      }
    } catch {
      setError('steps.account.error.unexpected');
      setLoading(null);
    }
  };

  // Handle skip (show warning modal)
  const handleSkipClick = () => {
    setShowWarningModal(true);
  };

  // Confirm skip without backup
  const handleConfirmSkip = () => {
    setShowWarningModal(false);
    onSkip();
  };

  const isLoading = loading !== null;
  // v2 copy only: gendered forms when the profile step recorded a gender.
  const isFemale =
    v2 && typeof window !== 'undefined' && sessionStorage.getItem('onboarding_personal_gender') === 'female';

  return (
    <div className={v2 ? 'mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center bg-v2-surface px-5 py-8 font-simpler text-v2-ink' : 'flex flex-col items-center justify-center min-h-[70vh] px-6 py-8'} dir="rtl">
      {/* Icon */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 200 }}
        className="relative mb-8"
      >
        {v2 ? (
          <div className="grid h-20 w-20 place-items-center rounded-full bg-v2-tint ring-1 ring-inset ring-v2-accent/40">
            <Shield className="h-10 w-10 text-v2-deep" />
          </div>
        ) : (
          <>
            <div className="absolute inset-0 bg-[#00F0FF] rounded-full blur-2xl opacity-20 animate-pulse" />
            <div className="relative w-20 h-20 bg-gradient-to-br from-[#00F0FF] to-[#0047FF] rounded-full flex items-center justify-center shadow-lg">
              <Shield className="w-10 h-10 text-white" />
            </div>
          </>
        )}
      </motion.div>

      {/* Headline */}
      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className={v2 ? 'mb-2 text-center text-[26px] font-black !tracking-[-0.02em] text-v2-ink' : 'text-2xl font-bold text-slate-900 text-center mb-3'}
      >
        {t('steps.account.title', { name: userName })}
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className={v2 ? 'mb-8 max-w-md text-center text-[15px] font-medium text-v2-ink-2' : 'text-slate-500 text-center mb-8 max-w-md'}
      >
        {t('steps.account.subtitle', { gender: v2 && isFemale ? 'female' : 'other' })}
      </motion.p>

      {/* Primary CTA: Google Sign-In */}
      <motion.button
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        onClick={handleGoogleLink}
        disabled={isLoading}
        className={v2 ? 'flex h-[52px] w-full max-w-md items-center justify-center gap-3 whitespace-nowrap rounded-full bg-white px-6 shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 mb-3' : 'w-full max-w-md bg-white flex items-center justify-center gap-3 py-4 px-6 rounded-2xl font-bold shadow-md shadow-slate-300/50 transition-all active:scale-[0.98] hover:bg-slate-50 border border-slate-200 disabled:opacity-50 disabled:cursor-not-allowed mb-3'}
      >
        {loading === 'google' ? (
          <div className={v2 ? 'h-5 w-5 animate-spin rounded-full border-2 border-v2-pill-border border-t-v2-deep' : 'w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin'} />
        ) : (
          <img src="https://www.google.com/favicon.ico" alt="G" className="w-5 h-5" />
        )}
        <span className={v2 ? 'truncate text-[16px] font-extrabold text-v2-ink' : 'font-bold text-slate-700'}>
          {loading === 'google' ? t('steps.account.connecting') : t('steps.account.continueGoogle')}
        </span>
      </motion.button>

      {/* Secondary CTA: Apple Sign-In (iOS only). v2 = Apple white button style, so the logo fill flips to black. */}
      {!isAndroid && (
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          onClick={handleAppleLink}
          disabled={isLoading}
          className={v2 ? 'flex h-[52px] w-full max-w-md items-center justify-center gap-3 whitespace-nowrap rounded-full bg-white px-6 shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 mb-6' : 'w-full max-w-md bg-black flex items-center justify-center gap-3 py-4 px-6 rounded-2xl font-bold shadow-md shadow-slate-300/50 transition-all active:scale-[0.98] hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed mb-6'}
        >
          {loading === 'apple' ? (
            <div className={v2 ? 'h-5 w-5 animate-spin rounded-full border-2 border-v2-pill-border border-t-v2-ink' : 'w-5 h-5 border-2 border-gray-500 border-t-white rounded-full animate-spin'} />
          ) : (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill={v2 ? 'black' : 'white'}>
              <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
            </svg>
          )}
          <span className={v2 ? 'truncate text-[16px] font-extrabold text-v2-ink' : 'font-bold text-white'}>
            {loading === 'apple' ? t('steps.account.connecting') : t('steps.account.continueApple')}
          </span>
        </motion.button>
      )}

      {/* Error Message */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={v2 ? 'mb-4 flex w-full max-w-md items-start gap-2 rounded-2xl bg-white px-4 py-3 text-[#b4232a] shadow-v2-ring' : 'w-full max-w-md bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl mb-4 flex items-start gap-2'}
          >
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p className={v2 ? 'text-[12.5px] font-bold' : 'text-sm'}>{t(error)}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Skip Button */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        onClick={handleSkipClick}
        disabled={isLoading}
        className={v2 ? 'whitespace-nowrap py-2 text-[14px] font-extrabold text-v2-deep transition-transform duration-150 ease-v2 active:scale-[0.97] disabled:opacity-50' : 'text-slate-400 hover:text-slate-500 transition-colors text-sm font-medium py-2 disabled:opacity-50'}
      >
        {t('steps.account.skip')}
      </motion.button>

      {/* Warning Modal — Premium Dark Theme */}
      <AnimatePresence>
        {showWarningModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={v2 ? 'fixed inset-0 z-50 flex items-end justify-center bg-[rgba(9,30,50,0.45)] p-0 backdrop-blur-sm sm:items-center sm:p-6' : 'fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-md p-0 sm:p-6'}
            onClick={() => setShowWarningModal(false)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className={v2 ? 'relative w-full rounded-t-[28px] bg-white px-5 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] font-simpler text-v2-ink shadow-v2-sheet sm:max-w-md sm:rounded-v2-card-lg sm:pb-6' : 'relative bg-[#1A1A2E] rounded-t-3xl sm:rounded-2xl p-6 pb-8 sm:pb-6 w-full sm:max-w-md border border-white/10 shadow-[0_0_60px_rgba(0,0,0,0.6)]'}
              dir="rtl"
            >
              {v2 && <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-v2-pill-border" aria-hidden />}
              {/* Close Button */}
              <button
                onClick={() => setShowWarningModal(false)}
                className={v2 ? 'absolute top-4 left-4 grid h-9 w-9 place-items-center rounded-full bg-v2-surface ring-1 ring-inset ring-v2-hairline transition-transform duration-150 ease-v2 active:scale-[0.97]' : 'absolute top-4 left-4 text-gray-500 hover:text-white transition-colors'}
              >
                <X className={v2 ? 'h-[18px] w-[18px] text-v2-ink-2' : 'w-5 h-5'} />
              </button>

              {/* Warning Icon */}
              <div className={v2 ? 'mb-4 mt-2 flex items-center justify-center' : 'flex items-center justify-center mb-5'}>
                <div className={v2 ? 'grid h-14 w-14 place-items-center rounded-full bg-[#fff7e6]' : 'w-14 h-14 bg-yellow-500/10 rounded-full flex items-center justify-center border border-yellow-500/20'}>
                  <AlertTriangle className={v2 ? 'h-7 w-7 text-v2-amber' : 'w-7 h-7 text-yellow-500'} />
                </div>
              </div>

              {/* Title */}
              <h2 className={v2 ? 'mb-3 text-center text-[22px] font-black !tracking-[-0.02em] text-v2-ink' : 'text-xl font-bold text-white text-center mb-4'}>
                {t('steps.account.warning.title')}
              </h2>

              {/* Warning Text */}
              <div className={v2 ? 'mb-6 space-y-3 text-[14px] font-medium leading-relaxed text-v2-ink-2' : 'space-y-3 text-gray-400 text-sm mb-6 leading-relaxed'}>
                <p>
                  {t.rich('steps.account.warning.localOnly', {
                    b: (chunks: React.ReactNode) => <strong className={v2 ? 'font-extrabold text-v2-ink' : 'text-gray-300'}>{chunks}</strong>,
                  })}
                </p>
                <p>
                  {t.rich('steps.account.warning.loss', {
                    gender: isFemale ? 'female' : 'other',
                    b: (chunks: React.ReactNode) => <strong className={v2 ? 'font-extrabold text-v2-ink' : 'text-gray-300'}>{chunks}</strong>,
                  })}
                </p>
                <p className={v2 ? 'font-bold text-v2-deep' : 'text-[#00F0FF]/80'}>
                  {t('steps.account.warning.secureLater', { gender: isFemale ? 'female' : 'other' })}
                </p>
              </div>

              {/* Buttons */}
              <div className="space-y-3">
                <button
                  onClick={() => setShowWarningModal(false)}
                  className={v2 ? 'h-[52px] w-full whitespace-nowrap rounded-full bg-v2-cta text-[16px] font-extrabold text-v2-on-cta shadow-v2-cta transition-transform duration-150 ease-v2 active:scale-[0.97]' : 'w-full bg-gradient-to-r from-[#00F0FF] to-[#0047FF] text-white py-3.5 rounded-xl font-bold hover:shadow-lg transition-all active:scale-[0.98]'}
                >
                  {t('steps.account.warning.back')}
                </button>
                <button
                  onClick={handleConfirmSkip}
                  className={v2 ? 'h-[52px] w-full whitespace-nowrap rounded-full bg-white text-[16px] font-extrabold text-v2-ink-2 shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]' : 'w-full bg-white/5 hover:bg-white/10 text-gray-400 py-3.5 rounded-xl font-medium transition-all border border-white/10 active:scale-[0.98]'}
                >
                  {t('steps.account.warning.skip')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
