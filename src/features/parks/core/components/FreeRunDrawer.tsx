'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import { X, Play } from 'lucide-react';
import { ActivityType, Route } from '../types/route.types';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import FreeRunRouteSelector from './FreeRunRouteSelector';

// ── Design tokens ─────────────────────────────────────────────────────────────
const ACCENT = '#00ADEF';

// ── Types ─────────────────────────────────────────────────────────────────────

type GoalType = 'time' | 'distance' | 'calories';

interface ExtrasState {
  circular: boolean;
  gymParks: boolean;
  benches: boolean;
  stairs: boolean;
}

interface FreeRunDrawerProps {
  currentActivity: ActivityType;
  onActivityChange: (type: ActivityType) => void;
  /** Free-mode start (no pre-built route). Existing behaviour. */
  onStartWorkout: () => void;
  onClose: () => void;
  /**
   * Route-mode start. Called after the user picks a card in
   * FreeRunRouteSelector. Parent owns "set focused route + start workout".
   * When omitted, the route-mode flow is disabled and the drawer behaves
   * as if `withRoute` were always false.
   */
  onStartWorkoutWithRoute?: (route: Route) => void;
  /**
   * Required for the route-mode flow — the generator needs a starting
   * GPS point. Free mode (no route) doesn't need this.
   */
  userPosition?: { lat: number; lng: number } | null;
  /**
   * Resolved city name for the user (from useUserCityName). Forwarded into
   * the generator so it can pull scored waypoints from `street_segments`
   * instead of falling back to random.
   */
  cityName?: string;
}

// ── Pill — mirrors PartnerFilterBar.Pill exactly ──────────────────────────────

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

// ── RTL single-handle slider — mirrors PartnerFilterBar inline slider ──────────
// Track height: 36px total (18px floating label zone + 18px track row).
// Fill anchors from the right edge (RTL min) and extends left as value grows.

function GoalSlider({
  min,
  max,
  step,
  value,
  onChange,
  formatLabel,
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
      {/* Floating value label — tracks thumb position from the right (RTL) */}
      <div
        className="absolute text-[11px] font-black pointer-events-none whitespace-nowrap"
        dir="ltr"
        style={{
          top: 0,
          right: `${pct}%`,
          transform: 'translateX(50%)',
          color: ACCENT,
        }}
      >
        {formatLabel(value)}
      </div>

      {/* Track row */}
      <div className="absolute left-0 right-0" style={{ top: 18, height: 18 }}>
        {/* Gray empty rail */}
        <div className="absolute top-1/2 left-0 right-0 h-1.5 -translate-y-1/2 bg-gray-200 rounded-full" />
        {/* Accent fill: right edge → thumb (RTL convention) */}
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full"
          style={{
            right: 0,
            left: `${100 - pct}%`,
            backgroundColor: ACCENT,
          }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          dir="rtl"
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full h-full appearance-none bg-transparent cursor-pointer"
          style={{ accentColor: ACCENT }}
        />
      </div>
    </div>
  );
}

// ── Toggle row — same chrome as WorkoutSettingsDrawer ─────────────────────────

function ToggleRow({
  emoji,
  label,
  value,
  onToggle,
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

// ── Extras sheet — secondary bottom-sheet that slides on top (z-[102/103]) ────

function ExtrasSheet({
  isOpen,
  onClose,
  extras,
  onToggle,
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
            <div className="px-5 pb-4">
              <h2 className="text-base font-black text-gray-900">הגדרות נוספות</h2>
            </div>

            {/* Toggles */}
            <div className="px-5">
              <ToggleRow
                emoji="🔄"
                label="מעגלי"
                value={extras.circular}
                onToggle={() => onToggle('circular')}
              />
              <ToggleRow
                emoji="🏋️"
                label="עבור דרך גינות כושר"
                value={extras.gymParks}
                onToggle={() => onToggle('gymParks')}
              />
              <ToggleRow
                emoji="🪑"
                label="עבור דרך ספסלים"
                value={extras.benches}
                onToggle={() => onToggle('benches')}
              />
              <ToggleRow
                emoji="📍"
                label="עבור דרך מדרגות"
                value={extras.stairs}
                onToggle={() => onToggle('stairs')}
              />
            </div>

            {/* Close CTA */}
            <div className="px-5 pt-5">
              <button
                type="button"
                onClick={onClose}
                className="w-full py-3 text-white text-sm font-black active:scale-[0.98] transition-transform"
                style={{ backgroundColor: ACCENT, borderRadius: 12 }}
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

// ── Static data ───────────────────────────────────────────────────────────────

const ACTIVITIES: Array<{ id: ActivityType; label: string; emoji: string }> = [
  { id: 'running', label: 'ריצה', emoji: '🏃' },
  { id: 'walking', label: 'הליכה', emoji: '🚶' },
  { id: 'cycling', label: 'רכיבה', emoji: '🚴' },
];

const GOAL_PILLS: Array<{ id: GoalType | 'extras'; label: string; emoji: string }> = [
  { id: 'time', label: 'זמן', emoji: '⏱' },
  { id: 'distance', label: 'מרחק', emoji: '📏' },
  { id: 'calories', label: 'קלוריות', emoji: '🔥' },
  { id: 'extras', label: 'עוד', emoji: '⚙️' },
];

// ── Main component ─────────────────────────────────────────────────────────────

export default function FreeRunDrawer({
  currentActivity,
  onActivityChange,
  onStartWorkout,
  onClose,
  onStartWorkoutWithRoute,
  userPosition,
  cityName,
}: FreeRunDrawerProps) {
  const dragControls = useDragControls();

  // Local UI state
  const [withRoute, setWithRoute] = useState(false);
  const [goalType, setGoalType] = useState<GoalType>('time');
  const [timeValue, setTimeValue] = useState(30);
  const [distanceValue, setDistanceValue] = useState(5);
  const [caloriesValue, setCaloriesValue] = useState(300);
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [extras, setExtras] = useState<ExtrasState>({
    circular: false,
    gymParks: false,
    benches: false,
    stairs: false,
  });

  // Route-mode overlay — visible only when withRoute=true and the user
  // has tapped the start CTA. The selector handles its own radar +
  // generator + cards lifecycle and only calls back via onStartWorkoutWithRoute.
  const [routeSelectorOpen, setRouteSelectorOpen] = useState(false);

  const toggleExtra = (key: keyof ExtrasState) =>
    setExtras((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleGoalPill = (id: GoalType | 'extras') => {
    if (id === 'extras') {
      setExtrasOpen(true);
    } else {
      setGoalType(id);
    }
  };

  /**
   * Convert the active goal (time / distance / calories) into a target km
   * for the route generator. Mirrors the speed table used in
   * useRouteGeneration.handleShuffle so a 30-min goal here produces the
   * same target distance as the discover-mode shuffle.
   */
  const computeTargetKm = (): number => {
    if (goalType === 'distance') return distanceValue;
    const speedKmh =
      currentActivity === 'cycling' ? 20 : currentActivity === 'running' ? 10 : 5;
    if (goalType === 'time') {
      return Math.max(0.5, (timeValue / 60) * speedKmh);
    }
    // calories → rough kcal/km by activity (matches the generator's calorie formula)
    const kcalPerKm =
      currentActivity === 'cycling' ? 25 : currentActivity === 'running' ? 70 : 50;
    return Math.max(0.5, caloriesValue / kcalPerKm);
  };

  /**
   * CTA handler. Free-mode = existing behaviour (parent's onStartWorkout).
   * Route-mode = open the FreeRunRouteSelector overlay; the parent wires
   * onStartWorkoutWithRoute for the actual workout start.
   *
   * If route-mode is requested but the parent didn't supply the necessary
   * props (userPosition + onStartWorkoutWithRoute), we silently degrade to
   * free-mode rather than block the user.
   */
  const handleStartCta = async () => {
    if (typeof window !== 'undefined') {
      const { audioService } = await import(
        '@/features/workout-engine/core/services/AudioService'
      );
      audioService.unlock();
    }
    const player = useRunningPlayer.getState();
    player.setRunMode('free');

    // Push the active goal into the running-player store so the
    // RouteStoryBar inside AdaptiveMetricsWrapper can render its fill.
    // Units are normalised here once: time → seconds, distance → km,
    // calories → kcal. Every downstream consumer (useSessionGoalProgress,
    // future telemetry) can do simple division without knowing where
    // the value came from.
    if (goalType === 'time') {
      player.setSessionGoal({ type: 'time', value: timeValue * 60 });
    } else if (goalType === 'distance') {
      player.setSessionGoal({ type: 'distance', value: distanceValue });
    } else {
      player.setSessionGoal({ type: 'calories', value: caloriesValue });
    }

    const canDoRouteMode =
      withRoute && !!userPosition && !!onStartWorkoutWithRoute;
    if (canDoRouteMode) {
      setRouteSelectorOpen(true);
      return;
    }
    onStartWorkout();
  };

  return (
    <>
      <div className="fixed inset-0 z-[100] pointer-events-none">
        {/* Scrim */}
        <div
          className="absolute inset-0 pointer-events-auto"
          onClick={onClose}
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
            {/* ── Drag handle ───────────────────────────────────────────── */}
            <div
              className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing"
              onPointerDown={(e) => dragControls.start(e)}
              style={{ touchAction: 'none' }}
            >
              <div className="rounded-full bg-gray-300" style={{ width: 36, height: 4 }} />
            </div>

            {/* ── Header ────────────────────────────────────────────────── */}
            <div className="flex items-start justify-between px-5 pb-5">
              <div>
                <h2 className="text-base font-black text-gray-900">אירובי חופשי</h2>
                <p className="text-sm text-gray-500 mt-0.5">בחר את סוג האימון שלך</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center active:scale-90 transition-transform"
                aria-label="סגור"
              >
                <X size={14} className="text-gray-600" />
              </button>
            </div>

            {/* ── Section 1 — Activity type ─────────────────────────────── */}
            <div className="px-5 mb-5">
              <span className="text-[13px] font-black text-gray-800 block mb-2.5">
                סוג פעילות
              </span>
              <div className="flex gap-2">
                {ACTIVITIES.map(({ id, label, emoji }) => (
                  <Pill
                    key={id}
                    active={currentActivity === id}
                    onClick={() => onActivityChange(id)}
                  >
                    {emoji} {label}
                  </Pill>
                ))}
              </div>
            </div>

            {/* ── Section 2 — Mode ──────────────────────────────────────── */}
            <div className="px-5 mb-5">
              <span className="text-[13px] font-black text-gray-800 block mb-2.5">
                מצב
              </span>
              <div className="flex gap-2">
                <Pill active={withRoute} onClick={() => setWithRoute(true)}>
                  🗺️ עם מסלול
                </Pill>
                <Pill active={!withRoute} onClick={() => setWithRoute(false)}>
                  ⚡ חופשי
                </Pill>
              </div>
              {/* City confirmation chip — only relevant for route mode. Gives the
                  user transparency into which city the generator will query
                  street_segments for. When undefined we still let them tap
                  start; the generator falls back to random waypoints. */}
              {withRoute && (
                <div className="mt-2.5 text-[11px] text-gray-500 leading-tight">
                  {cityName ? (
                    <>
                      <span className="text-gray-400">חיפוש מסלולים ב-</span>
                      <span className="font-bold text-gray-700">{cityName}</span>
                    </>
                  ) : (
                    <span className="text-amber-600">
                      לא זוהתה עיר — נשתמש במסלול אקראי קרוב למיקום שלך
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* ── Section 3 — Goal ──────────────────────────────────────── */}
            <div className="px-5 mb-5">
              <span className="text-[13px] font-black text-gray-800 block mb-2.5">
                מטרה
              </span>

              {/* Goal type pills */}
              <div className="flex gap-2 mb-4">
                {GOAL_PILLS.map(({ id, label, emoji }) => (
                  <Pill
                    key={id}
                    active={id !== 'extras' && goalType === id}
                    onClick={() => handleGoalPill(id)}
                  >
                    {emoji} {label}
                  </Pill>
                ))}
              </div>

              {/* ── Slider: זמן ─────────────────────────────────────────── */}
              {goalType === 'time' && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[13px] font-black text-gray-800">משך האימון</span>
                    <span className="text-[13px] font-black" style={{ color: ACCENT }}>
                      {timeValue} דק׳
                    </span>
                  </div>
                  <GoalSlider
                    min={5}
                    max={120}
                    step={5}
                    value={timeValue}
                    onChange={setTimeValue}
                    formatLabel={(v) => `${v} דק׳`}
                  />
                </div>
              )}

              {/* ── Slider: מרחק ────────────────────────────────────────── */}
              {goalType === 'distance' && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[13px] font-black text-gray-800">מרחק</span>
                    <span className="text-[13px] font-black" style={{ color: ACCENT }}>
                      {distanceValue.toFixed(1)} ק״מ
                    </span>
                  </div>
                  <GoalSlider
                    min={0.5}
                    max={20}
                    step={0.5}
                    value={distanceValue}
                    onChange={setDistanceValue}
                    formatLabel={(v) => `${v.toFixed(1)} ק״מ`}
                  />
                </div>
              )}

              {/* ── Slider: קלוריות ─────────────────────────────────────── */}
              {goalType === 'calories' && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[13px] font-black text-gray-800">קלוריות</span>
                    <span className="text-[13px] font-black" style={{ color: ACCENT }}>
                      {caloriesValue} קק״ל
                    </span>
                  </div>
                  <GoalSlider
                    min={50}
                    max={800}
                    step={50}
                    value={caloriesValue}
                    onChange={setCaloriesValue}
                    formatLabel={(v) => `${v} קק״ל`}
                  />
                </div>
              )}
            </div>

            {/* ── CTA ───────────────────────────────────────────────────── */}
            <div className="px-5">
              <button
                type="button"
                onClick={handleStartCta}
                className="w-full py-3 text-white text-sm font-black active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
                style={{ backgroundColor: ACCENT, borderRadius: 12 }}
              >
                <Play size={16} fill="currentColor" />
                {withRoute ? 'מצא לי מסלול' : 'התחל אימון חופשי'}
              </button>
            </div>
          </div>
        </motion.div>
      </div>

      {/* ── Extras sheet (z-[102/103] — above the main drawer at z-[100]) ── */}
      <ExtrasSheet
        isOpen={extrasOpen}
        onClose={() => setExtrasOpen(false)}
        extras={extras}
        onToggle={toggleExtra}
      />

      {/* ── Route selector (z-[110] — covers the drawer entirely) ─────────
          Mounted only when the user picked "עם מסלול" + tapped CTA AND the
          parent supplied the required route-mode props. */}
      {routeSelectorOpen && userPosition && onStartWorkoutWithRoute && (
        <FreeRunRouteSelector
          userPosition={userPosition}
          activity={currentActivity}
          targetKm={computeTargetKm()}
          cityName={cityName}
          onSelect={(route) => {
            setRouteSelectorOpen(false);
            onStartWorkoutWithRoute(route);
          }}
          onCancel={() => setRouteSelectorOpen(false)}
        />
      )}
    </>
  );
}
