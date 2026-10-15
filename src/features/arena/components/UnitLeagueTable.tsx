'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, ChevronDown, Check, Users, Shield } from 'lucide-react';
import { BoardCard, BoardIconButton, BoardMessage, BoardRow, BoardRowSkeleton } from './LeagueBoard';
import { getUnitLeagueLeaderboard, type UnitLeagueRange, type UnitLeagueResult } from '../services/unit-league.service';
import UnitIconBadge from '@/components/ui/UnitIconBadge';
import { getRelativeTime } from '@/lib/utils/date-formatter';

const RANGE_OPTIONS: { value: UnitLeagueRange; label: string }[] = [
  { value: 'my_battalion_companies', label: 'הפלוגות בגדוד שלי' },
  { value: 'my_brigade_battalions', label: 'הגדודים בחטיבה שלי' },
  { value: 'all_companies', label: 'כל הפלוגות בארץ' },
  { value: 'all_brigades', label: 'כל החטיבות בארץ' },
];

interface UnitLeagueTableProps {
  myOrgId: string | null;
  myUnitPathIds: string[];
}

/**
 * Phase 6b — unit-vs-unit competition (docs/research/
 * military-persona-unified-architecture.md §12). A new, purpose-built
 * component, not an extension of NeighborhoodLeaderboard/ScopeBattleCard:
 * those are hardwired to getScopeCompetitionLeaderboard/feed_posts (see
 * that same research doc, §12ג) and this reads pre-aggregated,
 * zero-personal-identifier documents instead — genuinely simpler (no
 * client-side summing) but a different data shape, not a prop away from
 * the existing components.
 *
 * Score shown on every row, not just the podium — matches this app's
 * existing convention everywhere else (checked directly in
 * NeighborhoodLeaderboard.tsx before building this, per David's
 * 05.09.2026 request not to introduce an inconsistent variant).
 */
export default function UnitLeagueTable({ myOrgId, myUnitPathIds }: UnitLeagueTableProps) {
  const [range, setRange] = useState<UnitLeagueRange>('my_brigade_battalions');
  const [result, setResult] = useState<UnitLeagueResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = () => {
    setIsLoading(true);
    getUnitLeagueLeaderboard(range, myOrgId, myUnitPathIds)
      .then(setResult)
      .catch((err) => console.error('[UnitLeagueTable]', err))
      .finally(() => setIsLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps -- myUnitPathIds is a fresh array each render; length+join below is the stable dep
  useEffect(fetchData, [range, myOrgId, myUnitPathIds.join(',')]);

  return (
    <UnitLeagueTableView
      range={range}
      onRangeChange={setRange}
      isLoading={isLoading}
      result={result}
      onRefresh={fetchData}
    />
  );
}

// ── Presentational view — split out so the table renders with fixture data ──

export interface UnitLeagueTableViewProps {
  range: UnitLeagueRange;
  onRangeChange: (range: UnitLeagueRange) => void;
  isLoading: boolean;
  result: UnitLeagueResult | null;
  onRefresh: () => void;
}

export function UnitLeagueTableView({
  range,
  onRangeChange: setRange,
  isLoading,
  result,
  onRefresh: fetchData,
}: UnitLeagueTableViewProps) {
  const [isOpen, setIsOpen] = useState(false);
  const activeOpt = RANGE_OPTIONS.find((o) => o.value === range) ?? RANGE_OPTIONS[0];

  return (
    <section dir="rtl">
      <BoardCard
        title="תחרות בין יחידות"
        subtitle={
          // Mandatory, not decoration (David, 05.09.2026) — every row's data is from a scheduled hourly rollup, must be legible how fresh it is.
          // 07.09.2026 fix: keyed off isLoading (an updatedAt of null after load is a legitimate state —
          // unitLeagueRollup skips any unit with zero declared members), not result?.updatedAt alone.
          isLoading ? 'טוען...' : result?.updatedAt ? `עודכן ${getRelativeTime(result.updatedAt)}` : 'אין נתונים עדיין'
        }
        actions={<BoardIconButton icon={RefreshCw} label="רענון" onClick={fetchData} spinning={isLoading} />}
      >
        {/* Range dropdown */}
        <div className="relative mb-4">
          <button
            type="button"
            onClick={() => setIsOpen((o) => !o)}
            aria-expanded={isOpen}
            className="h-8 px-3 rounded-full bg-white/10 text-white text-[12.5px] font-bold flex items-center gap-1.5"
          >
            {activeOpt.label}
            <ChevronDown size={14} strokeWidth={2.4} className={`transition-transform ease-v2 ${isOpen ? 'rotate-180' : ''}`} />
          </button>
          {isOpen && (
            <div className="absolute z-10 mt-1.5 bg-white rounded-v2-tile shadow-v2-float overflow-hidden min-w-[200px] py-1">
              {RANGE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { setRange(opt.value); setIsOpen(false); }}
                  className={`w-full flex items-center gap-2 text-right px-3.5 py-2.5 text-[14px] font-bold ${
                    opt.value === range ? 'text-v2-deep' : 'text-v2-ink hover:bg-v2-surface'
                  }`}
                >
                  <span className="flex-1">{opt.label}</span>
                  {opt.value === range && <Check size={16} strokeWidth={2.6} aria-hidden />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Body */}
        {isLoading ? (
          <div className="grid gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <BoardRowSkeleton key={i} />
            ))}
          </div>
        ) : result && result.entries.length > 0 ? (
          <div className="grid gap-2">
            {result.entries.map((entry, idx) => (
              <BoardRow
                key={entry.directoryId}
                rank={idx + 1}
                name={entry.name}
                nameTag={entry.isMyUnit ? '(היחידה שלך)' : undefined}
                isMe={entry.isMyUnit}
                leading={<UnitIconBadge unitId={entry.unitId} iconUrl={entry.iconUrl} name={entry.name} size={32} />}
                sub={[entry.parentBreadcrumb, `${entry.activeParticipantCount} משתתפים פעילים`].filter(Boolean).join(' · ')}
                value={entry.avgSteps.toLocaleString('he-IL')}
                unit="צעדים"
              />
            ))}
          </div>
        ) : result?.myUnitBelowFloor ? (
          <BoardMessage
            icon={Users}
            title={`עוד ${result.myUnitBelowFloor.needed} מ${result.myUnitBelowFloor.name} וייפתח הדירוג`}
            body={`${result.myUnitBelowFloor.activeParticipantCount} משתתפים פעילים כרגע — שלח לחברים שלך ליחידה!`}
          />
        ) : (
          <BoardMessage
            icon={Shield}
            title="אין עדיין נתונים בטווח הזה"
            body="ברגע שיהיו מספיק מתאמנים פעילים, הדירוג יופיע כאן"
          />
        )}
      </BoardCard>
    </section>
  );
}
