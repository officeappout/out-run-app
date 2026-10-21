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
import { RefreshCw, UserPlus, Swords, Zap, Footprints } from 'lucide-react';
import Button from '@/components/ui/v2/Button';
import { battleSplit, formatKm, formatTimeLeft, getPeriodEnd, perMember } from './league-board-logic';
import {
  getScopeCompetitionLeaderboard,
  type ScopeCompetitionResult,
  type ScopeCompetitionEntry,
} from '@/features/arena/services/ranking.service';
import type { LeaderboardTimeWindow, LeaderboardCategory, LeaderboardGenderFilter } from '@/features/arena/services/ranking.service';
import OpponentPickerSheet from './OpponentPickerSheet';
import { pickDefaultOpponent } from './pick-default-opponent';
import { CATEGORY_UNIT_LABEL } from './scope-category-unit-label';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user';

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
  /** Home v2: shows a "group walk" pill that calls this (the parent opens the
   *  planned-activity compose sheet). Omitted → no pill (unchanged card). */
  onGroupWalk?: () => void;
}

export default function ScopeBattleCard({ granularity, timeWindow, myScopeId, cityAuthorityId, category = 'overall', genderFilter = 'all', onMyScopeEntryChange, onGroupWalk }: ScopeBattleCardProps) {
  const isSuperAdmin = useUserStore((st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  const v2 = useFeatureFlags(isSuperAdmin).flags.enableHomeV2;
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
      onGroupWalk={onGroupWalk}
      showKm={v2}
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
  /** See ScopeBattleCardProps.onGroupWalk. */
  onGroupWalk?: () => void;
  /** Home v2: each side's km next to its total ("· 1,240 ק״מ") — shown, never part of the battle. */
  showKm?: boolean;
}

/** Secondary white pill — "go walk together" for your scope (home v2). */
function GroupWalkButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-3 flex h-11 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-white px-4 text-[14px] font-extrabold text-v2-ink shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
    >
      <Footprints size={16} strokeWidth={2.6} className="shrink-0 text-[#f59e0b]" aria-hidden />
      <span className="truncate">יוצאים להליכה קבוצתית</span>
    </button>
  );
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
  onGroupWalk,
  showKm = false,
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
      const text = `בואו להצטרף אליי ב${myEntry.scopeName} על Out! 🔥`;
      if (navigator.share) navigator.share({ text }).catch(() => {});
      else if (navigator.clipboard) navigator.clipboard.writeText(text);
    };
    return (
      <div className={`${BATTLE_SURFACE} mb-3`} style={BATTLE_BG} dir="rtl">
        <BattleHeader subtitle={`עדיין אין יריב ל${myEntry.scopeName}`} />
        <Button variant="primary" size="sm" className="mt-3.5" onClick={handleInvite}>
          <UserPlus size={14} strokeWidth={2.4} aria-hidden />
          הזמנת חברים
        </Button>
        {onGroupWalk && <GroupWalkButton onClick={onGroupWalk} />}
      </div>
    );
  }

  const opponent = entries.find((e) => e.scopeId === opponentScopeId) ?? null;
  if (!opponent) return null;

  // 17.10.2026 (David): the battle is decided per active member — the same
  // fair measure as the board's default — with each side's total shown too.
  const mine = perMember(myEntry);
  const theirs = perMember(opponent);
  const iAmLeading = mine >= theirs;
  const leader = iAmLeading ? myEntry : opponent;
  const gap = Math.abs(mine - theirs);
  const split = battleSplit(mine, theirs);

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

      {/* VS — per-member score, big, on each side of the amber lightning;
          your scope on the start (right, RTL) side. */}
      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-end gap-2">
        <div className="min-w-0">
          <div className="text-[14px] font-extrabold text-v2-ink truncate">{myEntry.scopeName}</div>
          <div className="text-[32px] font-black leading-none tabular-nums tracking-v2-tighter text-v2-deep">
            {mine.toLocaleString('he-IL')}
          </div>
          <div className="text-[12px] font-bold text-v2-muted">{myEntry.activeMemberCount} פעילים</div>
        </div>
        <span className="mb-5 w-9 h-9 rounded-full bg-white flex items-center justify-center text-v2-amber shadow-v2-ring">
          <Zap size={18} strokeWidth={2.4} fill="currentColor" aria-label="נגד" />
        </span>
        <div className="min-w-0 text-left">
          <div className="text-[14px] font-extrabold text-v2-ink truncate">{opponent.scopeName}</div>
          <div className="text-[32px] font-black leading-none tabular-nums tracking-v2-tighter text-v2-ink-2">
            {theirs.toLocaleString('he-IL')}
          </div>
          <div className="text-[12px] font-bold text-v2-muted">{opponent.activeMemberCount} פעילים</div>
        </div>
      </div>

      {/* Split bar — your share of the two per-member scores. */}
      <div className="mt-3 flex h-3 rounded-full overflow-hidden bg-white" aria-hidden>
        <div className="h-full bg-v2-cta" style={{ width: `${split.minePct}%` }} />
        <div className="h-full" style={{ width: `${split.theirsPct}%`, background: OPPONENT_COLOR }} />
      </div>
      <p className="mt-1.5 text-[11.5px] font-bold text-v2-muted text-center">{CATEGORY_UNIT_LABEL[category]} בממוצע למשתתף פעיל</p>

      {/* Each side's total — the bigger, prouder number. */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        {[myEntry, opponent].map((e) => (
          <div key={e.scopeId} className="rounded-[16px] bg-white/80 px-3 py-2 min-w-0">
            <div className="truncate whitespace-nowrap text-[17px] font-black leading-tight tabular-nums text-v2-ink">
              {e.totalScore.toLocaleString('he-IL')}
              {showKm && (e.totalKm ?? 0) > 0 && (
                <span className="text-[12.5px] font-extrabold text-v2-ink-2"> · {formatKm(e.totalKm)} ק״מ</span>
              )}
            </div>
            <div className="text-[11.5px] font-bold text-v2-muted truncate">סה״כ {CATEGORY_UNIT_LABEL[category]} · {e.scopeName}</div>
          </div>
        ))}
      </div>

      <p className="text-[12.5px] text-v2-ink-2 font-semibold mt-2.5 text-center">
        {iAmLeading
          ? `מובילים ב־${gap.toLocaleString('he-IL')} למשתתף על ${opponent.scopeName}`
          : `רק ${gap.toLocaleString('he-IL')} למשתתף מ${leader.scopeName}!`}
      </p>

      {onGroupWalk && <GroupWalkButton onClick={onGroupWalk} />}

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
