'use client';

import React, { useState, useRef } from 'react';

import { motion, AnimatePresence, useDragControls, Reorder } from 'framer-motion';
import { X, Play, Loader2, Trash2, GripVertical } from 'lucide-react';
import { ActivityType } from '../types/route.types';
import StrengthStationsToggle from './hybrid/StrengthStationsToggle';
import AerobicStrengthSlider from './hybrid/AerobicStrengthSlider';
import { HYBRID_SLOTS_ENABLED } from '@/config/feature-flags';
import {
  shareToEmphasis,
  RECOMMENDED_AEROBIC_SHARE,
  type HybridStartIntent,
} from '@/features/workout-engine/hybrid/build-hybrid-input';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import { useUserStore } from '@/features/user';
import { db, auth } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import RunShareBar from '@/features/workout-engine/components/RunShareBar';
import { createRunInvite } from '@/lib/workoutInvite';
import type { RunInviteResult } from '@/lib/workoutInvite';
import { buildRouteGenRequest } from '../services/route-request.utils';
import type { DrawerGoal, DrawerActivity } from '../services/route-request.utils';
import { useLegPlanStore } from '../store/useLegPlanStore';
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
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
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
  userWeight,
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
  userWeight: number | null;
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
  const dragControls = useDragControls();

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/30 z-[102] pointer-events-auto"
          />

          <motion.div
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.25}
            onDragEnd={(_, info) => {
              if (info.offset.y > 80 || info.velocity.y > 300) onClose();
            }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-[103] bg-white rounded-t-3xl shadow-2xl pointer-events-auto"
            dir="rtl"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
          >
            {/* Drag handle */}
            <div
              className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing"
              onPointerDown={(e) => dragControls.start(e)}
              style={{ touchAction: 'none' }}
            >
              <div className="rounded-full bg-gray-300" style={{ width: 36, height: 4 }} />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pb-4">
              <h2 className="text-base font-black text-gray-900">מטרת אימון</h2>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center active:scale-90 transition-transform"
                aria-label="סגור"
              >
                <X size={14} className="text-gray-600" />
              </button>
            </div>

            {/* Goal type pills */}
            <div className="px-5 mb-5">
              <div className="flex gap-2">
                <Pill active={goalType === 'time'}     onClick={() => setGoalType('time')}>⏱ זמן</Pill>
                <Pill active={goalType === 'distance'} onClick={() => setGoalType('distance')}>📏 מרחק</Pill>
                <Pill active={goalType === 'calories'} onClick={() => setGoalType('calories')}>🔥 קלוריות</Pill>
              </div>
            </div>

            {/* Slider */}
            <div className="px-5 mb-5">
              {goalType === 'time' && (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[13px] font-black text-gray-800">משך האימון</span>
                    <span className="text-[13px] font-black" style={{ color: ACCENT }}>{timeValue} דק׳</span>
                  </div>
                  <GoalSlider min={5} max={120} step={5} value={timeValue} onChange={setTimeValue} formatLabel={(v) => `${v} דק׳`} />
                </>
              )}

              {goalType === 'distance' && (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[13px] font-black text-gray-800">מרחק</span>
                    <span className="text-[13px] font-black" style={{ color: ACCENT }}>{distanceValue.toFixed(1)} ק״מ</span>
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
                    <span className="text-[13px] font-black text-gray-800">קלוריות</span>
                    <span className="text-[13px] font-black" style={{ color: ACCENT }}>{caloriesValue} קק״ל</span>
                  </div>
                  <GoalSlider min={50} max={800} step={50} value={caloriesValue} onChange={setCaloriesValue} formatLabel={(v) => `${v} קק״ל`} />
                  {(!userWeight || userWeight === 70) && (
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
            {onRequestAddressDestination && (
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
            {onOpenLegPlan && (
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

            {/* Confirm */}
            <div className="px-5">
              <button
                type="button"
                onClick={onClose}
                className="w-full py-3 text-white text-sm font-black active:scale-[0.98] transition-transform rounded-xl"
                style={{ backgroundColor: ACCENT }}
              >
                אישור
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
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
  const dragControls = useDragControls();
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
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/30 z-[104] pointer-events-auto"
          />

          <motion.div
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.25}
            onDragEnd={(_, info) => {
              if (info.offset.y > 80 || info.velocity.y > 300) onClose();
            }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-[105] bg-white rounded-t-3xl shadow-2xl pointer-events-auto"
            dir="rtl"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
          >
            {/* Drag handle */}
            <div
              className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing shrink-0"
              onPointerDown={(e) => dragControls.start(e)}
              style={{ touchAction: 'none' }}
            >
              <div className="rounded-full bg-gray-300" style={{ width: 36, height: 4 }} />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pb-4 shrink-0">
              <h2 className="text-base font-black text-gray-900">עצירות בדרך</h2>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center active:scale-90 transition-transform"
                aria-label="סגור"
              >
                <X size={14} className="text-gray-600" />
              </button>
            </div>

            {/* Ordered leg list — drag to reorder */}
            <div className="px-5 overflow-y-auto flex-1">
              {legs.length === 0 ? (
                <p className="text-[13px] text-gray-500 text-center py-6">
                  עדיין לא הוספת עצירות. הוסף עצירה כדי להתחיל להרכיב את המסלול.
                </p>
              ) : (
                <Reorder.Group axis="y" values={legs} onReorder={handleReorder} as="div" className="space-y-2">
                  {legs.map((leg, idx) => (
                    <Reorder.Item
                      key={leg.id}
                      value={leg}
                      as="div"
                      className="flex items-center gap-2 rounded-2xl px-3 py-3"
                      style={{ backgroundColor: '#F3F4F6' }}
                      whileDrag={{ scale: 1.02, boxShadow: '0 8px 30px rgba(0,0,0,0.12)', zIndex: 50, backgroundColor: '#FFFFFF' }}
                    >
                      <GripVertical size={16} className="text-gray-400 shrink-0" />
                      <span className="flex-1 text-[13px] font-bold text-gray-800 truncate">
                        {leg.label || `עצירה ${idx + 1}`}
                      </span>
                      <button
                        type="button"
                        onClick={() => useLegPlanStore.getState().removeLeg(leg.id)}
                        className="w-7 h-7 rounded-full flex items-center justify-center active:scale-90 transition-transform shrink-0"
                        aria-label="הסר עצירה"
                      >
                        <Trash2 size={14} className="text-gray-400" />
                      </button>
                    </Reorder.Item>
                  ))}
                </Reorder.Group>
              )}
            </div>

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
          </motion.div>
        </>
      )}
    </AnimatePresence>
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
  const dragControls = useDragControls();

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/30 z-[104] pointer-events-auto"
          />

          <motion.div
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.25}
            onDragEnd={(_, info) => {
              if (info.offset.y > 80 || info.velocity.y > 300) onClose();
            }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-[105] bg-white rounded-t-3xl shadow-2xl pointer-events-auto"
            dir="rtl"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
          >
            <div
              className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing"
              onPointerDown={(e) => dragControls.start(e)}
              style={{ touchAction: 'none' }}
            >
              <div className="rounded-full bg-gray-300" style={{ width: 36, height: 4 }} />
            </div>

            <div className="px-5 pb-4">
              <h2 className="text-base font-black text-gray-900">הגדרות נוספות</h2>
            </div>

            <div className="px-5">
              <ToggleRow emoji="🔄" label="מעגלי"              value={extras.circular} onToggle={() => onToggle('circular')} />
              <ToggleRow emoji="🏋️" label="עבור דרך גינות כושר" value={extras.gymParks} onToggle={() => onToggle('gymParks')} />
              <ToggleRow emoji="🪑" label="עבור דרך ספסלים"      value={extras.benches}  onToggle={() => onToggle('benches')}  />
              <ToggleRow emoji="📍" label="עבור דרך מדרגות"      value={extras.stairs}   onToggle={() => onToggle('stairs')}   />
              <ToggleRow emoji="🌿" label="שבילי עפר (Trail)"    value={extras.trail}    onToggle={() => onToggle('trail')}    />
            </div>

            <div className="px-5 pt-5">
              <button
                type="button"
                onClick={onClose}
                className="w-full py-3 text-white text-sm font-black active:scale-[0.98] transition-transform rounded-xl"
                style={{ backgroundColor: ACCENT }}
              >
                סגור
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
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
  onRequestAddressDestination,
  onConfirmAddressDestination,
  onRequestAddLeg,
  onStartLegPlanRun,
}: FreeRunDrawerProps) {
  const dragControls = useDragControls();

  // Normalise to a valid chip activity; 'workout' falls back to 'running'.
  const initialActivity: CarouselActivity =
    currentActivity === 'cycling' || currentActivity === 'walking'
      ? currentActivity
      : 'running';

  const [selectedActivity, setSelectedActivity] = useState<CarouselActivity>(initialActivity);

  // Goal state — seeded from smart defaults per activity.
  const defaults = ACTIVITY_DEFAULTS[initialActivity];
  const [goalType,      setGoalType]      = useState<GoalType>(defaults.goalType);
  const [timeValue,     setTimeValue]     = useState(defaults.time);
  const [distanceValue, setDistanceValue] = useState(defaults.distance);
  const [caloriesValue, setCaloriesValue] = useState(defaults.calories);

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
    circular: false, gymParks: false, benches: false, stairs: false, trail: false,
  });

  // ── Hybrid (aerobic + strength) state — additive, defaults OFF ─────────────
  const [hybridEnabled, setHybridEnabled] = useState(false);
  const [aerobicShare,  setAerobicShare]  = useState(RECOMMENDED_AEROBIC_SHARE);

  // ── Scheduled run state ────────────────────────────────────────────────────
  const [timing,    setTiming]    = useState<'now' | 'later'>('now');
  const [schedDate, setSchedDate] = useState(defaultSchedDate);
  const [schedTime, setSchedTime] = useState('18:00');
  const [isSaving,  setIsSaving]  = useState(false);
  // Ref-based cache: invalidated inline by key comparison so React re-renders
  // between "שתף" and "שמור" cannot spuriously reset it via useEffect.
  const savedInviteRef = useRef<{ key: string; result: RunInviteResult } | null>(null);

  const userWeight = useUserStore((s) => s.profile?.core?.weight ?? null);
  const gender     = useUserStore((s) => s.profile?.core?.gender);
  const genderDefault =
    gender === 'female' ? 60 :
    gender === 'male'   ? 75 : 68;

  /** Save weight locally (Zustand + localStorage) and fire-and-forget to Firestore. */
  const saveWeightInline = async (w: number) => {
    const currentCore = useUserStore.getState().profile?.core;
    if (currentCore) {
      useUserStore.getState().updateProfile({ core: { ...currentCore, weight: w } });
    }
    const uid = auth.currentUser?.uid;
    if (uid) {
      try {
        await updateDoc(doc(db, 'users', uid), { 'core.weight': w });
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

  const handleStartFree = async () => {
    await applyGoalToPlayer();
    onStartWorkout();
  };

  const handleStartWithRoute = async () => {
    await applyGoalToPlayer();
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
    const result = await createRunInvite(actType, { scheduledFor });
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
    <>
      <div className="fixed inset-0 z-[100] pointer-events-none">
        {/* Scrim */}
        <div className="absolute inset-0 pointer-events-auto" onClick={onClose} />

        <motion.div
          drag="y"
          dragControls={dragControls}
          dragListener={false}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={0.25}
          onDragEnd={(_, info) => {
            if (info.offset.y > 80 || info.velocity.y > 300) onClose();
          }}
          initial={{ y: 400 }}
          animate={{ y: 0 }}
          exit={{ y: 400 }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          className="absolute bottom-0 left-0 right-0 pointer-events-auto"
        >
          <div
            className="bg-white rounded-t-3xl shadow-2xl"
            dir="rtl"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
          >
            {/* Drag handle */}
            <div
              className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing"
              onPointerDown={(e) => dragControls.start(e)}
              style={{ touchAction: 'none' }}
            >
              <div className="rounded-full bg-gray-300" style={{ width: 36, height: 4 }} />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pb-4">
              <h2 className="text-base font-black text-gray-900">אירובי חופשי</h2>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center active:scale-90 transition-transform shrink-0"
                aria-label="סגור"
              >
                <X size={14} className="text-gray-600" />
              </button>
            </div>

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
                Flag-gated: while HYBRID_SLOTS_ENABLED is false the toggle is not
                rendered, so hybridEnabled stays false → the free-run drawer is
                byte-identical to pre-hybrid and no compose path is reachable. */}
            {HYBRID_SLOTS_ENABLED && (
              <>
                <StrengthStationsToggle enabled={hybridEnabled} onToggle={setHybridEnabled} accent={ACCENT} />
                {hybridEnabled && (
                  <AerobicStrengthSlider
                    aerobicShare={aerobicShare}
                    onChange={setAerobicShare}
                    goalType={goalType}
                    timeBudgetMin={goalType === 'time' ? timeValue : 40}
                    stations={1}
                    accent={ACCENT}
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
            />

            {/* ── Block 3: Entry buttons / Save ───────────────────────────── */}
            {timing === 'later' ? (
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
          </div>
        </motion.div>
      </div>

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
        userWeight={userWeight}
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
    </>
  );
}
