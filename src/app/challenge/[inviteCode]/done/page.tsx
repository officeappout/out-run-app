'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Loader2, Trophy } from 'lucide-react';
import { linkWithGoogleAccount, linkWithAppleAccount } from '@/lib/auth.service';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTranslation } from '@/hooks/useTranslation';
import type { DictionaryKey } from '@/lib/i18n/dictionaries';
import ChallengeLangToggle from '@/features/challenge/components/ChallengeLangToggle';

// ── Helpers ────────────────────────────────────────────────────────────────────

function genderUnitLabel(gender: string, t: (k: DictionaryKey) => string): string {
  if (gender === 'male')   return t('challenge.done.rank.men');
  if (gender === 'female') return t('challenge.done.rank.women');
  return t('challenge.done.rank.overall');
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function ChallengeDonePage() {
  const params     = useParams();
  const inviteCode = typeof params.inviteCode === 'string' ? params.inviteCode : '';

  const { direction } = useLanguage();
  const { t } = useTranslation();

  const [elapsed, setElapsed]             = useState(0);
  const [name, setName]                   = useState('');
  const [gender, setGender]               = useState<string>('');
  const [groupId, setGroupId]             = useState<string | null>(null);

  const [genderRank, setGenderRank]       = useState<number | null>(null);
  const [genderTotal, setGenderTotal]     = useState<number | null>(null);
  const [overallRank, setOverallRank]     = useState<number | null>(null);
  const [overallTotal, setOverallTotal]   = useState<number | null>(null);
  const [loadingRank, setLoadingRank]     = useState(true);

  const [linkLoading, setLinkLoading]     = useState<'google' | 'apple' | null>(null);
  const [linked, setLinked]               = useState(false);
  const [linkError, setLinkError]         = useState<string | null>(null);
  const [isAndroid, setIsAndroid]         = useState(false);

  useEffect(() => {
    const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
    setIsAndroid(cap?.getPlatform?.() === 'android');

    const elapsedRaw  = parseInt(sessionStorage.getItem('challenge_elapsed') ?? '0', 10);
    const gid         = sessionStorage.getItem('challenge_group_id');
    const savedName   = sessionStorage.getItem('challenge_name') ?? '';
    const savedGender = sessionStorage.getItem('challenge_gender') ?? '';

    setElapsed(elapsedRaw);
    setGroupId(gid);
    setName(savedName);
    setGender(savedGender);

    if (!gid || !elapsedRaw) { setLoadingRank(false); return; }

    const computeRank = (rows: { bestValue: number }[], total: number, val: number) => {
      const idx = rows.findIndex((r) => r.bestValue <= val);
      return { rank: idx >= 0 ? idx + 1 : rows.length + 1, total };
    };

    Promise.all([
      savedGender
        ? fetch(`/api/challenge/leaderboard?groupId=${gid}&gender=${savedGender}&limit=50`)
            .then((r) => r.ok ? r.json() : null)
        : Promise.resolve(null),
      fetch(`/api/challenge/leaderboard?groupId=${gid}&limit=50`)
        .then((r) => r.ok ? r.json() : null),
    ])
      .then(([genderData, allData]) => {
        if (genderData?.rows) {
          const { rank, total } = computeRank(genderData.rows, genderData.total, elapsedRaw);
          setGenderRank(rank);
          setGenderTotal(total);
        }
        if (allData?.rows) {
          const { rank, total } = computeRank(allData.rows, allData.total, elapsedRaw);
          setOverallRank(rank);
          setOverallTotal(total);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingRank(false));
  }, []);

  const handleGoogleLink = async () => {
    setLinkLoading('google');
    setLinkError(null);
    try {
      const { user, error: err } = await linkWithGoogleAccount();
      if (err === 'google_canceled' || err === 'popup_closed') {
        // silent
      } else if (err === 'not_anonymous') {
        setLinked(true);
      } else if (err === 'google_account_exists') {
        setLinkError(t('challenge.done.error.accountExists'));
      } else if (err) {
        setLinkError(t('challenge.done.error.generic'));
      } else if (user) {
        setLinked(true);
      }
    } catch {
      setLinkError(t('challenge.done.error.general'));
    }
    setLinkLoading(null);
  };

  const handleAppleLink = async () => {
    setLinkLoading('apple');
    setLinkError(null);
    try {
      const { user, error: err } = await linkWithAppleAccount();
      if (err === 'apple_canceled') {
        // silent
      } else if (err === 'not_anonymous') {
        setLinked(true);
      } else if (err) {
        setLinkError(t('challenge.done.error.general'));
      } else if (user) {
        setLinked(true);
      }
    } catch {
      setLinkError(t('challenge.done.error.general'));
    }
    setLinkLoading(null);
  };

  const timeUnitLabel = elapsed >= 60 ? t('challenge.done.minutes') : t('challenge.done.seconds');

  return (
    <div className="min-h-dvh bg-white flex flex-col items-center" dir={direction}>
      <div className="w-full max-w-sm flex flex-col items-center px-6 pt-10 pb-10 text-center">

        {/* Language toggle */}
        <div className="w-full flex justify-end mb-2">
          <ChallengeLangToggle />
        </div>

        {/* Congrats */}
        <p className="text-lg font-bold" style={{ color: '#0e7490' }}>
          {name
            ? `${t('challenge.done.congrats')}, ${name}!`
            : `${t('challenge.done.congrats')}!`}
        </p>

        {/* Big elapsed time */}
        <div className="mt-4 flex items-end gap-1 justify-center">
          <span
            className="font-black leading-none"
            style={{ fontSize: 72, color: '#06b6d4', fontVariantNumeric: 'tabular-nums' }}
          >
            {elapsed >= 60
              ? `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`
              : String(elapsed)}
          </span>
          <span className="mb-3 text-2xl font-bold text-gray-400">
            {timeUnitLabel}
          </span>
        </div>

        {/* Rank pills */}
        {loadingRank ? (
          <div className="mt-4 h-9 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
          </div>
        ) : (
          <div className="mt-4 flex flex-col items-center gap-2">
            {genderRank !== null && gender && gender !== 'other' && (
              <div
                className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-base font-bold"
                style={{ background: '#cffafe', color: '#0e7490' }}
              >
                <Trophy className="w-4 h-4" />
                {t('challenge.done.rank.place')} {genderRank}
                {genderTotal !== null ? ` ${t('challenge.done.rank.of')} ${genderTotal}` : ''} — {genderUnitLabel(gender, t)}
              </div>
            )}
            {overallRank !== null && (
              <div
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold"
                style={{ background: '#f1f5f9', color: '#64748b' }}
              >
                {t('challenge.done.rank.place')} {overallRank}
                {overallTotal !== null ? ` ${t('challenge.done.rank.of')} ${overallTotal}` : ''} — {t('challenge.done.rank.overall')}
              </div>
            )}
          </div>
        )}

        {/* Divider */}
        <div className="w-full border-t border-gray-100 my-8" />

        {/* Registration CTA */}
        {!linked ? (
          <>
            <p className="text-base font-semibold text-gray-800 mb-1">
              {t('challenge.done.saveTitle')}
            </p>
            <p className="text-sm text-gray-500 mb-5">
              {t('challenge.done.saveDesc')}
            </p>

            {/* Google */}
            <button
              onClick={handleGoogleLink}
              disabled={!!linkLoading}
              className="w-full h-12 rounded-xl border flex items-center justify-center gap-3 text-sm font-semibold mb-3 transition-colors active:bg-gray-50"
              style={{ borderColor: '#e2e8f0', color: '#374151' }}
            >
              {linkLoading === 'google' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  {t('challenge.done.googleBtn')}
                </>
              )}
            </button>

            {/* Apple — iOS only */}
            {!isAndroid && (
              <button
                onClick={handleAppleLink}
                disabled={!!linkLoading}
                className="w-full h-12 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold mb-3 transition-colors active:bg-gray-700"
                style={{ background: '#0f172a', color: '#fff' }}
              >
                {linkLoading === 'apple' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white" aria-hidden="true">
                      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                    </svg>
                    {t('challenge.done.appleBtn')}
                  </>
                )}
              </button>
            )}

            {linkError && (
              <p className="text-xs text-red-500 mb-3">{linkError}</p>
            )}

            <p className="text-xs text-gray-400">{t('challenge.done.free')}</p>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="w-14 h-14 rounded-full flex items-center justify-center text-2xl" style={{ background: '#cffafe' }}>
              ✅
            </div>
            <p className="font-bold text-gray-800">{t('challenge.done.saved')}</p>
            <p className="text-sm text-gray-500">{t('challenge.done.savedDesc')}</p>
          </div>
        )}

        {/* QR placeholder */}
        <div className="mt-8 flex flex-col items-center gap-2">
          <div
            className="w-24 h-24 rounded-xl flex items-center justify-center text-xs text-gray-400 font-medium border border-dashed border-gray-300"
            style={{ fontFamily: 'monospace' }}
          >
            QR
          </div>
          <p className="text-xs text-gray-400">{t('challenge.done.qrLabel')}</p>
        </div>

      </div>
    </div>
  );
}
