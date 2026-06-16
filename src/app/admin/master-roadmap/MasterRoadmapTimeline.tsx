'use client';

import type { RoadmapItem, RoadmapDomain } from '@/types/roadmap-unified.types';

// ─── Lane definitions (matches ROAD MAP 2026 Kanban) ─────────────────────────

interface TimelineLane {
  key: string;
  label: string;
  domain: RoadmapDomain | null;
  rowBg: string;
  borderColor: string;
  labelColor: string;
  barBg: string;
}

const TIMELINE_LANES: TimelineLane[] = [
  { key: 'events',    label: 'אירועים',       domain: 'events',    rowBg: 'bg-orange-50',  borderColor: 'border-orange-100', labelColor: 'text-orange-700', barBg: 'bg-orange-400'  },
  { key: 'dev',       label: 'עיצוב + פיתוח', domain: 'dev',       rowBg: 'bg-violet-50',  borderColor: 'border-violet-100', labelColor: 'text-violet-700', barBg: 'bg-violet-500'  },
  { key: 'marketing', label: 'שיווק',          domain: 'marketing', rowBg: 'bg-pink-50',    borderColor: 'border-pink-100',   labelColor: 'text-pink-700',   barBg: 'bg-pink-400'    },
  { key: 'content',   label: 'ניהול תוכן',   domain: null,        rowBg: 'bg-slate-50',   borderColor: 'border-slate-100',  labelColor: 'text-slate-400',  barBg: 'bg-slate-400'   },
  { key: 'sales',     label: 'מכירות',        domain: 'sales',     rowBg: 'bg-blue-50',    borderColor: 'border-blue-100',   labelColor: 'text-blue-700',   barBg: 'bg-blue-500'    },
  { key: 'big_tasks', label: 'משימות גדולות', domain: null,        rowBg: 'bg-emerald-50', borderColor: 'border-emerald-100',labelColor: 'text-emerald-600',barBg: 'bg-emerald-500' },
  { key: 'biz_dev',   label: 'פיתוח עסקי',   domain: null,        rowBg: 'bg-teal-50',    borderColor: 'border-teal-100',   labelColor: 'text-teal-600',   barBg: 'bg-teal-500'    },
];

// ─── Month labels ─────────────────────────────────────────────────────────────

const MONTHS_HE = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳'];

// ─── Year positioning ─────────────────────────────────────────────────────────

const YEAR_START_MS = new Date('2026-01-01T00:00:00Z').getTime();
const YEAR_END_MS   = new Date('2027-01-01T00:00:00Z').getTime();
const YEAR_SPAN_MS  = YEAR_END_MS - YEAR_START_MS;

function toYearPct(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  if (isNaN(ms)) return null;
  return ((ms - YEAR_START_MS) / YEAR_SPAN_MS) * 100;
}

// ─── Bar layout ───────────────────────────────────────────────────────────────

const BAR_H      = 28;
const BAR_GAP    = 5;
const LANE_PAD   = 8;
const LABEL_W    = 128; // px

interface BarLayout {
  item: RoadmapItem;
  startPct: number;
  widthPct: number;
  row: number;
}

const TODAY_PCT = Math.max(0, Math.min(100, ((Date.now() - YEAR_START_MS) / YEAR_SPAN_MS) * 100));

function buildBars(items: RoadmapItem[]): BarLayout[] {
  const placed: BarLayout[] = items.map(item => {
    const startIso = item.startDate ?? item.createdAt ?? null;
    const endIso   = item.dueDate ?? null;

    let sp = toYearPct(startIso) ?? TODAY_PCT;
    let ep = endIso ? (toYearPct(endIso) ?? sp + 8.33) : sp + 8.33; // ≈ 1 month fallback

    sp = Math.max(0, Math.min(100, sp));
    ep = Math.max(0, Math.min(100, ep));
    if (ep <= sp) ep = Math.min(100, sp + 2);

    return { item, startPct: sp, widthPct: Math.max(1.5, ep - sp), row: 0 };
  });

  // Sort by start for greedy row packing
  placed.sort((a, b) => a.startPct - b.startPct);

  const rowEnds: number[] = [];
  placed.forEach(bar => {
    let r = rowEnds.findIndex(end => bar.startPct >= end + 0.3);
    if (r === -1) r = rowEnds.length;
    rowEnds[r] = bar.startPct + bar.widthPct;
    bar.row = r;
  });

  return placed;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TodayMarker() {
  if (TODAY_PCT < 0 || TODAY_PCT > 100) return null;
  return (
    <div
      className="absolute inset-y-0 w-px bg-blue-400/60 z-10 pointer-events-none"
      style={{ left: `${TODAY_PCT}%` }}
    />
  );
}

function GanttBar({ bar, lane }: { bar: BarLayout; lane: TimelineLane }) {
  const { item, startPct, widthPct, row } = bar;
  const top     = LANE_PAD + row * (BAR_H + BAR_GAP);
  const dimmed  = item.status === 'done' || item.status === 'cancelled';
  const noOwner = !item.assigneeName;

  const initials = (n: string) =>
    n.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div
      title={`${item.title} — ${item.assigneeName ?? 'ללא אחראי'}`}
      className={`absolute flex items-center gap-1 px-2 rounded-full shadow-sm select-none overflow-hidden transition-opacity cursor-default text-white ${lane.barBg} ${dimmed ? 'opacity-25' : 'opacity-90 hover:opacity-100'}`}
      style={{ left: `${startPct}%`, width: `${widthPct}%`, top, height: BAR_H }}
    >
      {/* Assignee avatar / placeholder */}
      {!noOwner ? (
        item.assigneePhotoURL ? (
          <img
            src={item.assigneePhotoURL}
            alt={item.assigneeName ?? ''}
            className="w-4 h-4 rounded-full object-cover flex-shrink-0 border border-white/40"
          />
        ) : (
          <div className="w-4 h-4 rounded-full bg-white/25 flex items-center justify-center flex-shrink-0 border border-white/30 text-[8px] font-black">
            {initials(item.assigneeName!)}
          </div>
        )
      ) : (
        /* ללא אחראי — dashed avatar */
        <div className="w-4 h-4 rounded-full border border-dashed border-white/60 flex items-center justify-center flex-shrink-0 opacity-60">
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-2.5 h-2.5">
            <path d="M8 8a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H1z" />
          </svg>
        </div>
      )}

      {/* Title — visible only if the bar is wide enough */}
      <span className="truncate text-[10px] font-semibold min-w-0 leading-none">
        {item.title}
      </span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MasterRoadmapTimeline({ items }: { items: RoadmapItem[] }) {
  const currentMonth = new Date().getMonth(); // 0-indexed
  const currentYear  = new Date().getFullYear();
  const isThisYear   = currentYear === 2026;

  return (
    <div
      className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden"
      dir="ltr"
    >
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
      {TIMELINE_LANES.map((lane, laneIdx) => {
        const laneItems = lane.domain ? items.filter(i => i.domain === lane.domain) : [];
        const bars      = buildBars(laneItems);
        const numRows   = bars.length > 0 ? Math.max(...bars.map(b => b.row)) + 1 : 1;
        const laneH     = Math.max(52, LANE_PAD * 2 + numRows * (BAR_H + BAR_GAP) - BAR_GAP);
        const isLast    = laneIdx === TIMELINE_LANES.length - 1;

        return (
          <div
            key={lane.key}
            className={`flex ${!isLast ? `border-b ${lane.borderColor}` : ''}`}
          >
            {/* Label panel (RTL text in LTR container) */}
            <div
              className={`flex-shrink-0 flex flex-col items-end justify-start pt-3 pr-3 pl-2 border-r ${lane.borderColor} ${lane.rowBg}`}
              style={{ width: LABEL_W }}
              dir="rtl"
            >
              <span className={`text-[11px] font-black leading-tight ${lane.labelColor}`}>
                {lane.label}
              </span>
              {laneItems.length > 0 && (
                <span className="text-[10px] text-gray-400 mt-0.5 font-normal">
                  {laneItems.length}
                </span>
              )}
            </div>

            {/* Bar area */}
            <div className={`flex-1 relative ${lane.rowBg}`} style={{ height: laneH }}>
              {/* Month grid lines */}
              {MONTHS_HE.map((_, i) => (
                <div
                  key={i}
                  className="absolute inset-y-0 border-r border-gray-100"
                  style={{ left: `${((i + 1) / 12) * 100}%` }}
                />
              ))}

              {/* Today line */}
              <TodayMarker />

              {/* Empty state */}
              {laneItems.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center" dir="rtl">
                  <span className="text-[11px] text-gray-300 font-medium">
                    {lane.domain ? 'אין פריטים תואמים' : 'טרם נוספו משימות'}
                  </span>
                </div>
              )}

              {/* Bars */}
              {bars.map(bar => (
                <GanttBar key={bar.item.id} bar={bar} lane={lane} />
              ))}
            </div>
          </div>
        );
      })}

      {/* Legend */}
      <div
        className="flex items-center gap-4 px-4 py-2.5 border-t border-gray-100 bg-gray-50"
        dir="rtl"
      >
        <span className="text-[10px] text-gray-400 font-bold">מקרא:</span>
        <span className="flex items-center gap-1.5 text-[10px] text-gray-500">
          <div className="w-px h-3 bg-blue-400/60" />
          היום
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-gray-500">
          <div className="w-4 h-3 rounded-full border border-dashed border-gray-400" />
          ללא אחראי
        </span>
        <span className="text-[10px] text-gray-400">
          פסים שקופים = הושלם / בוטל
        </span>
      </div>
    </div>
  );
}
