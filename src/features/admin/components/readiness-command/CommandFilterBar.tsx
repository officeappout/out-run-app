'use client';

import { ArrowUp, ArrowDown, Search } from 'lucide-react';
import type { CommandSortDirection, CommandSortKey } from '@/features/readiness/core/services/readiness-command.util';

const SORT_OPTIONS: { key: CommandSortKey; label: string }[] = [
  { key: 'size', label: 'גודל' },
  { key: 'passPercent', label: 'אחוז כשירות' },
  { key: 'gap', label: 'פער בין יחידות' },
  { key: 'appActive', label: 'מחוברים לאפליקציה' },
];

/** David: pullups/dips chips use the real testIds directly ('pullups'/'dips'), matching PULL_TEST_ID/PUSH_TEST_ID everywhere else in this codebase — not a parallel enum. */
const COMPONENT_CHIPS: { key: string; label: string }[] = [
  { key: 'all', label: 'הכל' },
  { key: 'run_3000m', label: 'ריצה' },
  { key: 'pullups', label: 'מתח' },
  { key: 'dips', label: 'מקבילים' },
];

export interface CommandFilterBarProps {
  sortKey: CommandSortKey;
  direction: CommandSortDirection;
  onSortChange: (key: CommandSortKey) => void;
  onDirectionToggle: () => void;
  component: string;
  onComponentChange: (component: string) => void;
  onlyWithData: boolean;
  onOnlyWithDataChange: (value: boolean) => void;
  search: string;
  onSearchChange: (value: string) => void;
}

export default function CommandFilterBar({
  sortKey, direction, onSortChange, onDirectionToggle, component, onComponentChange, onlyWithData, onOnlyWithDataChange, search, onSearchChange,
}: CommandFilterBarProps) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-gray-500 font-bold">מיון:</span>
        <select
          value={sortKey}
          onChange={(e) => onSortChange(e.target.value as CommandSortKey)}
          className="text-xs font-bold bg-slate-100 rounded-lg px-2 py-1.5 border-none"
        >
          {SORT_OPTIONS.map((opt) => <option key={opt.key} value={opt.key}>{opt.label}</option>)}
        </select>
        <button
          type="button"
          onClick={onDirectionToggle}
          className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600"
          aria-label={direction === 'asc' ? 'עולה' : 'יורד'}
          title={direction === 'asc' ? 'עולה' : 'יורד'}
        >
          {direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        {COMPONENT_CHIPS.map((chip) => (
          <button
            key={chip.key}
            onClick={() => onComponentChange(chip.key)}
            className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${
              component === chip.key ? 'bg-lime-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      <label className="flex items-center gap-1.5 text-xs font-bold text-gray-600 cursor-pointer">
        <input type="checkbox" checked={onlyWithData} onChange={(e) => onOnlyWithDataChange(e.target.checked)} className="rounded" />
        רק עם נתונים
      </label>

      <div className="relative flex-1 min-w-[160px]">
        <Search size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="חיפוש..."
          className="w-full text-xs bg-slate-100 rounded-lg pr-8 pl-3 py-1.5 border-none"
        />
      </div>
    </div>
  );
}
