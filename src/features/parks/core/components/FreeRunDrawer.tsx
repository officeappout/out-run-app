'use client';

import React, { useState, useRef, useContext, useEffect } from 'react';

import { motion, Reorder } from 'framer-motion';
import {
  Play, Loader2, Trash2, GripVertical, Bike, Target, MapPin, Route as RouteIcon,
  SlidersHorizontal, Milestone, Plus, Flag, Dumbbell, Check, Scale,
} from 'lucide-react';
import { RunIcon, WalkingIcon } from '@/features/content/programs/core/program-icon.util';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { FreeRunMainFrame, FreeRunSubSheet } from './free-run/FreeRunSheetFrame';
import { ActivityType } from '../types/route.types';
import StrengthStationsToggle from './hybrid/StrengthStationsToggle';
import AerobicStrengthSlider from './hybrid/AerobicStrengthSlider';
import {
  shareToEmphasis,
  RECOMMENDED_AEROBIC_SHARE,
  type HybridStartIntent,
} from '@/features/workout-engine/hybrid/build-hybrid-input';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import { useUserStore } from '@/features/user';
import { db, auth } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import RunShareBar, { shareRunInviteNow } from '@/features/workout-engine/components/RunShareBar';
import { createRunInvite } from '@/lib/workoutInvite';
import type { RunInviteResult } from '@/lib/workoutInvite';
import { buildPlannedRun, plannedRunToDrawerState, type PlannedRunSettings } from '@/lib/planned-run';
import { buildRouteGenRequest } from '../services/route-request.utils';
import type { DrawerGoal, DrawerActivity } from '../services/route-request.utils';
import { useLegPlanStore } from '../store/useLegPlanStore';
import { isWeightMissing } from '@/features/user/core/utils/weight-status';
import { usePendingAddressStore } from '../store/usePendingAddressStore';
import {
  compileLegPlan,
  MAX_LEGS_PER_PLAN,
  type RouteLeg,
  type RouteLegPlan,
  type CompiledLegPlanRoute,
} from '../services/leg-plan.service';

// ── Design tokens ─────────────────────────────────────────────────────────────
const ACCENT = '#00ADEF';

// ── Home v2 (enable_home_v2) ──────────────────────────────────────────────────
// Read once in the main component and provided to every sheet/sub-component in
// this file. While false every branch below renders exactly today's UI.
const FreeRunV2 = React.createContext(false);
const V2_ACCENT = '#00baf7';

const V2_CTA =
  'w-full h-12 flex items-center justify-center gap-2 whitespace-nowrap rounded-full bg-v2-cta text-[16px] font-extrabold text-v2-on-cta shadow-v2-cta active:scale-[0.97] transition-transform duration-150 ease-v2 disabled:opacity-60';
const V2_SECONDARY =
  'flex items-center justify-center gap-2 whitespace-nowrap rounded-full bg-white shadow-v2-ring text-[14px] font-extrabold text-v2-ink active:scale-[0.97] transition-transform duration-150 ease-v2 disabled:opacity-50';
/** Option row inside a sheet (address / stops / route settings). */
const V2_OPTION =
  'w-full flex items-center gap-3 rounded-[20px] bg-white px-4 py-3 shadow-v2-ring text-start active:scale-[0.97] transition-transform duration-150 ease-v2';
const V2_ICON_TILE = 'grid h-9 w-9 shrink-0 place-items-center rounded-[12px] bg-v2-tint text-v2-deep';

/** Extras the route request actually reads (route-request.utils): gymParks →
 *  includeStrength, trail → surface. circular/benches/stairs are documented
 *  dead toggles there, so the v2 sheet doesn't offer them. */
const V2_LIVE_EXTRAS: ReadonlyArray<keyof ExtrasState> = ['gymParks', 'trail'];

// ── Scheduled run helpers ─────────────────────────────────────────────────────

/** Tomorrow's date as 'YYYY-MM-DD' (client-only; used as lazy state initializer). */
function defaultSchedDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

// ── Types ─────────────────────────────────────────────────────────────────────

type GoalType = 'time' | 'distance' | 'calories';
type CarouselActivity = Extract<ActivityType, 'running' | 'walking' | 'cycling'>;

interface ExtrasState {
  circular: boolean;
  gymParks: boolean;
  benches: boolean;
  stairs: boolean;
  trail: boolean;
}

interface FreeRunDrawerProps {
  currentActivity: ActivityType;
  /** Called when the user switches activity via inline chips. */
  onActivityChange?: (activity: CarouselActivity) => void;
  /** Free-mode start (no pre-built route). */
  onStartWorkout: () => void;
  onClose: () => void;
  /**
   * Route-mode start request. Drawer hands off control with a pre-computed
   * `targetKm`; parent shows the floating RouteCarousel. When omitted,
   * "עם מסלול" silently degrades to free mode.
   */
  onRequestRouteGeneration?: (config: {
    targetKm: number;
    includeStrength: boolean;
    surface: 'road' | 'trail';
  }) => void;
  /** Required for route generation; disables "עם מסלול" when absent. */
  userPosition?: { lat: number; lng: number } | null;
  /** Resolved city — surfaced below the route button as confirmation. */
  cityName?: string;
  /**
   * Hybrid (aerobic + strength) start. When the "תחנות כוח" toggle is on, the
   * CTA hands the parent the captured intent to compose + run a sandwich session.
   * When absent, hybrid gracefully degrades to a normal free start.
   */
  onStartHybrid?: (intent: HybridStartIntent) => void;
  /**
   * system_config/feature_flags.enable_hybrid_slots (wave 1, 08.09.2026) — replaces the old
   * HYBRID_SLOTS_ENABLED compile constant. Passed down from DiscoverLayer's useFeatureFlags
   * call rather than read here directly, so this component stays a single Firestore listener
   * per map screen instead of mounting its own. Defaults to false (existing callers that don't
   * pass it keep today's exact "toggle hidden" behavior).
   */
  enableHybridSlots?: boolean;
  /**
   * Address-destination request (08.08 decision) — additive option below the
   * existing time/distance/calories goal tabs, NOT a replacement. Hands off
   * to the parent's existing NavigationHub/commute flow entirely; when
   * omitted, the button is not rendered and default behavior (loop,
   * out-and-back) is completely unchanged.
   */
  onRequestAddressDestination?: () => void;
  /**
   * Fires when the user confirms a picked address destination via the
   * "🏁 התחל לכתובת הזו" button (09.08 — address-destination no longer
   * auto-builds a route on pick; see usePendingAddressStore). The parent
   * owns startCommute, so this is the only thing that actually calls it.
   */
  onConfirmAddressDestination?: (pending: { lat: number; lng: number; label?: string }) => void;
  /**
   * Leg-plan "add stop" request (ג' Phase 1, 08.08) — opens the same
   * NavigationHub search flow as onRequestAddressDestination, but the
   * picked address is routed back into the in-progress leg plan
   * (useLegPlanStore) instead of starting a commute. A separate prop from
   * onRequestAddressDestination on purpose: same drawer-exit mechanics,
   * different post-pick intent, kept distinct so each stays
   * self-documenting and neither breaks if the other's behavior changes
   * later. When omitted, the "הוסף עצירות בדרך" button is not rendered.
   */
  onRequestAddLeg?: () => void;
  /**
   * Leg-plan "start run" request (ג' Phase 2, 08.08) — fires once
   * `compileLegPlan` resolves inside LegPlanSheet, handing the parent the
   * same `Route` shape `onRequestAddressDestination`'s RouteCarousel
   * selection eventually produces. The parent stages `useRunningPlayer`
   * and calls `startActiveWorkout()` directly — this is what skips the
   * "pick 1 of 3" RouteCarousel screen entirely (David's decision #4,
   * 08.08): the user already picked exactly what they want, leg by leg.
   * When omitted, the "🏁 התחל ריצה" button is not rendered.
   */
  onStartLegPlanRun?: (compiled: CompiledLegPlanRoute) => void;
  /**
   * v2 (enable_home_v2): settings saved with a scheduled run (`plannedRun`),
   * handed over when the user starts that run. Seeds the goal, the hybrid
   * split and the route extras once on mount; re-validated here — invalid
   * data is ignored and the drawer opens on its normal defaults.
   */
  initialPlannedRun?: PlannedRunSettings | null;
}

// ── Activity data ──────────────────────────────────────────────────────────────

const ACTIVITY_CHIPS: Array<{ id: CarouselActivity; label: string; emoji: string }> = [
  { id: 'running', label: 'ריצה',   emoji: '🏃' },
  { id: 'walking', label: 'הליכה',  emoji: '🚶' },
  { id: 'cycling', label: 'רכיבה',  emoji: '🚴' },
];

/** Smart defaults per activity — placeholder until personalisation is wired. */
const ACTIVITY_DEFAULTS: Record<CarouselActivity, {
  goalType: GoalType;
  time: number;
  distance: number;
  calories: number;
}> = {
  running: { goalType: 'distance', time: 30,  distance: 5,  calories: 350 },
  walking: { goalType: 'time',     time: 30,  distance: 3,  calories: 200 },
  cycling: { goalType: 'time',     time: 45,  distance: 15, calories: 400 },
};

// ── Pill ── reusable pill button (shared by GoalSheet tabs) ───────────────────

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const v2 = useContext(FreeRunV2);
  if (v2) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={`flex h-10 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[14px] font-extrabold transition-[transform,background-color] duration-150 ease-v2 active:scale-[0.97] ${
          active ? 'bg-v2-tint text-v2-deep ring-1 ring-inset ring-v2-accent/40' : 'bg-white text-v2-ink-2 shadow-v2-ring'
        }`}
      >
        {children}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 rounded-full px-3.5 text-[13px] font-bold transition-colors active:scale-95"
      style={{
        height: 34,
        backgroundColor: active ? ACCENT : '#FFFFFF',
        color: active ? '#FFFFFF' : '#4B5563',
        border: active ? 'none' : '0.5px solid rgba(0,0,0,0.12)',
      }}
    >
      {children}
    </button>
  );
}

// ── GoalSlider ── RTL single-handle slider ─────────────────────────────────────

function GoalSlider({
  min, max, step, value, onChange, formatLabel,
}: {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  formatLabel: (v: number) => string;
}) {
  const v2 = useContext(FreeRunV2);
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  if (v2) {
    // v2: no floating value bubble — the same value is already printed in the
    // row header right above the slider (it was shown twice).
    return (
      <div className="relative w-full" style={{ height: 24 }}>
        <div className="absolute top-1/2 left-0 right-0 h-1.5 -translate-y-1/2 rounded-full bg-v2-hairline" />
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-v2-accent"
          style={{ right: 0, left: `${100 - pct}%` }}
        />
        <input
          type="range"
          min={min} max={max} step={step} value={value} dir="rtl"
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full h-full appearance-none bg-transparent cursor-pointer"
          style={{ accentColor: V2_ACCENT }}
          aria-valuetext={formatLabel(value)}
        />
      </div>
    );
  }
  return (
    <div className="relative w-full" style={{ height: 36 }}>
      <div
        className="absolute text-[11px] font-black pointer-events-none whitespace-nowrap"
        dir="ltr"
        style={{ top: 0, right: `${pct}%`, transform: 'translateX(50%)', color: ACCENT }}
      >
        {formatLabel(value)}
      </div>
      <div className="absolute left-0 right-0" style={{ top: 18, height: 18 }}>
        <div className="absolute top-1/2 left-0 right-0 h-1.5 -translate-y-1/2 bg-gray-200 rounded-full" />
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full"
          style={{ right: 0, left: `${100 - pct}%`, backgroundColor: ACCENT }}
        />
        <input
          type="range"
          min={min} max={max} step={step} value={value} dir="rtl"
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full h-full appearance-none bg-transparent cursor-pointer"
          style={{ accentColor: ACCENT }}
        />
      </div>
    </div>
  );
}

// ── ToggleRow ── emoji + label + animated toggle ───────────────────────────────

function ToggleRow({
  emoji, label, value, onToggle,
}: {
  emoji: string;
  label: string;
  value: boolean;
  onToggle: () => void;
}) {
  const v2 = useContext(FreeRunV2);
  if (v2) {
    return (
      <div className="flex items-center justify-between gap-3 py-3.5 border-b border-v2-hairline last:border-0">
        <span className="truncate whitespace-nowrap text-[15px] font-bold text-v2-ink">{label}</span>
        <button
          type="button"
          onClick={onToggle}
          className={`relative w-12 h-7 rounded-full transition-colors duration-150 ease-v2 flex-shrink-0 ${value ? 'bg-v2-accent' : 'bg-v2-pill-border'}`}
          aria-pressed={value}
          aria-label={label}
        >
          <motion.div
            animate={{ x: value ? 20 : 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className="absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow-sm"
          />
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between py-3.5 border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-2.5">
        <span className="text-xl leading-none">{emoji}</span>
        <span className="text-[14px] font-bold text-gray-800">{label}</span>
      </div>
      <button
        type="button"
        onClick={onToggle}
        className="relative w-12 h-7 rounded-full transition-colors flex-shrink-0"
        style={{ backgroundColor: value ? ACCENT : '#D1D5DB' }}
        aria-pressed={value}
      >
        <motion.div
          animate={{ x: value ? 20 : 0 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          className="absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow-sm"
        />
      </button>
    </div>
  );
}

// ── Block 1: ActivityChips ─────────────────────────────────────────────────────
// Inline chip row replacing the full ActivityCarousel.

function ActivityChips({
  selected,
  onSelect,
}: {
  selected: CarouselActivity;
  onSelect: (a: CarouselActivity) => void;
}) {
  const v2 = useContext(FreeRunV2);
  if (v2) {
    const icon = (id: CarouselActivity) =>
      id === 'running' ? <RunIcon className="h-6 w-6" /> :
      id === 'walking' ? <WalkingIcon className="h-6 w-6" /> :
      <Bike size={24} strokeWidth={2.2} />;
    return (
      <div className="px-5 mb-4">
        <div className="flex gap-2.5">
          {ACTIVITY_CHIPS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              aria-pressed={selected === id}
              className={`flex h-[72px] flex-1 flex-col items-center justify-center gap-1 rounded-[18px] transition-[transform,box-shadow] duration-150 ease-v2 active:scale-[0.97] ${
                selected === id ? 'bg-white text-v2-deep shadow-v2-card ring-2 ring-v2-accent' : 'bg-white text-v2-ink-2 shadow-v2-ring'
              }`}
            >
              {icon(id)}
              <span className="whitespace-nowrap text-[14px] font-extrabold">{label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="px-5 mb-5">
      <div className="flex gap-2">
        {ACTIVITY_CHIPS.map(({ id, label, emoji }) => (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-full text-[13px] font-bold transition-colors active:scale-95"
            style={{
              height: 44,
              backgroundColor: selected === id ? ACCENT : '#F3F4F6',
              color: selected === id ? '#FFFFFF' : '#4B5563',
            }}
            aria-pressed={selected === id}
          >
            <span aria-hidden="true">{emoji}</span>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Block 2: GoalSummaryRow ────────────────────────────────────────────────────
// Collapsed "מותאם עבורך" display; tapping "ערוך" opens GoalSheet.

function GoalSummaryRow({
  goalType, timeValue, distanceValue, caloriesValue, onEdit,
}: {
  goalType: GoalType;
  timeValue: number;
  distanceValue: number;
  caloriesValue: number;
  onEdit: () => void;
}) {
  const summary =
    goalType === 'time'     ? `${timeValue} דק׳` :
    goalType === 'distance' ? `${distanceValue.toFixed(1)} ק״מ` :
                              `${caloriesValue} קק״ל`;
  const v2 = useContext(FreeRunV2);

  if (v2) {
    // v2 copy: "מטרת האימון" instead of "מותאם עבורך" — the values come from
    // the static ACTIVITY_DEFAULTS table (or the user's own edit), nothing is
    // personalised yet, so the old label claimed something untrue.
    return (
      <button
        type="button"
        onClick={onEdit}
        className="mx-5 mb-4 flex w-[calc(100%-2.5rem)] items-center gap-3 rounded-[20px] bg-white px-4 py-3 text-start shadow-v2-ring active:scale-[0.97] transition-transform duration-150 ease-v2"
        aria-label="ערוך מטרת אימון"
      >
        <span className={V2_ICON_TILE}><Target size={18} strokeWidth={2.4} /></span>
        <span className="min-w-0 flex-1">
          <span className="block whitespace-nowrap text-[13px] font-extrabold text-v2-deep">מטרת האימון</span>
          <span className="block truncate whitespace-nowrap text-[17px] font-black text-v2-ink">{summary}</span>
        </span>
        <span className="h-8 shrink-0 whitespace-nowrap rounded-full bg-v2-surface px-3.5 text-[13px] font-extrabold leading-8 text-v2-deep ring-1 ring-inset ring-v2-hairline">
          ערוך
        </span>
      </button>
    );
  }

  return (
    <div
      className="mx-5 mb-5 rounded-2xl px-4 py-3.5 flex items-center justify-between"
      style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl" aria-hidden="true">🎯</span>
        <div>
          <p className="text-[11px] text-gray-400 font-semibold leading-tight">מותאם עבורך</p>
          <p className="text-[15px] font-black text-gray-900 leading-tight">{summary}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="text-[13px] font-black active:scale-95 transition-transform px-3 py-1.5 rounded-full"
        style={{ color: ACCENT, backgroundColor: `${ACCENT}18` }}
        aria-label="ערוך מטרת אימון"
      >
        ערוך
      </button>
    </div>
  );
}


// ── Block 3: EntryButtons ─────────────────────────────────────────────────────
// Two clear entry points: "התחל חופשי" (primary) + "עם מסלול" (secondary).

function EntryButtons({
  onStartFree, onStartWithRoute, canStartWithRoute, cityName,
}: {
  onStartFree: () => void;
  onStartWithRoute: () => void;
  canStartWithRoute: boolean;
  cityName?: string;
}) {
  const v2 = useContext(FreeRunV2);
  if (v2) {
    return (
      <div className="px-5">
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onStartFree}
            className={`${V2_CTA} flex-1`}
            aria-label="התחל אימון חופשי"
          >
            <Play size={16} fill="currentColor" />
            התחל חופשי
          </button>
          <button
            type="button"
            onClick={onStartWithRoute}
            disabled={!canStartWithRoute}
            className={`${V2_SECONDARY} h-12 flex-1 text-v2-deep`}
            aria-label="התחל אימון עם מסלול מותאם"
          >
            <RouteIcon size={17} strokeWidth={2.4} />
            עם מסלול
          </button>
        </div>
        {canStartWithRoute && cityName && (
          <p className="mt-2 truncate whitespace-nowrap text-center text-[12px] font-bold text-v2-muted">
            מסלולים יוצרו ב{cityName}
          </p>
        )}
      </div>
    );
  }
  return (
    <div className="px-5">
      <div className="flex gap-2.5">
        {/* Primary CTA */}
        <button
          type="button"
          onClick={onStartFree}
          className="flex-1 flex items-center justify-center gap-2 text-white text-[14px] font-black active:scale-[0.98] transition-transform rounded-2xl"
          style={{ height: 52, backgroundColor: ACCENT }}
          aria-label="התחל אימון חופשי"
        >
          <Play size={16} fill="currentColor" />
          התחל חופשי
        </button>

        {/* Secondary CTA */}
        <button
          type="button"
          onClick={onStartWithRoute}
          disabled={!canStartWithRoute}
          className="flex-1 flex items-center justify-center gap-2 text-[14px] font-black active:scale-[0.98] transition-transform rounded-2xl disabled:opacity-40"
          style={{
            height: 52,
            border: `2px solid ${ACCENT}`,
            color: ACCENT,
            backgroundColor: '#FFFFFF',
          }}
          aria-label="התחל אימון עם מסלול מותאם"
        >
          🗺️ עם מסלול
        </button>
      </div>

      {/* City confirmation — shown only for route flow */}
      {canStartWithRoute && cityName && (
        <p className="text-center text-[11px] text-gray-400 mt-2 leading-tight">
          מסלולים יוצרו ב{cityName}
        </p>
      )}
    </div>
  );
}

// ── WeightInlineRow ───────────────────────────────────────────────────────────
// Shown inside GoalSheet (calories tab) when weight is not explicitly set.
// Saves locally to Zustand + fire-and-forget Firestore write.

function WeightInlineRow({
  genderDefault,
  onSave,
}: {
  genderDefault: number;
  onSave: (w: number) => Promise<void>;
}) {
  const v2 = useContext(FreeRunV2);
  const [value, setValue] = useState(genderDefault);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);

  const adjust = (delta: number) =>
    setValue((v) => Math.min(200, Math.max(30, v + delta)));

  const handleSave = async () => {
    if (saving || value < 30 || value > 200) return;
    setSaving(true);
    try {
      await onSave(value);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  if (saved) return null;

  if (v2) {
    const stepBtn =
      'grid h-9 w-9 place-items-center rounded-full bg-white shadow-v2-ring text-[18px] font-bold text-v2-ink active:scale-[0.97] transition-transform duration-150 ease-v2';
    return (
      <div className="mt-3 rounded-[20px] bg-v2-tint px-4 py-3.5">
        <p className="mb-0.5 flex items-center gap-1.5 whitespace-nowrap text-[13px] font-extrabold text-v2-deep">
          <Scale size={14} strokeWidth={2.4} /> משקלך לחישוב מדויק
        </p>
        <p className="mb-2.5 text-[12.5px] font-bold leading-snug text-v2-muted">
          עדיין לא הזנת משקל — הערך הנוכחי הוא ברירת מחדל. כדי שחישוב הקלוריות יהיה מדויק, שווה לעדכן.
        </p>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => adjust(-1)} className={stepBtn} aria-label="הפחת ק״ג">−</button>
          <div className="flex-1 text-center">
            <input
              type="number"
              inputMode="numeric"
              value={value}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v) && v >= 30 && v <= 200) setValue(v);
              }}
              className="w-full border-none bg-transparent text-center text-[18px] font-black text-v2-ink outline-none"
              aria-label="משקל בקילוגרם"
            />
            <span className="text-[12px] font-bold leading-none text-v2-muted">ק״ג</span>
          </div>
          <button type="button" onClick={() => adjust(1)} className={stepBtn} aria-label="הוסף ק״ג">+</button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className={`${V2_SECONDARY} h-9 min-w-[56px] px-3.5 text-[13px] text-v2-deep`}
          >
            {saving ? '...' : 'שמור'}
          </button>
        </div>
        <p className="mt-1.5 text-[12px] font-bold text-v2-muted">אפשר לדלג — יישמר לפרופיל אם תבחר</p>
      </div>
    );
  }

  return (
    <div
      className="mt-3 rounded-2xl px-4 py-3.5"
      style={{ backgroundColor: '#F0F9FF', border: '1px solid #BAE6FD' }}
    >
      <p className="text-[12px] font-black text-gray-700 mb-0.5">⚖️ משקלך לחישוב מדויק</p>
      <p className="text-[11px] text-gray-400 leading-tight mb-2.5">
        עדיין לא הזנת משקל — הערך הנוכחי הוא ברירת מחדל. כדי שחישוב הקלוריות יהיה מדויק, שווה לעדכן.
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => adjust(-1)}
          className="w-9 h-9 rounded-full bg-white flex items-center justify-center text-gray-700 text-lg font-bold active:scale-90 transition-transform"
          style={{ border: '1px solid #E2E8F0' }}
          aria-label="הפחת ק״ג"
        >
          −
        </button>

        <div className="flex-1 text-center">
          <input
            type="number"
            inputMode="numeric"
            value={value}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v) && v >= 30 && v <= 200) setValue(v);
            }}
            className="text-[18px] font-black text-gray-900 text-center bg-transparent border-none outline-none w-full"
            aria-label="משקל בקילוגרם"
          />
          <span className="text-[11px] text-gray-400 leading-none">ק״ג</span>
        </div>

        <button
          type="button"
          onClick={() => adjust(1)}
          className="w-9 h-9 rounded-full bg-white flex items-center justify-center text-gray-700 text-lg font-bold active:scale-90 transition-transform"
          style={{ border: '1px solid #E2E8F0' }}
          aria-label="הוסף ק״ג"
        >
          +
        </button>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-3.5 h-9 rounded-xl text-[13px] font-black text-white active:scale-95 transition-transform disabled:opacity-50"
          style={{ backgroundColor: ACCENT, minWidth: 52 }}
        >
          {saving ? '...' : 'שמור'}
        </button>
      </div>
      <p className="text-[10px] text-gray-400 mt-1.5">אפשר לדלג — יישמר לפרופיל אם תבחר</p>
    </div>
  );
}

// ── GoalSheet ─────────────────────────────────────────────────────────────────
// Bottom sheet for selecting goal type + adjusting the slider.
// z-[102/103] — above the main drawer (z-[100]).

function GoalSheet({
  isOpen, onClose,
  goalType, setGoalType,
  timeValue, setTimeValue,
  distanceValue, setDistanceValue,
  caloriesValue, setCaloriesValue,
  onOpenExtras,
  weightMissing,
  genderDefault,
  onSaveWeight,
  onRequestAddressDestination,
  pendingAddress,
  onConfirmAddressDestination,
  onOpenLegPlan,
  legPlanCount,
}: {
  isOpen: boolean;
  onClose: () => void;
  goalType: GoalType;
  setGoalType: (t: GoalType) => void;
  timeValue: number;
  setTimeValue: (v: number) => void;
  distanceValue: number;
  setDistanceValue: (v: number) => void;
  caloriesValue: number;
  setCaloriesValue: (v: number) => void;
  onOpenExtras: () => void;
  weightMissing: boolean;
  genderDefault: number;
  onSaveWeight: (w: number) => Promise<void>;
  onRequestAddressDestination?: () => void;
  /**
   * A picked-but-not-yet-started address destination (09.08, David's 2nd
   * round of UX feedback). Address-destination used to build a route the
   * instant an address was picked; now it returns here first — editable,
   * not committed — matching the "picks land in the drawer for review"
   * shape the leg-plan flow already has, WITHOUT reusing useLegPlanStore
   * itself (David explicitly deferred that merge as its own future round).
   */
  pendingAddress?: { lat: number; lng: number; label?: string } | null;
  /** Explicit "start to this address" confirm — the only thing that actually calls startCommute now. */
  onConfirmAddressDestination?: (pending: { lat: number; lng: number; label?: string }) => void;
  /** Opens LegPlanSheet (ג' Phase 1) — same GoalSheet-hand-off pattern as onOpenExtras, not onRequestAddressDestination (leg-plan composition needs to stay resident in FreeRunDrawer's own sheet stack). */
  onOpenLegPlan?: () => void;
  /** Current in-progress leg count — shown on the button so the user sees plan state without opening the sheet. 0 when nothing composed yet. */
  legPlanCount?: number;
}) {
  const v2 = useContext(FreeRunV2);

  return (
    <FreeRunSubSheet
      isOpen={isOpen}
      onClose={onClose}
      v2={v2}
      title="מטרת אימון"
      tier="goal"
      v2Layout="scroll"
      keyboardAware
      legacy={{
        backdropClassName: 'fixed inset-0 bg-black/30 z-[102] pointer-events-auto',
        panelClassName: 'kb-sheet fixed bottom-0 left-0 right-0 z-[103] pointer-events-auto bg-white rounded-t-3xl shadow-2xl',
        panelStyle: { paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' },
        handleClassName: 'flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing',
        headerClassName: 'flex items-center justify-between px-5 pb-4',
        headerClose: true,
      }}
    >
      {/* Goal type pills */}
      <div className="px-5 mb-5">
        <div className="flex gap-2">
          <Pill active={goalType === 'time'}     onClick={() => setGoalType('time')}>{v2 ? 'זמן' : '⏱ זמן'}</Pill>
          <Pill active={goalType === 'distance'} onClick={() => setGoalType('distance')}>{v2 ? 'מרחק' : '📏 מרחק'}</Pill>
          <Pill active={goalType === 'calories'} onClick={() => setGoalType('calories')}>{v2 ? 'קלוריות' : '🔥 קלוריות'}</Pill>
        </div>
      </div>

      {/* Slider */}
      <div className="px-5 mb-5">
        {goalType === 'time' && (
          <>
            <div className="flex items-center justify-between mb-2">
              <span className={v2 ? 'whitespace-nowrap text-[15px] font-black text-v2-ink' : 'text-[13px] font-black text-gray-800'}>משך האימון</span>
              <span className={v2 ? 'whitespace-nowrap text-[17px] font-black tabular-nums text-v2-deep' : 'text-[13px] font-black'} style={v2 ? undefined : { color: ACCENT }}>{timeValue} דק׳</span>
            </div>
            <GoalSlider min={5} max={120} step={5} value={timeValue} onChange={setTimeValue} formatLabel={(v) => `${v} דק׳`} />
          </>
        )}

        {goalType === 'distance' && (
          <>
            <div className="flex items-center justify-between mb-2">
              <span className={v2 ? 'whitespace-nowrap text-[15px] font-black text-v2-ink' : 'text-[13px] font-black text-gray-800'}>מרחק</span>
              <span className={v2 ? 'whitespace-nowrap text-[17px] font-black tabular-nums text-v2-deep' : 'text-[13px] font-black'} style={v2 ? undefined : { color: ACCENT }}>{distanceValue.toFixed(1)} ק״מ</span>
            </div>
            {/* No product-chosen distance ceiling (David, 08.08) — Mapbox Directions
                itself imposes no max route distance for walking/cycling (verified,
                only a 25-waypoint-per-request limit exists and loop mode never
                approaches it). 100 is a generous usability bound for the slider
                widget only, not a claimed technical limit — trivially raisable. */}
            <GoalSlider min={0.5} max={100} step={0.5} value={distanceValue} onChange={setDistanceValue} formatLabel={(v) => `${v.toFixed(1)} ק״מ`} />
          </>
        )}

        {goalType === 'calories' && (
          <>
            <div className="flex items-center justify-between mb-2">
              <span className={v2 ? 'whitespace-nowrap text-[15px] font-black text-v2-ink' : 'text-[13px] font-black text-gray-800'}>קלוריות</span>
              <span className={v2 ? 'whitespace-nowrap text-[17px] font-black tabular-nums text-v2-deep' : 'text-[13px] font-black'} style={v2 ? undefined : { color: ACCENT }}>{caloriesValue} קק״ל</span>
            </div>
            <GoalSlider min={50} max={800} step={50} value={caloriesValue} onChange={setCaloriesValue} formatLabel={(v) => `${v} קק״ל`} />
            {weightMissing && (
              <WeightInlineRow
                genderDefault={genderDefault}
                onSave={onSaveWeight}
              />
            )}
          </>
        )}
      </div>

      {/* Address destination (08.08 decision, revised 09.08) — additive
          option below the goal tabs, not a replacement. Default (loop)
          is unaffected unless explicitly tapped. Picking an address no
          longer builds a route immediately (David, 09.08 — it used to
          jump straight into RouteCarousel) — it returns here as an
          editable, unconfirmed pick; only the explicit "🏁 התחל לכתובת
          הזו" button below actually calls startCommute. */}
      {v2 && (onRequestAddressDestination || onOpenLegPlan) && (
        <p className="px-5 mb-2 whitespace-nowrap text-[13px] font-extrabold text-v2-deep">אפשרויות מסלול</p>
      )}
      {onRequestAddressDestination && v2 && (
        <div className="px-5 mb-2.5">
          <button type="button" onClick={onRequestAddressDestination} className={V2_OPTION}>
            <span className={V2_ICON_TILE}><MapPin size={18} strokeWidth={2.4} /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate whitespace-nowrap text-[15px] font-extrabold text-v2-ink">
                {pendingAddress ? (pendingAddress.label || 'היעד שנבחר') : 'יעד: כתובת'}
              </span>
              <span className="block whitespace-nowrap text-[12.5px] font-bold text-v2-muted">
                {pendingAddress ? 'הקש לשינוי היעד' : 'מסלול מכאן לכתובת שתבחר'}
              </span>
            </span>
          </button>
          {pendingAddress && (
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => onConfirmAddressDestination?.(pendingAddress)}
                className={`${V2_CTA} flex-1`}
              >
                <Flag size={16} strokeWidth={2.4} /> התחל לכתובת הזו
              </button>
              <button
                type="button"
                onClick={() => usePendingAddressStore.getState().clear()}
                className={`${V2_SECONDARY} h-12 px-5 text-v2-ink-2`}
              >
                ביטול
              </button>
            </div>
          )}
        </div>
      )}
      {onRequestAddressDestination && !v2 && (
        <div className="px-5 mb-4">
          <button
            type="button"
            onClick={onRequestAddressDestination}
            className="w-full py-3 text-[13px] font-black text-gray-700 flex items-center justify-center gap-2 rounded-2xl active:scale-[0.98] transition-transform truncate"
            style={{ backgroundColor: '#F3F4F6' }}
          >
            {pendingAddress
              ? `📍 ${pendingAddress.label || 'היעד שנבחר'} · שנה`
              : '📍 יעד: כתובת'}
          </button>

          {pendingAddress && (
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={() => onConfirmAddressDestination?.(pendingAddress)}
                className="flex-1 py-3 text-[13px] font-black text-white rounded-2xl active:scale-[0.98] transition-transform"
                style={{ backgroundColor: ACCENT }}
              >
                🏁 התחל לכתובת הזו
              </button>
              <button
                type="button"
                onClick={() => usePendingAddressStore.getState().clear()}
                className="px-4 py-3 text-[13px] font-black text-gray-400 rounded-2xl active:scale-[0.98] transition-transform"
                style={{ backgroundColor: '#F3F4F6' }}
              >
                ביטול
              </button>
            </div>
          )}
        </div>
      )}

      {/* Leg-plan composer (ג' Phase 1, 08.08 decision) — additive option
          below the address-destination button, stays inside GoalSheet
          (not a separate top-level drawer button — David's call).
          Default (loop) is unaffected unless explicitly opened.
          Brand-blue fill (08.08, David's 2nd button-confusion report):
          the two buttons above/below each other in identical gray
          pills were too easy to mis-tap without reading the text.
          Minimal differentiation, not a redesign — old button stays
          gray, this one gets the accent so the eye catches the
          difference before the text does. */}
      {onOpenLegPlan && v2 && (
        <div className="px-5 mb-2.5">
          <button type="button" onClick={onOpenLegPlan} className={V2_OPTION}>
            <span className={V2_ICON_TILE}><Milestone size={18} strokeWidth={2.4} /></span>
            <span className="min-w-0 flex-1 truncate whitespace-nowrap text-[15px] font-extrabold text-v2-ink">
              הוסף עצירות בדרך
            </span>
            {legPlanCount ? (
              <span className="shrink-0 rounded-full bg-v2-tint px-2.5 py-0.5 text-[13px] font-extrabold tabular-nums text-v2-deep">
                {legPlanCount}
              </span>
            ) : null}
          </button>
        </div>
      )}
      {onOpenLegPlan && !v2 && (
        <div className="px-5 mb-4">
          <button
            type="button"
            onClick={onOpenLegPlan}
            className="w-full py-3 text-[13px] font-black text-white flex items-center justify-center gap-2 rounded-2xl active:scale-[0.98] transition-transform"
            style={{ backgroundColor: ACCENT }}
          >
            🧭 הוסף עצירות בדרך{legPlanCount ? ` (${legPlanCount})` : ''}
          </button>
        </div>
      )}

      {/* Route extras shortcut */}
      {v2 ? (
        <div className="px-5 mb-4">
          <button type="button" onClick={onOpenExtras} className={V2_OPTION}>
            <span className={V2_ICON_TILE}><SlidersHorizontal size={18} strokeWidth={2.4} /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate whitespace-nowrap text-[15px] font-extrabold text-v2-ink">הגדרות מסלול נוספות</span>
              <span className="block truncate whitespace-nowrap text-[12.5px] font-bold text-v2-muted">חלות על &quot;עם מסלול&quot;</span>
            </span>
          </button>
        </div>
      ) : (
      <div className="px-5 mb-4">
        <button
          type="button"
          onClick={onOpenExtras}
          className="w-full py-3 text-[13px] font-black text-gray-700 flex items-center justify-center gap-2 rounded-2xl active:scale-[0.98] transition-transform"
          style={{ backgroundColor: '#F3F4F6' }}
        >
          ⚙️ הגדרות מסלול נוספות
        </button>
      </div>
      )}

      {/* Confirm — v2: the gradient moves to "התחל לכתובת הזו" while a
          picked address is pending, so the sheet keeps exactly one. */}
      <div className="px-5">
        {v2 ? (
          <button
            type="button"
            onClick={onClose}
            className={pendingAddress && onRequestAddressDestination ? `${V2_SECONDARY} h-12 w-full` : V2_CTA}
          >
            אישור
          </button>
        ) : (
        <button
          type="button"
          onClick={onClose}
          className="w-full py-3 text-white text-sm font-black active:scale-[0.98] transition-transform rounded-xl"
          style={{ backgroundColor: ACCENT }}
        >
          אישור
        </button>
        )}
      </div>
    </FreeRunSubSheet>
  );
}

// ── LegPlanSheet ── ordered multi-stop composer (ג' Phase 1, 08.08) ───────────
// Shares ExtrasSheet's z-[104/105] tier — mutually exclusive with it (both
// open only from GoalSheet, which closes first either way), so no new
// z-index budget entry is needed (.cursorrules §8: only genuinely NEW
// values require a table update).
//
// The leg list itself is a live useLegPlanStore subscription, NOT local
// state — composing a plan requires repeated round-trips through
// NavigationHub, and FreeRunDrawer fully unmounts on every "add stop" pick
// (mapMode leaves 'freeRun'), so local React state would be lost between
// picks. Only `isOpen` (this sheet's own visibility) is local — its INITIAL
// value is seeded from the store in the parent so the sheet auto-reopens
// showing the updated list right after an add-stop round-trip.
function LegPlanSheet({
  isOpen, onClose,
  userPosition,
  activity,
  onRequestAddLeg,
  onStartLegPlanRun,
}: {
  isOpen: boolean;
  onClose: () => void;
  userPosition?: { lat: number; lng: number } | null;
  activity: DrawerActivity;
  onRequestAddLeg?: () => void;
  onStartLegPlanRun?: (compiled: CompiledLegPlanRoute) => void;
}) {
  const v2 = useContext(FreeRunV2);
  const legs = useLegPlanStore((s) => s.legs);
  const atMaxLegs = legs.length >= MAX_LEGS_PER_PLAN;
  const [isCompiling, setIsCompiling] = useState(false);
  const [compileError, setCompileError] = useState<string | null>(null);

  const handleAddStop = () => {
    if (atMaxLegs || !userPosition || !onRequestAddLeg) return;
    useLegPlanStore.getState().startComposing(userPosition, activity);
    onRequestAddLeg();
  };

  const handleReorder = (newOrder: RouteLeg[]) => {
    useLegPlanStore.getState().reorderLegs(newOrder.map((l) => l.id));
  };

  const handleClearAll = () => {
    useLegPlanStore.getState().reset();
    setCompileError(null);
  };

  /** Compiles the composed plan via a single Mapbox call, then hands the
      resulting Route straight to the parent — no "pick 1 of 3" screen
      (David's decision #4). Errors (LegPlanNoRouteError etc.) are already
      Hebrew/user-facing — surfaced inline, plan stays intact so the user
      can reorder/remove and retry instead of losing their work. */
  const handleStartRun = async () => {
    if (legs.length === 0 || isCompiling || !userPosition || !onStartLegPlanRun) return;
    setIsCompiling(true);
    setCompileError(null);
    try {
      const plan: RouteLegPlan = { activity, legs, origin: userPosition };
      const compiled = await compileLegPlan(plan);
      onStartLegPlanRun(compiled);
    } catch (err) {
      setCompileError(err instanceof Error ? err.message : 'משהו השתבש בהרכבת המסלול. נסה שוב.');
    } finally {
      setIsCompiling(false);
    }
  };

  return (
    <FreeRunSubSheet
      isOpen={isOpen}
      onClose={onClose}
      v2={v2}
      title="עצירות בדרך"
      tier="extras"
      v2Layout="column"
      legacy={{
        backdropClassName: 'fixed inset-0 bg-black/30 z-[104] pointer-events-auto',
        panelClassName: 'fixed bottom-0 left-0 right-0 z-[105] pointer-events-auto bg-white rounded-t-3xl shadow-2xl',
        panelStyle: { paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)', maxHeight: '80vh', display: 'flex', flexDirection: 'column' },
        handleClassName: 'flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing shrink-0',
        headerClassName: 'flex items-center justify-between px-5 pb-4 shrink-0',
        headerClose: true,
      }}
    >
      {/* Ordered leg list — drag to reorder */}
      <div className="px-5 overflow-y-auto flex-1">
        {legs.length === 0 ? (
          <p className={v2 ? 'py-6 text-center text-[14px] font-bold text-v2-muted' : 'text-[13px] text-gray-500 text-center py-6'}>
            עדיין לא הוספת עצירות. הוסף עצירה כדי להתחיל להרכיב את המסלול.
          </p>
        ) : (
          <Reorder.Group axis="y" values={legs} onReorder={handleReorder} as="div" className="space-y-2">
            {legs.map((leg, idx) => (
              <Reorder.Item
                key={leg.id}
                value={leg}
                as="div"
                className={v2 ? 'flex items-center gap-2 rounded-[18px] bg-white px-3 py-3 shadow-v2-ring' : 'flex items-center gap-2 rounded-2xl px-3 py-3'}
                style={v2 ? undefined : { backgroundColor: '#F3F4F6' }}
                whileDrag={{ scale: 1.02, boxShadow: '0 8px 30px rgba(0,0,0,0.12)', zIndex: 50, backgroundColor: '#FFFFFF' }}
              >
                <GripVertical size={16} className={v2 ? 'shrink-0 text-v2-muted' : 'text-gray-400 shrink-0'} />
                {v2 && (
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-v2-tint text-[12px] font-extrabold tabular-nums text-v2-deep">
                    {idx + 1}
                  </span>
                )}
                <span className={v2 ? 'flex-1 truncate whitespace-nowrap text-[14.5px] font-extrabold text-v2-ink' : 'flex-1 text-[13px] font-bold text-gray-800 truncate'}>
                  {leg.label || `עצירה ${idx + 1}`}
                </span>
                <button
                  type="button"
                  onClick={() => useLegPlanStore.getState().removeLeg(leg.id)}
                  className="w-7 h-7 rounded-full flex items-center justify-center active:scale-90 transition-transform shrink-0"
                  aria-label="הסר עצירה"
                >
                  <Trash2 size={14} className={v2 ? 'text-v2-muted' : 'text-gray-400'} />
                </button>
              </Reorder.Item>
            ))}
          </Reorder.Group>
        )}
      </div>

      {v2 ? (
        <div className="px-5 pt-4 shrink-0">
          <button
            type="button"
            onClick={handleAddStop}
            disabled={atMaxLegs || !userPosition}
            className={`${V2_SECONDARY} h-12 w-full text-v2-deep`}
          >
            {atMaxLegs ? (
              <span className="truncate text-v2-muted">מקסימום {MAX_LEGS_PER_PLAN} עצירות</span>
            ) : (
              <><Plus size={17} strokeWidth={2.6} /> הוסף עצירה</>
            )}
          </button>
          {legs.length > 0 && onStartLegPlanRun && (
            <button
              type="button"
              onClick={handleStartRun}
              disabled={isCompiling || !userPosition}
              className={`${V2_CTA} mt-2.5`}
            >
              {isCompiling
                ? <><Loader2 size={16} className="animate-spin" /> מרכיב מסלול...</>
                : <><Flag size={16} strokeWidth={2.4} /> {activity === 'walking' ? 'התחל הליכה' : activity === 'cycling' ? 'התחל רכיבה' : 'התחל ריצה'}</>}
            </button>
          )}
          {compileError && (
            <p className="mt-2 text-center text-[12.5px] font-bold leading-tight text-v2-down">{compileError}</p>
          )}
          {legs.length > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              className="mt-1.5 w-full py-2 text-[13px] font-extrabold text-v2-muted active:scale-[0.97] transition-transform duration-150 ease-v2"
            >
              נקה הכל
            </button>
          )}
        </div>
      ) : (
      <div className="px-5 pt-4 shrink-0">
        {/* Add stop */}
        <button
          type="button"
          onClick={handleAddStop}
          disabled={atMaxLegs || !userPosition}
          className="w-full py-3 text-[13px] font-black flex items-center justify-center gap-2 rounded-2xl active:scale-[0.98] transition-transform disabled:opacity-50"
          style={{ backgroundColor: atMaxLegs ? '#F3F4F6' : ACCENT, color: atMaxLegs ? '#6B7280' : '#FFFFFF' }}
        >
          {atMaxLegs
            ? `הגעת למספר המרבי של עצירות (${MAX_LEGS_PER_PLAN})`
            : '➕ הוסף עצירה'}
        </button>

        {/* Start run — compiles the plan into one route via a single
            Mapbox call and hands off straight to the active workout,
            no route-carousel picker (David's decision #4). */}
        {legs.length > 0 && onStartLegPlanRun && (
          <button
            type="button"
            onClick={handleStartRun}
            disabled={isCompiling || !userPosition}
            className="w-full py-3 mt-2 text-white text-[13px] font-black flex items-center justify-center gap-2 rounded-2xl active:scale-[0.98] transition-transform disabled:opacity-60"
            style={{ backgroundColor: ACCENT }}
          >
            {isCompiling
              ? <><Loader2 size={16} className="animate-spin" /> מרכיב מסלול...</>
              : '🏁 התחל ריצה'}
          </button>
        )}

        {compileError && (
          <p className="text-[12px] text-red-500 text-center mt-2 leading-tight">{compileError}</p>
        )}

        {legs.length > 0 && (
          <button
            type="button"
            onClick={handleClearAll}
            className="w-full py-2 mt-2 text-[12px] font-bold text-gray-400 active:scale-[0.98] transition-transform"
          >
            נקה הכל
          </button>
        )}
      </div>
      )}
    </FreeRunSubSheet>
  );
}

// ── ExtrasSheet ── route preferences (z-[104/105], above GoalSheet) ───────────

function ExtrasSheet({
  isOpen, onClose, extras, onToggle,
}: {
  isOpen: boolean;
  onClose: () => void;
  extras: ExtrasState;
  onToggle: (key: keyof ExtrasState) => void;
}) {
  const v2 = useContext(FreeRunV2);

  return (
    <FreeRunSubSheet
      isOpen={isOpen}
      onClose={onClose}
      v2={v2}
      title="הגדרות נוספות"
      tier="extras"
      v2Layout="plain"
      legacy={{
        backdropClassName: 'fixed inset-0 bg-black/30 z-[104] pointer-events-auto',
        panelClassName: 'fixed bottom-0 left-0 right-0 z-[105] pointer-events-auto bg-white rounded-t-3xl shadow-2xl',
        panelStyle: { paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' },
        handleClassName: 'flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing',
        headerClassName: 'px-5 pb-4',
        headerClose: false,
      }}
    >
      {v2 ? (
        <div className="mx-5 rounded-[20px] bg-white px-4 shadow-v2-ring">
          {V2_LIVE_EXTRAS.includes('gymParks') && (
            <ToggleRow emoji="" label="עבור דרך גינות כושר" value={extras.gymParks} onToggle={() => onToggle('gymParks')} />
          )}
          {V2_LIVE_EXTRAS.includes('trail') && (
            <ToggleRow emoji="" label="שבילי עפר" value={extras.trail} onToggle={() => onToggle('trail')} />
          )}
        </div>
      ) : (
      <div className="px-5">
        <ToggleRow emoji="🔄" label="מעגלי"              value={extras.circular} onToggle={() => onToggle('circular')} />
        <ToggleRow emoji="🏋️" label="עבור דרך גינות כושר" value={extras.gymParks} onToggle={() => onToggle('gymParks')} />
        <ToggleRow emoji="🪑" label="עבור דרך ספסלים"      value={extras.benches}  onToggle={() => onToggle('benches')}  />
        <ToggleRow emoji="📍" label="עבור דרך מדרגות"      value={extras.stairs}   onToggle={() => onToggle('stairs')}   />
        <ToggleRow emoji="🌿" label="שבילי עפר (Trail)"    value={extras.trail}    onToggle={() => onToggle('trail')}    />
      </div>
      )}

      <div className="px-5 pt-5">
        {v2 ? (
          <button type="button" onClick={onClose} className={V2_CTA}>סיום</button>
        ) : (
        <button
          type="button"
          onClick={onClose}
          className="w-full py-3 text-white text-sm font-black active:scale-[0.98] transition-transform rounded-xl"
          style={{ backgroundColor: ACCENT }}
        >
          סגור
        </button>
        )}
      </div>
    </FreeRunSubSheet>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function FreeRunDrawer({
  currentActivity,
  onActivityChange,
  onStartWorkout,
  onClose,
  onRequestRouteGeneration,
  userPosition,
  cityName,
  onStartHybrid,
  enableHybridSlots = false,
  onRequestAddressDestination,
  onConfirmAddressDestination,
  onRequestAddLeg,
  onStartLegPlanRun,
  initialPlannedRun,
}: FreeRunDrawerProps) {
  // Home v2 (enable_home_v2) — this drawer is a map layer, outside HomeV2Context.
  const isSuperAdmin = useUserStore((st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  const v2 = useFeatureFlags(isSuperAdmin).flags.enableHomeV2;

  // Normalise to a valid chip activity; 'workout' falls back to 'running'.
  const initialActivity: CarouselActivity =
    currentActivity === 'cycling' || currentActivity === 'walking'
      ? currentActivity
      : 'running';

  const [selectedActivity, setSelectedActivity] = useState<CarouselActivity>(initialActivity);

  // Goal state — seeded from smart defaults per activity.
  const defaults = ACTIVITY_DEFAULTS[initialActivity];
  // v2: a scheduled run's saved settings seed the drawer (once, on mount).
  // null → today's defaults, exactly as before.
  const prefillFrom = (raw: PlannedRunSettings) =>
    plannedRunToDrawerState(raw, {
      goalType: defaults.goalType,
      timeValue: defaults.time,
      distanceValue: defaults.distance,
      caloriesValue: defaults.calories,
      hybridEnabled: false,
      aerobicShare: RECOMMENDED_AEROBIC_SHARE,
      extras: { gymParks: false, trail: false },
    });
  const [prefill] = useState(() => (initialPlannedRun ? prefillFrom(initialPlannedRun) : null));
  // The prop can arrive a render late (feature flags still loading at mount) —
  // apply it once then too. Never re-applied over the user's own edits.
  const prefillAppliedRef = useRef(!!initialPlannedRun);
  const [goalType,      setGoalType]      = useState<GoalType>(prefill?.goalType ?? defaults.goalType);
  const [timeValue,     setTimeValue]     = useState(prefill?.timeValue ?? defaults.time);
  const [distanceValue, setDistanceValue] = useState(prefill?.distanceValue ?? defaults.distance);
  const [caloriesValue, setCaloriesValue] = useState(prefill?.caloriesValue ?? defaults.calories);

  // Lazy-seeded from BOTH cross-remount stores (not always false) —
  // FreeRunDrawer remounts after every "add stop" / address-pick
  // round-trip (mapMode leaves 'freeRun' per the One-Card-Only law), so
  // this auto-reopens GoalSheet showing the pending address instead of
  // dropping the user back at the base drawer. Mirrors legPlanOpen below.
  const [goalSheetOpen, setGoalSheetOpen] = useState(
    () => usePendingAddressStore.getState().isComposing,
  );
  const [extrasOpen,    setExtrasOpen]    = useState(false);
  // Lazy-seeded from the store (not always false) — FreeRunDrawer remounts
  // after every leg-plan "add stop" round-trip (mapMode leaves 'freeRun'
  // per the One-Card-Only law), so this auto-reopens LegPlanSheet showing
  // the updated list instead of dropping the user back at the base drawer.
  const [legPlanOpen, setLegPlanOpen] = useState(() => useLegPlanStore.getState().isComposing);
  const legPlanCount = useLegPlanStore((s) => s.legs.length);
  const pendingAddress = usePendingAddressStore((s) => s.pending);
  const [extras, setExtras] = useState<ExtrasState>({
    circular: false,
    gymParks: prefill?.extras.gymParks ?? false,
    benches: false,
    stairs: false,
    trail: prefill?.extras.trail ?? false,
  });

  // ── Hybrid (aerobic + strength) state — additive, defaults OFF ─────────────
  // (A scheduled run's saved split turns it on; it's still only applied when
  // enableHybridSlots is on — same `enableHybridSlots && hybridEnabled` gate.)
  const [hybridEnabled, setHybridEnabled] = useState(prefill?.hybridEnabled ?? false);
  const [aerobicShare,  setAerobicShare]  = useState(prefill?.aerobicShare ?? RECOMMENDED_AEROBIC_SHARE);

  useEffect(() => {
    if (prefillAppliedRef.current || !initialPlannedRun) return;
    prefillAppliedRef.current = true;
    const p = prefillFrom(initialPlannedRun);
    if (!p) return;
    setGoalType(p.goalType);
    setTimeValue(p.timeValue);
    setDistanceValue(p.distanceValue);
    setCaloriesValue(p.caloriesValue);
    setHybridEnabled(p.hybridEnabled);
    setAerobicShare(p.aerobicShare);
    setExtras((prev) => ({ ...prev, gymParks: p.extras.gymParks, trail: p.extras.trail }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPlannedRun]);

  // ── Scheduled run state ────────────────────────────────────────────────────
  const [timing,    setTiming]    = useState<'now' | 'later'>('now');
  const [schedDate, setSchedDate] = useState(defaultSchedDate);
  const [schedTime, setSchedTime] = useState('18:00');
  const [isSaving,  setIsSaving]  = useState(false);
  // Ref-based cache: invalidated inline by key comparison so React re-renders
  // between "שתף" and "שמור" cannot spuriously reset it via useEffect.
  const savedInviteRef = useRef<{ key: string; result: RunInviteResult } | null>(null);
  // v2: "הזמן חבר" in "עכשיו" mode only marks the intent; the ephemeral group
  // is created by runPendingInvite() when the user actually starts, so closing
  // the drawer without starting leaves nothing behind in Firestore.
  const [inviteOnStart, setInviteOnStart] = useState(false);

  // Real absence, not `=== 70` (signup's placeholder) — see weight-status.ts.
  const weightMissing = useUserStore((s) => isWeightMissing(s.profile?.core));
  const gender     = useUserStore((s) => s.profile?.core?.gender);
  const genderDefault =
    gender === 'female' ? 60 :
    gender === 'male'   ? 75 : 68;

  /** Save weight locally (Zustand + localStorage) and fire-and-forget to Firestore. */
  const saveWeightInline = async (w: number) => {
    const currentCore = useUserStore.getState().profile?.core;
    if (currentCore) {
      // weightSetByUser: see core/utils/weight-status.ts. Kept off the core type on
      // purpose (a bare variable, not a literal, so no excess-property check).
      const nextCore = { ...currentCore, weight: w, weightSetByUser: true };
      useUserStore.getState().updateProfile({ core: nextCore });
    }
    const uid = auth.currentUser?.uid;
    if (uid) {
      try {
        await updateDoc(doc(db, 'users', uid), { 'core.weight': w, 'core.weightSetByUser': true });
      } catch {
        // Non-blocking — local store already updated.
      }
    }
  };

  const toggleExtra = (key: keyof ExtrasState) =>
    setExtras((prev) => ({ ...prev, [key]: !prev[key] }));

  // Activity chip selection — resets goal to smart defaults and notifies parent.
  const handleActivitySelect = (activity: CarouselActivity) => {
    setSelectedActivity(activity);
    const d = ACTIVITY_DEFAULTS[activity];
    setGoalType(d.goalType);
    setTimeValue(d.time);
    setDistanceValue(d.distance);
    setCaloriesValue(d.calories);
    onActivityChange?.(activity);
  };

  /** Goal + extras → route request. Pure logic extracted to
      route-request.utils (unit-tested); this stays a thin adapter. */
  const drawerGoal = (): DrawerGoal => ({ goalType, timeValue, distanceValue, caloriesValue });
  const drawerActivity = (): DrawerActivity =>
    selectedActivity === 'cycling' ? 'cycling' : selectedActivity === 'walking' ? 'walking' : 'running';

  /** Unlock audio + push goal into the running-player store. */
  const applyGoalToPlayer = async () => {
    if (typeof window !== 'undefined') {
      const { audioService } = await import(
        '@/features/workout-engine/core/services/AudioService'
      );
      audioService.unlock();
    }
    const player = useRunningPlayer.getState();
    player.setRunMode('free');
    // Push the chip selection into the running player so the session mode and
    // the saved workout doc reflect walking as walking. Cycling has no player
    // pipeline yet — it falls back to 'running', same as the save path.
    player.setActivityType(selectedActivity === 'walking' ? 'walking' : 'running');
    if (goalType === 'time') {
      player.setSessionGoal({ type: 'time', value: timeValue * 60 });
    } else if (goalType === 'distance') {
      player.setSessionGoal({ type: 'distance', value: distanceValue });
    } else {
      player.setSessionGoal({ type: 'calories', value: caloriesValue });
    }
  };

  /** v2 deferred "now" invite — create the group + open the share sheet at
      start time. Failure never blocks the start (same as a failed invite tap). */
  const runPendingInvite = async () => {
    if (!v2 || timing !== 'now' || !inviteOnStart) return;
    try {
      await shareRunInviteNow(selectedActivity === 'walking' ? 'walking' : 'running');
    } catch (err) {
      console.error('[FreeRunDrawer] invite on start:', err);
    }
  };

  const handleStartFree = async () => {
    await applyGoalToPlayer();
    await runPendingInvite();
    onStartWorkout();
  };

  const handleStartWithRoute = async () => {
    await applyGoalToPlayer();
    await runPendingInvite();
    if (!userPosition || !onRequestRouteGeneration) {
      // Degrade gracefully when route props are absent.
      onStartWorkout();
      return;
    }
    onRequestRouteGeneration(buildRouteGenRequest(drawerGoal(), drawerActivity(), extras));
  };

  /**
   * Hybrid start — capture drawer intent and hand off to the parent (which
   * composes the sandwich plan + drives the run↔station runner). Until the
   * parent wires `onStartHybrid`, degrade to a normal free start.
   */
  const handleStartHybrid = async () => {
    await applyGoalToPlayer();
    await runPendingInvite();
    const speedKmh =
      selectedActivity === 'cycling' ? 20 :
      selectedActivity === 'running' ? 10 : 5;
    const timeBudgetMin =
      goalType === 'time'     ? timeValue :
      goalType === 'distance' ? Math.max(10, Math.round((distanceValue / speedKmh) * 60)) :
      Math.max(10, Math.round(caloriesValue / (selectedActivity === 'running' ? 11 : 7)));
    const intent: HybridStartIntent = {
      timeBudgetMin,
      aerobicShare,
      emphasis: shareToEmphasis(aerobicShare),
      aerobicKind: selectedActivity === 'walking' ? 'walking' : 'running',
    };
    if (onStartHybrid) onStartHybrid(intent);
    else onStartWorkout();
  };

  const canStartWithRoute = !!userPosition && !!onRequestRouteGeneration;

  // ── Scheduled run handlers ─────────────────────────────────────────────────

  const scheduledFor = `${schedDate}T${schedTime}`;

  /**
   * Idempotent: first call creates the group + token + writes host schedule entry;
   * subsequent calls return the cached result so "שמור" and "שתף" share the same
   * group_invitations token (no duplicate groups).
   */
  const commitScheduled = async (): Promise<RunInviteResult> => {
    const cacheKey = `${schedDate}T${schedTime}|${selectedActivity}`;
    if (savedInviteRef.current?.key === cacheKey) return savedInviteRef.current.result;
    const actType = selectedActivity === 'walking' ? 'walking' : 'running';
    // v2: carry the chosen goal + hybrid split + route extras into the
    // scheduled run (they used to be dropped — only date/time/activity went).
    const plannedRun = v2
      ? buildPlannedRun({
          goalType, timeValue, distanceValue, caloriesValue,
          hybridEnabled: enableHybridSlots && hybridEnabled,
          aerobicShare,
          extras: { gymParks: extras.gymParks, trail: extras.trail },
        })
      : undefined;
    const result = await createRunInvite(actType, { scheduledFor, ...(plannedRun ? { plannedRun } : {}) });
    savedInviteRef.current = { key: cacheKey, result };
    return result;
  };

  /** "שמור" — commit (idempotent) then close the drawer. */
  const handleSaveOnly = async () => {
    setIsSaving(true);
    try {
      await commitScheduled();
      onClose();
    } catch (err) {
      console.error('[FreeRunDrawer] save scheduled:', err);
    } finally {
      setIsSaving(false);
    }
  };

  /** "שתף" for "אחר כך" — commit (idempotent) then open share sheet. */
  const handleShareScheduled = async () => {
    try {
      const result = await commitScheduled();
      const actType = selectedActivity === 'walking' ? 'walking' : 'running';
      const dateLabel = new Intl.DateTimeFormat('he-IL', { day: '2-digit', month: '2-digit' })
        .format(new Date(scheduledFor));
      const text = actType === 'walking'
        ? `קבעתי הליכה ב-${dateLabel} בשעה ${schedTime} 🚶 בוא/י להצטרף! ${result.shareUrl}`
        : `קבעתי ריצה ב-${dateLabel} בשעה ${schedTime} 🏃 בוא/י להצטרף! ${result.shareUrl}`;
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ text }).catch(() => {
          window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
        });
      } else {
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
      }
    } catch (err) {
      console.error('[FreeRunDrawer] share scheduled:', err);
    }
  };

  return (
    <FreeRunV2.Provider value={v2}>
      <FreeRunMainFrame onClose={onClose} v2={v2} title="אירובי חופשי">
        {/* ── Block 1: Activity chips ──────────────────────────────────── */}
        <ActivityChips selected={selectedActivity} onSelect={handleActivitySelect} />

        {/* ── Block 2: Goal summary (collapsed) ───────────────────────── */}
        <GoalSummaryRow
          goalType={goalType}
          timeValue={timeValue}
          distanceValue={distanceValue}
          caloriesValue={caloriesValue}
          onEdit={() => setGoalSheetOpen(true)}
        />

        {/* ── Block 2c: Hybrid toggle + ratio slider (design §4.1/§4.2) ──
            Flag-gated: while enableHybridSlots is false the toggle is not
            rendered, so hybridEnabled stays false → the free-run drawer is
            byte-identical to pre-hybrid and no compose path is reachable. */}
        {enableHybridSlots && (
          <>
            <StrengthStationsToggle enabled={hybridEnabled} onToggle={setHybridEnabled} accent={ACCENT} v2={v2} />
            {hybridEnabled && (
              <AerobicStrengthSlider
                aerobicShare={aerobicShare}
                onChange={setAerobicShare}
                goalType={goalType}
                timeBudgetMin={goalType === 'time' ? timeValue : 40}
                stations={1}
                accent={ACCENT}
                v2={v2}
              />
            )}
          </>
        )}

        {/* ── Block 2b: Invite + broadcast (RunShareBar) ───────────────── */}
        <RunShareBar
          activityType={selectedActivity === 'walking' ? 'walking' : 'running'}
          userLocation={userPosition}
          className="px-5 mb-4"
          timing={timing}
          onTimingChange={setTiming}
          schedDate={schedDate}
          schedTime={schedTime}
          onDateChange={setSchedDate}
          onTimeChange={setSchedTime}
          onShareScheduled={handleShareScheduled}
          v2={v2}
          nowInvite={v2 ? { pending: inviteOnStart, onChange: setInviteOnStart } : undefined}
        />

        {/* ── Block 3: Entry buttons / Save ───────────────────────────── */}
        {v2 && timing === 'later' ? (
          <div className="px-5 pb-2">
            <button type="button" onClick={handleSaveOnly} disabled={isSaving} className={V2_CTA}>
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Check size={17} strokeWidth={2.6} />}
              <span>{isSaving ? 'שומר...' : 'שמור לאימונים'}</span>
            </button>
          </div>
        ) : v2 && hybridEnabled ? (
          <div className="px-5 pb-2">
            <button type="button" onClick={handleStartHybrid} aria-label="התחל אימון משולב" className={V2_CTA}>
              <Dumbbell size={17} strokeWidth={2.4} />
              <span>התחל משולב</span>
            </button>
          </div>
        ) : timing === 'later' ? (
          <div className="px-5 pb-2">
            <button
              type="button"
              onClick={handleSaveOnly}
              disabled={isSaving}
              className="w-full flex items-center justify-center gap-2 text-white text-[14px] font-black active:scale-[0.97] transition-transform rounded-2xl disabled:opacity-60"
              style={{ height: 52, backgroundColor: ACCENT }}
            >
              {isSaving && <Loader2 size={16} className="animate-spin" />}
              <span>{isSaving ? 'שומר...' : '✓ שמור לאימונים'}</span>
            </button>
          </div>
        ) : hybridEnabled ? (
          <div className="px-5 pb-2">
            <button
              type="button"
              onClick={handleStartHybrid}
              aria-label="התחל אימון משולב"
              className="w-full flex items-center justify-center gap-2 text-white text-[14px] font-black active:scale-[0.97] transition-transform rounded-2xl"
              style={{ height: 52, backgroundColor: ACCENT }}
            >
              <span>💪🏃 התחל משולב</span>
            </button>
          </div>
        ) : (
          <EntryButtons
            onStartFree={handleStartFree}
            onStartWithRoute={handleStartWithRoute}
            canStartWithRoute={canStartWithRoute}
            cityName={cityName}
          />
        )}
      </FreeRunMainFrame>

      {/* Goal sheet — z-[102/103] */}
      <GoalSheet
        isOpen={goalSheetOpen}
        onClose={() => setGoalSheetOpen(false)}
        goalType={goalType}
        setGoalType={setGoalType}
        timeValue={timeValue}
        setTimeValue={setTimeValue}
        distanceValue={distanceValue}
        setDistanceValue={setDistanceValue}
        caloriesValue={caloriesValue}
        setCaloriesValue={setCaloriesValue}
        onOpenExtras={() => { setGoalSheetOpen(false); setExtrasOpen(true); }}
        weightMissing={weightMissing}
        genderDefault={genderDefault}
        onSaveWeight={saveWeightInline}
        onRequestAddressDestination={onRequestAddressDestination}
        pendingAddress={pendingAddress}
        onConfirmAddressDestination={onConfirmAddressDestination}
        onOpenLegPlan={onRequestAddLeg ? () => { setGoalSheetOpen(false); setLegPlanOpen(true); } : undefined}
        legPlanCount={legPlanCount}
      />

      {/* Extras sheet — z-[104/105] (above GoalSheet) */}
      <ExtrasSheet
        isOpen={extrasOpen}
        onClose={() => setExtrasOpen(false)}
        extras={extras}
        onToggle={toggleExtra}
      />

      {/* Leg-plan sheet — z-[104/105] (shares ExtrasSheet's tier, mutually exclusive with it) */}
      <LegPlanSheet
        isOpen={legPlanOpen}
        // "שמור והמשך" (09.08, David's 2nd-round UX fix) — X / backdrop-tap /
        // drag-dismiss all shared this one onClose, which used to drop the
        // user all the way back to the base drawer with no link to
        // goalSheetOpen — reads as "did that just discard my stops?" even
        // though the store still had them. Returning to GoalSheet instead
        // makes it unambiguous: this is save-and-continue, NOT clear — that
        // stays its own explicit, separate action (handleClearAll below).
        onClose={() => { setLegPlanOpen(false); setGoalSheetOpen(true); }}
        userPosition={userPosition}
        activity={drawerActivity()}
        onRequestAddLeg={onRequestAddLeg}
        onStartLegPlanRun={onStartLegPlanRun}
      />
    </FreeRunV2.Provider>
  );
}
