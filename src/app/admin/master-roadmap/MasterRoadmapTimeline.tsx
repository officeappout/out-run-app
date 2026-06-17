'use client';

import { useState, useMemo } from 'react';
import { ChevronRight, ChevronDown, LayoutList, Layers } from 'lucide-react';
import type { RoadmapItem } from '@/types/roadmap-unified.types';
import { ROADMAP_LANES, resolveLaneKey, type LaneConfig } from '@/config/roadmap-lanes.config';

// ─── Layout constants ─────────────────────────────────────────────────────────

const GOAL_H      = 34;   // goal bar height px
const TASK_H      = 26;   // task bar height px
const ROW_GAP     = 4;    // gap between task rows within a group
const GOAL_PAD_B  = 8;    // gap below goal bar before children
const GROUP_GAP   = 10;   // gap between goal groups
const ORPHAN_GAP  = 8;    // gap above orphan section (when goals present)
const LANE_PAD    = 10;   // top + bottom padding inside lane bar area
const LABEL_W     = 130;  // px — lane label panel width

// ─── Year axis ────────────────────────────────────────────────────────────────

const YEAR_START = new Date('2026-01-01T00:00:00Z').getTime();
const YEAR_END   = new Date('2027-01-01T00:00:00Z').getTime();
const YEAR_SPAN  = YEAR_END - YEAR_START;
const MONTHS_HE  = ['ינו׳','פבר׳','מרץ','אפר׳','מאי','יוני','יולי','אוג׳','ספט׳','אוק׳','נוב׳','דצמ׳'];

function pct(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  if (isNaN(ms)) return null;
  return ((ms - YEAR_START) / YEAR_SPAN) * 100;
}

const TODAY_PCT = Math.max(0, Math.min(100, ((Date.now() - YEAR_START) / YEAR_SPAN) * 100));

// ─── Bar position helpers ─────────────────────────────────────────────────────

function barPcts(item: RoadmapItem, isGoal: boolean): { sp: number; wp: number } {
  const startIso = isGoal
    ? (item.rollupStartDate ?? item.startDate ?? item.createdAt)
    : (item.startDate ?? item.createdAt);
  const endIso = isGoal
    ? (item.rollupDueDate ?? item.dueDate)
    : item.dueDate;

  let sp = Math.max(0, Math.min(100, pct(startIso) ?? TODAY_PCT));
  let ep = endIso
    ? Math.max(0, Math.min(100, pct(endIso) ?? sp + 8.33))
    : sp + 8.33;
  if (ep <= sp) ep = Math.min(100, sp + 2);
  return { sp, wp: Math.max(1.5, ep - sp) };
}

// ─── Greedy row-packing ───────────────────────────────────────────────────────

interface PackedBar {
  item: RoadmapItem;
  sp: number;
  wp: number;
  row: number;
}

function packItems(items: RoadmapItem[], isGoal = false): PackedBar[] {
  const sorted = [...items].sort((a, b) => {
    const sa = pct(a.startDate ?? a.createdAt) ?? TODAY_PCT;
    const sb = pct(b.startDate ?? b.createdAt) ?? TODAY_PCT;
    return sa - sb;
  });
  const rowEnds: number[] = [];
  return sorted.map(item => {
    const { sp, wp } = barPcts(item, isGoal);
    let r = rowEnds.findIndex(end => sp >= end + 0.3);
    if (r === -1) r = rowEnds.length;
    rowEnds[r] = sp + wp;
    return { item, sp, wp, row: r };
  });
}

// ─── Lane layout ──────────────────────────────────────────────────────────────

interface GoalGroup {
  goalBar: PackedBar & { top: number };
  childBars: Array<PackedBar & { top: number }>;
  groupBottom: number;
}

interface LaneLayout {
  goalGroups: GoalGroup[];
  orphanBars: Array<PackedBar & { top: number }>;
  totalHeight: number;
}

function computeLaneLayout(
  goals: RoadmapItem[],
  orphans: RoadmapItem[],
  expandedGoals: Set<string>,
  showMode: 'goals' | 'all',
): LaneLayout {
  let y = LANE_PAD;
  const goalGroups: GoalGroup[] = [];

  for (const goal of goals) {
    const { sp, wp } = barPcts(goal, true);
    const goalBar: PackedBar & { top: number } = { item: goal, sp, wp, row: 0, top: y };
    y += GOAL_H;

    let childBars: Array<PackedBar & { top: number }> = [];
    const children = goal.children ?? [];

    if (showMode === 'all' && expandedGoals.has(goal.id) && children.length > 0) {
      y += GOAL_PAD_B;
      const packed = packItems(children);
      const maxRow = packed.length > 0 ? Math.max(...packed.map(b => b.row)) : 0;
      childBars = packed.map(b => ({
        ...b,
        top: y + b.row * (TASK_H + ROW_GAP),
      }));
      y += (maxRow + 1) * (TASK_H + ROW_GAP) - ROW_GAP;
    }

    goalGroups.push({ goalBar, childBars, groupBottom: y });
    y += GROUP_GAP;
  }

  let orphanBars: Array<PackedBar & { top: number }> = [];
  if (showMode === 'all' && orphans.length > 0) {
    if (goals.length > 0) y += ORPHAN_GAP;
    const packed = packItems(orphans);
    const maxRow = packed.length > 0 ? Math.max(...packed.map(b => b.row)) : 0;
    orphanBars = packed.map(b => ({ ...b, top: y + b.row * (TASK_H + ROW_GAP) }));
    y += (maxRow + 1) * (TASK_H + ROW_GAP) - ROW_GAP;
  }

  return { goalGroups, orphanBars, totalHeight: Math.max(52, y + LANE_PAD) };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Avatar({ item, size = 'sm' }: { item: RoadmapItem; size?: 'sm' | 'xs' }) {
  const dim = size === 'sm' ? 'w-5 h-5' : 'w-4 h-4';
  const textSz = size === 'sm' ? 'text-[9px]' : 'text-[8px]';
  const initials = (item.assigneeName ?? '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  if (!item.assigneeName) {
    return (
      <div className={`${dim} rounded-full border border-dashed border-white/60 flex items-center justify-center flex-shrink-0 opacity-60`}>
        <svg viewBox="0 0 16 16" fill="currentColor" className="w-2.5 h-2.5">
          <path d="M8 8a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H1z" />
        </svg>
      </div>
    );
  }
  if (item.assigneePhotoURL) {
    return (
      <img
        src={item.assigneePhotoURL}
        alt={item.assigneeName}
        className={`${dim} rounded-full object-cover flex-shrink-0 border border-white/40`}
      />
    );
  }
  return (
    <div className={`${dim} rounded-full bg-white/25 flex items-center justify-center flex-shrink-0 border border-white/30 ${textSz} font-black`}>
      {initials}
    </div>
  );
}

function GoalBar({
  bar,
  lane,
  expanded,
  onToggle,
  onClick,
}: {
  bar: PackedBar & { top: number };
  lane: LaneConfig;
  expanded: boolean;
  onToggle: () => void;
  onClick: (item: RoadmapItem) => void;
}) {
  const { item, sp, wp, top } = bar;
  const prog = item.rollupProgress ?? 0;
  const dimmed = item.status === 'done' || item.status === 'cancelled';
  const hasChildren = (item.children?.length ?? 0) > 0;
  const msPct = pct(item.milestoneDate);

  return (
    <>
      <div
        className={`absolute rounded-lg overflow-hidden cursor-pointer shadow-md transition-opacity select-none ${dimmed ? 'opacity-30' : 'opacity-95 hover:opacity-100'}`}
        style={{ left: `${sp}%`, width: `${wp}%`, top, height: GOAL_H, zIndex: 5 }}
        onClick={() => onClick(item)}
        title={`${item.title}${item.assigneeName ? ` — ${item.assigneeName}` : ''}`}
      >
        {/* Background */}
        <div className={`absolute inset-0 ${lane.goalBarBg}`} />
        {/* Progress fill */}
        {prog > 0 && (
          <div
            className={`absolute inset-y-0 left-0 ${lane.goalFillBg} opacity-40 transition-all`}
            style={{ width: `${prog}%` }}
          />
        )}
        {/* Content */}
        <div className="relative flex items-center gap-1.5 px-2 h-full">
          {/* Expand/collapse toggle */}
          {hasChildren && (
            <button
              onClick={e => { e.stopPropagation(); onToggle(); }}
              className="flex-shrink-0 text-white/80 hover:text-white transition-colors"
            >
              {expanded
                ? <ChevronDown size={13} />
                : <ChevronRight size={13} />}
            </button>
          )}
          <Avatar item={item} size="sm" />
          <span className="text-white text-[11px] font-black truncate min-w-0 flex-1">
            {item.title}
          </span>
          {prog > 0 && (
            <span className="text-white/80 text-[10px] font-bold flex-shrink-0">
              {prog}%
            </span>
          )}
        </div>
      </div>

      {/* Milestone diamond ◆ */}
      {msPct != null && msPct >= 0 && msPct <= 100 && (
        <div
          className="absolute z-20 pointer-events-none"
          style={{
            left: `${msPct}%`,
            top: top + GOAL_H - 5,
            transform: 'translateX(-50%)',
          }}
          title={`אבן דרך: ${item.milestoneDate?.slice(0, 10)}`}
        >
          <div className="w-3 h-3 bg-amber-500 rotate-45 shadow-sm border border-amber-300" />
        </div>
      )}
    </>
  );
}

function TaskBar({
  bar,
  lane,
  onClick,
}: {
  bar: PackedBar & { top: number };
  lane: LaneConfig;
  onClick: (item: RoadmapItem) => void;
}) {
  const { item, sp, wp, top } = bar;
  const dimmed = item.status === 'done' || item.status === 'cancelled';

  return (
    <div
      className={`absolute flex items-center gap-1 px-2 rounded-full shadow-sm overflow-hidden cursor-pointer select-none text-white transition-opacity ${lane.barBg} ${dimmed ? 'opacity-25' : 'opacity-90 hover:opacity-100'}`}
      style={{ left: `${sp}%`, width: `${wp}%`, top, height: TASK_H, zIndex: 3 }}
      onClick={() => onClick(item)}
      title={`${item.title}${item.assigneeName ? ` — ${item.assigneeName}` : ' — ללא אחראי'}`}
    >
      <Avatar item={item} size="xs" />
      <span className="truncate text-[10px] font-semibold min-w-0">{item.title}</span>
    </div>
  );
}

function TodayLine() {
  if (TODAY_PCT < 0 || TODAY_PCT > 100) return null;
  return (
    <div
      className="absolute inset-y-0 w-px bg-blue-400/70 z-10 pointer-events-none"
      style={{ left: `${TODAY_PCT}%` }}
    />
  );
}

// ─── Lane row ─────────────────────────────────────────────────────────────────

function LaneRow({
  lane,
  goals,
  orphans,
  expandedGoals,
  toggleGoal,
  showMode,
  onSelect,
  isLast,
}: {
  lane: LaneConfig;
  goals: RoadmapItem[];
  orphans: RoadmapItem[];
  expandedGoals: Set<string>;
  toggleGoal: (id: string) => void;
  showMode: 'goals' | 'all';
  onSelect: (item: RoadmapItem) => void;
  isLast: boolean;
}) {
  const layout = useMemo(
    () => computeLaneLayout(goals, orphans, expandedGoals, showMode),
    // expandedGoals is a Set — we need referential stability; caller should pass stable ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [goals, orphans, showMode, expandedGoals],
  );

  const { goalGroups, orphanBars, totalHeight } = layout;
  const itemCount = goals.length + orphans.length;

  return (
    <div className={`flex ${!isLast ? `border-b ${lane.borderColor}` : ''}`}>
      {/* Label panel */}
      <div
        className={`flex-shrink-0 flex flex-col items-end justify-start pt-3 pr-3 pl-2 border-r ${lane.borderColor} ${lane.rowBg}`}
        style={{ width: LABEL_W, minHeight: totalHeight }}
        dir="rtl"
      >
        <span className={`text-[11px] font-black leading-tight ${lane.labelColor}`}>
          {lane.label}
        </span>
        {itemCount > 0 && (
          <span className="text-[10px] text-gray-400 mt-0.5">
            {goals.length > 0 && `${goals.length} יעדים`}
            {goals.length > 0 && orphans.length > 0 && ' · '}
            {orphans.length > 0 && `${orphans.length} משימות`}
          </span>
        )}
      </div>

      {/* Bar area */}
      <div className={`flex-1 relative ${lane.rowBg}`} style={{ height: totalHeight }}>
        {/* Month grid lines */}
        {MONTHS_HE.map((_, i) => (
          <div
            key={i}
            className="absolute inset-y-0 border-r border-gray-100"
            style={{ left: `${((i + 1) / 12) * 100}%` }}
          />
        ))}

        {/* Today marker */}
        <TodayLine />

        {/* Empty state */}
        {itemCount === 0 && (
          <div className="absolute inset-0 flex items-center justify-center" dir="rtl">
            <span className="text-[11px] text-gray-300 font-medium">
              {lane.domains.length > 0 ? 'אין פריטים תואמים' : 'טרם נוספו משימות'}
            </span>
          </div>
        )}

        {/* Goal groups */}
        {goalGroups.map(({ goalBar, childBars }) => (
          <div key={goalBar.item.id}>
            <GoalBar
              bar={goalBar}
              lane={lane}
              expanded={expandedGoals.has(goalBar.item.id)}
              onToggle={() => toggleGoal(goalBar.item.id)}
              onClick={onSelect}
            />
            {childBars.map(cb => (
              <TaskBar key={cb.item.id} bar={cb} lane={lane} onClick={onSelect} />
            ))}
          </div>
        ))}

        {/* Orphan tasks */}
        {orphanBars.map(ob => (
          <TaskBar key={ob.item.id} bar={ob} lane={lane} onClick={onSelect} />
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  items: RoadmapItem[];
  onSelect: (item: RoadmapItem) => void;
}

export default function MasterRoadmapTimeline({ items, onSelect }: Props) {
  const [showMode, setShowMode] = useState<'goals' | 'all'>('all');
  const [expandedGoals, setExpandedGoals] = useState<Set<string>>(() => {
    const goalIds = items.filter(i => i.isGoal).map(i => i.id);
    return new Set(goalIds);
  });

  const toggleGoal = (id: string) => {
    setExpandedGoals(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const currentMonth = new Date().getMonth();
  const isThisYear = new Date().getFullYear() === 2026;

  // Build per-lane item lists
  const laneData = useMemo(() => {
    return ROADMAP_LANES.map(lane => {
      const goals = items.filter(
        i => i.isGoal && resolveLaneKey(i.domain, i.theme) === lane.key,
      );
      const goalIds = new Set(goals.map(g => g.id));
      const orphans = items.filter(
        i => !i.isGoal &&
          resolveLaneKey(i.domain, i.theme) === lane.key &&
          (!i.parentGoalId || !goalIds.has(i.parentGoalId)),
      );
      return { lane, goals, orphans };
    });
  }, [items]);

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden" dir="ltr">
      {/* Toolbar */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50"
        dir="rtl"
      >
        <div className="flex items-center gap-1 bg-white rounded-lg border border-gray-200 p-0.5">
          <button
            onClick={() => setShowMode('goals')}
            className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-md transition-all ${
              showMode === 'goals'
                ? 'bg-slate-800 text-white'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Layers size={11} />
            יעדים בלבד
          </button>
          <button
            onClick={() => setShowMode('all')}
            className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-md transition-all ${
              showMode === 'all'
                ? 'bg-slate-800 text-white'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <LayoutList size={11} />
            יעדים + משימות
          </button>
        </div>
        <span className="text-[11px] text-gray-400 font-medium">ציר זמן 2026</span>
      </div>

      {/* Month header */}
      <div className="flex border-b border-gray-200" style={{ paddingLeft: LABEL_W }}>
        {MONTHS_HE.map((label, i) => {
          const isCurrent = isThisYear && i === currentMonth;
          return (
            <div
              key={i}
              className={`flex-1 text-center text-[11px] font-semibold py-2 border-r border-gray-100 last:border-r-0 ${
                isCurrent ? 'bg-blue-50 text-blue-600' : 'bg-gray-50 text-gray-400'
              }`}
            >
              {label}
            </div>
          );
        })}
      </div>

      {/* Lanes */}
      {laneData.map(({ lane, goals, orphans }, idx) => (
        <LaneRow
          key={lane.key}
          lane={lane}
          goals={goals}
          orphans={orphans}
          expandedGoals={expandedGoals}
          toggleGoal={toggleGoal}
          showMode={showMode}
          onSelect={onSelect}
          isLast={idx === laneData.length - 1}
        />
      ))}

      {/* Legend */}
      <div
        className="flex flex-wrap items-center gap-4 px-4 py-2.5 border-t border-gray-100 bg-gray-50"
        dir="rtl"
      >
        <span className="text-[10px] text-gray-400 font-bold">מקרא:</span>
        <span className="flex items-center gap-1.5 text-[10px] text-gray-500">
          <div className="w-px h-3 bg-blue-400/70" />
          היום
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-gray-500">
          <div className="w-3 h-3 bg-amber-500 rotate-45 inline-block" />
          אבן דרך
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-gray-500">
          <div className="w-4 h-3 rounded-sm bg-violet-700 opacity-90 inline-block" />
          יעד/עפיק
        </span>
        <span className="text-[10px] text-gray-400">שקוף = הושלם / בוטל</span>
      </div>
    </div>
  );
}
