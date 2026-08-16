'use client';

/**
 * ScopeBattleCard — "קרב השבוע" head-to-head battle between YOUR scope
 * (fixed) and a chosen opponent, for the Stage E inter-scope competition.
 *
 * Data-wise this is just two rows already present in
 * getScopeCompetitionLeaderboard's result (Stage D) — no new backend call
 * beyond that. Renders nothing if the current user has no resolvable
 * entity in the result set (e.g. no city, or no neighborhood picked yet,
 * or zero activity this window) — there's no "you" to anchor a battle to.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  getScopeCompetitionLeaderboard,
  type ScopeCompetitionResult,
} from '@/features/arena/services/ranking.service';
import type { LeaderboardTimeWindow } from '@/features/arena/services/ranking.service';
import OpponentPickerSheet from './OpponentPickerSheet';
import { pickDefaultOpponent } from './pick-default-opponent';

const ACCENT = '#1D9E75';
const OPPONENT_COLOR = '#EC7C4C';

interface ScopeBattleCardProps {
  granularity: 'city' | 'neighborhood';
  timeWindow: LeaderboardTimeWindow;
  /** The current user's own scope id (authorityId for 'city', neighborhood
   *  authority id for 'neighborhood'). null when unresolvable — the card
   *  renders nothing in that case. */
  myScopeId: string | null;
  /** Forwarded to getScopeCompetitionLeaderboard — required by Stage D's
   *  correctness gate when granularity === 'neighborhood'. */
  cityAuthorityId?: string | null;
}

export default function ScopeBattleCard({ granularity, timeWindow, myScopeId, cityAuthorityId }: ScopeBattleCardProps) {
  const [result, setResult] = useState<ScopeCompetitionResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [opponentScopeId, setOpponentScopeId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (!myScopeId) { setResult(null); setIsLoading(false); return; }
    let cancelled = false;
    setIsLoading(true);
    getScopeCompetitionLeaderboard({ granularity, timeWindow, cityAuthorityId, maxEntries: 50 })
      .then((data) => { if (!cancelled) setResult(data); })
      .catch((err) => console.error('[ScopeBattleCard]', err))
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [granularity, timeWindow, myScopeId, cityAuthorityId]);

  const entries = result?.entries ?? [];
  const myIndex = useMemo(() => entries.findIndex((e) => e.scopeId === myScopeId), [entries, myScopeId]);
  const myEntry = myIndex >= 0 ? entries[myIndex] : null;

  // Reset the opponent selection to the natural default whenever the
  // underlying entries change (new window, new granularity, first load).
  useEffect(() => {
    if (myIndex < 0) { setOpponentScopeId(null); return; }
    const def = pickDefaultOpponent(entries, myIndex);
    setOpponentScopeId(def?.scopeId ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myIndex, entries.length, granularity, timeWindow]);

  if (!myScopeId || isLoading) return null;
  if (!myEntry || entries.length < 2) return null; // no "you" to anchor to, or nobody to battle

  const opponent = entries.find((e) => e.scopeId === opponentScopeId) ?? null;
  if (!opponent) return null;

  const leader = myEntry.totalScore >= opponent.totalScore ? myEntry : opponent;
  const trailer = leader === myEntry ? opponent : myEntry;
  const gap = leader.totalScore - trailer.totalScore;
  const iAmLeading = leader === myEntry;
  const maxScore = Math.max(myEntry.totalScore, opponent.totalScore, 1);

  const candidates = entries.filter((e) => e.scopeId !== myScopeId);

  return (
    <div className="rounded-2xl bg-white p-4 mb-3" style={{ border: '0.5px solid #E5E7EB' }} dir="rtl">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-black text-gray-900">🔥 קרב השבוע</span>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full"
          style={{ backgroundColor: '#F3F4F6', color: '#6B7280' }}
        >
          <RefreshCw className="w-3 h-3" />
          החלף יריבה
        </button>
      </div>

      <div className="space-y-2">
        {[leader, trailer].map((entity) => {
          const isMe = entity.scopeId === myScopeId;
          const color = isMe ? ACCENT : OPPONENT_COLOR;
          const widthPct = Math.max(4, Math.round((entity.totalScore / maxScore) * 100));
          return (
            <div key={entity.scopeId}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-black tabular-nums" style={{ color }}>
                  {entity.totalScore.toLocaleString('he-IL')}
                </span>
                <span className="text-xs font-bold text-gray-800 truncate">{entity.scopeName}</span>
              </div>
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${widthPct}%`, backgroundColor: color }} />
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-gray-500 font-medium mt-2.5 text-center">
        {iAmLeading
          ? `אתה מוביל על ${opponent.scopeName} 🔥`
          : `רק ${gap.toLocaleString('he-IL')} נק' מ${leader.scopeName}!`}
      </p>

      <OpponentPickerSheet
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        myEntry={myEntry}
        candidates={candidates}
        selectedOpponentId={opponentScopeId}
        onSelect={setOpponentScopeId}
      />
    </div>
  );
}
