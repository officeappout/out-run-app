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
import { RefreshCw, UserPlus } from 'lucide-react';
import {
  getScopeCompetitionLeaderboard,
  type ScopeCompetitionResult,
  type ScopeCompetitionEntry,
} from '@/features/arena/services/ranking.service';
import type { LeaderboardTimeWindow, LeaderboardCategory, LeaderboardGenderFilter } from '@/features/arena/services/ranking.service';
import OpponentPickerSheet from './OpponentPickerSheet';
import { pickDefaultOpponent } from './pick-default-opponent';
import { CATEGORY_UNIT_LABEL } from './scope-category-unit-label';

// Battle-bar "opponent" side — none of the 5 brand tokens reads as a
// neutral "vs" color without implying success/failure (emerald = good,
// gold = flourish), so the mockup's own muted rose is kept here as a
// semantic exception, same reasoning as gold for streak/fire elsewhere.
const OPPONENT_COLOR = '#f0b2b5';

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
  /** Filters the battling scopes' totals by activity category. Omitted or
   * 'overall' → every category summed (unchanged default). */
  category?: LeaderboardCategory;
  /** Filters the battling scopes' totals by gender. Omitted or 'all' →
   * every gender summed (unchanged default). */
  genderFilter?: LeaderboardGenderFilter;
  /** Bubbles up the current user's own scope entry (rank/name/totalScore)
   *  from this component's existing getScopeCompetitionLeaderboard fetch,
   *  so the parent can show it in the "your contribution" hero card
   *  without a second, duplicate fetch — same lift-up pattern as
   *  NeighborhoodLeaderboard's onMyEntryChange. */
  onMyScopeEntryChange?: (entry: ScopeCompetitionEntry | null) => void;
}

export default function ScopeBattleCard({ granularity, timeWindow, myScopeId, cityAuthorityId, category = 'overall', genderFilter = 'all', onMyScopeEntryChange }: ScopeBattleCardProps) {
  const [result, setResult] = useState<ScopeCompetitionResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [opponentScopeId, setOpponentScopeId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (!myScopeId) { setResult(null); setIsLoading(false); return; }
    let cancelled = false;
    setIsLoading(true);
    getScopeCompetitionLeaderboard({ granularity, timeWindow, cityAuthorityId, category, genderFilter, maxEntries: 50 })
      .then((data) => { if (!cancelled) setResult(data); })
      .catch((err) => console.error('[ScopeBattleCard]', err))
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [granularity, timeWindow, myScopeId, cityAuthorityId, category, genderFilter]);

  const entries = result?.entries ?? [];
  const myIndex = useMemo(() => entries.findIndex((e) => e.scopeId === myScopeId), [entries, myScopeId]);
  const myEntry = myIndex >= 0 ? entries[myIndex] : null;

  useEffect(() => {
    onMyScopeEntryChange?.(myEntry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myEntry, onMyScopeEntryChange]);

  // Reset the opponent selection to the natural default whenever the
  // underlying entries change (new window, new granularity, first load).
  useEffect(() => {
    if (myIndex < 0) { setOpponentScopeId(null); return; }
    const def = pickDefaultOpponent(entries, myIndex);
    setOpponentScopeId(def?.scopeId ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myIndex, entries.length, granularity, timeWindow]);

  if (!myScopeId || isLoading) return null;
  if (!myEntry) return null; // no "you" to anchor a battle to (zero activity this window)

  // 16.08.2026 design review: friendly empty state instead of silently
  // rendering nothing — you exist in the ranking, but there's no second
  // entity yet to battle against (a near-empty board, expected while the
  // user base is small).
  if (entries.length < 2) {
    const handleInvite = () => {
      const text = `בוא תצטרף אליי ב${myEntry.scopeName} על Out! 🔥`;
      if (navigator.share) navigator.share({ text }).catch(() => {});
      else if (navigator.clipboard) navigator.clipboard.writeText(text);
    };
    return (
      <div className="rounded-2xl bg-white p-4 mb-3 text-center" style={{ border: '0.5px solid #E5E7EB' }} dir="rtl">
        <span className="text-sm font-black text-gray-900">🔥 קרב השבוע</span>
        <p className="text-xs text-gray-500 mt-2">עדיין אין יריב ל{myEntry.scopeName}</p>
        <button
          type="button"
          onClick={handleInvite}
          className="mt-3 mx-auto flex items-center gap-1.5 px-4 py-2 rounded-full text-white text-xs font-black active:scale-95 transition-transform"
          style={{ background: 'linear-gradient(90deg, #00ADEF, #00dcd0)' }}
        >
          <UserPlus className="w-3.5 h-3.5" />
          הזמן חברים
        </button>
      </div>
    );
  }

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
          const widthPct = Math.max(4, Math.round((entity.totalScore / maxScore) * 100));
          return (
            <div key={entity.scopeId} className="flex items-center gap-2">
              <span className="text-[13px] font-black text-gray-900 truncate flex-shrink-0" style={{ maxWidth: 84 }}>
                {entity.scopeName}
              </span>
              <div className="h-3 rounded-full bg-gray-100 overflow-hidden flex-1">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${widthPct}%`,
                    background: isMe ? 'linear-gradient(90deg, #00ADEF, #00dcd0)' : OPPONENT_COLOR,
                  }}
                />
              </div>
              <span className="text-[13px] font-black text-gray-900 tabular-nums flex-shrink-0">
                {entity.totalScore.toLocaleString('he-IL')}
              </span>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-gray-500 font-medium mt-2.5 text-center">
        {iAmLeading
          ? `אתה מוביל על ${opponent.scopeName} 🔥`
          : `רק ${gap.toLocaleString('he-IL')} ${CATEGORY_UNIT_LABEL[category]} מ${leader.scopeName}!`}
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
