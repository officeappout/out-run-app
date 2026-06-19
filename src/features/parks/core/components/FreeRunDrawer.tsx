'use client';

import React, { useState } from 'react';

import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import { X, Play } from 'lucide-react';
import { ActivityType } from '../types/route.types';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import { useUserStore } from '@/features/user';
import { db, auth } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';

// ── Design tokens ─────────────────────────────────────────────────────────────
const ACCENT = '#00ADEF';

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
      <p className="text-[12px] font-black text-gray-700 mb-2.5">⚖️ משקלך לחישוב מדויק</p>
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
      <p className="text-[10px] text-gray-400 mt-1.5">ישמר לפרופיל שלך</p>
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
                  <GoalSlider min={0.5} max={20} step={0.5} value={distanceValue} onChange={setDistanceValue} formatLabel={(v) => `${v.toFixed(1)} ק״מ`} />
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

  const [goalSheetOpen, setGoalSheetOpen] = useState(false);
  const [extrasOpen,    setExtrasOpen]    = useState(false);
  const [extras, setExtras] = useState<ExtrasState>({
    circular: false, gymParks: false, benches: false, stairs: false, trail: false,
  });

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

  /** Convert active goal to target km for the route generator. */
  const computeTargetKm = (): number => {
    if (goalType === 'distance') return distanceValue;
    const speedKmh =
      selectedActivity === 'cycling' ? 20 :
      selectedActivity === 'running' ? 10 : 5;
    if (goalType === 'time') return Math.max(0.5, (timeValue / 60) * speedKmh);
    const kcalPerKm =
      selectedActivity === 'cycling' ? 25 :
      selectedActivity === 'running' ? 70 : 50;
    return Math.max(0.5, caloriesValue / kcalPerKm);
  };

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
    onRequestRouteGeneration({
      targetKm: computeTargetKm(),
      includeStrength: extras.gymParks,
      surface: extras.trail ? 'trail' : 'road',
    });
  };

  const canStartWithRoute = !!userPosition && !!onRequestRouteGeneration;

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
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 90px)' }}
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

            {/* ── Block 3: Entry buttons ───────────────────────────────────── */}
            <EntryButtons
              onStartFree={handleStartFree}
              onStartWithRoute={handleStartWithRoute}
              canStartWithRoute={canStartWithRoute}
              cityName={cityName}
            />
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
      />

      {/* Extras sheet — z-[104/105] (above GoalSheet) */}
      <ExtrasSheet
        isOpen={extrasOpen}
        onClose={() => setExtrasOpen(false)}
        extras={extras}
        onToggle={toggleExtra}
      />
    </>
  );
}
