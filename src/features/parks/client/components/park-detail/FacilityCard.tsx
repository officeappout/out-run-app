'use client';

import React from 'react';
import type { ParkFeatureTag } from '@/features/parks/core/types/park.types';

export interface FacilityTagConfig {
  id: ParkFeatureTag;
  label: string;
  icon: string;
}

export const FACILITY_TAGS: FacilityTagConfig[] = [
  { id: 'night_lighting', label: 'תאורה', icon: '💡' },
  { id: 'water_fountain', label: 'ברזיית מים', icon: '🚰' },
  { id: 'shaded', label: 'הצללה', icon: '☀️' },
  { id: 'wheelchair_accessible', label: 'נגישות', icon: '♿' },
  { id: 'has_toilets', label: 'שירותים', icon: '🚻' },
  { id: 'rubber_floor', label: 'ריצפת גומי', icon: '🟫' },
  { id: 'has_benches', label: 'ספסלים', icon: '🪑' },
  { id: 'dog_friendly', label: 'ידידותי לכלבים', icon: '🐕' },
  { id: 'parkour_friendly', label: 'פארקור', icon: '🤸' },
  { id: 'stairs_training', label: 'מדרגות', icon: '🪜' },
  { id: 'safe_zone', label: 'מיגונית', icon: '🛡️' },
  { id: 'nearby_shelter', label: 'מקלט קרוב', icon: '🏠' },
];

interface FacilityCardProps {
  tag: FacilityTagConfig;
  isActive: boolean;
  variant?: 'mobile' | 'admin';
}

export default function FacilityCard({ tag, isActive, variant = 'mobile' }: FacilityCardProps) {
  if (variant === 'mobile') {
    return (
      <div
        className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
          isActive
            ? 'bg-white dark:bg-slate-800/90 shadow-sm'
            : 'bg-gray-100/60 dark:bg-slate-800/30'
        }`}
        style={isActive ? { border: '0.5px solid #E0E9FF' } : { border: '0.5px solid transparent' }}
        dir="rtl"
      >
        <span className={`text-xl ${isActive ? '' : 'opacity-30 grayscale'}`}>{tag.icon}</span>
        <div className="min-w-0">
          <p className={`text-sm font-bold leading-tight ${isActive ? 'text-gray-900 dark:text-white' : 'text-gray-300 dark:text-gray-600'}`}>
            {tag.label}
          </p>
          <p className={`text-[10px] ${isActive ? 'text-gray-400 dark:text-gray-500' : 'text-gray-300 dark:text-gray-700'}`}>
            {isActive ? 'קיים' : 'לא קיים'}
          </p>
        </div>
      </div>
    );
  }

  // Admin variant
  const COLOR_MAP: Record<string, string> = {
    night_lighting: 'bg-amber-50 border-amber-200 text-amber-800',
    water_fountain: 'bg-blue-50 border-blue-200 text-blue-800',
    shaded: 'bg-green-50 border-green-200 text-green-800',
    wheelchair_accessible: 'bg-violet-50 border-violet-200 text-violet-800',
    has_toilets: 'bg-rose-50 border-rose-200 text-rose-800',
    rubber_floor: 'bg-orange-50 border-orange-200 text-orange-800',
    has_benches: 'bg-cyan-50 border-cyan-200 text-cyan-800',
    dog_friendly: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    parkour_friendly: 'bg-indigo-50 border-indigo-200 text-indigo-800',
    stairs_training: 'bg-slate-50 border-slate-200 text-slate-700',
    safe_zone: 'bg-teal-50 border-teal-200 text-teal-800',
    nearby_shelter: 'bg-gray-50 border-gray-200 text-gray-700',
  };

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
        isActive
          ? COLOR_MAP[tag.id] || 'bg-gray-50 border-gray-200 text-gray-700'
          : 'bg-gray-50 border-gray-100 text-gray-300'
      }`}
    >
      <span className="text-xl">{tag.icon}</span>
      <div>
        <p className={`text-xs font-bold ${isActive ? '' : 'text-gray-300'}`}>{tag.label}</p>
        <p className={`text-[10px] ${isActive ? 'text-current opacity-60' : 'text-gray-300'}`}>
          {isActive ? 'קיים' : 'לא קיים'}
        </p>
      </div>
    </div>
  );
}
