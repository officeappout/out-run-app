'use client';

export const dynamic = 'force-dynamic';

/**
 * /booth/display?groupId=<groupId>
 *
 * Plasma / big-screen leaderboard for the challenge booth.
 * Opens on a laptop/tablet at the booth. Polls every 8 seconds.
 *
 * Layout: two tables side-by-side (גברים / נשים).
 * Fallback: single mixed table if one gender has < 2 entries.
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

async function fetchLeaderboard(groupId: string, gender?: string, limit = 8) {
  const url = `/api/challenge/leaderboard?groupId=${groupId}&limit=${limit}${gender ? `&gender=${gender}` : ''}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json() as Promise<{ rows: LeaderboardRow[]; total: number }>;
}

// ── Sub-component: one leaderboard table ─────────────────────────────────────

function GenderTable({
  title,
  rows,
  total,
}: {
  title: string;
  rows: LeaderboardRow[];
  total: number;
}) {
  return (
    <div className="flex-1 flex flex-col min-w-0">
      <div
        className="flex items-center justify-between px-4 py-2 rounded-xl mb-3"
        style={{ background: 'rgba(6,182,212,0.12)', border: '1px solid rgba(6,182,212,0.25)' }}
      >
        <span className="text-lg font-black" style={{ color: '#06b6d4' }}>{title}</span>
        <span className="text-sm font-bold" style={{ color: '#475569' }}>{total} משתתפים</span>
      </div>

      {rows.length === 0 ? (
        <div className="flex-1 flex items-center justify-center" style={{ color: '#334155' }}>
          <span className="text-base">ממתין למשתתפים...</span>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((row) => {
            const style = RANK_STYLE[row.rank] ?? { bg: 'rgba(255,255,255,0.04)', text: '#e2e8f0', glow: 'none' };
            return (
              <div
                key={row.uid}
                className="flex items-center gap-3 px-4 py-3 rounded-xl"
                style={{
                  background: style.bg,
                  boxShadow: style.glow,
                  border: row.rank <= 3 ? `1px solid ${style.text}44` : '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div
                  className="w-9 text-center flex-shrink-0 font-black"
                  style={{ color: style.text, fontSize: row.rank <= 3 ? 22 : 16 }}
                >
                  {rankLabel(row.rank)}
                </div>
                <div className="flex-1 min-w-0">
                  <div
                    className="font-bold truncate"
                    style={{ color: '#f1f5f9', fontSize: row.rank === 1 ? 20 : 17 }}
                  >
                    {row.name}
                  </div>
                </div>
                <div
                  className="font-black flex-shrink-0"
                  style={{
                    color: style.text,
                    fontSize: row.rank === 1 ? 28 : 22,
                    fontVariantNumeric: 'tabular-nums',
                    minWidth: 64,
                    textAlign: 'center',
                  }}
                >
                  {row.displayTime}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function BoothDisplayPage() {
  const searchParams = useSearchParams();
  const groupId      = searchParams.get('groupId') ?? '';

  const [maleRows, setMaleRows]     = useState<LeaderboardRow[]>([]);
  const [maleTotal, setMaleTotal]   = useState(0);
  const [femaleRows, setFemaleRows] = useState<LeaderboardRow[]>([]);
  const [femaleTotal, setFemaleTotal] = useState(0);
  const [mixedRows, setMixedRows]   = useState<LeaderboardRow[]>([]);
  const [mixedTotal, setMixedTotal] = useState(0);

  const [lastEntry, setLastEntry]   = useState<LeaderboardRow | null>(null);
  const [bannerVisible, setBannerVisible] = useState(false);
  const [error, setError]           = useState(false);

  const prevUids = useRef<Set<string>>(new Set());
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const poll = async () => {
    if (!groupId) return;
    try {
      const [male, female, all] = await Promise.all([
        fetchLeaderboard(groupId, 'male', 8),
        fetchLeaderboard(groupId, 'female', 8),
        fetchLeaderboard(groupId, undefined, 10),
      ]);

      // Detect new entries across all genders
      const allRows = all?.rows ?? [];
      const fresh = allRows.find((r) => !prevUids.current.has(r.uid));
      if (fresh) {
        setLastEntry(fresh);
        setBannerVisible(true);
        if (bannerTimer.current) clearTimeout(bannerTimer.current);
        bannerTimer.current = setTimeout(() => setBannerVisible(false), 5000);
      }
      prevUids.current = new Set(allRows.map((r) => r.uid));

      if (male)   { setMaleRows(male.rows);     setMaleTotal(male.total); }
      if (female) { setFemaleRows(female.rows); setFemaleTotal(female.total); }
      if (all)    { setMixedRows(all.rows);     setMixedTotal(all.total); }
      setError(false);
    } catch {
      setError(true);
    }
  };

  useEffect(() => {
    poll();
    const id = setInterval(poll, 8000);
    return () => {
      clearInterval(id);
      if (bannerTimer.current) clearTimeout(bannerTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  // Use gender tables if either gender has >= 2 entries; otherwise show mixed
  const useSplit = maleTotal >= 2 || femaleTotal >= 2;

  if (!groupId) {
    return (
      <div className="min-h-dvh flex items-center justify-center"
        style={{ background: '#020617', color: '#64748b', fontSize: 18 }} dir="rtl">
        חסר ?groupId= בכתובת
      </div>
    );
  }

  return (
    <div
      className="min-h-dvh flex flex-col"
      style={{ background: '#020617', fontFamily: 'system-ui, sans-serif' }}
      dir="rtl"
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-8 py-5"
        style={{ borderBottom: '1px solid rgba(6,182,212,0.2)' }}
      >
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-black tracking-wider" style={{ color: '#06b6d4', letterSpacing: 4 }}>
            OUT
          </span>
          <span className="text-xl font-bold" style={{ color: '#94a3b8' }}>
            אתגר ה-L-Sit · מכביה 2026
          </span>
        </div>
        <div className="text-right">
          <div className="text-3xl font-black" style={{ color: '#06b6d4' }}>{mixedTotal}</div>
          <div className="text-sm" style={{ color: '#64748b' }}>משתתפים</div>
        </div>
      </div>

      {/* New entry banner */}
      <div
        style={{
          overflow: 'hidden',
          maxHeight: bannerVisible ? 64 : 0,
          transition: 'max-height 0.4s ease',
        }}
      >
        {lastEntry && (
          <div
            className="flex items-center justify-center gap-3 py-3 text-lg font-bold"
            style={{ background: 'rgba(6,182,212,0.15)', color: '#06b6d4' }}
          >
            🔥 {lastEntry.name} — {lastEntry.displayTime} נכנס לדירוג!
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="text-center py-4 text-sm" style={{ color: '#ef4444' }}>
          שגיאת חיבור — מנסה שוב...
        </div>
      )}

      {/* Leaderboard body */}
      <div className="flex-1 px-8 py-4">
        {useSplit ? (
          /* Two gender tables side by side */
          <div className="flex gap-6 h-full">
            <GenderTable title="גברים 👦" rows={maleRows} total={maleTotal} />
            <GenderTable title="נשים 👧" rows={femaleRows} total={femaleTotal} />
          </div>
        ) : (
          /* Mixed fallback */
          <div className="max-w-lg mx-auto">
            <GenderTable title="דירוג כללי" rows={mixedRows} total={mixedTotal} />
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        className="px-8 py-3 flex items-center justify-between text-sm"
        style={{ borderTop: '1px solid rgba(6,182,212,0.1)', color: '#334155' }}
      >
        <span>מתרענן כל 8 שניות</span>
        <span>outrun.co.il</span>
      </div>
    </div>
  );
}
