/**
 * Roadmap lane definitions — data-driven, single source of truth.
 * To add a new lane (e.g. legal/financial): append one entry here. No other code changes needed.
 */
import type { RoadmapDomain } from '@/types/roadmap-unified.types';

export interface LaneConfig {
  key: string;
  label: string;
  /** Domains whose items default to this lane (can be empty for theme-only lanes) */
  domains: RoadmapDomain[];
  rowBg: string;
  borderColor: string;
  labelColor: string;
  /** Task bar colour */
  barBg: string;
  /** Goal (epic) bar colour — darker */
  goalBarBg: string;
  /** Goal bar progress fill overlay */
  goalFillBg: string;
}

export const ROADMAP_LANES: LaneConfig[] = [
  {
    key: 'events',
    label: 'אירועים',
    domains: ['events'],
    rowBg: 'bg-orange-50',
    borderColor: 'border-orange-100',
    labelColor: 'text-orange-700',
    barBg: 'bg-orange-400',
    goalBarBg: 'bg-orange-600',
    goalFillBg: 'bg-orange-300',
  },
  {
    key: 'dev',
    label: 'עיצוב + פיתוח',
    domains: ['dev'],
    rowBg: 'bg-violet-50',
    borderColor: 'border-violet-100',
    labelColor: 'text-violet-700',
    barBg: 'bg-violet-500',
    goalBarBg: 'bg-violet-700',
    goalFillBg: 'bg-violet-400',
  },
  {
    key: 'marketing',
    label: 'שיווק',
    domains: ['marketing'],
    rowBg: 'bg-pink-50',
    borderColor: 'border-pink-100',
    labelColor: 'text-pink-700',
    barBg: 'bg-pink-400',
    goalBarBg: 'bg-pink-600',
    goalFillBg: 'bg-pink-300',
  },
  {
    key: 'content',
    label: 'ניהול תוכן',
    domains: [],
    rowBg: 'bg-slate-50',
    borderColor: 'border-slate-100',
    labelColor: 'text-slate-500',
    barBg: 'bg-slate-400',
    goalBarBg: 'bg-slate-600',
    goalFillBg: 'bg-slate-300',
  },
  {
    key: 'sales',
    label: 'מכירות',
    domains: ['sales'],
    rowBg: 'bg-blue-50',
    borderColor: 'border-blue-100',
    labelColor: 'text-blue-700',
    barBg: 'bg-blue-500',
    goalBarBg: 'bg-blue-700',
    goalFillBg: 'bg-blue-400',
  },
  {
    key: 'big_tasks',
    label: 'משימות גדולות',
    domains: [],
    rowBg: 'bg-emerald-50',
    borderColor: 'border-emerald-100',
    labelColor: 'text-emerald-600',
    barBg: 'bg-emerald-500',
    goalBarBg: 'bg-emerald-700',
    goalFillBg: 'bg-emerald-400',
  },
  {
    key: 'biz_dev',
    label: 'פיתוח עסקי',
    domains: [],
    rowBg: 'bg-teal-50',
    borderColor: 'border-teal-100',
    labelColor: 'text-teal-600',
    barBg: 'bg-teal-500',
    goalBarBg: 'bg-teal-700',
    goalFillBg: 'bg-teal-400',
  },
];

/** Find the lane key for a given item (theme overrides domain) */
export function resolveLaneKey(domain: RoadmapDomain, theme?: string | null): string | null {
  if (theme) return theme;
  return ROADMAP_LANES.find(l => l.domains.includes(domain))?.key ?? null;
}

export function getLane(key: string): LaneConfig | undefined {
  return ROADMAP_LANES.find(l => l.key === key);
}
