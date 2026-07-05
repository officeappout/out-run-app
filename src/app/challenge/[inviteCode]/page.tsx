'use client';

export const dynamic = 'force-dynamic';

/**
 * /challenge/[inviteCode]
 *
 * Public challenge landing page — fetches group preview (no auth required),
 * shows challenge details + stats, and routes to /join for quick registration.
 *
 * Reuses /api/join/preview (rate-limit raised to 60/min).
 * Does NOT touch the existing /join/[inviteCode] flow.
 */

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Users, Trophy, Timer, Loader2, AlertCircle } from 'lucide-react';
import type { CommunityGroup } from '@/types/community.types';

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
  const params   = useParams();
  const router   = useRouter();
  const inviteCode = typeof params.inviteCode === 'string' ? params.inviteCode : '';

  const [group, setGroup]       = useState<CommunityGroup | null>(null);
  const [stats, setStats]       = useState({ members: 0, topValue: 0, avgValue: 0 });
  const [loading, setLoading]   = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!inviteCode) return;

    // Fetch group preview (public endpoint, no auth)
    fetch(`/api/join/preview?code=${encodeURIComponent(inviteCode)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(({ group: g }: { group: CommunityGroup & { id: string } }) => setGroup(g))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));

    // Fetch leaderboard stats (top value + count) — best-effort
    // groupId is not known yet; will re-fetch after group loads
  }, [inviteCode]);

  // Once group is loaded, fetch leaderboard stats
  useEffect(() => {
    if (!group?.id) return;
    fetch(`/api/challenge/leaderboard?groupId=${group.id}&limit=50`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data?.rows?.length) return;
        const values: number[] = data.rows.map((r: { bestValue: number }) => r.bestValue);
        const top = values[0] ?? 0;
        const avg = Math.round(values.reduce((a: number, b: number) => a + b, 0) / values.length);
        setStats({ members: data.total, topValue: top, avgValue: avg });
      })
      .catch(() => {});
  }, [group?.id]);

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-dvh bg-white" dir="rtl">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
      </div>
    );
  }

  // ── Not found ────────────────────────────────────────────────────────────────
  if (notFound || !group) {
    return (
      <div className="flex flex-col items-center justify-center min-h-dvh bg-white gap-4 p-6" dir="rtl">
        <AlertCircle className="w-10 h-10 text-red-400" />
        <p className="text-lg font-bold text-gray-700">הקישור לא תקין</p>
        <p className="text-sm text-gray-500">לא נמצא אתגר פעיל בקישור זה.</p>
      </div>
    );
  }

  const challengeName = group.name ?? 'אתגר';

  // ── Main ──────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-dvh bg-white flex flex-col" dir="rtl">

      {/* Hero */}
      <div
        className="relative flex flex-col justify-end px-5 pb-5 text-white"
        style={{
          minHeight: 200,
          background: 'linear-gradient(135deg, #0e7490 0%, #06b6d4 100%)',
        }}
      >
        <div
          className="absolute top-4 right-4 text-xs font-bold px-3 py-1 rounded-full"
          style={{ background: 'rgba(255,255,255,0.9)', color: '#0e7490' }}
        >
          אתגר מכביה 2026
        </div>
        <h1 className="text-3xl font-black leading-tight text-white" style={{ textShadow: '0 1px 8px rgba(0,0,0,0.3)' }}>
          {challengeName}
        </h1>
        {group.description ? (
          <p className="mt-1 text-sm text-white/80">{group.description}</p>
        ) : null}
      </div>

      {/* Stats */}
      <div className="px-5 pt-5 grid grid-cols-3 gap-3">
        {[
          { icon: Users,  label: 'משתתפים', value: stats.members > 0 ? String(stats.members) : '—' },
          { icon: Trophy, label: 'שיא נוכחי', value: stats.topValue > 0 ? formatSeconds(stats.topValue) : '—' },
          { icon: Timer,  label: 'ממוצע',    value: stats.avgValue > 0 ? formatSeconds(stats.avgValue) : '—' },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex flex-col items-center rounded-xl py-3 px-2" style={{ background: '#f1f5f9' }}>
            <Icon className="w-4 h-4 mb-1" style={{ color: '#0e7490' }} />
            <span className="text-xl font-black" style={{ color: '#0e7490' }}>{value}</span>
            <span className="text-[11px] text-gray-500 mt-0.5">{label}</span>
          </div>
        ))}
      </div>

      {/* Steps */}
      <div className="px-5 pt-6 flex-1">
        <h2 className="text-[15px] font-bold text-gray-800 mb-4">איך זה עובד</h2>
        <ol className="flex flex-col gap-4">
          {[
            { n: '1', title: 'הירשם', desc: 'שם, גיל ומין. 20 שניות, בלי אפליקציה.' },
            { n: '2', title: 'החזק L-sit', desc: 'הטיימר מודד — שחרר כשאתה חייב.' },
            { n: '3', title: 'ראה את הדירוג שלך', desc: 'בליגת האתגר, בזמן אמת.' },
          ].map(({ n, title, desc }) => (
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

      {/* CTA */}
      <div className="px-5 pb-10 pt-6">
        <button
          onClick={() => router.push(`/challenge/${inviteCode}/join`)}
          className="w-full h-14 rounded-2xl text-white text-lg font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
          style={{ background: 'linear-gradient(135deg, #0e7490, #06b6d4)' }}
        >
          הצטרף לאתגר
          <span className="text-xl">›</span>
        </button>
        <p className="text-center text-xs text-gray-400 mt-3">ללא הורדת אפליקציה · נכנסים ישר</p>
      </div>
    </div>
  );
}
