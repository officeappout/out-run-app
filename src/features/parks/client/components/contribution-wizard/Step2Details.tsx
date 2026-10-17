'use client';

import React from 'react';
import { ChevronRight, Dumbbell, Volleyball, Flower2, Zap, Trees, type LucideIcon } from 'lucide-react';
import { useWizardV2, V2_LABEL, V2_INPUT, v2Card, v2Chip, V2BackButton, V2PrimaryButton } from './wizard-v2';
import { AMENITY_ICON_MAP } from '../park-detail/amenity-icons';
import type { WizardData } from './index';
import type { ParkFacilityCategory, ParkFeatureTag } from '@/features/parks/core/types/park.types';

interface Props {
  data: WizardData;
  updateData: (partial: Partial<WizardData>) => void;
  onNext: () => void;
  onBack: () => void;
}

// 'route' is intentionally omitted: a user-submitted route currently becomes a
// generic park doc instead of flowing into the official_routes pipeline, so it
// is blocked in the wizard until that bridge exists (deferred G6).
const FACILITY_TYPES: { id: ParkFacilityCategory; label: string; icon: string }[] = [
  { id: 'gym_park', label: 'גינת כושר', icon: '🏋️' },
  { id: 'court', label: 'מגרש ספורט', icon: '🏀' },
  { id: 'zen_spot', label: 'פינת גוף-נפש', icon: '🧘' },
  { id: 'urban_spot', label: 'אורבן / אקסטרים', icon: '🛹' },
  { id: 'nature_community', label: 'טבע וקהילה', icon: '🌳' },
];

const FEATURE_TAGS: { id: ParkFeatureTag; label: string; icon: string }[] = [
  { id: 'shaded', label: 'צל', icon: '☀️' },
  { id: 'water_fountain', label: 'ברזיית מים', icon: '🚰' },
  { id: 'wheelchair_accessible', label: 'נגישות', icon: '♿' },
  { id: 'night_lighting', label: 'תאורה', icon: '💡' },
  { id: 'has_toilets', label: 'שירותים', icon: '🚻' },
  { id: 'rubber_floor', label: 'ריצפת גומי', icon: '🟫' },
  { id: 'has_benches', label: 'ספסלים', icon: '🪑' },
  { id: 'dog_friendly', label: 'ידידותי לכלבים', icon: '🐕' },
];

/** v2 icons for the facility-type cards (replace the emoji). */
const FACILITY_V2_ICONS: Partial<Record<ParkFacilityCategory, LucideIcon>> = {
  gym_park: Dumbbell,
  court: Volleyball,
  zen_spot: Flower2,
  urban_spot: Zap,
  nature_community: Trees,
};

export default function Step2Details({ data, updateData, onNext, onBack }: Props) {
  const v2 = useWizardV2();
  const toggleTag = (tag: ParkFeatureTag) => {
    const current = data.featureTags;
    const next = current.includes(tag)
      ? current.filter((t) => t !== tag)
      : [...current, tag];
    updateData({ featureTags: next });
  };

  const canProceed = data.parkName.trim().length > 0;

  if (v2) {
    return (
      <div className="flex h-full flex-col overflow-y-auto px-4 pb-6">
        {/* Name */}
        <div className="mb-5">
          <label htmlFor="contribution-park-name" className={V2_LABEL}>שם המיקום</label>
          <input
            id="contribution-park-name"
            type="text"
            value={data.parkName}
            onChange={(e) => updateData({ parkName: e.target.value })}
            placeholder="למשל: גינת כושר שנקין"
            className={V2_INPUT}
          />
        </div>

        {/* Facility Type — only for non-POI */}
        {!data.isPointOfInterest && (
          <div className="mb-5">
            <p className={V2_LABEL}>סוג מתקן</p>
            <div className="grid grid-cols-3 gap-2.5">
              {FACILITY_TYPES.map((ft) => {
                const on = data.facilityType === ft.id;
                const Icon = FACILITY_V2_ICONS[ft.id] ?? Dumbbell;
                return (
                  <button
                    key={ft.id}
                    type="button"
                    onClick={() => updateData({ facilityType: ft.id })}
                    className={`flex min-w-0 flex-col items-center gap-1.5 px-1.5 py-3 text-[13px] font-extrabold ${v2Card(on)}`}
                  >
                    <span className={`grid h-9 w-9 place-items-center rounded-full ${on ? 'bg-v2-tint text-v2-deep' : 'bg-v2-surface text-v2-muted'}`}>
                      <Icon size={18} strokeWidth={2.4} />
                    </span>
                    <span className="max-w-full truncate whitespace-nowrap">{ft.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Feature Tags */}
        <div className="mb-5">
          <p className={V2_LABEL}>מה יש במיקום?</p>
          <div className="flex flex-wrap gap-2">
            {FEATURE_TAGS.map((tag) => {
              const isActive = data.featureTags.includes(tag.id);
              const cfg = AMENITY_ICON_MAP[tag.id];
              const Icon = cfg?.IconComponent;
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleTag(tag.id)}
                  aria-pressed={isActive}
                  className={`flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13.5px] font-extrabold ${v2Chip(isActive)}`}
                >
                  {cfg?.iconSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cfg.iconSrc} alt="" width={18} height={18} className="flex-shrink-0 object-contain" />
                  ) : Icon ? (
                    <Icon size={16} strokeWidth={2.4} className={isActive ? 'flex-shrink-0 text-v2-deep' : 'flex-shrink-0 text-v2-muted'} />
                  ) : null}
                  {tag.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Navigation */}
        <div className="mt-auto flex items-center gap-3">
          <V2BackButton onClick={onBack} />
          <V2PrimaryButton onClick={onNext} disabled={!canProceed}>המשך</V2PrimaryButton>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full px-4 pb-6 overflow-y-auto">
      {/* Name */}
      <div className="mb-5">
        <label className="text-slate-500 text-xs font-bold mb-2 block">שם המיקום</label>
        <input
          type="text"
          value={data.parkName}
          onChange={(e) => updateData({ parkName: e.target.value })}
          placeholder="למשל: גינת כושר שנקין"
          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 text-sm placeholder:text-slate-400 outline-none focus:border-[#00E5FF] transition-colors"
        />
      </div>

      {/* Facility Type — only for non-POI */}
      {!data.isPointOfInterest && (
        <div className="mb-5">
          <label className="text-slate-500 text-xs font-bold mb-2 block">סוג מתקן</label>
          <div className="grid grid-cols-3 gap-2">
            {FACILITY_TYPES.map((ft) => (
              <button
                key={ft.id}
                onClick={() => updateData({ facilityType: ft.id })}
                className={`flex flex-col items-center gap-1 py-3 rounded-xl text-xs font-bold transition-all border ${
                  data.facilityType === ft.id
                    ? 'bg-[#00E5FF] text-white border-[#00E5FF] shadow-md shadow-cyan-500/20'
                    : 'bg-slate-50 text-slate-500 border-slate-200'
                }`}
              >
                <span className="text-xl">{ft.icon}</span>
                <span>{ft.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Feature Tags */}
      <div className="mb-5">
        <label className="text-slate-500 text-xs font-bold mb-2 block">מה יש במיקום?</label>
        <div className="grid grid-cols-4 gap-2">
          {FEATURE_TAGS.map((tag) => {
            const isActive = data.featureTags.includes(tag.id);
            return (
              <button
                key={tag.id}
                onClick={() => toggleTag(tag.id)}
                className={`flex flex-col items-center gap-1 py-2.5 rounded-xl text-[10px] font-bold transition-all border ${
                  isActive
                    ? 'bg-[#00E5FF] text-white border-[#00E5FF] shadow-md shadow-cyan-500/20'
                    : 'bg-slate-50 text-slate-500 border-slate-200'
                }`}
              >
                <span className="text-base">{tag.icon}</span>
                <span>{tag.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex gap-3 mt-auto">
        <button
          onClick={onBack}
          className="px-6 py-3.5 rounded-2xl bg-slate-100 text-slate-600 text-sm font-bold active:scale-[0.98]"
        >
          חזרה
        </button>
        <button
          onClick={onNext}
          disabled={!canProceed}
          className={`flex-1 py-3.5 rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-1 ${
            canProceed
              ? 'bg-[#00E5FF] text-slate-900 active:scale-[0.97] shadow-lg shadow-cyan-500/25'
              : 'bg-slate-100 text-slate-300 cursor-not-allowed'
          }`}
        >
          המשך
          <ChevronRight size={16} className="rotate-180" />
        </button>
      </div>
    </div>
  );
}
