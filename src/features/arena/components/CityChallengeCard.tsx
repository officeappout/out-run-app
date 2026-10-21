'use client';

/**
 * CityChallengeCard — the design lab's collective city goal (home v2 leagues,
 * 17.10.2026): everyone in the city together toward CITY_MONTHLY_GOAL league
 * points this month, with a progress bar.
 *
 * Real numbers only: the city's own row of the monthly city board
 * (getLeagueBoard → /api/leagues/scope-stats, league_scope_stats). Renders
 * nothing while loading, when the aggregates are off (`unavailable`), or when
 * the city has no row this month — never a made-up total.
 */
import { useEffect, useState } from 'react';
import { Target } from 'lucide-react';
import { getLeagueBoard, type LeagueBoardEntry } from '@/features/arena/services/ranking.service';
import { CITY_MONTHLY_GOAL, challengeProgress } from './league-board-logic';
import { useT } from '@/hooks/useT';
import { community } from '@/messages/ns/community';

const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']; // i18n-allow-hebrew: wave 3 — month names (fmt)

export default function CityChallengeCard({ cityId, cityName }: { cityId: string | null; cityName?: string | null }) {
  const t = useT(community);
  const [entry, setEntry] = useState<LeagueBoardEntry | null>(null);

  useEffect(() => {
    if (!cityId) { setEntry(null); return; }
    let cancelled = false;
    // The city board is capped at 50 rows by the route; a city outside the
    // top 50 simply gets no card.
    getLeagueBoard({ board: 'city', timeWindow: 'monthly', maxEntries: 50 })
      .then((r) => { if (!cancelled) setEntry(r.unavailable ? null : r.entries.find((e) => e.scopeId === cityId) ?? null); })
      .catch((err) => { if (!cancelled) setEntry(null); console.warn('[CityChallengeCard]', err); });
    return () => { cancelled = true; };
  }, [cityId]);

  if (!entry) return null;

  const { pct, left, done } = challengeProgress(entry.totalScore, CITY_MONTHLY_GOAL);
  const name = cityName || entry.scopeName;
  const month = MONTHS[new Date().getMonth()];

  return (
    <div className="rounded-v2-card bg-white p-4 shadow-v2-card text-right" dir="rtl">
      <div className="flex items-center gap-3">
        <span className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[14px] bg-v2-tint text-v2-deep">
          <Target size={20} strokeWidth={2.4} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate whitespace-nowrap text-[16px] font-black text-v2-ink">{t('cityChallenge.title', { name })}</div>
          <div className="truncate whitespace-nowrap text-[12.5px] font-bold text-v2-muted">
            {t('cityChallenge.subtitle', { goal: CITY_MONTHLY_GOAL.toLocaleString('he-IL'), month })}
          </div>
        </div>
      </div>

      <div className="mt-3.5 flex items-end justify-between gap-2">
        <span className="text-[26px] font-black leading-none tabular-nums tracking-v2-tighter text-v2-deep">
          {entry.totalScore.toLocaleString('he-IL')}
        </span>
        <span className="whitespace-nowrap text-[12.5px] font-bold text-v2-muted tabular-nums">
          {t('cityChallenge.active', { count: entry.activeMemberCount.toLocaleString('he-IL'), pct: String(pct) })}
        </span>
      </div>

      <div
        className="mt-2 h-3 overflow-hidden rounded-full bg-v2-surface ring-1 ring-inset ring-v2-hairline"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={t('cityChallenge.aria', { pct: String(pct) })}
      >
        {/* min 3% so a fresh month still shows the bar has started */}
        <div className="h-full rounded-full bg-v2-cta" style={{ width: `${Math.max(pct, entry.totalScore > 0 ? 3 : 0)}%` }} />
      </div>

      <p className="mt-2 text-[12.5px] font-bold text-v2-ink-2">
        {done ? t('cityChallenge.done', { name }) : t('cityChallenge.left', { left: left.toLocaleString('he-IL') })}
      </p>
    </div>
  );
}
