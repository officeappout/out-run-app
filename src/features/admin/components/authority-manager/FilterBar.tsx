'use client';

import { X } from 'lucide-react';
import type { DashboardFilters } from '@/features/admin/services/analytics.service';

interface FilterBarProps {
  filters: DashboardFilters;
  neighborhoods: { id: string; name: string }[];
  onChange: (next: DashboardFilters) => void;
}

const TIME_OPTIONS: { value: DashboardFilters['timeRange']; label: string }[] = [
  { value: 'day',   label: 'יום' },
  { value: 'week',  label: 'שבוע' },
  { value: 'month', label: 'חודש' },
  { value: 'year',  label: 'שנה' },
];

const GENDER_OPTIONS: { value: DashboardFilters['gender']; label: string }[] = [
  { value: 'all',    label: 'הכל' },
  { value: 'female', label: 'נשים' },
  { value: 'male',   label: 'גברים' },
];

const DEFAULT: DashboardFilters = {
  timeRange: 'month', gender: 'all', persona: 'all',
  neighborhoodId: 'all', compareNeighborhoodId: null,
};

function isDefault(f: DashboardFilters) {
  return f.timeRange === 'month' && f.gender === 'all' &&
    f.persona === 'all' && f.neighborhoodId === 'all' && !f.compareNeighborhoodId;
}

export default function FilterBar({ filters, neighborhoods, onChange }: FilterBarProps) {
  const set = (patch: Partial<DashboardFilters>) => onChange({ ...filters, ...patch });

  return (
    <div
      className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-gray-200 shadow-sm px-4 py-3 -mx-4 sm:-mx-6 sm:px-6"
      dir="rtl"
    >
      <div className="flex flex-wrap items-center gap-3">
        {/* Time Range Pills */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          {TIME_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => set({ timeRange: opt.value })}
              className={`px-3 py-1.5 text-xs font-bold transition-colors ${
                filters.timeRange === opt.value
                  ? 'bg-cyan-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Gender */}
        <select
          value={filters.gender}
          onChange={e => set({ gender: e.target.value as DashboardFilters['gender'] })}
          className="text-xs font-bold border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:ring-2 focus:ring-cyan-400 outline-none"
        >
          {GENDER_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {/* Neighborhood */}
        <select
          value={filters.neighborhoodId}
          onChange={e => {
            const neighborhoodId = e.target.value;
            set({
              neighborhoodId,
              compareNeighborhoodId: neighborhoodId === 'all' ? null : filters.compareNeighborhoodId,
            });
          }}
          className="text-xs font-bold border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:ring-2 focus:ring-cyan-400 outline-none max-w-[180px]"
        >
          <option value="all">כל השכונות</option>
          {neighborhoods.map(n => (
            <option key={n.id} value={n.id}>{n.name}</option>
          ))}
        </select>

        {/* Compare Neighborhood (only visible when a neighborhood is selected) */}
        {filters.neighborhoodId !== 'all' && (
          <select
            value={filters.compareNeighborhoodId ?? ''}
            onChange={e => set({ compareNeighborhoodId: e.target.value || null })}
            className="text-xs font-bold border border-purple-200 rounded-lg px-3 py-1.5 bg-purple-50 text-purple-700 focus:ring-2 focus:ring-purple-400 outline-none max-w-[180px]"
          >
            <option value="">השווה עם...</option>
            {neighborhoods
              .filter(n => n.id !== filters.neighborhoodId)
              .map(n => (
                <option key={n.id} value={n.id}>{n.name}</option>
              ))}
          </select>
        )}

        {/* Reset */}
        {!isDefault(filters) && (
          <button
            onClick={() => onChange(DEFAULT)}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors font-semibold"
          >
            <X size={14} />
            אפס
          </button>
        )}
      </div>
    </div>
  );
}
