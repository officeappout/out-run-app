'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Users, Timer, Loader2, AlertCircle } from 'lucide-react';
import type { CommunityGroup } from '@/types/community.types';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTranslation } from '@/hooks/useTranslation';
import ChallengeLangToggle from '@/features/challenge/components/ChallengeLangToggle';

// ── Hero image — fill in when David sends the photo ───────────────────────────
// Replace the empty string with an absolute URL or a /public path.
const HERO_IMAGE_URL = '/images/maccabiah-hero.jpeg';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatSeconds(s: number): string {
  if (s <= 0) return '—';
  if (s >= 60) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  }
  return `${s}s`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ChallengeLandingPage() {
  const params     = useParams();
  const router     = useRouter();
  const inviteCode = typeof params.inviteCode === 'string' ? params.inviteCode : '';

  const { direction, setLanguage } = useLanguage();
  const { t } = useTranslation();

  const [group, setGroup]       = useState<CommunityGroup | null>(null);
  const [stats, setStats]       = useState({ members: 0, topMale: 0, topFemale: 0 });
  const [loading, setLoading]   = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Auto-detect browser language once on mount
  useEffect(() => {
    const browserLang = (navigator.language ?? '').toLowerCase();
    setLanguage(browserLang.startsWith('en') ? 'en' : 'he');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!inviteCode) return;
    fetch(`/api/join/preview?code=${encodeURIComponent(inviteCode)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(({ group: g }: { group: CommunityGroup & { id: string } }) => setGroup(g))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [inviteCode]);

  useEffect(() => {
    if (!group?.id) return;
    Promise.all([
      fetch(`/api/challenge/leaderboard?groupId=${group.id}&limit=1`)
        .then((r) => r.ok ? r.json() : null),
      fetch(`/api/challenge/leaderboard?groupId=${group.id}&gender=male&limit=1`)
        .then((r) => r.ok ? r.json() : null),
      fetch(`/api/challenge/leaderboard?groupId=${group.id}&gender=female&limit=1`)
        .then((r) => r.ok ? r.json() : null),
    ])
      .then(([allData, maleData, femaleData]) => {
        setStats({
          members:   allData?.total ?? 0,
          topMale:   maleData?.rows?.[0]?.bestValue ?? 0,
          topFemale: femaleData?.rows?.[0]?.bestValue ?? 0,
        });
      })
      .catch(() => {});
  }, [group?.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-dvh bg-white" dir={direction}>
        <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
      </div>
    );
  }

  if (notFound || !group) {
    return (
      <div className="flex flex-col items-center justify-center min-h-dvh bg-white gap-4 p-6" dir={direction}>
        <AlertCircle className="w-10 h-10 text-red-400" />
        <p className="text-lg font-bold text-gray-700">{t('challenge.landing.notFound')}</p>
        <p className="text-sm text-gray-500">{t('challenge.landing.notFoundDesc')}</p>
      </div>
    );
  }

  const challengeName = group.name ?? t('challenge.landing.badge');

  const steps = [
    { n: '1', title: t('challenge.landing.step1.title'), desc: t('challenge.landing.step1.desc') },
    { n: '2', title: t('challenge.landing.step2.title'), desc: t('challenge.landing.step2.desc') },
    { n: '3', title: t('challenge.landing.step3.title'), desc: t('challenge.landing.step3.desc') },
  ];

  const statCards = [
    { icon: Users, label: t('challenge.stats.participants'), value: stats.members > 0 ? String(stats.members) : '—' },
    { icon: Timer, label: t('challenge.stats.topMen'),       value: stats.topMale   > 0 ? formatSeconds(stats.topMale)   : '—' },
    { icon: Timer, label: t('challenge.stats.topWomen'),     value: stats.topFemale > 0 ? formatSeconds(stats.topFemale) : '—' },
  ];

  return (
    <div className="min-h-dvh bg-white flex flex-col" dir={direction}>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <div className="relative w-full overflow-hidden" style={{ minHeight: 260 }}>

        {/* Background: photo if available, else fallback gradient */}
        {HERO_IMAGE_URL ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={HERO_IMAGE_URL}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(135deg, #0e7490 0%, #06b6d4 100%)' }}
          />
        )}

        {/* Fade-out: transparent at top, white at bottom */}
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to bottom, transparent 30%, white 100%)' }}
        />

        {/* Content layer */}
        <div className="relative z-10 flex flex-col justify-end px-5 pb-6 pt-14" style={{ minHeight: 260 }}>

          {/* Badge — top corner (RTL: end, LTR: end) */}
          <div
            className="absolute top-4 end-4 text-xs font-bold px-3 py-1 rounded-full"
            style={{ background: 'rgba(255,255,255,0.9)', color: '#0e7490' }}
          >
            {t('challenge.landing.badge')}
          </div>

          {/* Language toggle — opposite corner */}
          <div className="absolute top-3 start-3">
            <ChallengeLangToggle variant="dark" />
          </div>

          {/* Title — sits on the fade area, dark text */}
          <h1
            className="text-3xl font-black leading-tight"
            style={{ color: '#0f172a' }}
          >
            {challengeName}
          </h1>
          {group.description ? (
            <p className="mt-1 text-sm text-gray-600">{group.description}</p>
          ) : null}
        </div>
      </div>

      {/* ── Stats ──────────────────────────────────────────────────────────── */}
      <div className="px-5 pt-4 grid grid-cols-3 gap-3">
        {statCards.map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex flex-col items-center rounded-xl py-3 px-2" style={{ background: '#f1f5f9' }}>
            <Icon className="w-4 h-4 mb-1" style={{ color: '#0e7490' }} />
            <span className="text-xl font-black" style={{ color: '#0e7490' }}>{value}</span>
            <span className="text-[11px] text-gray-500 mt-0.5 text-center leading-tight">{label}</span>
          </div>
        ))}
      </div>

      {/* ── Steps ──────────────────────────────────────────────────────────── */}
      <div className="px-5 pt-6 flex-1">
        <h2 className="text-[15px] font-bold text-gray-800 mb-4">{t('challenge.landing.howItWorks')}</h2>
        <ol className="flex flex-col gap-4">
          {steps.map(({ n, title, desc }) => (
            <li key={n} className="flex items-start gap-3">
              <span
                className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0"
                style={{ background: '#cffafe', color: '#0e7490' }}
              >
                {n}
              </span>
              <span className="text-sm leading-snug text-gray-700">
                <strong className="font-bold text-gray-900">{title}</strong>
                {' — '}
                {desc}
              </span>
            </li>
          ))}
        </ol>
      </div>

      {/* ── CTA ────────────────────────────────────────────────────────────── */}
      <div className="px-5 pb-10 pt-6">
        <button
          onClick={() => router.push(`/challenge/${inviteCode}/join`)}
          className="w-full h-14 rounded-2xl text-white text-lg font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
          style={{ background: 'linear-gradient(135deg, #0e7490, #06b6d4)' }}
        >
          {t('challenge.landing.cta')}
          <span className="text-xl" aria-hidden>›</span>
        </button>
        <p className="text-center text-xs text-gray-400 mt-3">{t('challenge.landing.ctaNote')}</p>
      </div>
    </div>
  );
}
