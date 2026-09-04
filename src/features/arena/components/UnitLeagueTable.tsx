'use client';

import { useEffect, useState } from 'react';
import { Trophy, RefreshCw, ChevronDown } from 'lucide-react';
import { getUnitLeagueLeaderboard, type UnitLeagueRange, type UnitLeagueResult } from '../services/unit-league.service';
import { getRelativeTime } from '@/lib/utils/date-formatter';

const RANGE_OPTIONS: { value: UnitLeagueRange; label: string }[] = [
  { value: 'my_battalion_companies', label: 'הפלוגות בגדוד שלי' },
  { value: 'my_brigade_battalions', label: 'הגדודים בחטיבה שלי' },
  { value: 'all_companies', label: 'כל הפלוגות בארץ' },
  { value: 'all_brigades', label: 'כל החטיבות בארץ' },
];

const ACCENT = '#00ADEF';

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
  const [isOpen, setIsOpen] = useState(false);
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

  const activeOpt = RANGE_OPTIONS.find((o) => o.value === range) ?? RANGE_OPTIONS[0];

  return (
    <section dir="rtl">
      <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '0.5px solid #E5E7EB' }}>
        {/* Header */}
        <div className="px-5 pt-5 pb-3" style={{ borderBottom: '0.5px solid #F3F4F6' }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#E1F5EE' }}>
                <Trophy className="w-5 h-5" style={{ color: ACCENT }} />
              </div>
              <div>
                <h4 className="text-sm font-black text-gray-900">תחרות בין יחידות</h4>
                <p className="text-[10px] text-gray-500 font-medium">
                  {/* Mandatory, not decoration (David, 05.09.2026) — every row's data is from a scheduled hourly rollup, must be legible how fresh it is. */}
                  {result?.updatedAt ? `עודכן ${getRelativeTime(result.updatedAt)}` : 'טעינה...'}
                </p>
              </div>
            </div>
            <button
              onClick={fetchData}
              className="p-2 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors"
              aria-label="רענון"
            >
              <RefreshCw className={`w-4 h-4 text-gray-500 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Range dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsOpen((o) => !o)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border-2 border-gray-200 text-gray-700"
            >
              {activeOpt.label}
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
              <div className="absolute z-10 mt-1 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden min-w-[180px]">
                {RANGE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { setRange(opt.value); setIsOpen(false); }}
                    className={`w-full text-right px-4 py-2.5 text-sm font-bold ${
                      opt.value === range ? 'text-[#00ADEF] bg-[#E1F5EE]' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Body */}
        {isLoading ? (
          <div className="py-12 text-center text-sm text-gray-400">טוען...</div>
        ) : result && result.entries.length > 0 ? (
          <div>
            {result.entries.map((entry, idx) => (
              <div
                key={entry.directoryId}
                className={`flex items-center gap-3 px-5 py-3 ${
                  idx !== result.entries.length - 1 ? 'border-b border-gray-50' : ''
                }`}
                style={{ backgroundColor: entry.isMyUnit ? '#F0FBF6' : 'transparent' }}
              >
                <span className="w-7 text-center text-sm font-black text-gray-400 tabular-nums">{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">
                    {entry.name}
                    {entry.isMyUnit && (
                      <span className="text-[10px] font-medium mr-1" style={{ color: ACCENT }}>(היחידה שלך)</span>
                    )}
                  </p>
                  {entry.parentBreadcrumb && (
                    <p className="text-[10px] text-gray-400 truncate">{entry.parentBreadcrumb}</p>
                  )}
                </div>
                <div className="text-left flex-shrink-0">
                  <p className="text-sm font-black text-gray-900 tabular-nums">{entry.avgSteps.toLocaleString('he-IL')}</p>
                  <p className="text-[10px] text-gray-400">{entry.activeParticipantCount} משתתפים פעילים</p>
                </div>
              </div>
            ))}
          </div>
        ) : result?.myUnitBelowFloor ? (
          <div className="px-5 py-10 text-center">
            <p className="text-3xl mb-3">💪</p>
            <p className="text-sm font-black text-gray-900">
              עוד {result.myUnitBelowFloor.needed} מ{result.myUnitBelowFloor.name} וייפתח הדירוג
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {result.myUnitBelowFloor.activeParticipantCount} משתתפים פעילים כרגע — שלח לחברים שלך ליחידה!
            </p>
          </div>
        ) : (
          <div className="px-5 py-10 text-center">
            <p className="text-sm font-bold text-gray-900">אין עדיין נתונים בטווח הזה</p>
            <p className="text-xs text-gray-500 mt-1">ברגע שיהיו מספיק מתאמנים פעילים, הדירוג יופיע כאן</p>
          </div>
        )}
      </div>
    </section>
  );
}
