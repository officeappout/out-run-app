'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getAllExercises, Exercise, ExecutionLocation, getLocalizedText, MECHANICAL_TYPE_LABELS, MechanicalType, InjuryShieldArea, INJURY_SHIELD_LABELS, NoiseLevel, SweatLevel } from '@/features/content/exercises';
import { getAllGymEquipment, GymEquipment } from '@/features/content/equipment/gym/core/gym-equipment.service';
import { useIsMounted } from '@/hooks/useIsMounted';
import { Smartphone, AlertTriangle, Bell, Home, Play, BarChart3, Zap, Filter, Shield, Target, Dices, XCircle, CheckCircle2, ChevronDown, Volume2, Droplets, User } from 'lucide-react';
import { 
  createContextualEngine, 
  ContextualFilterContext, 
  ContextualFilterResult,
  LifestylePersona,
  IntentMode,
  ProgramId,
  LIFESTYLE_LABELS,
  LOCATION_CONSTRAINTS,
} from '@/features/workout-engine/logic/ContextualEngine';
import {
  createWorkoutGenerator,
  GeneratedWorkout,
  WorkoutExercise,
} from '@/features/workout-engine/logic/WorkoutGenerator';
import { MOCK_EXERCISES, getMockExerciseStats, AVAILABLE_PROGRAMS, getProgramLevelRange } from '@/features/workout-engine/mocks/MockExercises';
import { resolveNotificationText, resolveDescription, TagResolverContext } from '@/features/content/branding/core/branding.utils';
import { Clock, Timer, RotateCcw, Repeat } from 'lucide-react';

// ============================================================================
// TYPES & CONSTANTS
// ============================================================================

interface Notification {
  id: string;
  triggerType: 'Inactivity' | 'Scheduled' | 'Location_Based' | 'Habit_Maintenance';
  daysInactive?: number;
  persona: string;
  psychologicalTrigger: string;
  text: string;
  gender?: string;
}

interface SmartDescription {
  id: string;
  location: string;
  persona: string;
  description: string;
  gender?: string;
}

interface WorkoutTitle {
  id: string;
  category: string;
  text: string;
}

const WORKOUT_METADATA_COLLECTION = 'workoutMetadata';

// Unified Persona options that map to lifestyle tags
const PERSONA_OPTIONS: { value: LifestylePersona; label: string; icon: string }[] = [
  { value: 'parent', label: 'הורה', icon: '👨‍👧' },
  { value: 'student', label: 'סטודנט', icon: '📚' },
  { value: 'office_worker', label: 'עובד משרד', icon: '💼' },
  { value: 'home_worker', label: 'עובד מהבית', icon: '🏠' },
  { value: 'athlete', label: 'ספורטאי', icon: '🏆' },
  { value: 'senior', label: 'גיל הזהב', icon: '🧓' },
];

const LOCATION_OPTIONS: { value: ExecutionLocation; label: string; icon: string; sweatLimit: SweatLevel; noiseLimit: NoiseLevel }[] = [
  { value: 'home', label: 'בית', icon: '🏠', sweatLimit: 2, noiseLimit: 2 },
  { value: 'park', label: 'פארק', icon: '🌳', sweatLimit: 3, noiseLimit: 3 },
  { value: 'office', label: 'משרד', icon: '🏢', sweatLimit: 1, noiseLimit: 1 },
  { value: 'street', label: 'רחוב', icon: '🛣️', sweatLimit: 3, noiseLimit: 3 },
  { value: 'gym', label: 'מכון כושר', icon: '🏋️', sweatLimit: 3, noiseLimit: 3 },
  { value: 'airport', label: 'שדה תעופה', icon: '✈️', sweatLimit: 1, noiseLimit: 1 },
  { value: 'school', label: 'בית ספר', icon: '🏫', sweatLimit: 1, noiseLimit: 1 },
];

const INTENT_OPTIONS: { value: IntentMode; label: string; icon: string; description: string }[] = [
  { value: 'normal', label: 'רגיל', icon: '🏋️', description: 'אימון סטנדרטי' },
  { value: 'blast', label: 'Blast', icon: '🔥', description: 'לתת בראש! מנוח 30ש' },
  { value: 'on_the_way', label: 'בדרך', icon: '🚗', description: 'מקסימום 15 דק, זיעה ≤1' },
  { value: 'field', label: 'שטח', icon: '🎖️', description: 'ללא ציוד, מצב טקטי' },
];

const TRIGGER_OPTIONS = [
  { value: 'Inactivity', label: 'אי-פעילות' },
  { value: 'Scheduled', label: 'מתוזמן' },
  { value: 'Location_Based', label: 'מבוסס מיקום' },
  { value: 'Habit_Maintenance', label: 'תחזוקת הרגל' },
];

const TIME_OPTIONS = [
  { value: 5, label: '5 דק׳' },
  { value: 15, label: '15 דק׳' },
  { value: 30, label: '30 דק׳' },
  { value: 45, label: '45 דק׳' },
  { value: 60, label: '60 דק׳' },
];

const INJURY_AREAS: InjuryShieldArea[] = [
  'wrist', 'elbow', 'shoulder', 'lower_back', 'neck', 'knees', 'ankles', 'hips'
];

// ============================================================================
// GLOBAL SIMULATOR CONTEXT TYPE
// ============================================================================

interface GlobalSimulatorContext {
  // User Profile
  persona: LifestylePersona | null;
  additionalLifestyles: LifestylePersona[];
  userLevel: number;
  userGender: 'male' | 'female' | 'other';
  injuryAreas: InjuryShieldArea[];
  
  // Program Selection
  selectedProgram: ProgramId;
  
  // Environment
  location: ExecutionLocation;
  timeOfDay: 'morning' | 'afternoon' | 'evening';
  availableTime: number;
  energyLevel: 'low' | 'medium' | 'high';
  
  // Trigger
  triggerType: 'Inactivity' | 'Scheduled' | 'Location_Based' | 'Habit_Maintenance';
  daysInactive: number;
  
  // Intent
  intentMode: IntentMode;
  
  // Derived values (computed)
  effectiveSweatLimit: SweatLevel;
  effectiveNoiseLimit: NoiseLevel;
  allLifestyles: LifestylePersona[];
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function SimulatorPage() {
  const mounted = useIsMounted();
  
  // ========== UNIFIED CONTEXT STATE ==========
  const [context, setContext] = useState<GlobalSimulatorContext>({
    persona: 'parent',
    additionalLifestyles: [],
    userLevel: 5,
    userGender: 'male',
    injuryAreas: [],
    selectedProgram: 'upper_body',
    location: 'park',
    timeOfDay: 'morning',
    availableTime: 45,
    energyLevel: 'medium',
    triggerType: 'Inactivity',
    daysInactive: 0,
    intentMode: 'normal',
    effectiveSweatLimit: 3,
    effectiveNoiseLimit: 3,
    allLifestyles: ['parent'],
  });
  
  // Data State
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [gymEquipment, setGymEquipment] = useState<GymEquipment[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [smartDescriptions, setSmartDescriptions] = useState<SmartDescription[]>([]);
  const [workoutTitles, setWorkoutTitles] = useState<WorkoutTitle[]>([]);
  const [loading, setLoading] = useState(true);
  
  // UI State
  const [useMockData, setUseMockData] = useState<boolean>(false);
  const [chaosRunCount, setChaosRunCount] = useState<number>(0);
  const [expandedSection, setExpandedSection] = useState<string | null>('controls');
  
  // Results State
  const [contextualResult, setContextualResult] = useState<ContextualFilterResult | null>(null);
  const [generatedWorkout, setGeneratedWorkout] = useState<GeneratedWorkout | null>(null);
  const [pushNotification, setPushNotification] = useState<string>('');
  const [dynamicDescription, setDynamicDescription] = useState<string>('');
  const [workoutTitle, setWorkoutTitle] = useState<string>('אימון יומי');

  // ========== DERIVED VALUES ==========
  
  // Compute derived context values when dependencies change
  useEffect(() => {
    const locationConfig = LOCATION_OPTIONS.find(l => l.value === context.location);
    let sweatLimit = locationConfig?.sweatLimit || 3;
    let noiseLimit = locationConfig?.noiseLimit || 3;
    
    // Intent mode overrides
    if (context.intentMode === 'on_the_way') {
      sweatLimit = 1;
    } else if (context.intentMode === 'blast') {
      sweatLimit = 3; // Ignore sweat limits in blast mode
    }
    
    // Combine persona with additional lifestyles
    const allLifestyles: LifestylePersona[] = context.persona 
      ? [context.persona, ...context.additionalLifestyles.filter(l => l !== context.persona)]
      : context.additionalLifestyles;
    
    setContext(prev => ({
      ...prev,
      effectiveSweatLimit: sweatLimit as SweatLevel,
      effectiveNoiseLimit: noiseLimit as NoiseLevel,
      allLifestyles,
    }));
  }, [context.location, context.intentMode, context.persona, context.additionalLifestyles]);

  // ========== DATA LOADING ==========

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [exercisesData, equipmentData, notificationsData, descriptionsData, titlesData] = await Promise.all([
        getAllExercises(),
        getAllGymEquipment(),
        loadNotifications(),
        loadSmartDescriptions(),
        loadWorkoutTitles(),
      ]);
      setExercises(exercisesData);
      setGymEquipment(equipmentData);
      setNotifications(notificationsData);
      setSmartDescriptions(descriptionsData);
      setWorkoutTitles(titlesData);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadNotifications = async (): Promise<Notification[]> => {
    try {
      const ref = collection(db, `${WORKOUT_METADATA_COLLECTION}/notifications/notifications`);
      const snapshot = await getDocs(ref);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notification));
    } catch { return []; }
  };

  const loadSmartDescriptions = async (): Promise<SmartDescription[]> => {
    try {
      const ref = collection(db, `${WORKOUT_METADATA_COLLECTION}/smartDescriptions/descriptions`);
      const snapshot = await getDocs(ref);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SmartDescription));
    } catch { return []; }
  };

  const loadWorkoutTitles = async (): Promise<WorkoutTitle[]> => {
    try {
      const ref = collection(db, `${WORKOUT_METADATA_COLLECTION}/workoutTitles/titles`);
      const snapshot = await getDocs(ref);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WorkoutTitle));
    } catch { return []; }
  };

  // ========== CONTEXTUAL ENGINE ==========
  
  useEffect(() => {
    const exerciseData = useMockData ? MOCK_EXERCISES : exercises;
    if (exerciseData.length === 0) return;
    
    const engine = createContextualEngine();
    const filterContext: ContextualFilterContext = {
      location: context.location,
      lifestyles: context.allLifestyles,
      injuryShield: context.injuryAreas,
      intentMode: context.intentMode,
      availableEquipment: gymEquipment.map(eq => eq.id),
      userLevel: context.userLevel,
      // Only apply program filter when using mock data
      selectedProgram: useMockData ? context.selectedProgram : undefined,
      levelTolerance: 3,
    };
    
    const result = engine.filterAndScore(exerciseData as any, filterContext);
    setContextualResult(result);
  }, [exercises, context, gymEquipment, useMockData]);

  // ========== WORKOUT GENERATOR ==========
  
  useEffect(() => {
    if (!contextualResult || contextualResult.exercises.length === 0) {
      setGeneratedWorkout(null);
      return;
    }

    const generator = createWorkoutGenerator();
    const workout = generator.generateWorkout(contextualResult.exercises, {
      availableTime: context.availableTime,
      userLevel: context.userLevel,
      daysInactive: context.daysInactive,
      intentMode: context.intentMode,
      persona: context.persona,
      location: context.location,
      injuryCount: context.injuryAreas.length,
      energyLevel: context.energyLevel,
    });
    
    setGeneratedWorkout(workout);
    
    // Update title and description from generator
    setWorkoutTitle(workout.title);
    setDynamicDescription(workout.description);
  }, [contextualResult, context.availableTime, context.userLevel, context.daysInactive, context.intentMode, context.persona, context.location, context.injuryAreas.length, context.energyLevel]);

  // ========== NOTIFICATION MATCHING ==========
  
  useEffect(() => {
    findPushNotification();
    findSmartDescription();
    findWorkoutTitle();
  }, [context, notifications, smartDescriptions, workoutTitles, contextualResult]);

  const findPushNotification = () => {
    if (!context.persona) {
      setPushNotification('');
      return;
    }

    // Find matching notification
    let matched = notifications.filter(n => {
      const personaMatch = n.persona === context.persona;
      const triggerMatch = n.triggerType === context.triggerType;
      const genderMatch = !n.gender || n.gender === 'both' || n.gender === context.userGender;
      const daysMatch = context.triggerType !== 'Inactivity' || 
        (n.daysInactive !== undefined && Math.abs(n.daysInactive - context.daysInactive) <= 2);
      return personaMatch && triggerMatch && genderMatch && daysMatch;
    });

    if (matched.length === 0) {
      // Fallback: just match persona
      matched = notifications.filter(n => n.persona === context.persona);
    }

    if (matched.length > 0) {
      const notification = matched[0];
      const resolverContext: TagResolverContext = {
        triggerType: notification.triggerType,
        daysInactive: notification.daysInactive,
        persona: context.persona,
        location: context.location,
        locationName: LOCATION_OPTIONS.find(l => l.value === context.location)?.label,
        currentTime: new Date(),
        userName: 'דוד',
        userGoal: 'אורח חיים בריא',
        userGender: context.userGender,
        exerciseName: contextualResult?.exercises[0] ? getLocalizedText(contextualResult.exercises[0].exercise.name) : undefined,
      };
      const resolved = resolveNotificationText(notification.text, resolverContext);
      setPushNotification(resolved);
      } else {
        setPushNotification('');
    }
  };

  const findSmartDescription = () => {
    if (!context.persona) {
      setDynamicDescription('');
      return;
    }

    const matched = smartDescriptions.filter(d => {
      const locationMatch = d.location === context.location;
      const personaMatch = d.persona === context.persona;
      const genderMatch = !d.gender || d.gender === 'both' || d.gender === context.userGender;
      return locationMatch && personaMatch && genderMatch;
    });

    if (matched.length > 0) {
      const resolverContext: TagResolverContext = {
        persona: context.persona,
        location: context.location,
        locationName: LOCATION_OPTIONS.find(l => l.value === context.location)?.label,
        currentTime: new Date(),
        userName: 'דוד',
        userGoal: 'אורח חיים בריא',
        userGender: context.userGender,
      };
      const resolved = resolveDescription(matched[0].description, resolverContext);
      setDynamicDescription(resolved);
    } else {
      // Generate a default description based on context
      const locationLabel = LOCATION_OPTIONS.find(l => l.value === context.location)?.label || context.location;
      const intentLabel = INTENT_OPTIONS.find(i => i.value === context.intentMode)?.description || '';
      setDynamicDescription(`אימון ${intentLabel} ${locationLabel}`);
    }
  };

  const findWorkoutTitle = () => {
    if (workoutTitles.length > 0) {
      setWorkoutTitle(workoutTitles[0].text);
    } else {
      const intentLabel = context.intentMode === 'blast' ? 'Blast' :
                         context.intentMode === 'on_the_way' ? 'מהיר' :
                         context.intentMode === 'field' ? 'שטח' : '';
      setWorkoutTitle(`אימון ${intentLabel} יומי`.trim());
    }
  };

  // ========== CHAOS MODE ==========
  
  const generateRandomContext = () => {
    const randomItem = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
    const randomItems = <T,>(arr: T[], count: number): T[] => {
      const shuffled = [...arr].sort(() => Math.random() - 0.5);
      return shuffled.slice(0, count);
    };

    const newPersona = randomItem(PERSONA_OPTIONS).value;
    const additionalCount = Math.floor(Math.random() * 2); // 0-1 additional
    const additionalLifestyles = randomItems(
      PERSONA_OPTIONS.filter(p => p.value !== newPersona).map(p => p.value),
      additionalCount
    );
    const newLocation = randomItem(LOCATION_OPTIONS).value;
    const newIntent = randomItem(INTENT_OPTIONS).value;
    const newInjuries = randomItems(INJURY_AREAS, Math.floor(Math.random() * 3));
    const newProgram = randomItem([...AVAILABLE_PROGRAMS]).id;
    // Get level range for this program and pick a random level
    const levelRange = getProgramLevelRange(newProgram);
    const newLevel = Math.floor(Math.random() * (Math.min(levelRange.max, 15) - levelRange.min + 1)) + levelRange.min;
    const newTime = randomItem(TIME_OPTIONS).value;
    const newDaysInactive = randomItem([0, 1, 2, 7, 14, 30]);
    const newTrigger = randomItem(TRIGGER_OPTIONS).value as any;
    const newEnergy = randomItem(['low', 'medium', 'high'] as const);
    const newTimeOfDay = randomItem(['morning', 'afternoon', 'evening'] as const);

    setContext(prev => ({
      ...prev,
      persona: newPersona,
      additionalLifestyles,
      location: newLocation,
      intentMode: newIntent,
      injuryAreas: newInjuries,
      selectedProgram: newProgram,
      userLevel: newLevel,
      availableTime: newTime,
      daysInactive: newDaysInactive,
      triggerType: newTrigger,
      energyLevel: newEnergy,
      timeOfDay: newTimeOfDay,
    }));
    
    setUseMockData(true);
    setChaosRunCount(prev => prev + 1);
  };

  // ========== CONTEXT UPDATE HELPERS ==========
  
  const updateContext = <K extends keyof GlobalSimulatorContext>(key: K, value: GlobalSimulatorContext[K]) => {
    setContext(prev => ({ ...prev, [key]: value }));
  };

  const toggleAdditionalLifestyle = (lifestyle: LifestylePersona) => {
    setContext(prev => {
      const current = prev.additionalLifestyles;
      if (current.includes(lifestyle)) {
        return { ...prev, additionalLifestyles: current.filter(l => l !== lifestyle) };
      } else if (current.length < 2) { // Max 2 additional (3 total with primary)
        return { ...prev, additionalLifestyles: [...current, lifestyle] };
      }
      return prev;
    });
  };

  const toggleInjury = (area: InjuryShieldArea) => {
    setContext(prev => {
      const current = prev.injuryAreas;
      if (current.includes(area)) {
        return { ...prev, injuryAreas: current.filter(a => a !== area) };
    } else {
        return { ...prev, injuryAreas: [...current, area] };
      }
    });
  };

  // ========== RENDER ==========
  
  if (!mounted) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">טוען...</div>
      </div>
    );
  }

  const locationConfig = LOCATION_OPTIONS.find(l => l.value === context.location);

    return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100" dir="rtl">
      {/* ========== HEADER ========== */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg">
                <Smartphone size={24} className="text-white" />
        </div>
              <div>
                <h1 className="text-2xl font-black text-gray-900">User Journey Simulator</h1>
                <p className="text-sm text-gray-500">סימולציה מלאה: התראה → בית → אימון</p>
                </div>
                </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer bg-gray-100 px-3 py-2 rounded-lg">
                <input
                  type="checkbox"
                  checked={useMockData}
                  onChange={(e) => setUseMockData(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-purple-600"
                />
                <span className="text-sm font-medium text-gray-700">Mock Data</span>
              </label>
              <button
                onClick={generateRandomContext}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-bold hover:from-purple-700 hover:to-pink-700 transition-all shadow-lg"
              >
                <Dices size={18} />
                🎲 Chaos
              </button>
              </div>
            </div>
          </div>
        </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-12 gap-6">
          
          {/* ========== LEFT: CONTROL PANEL ========== */}
          <div className="col-span-4 space-y-4">
            
            {/* Persona Selection */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <h3 className="text-sm font-bold text-gray-600 uppercase tracking-wide mb-3 flex items-center gap-2">
                <User size={16} className="text-purple-500" />
                פרסונה ראשית
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {PERSONA_OPTIONS.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => updateContext('persona', p.value)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      context.persona === p.value
                        ? 'bg-purple-600 text-white shadow-md'
                        : 'bg-gray-50 text-gray-700 hover:bg-purple-50 border border-gray-200'
                    }`}
                  >
                    <span>{p.icon}</span>
                    <span>{p.label}</span>
                  </button>
                ))}
                </div>
              
              {/* Additional Lifestyles */}
              {context.persona && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-xs text-gray-500 mb-2">סגנונות נוספים (אופציונלי):</p>
                  <div className="flex flex-wrap gap-1.5">
                    {PERSONA_OPTIONS.filter(p => p.value !== context.persona).map((p) => (
                      <button
                        key={p.value}
                        onClick={() => toggleAdditionalLifestyle(p.value)}
                        className={`px-2 py-1 rounded-lg text-xs font-medium transition-all ${
                          context.additionalLifestyles.includes(p.value)
                            ? 'bg-purple-100 text-purple-700 border border-purple-300'
                            : 'bg-gray-50 text-gray-500 border border-gray-200 hover:bg-purple-50'
                        }`}
                      >
                        +{p.label}
                      </button>
                    ))}
                </div>
              </div>
              )}
            </div>

            {/* Location & Environment */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <h3 className="text-sm font-bold text-gray-600 uppercase tracking-wide mb-3">📍 מיקום וסביבה</h3>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {LOCATION_OPTIONS.map((loc) => (
                  <button
                    key={loc.value}
                    onClick={() => updateContext('location', loc.value)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                      context.location === loc.value
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'bg-gray-50 text-gray-700 hover:bg-blue-50 border border-gray-200'
                    }`}
                  >
                    <span>{loc.icon}</span>
                    <span>{loc.label}</span>
                  </button>
                ))}
          </div>
              
              {/* Auto-derived limits display */}
              <div className="bg-gray-50 rounded-xl p-3 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <Droplets size={14} className="text-blue-500" />
                    <span className="text-xs text-gray-600">זיעה:</span>
                    <span className={`text-xs font-bold ${
                      context.effectiveSweatLimit === 1 ? 'text-green-600' :
                      context.effectiveSweatLimit === 2 ? 'text-yellow-600' : 'text-red-600'
                    }`}>≤{context.effectiveSweatLimit}</span>
            </div>
                  <div className="flex items-center gap-1.5">
                    <Volume2 size={14} className="text-orange-500" />
                    <span className="text-xs text-gray-600">רעש:</span>
                    <span className={`text-xs font-bold ${
                      context.effectiveNoiseLimit === 1 ? 'text-green-600' :
                      context.effectiveNoiseLimit === 2 ? 'text-yellow-600' : 'text-red-600'
                    }`}>≤{context.effectiveNoiseLimit}</span>
          </div>
          </div>
                {context.location === 'park' && (
                  <span className="text-xs text-emerald-600 font-medium">🌳 Facility Mode</span>
                )}
              </div>
            </div>

            {/* Intent Mode */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <h3 className="text-sm font-bold text-gray-600 uppercase tracking-wide mb-3">🎯 מצב כוונה</h3>
              <div className="grid grid-cols-2 gap-2">
                {INTENT_OPTIONS.map((intent) => (
                  <button
                    key={intent.value}
                    onClick={() => updateContext('intentMode', intent.value)}
                    className={`flex flex-col items-center gap-1 px-3 py-3 rounded-xl text-sm font-medium transition-all ${
                      context.intentMode === intent.value
                        ? intent.value === 'blast' ? 'bg-orange-500 text-white shadow-md' :
                          intent.value === 'on_the_way' ? 'bg-blue-500 text-white shadow-md' :
                          intent.value === 'field' ? 'bg-green-700 text-white shadow-md' :
                          'bg-gray-700 text-white shadow-md'
                        : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'
                    }`}
                  >
                    <span className="text-lg">{intent.icon}</span>
                    <span>{intent.label}</span>
                  </button>
                ))}
        </div>
      </div>

            {/* Trigger & Timing */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <h3 className="text-sm font-bold text-gray-600 uppercase tracking-wide mb-3">⏰ טריגר והתראות</h3>
              <select
                value={context.triggerType}
                onChange={(e) => updateContext('triggerType', e.target.value as any)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm mb-3"
              >
                {TRIGGER_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              
              {context.triggerType === 'Inactivity' && (
              <div>
                  <label className="text-xs text-gray-500">ימים ללא אימון: {context.daysInactive}</label>
                  <input
                    type="range"
                    min="0"
                    max="30"
                    value={context.daysInactive}
                    onChange={(e) => updateContext('daysInactive', parseInt(e.target.value))}
                    className="w-full mt-1"
                  />
              </div>
              )}
              
              <div className="mt-3 flex gap-2">
                {TIME_OPTIONS.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => updateContext('availableTime', t.value)}
                    className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      context.availableTime === t.value
                        ? 'bg-cyan-500 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-cyan-50'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
          </div>
        </div>

            {/* Program Selection */}
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-2xl p-5 shadow-sm border border-indigo-200">
              <h3 className="text-sm font-bold text-indigo-700 uppercase tracking-wide mb-3">📋 תוכנית אימונים</h3>
              <select
                value={context.selectedProgram}
                onChange={(e) => updateContext('selectedProgram', e.target.value as ProgramId)}
                className="w-full px-3 py-2.5 border border-indigo-200 rounded-xl text-sm font-medium bg-white"
              >
                {AVAILABLE_PROGRAMS.map((p) => (
                  <option key={p.id} value={p.id}>{p.label} ({p.labelEn})</option>
                ))}
              </select>
              {useMockData && (
                <p className="text-xs text-indigo-500 mt-2">
                  ⚡ רק תרגילים עם רמה בתוכנית זו יוצגו
                </p>
              )}
        </div>

            {/* User Level */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <h3 className="text-sm font-bold text-gray-600 uppercase tracking-wide mb-3">
                💪 רמה: {context.userLevel}
              </h3>
              <input
                type="range"
                min="1"
                max="25"
                value={context.userLevel}
                onChange={(e) => updateContext('userLevel', parseInt(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>1</span>
                <span>10</span>
                <span>20</span>
                <span>25</span>
              </div>
              </div>

            {/* Injury Shield */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <h3 className="text-sm font-bold text-gray-600 uppercase tracking-wide mb-3 flex items-center gap-2">
                <Shield size={14} className="text-red-500" />
                Injury Shield
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {INJURY_AREAS.map((area) => (
                  <button
                    key={area}
                    onClick={() => toggleInjury(area)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                      context.injuryAreas.includes(area)
                        ? 'bg-red-500 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-red-50'
                    }`}
                  >
                    {INJURY_SHIELD_LABELS[area].he}
            </button>
                ))}
            </div>
          </div>
          </div>

          {/* ========== RIGHT: JOURNEY PREVIEW ========== */}
          <div className="col-span-8 space-y-4">
            
            {/* Chaos Report (if active) */}
            {chaosRunCount > 0 && useMockData && (
              <div className="bg-gradient-to-r from-purple-600 via-pink-600 to-red-600 rounded-2xl p-4 text-white shadow-lg">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold flex items-center gap-2">
                    🎲 Chaos #{chaosRunCount}
                  </h3>
                  <div className="flex items-center gap-4 text-sm">
                    <span className={contextualResult && contextualResult.exercises.length > 0 ? 'text-green-300' : 'text-red-300'}>
                      {contextualResult?.exercises.length || 0} תרגילים
                    </span>
                    <span>SA:BA {contextualResult?.mechanicalBalance.ratio}</span>
                  </div>
                </div>
              </div>
            )}

            {/* ========== STEP 1: LOCK SCREEN ========== */}
            <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100">
              <div className="bg-gradient-to-r from-gray-900 to-gray-800 px-5 py-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-cyan-500 flex items-center justify-center">
                  <Bell size={16} className="text-white" />
                </div>
              <div>
                  <h3 className="text-white font-bold">Step 1: Lock Screen</h3>
                  <p className="text-gray-400 text-xs">התראת Push</p>
              </div>
              </div>
              
              <div className="p-5">
                {/* Simulated Phone Notification */}
                <div className="bg-gray-50 rounded-2xl p-4 border border-gray-200">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-cyan-500 rounded-xl flex items-center justify-center text-white font-bold text-sm">
                      OUT
              </div>
              <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-sm text-gray-900">OUTRUN</span>
                        <span className="text-xs text-gray-400">עכשיו</span>
              </div>
                      {pushNotification ? (
                        <p className="text-sm text-gray-700 leading-relaxed">{pushNotification}</p>
                      ) : (
                        <p className="text-sm text-gray-400 italic">אין התראה ספציפית לפרסונה זו</p>
            )}
          </div>
          </div>
        </div>

                {/* Context Tags */}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full font-medium">
                    {PERSONA_OPTIONS.find(p => p.value === context.persona)?.label || 'לא נבחר'}
                  </span>
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">
                    {context.triggerType}
                  </span>
                  {context.daysInactive > 0 && (
                    <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded-full font-medium">
                      {context.daysInactive} ימים לא פעיל
                    </span>
        )}
              </div>
              </div>
            </div>

            {/* ========== STEP 2: HOME SCREEN ========== */}
            <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100">
              <div className="bg-gradient-to-r from-cyan-600 to-blue-600 px-5 py-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center">
                  <Home size={16} className="text-cyan-600" />
          </div>
                <div>
                  <h3 className="text-white font-bold">Step 2: Home Screen</h3>
                  <p className="text-cyan-100 text-xs">כותרת האימון והקשר</p>
        </div>
              </div>
              
              <div className="p-5">
                {/* Workout Card Preview */}
                <div className="bg-gradient-to-br from-cyan-50 to-blue-50 rounded-2xl p-5 border border-cyan-200">
                  <div className="flex items-start justify-between mb-2">
                    <h2 className="text-2xl font-black text-gray-900">{workoutTitle}</h2>
                    {generatedWorkout?.volumeAdjustment && generatedWorkout.volumeAdjustment.reductionPercent > 0 && (
                      <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs font-bold rounded-lg flex items-center gap-1">
                        <RotateCcw size={12} />
                        Volume Reduced
                      </span>
        )}
      </div>
                  <p className="text-gray-600 mb-4">{dynamicDescription || 'תיאור דינמי יופיע כאן'}</p>
                  
                  {/* AI Cue */}
                  {(generatedWorkout?.aiCue || contextualResult?.aiCue) && (
                    <div className="bg-white rounded-xl p-3 flex items-center gap-3 border border-cyan-200">
                      <span className="text-2xl">💬</span>
                      <p className="text-sm text-cyan-800 font-medium">{generatedWorkout?.aiCue || contextualResult?.aiCue}</p>
          </div>
                  )}
                  
                  {/* Blast Mode EMOM/AMRAP Structure */}
                  {generatedWorkout?.blastMode && (
                    <div className="mt-3 bg-gradient-to-r from-orange-500 to-red-500 rounded-xl p-4 text-white">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                          {generatedWorkout.blastMode.type === 'emom' ? (
                            <Timer size={24} />
                          ) : (
                            <Repeat size={24} />
                          )}
        </div>
        <div>
                          <h3 className="font-black text-lg uppercase">
                            {generatedWorkout.blastMode.type === 'emom' ? 'EMOM' : 'AMRAP'}
                          </h3>
                          <p className="text-sm text-orange-100">
                            {generatedWorkout.blastMode.type === 'emom' 
                              ? `${generatedWorkout.blastMode.durationMinutes} דקות • ${generatedWorkout.blastMode.workSeconds}ש׳ עבודה / ${generatedWorkout.blastMode.restSeconds}ש׳ מנוחה`
                              : `${generatedWorkout.blastMode.durationMinutes} דקות • כמה שאפשר!`
                            }
                          </p>
        </div>
      </div>
                    </div>
                  )}
                  
                  {/* Quick Stats */}
                  <div className="mt-4 grid grid-cols-4 gap-3">
                    <div className="bg-white rounded-xl p-3 text-center">
                      <div className="text-lg font-black text-gray-900">{context.availableTime}</div>
                      <div className="text-xs text-gray-500">דקות</div>
      </div>
                    <div className="bg-white rounded-xl p-3 text-center">
                      <div className="text-lg font-black text-gray-900">{generatedWorkout?.estimatedDuration || '-'}</div>
                      <div className="text-xs text-gray-500">צפי בפועל</div>
                    </div>
                    <div className="bg-white rounded-xl p-3 text-center">
                      <div className="text-lg font-black text-gray-900">{context.userLevel}</div>
                      <div className="text-xs text-gray-500">רמה</div>
                    </div>
                    <div className="bg-white rounded-xl p-3 text-center">
                      <div className="text-lg font-black text-gray-900">{locationConfig?.icon}</div>
                      <div className="text-xs text-gray-500">{locationConfig?.label}</div>
                    </div>
                  </div>
                </div>
              </div>
          </div>

            {/* ========== STEP 3: WORKOUT DETAILS ========== */}
            <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100">
              <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center">
                  <Play size={16} className="text-emerald-600" />
      </div>
          <div>
                  <h3 className="text-white font-bold">Step 3: Workout Details</h3>
                  <p className="text-emerald-100 text-xs">תרגילים ואיזון</p>
        </div>
          </div>

              <div className="p-5 space-y-4">
                
                {/* Results Summary */}
                {contextualResult && (
                  <>
                    {/* Stats Row */}
                    <div className="grid grid-cols-4 gap-3">
                      <div className={`rounded-xl p-3 text-center ${
                        contextualResult.exercises.length > 0 
                          ? 'bg-green-50 border border-green-200' 
                          : 'bg-red-50 border border-red-200'
                      }`}>
                        <div className="flex items-center justify-center gap-1 mb-1">
                          {contextualResult.exercises.length > 0 
                            ? <CheckCircle2 size={16} className="text-green-500" />
                            : <XCircle size={16} className="text-red-500" />
                          }
          </div>
                        <div className="text-2xl font-black text-gray-900">{contextualResult.exercises.length}</div>
                        <div className="text-xs text-gray-500">זמינים</div>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-200">
                        <div className="text-2xl font-black text-red-500">{contextualResult.excludedCount}</div>
                        <div className="text-xs text-gray-500">נפלטרו</div>
                      </div>
                      <div className="bg-amber-50 rounded-xl p-3 text-center border border-amber-200">
                        <div className="text-xl font-black text-amber-700">{contextualResult.mechanicalBalance.straightArm}</div>
                        <div className="text-xs text-amber-600">SA</div>
                      </div>
                      <div className="bg-indigo-50 rounded-xl p-3 text-center border border-indigo-200">
                        <div className="text-xl font-black text-indigo-700">{contextualResult.mechanicalBalance.bentArm}</div>
                        <div className="text-xs text-indigo-600">BA</div>
                      </div>
          </div>

                    {/* SA:BA Balance Bar */}
                    <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold text-gray-700 flex items-center gap-2">
                          <BarChart3 size={14} className="text-purple-500" />
                          SA:BA Balance
                        </span>
                        <span className="text-lg font-black text-purple-600">{contextualResult.mechanicalBalance.ratio}</span>
              </div>
                      <div className="h-4 rounded-full overflow-hidden flex bg-gray-200">
                        {(() => {
                          const total = contextualResult.mechanicalBalance.straightArm + 
                                       contextualResult.mechanicalBalance.bentArm + 
                                       contextualResult.mechanicalBalance.hybrid +
                                       contextualResult.mechanicalBalance.none;
                          if (total === 0) return <div className="flex-1 bg-gray-300" />;
                          const saPercent = (contextualResult.mechanicalBalance.straightArm / total) * 100;
                          const baPercent = (contextualResult.mechanicalBalance.bentArm / total) * 100;
                          const hybridPercent = (contextualResult.mechanicalBalance.hybrid / total) * 100;
  return (
                            <>
                              {saPercent > 0 && <div className="bg-amber-500 h-full" style={{ width: `${saPercent}%` }} />}
                              {baPercent > 0 && <div className="bg-indigo-500 h-full" style={{ width: `${baPercent}%` }} />}
                              {hybridPercent > 0 && <div className="bg-emerald-500 h-full" style={{ width: `${hybridPercent}%` }} />}
                            </>
                          );
                        })()}
        </div>
                      {contextualResult.mechanicalBalance.warning && (
                        <p className="text-xs text-orange-600 mt-2 flex items-center gap-1">
                          <AlertTriangle size={12} />
                          {contextualResult.mechanicalBalance.warning}
                        </p>
          )}
      </div>

                    {/* Active Filters */}
                    <div className="bg-purple-50 rounded-xl p-4 border border-purple-200">
                      <h4 className="text-sm font-bold text-purple-800 mb-2 flex items-center gap-2">
                        <Filter size={14} />
                        פילטרים פעילים
                      </h4>
                      <div className="flex flex-wrap gap-1.5">
                        {contextualResult.activeFilters.map((filter, idx) => (
                          <span
                            key={idx}
                            className={`px-2 py-1 rounded-full text-xs font-medium ${
                              filter.type === 'location' ? 'bg-blue-100 text-blue-700' :
                              filter.type === 'lifestyle' ? 'bg-purple-100 text-purple-700' :
                              filter.type === 'injury' ? 'bg-red-100 text-red-700' :
                              filter.type === 'intent' ? 'bg-orange-100 text-orange-700' :
                              'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {filter.label}: {filter.value}
                          </span>
                        ))}
        </div>
          </div>

                    {/* Fail State */}
                    {contextualResult.exercises.length === 0 && (
                      <div className="bg-red-50 rounded-xl p-4 border border-red-200">
                        <div className="flex items-start gap-3">
                          <AlertTriangle size={24} className="text-red-500 flex-shrink-0" />
          <div>
                            <h4 className="font-bold text-red-800">⚠️ Fail State!</h4>
                            <p className="text-sm text-red-600 mt-1">
                              אין תרגילים זמינים. סיבות אפשריות:
                            </p>
                            <ul className="text-xs text-red-500 mt-2 list-disc list-inside">
                              {useMockData && (
                                <li className="font-bold">
                                  אין תרגילים ברמה {context.userLevel} בתוכנית "{AVAILABLE_PROGRAMS.find(p => p.id === context.selectedProgram)?.label}" 
                                  (טווח: {context.userLevel - 3}-{context.userLevel + 3})
                                </li>
                              )}
                              <li>מגבלות מיקום ({context.location}) - זיעה≤{context.effectiveSweatLimit}, רעש≤{context.effectiveNoiseLimit}</li>
                              {context.injuryAreas.length > 0 && <li>Injury Shield ({context.injuryAreas.length} אזורים)</li>}
                              {context.intentMode === 'field' && <li>מצב שטח דורש fieldReady=true וללא ציוד</li>}
                            </ul>
          </div>
            </div>
          </div>
          )}

                    {/* Volume Reduction Badge */}
                    {generatedWorkout?.volumeAdjustment && generatedWorkout.volumeAdjustment.reductionPercent > 0 && (
                      <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                            <RotateCcw size={20} className="text-amber-600" />
                          </div>
          <div>
                            <h4 className="font-bold text-amber-800 text-sm">{generatedWorkout.volumeAdjustment.badge}</h4>
                            <p className="text-xs text-amber-600">
                              {context.daysInactive} ימים לא פעיל • סטים מופחתים: {generatedWorkout.volumeAdjustment.originalSets} → {generatedWorkout.volumeAdjustment.adjustedSets}
                            </p>
          </div>
                        </div>
                      </div>
                    )}

                    {/* Full Workout Exercise List */}
                    {generatedWorkout && generatedWorkout.exercises.length > 0 && (
            <div>
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-sm font-bold text-gray-700">📋 תוכנית האימון:</h4>
                          <span className="text-xs text-gray-500">{generatedWorkout.exercises.length} תרגילים</span>
              </div>
                        <div className="space-y-3">
                          {generatedWorkout.exercises.map((workoutEx, idx) => (
                            <div key={workoutEx.exercise.id} className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
                              {/* Exercise Header */}
                              <div className="flex items-center gap-3 p-3">
                                <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
                                  workoutEx.priority === 'skill' ? 'bg-purple-500 text-white' :
                                  workoutEx.priority === 'compound' ? 'bg-blue-500 text-white' :
                                  workoutEx.priority === 'accessory' ? 'bg-green-500 text-white' :
                                  'bg-gray-400 text-white'
                                }`}>
                                  {idx + 1}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <div className="font-bold text-sm text-gray-800 truncate">
                                    {getLocalizedText(workoutEx.exercise.name)}
            </div>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    {workoutEx.programLevel && (
                                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-500 text-white">
                                        L{workoutEx.programLevel}
                                      </span>
                                    )}
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                      workoutEx.priority === 'skill' ? 'bg-purple-100 text-purple-700' :
                                      workoutEx.priority === 'compound' ? 'bg-blue-100 text-blue-700' :
                                      workoutEx.priority === 'accessory' ? 'bg-green-100 text-green-700' :
                                      'bg-gray-100 text-gray-600'
                                    }`}>
                                      {workoutEx.priority}
                                    </span>
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                      workoutEx.mechanicalType === 'straight_arm' ? 'bg-amber-100 text-amber-700' :
                                      workoutEx.mechanicalType === 'bent_arm' ? 'bg-indigo-100 text-indigo-700' :
                                      workoutEx.mechanicalType === 'hybrid' ? 'bg-emerald-100 text-emerald-700' :
                                      'bg-gray-100 text-gray-600'
                                    }`}>
                                      {MECHANICAL_TYPE_LABELS[workoutEx.mechanicalType]?.abbr || 'N/A'}
                                    </span>
        </div>
                                </div>
                                <span className="text-xs font-bold text-purple-600 bg-purple-50 px-2 py-1 rounded">
                                  ניקוד: {workoutEx.score}
                                </span>
      </div>

                              {/* Volume Details */}
                              <div className="bg-white px-3 py-2 border-t border-gray-200 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                  {/* Sets x Reps */}
                                  <div className="flex items-center gap-1.5">
                                    <Repeat size={14} className="text-gray-400" />
                                    <span className="text-sm font-black text-gray-900">
                                      {workoutEx.sets} × {workoutEx.reps}
                                    </span>
                                    <span className="text-xs text-gray-500">
                                      {workoutEx.isTimeBased ? 'ש׳' : 'חזרות'}
                                    </span>
                                  </div>
                                  
                                  {/* Rest Time */}
                                  <div className="flex items-center gap-1.5">
                                    <Clock size={14} className="text-gray-400" />
                                    <span className="text-sm font-bold text-gray-700">{workoutEx.restSeconds}ש׳</span>
                                    <span className="text-xs text-gray-500">מנוחה</span>
        </div>
      </div>

                                {/* Time-based indicator */}
                                {workoutEx.isTimeBased && (
                                  <span className="text-[10px] bg-cyan-100 text-cyan-700 px-2 py-0.5 rounded-full font-medium">
                                    ⏱️ החזקה
                                  </span>
                                )}
          </div>
            </div>
                          ))}
          </div>
                      </div>
                    )}

                    {/* Fallback: Show scored exercises if no generated workout */}
                    {(!generatedWorkout || generatedWorkout.exercises.length === 0) && contextualResult.exercises.length > 0 && (
                      <div>
                        <h4 className="text-sm font-bold text-gray-700 mb-2">Top 5 תרגילים מדורגים:</h4>
                        <div className="space-y-2">
                          {contextualResult.exercises.slice(0, 5).map((scored, idx) => (
                            <div key={scored.exercise.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
                              <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${
                                idx === 0 ? 'bg-yellow-400 text-yellow-900' :
                                idx === 1 ? 'bg-gray-300 text-gray-700' :
                                idx === 2 ? 'bg-amber-600 text-white' :
                                'bg-gray-200 text-gray-600'
                              }`}>
                                {idx + 1}
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className="font-bold text-sm text-gray-800 truncate">
                                  {getLocalizedText(scored.exercise.name)}
              </div>
                                <div className="flex items-center gap-2 mt-0.5">
                                  {scored.programLevel && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-500 text-white">
                                      L{scored.programLevel}
                                    </span>
                                  )}
                                  <span className="text-xs text-gray-500 truncate">
                                    {scored.reasoning.slice(0, 2).join(' • ')}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                                  scored.mechanicalType === 'straight_arm' ? 'bg-amber-100 text-amber-700' :
                                  scored.mechanicalType === 'bent_arm' ? 'bg-indigo-100 text-indigo-700' :
                                  scored.mechanicalType === 'hybrid' ? 'bg-emerald-100 text-emerald-700' :
                                  'bg-gray-100 text-gray-600'
                                }`}>
                                  {MECHANICAL_TYPE_LABELS[scored.mechanicalType]?.abbr || 'N/A'}
                                </span>
                                <span className="text-sm font-black text-purple-600 w-6 text-center">
                                  {scored.score}
                                </span>
                              </div>
                            </div>
                          ))}
            </div>
          </div>
        )}

                    {/* Blast Mode Indicator */}
                    {contextualResult.adjustedRestSeconds && !generatedWorkout?.blastMode && (
                      <div className="bg-orange-50 rounded-xl p-3 border border-orange-200 flex items-center gap-3">
                        <Zap size={20} className="text-orange-500" />
                        <div>
                          <span className="text-sm font-bold text-orange-700">Blast Mode:</span>
                          <span className="text-sm text-orange-600 mr-2">מנוח {contextualResult.adjustedRestSeconds}ש׳</span>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {loading && (
                  <div className="text-center py-8 text-gray-500">טוען נתונים...</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
