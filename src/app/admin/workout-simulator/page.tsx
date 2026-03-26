'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Play,
  Clock,
  Dumbbell,
  Shield,
  MapPin,
  Zap,
  ChevronDown,
  ChevronUp,
  BarChart3,
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  User,
  Wrench,
  FileText,
  MessageSquare,
  Bell,
  Layers,
  SplitSquareHorizontal,
  Snowflake,
  Target,
  BookOpen,
  Plus,
  Trash2,
  ListChecks,
} from 'lucide-react';
import { getAllGearDefinitions } from '@/features/content/equipment/gear/core/gear-definition.service';
import type { GearDefinition } from '@/features/content/equipment/gear/core/gear-definition.types';
import { getAllPrograms } from '@/features/content/programs/core/program.service';
import type { Program } from '@/features/content/programs/core/program.types';
import { generateHomeWorkoutTrio } from '@/features/workout-engine/services/home-workout.service';
import type { HomeWorkoutOptions, HomeWorkoutTrioResult } from '@/features/workout-engine/services/home-workout.types';
import type { ExecutionLocation, InjuryShieldArea } from '@/features/content/exercises/core/exercise.types';
import { getLocalizedText } from '@/features/content/exercises/core/exercise.types';
import type { UserFullProfile } from '@/features/user/core/types/user.types';
import type { LifestylePersona } from '@/features/workout-engine/logic/ContextualEngine';
import type { DifficultyLevel, WorkoutExercise, GeneratedWorkout } from '@/features/workout-engine/logic/WorkoutGenerator';

// ============================================================================
// CONSTANTS
// ============================================================================

const PERSONA_OPTIONS: { value: LifestylePersona | ''; label: string; icon: string }[] = [
  { value: '',            label: 'ללא פרסונה',   icon: '🚫' },
  { value: 'parent',      label: 'הורה',         icon: '👨‍👧' },
  { value: 'student',     label: 'סטודנט',       icon: '📚' },
  { value: 'school_student', label: 'תלמיד',     icon: '🎒' },
  { value: 'office_worker', label: 'עובד משרד',  icon: '💼' },
  { value: 'home_worker', label: 'עובד מהבית',   icon: '🏠' },
  { value: 'senior',      label: 'גיל הזהב',     icon: '🧓' },
  { value: 'athlete',     label: 'ספורטאי',       icon: '🏆' },
  { value: 'reservist',   label: 'מילואימניק',    icon: '🎖️' },
  { value: 'active_soldier', label: 'חייל סדיר', icon: '🪖' },
];

const LOCATION_OPTIONS: { value: ExecutionLocation; label: string; icon: string }[] = [
  { value: 'park',    label: 'פארק',     icon: '🌳' },
  { value: 'home',    label: 'בית',      icon: '🏠' },
  { value: 'gym',     label: 'חדר כושר', icon: '🏋️' },
  { value: 'office',  label: 'משרד',     icon: '💼' },
  { value: 'street',  label: 'רחוב',     icon: '🏃' },
  { value: 'school',  label: 'בית ספר',  icon: '🏫' },
  { value: 'library', label: 'ספרייה',   icon: '📚' },
  { value: 'airport', label: 'שדה תעופה', icon: '✈️' },
];

const INJURY_AREAS: { value: InjuryShieldArea; label: string }[] = [
  { value: 'wrist',      label: 'שורש כף יד' },
  { value: 'elbow',      label: 'מרפק' },
  { value: 'shoulder',   label: 'כתף' },
  { value: 'lower_back', label: 'גב תחתון' },
  { value: 'neck',       label: 'צוואר' },
  { value: 'knees',      label: 'ברכיים' },
  { value: 'ankles',     label: 'קרסולים' },
  { value: 'hips',       label: 'ירכיים' },
];

// ── Active Program Item (Program Builder) ────────────────────────────────────
interface ActiveProgramItem {
  id: string;
  name: string;
  level: number;
}

const MG_TO_DOMAIN: Record<string, string> = {
  vertical_pull: 'pull', horizontal_pull: 'pull',
  vertical_push: 'push', horizontal_push: 'push',
  squat: 'legs', hinge: 'legs', lunge: 'legs',
  core: 'core', anti_extension: 'core', anti_rotation: 'core',
};

const DOMAIN_COLORS: Record<string, string> = {
  pull:  'bg-blue-500',
  push:  'bg-red-500',
  legs:  'bg-green-500',
  core:  'bg-yellow-500',
  other: 'bg-gray-400',
};

// Domain slug → tracks key mapping (engine resolves by slug)
const DOMAIN_PROGRAM_IDS: Record<string, string> = {
  pull: 'pulling',
  push: 'pushing',
  legs: 'legs',
  core: 'core',
};

function buildMockProfile(params: {
  level: number;
  persona: LifestylePersona | '';
  injuries: InjuryShieldArea[];
  domainLevels?: Record<string, number>;
  coldStart?: boolean;
  gear?: string[];
  activePrograms?: ActiveProgramItem[];
}): UserFullProfile {
  const { level, persona, injuries, domainLevels, coldStart, gear, activePrograms = [] } = params;

  // Cold Start: L1 everywhere, no persona, no gear
  const effectiveLevel   = coldStart ? 1 : level;
  const effectivePersona = coldStart ? '' : persona;
  const effectiveGear    = coldStart ? [] : (gear ?? ['pullup_bar', 'dip_bar', 'parallel_bars']);

  // ── Build tracks ──
  // 1. Domain fallback tracks (dual-keyed by slug and domain name)
  const domainTracks: Record<string, any> = {};
  if (!coldStart && domainLevels) {
    for (const [domain, lvl] of Object.entries(domainLevels)) {
      const slug = DOMAIN_PROGRAM_IDS[domain] ?? domain;
      const entry = { level: lvl, progressPercent: 50, startedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      domainTracks[slug] = entry;
      domainTracks[domain] = entry;
    }
  }

  // 2. Active programs from the Program Builder (take precedence, keyed by program ID)
  const programTracks: Record<string, any> = {};
  const activeProgramEntries = coldStart ? [] : activePrograms;
  for (const prog of activeProgramEntries) {
    programTracks[prog.id] = { level: prog.level, progressPercent: 50, startedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  }

  // Fall back to full_body if no specific programs
  const fallbackId = 'full_body';
  const primaryId = activeProgramEntries[0]?.id ?? fallbackId;

  const pullLevel = coldStart ? 1 : (domainLevels?.pull ?? effectiveLevel);
  const pushLevel = coldStart ? 1 : (domainLevels?.push ?? Math.max(1, effectiveLevel - 3));
  const legsLevel = coldStart ? 1 : (domainLevels?.legs ?? Math.max(1, effectiveLevel - 5));
  const coreLevel = coldStart ? 1 : (domainLevels?.core ?? Math.max(1, effectiveLevel - 7));

  return {
    id: 'simulator_user',
    core: {
      name: 'Simulator',
      initialFitnessTier: effectiveLevel > 15 ? 3 : effectiveLevel > 8 ? 2 : 1,
      trackingMode: 'performance',
      mainGoal: 'performance_boost',
      gender: 'male',
      weight: 75,
    },
    progression: {
      globalLevel: effectiveLevel,
      globalXP: effectiveLevel * 1000,
      avatarId: 'default',
      unlockedBadges: [],
      coins: 0,
      totalCaloriesBurned: 0,
      hasUnlockedAdvancedStats: false,
      daysActive: 100,
      lemurStage: 5,
      dailyStepGoal: 5000,
      dailyFloorGoal: 5,
      currentStreak: 10,
      goalHistory: [],
      domains: {
        upper_body: { currentLevel: Math.max(pullLevel, pushLevel), maxLevel: 25, isUnlocked: true },
        lower_body: { currentLevel: legsLevel, maxLevel: 25, isUnlocked: true },
        core:       { currentLevel: coreLevel, maxLevel: 25, isUnlocked: true },
        full_body:  { currentLevel: effectiveLevel, maxLevel: 25, isUnlocked: true },
      },
      activePrograms: activeProgramEntries.length > 0
        ? activeProgramEntries.map(p => ({
            id: p.id, templateId: p.id, name: p.name,
            startDate: new Date(), durationWeeks: 52, currentWeek: 4, focusDomains: [],
          }))
        : [{ id: primaryId, templateId: primaryId, name: primaryId, startDate: new Date(), durationWeeks: 52, currentWeek: 4, focusDomains: [] }],
      unlockedBonusExercises: [],
      tracks: {
        [primaryId]: { level: effectiveLevel, progressPercent: 50, startedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        ...domainTracks,
        ...programTracks,   // Program Builder tracks override domain tracks
      },
    },
    equipment: {
      home: effectiveGear,
      office: [],
      outdoor: effectiveGear,
    },
    lifestyle: {
      hasDog: false,
      commute: { method: 'car', enableChallenges: false },
      lifestyleTags: effectivePersona ? [effectivePersona] : [],
    },
    health: {
      injuries: injuries as string[],
      connectedWatch: 'none',
    },
    running: {} as any,
  };
}

// ── Variable substitution (simulate @variable injection) ──────────────────
function injectVariables(text: string, vars: Record<string, string>): string {
  let out = text;
  for (const [key, val] of Object.entries(vars)) {
    out = out.replace(new RegExp(`@${key}`, 'g'), val);
  }
  return out;
}

// ── Extract metadata bundle rejections from console logs ──────────────────
function extractMetadataAudit(logs: string[]): { rejected: string[]; selected: string[] } {
  const rejected: string[] = [];
  const selected: string[] = [];
  for (const line of logs) {
    if (line.includes('Rejected') || line.includes('hard-exclude') || line.includes('score=-1') || line.includes('PERSONA_GUARD')) {
      rejected.push(line);
    }
    if (line.includes('[Metadata]') && (line.includes('selected') || line.includes('best') || line.includes('score='))) {
      selected.push(line);
    }
  }
  return { rejected, selected };
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function WorkoutSimulatorPage() {
  // ── DB Data ──
  const [gearDefs, setGearDefs] = useState<GearDefinition[]>([]);
  const [gearLoading, setGearLoading] = useState(true);
  const [availablePrograms, setAvailablePrograms] = useState<Program[]>([]);
  const [programsLoading, setProgramsLoading] = useState(true);

  // ── Control Panel State ──
  const [availableTime, setAvailableTime] = useState(30);
  const [difficulty, setDifficulty] = useState<DifficultyLevel>(2);
  const [persona, setPersona] = useState<LifestylePersona | ''>('');
  const [location, setLocation] = useState<ExecutionLocation>('park');
  const [parkForce, setParkForce] = useState(true);
  const [injuries, setInjuries] = useState<InjuryShieldArea[]>([]);
  const [selectedGear, setSelectedGear] = useState<string[]>([]);
  const [daysInactive, setDaysInactive] = useState(0);

  // ── Program Builder ──
  const [activePrograms, setActivePrograms] = useState<ActiveProgramItem[]>([]);
  const [selectedProgramDrop, setSelectedProgramDrop] = useState('');
  const [newProgramLevel, setNewProgramLevel] = useState(10);

  // ── Multi-Domain Matrix (fallback when no programs specified) ──
  const [domainLevels, setDomainLevels] = useState<Record<string, number>>({
    pull: 19, push: 12, legs: 8, core: 5,
  });
  const [coldStart, setColdStart] = useState(false);

  // ── Derived: effective global level = max of active programs OR max domain level ──
  const effectiveUserLevel = useMemo(() => {
    if (coldStart) return 1;
    if (activePrograms.length > 0) return Math.max(...activePrograms.map(p => p.level));
    return Math.max(...Object.values(domainLevels), 1);
  }, [coldStart, activePrograms, domainLevels]);

  // ── View Options ──
  const [showBoltComparison, setShowBoltComparison] = useState(false);

  // ── Load DB data on mount ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [programs, gear] = await Promise.all([getAllPrograms(), getAllGearDefinitions()]);
        if (cancelled) return;
        const sorted = [...programs].sort((a, b) => a.name.localeCompare(b.name, 'he'));
        setAvailablePrograms(sorted);
        if (sorted.length > 0) setSelectedProgramDrop(sorted[0].id);
        setGearDefs([...gear].sort((a, b) => (a.name?.he || '').localeCompare(b.name?.he || '', 'he')));
      } catch (e) {
        console.error('[Simulator] Failed to load DB data:', e);
      } finally {
        if (!cancelled) {
          setProgramsLoading(false);
          setGearLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Output State ──
  const [trioResult, setTrioResult] = useState<HomeWorkoutTrioResult | null>(null);
  const [activeTab, setActiveTab] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    controls: true,
    results: true,
    reasoning: false,
    levelMap: true,
    metadata: true,
    boltComparison: true,
    metadataAudit: false,
  });

  const toggleSection = (key: string) =>
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));

  const toggleGear = (gearId: string) =>
    setSelectedGear(prev =>
      prev.includes(gearId) ? prev.filter(g => g !== gearId) : [...prev, gearId],
    );

  const toggleInjury = (area: InjuryShieldArea) =>
    setInjuries(prev =>
      prev.includes(area) ? prev.filter(a => a !== area) : [...prev, area],
    );

  const setDomainLevel = (domain: string, val: number) =>
    setDomainLevels(prev => ({ ...prev, [domain]: val }));

  // ── Program Builder helpers ──
  const addActiveProgram = () => {
    if (!selectedProgramDrop) return;
    const prog = availablePrograms.find(p => p.id === selectedProgramDrop);
    if (!prog) return;
    // Avoid duplicates
    if (activePrograms.some(p => p.id === selectedProgramDrop)) return;
    setActivePrograms(prev => [...prev, { id: prog.id, name: prog.name, level: newProgramLevel }]);
  };

  const removeActiveProgram = (id: string) =>
    setActivePrograms(prev => prev.filter(p => p.id !== id));

  const updateActiveProgramLevel = (id: string, level: number) =>
    setActivePrograms(prev => prev.map(p => p.id === id ? { ...p, level } : p));

  // ── Apply Cold Start Preset ──
  const applyColdStart = (active: boolean) => {
    setColdStart(active);
    if (active) {
      setPersona('');
      setSelectedGear([]);
      setDomainLevels({ pull: 1, push: 1, legs: 1, core: 1 });
      setActivePrograms([]);
      setDaysInactive(0);
    } else {
      setDomainLevels({ pull: 19, push: 12, legs: 8, core: 5 });
    }
  };

  // ── Run Simulation ──
  const runSimulation = useCallback(async () => {
    setLoading(true);
    setError(null);
    setConsoleLogs([]);

    const logs: string[] = [];
    const origLog = console.log;
    const origWarn = console.warn;
    const origGroup = console.group;
    const origGroupEnd = console.groupEnd;
    const capture = (...args: any[]) => {
      const line = args.map(a => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a))).join(' ');
      logs.push(line);
      origLog(...args);
    };
    console.log = capture;
    console.warn = (...args: any[]) => {
      const line = '⚠️ ' + args.map(a => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a))).join(' ');
      logs.push(line);
      origWarn(...args);
    };
    console.group = (...args: any[]) => {
      capture('▸', ...args);
    };
    console.groupEnd = () => {
      logs.push('◂ group end');
      origGroupEnd();
    };

    try {
      const profile = buildMockProfile({
        level: effectiveUserLevel,
        persona,
        injuries,
        domainLevels,
        coldStart,
        gear: selectedGear,
        activePrograms,
      });

      const options: HomeWorkoutOptions = {
        userProfile: profile,
        location,
        availableTime,
        difficulty,
        injuryOverride: injuries.length > 0 ? injuries : undefined,
        equipmentOverride: selectedGear.length > 0 ? selectedGear : undefined,
        daysInactiveOverride: daysInactive,
        personaOverride: persona ? (persona as LifestylePersona) : undefined,
        testLocation: parkForce ? undefined : location,
      };

      const result = await generateHomeWorkoutTrio(options);
      setTrioResult(result);
      setActiveTab(1);
    } catch (err: any) {
      setError(err.message || 'Simulation failed');
      console.error('[Simulator] Error:', err);
    } finally {
      console.log = origLog;
      console.warn = origWarn;
      console.group = origGroup;
      console.groupEnd = origGroupEnd;
      setConsoleLogs(logs);
      setLoading(false);
    }
  }, [availableTime, effectiveUserLevel, difficulty, persona, location, parkForce, injuries, selectedGear, daysInactive, domainLevels, coldStart, activePrograms]);

  // ── Helpers ──
  const activeWorkout: GeneratedWorkout | null =
    trioResult ? trioResult.options[activeTab]?.result?.workout ?? null : null;

  const exercisesByDomain = (exercises: WorkoutExercise[]) => {
    const grouped: Record<string, WorkoutExercise[]> = {};
    for (const ex of exercises) {
      const mg = ex.exercise.movementGroup ?? 'other';
      const domain = MG_TO_DOMAIN[mg] ?? 'other';
      (grouped[domain] ??= []).push(ex);
    }
    return grouped;
  };

  // Duration scaling reference
  const durationConfig =
    availableTime <= 10 ? { exercises: '2-3', accessories: false } :
    availableTime <= 30 ? { exercises: '4-5', accessories: false } :
    availableTime <= 45 ? { exercises: '6-8', accessories: true  } :
                          { exercises: '7-10', accessories: true  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900" dir="rtl">
      {/* ── Header ── */}
      <div className="border-b border-gray-200 bg-white/90 backdrop-blur sticky top-0 z-50 shadow-sm">
        <div className="max-w-[1440px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-[#2b6cb0] to-blue-400 rounded-xl flex items-center justify-center shadow-md">
              <Zap size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-gray-900">Master Workout Simulator</h1>
              <p className="text-xs text-gray-500">Full-pipeline trio generation with reasoning log</p>
            </div>
          </div>

          <button
            onClick={runSimulation}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-3 bg-[#2b6cb0] hover:bg-blue-700 text-white rounded-xl font-bold text-base disabled:opacity-50 disabled:cursor-wait transition-all shadow-md"
          >
            {loading ? <RotateCcw size={18} className="animate-spin" /> : <Play size={18} />}
            {loading ? 'Generating...' : 'Run Simulation'}
          </button>
        </div>
      </div>

      <div className="max-w-[1440px] mx-auto px-6 py-6">
        <div className="grid grid-cols-12 gap-6">

          {/* ════════════ LEFT: CONTROL PANEL ════════════ */}
          <div className="col-span-4 space-y-4">

            {/* Time */}
            <ControlCard icon={<Clock size={16} />} title="זמן זמין" badge={`${availableTime} דק׳ → ${durationConfig.exercises} תרגילים`}>
              <input
                type="range" min={5} max={60} step={5} value={availableTime}
                onChange={e => setAvailableTime(+e.target.value)}
                className="w-full accent-[#2b6cb0]"
              />
              <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                <span>5</span><span>15</span><span>30</span><span>45</span><span>60</span>
              </div>
              {durationConfig.accessories && (
                <span className="text-[10px] text-emerald-600 mt-1 block">+ Accessories included</span>
              )}
            </ControlCard>

            {/* Effective Level Indicator (computed, not editable) */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 size={16} className="text-[#2b6cb0]" />
                <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">רמת משתמש אפקטיבית</span>
              </div>
              <span className="text-lg font-black text-[#2b6cb0] font-mono">L{effectiveUserLevel}</span>
              <span className="text-[10px] text-gray-400">{activePrograms.length > 0 ? `מ-${activePrograms.length} תוכניות` : 'מ-Domain Matrix'}</span>
            </div>

            {/* Difficulty (Bolts) */}
            <ControlCard icon={<Zap size={16} />} title="Difficulty (Bolts)" badge={`⚡ ${difficulty}`}>
              <div className="grid grid-cols-3 gap-2">
                {([1, 2, 3] as DifficultyLevel[]).map(d => (
                  <button
                    key={d}
                    onClick={() => setDifficulty(d)}
                    className={`py-2.5 rounded-xl text-sm font-bold transition-all border ${
                      difficulty === d
                        ? d === 1 ? 'bg-green-600 border-green-600 text-white shadow-sm'
                        : d === 2 ? 'bg-amber-500 border-amber-500 text-white shadow-sm'
                        : 'bg-red-500 border-red-500 text-white shadow-sm'
                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {'⚡'.repeat(d)} {d === 1 ? 'Easy' : d === 2 ? 'Normal' : 'Intense'}
                  </button>
                ))}
              </div>
              <div className="mt-2 text-[10px] text-gray-400">
                {difficulty === 1 && 'levelDiff target: -2 to -1 (Flow / Easy tier)'}
                {difficulty === 2 && 'levelDiff target: 0 (Match tier — 3-6 reps)'}
                {difficulty === 3 && 'levelDiff target: +1 to +2 (Hard / Elite tier)'}
              </div>
            </ControlCard>

            {/* Location */}
            <ControlCard icon={<MapPin size={16} />} title="מיקום" badge={parkForce ? '🏞️ Park Force ON' : `📍 ${location}`}>
              <div className="flex items-center justify-between mb-3 p-2.5 rounded-lg bg-gray-100 border border-gray-200">
                <span className="text-xs text-gray-700 font-medium">Auto Park Force</span>
                <button
                  onClick={() => setParkForce(!parkForce)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    parkForce ? 'bg-emerald-500' : 'bg-gray-300'
                  }`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
                    parkForce ? 'right-0.5' : 'right-5'
                  }`} />
                </button>
              </div>
              <div className={`grid grid-cols-2 gap-1.5 ${parkForce ? 'opacity-40 pointer-events-none' : ''}`}>
                {LOCATION_OPTIONS.map(loc => (
                  <button
                    key={loc.value}
                    onClick={() => setLocation(loc.value)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                      location === loc.value
                        ? 'bg-[#2b6cb0] border-[#2b6cb0] text-white'
                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <span>{loc.icon}</span>
                    <span>{loc.label}</span>
                  </button>
                ))}
              </div>
              {parkForce && (
                <p className="text-[10px] text-emerald-400 mt-2">
                  Park Force: location locked to &apos;park&apos;. Toggle off to test other locations via testLocation bypass.
                </p>
              )}
            </ControlCard>

            {/* Equipment (live from DB) */}
            <ControlCard icon={<Wrench size={16} />} title="ציוד זמין" badge={`${selectedGear.length} פריטים`}>
              {gearLoading ? (
                <div className="flex items-center gap-2 py-2 text-xs text-gray-400">
                  <RotateCcw size={12} className="animate-spin" /> טוען ציוד מה-DB...
                </div>
              ) : gearDefs.length === 0 ? (
                <p className="text-xs text-gray-400 italic">אין ציוד ב-DB — בדוק את אוסף gear_definitions</p>
              ) : (
                <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                  {gearDefs.map(g => (
                    <label key={g.id} className="flex items-center gap-2 cursor-pointer py-0.5">
                      <input
                        type="checkbox"
                        checked={selectedGear.includes(g.id)}
                        onChange={() => toggleGear(g.id)}
                        className="rounded border-gray-300 bg-white text-[#2b6cb0] focus:ring-blue-300"
                      />
                      <span className="text-xs text-gray-700">
                        {g.name?.he || g.name?.en || g.id}
                        {g.name?.en && g.name?.he && (
                          <span className="text-gray-400 ml-1">({g.name.en})</span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              )}
              {selectedGear.length > 0 && (
                <button
                  onClick={() => setSelectedGear([])}
                  className="mt-2 text-[10px] text-gray-400 hover:text-gray-600"
                >
                  נקה הכל
                </button>
              )}
            </ControlCard>

            {/* Persona */}
            <ControlCard icon={<User size={16} />} title="פרסונה" badge={PERSONA_OPTIONS.find(p => p.value === persona)?.label ?? 'ללא'}>
              <div className="grid grid-cols-2 gap-1.5">
                {PERSONA_OPTIONS.map(p => (
                  <button
                    key={p.value}
                    onClick={() => setPersona(p.value as any)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      persona === p.value
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <span>{p.icon}</span>
                    <span>{p.label}</span>
                  </button>
                ))}
              </div>
            </ControlCard>

            {/* Injury Shield */}
            <ControlCard icon={<Shield size={16} />} title="Injury Shield" badge={injuries.length > 0 ? `${injuries.length} areas` : 'None'}>
              <div className="flex flex-wrap gap-1.5">
                {INJURY_AREAS.map(a => (
                  <button
                    key={a.value}
                    onClick={() => toggleInjury(a.value)}
                    className={`px-2 py-1 rounded-lg text-xs font-medium transition-all ${
                      injuries.includes(a.value)
                        ? 'bg-red-500 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </ControlCard>

            {/* ── Multi-Domain Level Matrix ── */}
            <ControlCard icon={<Layers size={16} />} title="Domain Level Matrix (David Test)"
              badge={coldStart ? '🧊 Cold Start' : undefined}
            >
              {/* Cold Start Toggle */}
              <div className="flex items-center justify-between mb-3 p-2 rounded-lg bg-blue-50 border border-blue-200">
                <div className="flex items-center gap-2">
                  <Snowflake size={14} className="text-[#2b6cb0]" />
                  <span className="text-xs text-gray-700 font-medium">Cold Start (L1 everywhere)</span>
                </div>
                <button
                  onClick={() => applyColdStart(!coldStart)}
                  className={`relative w-10 h-5 rounded-full transition-colors ${coldStart ? 'bg-[#2b6cb0]' : 'bg-gray-300'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${coldStart ? 'right-0.5' : 'right-5'}`} />
                </button>
              </div>

              {/* Per-domain sliders */}
              <div className={`space-y-3 ${coldStart ? 'opacity-40 pointer-events-none' : ''}`}>
                {(['pull', 'push', 'legs', 'core'] as const).map(domain => {
                  const colors: Record<string, string> = { pull: 'accent-blue-500', push: 'accent-red-500', legs: 'accent-green-500', core: 'accent-yellow-500' };
                  const labels: Record<string, string> = { pull: '🔵 Pull', push: '🔴 Push', legs: '🟢 Legs', core: '🟡 Core' };
                  return (
                    <div key={domain}>
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span className="font-medium">{labels[domain]}</span>
                        <span className="font-mono font-bold text-gray-800">L{domainLevels[domain]}</span>
                      </div>
                      <input
                        type="range" min={1} max={25} value={domainLevels[domain]}
                        onChange={e => setDomainLevel(domain, +e.target.value)}
                        className={`w-full h-1.5 rounded-full ${colors[domain]}`}
                      />
                    </div>
                  );
                })}
              </div>

              {/* Quick presets */}
              <div className="flex gap-1.5 mt-3">
                <button
                  onClick={() => setDomainLevels({ pull: 19, push: 12, legs: 8, core: 5 })}
                  className="flex-1 text-[10px] py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 font-medium"
                >
                  David (L19 Pull)
                </button>
                <button
                  onClick={() => setDomainLevels({ pull: 8, push: 8, legs: 8, core: 8 })}
                  className="flex-1 text-[10px] py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200 font-medium"
                >
                  Balanced L8
                </button>
                <button
                  onClick={() => setDomainLevels({ pull: 5, push: 3, legs: 1, core: 1 })}
                  className="flex-1 text-[10px] py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200 font-medium"
                >
                  Beginner
                </button>
              </div>
            </ControlCard>

            {/* Days Inactive */}
            <ControlCard icon={<Dumbbell size={16} />} title="Training Context" badge={`${daysInactive} ימים לא פעיל`}>
              <label className="text-xs text-gray-500 mb-1 block">ימים לא פעיל: {daysInactive}</label>
              <input
                type="range" min={0} max={30} value={daysInactive}
                onChange={e => setDaysInactive(+e.target.value)}
                className="w-full accent-[#2b6cb0]"
              />
            </ControlCard>

            {/* ── Program Builder ── */}
            <ControlCard icon={<ListChecks size={16} />} title="בונה תוכניות (Program Builder)"
              badge={activePrograms.length > 0 ? `${activePrograms.length} תוכניות` : 'ריק → full_body'}
            >
              {programsLoading ? (
                <div className="flex items-center gap-2 py-2 text-xs text-gray-400">
                  <RotateCcw size={12} className="animate-spin" /> טוען תוכניות מה-DB...
                </div>
              ) : (
                <>
                  {/* Dropdown + Level Slider + Add Button */}
                  <div className="space-y-2 mb-3">
                    <div className="flex gap-2">
                      <select
                        value={selectedProgramDrop}
                        onChange={e => setSelectedProgramDrop(e.target.value)}
                        className="flex-1 px-2 py-1.5 bg-white border border-gray-300 rounded-lg text-xs text-gray-800 min-w-0"
                        dir="rtl"
                      >
                        {availablePrograms.map(p => (
                          <option key={p.id} value={p.id}>{p.name} ({p.movementPattern ?? 'master'})</option>
                        ))}
                      </select>
                      <button
                        onClick={addActiveProgram}
                        disabled={!selectedProgramDrop}
                        className="flex items-center gap-1 px-3 py-1.5 bg-[#2b6cb0] hover:bg-blue-700 text-white rounded-lg text-xs font-bold disabled:opacity-40 shrink-0"
                      >
                        <Plus size={13} /> הוסף
                      </button>
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                        <span>רמה לתוכנית הנבחרת</span>
                        <span className="font-mono font-bold text-gray-800">L{newProgramLevel}</span>
                      </div>
                      <input
                        type="range" min={1} max={25} value={newProgramLevel}
                        onChange={e => setNewProgramLevel(+e.target.value)}
                        className="w-full accent-[#2b6cb0]"
                      />
                    </div>
                  </div>

                  {/* Active Programs List */}
                  {activePrograms.length === 0 ? (
                    <p className="text-[10px] text-gray-400 italic text-center py-2 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                      אין תוכניות — הסימולטור ישתמש ב-full_body כברירת מחדל
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {activePrograms.map(prog => (
                        <div key={prog.id} className="bg-white border border-gray-200 rounded-lg p-2.5">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-bold text-gray-800 truncate">{prog.name}</span>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-xs font-mono font-bold text-[#2b6cb0]">L{prog.level}</span>
                              <button
                                onClick={() => removeActiveProgram(prog.id)}
                                className="text-gray-300 hover:text-red-500 transition-colors"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                          <input
                            type="range" min={1} max={25} value={prog.level}
                            onChange={e => updateActiveProgramLevel(prog.id, +e.target.value)}
                            className="w-full accent-[#2b6cb0] h-1"
                          />
                        </div>
                      ))}
                      <button
                        onClick={() => setActivePrograms([])}
                        className="w-full text-[10px] text-gray-400 hover:text-red-500 py-1 transition-colors"
                      >
                        נקה הכל
                      </button>
                    </div>
                  )}
                </>
              )}
            </ControlCard>

            {/* View Options */}
            <ControlCard icon={<SplitSquareHorizontal size={16} />} title="View Options">
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-gray-100 border border-gray-200">
                <span className="text-xs text-gray-700">Multi-Bolt Side-by-Side</span>
                <button
                  onClick={() => setShowBoltComparison(!showBoltComparison)}
                  className={`relative w-10 h-5 rounded-full transition-colors ${showBoltComparison ? 'bg-emerald-500' : 'bg-gray-300'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${showBoltComparison ? 'right-0.5' : 'right-5'}`} />
                </button>
              </div>
            </ControlCard>
          </div>

          {/* ════════════ RIGHT: OUTPUT ════════════ */}
          <div className="col-span-8 space-y-4">

            {/* Error */}
            {error && (
              <div className="bg-red-900/40 border border-red-700 rounded-xl p-4 flex items-center gap-3">
                <AlertTriangle size={20} className="text-red-400 flex-shrink-0" />
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}

            {/* No results yet */}
            {!trioResult && !loading && (
              <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center shadow-sm">
                <Zap size={48} className="mx-auto text-gray-300 mb-4" />
                <h2 className="text-lg font-bold text-gray-500">Configure & Run</h2>
                <p className="text-sm text-gray-400 mt-2">Adjust the controls on the left, then click &quot;Run Simulation&quot; to generate a full workout trio.</p>
              </div>
            )}

            {/* Loading */}
            {loading && (
              <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center shadow-sm">
                <RotateCcw size={40} className="mx-auto text-[#2b6cb0] animate-spin mb-4" />
                <h2 className="text-lg font-bold text-gray-700">Generating Trio...</h2>
                <p className="text-sm text-gray-400 mt-1">Running full pipeline with {availableTime}min, L{effectiveUserLevel}, Bolt {difficulty}</p>
              </div>
            )}

            {/* ── Results ── */}
            {trioResult && !loading && (
              <>
                {/* Trio Tabs */}
                <div className="flex gap-2">
                  {trioResult.options.map((opt, i) => {
                    const workout = opt.result.workout;
                    const totalSets = workout.exercises.reduce((s, e) => s + e.sets, 0);
                    const mainEx = workout.exercises.filter(e => e.exerciseRole !== 'warmup' && e.exerciseRole !== 'cooldown');
                    return (
                      <button
                        key={i}
                        onClick={() => setActiveTab(i)}
                        className={`flex-1 rounded-xl p-3 transition-all text-right ${
                          activeTab === i
                            ? 'bg-blue-50 border border-[#2b6cb0]/40 shadow-sm'
                            : 'bg-white border border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            i === 0 ? 'bg-green-100 text-green-700' :
                            i === 1 ? 'bg-amber-100 text-amber-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {'⚡'.repeat(i + 1)}
                          </span>
                          <span className="text-xs text-gray-400">Option {i + 1}</span>
                        </div>
                        <p className="text-sm font-bold text-gray-800 truncate">{opt.label}</p>
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-500">
                          <span>{mainEx.length} exercises</span>
                          <span>{totalSets} sets</span>
                          <span>{workout.estimatedDuration}min</span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Active Workout Detail */}
                {activeWorkout && (
                  <>
                    {/* Stats Row */}
                    <div className="grid grid-cols-5 gap-3">
                      <StatCard label="Exercises" value={activeWorkout.exercises.filter(e => e.exerciseRole !== 'warmup' && e.exerciseRole !== 'cooldown').length} />
                      <StatCard label="Total Sets" value={activeWorkout.totalPlannedSets} />
                      <StatCard label="Est. Duration" value={`${activeWorkout.estimatedDuration}m`} />
                      <StatCard label="Structure" value={activeWorkout.structure} />
                      <StatCard label="Bolt" value={`${'⚡'.repeat(activeWorkout.difficulty)} ${activeWorkout.difficulty}`} />
                    </div>

                    {/* Volume Adjustment */}
                    {activeWorkout.volumeAdjustment && activeWorkout.volumeAdjustment.reductionPercent > 0 && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-3">
                        <RotateCcw size={16} className="text-amber-600" />
                        <span className="text-sm text-amber-700">
                          {activeWorkout.volumeAdjustment.badge || 'Volume Reduced'} — {activeWorkout.volumeAdjustment.originalSets} → {activeWorkout.volumeAdjustment.adjustedSets} sets ({activeWorkout.volumeAdjustment.reason})
                        </span>
                      </div>
                    )}

                    {/* Exercise Table */}
                    <SectionToggle
                      title="Exercise List"
                      icon={<Dumbbell size={16} />}
                      expanded={expandedSections.results}
                      onToggle={() => toggleSection('results')}
                    >
                      <div className="overflow-hidden rounded-xl border border-gray-200">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-gray-50 text-gray-500 text-xs border-b border-gray-200">
                              <th className="py-2 px-3 text-right">#</th>
                              <th className="py-2 px-3 text-right">Exercise</th>
                              <th className="py-2 px-3 text-center">Level</th>
                              <th className="py-2 px-3 text-center">Domain</th>
                              <th className="py-2 px-3 text-center">MG</th>
                              <th className="py-2 px-3 text-center">Sets × Reps</th>
                              <th className="py-2 px-3 text-center">Rest</th>
                              <th className="py-2 px-3 text-center">Tier</th>
                              <th className="py-2 px-3 text-center">Score</th>
                            </tr>
                          </thead>
                          <tbody>
                            {activeWorkout.exercises
                              .filter(e => e.exerciseRole !== 'warmup' && e.exerciseRole !== 'cooldown')
                              .map((ex, idx) => {
                                const mg = ex.exercise.movementGroup ?? 'other';
                                const domain = MG_TO_DOMAIN[mg] ?? 'other';
                                const domainColor = DOMAIN_COLORS[domain] ?? DOMAIN_COLORS.other;
                                return (
                                  <tr key={ex.exercise.id} className="border-t border-gray-100 hover:bg-gray-50">
                                    <td className="py-2 px-3 text-gray-400 font-mono text-xs">{idx + 1}</td>
                                    <td className="py-2 px-3">
                                      <div className="font-medium text-gray-800">{getLocalizedText(ex.exercise.name)}</div>
                                      <div className="text-[10px] text-gray-400 mt-0.5">
                                        {ex.priority} • {ex.mechanicalType}
                                        {ex.isOverLevel && <span className="text-amber-600 mr-1"> overLevel</span>}
                                      </div>
                                    </td>
                                    <td className="py-2 px-3 text-center">
                                      <span className="px-2 py-0.5 rounded text-xs font-bold bg-indigo-100 text-indigo-700">
                                        L{ex.programLevel ?? '?'}
                                      </span>
                                    </td>
                                    <td className="py-2 px-3 text-center">
                                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold text-white ${domainColor}`}>
                                        {domain}
                                      </span>
                                    </td>
                                    <td className="py-2 px-3 text-center text-[10px] text-gray-500 font-mono">{mg}</td>
                                    <td className="py-2 px-3 text-center font-mono">
                                      <span className="font-bold text-gray-800">
                                        {ex.sets} ×{' '}
                                        {ex.repsRange && ex.repsRange.min !== ex.repsRange.max
                                          ? `${ex.repsRange.min}-${ex.repsRange.max}`
                                          : ex.reps}
                                        {' '}{ex.isTimeBased ? 'שניות' : 'חזרות'}
                                      </span>
                                    </td>
                                    <td className="py-2 px-3 text-center text-gray-500 font-mono text-xs">{ex.restSeconds}s</td>
                                    <td className="py-2 px-3 text-center">
                                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                        ex.tier === 'elite' ? 'bg-purple-100 text-purple-700' :
                                        ex.tier === 'hard'  ? 'bg-red-100 text-red-700' :
                                        ex.tier === 'match' ? 'bg-blue-100 text-blue-700' :
                                        ex.tier === 'easy'  ? 'bg-green-100 text-green-700' :
                                        'bg-gray-100 text-gray-500'
                                      }`}>
                                        {ex.tier ?? '-'}
                                      </span>
                                    </td>
                                    <td className="py-2 px-3 text-center text-gray-700 font-bold">{ex.score}</td>
                                  </tr>
                                );
                              })}
                          </tbody>
                        </table>
                      </div>
                    </SectionToggle>

                    {/* Visual Level Map */}
                    <SectionToggle
                      title="Visual Level Map"
                      icon={<BarChart3 size={16} />}
                      expanded={expandedSections.levelMap}
                      onToggle={() => toggleSection('levelMap')}
                    >
                      <LevelMapChart
                        exercises={activeWorkout.exercises.filter(e => e.exerciseRole !== 'warmup' && e.exerciseRole !== 'cooldown')}
                        userLevel={effectiveUserLevel}
                      />
                    </SectionToggle>

                    {/* ── Metadata & Text Verification ── */}
                    <SectionToggle
                      title="Metadata & Communications Panel"
                      icon={<MessageSquare size={16} />}
                      expanded={expandedSections.metadata}
                      onToggle={() => toggleSection('metadata')}
                    >
                      <MetadataPanel
                        workout={activeWorkout}
                        optionLabel={trioResult!.options[activeTab]?.label ?? ''}
                        availableTime={availableTime}
                        userLevel={effectiveUserLevel}
                        persona={persona}
                        location={location}
                      />
                    </SectionToggle>

                    {/* ── Bolt Comparison ── */}
                    {showBoltComparison && (
                      <SectionToggle
                        title="Multi-Bolt Comparison (⚡ vs ⚡⚡ vs ⚡⚡⚡)"
                        icon={<SplitSquareHorizontal size={16} />}
                        expanded={expandedSections.boltComparison}
                        onToggle={() => toggleSection('boltComparison')}
                      >
                        <BoltComparison
                          options={trioResult!.options}
                          userLevel={effectiveUserLevel}
                        />
                      </SectionToggle>
                    )}

                    {/* Pipeline Reasoning Log */}
                    <SectionToggle
                      title="Pipeline Reasoning Log"
                      icon={<FileText size={16} />}
                      expanded={expandedSections.reasoning}
                      onToggle={() => toggleSection('reasoning')}
                      badge={activeWorkout.pipelineLog?.length ?? 0}
                    >
                      {activeWorkout.pipelineLog && activeWorkout.pipelineLog.length > 0 ? (
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 font-mono text-xs text-gray-700 max-h-[400px] overflow-y-auto space-y-1">
                          {activeWorkout.pipelineLog.map((line, i) => (
                            <div key={i} className={`${
                              line.includes('david_rule') || line.includes('DavidRule') ? 'text-amber-700' :
                              line.includes('horizontal_guarantee') ? 'text-[#2b6cb0]' :
                              line.includes('weekly_guard') || line.includes('set_cap') ? 'text-purple-700' :
                              line.includes('rescued') || line.includes('swapped') ? 'text-emerald-700' :
                              'text-gray-600'
                            }`}>
                              <span className="text-gray-300 select-none">{String(i + 1).padStart(3, ' ')} │ </span>
                              {line}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-400 italic">No pipeline log available.</p>
                      )}
                    </SectionToggle>

                    {/* Per-Exercise Reasoning */}
                    <SectionToggle
                      title="Per-Exercise Reasoning"
                      icon={<CheckCircle2 size={16} />}
                      expanded={false}
                      onToggle={() => toggleSection('perExReasoning')}
                    >
                      {expandedSections.perExReasoning && (
                        <div className="space-y-2">
                          {activeWorkout.exercises
                            .filter(e => e.exerciseRole !== 'warmup' && e.exerciseRole !== 'cooldown')
                            .map((ex, idx) => (
                              <div key={ex.exercise.id} className="bg-white rounded-lg p-3 border border-gray-200">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xs font-bold text-gray-400">#{idx + 1}</span>
                                  <span className="text-sm font-bold text-gray-800">{getLocalizedText(ex.exercise.name)}</span>
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {ex.reasoning.map((r, ri) => (
                                    <span key={ri} className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                                      r.includes('david_rule') ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                                      r.includes('horizontal') ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                                      r.includes('jitter') ? 'bg-gray-100 text-gray-400' :
                                      r.includes('synergy') ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                      'bg-gray-100 text-gray-500'
                                    }`}>
                                      {r}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ))}
                        </div>
                      )}
                    </SectionToggle>
                  </>
                )}

                {/* Console Capture */}
                {consoleLogs.length > 0 && (
                  <SectionToggle
                    title="Console Output (captured)"
                    icon={<FileText size={16} />}
                    expanded={false}
                    onToggle={() => toggleSection('console')}
                    badge={consoleLogs.length}
                  >
                    {expandedSections.console && (
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 font-mono text-[11px] text-gray-700 max-h-[500px] overflow-y-auto whitespace-pre-wrap">
                        {consoleLogs.map((line, i) => (
                          <div key={i} className={`${
                            line.includes('PARK FORCE') ? 'text-emerald-700' :
                            line.includes('DavidRule') || line.includes('david_rule') ? 'text-amber-700' :
                            line.includes('HorizontalGuarantee') ? 'text-[#2b6cb0]' :
                            line.includes('Error') || line.includes('⚠️') ? 'text-red-600' :
                            line.includes('CoreFloor') ? 'text-purple-700' :
                            'text-gray-500'
                          }`}>
                            {line}
                          </div>
                        ))}
                      </div>
                    )}
                  </SectionToggle>
                )}

                {/* ── Metadata Blacklist Audit ── */}
                {consoleLogs.length > 0 && (() => {
                  const audit = extractMetadataAudit(consoleLogs);
                  return (
                    <SectionToggle
                      title="Metadata Blacklist Audit"
                      icon={<Target size={16} />}
                      expanded={expandedSections.metadataAudit}
                      onToggle={() => toggleSection('metadataAudit')}
                      badge={audit.rejected.length}
                    >
                      <div className="space-y-3">
                        {audit.rejected.length > 0 ? (
                          <div>
                            <p className="text-[10px] font-bold text-red-400 uppercase tracking-wide mb-1.5">
                              🚫 Rejected Bundles ({audit.rejected.length})
                            </p>
                            <div className="bg-red-50 border border-red-100 rounded-lg p-3 font-mono text-[11px] text-red-700 space-y-1 max-h-[200px] overflow-y-auto">
                              {audit.rejected.map((line, i) => (
                                <div key={i}>{line}</div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400 italic">
                            No bundle rejections logged. Add <code className="bg-gray-100 border border-gray-200 px-1 rounded">console.log</code> in scoreContentRow for detailed audit.
                          </p>
                        )}
                        {audit.selected.length > 0 && (
                          <div>
                            <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-wide mb-1.5">
                              ✅ Selected Bundles ({audit.selected.length})
                            </p>
                            <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 font-mono text-[11px] text-emerald-700 space-y-1 max-h-[150px] overflow-y-auto">
                              {audit.selected.map((line, i) => (
                                <div key={i}>{line}</div>
                              ))}
                            </div>
                          </div>
                        )}
                        {/* Persona guard summary */}
                        <div className="p-2.5 rounded-lg bg-gray-50 border border-gray-200">
                          <p className="text-[10px] text-gray-500 font-medium">
                            Persona filter active: <span className={persona ? 'text-purple-400' : 'text-amber-400'}>{persona || 'None (hard-excluding mom_, snr_, pup_ bundles)'}</span>
                          </p>
                          <p className="text-[10px] text-gray-500 mt-0.5">
                            Location: <span className="text-[#2b6cb0] font-medium">{location}</span> •
                            Cold Start: <span className={coldStart ? 'text-[#2b6cb0] font-medium' : 'text-gray-400'}>{coldStart ? 'Yes' : 'No'}</span>
                          </p>
                        </div>
                      </div>
                    </SectionToggle>
                  );
                })()}

                {/* Meta */}
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Generation Meta</h4>
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div><span className="text-gray-500">Location:</span> <span className="text-gray-700 font-medium">{trioResult.meta.location}</span></div>
                    <div><span className="text-gray-500">Persona:</span> <span className="text-gray-700 font-medium">{trioResult.meta.persona || 'None'}</span></div>
                    <div><span className="text-gray-500">Days Inactive:</span> <span className="text-gray-700 font-medium">{trioResult.meta.daysInactive}</span></div>
                    <div><span className="text-gray-500">Time of Day:</span> <span className="text-gray-700 font-medium">{trioResult.meta.timeOfDay}</span></div>
                    <div><span className="text-gray-500">Exercises Considered:</span> <span className="text-gray-700 font-medium">{trioResult.meta.exercisesConsidered}</span></div>
                    <div><span className="text-gray-500">Excluded:</span> <span className="text-gray-700 font-medium">{trioResult.meta.exercisesExcluded}</span></div>
                    <div><span className="text-gray-500">Labels Source:</span> <span className="text-gray-700 font-medium">{trioResult.labelsSource}</span></div>
                    <div><span className="text-gray-500">Rest Day:</span> <span className="text-gray-700 font-medium">{trioResult.isRestDay ? 'Yes' : 'No'}</span></div>
                    <div><span className="text-gray-500">Domain Matrix:</span> <span className="text-gray-700 font-medium font-mono text-[10px]">
                      Pull L{domainLevels.pull} / Push L{domainLevels.push} / Legs L{domainLevels.legs} / Core L{domainLevels.core}
                    </span></div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function ControlCard({
  icon, title, badge, children,
}: {
  icon: React.ReactNode; title: string; badge?: string; children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide flex items-center gap-2">
          <span className="text-[#2b6cb0]">{icon}</span>
          {title}
        </h3>
        {badge && <span className="text-[10px] text-gray-400 font-mono">{badge}</span>}
      </div>
      {children}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 text-center shadow-sm">
      <div className="text-lg font-black text-gray-900">{value}</div>
      <div className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</div>
    </div>
  );
}

function SectionToggle({
  title, icon, expanded, onToggle, badge, children,
}: {
  title: string; icon: React.ReactNode; expanded: boolean; onToggle: () => void; badge?: number; children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-[#2b6cb0]">{icon}</span>
          <span className="text-sm font-bold text-gray-700">{title}</span>
          {badge !== undefined && (
            <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-mono">{badge}</span>
          )}
        </div>
        {expanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
      </button>
      {expanded && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

// ── MetadataPanel ─────────────────────────────────────────────────────────────
function MetadataPanel({
  workout,
  optionLabel,
  availableTime,
  userLevel,
  persona,
  location,
}: {
  workout: GeneratedWorkout;
  optionLabel: string;
  availableTime: number;
  userLevel: number;
  persona: string;
  location: string;
}) {
  const vars: Record<string, string> = {
    שם: 'Simulator',
    name: 'Simulator',
    זמן_אימון: `${availableTime}`,
    duration: `${availableTime}`,
    רמה_הבאה: `${userLevel + 1}`,
    level: `${userLevel}`,

    שם_תוכנית: workout.title || 'Full Body',
    program: workout.title || 'Full Body',
    קטגוריה: 'כוח',
    מיקוד: workout.exercises[0] ? getLocalizedText((workout.exercises[0] as any).exercise?.name) : '',
    מיקום: location,
  };

  const resolvedTitle    = injectVariables(workout.title || '', vars);
  const resolvedDesc     = injectVariables(workout.description || '', vars);
  const resolvedLogicCue = injectVariables(workout.logicCue || '', vars);

  // Push notification simulation
  const notifTitle = resolvedTitle || 'האימון היומי שלך מוכן!';
  const notifBody  = resolvedDesc
    ? resolvedDesc.slice(0, 80) + (resolvedDesc.length > 80 ? '…' : '')
    : `${availableTime} דקות • ${workout.exercises.length} תרגילים • רמה ${userLevel}`;

  // Coach tips — top 3 exercises' goals/descriptions
  const coachTips = workout.exercises
    .filter(e => e.exerciseRole !== 'warmup' && e.exerciseRole !== 'cooldown')
    .slice(0, 3)
    .map(e => {
      const goal = (e.exercise as any).content?.goal || '';
      const desc = (e.exercise as any).content?.description;
      const descText = typeof desc === 'string' ? desc : (desc as any)?.he || '';
      return { name: getLocalizedText(e.exercise.name), tip: goal || descText || '—' };
    });

  return (
    <div className="space-y-4">
      {/* Title / Description / LogicCue */}
      <div className="grid grid-cols-1 gap-3">
        <div className="bg-blue-50 rounded-xl p-3 border border-blue-200">
          <p className="text-[10px] font-bold text-[#2b6cb0] uppercase tracking-wide mb-1 flex items-center gap-1.5">
            <BookOpen size={11} /> כותרת אימון
          </p>
          <p className="text-sm font-bold text-gray-900">{resolvedTitle || '(ריק)'}</p>
          {optionLabel && optionLabel !== resolvedTitle && (
            <p className="text-[10px] text-gray-400 mt-1">Option Label: {optionLabel}</p>
          )}
        </div>

        <div className="bg-purple-50 rounded-xl p-3 border border-purple-200">
          <p className="text-[10px] font-bold text-purple-700 uppercase tracking-wide mb-1">תיאור</p>
          <p className="text-xs text-gray-700 leading-relaxed">{resolvedDesc || '(ריק)'}</p>
        </div>

        <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-200">
          <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide mb-1 flex items-center gap-1.5">
            <Zap size={11} /> Coach Cue (LogicCue)
          </p>
          <p className="text-xs text-emerald-800 leading-relaxed">{resolvedLogicCue || '(לא הוגדר)'}</p>
        </div>
      </div>

      {/* @Variable injection reference */}
      <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">Variable Injection Map</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[10px]">
          {Object.entries(vars).map(([key, val]) => (
            <div key={key} className="flex items-center gap-2">
              <span className="text-amber-600 font-bold">@{key}</span>
              <span className="text-gray-400">→</span>
              <span className="text-gray-700 truncate">{val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Push Notification Preview */}
      <div>
        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
          <Bell size={11} /> Push Notification Preview
        </p>
        <div className="bg-gray-100 rounded-2xl p-4 border border-gray-200 shadow-sm max-w-sm mx-auto">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-[#2b6cb0] to-blue-400 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm">
              <Zap size={18} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">OUT-RUN</span>
                <span className="text-[10px] text-gray-400">עכשיו</span>
              </div>
              <p className="text-sm font-bold text-gray-900 mt-0.5 leading-snug" dir="rtl">{notifTitle}</p>
              <p className="text-xs text-gray-600 mt-0.5 leading-relaxed" dir="rtl">{notifBody}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Coach Tips */}
      {coachTips.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Target size={11} /> Coach Tips (per exercise goal)
          </p>
          <div className="space-y-2">
            {coachTips.map((tip, i) => (
              <div key={i} className="flex gap-3 bg-white rounded-lg p-2.5 border border-gray-200">
                <span className="w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                  {i + 1}
                </span>
                <div>
                  <p className="text-xs font-bold text-gray-800">{tip.name}</p>
                  <p className="text-[11px] text-gray-600 leading-relaxed" dir="rtl">{tip.tip}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── BoltComparison ────────────────────────────────────────────────────────────
function BoltComparison({
  options,
  userLevel,
}: {
  options: HomeWorkoutTrioResult['options'];
  userLevel: number;
}) {
  const boltColors = [
    { bg: 'bg-green-50',  border: 'border-green-200', text: 'text-green-700', badge: 'bg-green-100' },
    { bg: 'bg-amber-50',  border: 'border-amber-200', text: 'text-amber-700', badge: 'bg-amber-100' },
    { bg: 'bg-red-50',    border: 'border-red-200',   text: 'text-red-700',   badge: 'bg-red-100' },
  ];

  return (
    <div className="space-y-4">
      {/* Header comparison */}
      <div className="grid grid-cols-3 gap-3">
        {options.map((opt, i) => {
          const c = boltColors[i];
          const workout = opt.result.workout;
          const mainEx = workout.exercises.filter(e => e.exerciseRole !== 'warmup' && e.exerciseRole !== 'cooldown');
          const totalSets = workout.exercises.reduce((s, e) => s + e.sets, 0);
          const avgLevel  = mainEx.length > 0
            ? Math.round(mainEx.reduce((s, e) => s + (e.programLevel ?? 0), 0) / mainEx.length)
            : 0;
          const levelGap  = avgLevel - userLevel;
          return (
            <div key={i} className={`${c.bg} ${c.border} border rounded-xl p-3`}>
              <div className={`text-[10px] font-bold ${c.text} mb-1`}>{'⚡'.repeat(i + 1)} Option {i + 1}</div>
              <p className="text-xs font-bold text-gray-800 mb-2 truncate">{opt.label}</p>
              <div className="space-y-1 text-[10px] text-gray-500">
                <div className="flex justify-between"><span>Exercises</span><span className="text-gray-800 font-mono">{mainEx.length}</span></div>
                <div className="flex justify-between"><span>Total Sets</span><span className="text-gray-800 font-mono">{totalSets}</span></div>
                <div className="flex justify-between"><span>Avg Level</span><span className={`font-mono font-bold ${levelGap > 2 ? 'text-red-600' : levelGap >= -2 ? 'text-emerald-600' : 'text-blue-600'}`}>L{avgLevel} ({levelGap >= 0 ? '+' : ''}{levelGap})</span></div>
                <div className="flex justify-between"><span>Duration</span><span className="text-gray-800 font-mono">{workout.estimatedDuration}m</span></div>
                <div className="flex justify-between"><span>Structure</span><span className="text-gray-800 font-mono text-[9px]">{workout.structure}</span></div>
              </div>
              {/* Messaging */}
              <div className="mt-2 pt-2 border-t border-gray-200">
                <p className="text-[9px] text-gray-400 font-bold uppercase mb-1">Messaging</p>
                <p className="text-[10px] text-gray-700 font-bold leading-snug" dir="rtl">{workout.title || '—'}</p>
                <p className="text-[10px] text-gray-500 leading-snug mt-0.5" dir="rtl">{(workout.logicCue || '').slice(0, 60)}{(workout.logicCue || '').length > 60 ? '…' : ''}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Exercise comparison table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 text-gray-500 text-[10px] border-b border-gray-200">
              <th className="py-2 px-3 text-right">#</th>
              {options.map((_, i) => (
                <th key={i} className={`py-2 px-3 ${boltColors[i].text}`}>
                  {'⚡'.repeat(i + 1)} Option {i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: Math.max(...options.map(o => o.result.workout.exercises.filter(e => e.exerciseRole !== 'warmup' && e.exerciseRole !== 'cooldown').length)) }).map((_, rowIdx) => (
              <tr key={rowIdx} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="py-1.5 px-3 text-gray-400 font-mono">{rowIdx + 1}</td>
                {options.map((opt, i) => {
                  const mainEx = opt.result.workout.exercises.filter(e => e.exerciseRole !== 'warmup' && e.exerciseRole !== 'cooldown');
                  const ex = mainEx[rowIdx];
                  if (!ex) return <td key={i} className="py-1.5 px-3 text-gray-300 text-center">—</td>;
                  const gap = (ex.programLevel ?? 0) - userLevel;
                  return (
                    <td key={i} className="py-1.5 px-3">
                      <div className="font-medium text-gray-800">{getLocalizedText(ex.exercise.name)}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`text-[9px] font-mono font-bold ${gap > 2 ? 'text-red-600' : gap >= -2 ? 'text-emerald-600' : 'text-blue-600'}`}>
                          L{ex.programLevel ?? '?'}
                        </span>
                        <span className="text-[9px] text-gray-500">
                          {ex.sets}×<span className="font-bold">
                            {ex.repsRange && ex.repsRange.min !== ex.repsRange.max
                              ? `${ex.repsRange.min}-${ex.repsRange.max}`
                              : ex.reps}
                            {' '}{ex.isTimeBased ? 'שניות' : 'חזרות'}
                          </span>
                          {' • '}{ex.tier}
                        </span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Messaging comparison */}
      <div>
        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">Description Comparison</p>
        <div className="grid grid-cols-3 gap-3">
          {options.map((opt, i) => {
            const c = boltColors[i];
            return (
              <div key={i} className={`${c.bg} ${c.border} border rounded-xl p-3`}>
                <p className={`text-[10px] font-bold ${c.text} mb-1`}>{'⚡'.repeat(i + 1)}</p>
                <p className="text-[11px] text-gray-700 leading-relaxed" dir="rtl">
                  {opt.result.workout.description || '(ריק)'}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function LevelMapChart({
  exercises,
  userLevel,
}: {
  exercises: WorkoutExercise[];
  userLevel: number;
}) {
  if (exercises.length === 0) {
    return <p className="text-sm text-gray-400 italic">No exercises to chart.</p>;
  }

  const maxLevel = Math.max(userLevel + 3, ...exercises.map(e => e.programLevel ?? 0));

  return (
    <div className="space-y-3">
      {/* User level reference line */}
      <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
        <span>L1</span>
        <div className="flex-1 h-px bg-gray-200 relative">
          <div
            className="absolute top-1/2 -translate-y-1/2 w-0 h-0"
            style={{ left: `${(userLevel / maxLevel) * 100}%` }}
          >
            <div className="absolute -top-3 -translate-x-1/2 text-[10px] text-[#2b6cb0] font-bold whitespace-nowrap">
              User L{userLevel}
            </div>
          </div>
        </div>
        <span>L{maxLevel}</span>
      </div>

      {exercises.map((ex, i) => {
        const level = ex.programLevel ?? 0;
        const pct = maxLevel > 0 ? (level / maxLevel) * 100 : 0;
        const mg = ex.exercise.movementGroup ?? 'other';
        const domain = MG_TO_DOMAIN[mg] ?? 'other';
        const gap = level - userLevel;
        const barColor =
          gap > 2 ? 'from-red-500 to-red-600' :
          gap > 0 ? 'from-amber-500 to-amber-600' :
          gap >= -2 ? 'from-emerald-500 to-emerald-600' :
          'from-blue-500 to-blue-600';

        return (
          <div key={ex.exercise.id + i} className="flex items-center gap-2">
            <div className="w-24 text-[10px] text-gray-400 truncate text-left font-mono">
              {domain.toUpperCase()}
            </div>
            <div className="flex-1 h-6 bg-gray-100 rounded-md relative overflow-hidden border border-gray-200">
              <div
                className={`absolute top-0 right-0 h-full bg-gradient-to-l ${barColor} rounded-md transition-all`}
                style={{ width: `${Math.max(pct, 4)}%` }}
              />
              {/* user level marker */}
              <div
                className="absolute top-0 h-full w-px bg-[#2b6cb0]/40"
                style={{ right: `${(userLevel / maxLevel) * 100}%` }}
              />
              <div className="absolute inset-0 flex items-center justify-between px-2">
                <span className="text-[10px] text-white font-bold z-10 truncate max-w-[60%]">
                  {getLocalizedText(ex.exercise.name)}
                </span>
                <span className="text-[10px] text-white/80 font-bold z-10">
                  L{level} {gap > 0 ? `(+${gap})` : gap < 0 ? `(${gap})` : '(=)'}
                </span>
              </div>
            </div>
          </div>
        );
      })}

      {/* Legend */}
      <div className="flex items-center gap-4 text-[10px] text-gray-400 pt-2 border-t border-gray-200">
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-emerald-500" /> Within range</span>
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-amber-500" /> Slightly over</span>
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-red-500" /> Over-level</span>
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-blue-500" /> Under-level</span>
        <span className="flex items-center gap-1"><span className="w-px h-3 bg-[#2b6cb0]" /> User Level</span>
      </div>
    </div>
  );
}
