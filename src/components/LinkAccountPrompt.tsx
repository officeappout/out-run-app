'use client';

/**
 * LinkAccountPrompt — compact in-context modal for the guest-account UX
 * fix on social actions (follow, DM). Product decision (03.10.2026): the
 * firestore.rules bar stays exactly as-is -- social actions (follow, DM,
 * kudos, feed) require a linked Google/Apple account, not just a filled-
 * out guest profile. What was broken wasn't the bar, it was that hitting
 * it looked like a bug: a raw Firebase permission error with no
 * explanation. This surfaces the SAME reason clearly and offers the
 * SAME linking flow AccountSecureStep already uses (linkWithGoogleAccount/
 * linkWithAppleAccount, auth.service.ts) -- no new auth logic, just a
 * lighter-weight, in-place presentation so the caller doesn't lose their
 * current screen/context the way navigating to the full onboarding step
 * would.
 *
 * Call sites gate BEFORE firing the real write (`auth.currentUser?.
 * isAnonymous`) and reopen this instead of letting the doomed Firestore
 * call throw. `onLinked` is the caller's own action handler, called again
 * post-link so "follow"/"send message" completes in one flow instead of
 * requiring a second tap.
 */

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link2, AlertTriangle } from 'lucide-react';
import { linkWithGoogleAccount, linkWithAppleAccount } from '@/lib/auth.service';
import { useT } from '@/hooks/useT';
import { common } from '@/messages/ns/common';

interface LinkAccountPromptProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called once immediately after a successful link -- re-run the
   * original action here (it will now pass the !isAnonymous() gate). */
  onLinked: () => void;
  message?: string;
}

export default function LinkAccountPrompt({
  isOpen,
  onClose,
  onLinked,
  message,
}: LinkAccountPromptProps) {
  const t = useT(common);
  const [loading, setLoading] = useState<'google' | 'apple' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAndroid, setIsAndroid] = useState(false);

  useEffect(() => {
    const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
    setIsAndroid(cap?.getPlatform?.() === 'android');
  }, []);

  // Reset transient state each time the prompt is (re)opened.
  useEffect(() => {
    if (isOpen) {
      setLoading(null);
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Same error-code handling as AccountSecureStep.tsx, trimmed to what a
  // mid-flow prompt needs -- no onNext/onSkip branching, just surface or
  // silently retry.
  async function handleLink(provider: 'google' | 'apple') {
    setLoading(provider);
    setError(null);
    try {
      const { user, error: linkError } =
        provider === 'google' ? await linkWithGoogleAccount() : await linkWithAppleAccount();

      if (linkError) {
        if (linkError === `${provider}_canceled` || linkError === 'popup_closed') {
          setLoading(null);
          return;
        }
        if (linkError === 'not_anonymous') {
          // Already linked (e.g. a second tab finished linking first) --
          // the gate will pass now, proceed as if we'd just succeeded.
          onLinked();
          return;
        }
        if (linkError === `${provider}_account_exists`) {
          setError(t('ui.linkAccount.error.exists', { provider: provider === 'google' ? 'Google' : 'Apple' }));
        } else if (linkError === `${provider}_timeout`) {
          setError(t('ui.linkAccount.error.timeout'));
        } else {
          setError(t('ui.linkAccount.error.failed'));
        }
        setLoading(null);
        return;
      }

      if (user) {
        onLinked();
      }
    } catch {
      setError(t('ui.linkAccount.error.unexpected'));
      setLoading(null);
    }
  }

  const isLoading = loading !== null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[145] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-6"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="relative bg-white rounded-t-3xl sm:rounded-2xl p-6 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] sm:pb-6 w-full sm:max-w-sm shadow-floating"
        >
          <div className="flex items-center justify-center mb-4">
            <div className="w-14 h-14 bg-[#00ADEF]/10 rounded-full flex items-center justify-center">
              <Link2 className="w-7 h-7 text-[#00ADEF]" />
            </div>
          </div>

          <h2 className="text-lg font-black text-gray-900 text-center mb-2">{message ?? t('ui.linkAccount.defaultMessage')}</h2>
          <p className="text-sm text-gray-500 text-center mb-6 leading-relaxed">
            {t('ui.linkAccount.explain')}
          </p>

          <button
            type="button"
            onClick={() => handleLink('google')}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 py-3.5 px-6 rounded-2xl font-bold shadow-sm transition-all active:scale-[0.98] hover:bg-gray-50 border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed mb-3"
          >
            {loading === 'google' ? (
              <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src="https://www.google.com/favicon.ico" alt="" className="w-5 h-5" />
            )}
            <span className="font-bold text-gray-700">
              {loading === 'google' ? t('ui.connecting') : t('ui.linkAccount.google')}
            </span>
          </button>

          {!isAndroid && (
            <button
              type="button"
              onClick={() => handleLink('apple')}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-3 py-3.5 px-6 rounded-2xl font-bold shadow-sm transition-all active:scale-[0.98] hover:bg-gray-900 bg-black disabled:opacity-50 disabled:cursor-not-allowed mb-3"
            >
              {loading === 'apple' ? (
                <div className="w-5 h-5 border-2 border-gray-500 border-t-white rounded-full animate-spin" />
              ) : (
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="white">
                  <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                </svg>
              )}
              <span className="font-bold text-white">
                {loading === 'apple' ? t('ui.connecting') : t('ui.linkAccount.apple')}
              </span>
            </button>
          )}

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="w-full bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl mb-3 flex items-start gap-2"
              >
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p className="text-xs">{error}</p>
              </motion.div>
            )}
          </AnimatePresence>

          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="w-full text-center text-sm font-semibold text-gray-400 py-2 disabled:opacity-50"
          >
            {t('actions.notNow')}
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
