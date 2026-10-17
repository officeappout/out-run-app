'use client';

/**
 * NationalLeagueBoard — the home v2 leagues boards that only exist on the
 * server aggregates (design lab "leagues", stage 2, 17.10.2026):
 *   • settlements tab — every city / council / kibbutz & moshav, with type chips
 *     and, for kibbutzim & moshavim, a region (regional council) row;
 *   • nationwide neighborhoods;
 *   • a third measure, "הכי משתפרים" — biggest gain vs the previous period.
 * Same BoardCard / podium / rows as the other boards.
 */
import { useEffect, useState } from 'react';
import { ChevronDown, RefreshCw, SlidersHorizontal, Trophy, TrendingUp } from 'lucide-react';
import Button from '@/components/ui/v2/Button';
import { BoardCard, BoardIconButton, BoardMessage, BoardRow, BoardRowSkeleton, BoardPodium, BoardToggle, type PodiumEntry } from './LeagueBoard';
import { perMember, rankByMeasure } from './league-board-logic';
import { CATEGORY_UNIT_LABEL } from './scope-category-unit-label';
import {
  getLeagueBoard,
  type LeagueBoardEntry,
  type LeagueBoardKind,
  type LeaderboardCategory,
  type LeaderboardGenderFilter,
  type LeaderboardTimeWindow,
} from '@/features/arena/services/ranking.service';

type Measure = 'avg' | 'total' | 'improved';
type SettlementType = 'all' | 'city' | 'council' | 'settlement';

const TYPE_CHIPS: { id: SettlementType; label: string }[] = [
  { id: 'all', label: 'כל היישובים' },
  { id: 'city', label: 'ערים' },
  { id: 'council', label: 'מועצות' },
  { id: 'settlement', label: 'קיבוצים ומושבים' },
];

function Chips<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="-mx-1 mb-2.5 flex gap-1.5 overflow-x-auto px-1 no-scrollbar" role="radiogroup" aria-label={label}>
      {options.map((c) => (
        <button
          key={c.id}
          type="button"
          role="radio"
          aria-checked={value === c.id}
          onClick={() => onChange(c.id)}
          className={`h-8 shrink-0 whitespace-nowrap rounded-full px-3.5 text-[12.5px] font-extrabold transition-colors ease-v2 ${
            value === c.id ? 'bg-v2-tint text-v2-deep ring-1 ring-inset ring-v2-accent/40' : 'bg-white text-v2-ink-2 shadow-v2-ring'
          }`}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}

export default function NationalLeagueBoard({
  mode,
  timeWindow,
  category,
  genderFilter = 'all',
  myScopeIds = [],
}: {
  /** settlements = the יישובים tab; neighborhoods = every neighborhood in the country. */
  mode: 'settlements' | 'neighborhoods';
  timeWindow: LeaderboardTimeWindow;
  category: LeaderboardCategory;
  /** Kept for the call sites; activity chips were dropped from these boards (too many buttons). */
  onCategoryChange?: (c: LeaderboardCategory) => void;
  genderFilter?: LeaderboardGenderFilter;
  /** The viewer's own city / neighborhood ids — their rows get "שלך". */
  myScopeIds?: (string | null | undefined)[];
}) {
  const [type, setType] = useState<SettlementType>('all');
  const [region, setRegion] = useState<string | null>(null);
  const [measure, setMeasure] = useState<Measure>('avg');
  const [entries, setEntries] = useState<LeagueBoardEntry[]>([]);
  const [regions, setRegions] = useState<{ id: string; name: string }[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Filters fold into one "סינון" button (owner: too many rows of buttons).
  const [filtersOpen, setFiltersOpen] = useState(false);

  const board: LeagueBoardKind = mode === 'neighborhoods' ? 'neighborhood-national' : type === 'settlement' ? 'settlement' : 'city';

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await getLeagueBoard({
        board,
        timeWindow,
        measure: measure === 'improved' ? 'improved' : 'total',
        region: board === 'settlement' ? region : null,
        kind: board === 'city' && (type === 'city' || type === 'council') ? type : 'all',
        category,
        genderFilter,
      });
      setUnavailable(!!r.unavailable);
      setEntries(r.entries ?? []);
      if (r.regions) setRegions(r.regions);
    } catch (err) {
      console.error('[NationalLeagueBoard]', err);
      setError('שגיאה בטעינת הדירוג');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [board, timeWindow, measure, region, type, category, genderFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setRegion(null);
  }, [type]);

  const unit = CATEGORY_UNIT_LABEL[category];
  const mine = new Set(myScopeIds.filter(Boolean) as string[]);
  const ranked =
    measure === 'improved' ? entries.map((e, i) => ({ ...e, rank: i + 1 })) : rankByMeasure(entries, measure === 'avg' ? 'avg' : 'total');
  const value = (e: LeagueBoardEntry) =>
    measure === 'improved' ? `+${(e.delta ?? 0).toLocaleString('he-IL')}` : (measure === 'avg' ? perMember(e) : e.totalScore).toLocaleString('he-IL');
  const sub = (e: LeagueBoardEntry) =>
    [e.parentName, `${e.activeMemberCount} פעיל${e.activeMemberCount !== 1 ? 'ים' : ''}`].filter(Boolean).join(' · ');
  const top3 = ranked.slice(0, 3);
  const podium: [PodiumEntry, PodiumEntry, PodiumEntry] | null =
    top3.length === 3
      ? (top3.map((e) => ({ key: e.scopeId, name: e.scopeName, value: value(e), sub: e.parentName ?? `${e.activeMemberCount} פעילים` })) as [
          PodiumEntry,
          PodiumEntry,
          PodiumEntry,
        ])
      : null;
  const windowLabel = timeWindow === 'weekly' ? 'השבוע' : timeWindow === 'monthly' ? 'החודש' : 'היום';
  const title = mode === 'neighborhoods' ? 'השכונות בכל הארץ' : 'ליגת היישובים';

  return (
    <BoardCard
      title={title}
      subtitle={windowLabel}
      actions={<BoardIconButton icon={RefreshCw} label="רענן" onClick={() => void load()} spinning={loading} />}
    >
      {mode === 'settlements' && (
        <div className="mb-2.5">
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            className={`flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13px] font-extrabold transition-colors ${
              type !== 'all' || region ? 'bg-v2-tint text-v2-deep ring-1 ring-inset ring-v2-accent/40' : 'bg-white text-v2-ink-2 shadow-v2-ring'
            }`}
          >
            <SlidersHorizontal size={14} strokeWidth={2.6} aria-hidden />
            {type === 'all' ? 'סינון' : TYPE_CHIPS.find((c) => c.id === type)?.label}
            {region ? ` · ${regions.find((r) => r.id === region)?.name ?? ''}` : ''}
            <ChevronDown size={14} strokeWidth={2.6} className={`transition-transform ${filtersOpen ? 'rotate-180' : ''}`} aria-hidden />
          </button>
          {filtersOpen && (
            <div className="mt-2 rounded-[18px] bg-v2-surface p-2.5 ring-1 ring-inset ring-v2-hairline">
              <Chips value={type} options={TYPE_CHIPS} onChange={setType} label="סוג יישוב" />
              {board === 'settlement' && regions.length > 1 && (
                <Chips
                  value={region ?? 'all'}
                  options={[{ id: 'all', label: 'כל האזורים' }, ...regions.map((r) => ({ id: r.id, label: r.name }))]}
                  onChange={(v) => setRegion(v === 'all' ? null : v)}
                  label="אזור"
                />
              )}
            </div>
          )}
        </div>
      )}
      <div className="mb-2">
        <BoardToggle
          label="שיטת דירוג"
          value={measure}
          onChange={setMeasure}
          options={[
            { id: 'avg', label: 'ממוצע' },
            { id: 'total', label: 'סה״כ' },
            { id: 'improved', label: 'הכי משתפרים' },
          ]}
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <BoardRowSkeleton key={i} />
          ))}
        </div>
      ) : unavailable ? (
        <BoardMessage icon={Trophy} title="הדירוג הזה נפתח בקרוב" body="הוא נבנה מהאימונים עצמם — עוד רגע הוא כאן." />
      ) : error ? (
        <BoardMessage
          icon={RefreshCw}
          title={error}
          action={
            <Button variant="primary" size="sm" onClick={() => void load()}>
              נסה שוב
            </Button>
          }
        />
      ) : ranked.length === 0 ? (
        <BoardMessage
          icon={measure === 'improved' ? TrendingUp : Trophy}
          title={measure === 'improved' ? 'עוד אין שיפור לעומת התקופה הקודמת' : 'עוד אין פעילות בתקופה הזו'}
          body="כל אימון שנרשם מכניס את היישוב שלך לטבלה."
        />
      ) : (
        <>
          {podium && <BoardPodium entries={podium} />}
          <div className="mt-1 grid grid-cols-1 gap-1">
            {ranked.slice(podium ? 3 : 0).map((e) => (
              <BoardRow
                key={e.scopeId}
                rank={e.rank}
                name={e.scopeName}
                nameTag={mine.has(e.scopeId) ? 'שלך' : undefined}
                isMe={mine.has(e.scopeId)}
                sub={sub(e)}
                value={value(e)}
                unit={measure === 'avg' ? `${unit} למשתתף` : measure === 'improved' ? `${unit} מול ${timeWindow === 'monthly' ? 'החודש הקודם' : 'שבוע שעבר'}` : unit}
              />
            ))}
          </div>
          <p className="mt-3 text-[12px] font-bold leading-snug text-v2-muted">
            {measure === 'avg'
              ? 'בממוצע למשתתף פעיל הגודל לא קובע — גם יישוב קטן יכול לנצח.'
              : measure === 'improved'
                ? 'מי הוסיף הכי הרבה לעומת התקופה הקודמת.'
                : 'בסה״כ הגדולים מובילים. הדירוג הרשמי הוא לפי ממוצע למשתתף.'}
          </p>
        </>
      )}
    </BoardCard>
  );
}
