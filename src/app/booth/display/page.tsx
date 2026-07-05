'use client';

export const dynamic = 'force-dynamic';

/**
 * /booth/display?groupId=<groupId>
 *
 * Plasma / big-screen leaderboard for the challenge booth.
 * Open on a laptop/tablet at the booth. Polls every 8 seconds.
 * No auth required.
 *
 * Usage: https://outrun.co.il/booth/display?groupId=maccabiah_lsit_2026
 */

import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';

// ── Types ─────────────────────────────────────────────────────────────────────

interface LeaderboardRow {
  rank: number;
  uid: string;
  name: string;
  ageGroup: 'minor' | 'adult';
  gender: 'male' | 'female' | 'other';
  bestValue: number;
  displayTime: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const RANK_STYLE: Record<number, { bg: string; text: string; glow: string }> = {
  1: { bg: '#78350f', text: '#fbbf24', glow: '0 0 24px rgba(251,191,36,0.6)' },
  2: { bg: '#1e293b', text: '#94a3b8', glow: '0 0 16px rgba(148,163,184,0.4)' },
  3: { bg: '#431407', text: '#fb923c', glow: '0 0 16px rgba(251,146,60,0.4)' },
};

const rankLabel = (r: number) =>
  r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : String(r);

// ── Component ─────────────────────────────────────────────────────────────────

export default function BoothDisplayPage() {
  const searchParams = useSearchParams();
  const groupId      = searchParams.get('groupId') ?? '';

  const [rows, setRows]         = useState<LeaderboardRow[]>([]);
  const [total, setTotal]       = useState(0);
  const [lastEntry, setLastEntry] = useState<LeaderboardRow | null>(null);
  const [bannerVisible, setBannerVisible] = useState(false);
  const [error, setError]       = useState(false);

  const prevUids = useRef<Set<string>>(new Set());
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchLeaderboard = async () => {
    if (!groupId) return;
    try {
      const res = await fetch(`/api/challenge/leaderboard?groupId=${groupId}&limit=10`);
      if (!res.ok) { setError(true); return; }
      const data: { rows: LeaderboardRow[]; total: number } = await res.json();

      // Detect new entries since last poll
      const fresh = data.rows.find((r) => !prevUids.current.has(r.uid));
      if (fresh) {
        setLastEntry(fresh);
        setBannerVisible(true);
        if (bannerTimer.current) clearTimeout(bannerTimer.current);
        bannerTimer.current = setTimeout(() => setBannerVisible(false), 5000);
      }
      prevUids.current = new Set(data.rows.map((r) => r.uid));

      setRows(data.rows);
      setTotal(data.total);
      setError(false);
    } catch {
      setError(true);
    }
  };

  useEffect(() => {
    fetchLeaderboard();
    const id = setInterval(fetchLeaderboard, 8000);
    return () => {
      clearInterval(id);
      if (bannerTimer.current) clearTimeout(bannerTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  // ── No groupId ──────────────────────────────────────────────────────────────
  if (!groupId) {
    return (
      <div
        className="min-h-dvh flex items-center justify-center"
        style={{ background: '#020617', color: '#64748b', fontSize: 18 }}
        dir="rtl"
      >
        חסר ?groupId= בכתובת
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div
      className="min-h-dvh flex flex-col"
      style={{ background: '#020617', fontFamily: 'system-ui, sans-serif' }}
      dir="rtl"
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-10 py-6"
        style={{ borderBottom: '1px solid rgba(6,182,212,0.2)' }}
      >
        <div>
          <span
            className="text-4xl font-black tracking-wider"
            style={{ color: '#06b6d4', letterSpacing: 4 }}
          >
            OUT
          </span>
          <span className="mr-3 text-xl font-bold" style={{ color: '#94a3b8' }}>
            אתגר ה-L-Sit · מכביה 2026
          </span>
        </div>
        <div className="text-right">
          <div className="text-3xl font-black" style={{ color: '#06b6d4' }}>
            {total}
          </div>
          <div className="text-sm" style={{ color: '#64748b' }}>משתתפים</div>
        </div>
      </div>

      {/* "New entry" banner */}
      <div
        style={{
          overflow: 'hidden',
          maxHeight: bannerVisible ? 72 : 0,
          transition: 'max-height 0.4s ease',
        }}
      >
        {lastEntry && (
          <div
            className="flex items-center justify-center gap-3 py-4 text-xl font-bold"
            style={{ background: 'rgba(6,182,212,0.15)', color: '#06b6d4' }}
          >
            <span>🔥</span>
            <span>
              {lastEntry.name} — {lastEntry.displayTime}
            </span>
            <span>נכנס לדירוג!</span>
          </div>
        )}
      </div>

      {/* Leaderboard */}
      <div className="flex-1 flex flex-col gap-3 px-10 py-6">
        {error && (
          <div className="text-center py-10" style={{ color: '#ef4444' }}>
            שגיאת חיבור — מנסה שוב...
          </div>
        )}

        {rows.length === 0 && !error && (
          <div className="flex-1 flex items-center justify-center" style={{ color: '#334155' }}>
            <div className="text-center">
              <div className="text-6xl mb-4">🏋️</div>
              <div className="text-2xl font-bold">ממתין למשתתפים...</div>
              <div className="mt-2 text-lg" style={{ color: '#475569' }}>
                סרוק את ה-QR ותתחיל!
              </div>
            </div>
          </div>
        )}

        {rows.map((row, idx) => {
          const style = RANK_STYLE[row.rank] ?? {
            bg: idx % 2 === 0 ? '#0f172a' : '#0f172a',
            text: '#e2e8f0',
            glow: 'none',
          };
          return (
            <div
              key={row.uid}
              className="flex items-center gap-5 px-6 py-4 rounded-2xl"
              style={{
                background: style.bg || 'rgba(255,255,255,0.04)',
                boxShadow: style.glow,
                border: row.rank <= 3
                  ? `1px solid ${style.text}44`
                  : '1px solid rgba(255,255,255,0.06)',
              }}
            >
              {/* Rank */}
              <div
                className="w-12 text-center text-2xl font-black flex-shrink-0"
                style={{ color: style.text, fontSize: row.rank <= 3 ? 28 : 20 }}
              >
                {rankLabel(row.rank)}
              </div>

              {/* Name */}
              <div className="flex-1 min-w-0">
                <div
                  className="font-bold truncate"
                  style={{ color: '#f1f5f9', fontSize: row.rank === 1 ? 26 : 22 }}
                >
                  {row.name}
                </div>
                <div className="text-sm mt-0.5" style={{ color: '#475569' }}>
                  {row.ageGroup === 'minor' ? 'נוער' : 'בוגר'}
                  {row.gender === 'male' ? ' · גבר' : row.gender === 'female' ? ' · אישה' : ' · אחר'}
                </div>
              </div>

              {/* Time */}
              <div
                className="font-black text-right flex-shrink-0"
                style={{
                  color: style.text,
                  fontSize: row.rank === 1 ? 40 : 30,
                  fontVariantNumeric: 'tabular-nums',
                  minWidth: 80,
                  textAlign: 'center',
                }}
              >
                {row.displayTime}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div
        className="px-10 py-4 flex items-center justify-between text-sm"
        style={{ borderTop: '1px solid rgba(6,182,212,0.1)', color: '#334155' }}
      >
        <span>מתרענן כל 8 שניות</span>
        <span>outrun.co.il</span>
      </div>
    </div>
  );
}
