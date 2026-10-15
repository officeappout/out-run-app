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
import { RefreshCw, UserPlus, Swords, Zap } from 'lucide-react';
import Button from '@/components/ui/v2/Button';
import { battleSplit, formatTimeLeft, getPeriodEnd } from './league-board-logic';
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

  return (
    <ScopeBattleCardView
      myScopeId={myScopeId}
      myEntry={myEntry}
      entries={entries}
      opponentScopeId={opponentScopeId}
      onSelectOpponent={setOpponentScopeId}
      category={category}
      timeWindow={timeWindow}
    />
  );
}

// ── Presentational view — split out so the card renders with fixture data ──

export interface ScopeBattleCardViewProps {
  myScopeId: string;
  myEntry: ScopeCompetitionEntry;
  entries: ScopeCompetitionEntry[];
  opponentScopeId: string | null;
  onSelectOpponent: (scopeId: string) => void;
  category: LeaderboardCategory;
  /** Drives the "time left" line — the scope totals reset on
   *  getWindowStart(timeWindow). Omitted → no countdown. */
  timeWindow?: LeaderboardTimeWindow;
}

/** Site battle-card surface (Social.module.css .battle). */
const BATTLE_SURFACE = 'rounded-[22px] border border-v2-hairline-cool p-[18px]';
const BATTLE_BG = { background: 'linear-gradient(135deg, #e8f9fe, #e9fdfb)' };

function BattleHeader({ subtitle, action }: { subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-[42px] h-[42px] rounded-[14px] bg-white flex items-center justify-center text-v2-deep shrink-0">
        <Swords size={20} strokeWidth={2.4} aria-hidden />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[17px] font-black text-v2-ink tracking-v2-tight">קרב השבוע</div>
        {subtitle && <div className="text-[12.5px] font-semibold text-v2-ink-2 tabular-nums truncate">{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}

export function ScopeBattleCardView({
  myScopeId,
  myEntry,
  entries,
  opponentScopeId,
  onSelectOpponent,
  category,
  timeWindow,
}: ScopeBattleCardViewProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const now = new Date();
  const timeLeft = timeWindow ? formatTimeLeft(getPeriodEnd(timeWindow, now), now) : undefined;

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
      <div className={`${BATTLE_SURFACE} mb-3`} style={BATTLE_BG} dir="rtl">
        <BattleHeader subtitle={`עדיין אין יריב ל${myEntry.scopeName}`} />
        <Button variant="primary" size="sm" className="mt-3.5" onClick={handleInvite}>
          <UserPlus size={14} strokeWidth={2.4} aria-hidden />
          הזמן חברים
        </Button>
      </div>
    );
  }

  const opponent = entries.find((e) => e.scopeId === opponentScopeId) ?? null;
  if (!opponent) return null;

  const leader = myEntry.totalScore >= opponent.totalScore ? myEntry : opponent;
  const gap = leader.totalScore - (leader === myEntry ? opponent : myEntry).totalScore;
  const iAmLeading = leader === myEntry;
  const split = battleSplit(myEntry.totalScore, opponent.totalScore);

  const candidates = entries.filter((e) => e.scopeId !== myScopeId);

  return (
    <div className={`${BATTLE_SURFACE} mb-3`} style={BATTLE_BG} dir="rtl">
      <BattleHeader
        subtitle={timeLeft}
        action={
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="h-8 px-3 rounded-full bg-white text-v2-ink text-[12px] font-bold flex items-center gap-1 shrink-0 active:scale-[0.97] transition-transform ease-v2"
          >
            <RefreshCw size={12} strokeWidth={2.6} aria-hidden />
            החלף יריבה
          </button>
        }
      />

      {/* VS — two white pills around the amber lightning (site .vs). Your
          scope on the start (right, RTL) side. */}
      <div className="flex items-center gap-2.5 mt-3.5">
        <span className="flex-1 min-w-0 h-9 px-3 rounded-full bg-white flex items-center justify-center text-[14px] font-extrabold text-v2-ink truncate">
          {myEntry.scopeName}
        </span>
        <Zap size={20} strokeWidth={2.4} className="text-v2-amber shrink-0" fill="currentColor" aria-label="נגד" />
        <span className="flex-1 min-w-0 h-9 px-3 rounded-full bg-white flex items-center justify-center text-[14px] font-extrabold text-v2-ink truncate">
          {opponent.scopeName}
        </span>
      </div>

      {/* Split bar — your share of the two totals (same two rows the card
          already had; league-board-logic.battleSplit). */}
      <div className="mt-3 flex h-3 rounded-full overflow-hidden bg-white" aria-hidden>
        <div className="h-full bg-v2-cta" style={{ width: `${split.minePct}%` }} />
        <div className="h-full" style={{ width: `${split.theirsPct}%`, background: OPPONENT_COLOR }} />
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[13px] font-black text-v2-ink tabular-nums">
        <span>{myEntry.totalScore.toLocaleString('he-IL')}</span>
        <span className="text-[11px] font-bold text-v2-muted">{CATEGORY_UNIT_LABEL[category]}</span>
        <span>{opponent.totalScore.toLocaleString('he-IL')}</span>
      </div>

      <p className="text-[12.5px] text-v2-ink-2 font-semibold mt-2.5 text-center">
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
        onSelect={onSelectOpponent}
      />
    </div>
  );
}
