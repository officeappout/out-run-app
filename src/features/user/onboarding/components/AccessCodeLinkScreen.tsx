'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { doc, setDoc } from 'firebase/firestore';
import { CheckCircle2, KeyRound } from 'lucide-react';
import { auth, db } from '@/lib/firebase';
import { useUserStore } from '@/features/user';
import { getUserFromFirestore } from '@/lib/firestore.service';
import { useT } from '@/hooks/useT';
import { onboarding, type OnboardingKey } from '@/messages/ns/onboarding';
import UnitJoinSuccessBanner from '@/components/ui/UnitJoinSuccessBanner';
import { validateAccessCode, type AccessCodeResult } from '../services/access-code.service';
import {
  PENDING_INSTITUTION_CODE_KEY,
  accessCodeErrorKey,
  normalizeInstitutionCode,
  pickInstitutionCode,
} from '../utils/institution-code';

/**
 * /onboarding-new/access-code — landing for /school/CODE links (QR / universal
 * link). Previously a 404. Reuses the same flow as the Settings coupon box:
 * validateAccessCode -> merge core.tenant* onto users/{uid} -> refresh profile.
 * A code that arrives with the link is pre-filled and validated once the user
 * is signed in; the user can also type or fix it by hand, or skip.
 */
export default function AccessCodeLinkScreen() {
  const router = useRouter();
  const t = useT(onboarding);
  const searchParams = useSearchParams();
  const [code, setCode] = useState('');
  const [error, setError] = useState<OnboardingKey | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AccessCodeResult | null>(null);

  const submit = useCallback(async (raw: string) => {
    const normalized = normalizeInstitutionCode(raw);
    if (!normalized) {
      setError('accessCodeLink.error.invalid');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await auth.authStateReady();
      const uid = auth.currentUser?.uid;
      if (!uid) {
        setError('accessCodeLink.error.signIn');
        return;
      }
      const res = await validateAccessCode(normalized);
      await setDoc(doc(db, 'users', uid), {
        core: {
          tenantId: res.tenantId,
          unitId: res.unitId,
          unitPath: res.unitPath,
          tenantType: res.tenantType,
        },
      }, { merge: true });
      const fresh = await getUserFromFirestore(uid);
      if (fresh) useUserStore.setState({ profile: fresh });
      try { localStorage.removeItem(PENDING_INSTITUTION_CODE_KEY); } catch { /* storage unavailable */ }
      setResult(res);
    } catch (err) {
      setError(accessCodeErrorKey(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Pre-fill from the link and validate once (a failed auto-try leaves the field editable).
  useEffect(() => {
    let stored: string | null = null;
    try { stored = localStorage.getItem(PENDING_INSTITUTION_CODE_KEY); } catch { /* storage unavailable */ }
    const initial = pickInstitutionCode(searchParams.get('code'), stored);
    if (initial) {
      setCode(initial);
      void submit(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  const goOn = useCallback(() => {
    try { localStorage.removeItem(PENDING_INSTITUTION_CODE_KEY); } catch { /* storage unavailable */ }
    router.replace('/home');
  }, [router]);

  const cta = 'h-[52px] w-full whitespace-nowrap rounded-full text-[16px] font-extrabold transition-transform duration-150 ease-v2';
  const ctaOn = 'bg-v2-cta text-v2-on-cta shadow-v2-cta active:scale-[0.97]';
  const ctaOff = 'bg-v2-hairline text-v2-muted cursor-not-allowed';

  if (result) {
    return (
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col items-center justify-center gap-6 bg-v2-surface px-5 py-10 font-simpler text-v2-ink">
        <div className="flex w-full max-w-xs flex-col items-center gap-4 rounded-v2-card bg-white px-5 py-6 text-center shadow-v2-card">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-v2-tint" aria-hidden>
            <CheckCircle2 size={24} className="text-v2-up" />
          </span>
          <h1 className="text-[22px] font-black !tracking-[-0.02em]">{t('accessCodeLink.verified')}</h1>
          <UnitJoinSuccessBanner result={result} />
        </div>
        <div className="w-full max-w-xs">
          <button onClick={goOn} className={`${cta} ${ctaOn}`}>{t('accessCodeLink.continue')}</button>
        </div>
      </div>
    );
  }

  const disabled = loading || !code.trim();
  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col items-center justify-center gap-6 bg-v2-surface px-5 py-10 font-simpler text-v2-ink">
      <div className="flex flex-col items-center text-center">
        <span className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-v2-tint" aria-hidden>
          <KeyRound size={22} className="text-v2-deep" />
        </span>
        <h1 className="text-[26px] font-black !tracking-[-0.02em]">{t('accessCodeLink.title')}</h1>
        <p className="mt-1 text-[14px] font-medium text-v2-ink-2">{t('accessCodeLink.subtitle')}</p>
      </div>
      <div className="w-full max-w-xs">
        <input
          dir="ltr"
          type="text"
          value={code}
          onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(null); }}
          onKeyDown={(e) => e.key === 'Enter' && !disabled && void submit(code)}
          placeholder="UNIT-X79"
          aria-label={t('accessCodeLink.inputLabel')}
          className="h-[60px] w-full rounded-2xl border-0 bg-white px-4 text-center font-mono text-[22px] font-bold tracking-widest text-v2-ink shadow-v2-ring outline-none transition-shadow placeholder:text-v2-pill-border focus:ring-2 focus:ring-inset focus:ring-v2-accent/60"
          disabled={loading}
        />
        {error && <p role="alert" className="mt-3 text-center text-[12.5px] font-bold text-[#b4232a]">{t(error)}</p>}
      </div>
      <div className="flex w-full max-w-xs flex-col gap-2">
        <button onClick={() => void submit(code)} disabled={disabled} className={`${cta} ${disabled ? ctaOff : ctaOn}`}>
          {loading ? t('accessCodeLink.checking') : t('accessCodeLink.confirm')}
        </button>
        <button onClick={goOn} disabled={loading} className="h-11 w-full text-[14px] font-bold text-v2-muted">
          {t('accessCodeLink.skip')}
        </button>
      </div>
      <p className="max-w-xs text-center text-[12px] font-bold text-v2-muted">
        {t('accessCodeLink.footer')}
      </p>
    </div>
  );
}
