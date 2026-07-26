'use client';

/**
 * LocationVariantSwitcher — the SHARED presentational dropdown for choosing an
 * execution-location variant (בית / פארק / רחוב …) with a per-option equipment
 * sub-label. Extracted verbatim from MasterExerciseView's method switcher so both the
 * per-exercise single toggle (MEV) and the workout-level bulk toggle
 * (WorkoutLocationSwitcher) render pixel-identically from ONE source of truth.
 *
 * Purely presentational: the caller builds the option list (single = this exercise's
 * methods; bulk = the 3 locations) and owns the open/select state.
 */

import {
  Home,
  Trees,
  Dumbbell,
  MapPin,
  ChevronDown,
  Check,
  PersonStanding,
  type LucideIcon,
} from 'lucide-react';

// Trivial style primitives (mirrors MasterExerciseView; duplicated by design so this
// component is self-contained — the "source of truth" it owns is the SWITCHER visual
// + LOCATION_META, not these one-line tokens).
const PILL_BORDER = '0.5px solid #E0E9FF';
const SECTION_FONT = { fontFamily: 'var(--font-simpler)' } as const;

// ── Execution-location metadata (label + icon) — the single source of truth ─────
export const LOCATION_META: Record<string, { label: string; Icon: LucideIcon }> = {
  home:    { label: 'בית',          Icon: Home },
  park:    { label: 'פארק',         Icon: Trees },
  gym:     { label: 'חדר כושר',     Icon: Dumbbell },
  street:  { label: 'רחוב',         Icon: MapPin },
  office:  { label: 'משרד',         Icon: MapPin },
  school:  { label: 'בית ספר',      Icon: MapPin },
  airport: { label: 'שדה תעופה',    Icon: MapPin },
  library: { label: 'ספרייה',       Icon: MapPin },
  desk:    { label: 'שולחן',        Icon: MapPin },
};

export function locationMeta(loc: string): { label: string; Icon: LucideIcon } {
  return LOCATION_META[loc] ?? { label: loc, Icon: MapPin };
}

export interface LocationSwitcherGearChip {
  id: string;
  label: string;
  icon: string | null;
}

export interface LocationSwitcherOption {
  /** Unique key (single = method index as string; bulk = location value). */
  key: string;
  /** Location value for label/icon resolution (home/park/street/…). */
  location: string;
  /** Equipment chips shown under the label; empty → "משקל גוף" placeholder. */
  gear: LocationSwitcherGearChip[];
  isActive: boolean;
}

interface LocationVariantSwitcherProps {
  /** Location driving the trigger badge (the active variant/location). */
  activeLocation: string;
  options: LocationSwitcherOption[];
  open: boolean;
  /** false → trigger is a static badge (no dropdown), e.g. a single-option exercise. */
  canSwitch?: boolean;
  onToggleOpen: () => void;
  onClose: () => void;
  onSelect: (opt: LocationSwitcherOption) => void;
}

export default function LocationVariantSwitcher({
  activeLocation,
  options,
  open,
  canSwitch = true,
  onToggleOpen,
  onClose,
  onSelect,
}: LocationVariantSwitcherProps) {
  const activeMeta = locationMeta(activeLocation);
  const ActiveIcon = activeMeta.Icon;

  return (
    <div className="relative flex-shrink-0">
      {/* Active-variant badge / trigger */}
      <button
        type="button"
        onClick={canSwitch ? onToggleOpen : undefined}
        className={`inline-flex items-center gap-1 bg-white rounded-lg px-2.5 shadow-sm ${canSwitch ? 'active:scale-95 transition-transform cursor-pointer' : 'cursor-default'}`}
        style={{ border: PILL_BORDER, height: 30 }}
        aria-haspopup={canSwitch ? 'listbox' : undefined}
        aria-expanded={canSwitch ? open : undefined}
      >
        <ActiveIcon size={14} className="text-slate-500 flex-shrink-0" />
        <span className="text-xs font-semibold text-slate-700 whitespace-nowrap" style={SECTION_FONT}>
          {activeMeta.label}
        </span>
        {canSwitch && (
          <ChevronDown
            size={14}
            className={`text-slate-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        )}
      </button>

      {open && (
        <>
          {/* Click-away catcher (absolute, not fixed — framer-motion transform breaks fixed). */}
          <button
            type="button"
            aria-label="סגור"
            onPointerDown={onClose}
            className="absolute z-40 cursor-default"
            style={{ inset: '-200vh -200vw' }}
          />
          {/* Option list */}
          <div
            role="listbox"
            dir="rtl"
            className="absolute top-full left-0 mt-2 z-50 min-w-[190px] bg-white rounded-2xl shadow-floating border border-slate-100 p-1.5"
          >
            {options.map((opt) => {
              const optMeta = locationMeta(opt.location);
              const OptIcon = optMeta.Icon;
              const isActive = opt.isActive;
              return (
                <button
                  key={opt.key}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  // onPointerDown fires before the browser can decide this is a scroll
                  // gesture — critical for mobile inside an overflow-y-auto sheet.
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onSelect(opt);
                  }}
                  className={`w-full flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                    isActive
                      ? 'bg-cyan-50 text-cyan-700 font-bold'
                      : 'text-slate-700 hover:bg-slate-50 active:bg-slate-100'
                  }`}
                  style={SECTION_FONT}
                >
                  {/* Location icon */}
                  <OptIcon
                    size={16}
                    className={`flex-shrink-0 mt-0.5 ${isActive ? 'text-cyan-600' : 'text-slate-400'}`}
                  />

                  <span className="flex-1 text-start">
                    {/* Location label */}
                    <span className={`block text-xs font-semibold ${isActive ? 'text-cyan-700' : 'text-slate-800'}`}>
                      {optMeta.label}
                    </span>

                    {/* Gear sub-row: per-item icon + label chips */}
                    {opt.gear.length > 0 ? (
                      <span className="flex flex-row flex-wrap gap-x-1.5 gap-y-0.5 mt-0.5">
                        {opt.gear.map((g, gi) => (
                          <span key={g.id} className="inline-flex items-center gap-0.5">
                            {gi > 0 && (
                              <span className="text-slate-300 text-[10px] me-0.5">+</span>
                            )}
                            {g.icon ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={g.icon}
                                alt=""
                                width={12}
                                height={12}
                                className="object-contain flex-shrink-0 opacity-60"
                                onError={(e) => {
                                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <Dumbbell size={12} className="text-slate-400 flex-shrink-0" />
                            )}
                            <span className="text-[11px] font-normal text-slate-500 whitespace-nowrap">
                              {g.label}
                            </span>
                          </span>
                        ))}
                      </span>
                    ) : (
                      /* Bodyweight placeholder */
                      <span className="inline-flex items-center gap-0.5 mt-0.5">
                        <PersonStanding size={12} className="text-slate-400 flex-shrink-0" />
                        <span className="text-[11px] font-normal text-slate-500">משקל גוף</span>
                      </span>
                    )}
                  </span>

                  {isActive && <Check size={14} className="flex-shrink-0 mt-0.5 text-cyan-600" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
