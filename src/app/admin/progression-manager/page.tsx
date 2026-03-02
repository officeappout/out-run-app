"use client";

// Force dynamic rendering to prevent SSR issues with window/localStorage
export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';
import { 
  getAllPrograms,
  Program
} from '@/features/content/programs';
import { 
  ProgressionRule,
  LinkedProgramConfig,
  DEFAULT_PROGRESSION_BY_LEVEL,
  getDefaultRequiredSets
} from '@/features/user/core/types/progression.types';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc,
  updateDoc, 
  deleteDoc, 
  query, 
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { 
  Plus, 
  Edit2, 
  Trash2, 
  Save, 
  X, 
  TrendingUp, 
  Zap,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Check,
  HelpCircle,
  Sparkles,
  Dumbbell,
  Shield,
  CopyPlus,
} from 'lucide-react';
import {
  getProgramLevelSettingsByProgram,
  saveProgramLevelSettings,
} from '@/features/content/programs/core/programLevelSettings.service';
import type { ProgramLevelSettings, MovementPattern } from '@/features/content/programs/core/program.types';

const PROGRESSION_RULES_COLLECTION = 'progression_rules';

// ============================================================================
// PATTERN LABELS + VOLUME DEFAULTS (Lead Program Model)
// ============================================================================

const PATTERN_LABELS: Record<MovementPattern, { label: string; emoji: string }> = {
  push: { label: 'Push (דחיפה)', emoji: '💪' },
  pull: { label: 'Pull (משיכה)', emoji: '🏋️' },
  legs: { label: 'Legs (רגליים)', emoji: '🦵' },
  core: { label: 'Core (ליבה)', emoji: '🧘' },
};

/** Default weekly volume target when no ProgramLevelSettings exist. */
function getDefaultVolumeTarget(level: number): number {
  if (level <= 5) return 8;
  if (level <= 12) return 12;
  return 16;
}

/** Default max intense (3-bolt) sessions per week. */
function getDefaultMaxIntense(level: number): number {
  if (level <= 5) return 0;
  if (level <= 12) return 2;
  return 99;
}

/** Professional defaults: Base Gain by tier. */
function getProfessionalBaseGain(level: number): number {
  if (level <= 5) return 8;
  if (level <= 13) return 6;
  if (level <= 19) return 4;
  return 2;
}

/** Professional defaults: First-Session Bonus by tier. */
function getProfessionalFirstSessionBonus(level: number): number {
  if (level <= 13) return 3;
  if (level <= 19) return 1.5;
  return 0.5;
}

/** Professional defaults: Max Sets (Hard Cap) by tier. */
function getProfessionalMaxSets(level: number): number {
  if (level <= 5) return 20;
  if (level <= 12) return 24;
  if (level <= 19) return 30;
  return 35;
}

/** Professional defaults: RPE Bonus (1-5 +2%, 6-7 +1%, 8-10 0%). */
const PROFESSIONAL_RPE_BONUS: Record<string, number> = {
  '1': 2, '2': 2, '3': 2, '4': 2, '5': 2,
  '6': 1, '7': 1,
  '8': 0, '9': 0, '10': 0,
};

/** Professional defaults: Persistence (S2 +1%, S5 +2%, S7 +3%). */
const PROFESSIONAL_PERSISTENCE_BONUS: Record<string, number> = {
  '2': 1, '5': 2, '7': 3, '8': 3, '9': 3, '10': 3,
};

/** Legacy: Default max sets (fallback). */
function getDefaultMaxSets(level: number): number {
  return getProfessionalMaxSets(level);
}

// ============================================================================
// FIRESTORE SERVICE FUNCTIONS
// ============================================================================

async function getProgressionRulesForProgram(programId: string): Promise<ProgressionRule[]> {
  try {
    const q = query(
      collection(db, PROGRESSION_RULES_COLLECTION),
      where('programId', '==', programId),
      orderBy('level', 'asc')
    );
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.() || undefined,
      updatedAt: doc.data().updatedAt?.toDate?.() || undefined,
    })) as ProgressionRule[];
  } catch (error) {
    console.error('Error fetching progression rules:', error);
    return [];
  }
}

async function saveProgressionRule(rule: Omit<ProgressionRule, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<string> {
  try {
    const docId = rule.id || `${rule.programId}_level_${rule.level}`;
    const docRef = doc(db, PROGRESSION_RULES_COLLECTION, docId);
    
    // Explicitly construct the payload — never rely on spread to avoid silent field omission
    const payload: Record<string, any> = {
      programId: rule.programId,
      level: Number(rule.level),
      baseSessionGain: Number(rule.baseSessionGain),
      bonusPercent: Number(rule.bonusPercent),
      requiredSetsForFullGain: Number(rule.requiredSetsForFullGain),
      linkedPrograms: rule.linkedPrograms ?? [],
      description: rule.description ?? '',
    };
    
    console.log('[ProgressionManager] Saving rule:', docId, payload);
    
    const existing = await getDoc(docRef);
    
    if (existing.exists()) {
      await updateDoc(docRef, {
        ...payload,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(docRef, {
        ...payload,
        id: docId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    
    console.log('[ProgressionManager] ✅ Rule saved successfully:', docId);
    return docId;
  } catch (error) {
    console.error('Error saving progression rule:', error);
    throw error;
  }
}

async function deleteProgressionRule(ruleId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, PROGRESSION_RULES_COLLECTION, ruleId));
  } catch (error) {
    console.error('Error deleting progression rule:', error);
    throw error;
  }
}

async function generateDefaultRulesForProgram(programId: string, maxLevels: number = 10): Promise<void> {
  try {
    for (let level = 1; level <= maxLevels; level++) {
      const defaults = DEFAULT_PROGRESSION_BY_LEVEL[Math.min(level, 10)] || DEFAULT_PROGRESSION_BY_LEVEL[10];
      await saveProgressionRule({
        programId,
        level,
        baseSessionGain: defaults.baseGain,
        bonusPercent: defaults.bonusPercent,
        requiredSetsForFullGain: getDefaultRequiredSets(level),
        linkedPrograms: [],
        description: `רמה ${level} - ברירת מחדל`,
      });
    }
  } catch (error) {
    console.error('Error generating default rules:', error);
    throw error;
  }
}

// ============================================================================
// TYPES
// ============================================================================

interface LevelRuleForm {
  level: number;
  baseSessionGain: number;
  bonusPercent: number;
  requiredSetsForFullGain: number;
  linkedPrograms: LinkedProgramConfig[];
  description: string;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function ProgressionManagerPage() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);
  const [rules, setRules] = useState<ProgressionRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedLevels, setExpandedLevels] = useState<Set<number>>(new Set());
  const [editingLevel, setEditingLevel] = useState<number | null>(null);
  const [showAddNew, setShowAddNew] = useState(false);

  // ── ProgramLevelSettings cache (Training OS per-program) ────────────
  const [levelSettingsMap, setLevelSettingsMap] = useState<Record<number, ProgramLevelSettings>>({});
  // Track pending edits to Training OS fields before save
  const [pendingOS, setPendingOS] = useState<Record<number, {
    weeklyVolumeTarget?: number;
    maxIntenseWorkoutsPerWeek?: number;
    straightArmRatio?: number;
    maxSets?: number;
    baseGain?: number;
    firstSessionBonus?: number;
    persistenceBonusConfig?: Record<string, number>;
    rpeBonusConfig?: Record<string, number>;
    parentLevelMapping?: Record<string, number>;
  }>>({});
  
  const [ruleForm, setRuleForm] = useState<LevelRuleForm>({
    level: 1,
    baseSessionGain: 10,
    bonusPercent: 5,
    requiredSetsForFullGain: 4,
    linkedPrograms: [],
    description: '',
  });

  // Load programs on mount
  useEffect(() => {
    loadPrograms();
  }, []);

  // Load rules when program is selected
  useEffect(() => {
    if (selectedProgramId) {
      loadRulesForProgram(selectedProgramId);
    }
  }, [selectedProgramId]);

  const loadPrograms = async () => {
    setLoading(true);
    try {
      const data = await getAllPrograms();
      setPrograms(data);
      if (data.length > 0 && !selectedProgramId) {
        setSelectedProgramId(data[0].id);
      }
    } catch (error) {
      console.error('Error loading programs:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadRulesForProgram = async (programId: string) => {
    setLoading(true);
    try {
      const [data, settings] = await Promise.all([
        getProgressionRulesForProgram(programId),
        getProgramLevelSettingsByProgram(programId),
      ]);
      setRules(data);
      // Build level → settings map
      const map: Record<number, ProgramLevelSettings> = {};
      for (const s of settings) {
        map[s.levelNumber] = s;
      }
      setLevelSettingsMap(map);
      setPendingOS({}); // Reset pending edits on program switch
    } catch (error) {
      console.error('Error loading rules:', error);
    } finally {
      setLoading(false);
    }
  };

  const getDefaultsForLevel = (level: number) => {
    const defaults = DEFAULT_PROGRESSION_BY_LEVEL[Math.min(level, 10)] || DEFAULT_PROGRESSION_BY_LEVEL[10];
    return defaults;
  };

  const handleStartEdit = (rule: ProgressionRule) => {
    const lvl = rule.level;
    setEditingLevel(lvl);
    setRuleForm({
      level: lvl,
      baseSessionGain: rule.baseSessionGain ?? getProfessionalBaseGain(lvl),
      bonusPercent: rule.bonusPercent,
      requiredSetsForFullGain: rule.requiredSetsForFullGain || getDefaultRequiredSets(lvl),
      linkedPrograms: rule.linkedPrograms || [],
      description: rule.description || '',
    });
    // Seed pendingOS with professional defaults when level has no saved settings (so Save persists them)
    const existing = levelSettingsMap[lvl];
    if (!existing?.baseGain && !pendingOS[lvl]?.baseGain) {
      setPendingOS((prev) => ({
        ...prev,
        [lvl]: {
          ...prev[lvl],
          baseGain: getProfessionalBaseGain(lvl),
          firstSessionBonus: getProfessionalFirstSessionBonus(lvl),
          maxSets: getProfessionalMaxSets(lvl),
          persistenceBonusConfig: PROFESSIONAL_PERSISTENCE_BONUS,
          rpeBonusConfig: PROFESSIONAL_RPE_BONUS,
        },
      }));
    }
    setExpandedLevels(prev => new Set([...prev, lvl]));
    setShowAddNew(false);
  };

  const handleStartNew = () => {
    const existingLevels = rules.map(r => r.level);
    const nextLevel = Math.max(0, ...existingLevels) + 1;
    const defaults = getDefaultsForLevel(nextLevel);
    
    setRuleForm({
      level: nextLevel,
      baseSessionGain: getProfessionalBaseGain(nextLevel),
      bonusPercent: defaults.bonusPercent,
      requiredSetsForFullGain: getDefaultRequiredSets(nextLevel),
      linkedPrograms: [],
      description: '',
    });
    // Seed pendingOS with professional defaults for new level
    setPendingOS((prev) => ({
      ...prev,
      [nextLevel]: {
        ...prev[nextLevel],
        baseGain: getProfessionalBaseGain(nextLevel),
        firstSessionBonus: getProfessionalFirstSessionBonus(nextLevel),
        maxSets: getProfessionalMaxSets(nextLevel),
        persistenceBonusConfig: PROFESSIONAL_PERSISTENCE_BONUS,
        rpeBonusConfig: PROFESSIONAL_RPE_BONUS,
      },
    }));
    setShowAddNew(true);
    setEditingLevel(null);
  };

  const handleCancel = () => {
    setEditingLevel(null);
    setShowAddNew(false);
  };

  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  // Bulk Clone dialog
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
  const [cloneRangeFrom, setCloneRangeFrom] = useState<number>(2);
  const [cloneRangeTo, setCloneRangeTo] = useState<number>(5);
  const [cloneInProgress, setCloneInProgress] = useState(false);

  const handleSave = async () => {
    if (!selectedProgramId) return;
    
    setSaving(true);
    setSaveSuccess(null);
    try {
      const existingRule = rules.find(r => r.level === ruleForm.level);
      
      const lvl = Number(ruleForm.level) || 1;
      const effectiveBaseGain = pendingOS[lvl]?.baseGain ?? levelSettingsMap[lvl]?.baseGain ?? ruleForm.baseSessionGain;
      const savePayload = {
        id: existingRule?.id,
        programId: selectedProgramId,
        level: lvl,
        baseSessionGain: Number(effectiveBaseGain) || 1,
        bonusPercent: Number(ruleForm.bonusPercent) || 0,
        requiredSetsForFullGain: Number(ruleForm.requiredSetsForFullGain) || 4,
        linkedPrograms: ruleForm.linkedPrograms || [],
        description: ruleForm.description || '',
      };
      
      console.log('[ProgressionManager] handleSave payload:', savePayload);
      
      await saveProgressionRule(savePayload);
      
      // Always persist Incentives & Gains to programLevelSettings (resolved values from getters)
      if (selectedProgramId) {
        const existing = levelSettingsMap[lvl];
        await saveProgramLevelSettings({
          programId: selectedProgramId,
          levelNumber: lvl,
          levelDescription: existing?.levelDescription ?? `Level ${lvl}`,
          progressionWeight: existing?.progressionWeight ?? 1.0,
          intensityModifier: existing?.intensityModifier ?? 1.0,
          restMultiplier: existing?.restMultiplier ?? 1.0,
          volumeAdjustment: existing?.volumeAdjustment ?? 0,
          targetGoals: existing?.targetGoals ?? [],
          weeklyVolumeTarget: getVolumeTarget(lvl),
          maxIntenseWorkoutsPerWeek: getMaxIntenseValue(lvl),
          straightArmRatio: getStraightArmRatio(lvl),
          maxSets: getMaxSets(lvl),
          baseGain: getBaseGain(lvl),
          firstSessionBonus: getFirstSessionBonus(lvl),
          persistenceBonusConfig: getPersistenceBonusConfig(lvl),
          rpeBonusConfig: getRpeBonusConfig(lvl),
          parentLevelMapping: getParentLevelMapping(lvl),
        });
      }

      await loadRulesForProgram(selectedProgramId);
      setEditingLevel(null);
      setShowAddNew(false);
      
      // Show success notification
      setSaveSuccess(`רמה ${savePayload.level} נשמרה בהצלחה ✓`);
      setTimeout(() => setSaveSuccess(null), 3000);
    } catch (error) {
      console.error('Error saving rule:', error);
      alert('שגיאה בשמירת ההגדרות');
    } finally {
      setSaving(false);
    }
  };

  const handleBulkClone = async () => {
    if (!selectedProgramId) return;
    const sourceLevel = ruleForm.level;
    const from = Math.min(cloneRangeFrom, cloneRangeTo);
    const to = Math.max(cloneRangeFrom, cloneRangeTo);
    if (from < 1 || to > 30) {
      alert('טווח לא תקין. השתמש ברמות 1–30.');
      return;
    }
    const targetLevels = Array.from({ length: to - from + 1 }, (_, i) => from + i).filter((l) => l !== sourceLevel);
    if (targetLevels.length === 0) {
      alert('אין רמות יעד בטווח (הרמה המקורית לא נכללת).');
      return;
    }
    setCloneInProgress(true);
    try {
      const sourceRule = rules.find((r) => r.level === sourceLevel);
      const sourceSettings = {
        baseGain: getBaseGain(sourceLevel),
        firstSessionBonus: getFirstSessionBonus(sourceLevel),
        maxSets: getMaxSets(sourceLevel),
        weeklyVolumeTarget: getVolumeTarget(sourceLevel),
        persistenceBonusConfig: getPersistenceBonusConfig(sourceLevel),
        rpeBonusConfig: getRpeBonusConfig(sourceLevel),
        parentLevelMapping: getParentLevelMapping(sourceLevel),
        straightArmRatio: getStraightArmRatio(sourceLevel),
      };
      for (const targetLevel of targetLevels) {
        const existing = levelSettingsMap[targetLevel];
        await saveProgramLevelSettings({
          programId: selectedProgramId,
          levelNumber: targetLevel,
          levelDescription: existing?.levelDescription ?? `Level ${targetLevel}`,
          progressionWeight: existing?.progressionWeight ?? 1.0,
          intensityModifier: existing?.intensityModifier ?? 1.0,
          restMultiplier: existing?.restMultiplier ?? 1.0,
          volumeAdjustment: existing?.volumeAdjustment ?? 0,
          targetGoals: existing?.targetGoals ?? [],
          ...sourceSettings,
        });
        // Sync progression_rules so baseSessionGain is consistent
        if (sourceRule) {
          await saveProgressionRule({
            programId: selectedProgramId,
            level: targetLevel,
            baseSessionGain: sourceSettings.baseGain,
            bonusPercent: sourceRule.bonusPercent,
            requiredSetsForFullGain: sourceRule.requiredSetsForFullGain || getDefaultRequiredSets(targetLevel),
            linkedPrograms: sourceRule.linkedPrograms || [],
            description: sourceRule.description || '',
          });
        }
      }
      setCloneDialogOpen(false);
      setSaveSuccess(`Level ${sourceLevel} settings applied to levels ${from}-${to} successfully.`);
      setTimeout(() => setSaveSuccess(null), 5000);
      await loadRulesForProgram(selectedProgramId);
    } catch (error) {
      console.error('Bulk clone error:', error);
      alert('שגיאה בשכפול: ' + (error instanceof Error ? error.message : 'Unknown'));
    } finally {
      setCloneInProgress(false);
    }
  };

  const handleDelete = async (ruleId: string) => {
    if (!confirm('האם אתה בטוח שברצונך למחוק את הגדרות הרמה?')) return;
    
    try {
      await deleteProgressionRule(ruleId);
      if (selectedProgramId) {
        await loadRulesForProgram(selectedProgramId);
      }
    } catch (error) {
      console.error('Error deleting rule:', error);
      alert('שגיאה במחיקה');
    }
  };

  const handleGenerateDefaults = async () => {
    if (!selectedProgramId || !selectedProgram) return;
    if (!confirm('האם ליצור הגדרות ברירת מחדל לכל הרמות? פעולה זו תדרוס הגדרות קיימות.')) return;
    
    setSaving(true);
    try {
      await generateDefaultRulesForProgram(selectedProgramId, selectedProgram.maxLevels || 10);
      await loadRulesForProgram(selectedProgramId);
    } catch (error) {
      console.error('Error generating defaults:', error);
      alert('שגיאה ביצירת ברירות מחדל');
    } finally {
      setSaving(false);
    }
  };

  const handleMasterEvolutionSync = async () => {
    if (!confirm('האם להריץ Master Evolution Sync? ימלא את כל programLevelSettings בנתוני Incentives & Gains (8/6/4/2%, RPE, Persistence).')) return;
    setSaving(true);
    setSaveSuccess('Syncing...');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60_000);

    try {
      const res = await fetch('/api/admin/master-evolution-sync', {
        method: 'POST',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sync failed');
      setSaveSuccess(`Success! ${data.programsProcessed} programs, ${data.levelsUpdated} levels updated ✓`);
      setTimeout(() => setSaveSuccess(null), 5000);
      if (selectedProgramId) await loadRulesForProgram(selectedProgramId);
    } catch (error) {
      clearTimeout(timeoutId);
      const isTimeout = error instanceof Error && error.name === 'AbortError';
      setSaveSuccess(null);
      if (isTimeout) {
        alert('Sync is taking longer than expected. Please check Firestore to see progress.');
      } else {
        alert('שגיאה ב-Sync: ' + (error instanceof Error ? error.message : 'Unknown'));
      }
      console.error('Master Evolution Sync error:', error);
    } finally {
      setSaving(false);
    }
  };

  const toggleLevelExpand = (level: number) => {
    setExpandedLevels(prev => {
      const newSet = new Set(prev);
      if (newSet.has(level)) {
        newSet.delete(level);
      } else {
        newSet.add(level);
      }
      return newSet;
    });
  };

  // ── ProgramLevelSettings helpers (Lead Program Model) ──────────────
  const selectedProgram = programs.find(p => p.id === selectedProgramId);
  const activePattern = selectedProgram?.movementPattern as MovementPattern | undefined;

  /** Read weeklyVolumeTarget for a level (pending edits → saved → default) */
  const getVolumeTarget = (level: number): number => {
    return pendingOS[level]?.weeklyVolumeTarget
      ?? levelSettingsMap[level]?.weeklyVolumeTarget
      ?? getDefaultVolumeTarget(level);
  };

  /** Write weeklyVolumeTarget for a level (pending edit, saved on submit) */
  const setVolumeTarget = (level: number, value: number) => {
    setPendingOS((prev) => ({
      ...prev,
      [level]: { ...prev[level], weeklyVolumeTarget: value },
    }));
  };

  /** Read maxIntenseWorkoutsPerWeek for a level */
  const getMaxIntenseValue = (level: number): number => {
    return pendingOS[level]?.maxIntenseWorkoutsPerWeek
      ?? levelSettingsMap[level]?.maxIntenseWorkoutsPerWeek
      ?? getDefaultMaxIntense(level);
  };

  /** Write maxIntenseWorkoutsPerWeek for a level (pending edit, saved on submit) */
  const setMaxIntenseValue = (level: number, value: number) => {
    setPendingOS((prev) => ({
      ...prev,
      [level]: { ...prev[level], maxIntenseWorkoutsPerWeek: value },
    }));
  };

  /** Read straightArmRatio for a level */
  const getStraightArmRatio = (level: number): number => {
    return pendingOS[level]?.straightArmRatio
      ?? levelSettingsMap[level]?.straightArmRatio
      ?? (level <= 10 ? 0.4 : 0.5);
  };

  /** Write straightArmRatio for a level */
  const setStraightArmRatio = (level: number, value: number) => {
    setPendingOS((prev) => ({
      ...prev,
      [level]: { ...prev[level], straightArmRatio: value },
    }));
  };

  /** Read maxSets (Hard Cap) for a level */
  const getMaxSets = (level: number): number => {
    return pendingOS[level]?.maxSets
      ?? levelSettingsMap[level]?.maxSets
      ?? getProfessionalMaxSets(level);
  };

  /** Write maxSets for a level */
  const setMaxSets = (level: number, value: number) => {
    setPendingOS((prev) => ({
      ...prev,
      [level]: { ...prev[level], maxSets: value },
    }));
  };

  /** Read baseGain for a level (with professional default when empty) */
  const getBaseGain = (level: number): number =>
    pendingOS[level]?.baseGain ?? levelSettingsMap[level]?.baseGain ?? getProfessionalBaseGain(level);
  const setBaseGain = (level: number, value: number | undefined) =>
    setPendingOS((prev) => ({ ...prev, [level]: { ...prev[level], baseGain: value } }));

  /** Read firstSessionBonus for a level (with professional default when empty) */
  const getFirstSessionBonus = (level: number): number =>
    pendingOS[level]?.firstSessionBonus ?? levelSettingsMap[level]?.firstSessionBonus ?? getProfessionalFirstSessionBonus(level);
  const setFirstSessionBonus = (level: number, value: number | undefined) =>
    setPendingOS((prev) => ({ ...prev, [level]: { ...prev[level], firstSessionBonus: value } }));

  /** Read persistenceBonusConfig for a level (with professional default when empty) */
  const getPersistenceBonusConfig = (level: number): Record<string, number> =>
    pendingOS[level]?.persistenceBonusConfig ?? levelSettingsMap[level]?.persistenceBonusConfig ?? PROFESSIONAL_PERSISTENCE_BONUS;
  const setPersistenceBonusConfig = (level: number, value: Record<string, number> | undefined) =>
    setPendingOS((prev) => ({ ...prev, [level]: { ...prev[level], persistenceBonusConfig: value } }));

  /** Read rpeBonusConfig for a level (with professional default when empty) */
  const getRpeBonusConfig = (level: number): Record<string, number> =>
    pendingOS[level]?.rpeBonusConfig ?? levelSettingsMap[level]?.rpeBonusConfig ?? PROFESSIONAL_RPE_BONUS;
  const setRpeBonusConfig = (level: number, value: Record<string, number> | undefined) =>
    setPendingOS((prev) => ({ ...prev, [level]: { ...prev[level], rpeBonusConfig: value } }));

  /** Read parentLevelMapping for a level (grandchild inheritance) */
  const getParentLevelMapping = (level: number): Record<string, number> | undefined =>
    pendingOS[level]?.parentLevelMapping ?? levelSettingsMap[level]?.parentLevelMapping;
  const setParentLevelMapping = (level: number, value: Record<string, number> | undefined) =>
    setPendingOS((prev) => ({ ...prev, [level]: { ...prev[level], parentLevelMapping: value } }));

  // defaultRestSeconds removed — Tier Engine is now the single source of truth

  // Generate levels 1-20 for display
  const displayLevels = Array.from({ length: selectedProgram?.maxLevels || 20 }, (_, i) => i + 1);

  if (loading && programs.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">טוען...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-gray-900 flex items-center gap-3">
            <TrendingUp className="text-violet-500" size={32} />
            מנהל התקדמות (Progression Manager)
          </h1>
          <p className="text-gray-500 mt-2">
            הגדר כמה אחוזים המשתמש מתקדם בכל אימון ותוכניות מקושרות
          </p>
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-gradient-to-r from-violet-50 to-purple-50 border border-violet-200 rounded-2xl p-4">
        <div className="flex items-start gap-3">
          <HelpCircle className="text-violet-500 flex-shrink-0 mt-0.5" size={20} />
          <div className="text-sm text-violet-800">
            <p className="font-bold mb-1">איך זה עובד? (Volume-Based Progression)</p>
            <ul className="space-y-1 text-violet-700">
              <li>• <strong>רווח בסיסי (baseSessionGain)</strong>: אחוז ההתקדמות המקסימלי לאימון מלא</li>
              <li>• <strong>סטים נדרשים (requiredSetsForFullGain)</strong>: כמות הסטים הנדרשת לקבלת 100% מהרווח</li>
              <li>• <strong>נוסחה</strong>: <code className="bg-white/50 px-1 rounded">min(1, סטים שבוצעו ÷ סטים נדרשים) × רווח בסיסי</code></li>
              <li>• <strong>בונוס (bonusPercent)</strong>: אחוז נוסף כשהמשתמש עובר את יעד החזרות</li>
            </ul>
            <p className="mt-2 text-xs text-violet-600">דוגמה: אם נדרשים 4 סטים והמשתמש עשה 2, הוא יקבל 50% מהרווח הבסיסי.</p>
          </div>
        </div>
      </div>

      {/* Program Selector */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <label className="block text-sm font-bold text-gray-700 mb-3">בחר תוכנית</label>
        <div className="flex flex-wrap gap-2">
          {programs.map(program => (
            <button
              key={program.id}
              onClick={() => setSelectedProgramId(program.id)}
              className={`px-4 py-2 rounded-xl font-semibold transition-all ${
                selectedProgramId === program.id
                  ? 'bg-violet-500 text-white shadow-lg scale-105'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {program.name}
              {program.isMaster && (
                <span className="mr-2 text-xs opacity-70">(Master)</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {selectedProgram && (
        <>
          {/* Program Info + Actions */}
          <div className="bg-gradient-to-r from-violet-500 to-purple-600 rounded-2xl p-6 text-white">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-bold mb-2">{selectedProgram.name}</h2>
                <p className="opacity-80 mb-4">{selectedProgram.description || 'אין תיאור'}</p>
                <div className="flex gap-4 text-sm">
                  <span className="bg-white/20 px-3 py-1 rounded-full">
                    {rules.length} רמות מוגדרות
                  </span>
                  {selectedProgram.isMaster && (
                    <span className="bg-yellow-400/30 px-3 py-1 rounded-full">
                      תוכנית מאסטר
                    </span>
                  )}
                  {selectedProgram.maxLevels && (
                    <span className="bg-white/20 px-3 py-1 rounded-full">
                      עד {selectedProgram.maxLevels} רמות
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleGenerateDefaults}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl font-bold transition-colors disabled:opacity-50"
                >
                  <Sparkles size={18} />
                  צור ברירות מחדל
                </button>
                <button
                  onClick={handleMasterEvolutionSync}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-500/80 hover:bg-indigo-500 text-white rounded-xl font-bold transition-colors disabled:opacity-50"
                >
                  <TrendingUp size={18} />
                  Master Evolution Sync
                </button>
              </div>
            </div>
          </div>

          {/* Success / Sync Toast Notification */}
          {saveSuccess && (
            <div className={`rounded-xl p-4 flex items-center gap-3 ${saveSuccess.startsWith('Syncing') ? 'bg-indigo-50 border border-indigo-300' : 'bg-green-50 border border-green-300 animate-pulse'}`}>
              {saveSuccess.startsWith('Syncing') ? (
                <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              ) : (
                <Check className="text-green-600 flex-shrink-0" size={20} />
              )}
              <span className={`font-bold ${saveSuccess.startsWith('Syncing') ? 'text-indigo-800' : 'text-green-800'}`}>{saveSuccess}</span>
            </div>
          )}

          {/* Bulk Clone Dialog */}
          {cloneDialogOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
              <div className="bg-white rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl">
                <h3 className="text-lg font-bold text-gray-900 mb-2">Clone to Range</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Apply Level {ruleForm.level} settings to levels:
                </p>
                <div className="flex items-center gap-3 mb-6">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">From</label>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={cloneRangeFrom}
                      onChange={(e) => setCloneRangeFrom(parseInt(e.target.value, 10) || 1)}
                      className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-center font-bold"
                    />
                  </div>
                  <span className="text-gray-400 mt-6">—</span>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">To</label>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={cloneRangeTo}
                      onChange={(e) => setCloneRangeTo(parseInt(e.target.value, 10) || 1)}
                      className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-center font-bold"
                    />
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleBulkClone}
                    disabled={cloneInProgress}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-500 text-white rounded-xl font-bold hover:bg-indigo-600 transition-colors disabled:opacity-50"
                  >
                    {cloneInProgress ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Cloning...
                      </>
                    ) : (
                      <>
                        <CopyPlus size={18} />
                        Apply Clone
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setCloneDialogOpen(false)}
                    disabled={cloneInProgress}
                    className="flex-1 px-4 py-2.5 bg-gray-200 text-gray-700 rounded-xl font-bold hover:bg-gray-300 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Add New Level Button */}
          <button
            onClick={handleStartNew}
            className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-violet-100 text-violet-700 rounded-xl font-bold hover:bg-violet-200 transition-colors border-2 border-dashed border-violet-300"
          >
            <Plus size={20} />
            הוסף הגדרות לרמה חדשה
          </button>

          {/* New Level Form */}
          {showAddNew && (
            <div className="bg-white rounded-2xl border-2 border-violet-500 p-6 shadow-lg">
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Zap className="text-violet-500" />
                הגדרות רמה חדשה
              </h3>
              <LevelRuleForm
                form={ruleForm}
                programs={programs}
                selectedProgramId={selectedProgramId}
                onChange={setRuleForm}
                onSave={handleSave}
                onCancel={handleCancel}
                saving={saving}
                activePattern={activePattern}
                volumeValue={getVolumeTarget(ruleForm.level)}
                onVolumeChange={(v) => setVolumeTarget(ruleForm.level, v)}
                maxIntense={getMaxIntenseValue(ruleForm.level)}
                onMaxIntenseChange={(v) => setMaxIntenseValue(ruleForm.level, v)}
                straightArmRatio={getStraightArmRatio(ruleForm.level)}
                onStraightArmRatioChange={(v) => setStraightArmRatio(ruleForm.level, v)}
                            maxSets={getMaxSets(ruleForm.level)}
                            onMaxSetsChange={(v) => setMaxSets(ruleForm.level, v)}
                            baseGain={getBaseGain(ruleForm.level)}
                            onBaseGainChange={(v) => setBaseGain(ruleForm.level, v)}
                            firstSessionBonus={getFirstSessionBonus(ruleForm.level)}
                            onFirstSessionBonusChange={(v) => setFirstSessionBonus(ruleForm.level, v)}
                            persistenceBonusConfig={getPersistenceBonusConfig(ruleForm.level)}
                            onPersistenceBonusConfigChange={(v) => setPersistenceBonusConfig(ruleForm.level, v)}
                            rpeBonusConfig={getRpeBonusConfig(ruleForm.level)}
                            onRpeBonusConfigChange={(v) => setRpeBonusConfig(ruleForm.level, v)}
                            parentLevelMapping={getParentLevelMapping(ruleForm.level)}
                            onParentLevelMappingChange={(v) => setParentLevelMapping(ruleForm.level, v)}
                          />
            </div>
          )}

          {/* Timeline View */}
          <div className="relative">
            {/* Timeline connector */}
            <div className="absolute right-8 top-8 bottom-8 w-1 bg-gradient-to-b from-violet-500 via-purple-500 to-pink-500 rounded-full" />
            
            <div className="space-y-3">
              {displayLevels.map(level => {
                const rule = rules.find(r => r.level === level);
                const defaults = getDefaultsForLevel(level);
                const isExpanded = expandedLevels.has(level);
                const isEditing = editingLevel === level;

                return (
                  <div
                    key={level}
                    className={`relative bg-white rounded-2xl border overflow-hidden transition-all mr-12 ${
                      rule ? 'border-violet-200' : 'border-gray-200 opacity-60'
                    } ${isEditing ? 'border-2 border-violet-500 shadow-lg' : 'shadow-sm hover:shadow-md'}`}
                  >
                    {/* Timeline dot */}
                    <div className={`absolute -right-[52px] top-6 w-8 h-8 rounded-full border-4 border-white shadow-md flex items-center justify-center text-white text-sm font-bold ${
                      rule ? 'bg-violet-500' : 'bg-gray-300'
                    }`}>
                      {level}
                    </div>

                    {/* Level Header */}
                    <div
                      className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
                      onClick={() => !isEditing && toggleLevelExpand(level)}
                    >
                      <div className="flex items-center gap-4">
                        {isExpanded ? (
                          <ChevronDown className="text-gray-400" size={20} />
                        ) : (
                          <ChevronRight className="text-gray-400" size={20} />
                        )}
                        
                        <div>
                          <h3 className="font-bold text-gray-900">רמה {level}</h3>
                          {rule ? (
                            <p className="text-sm text-gray-500">
                              {getBaseGain(level)}% בסיס | {rule.bonusPercent}% בונוס | {rule.requiredSetsForFullGain || getDefaultRequiredSets(level)} סטים
                            </p>
                          ) : (
                            <p className="text-sm text-gray-400">
                              ברירת מחדל: {getProfessionalBaseGain(level)}% בסיס | {defaults.bonusPercent}% בונוס | {getDefaultRequiredSets(level)} סטים
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {rule ? (
                          <>
                            <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full flex items-center gap-1">
                              <Check size={12} />
                              מוגדר
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStartEdit(rule);
                              }}
                              className="p-2 hover:bg-blue-50 text-blue-600 rounded-lg transition-colors"
                              title="ערוך"
                            >
                              <Edit2 size={18} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStartEdit(rule);
                                setCloneRangeFrom(rule.level + 1);
                                setCloneRangeTo(Math.min(rule.level + 4, selectedProgram?.maxLevels || 25));
                                setCloneDialogOpen(true);
                              }}
                              className="p-2 hover:bg-indigo-50 text-indigo-600 rounded-lg transition-colors"
                              title="Clone to Range"
                            >
                              <CopyPlus size={18} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(rule.id);
                              }}
                              className="p-2 hover:bg-red-50 text-red-600 rounded-lg transition-colors"
                              title="מחק"
                            >
                              <Trash2 size={18} />
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setRuleForm({
                                level,
                                baseSessionGain: getProfessionalBaseGain(level),
                                bonusPercent: defaults.bonusPercent,
                                requiredSetsForFullGain: getDefaultRequiredSets(level),
                                linkedPrograms: [],
                                description: '',
                              });
                              setPendingOS((prev) => ({
                                ...prev,
                                [level]: {
                                  ...prev[level],
                                  baseGain: getProfessionalBaseGain(level),
                                  firstSessionBonus: getProfessionalFirstSessionBonus(level),
                                  maxSets: getProfessionalMaxSets(level),
                                  persistenceBonusConfig: PROFESSIONAL_PERSISTENCE_BONUS,
                                  rpeBonusConfig: PROFESSIONAL_RPE_BONUS,
                                },
                              }));
                              setShowAddNew(true);
                              setEditingLevel(null);
                            }}
                            className="px-3 py-1 bg-violet-100 text-violet-700 text-sm font-semibold rounded-lg hover:bg-violet-200 transition-colors"
                          >
                            הגדר
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Expanded Content or Edit Form */}
                    {(isExpanded || isEditing) && (
                      <div className="border-t border-gray-100 p-4 bg-gray-50">
                        {isEditing ? (
                          <LevelRuleForm
                            form={ruleForm}
                            programs={programs}
                            selectedProgramId={selectedProgramId}
                            onChange={setRuleForm}
                            onSave={handleSave}
                            onCancel={handleCancel}
                            saving={saving}
                            onCloneToRange={() => {
                              setCloneRangeFrom(ruleForm.level + 1);
                              setCloneRangeTo(Math.min(ruleForm.level + 4, selectedProgram?.maxLevels || 25));
                              setCloneDialogOpen(true);
                            }}
                            activePattern={activePattern}
                            volumeValue={getVolumeTarget(ruleForm.level)}
                            onVolumeChange={(v) => setVolumeTarget(ruleForm.level, v)}
                            maxIntense={getMaxIntenseValue(ruleForm.level)}
                            onMaxIntenseChange={(v) => setMaxIntenseValue(ruleForm.level, v)}
                            straightArmRatio={getStraightArmRatio(ruleForm.level)}
                            onStraightArmRatioChange={(v) => setStraightArmRatio(ruleForm.level, v)}
                            maxSets={getMaxSets(ruleForm.level)}
                            onMaxSetsChange={(v) => setMaxSets(ruleForm.level, v)}
                            baseGain={getBaseGain(ruleForm.level)}
                            onBaseGainChange={(v) => setBaseGain(ruleForm.level, v)}
                            firstSessionBonus={getFirstSessionBonus(ruleForm.level)}
                            onFirstSessionBonusChange={(v) => setFirstSessionBonus(ruleForm.level, v)}
                            persistenceBonusConfig={getPersistenceBonusConfig(ruleForm.level)}
                            onPersistenceBonusConfigChange={(v) => setPersistenceBonusConfig(ruleForm.level, v)}
                            rpeBonusConfig={getRpeBonusConfig(ruleForm.level)}
                            onRpeBonusConfigChange={(v) => setRpeBonusConfig(ruleForm.level, v)}
                            parentLevelMapping={getParentLevelMapping(ruleForm.level)}
                            onParentLevelMappingChange={(v) => setParentLevelMapping(ruleForm.level, v)}
                          />
                        ) : rule ? (
                          <LevelRuleDisplay
                            rule={rule}
                            programs={programs}
                            activePattern={activePattern}
                            volumeValue={getVolumeTarget(level)}
                            maxIntense={getMaxIntenseValue(level)}
                            straightArmRatio={getStraightArmRatio(level)}
                            maxSets={getMaxSets(level)}
                            baseGain={getBaseGain(level)}
                            firstSessionBonus={getFirstSessionBonus(level)}
                            persistenceBonusConfig={getPersistenceBonusConfig(level)}
                            rpeBonusConfig={getRpeBonusConfig(level)}
                            parentLevelMapping={getParentLevelMapping(level)}
                          />
                        ) : (
                          <div className="text-center text-gray-400 py-4">
                            <AlertCircle className="mx-auto mb-2" size={24} />
                            <p>משתמש בהגדרות ברירת מחדל</p>
                            <p className="text-sm mt-1">
                              {defaults.baseGain}% בסיס לאימון | {defaults.bonusPercent}% בונוס על חריגה מהיעד
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function LevelRuleDisplay({
  rule,
  programs,
  activePattern,
  volumeValue,
  maxIntense,
  straightArmRatio,
  maxSets,
  baseGain,
  firstSessionBonus,
  persistenceBonusConfig,
  rpeBonusConfig,
  parentLevelMapping,
}: {
  rule: ProgressionRule;
  programs: Program[];
  activePattern?: MovementPattern;
  volumeValue: number;
  maxIntense: number;
  straightArmRatio: number;
  maxSets: number;
  baseGain?: number;
  firstSessionBonus?: number;
  persistenceBonusConfig?: Record<string, number>;
  rpeBonusConfig?: Record<string, number>;
  parentLevelMapping?: Record<string, number>;
}) {
  const getProgramName = (id: string) => programs.find(p => p.id === id)?.name || id;

  return (
    <div className="space-y-4">
      {/* Main Settings */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="text-sm text-gray-500 mb-1">רווח בסיסי לאימון (Base Gain %)</div>
          <div className="text-2xl font-bold text-violet-600">{baseGain ?? rule.baseSessionGain}%</div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="text-sm text-gray-500 mb-1">בונוס על חריגה מהיעד</div>
          <div className="text-2xl font-bold text-green-600">{rule.bonusPercent}%</div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="text-sm text-gray-500 mb-1">סטים נדרשים ל-100%</div>
          <div className="text-2xl font-bold text-amber-600">
            {rule.requiredSetsForFullGain || getDefaultRequiredSets(rule.level)} סטים
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-red-200">
          <div className="text-sm text-gray-500 mb-1 flex items-center gap-1.5">
            <Shield size={14} className="text-red-500" />
            מקסימום סטים לאימון (Hard Cap)
          </div>
          <div className="text-2xl font-bold text-red-700">{maxSets} סטים</div>
          <div className="text-[10px] text-red-500 mt-1">Safety Brake — מונע נפח יתר</div>
        </div>
      </div>

      {/* Progression gains & bonuses (read-only) */}
      {(firstSessionBonus != null || persistenceBonusConfig || rpeBonusConfig || parentLevelMapping) && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {firstSessionBonus != null && (
            <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-200">
              <div className="text-sm text-indigo-600 mb-1">First-Session Bonus</div>
              <div className="text-xl font-bold text-indigo-700">+{firstSessionBonus}%</div>
            </div>
          )}
          {persistenceBonusConfig && Object.keys(persistenceBonusConfig).length > 0 && (
            <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-200 col-span-2">
              <div className="text-sm text-indigo-600 mb-1">Monthly Streak (S2, S5, S7)</div>
              <div className="text-sm font-mono">{JSON.stringify(persistenceBonusConfig)}</div>
            </div>
          )}
          {rpeBonusConfig && Object.keys(rpeBonusConfig).length > 0 && (
            <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-200 col-span-2">
              <div className="text-sm text-indigo-600 mb-1">RPE Bonus Config</div>
              <div className="text-sm font-mono">{JSON.stringify(rpeBonusConfig)}</div>
            </div>
          )}
          {parentLevelMapping && Object.keys(parentLevelMapping).length > 0 && (
            <div className="bg-amber-50 rounded-xl p-4 border border-amber-200 col-span-2">
              <div className="text-sm text-amber-600 mb-1">Parent Level Mapping (Grandchild)</div>
              <div className="text-sm font-mono">{JSON.stringify(parentLevelMapping)}</div>
            </div>
          )}
        </div>
      )}

      {/* Training OS: Volume & Gating (read-only) */}
      <div className="grid grid-cols-2 gap-4">
        {activePattern && (
          <div className="bg-cyan-50 rounded-xl p-4 border border-cyan-200">
            <div className="text-sm text-cyan-600 mb-1 flex items-center gap-1.5">
              <Dumbbell size={14} />
              יעד נפח שבועי ({PATTERN_LABELS[activePattern].emoji} {PATTERN_LABELS[activePattern].label})
            </div>
            <div className="text-2xl font-bold text-cyan-700">{volumeValue} סטים/שבוע</div>
            <div className="text-[10px] text-cyan-500 mt-1">
              Lead Program — הרמה הגבוהה ביותר קובעת את התקציב לכל תוכניות ה-{PATTERN_LABELS[activePattern].label}
            </div>
          </div>
        )}
        <div className="bg-orange-50 rounded-xl p-4 border border-orange-200">
          <div className="text-sm text-orange-600 mb-1 flex items-center gap-1.5">
            <Shield size={14} />
            מקסימום 3-Bolt בשבוע
          </div>
          <div className="text-2xl font-bold text-orange-700">
            {maxIntense === 0 ? 'נעול' : maxIntense >= 99 ? '∞' : maxIntense}
          </div>
          <div className="text-[10px] text-orange-500 mt-1">ספציפי לתוכנית-רמה — הרמה הגבוהה ביותר שולטת</div>
        </div>
      </div>

      {/* SA/BA + Rest (read-only) */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-purple-50 rounded-xl p-4 border border-purple-200">
          <div className="text-sm text-purple-600 mb-1 flex items-center gap-1.5">
            <Shield size={14} />
            יחס יד ישרה (SA/BA)
          </div>
          <div className="text-2xl font-bold text-purple-700">
            {Math.round(straightArmRatio * 100)}% SA / {Math.round((1 - straightArmRatio) * 100)}% BA
          </div>
        </div>
        <div className="bg-teal-50 rounded-xl p-4 border border-teal-200">
          <div className="text-sm text-teal-600 mb-1 flex items-center gap-1.5">
            <Zap size={14} />
            מנוחה
          </div>
          <div className="text-sm font-bold text-teal-700">Tier Engine (Auto)</div>
        </div>
      </div>

      {/* Description */}
      {rule.description && (
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="text-sm text-gray-500 mb-1">תיאור</div>
          <p className="text-gray-700">{rule.description}</p>
        </div>
      )}

    </div>
  );
}

function LevelRuleForm({
  form,
  programs,
  selectedProgramId,
  onChange,
  onSave,
  onCancel,
  saving,
  onCloneToRange,
  activePattern,
  volumeValue,
  onVolumeChange,
  maxIntense,
  onMaxIntenseChange,
  straightArmRatio,
  onStraightArmRatioChange,
  maxSets,
  onMaxSetsChange,
  baseGain,
  onBaseGainChange,
  firstSessionBonus,
  onFirstSessionBonusChange,
  persistenceBonusConfig,
  onPersistenceBonusConfigChange,
  rpeBonusConfig,
  onRpeBonusConfigChange,
  parentLevelMapping,
  onParentLevelMappingChange,
}: {
  form: LevelRuleForm;
  programs: Program[];
  selectedProgramId: string | null;
  onChange: (form: LevelRuleForm) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  onCloneToRange?: () => void;
  activePattern?: MovementPattern;
  volumeValue: number;
  onVolumeChange: (value: number) => void;
  maxIntense: number;
  onMaxIntenseChange: (value: number) => void;
  straightArmRatio: number;
  onStraightArmRatioChange: (value: number) => void;
  maxSets: number;
  onMaxSetsChange: (value: number) => void;
  baseGain?: number;
  onBaseGainChange?: (value: number | undefined) => void;
  firstSessionBonus?: number;
  onFirstSessionBonusChange?: (value: number | undefined) => void;
  persistenceBonusConfig?: Record<string, number>;
  onPersistenceBonusConfigChange?: (value: Record<string, number> | undefined) => void;
  rpeBonusConfig?: Record<string, number>;
  onRpeBonusConfigChange?: (value: Record<string, number> | undefined) => void;
  parentLevelMapping?: Record<string, number>;
  onParentLevelMappingChange?: (value: Record<string, number> | undefined) => void;
}) {

  return (
    <div className="space-y-6">
      {/* ── Incentives & Gains (Primary — Training OS) ───────────────────── */}
      <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200 rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <TrendingUp size={16} className="text-indigo-600" />
            <h4 className="text-sm font-bold text-indigo-900">Incentives & Gains</h4>
          </div>
          <div className="flex items-center gap-3">
            <div>
              <label className="block text-[10px] font-bold text-gray-500 mb-0.5">רמה</label>
              <input
                type="number"
                min="1"
                max="30"
                step="1"
                value={form.level}
                onChange={(e) => onChange({ ...form, level: Number(e.target.value) || 1 })}
                className="w-16 px-2 py-1.5 border border-indigo-200 rounded-lg text-sm font-bold text-center"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 mb-0.5">בונוס חריגה %</label>
              <input
                type="number"
                min="0"
                max="30"
                step="0.5"
                value={form.bonusPercent}
                onChange={(e) => onChange({ ...form, bonusPercent: isNaN(Number(e.target.value)) ? 0 : Number(e.target.value) })}
                className="w-14 px-2 py-1.5 border border-indigo-200 rounded-lg text-sm text-center"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 mb-0.5">סטים ל-100%</label>
              <input
                type="number"
                min="1"
                max="20"
                step="1"
                value={form.requiredSetsForFullGain}
                onChange={(e) => onChange({ ...form, requiredSetsForFullGain: Number(e.target.value) || 4 })}
                className="w-14 px-2 py-1.5 border border-indigo-200 rounded-lg text-sm text-center"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {onBaseGainChange && (
            <div>
              <label className="block text-sm font-bold text-indigo-800 mb-2">רווח בסיסי לאימון (Base Gain %)</label>
              <input
                type="number"
                min={0}
                max={20}
                step={0.5}
                value={baseGain ?? ''}
                onChange={(e) => onBaseGainChange(e.target.value === '' ? undefined : parseFloat(e.target.value))}
                placeholder="8"
                className="w-full px-4 py-2 border border-indigo-300 rounded-lg"
              />
              <p className="text-[10px] text-indigo-500 mt-1">8/6/4/2% by tier</p>
            </div>
          )}
          {onFirstSessionBonusChange && (
            <div>
              <label className="block text-sm font-bold text-indigo-800 mb-2">First-Session Bonus (%)</label>
              <input
                type="number"
                min={0}
                max={10}
                step={0.5}
                value={firstSessionBonus ?? ''}
                onChange={(e) => onFirstSessionBonusChange(e.target.value === '' ? undefined : parseFloat(e.target.value))}
                placeholder="3"
                className="w-full px-4 py-2 border border-indigo-300 rounded-lg"
              />
              <p className="text-[10px] text-indigo-500 mt-1">+3/+1.5/+0.5% by tier</p>
            </div>
          )}
          <div>
            <label className="block text-sm font-bold text-indigo-800 mb-2 flex items-center gap-1.5">
              <Shield size={14} className="text-red-500" />
              Max Sets (Hard Cap)
            </label>
            <input
              type="number"
              min={4}
              max={50}
              step={1}
              value={maxSets}
              onChange={(e) => onMaxSetsChange(parseInt(e.target.value) || 20)}
              className="w-full px-4 py-2 border border-red-300 rounded-lg"
            />
            <p className="text-[10px] text-indigo-500 mt-1">Safety Brake per session</p>
          </div>
        </div>

        {/* Editable table: RPE Bonus (Safety-First: RPE 1-5 +2%, 6-7 +1%, 8-10 0%) */}
        {onRpeBonusConfigChange && (
          <div className="bg-white rounded-xl p-4 border border-indigo-200">
            <label className="block text-sm font-bold text-indigo-800 mb-2">RPE Bonus — edit each value directly</label>
            <p className="text-[10px] text-indigo-500 mb-2">Safety-First: lower RPE = rewarded. RPE 1-5: +2%, 6-7: +1%, 8-10: 0%</p>
            <div className="grid grid-cols-5 md:grid-cols-10 gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((rpe) => (
                <div key={rpe} className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-gray-500">RPE {rpe}</span>
                  <input
                    type="number"
                    min={0}
                    max={10}
                    step={0.5}
                    value={rpeBonusConfig?.[String(rpe)] ?? ''}
                    onChange={(e) => {
                      const v = e.target.value === '' ? undefined : parseFloat(e.target.value);
                      const next = { ...(rpeBonusConfig ?? {}), [String(rpe)]: v ?? 0 };
                      onRpeBonusConfigChange(next);
                    }}
                    placeholder={rpe <= 5 ? '2' : rpe <= 7 ? '1' : '0'}
                    className="w-full px-2 py-1.5 border border-indigo-200 rounded text-sm text-center"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Editable table: Monthly Streak (Session 2, 5, 7) */}
        {onPersistenceBonusConfigChange && (
          <div className="bg-white rounded-xl p-4 border border-indigo-200">
            <label className="block text-sm font-bold text-indigo-800 mb-2">Monthly Streak — Session in month → bonus %</label>
            <p className="text-[10px] text-indigo-500 mb-2">Session 2: +1%, 5: +2%, 7: +3%. Cap at 3% for Session 10+</p>
            <div className="flex flex-wrap gap-4">
              {[2, 5, 7, 8, 9, 10].map((session) => (
                <div key={session} className="flex items-center gap-2">
                  <span className="text-sm font-bold text-gray-600">
                    Session {session}{session >= 10 ? '+' : ''}
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={10}
                    step={0.5}
                    value={persistenceBonusConfig?.[String(session)] ?? ''}
                    onChange={(e) => {
                      const v = e.target.value === '' ? undefined : parseFloat(e.target.value);
                      const next = { ...(persistenceBonusConfig ?? {}), [String(session)]: v ?? 0 };
                      onPersistenceBonusConfigChange(next);
                    }}
                    placeholder={session === 2 ? '1' : session === 5 ? '2' : session === 7 ? '3' : '3'}
                    className="w-16 px-2 py-1.5 border border-indigo-200 rounded text-sm text-center"
                  />
                  <span className="text-[10px] text-gray-500">%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Parent Mapping for Grandchild programs (OAP, Planche, etc.) */}
        {onParentLevelMappingChange && (
          <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
            <label className="block text-sm font-bold text-amber-800 mb-2">Parent Level Mapping (Grandchild: OAP, Planche, etc.)</label>
            <p className="text-[10px] text-amber-600 mb-2">Map grandchild level → parent level. E.g. OAP L1 inherits from Pull L10: {"{\"1\":10}"}</p>
            <div className="flex flex-wrap gap-3">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((childLvl) => (
                <div key={childLvl} className="flex items-center gap-1">
                  <span className="text-xs font-bold text-amber-700">L{childLvl}→</span>
                  <input
                    type="number"
                    min={1}
                    max={25}
                    value={parentLevelMapping?.[String(childLvl)] ?? ''}
                    onChange={(e) => {
                      const v = e.target.value === '' ? undefined : parseInt(e.target.value, 10);
                      const next = { ...(parentLevelMapping ?? {}) };
                      if (v != null) next[String(childLvl)] = v;
                      else delete next[String(childLvl)];
                      onParentLevelMappingChange(Object.keys(next).length ? next : undefined);
                    }}
                    placeholder="—"
                    className="w-12 px-2 py-1 border border-amber-300 rounded text-sm text-center"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Training OS: Volume Target + Intensity Gating (Lead Program) ── */}
      <div className="bg-gradient-to-r from-cyan-50 to-blue-50 border border-cyan-200 rounded-xl p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Dumbbell size={16} className="text-cyan-600" />
          <h4 className="text-sm font-bold text-cyan-900">Training OS — הגדרות נפח ועצימות (Lead Program)</h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Volume Target */}
          {activePattern ? (
            <div className="bg-white rounded-xl p-4 border border-cyan-200">
              <label className="block text-sm font-bold text-cyan-800 mb-2 flex items-center gap-1.5">
                {PATTERN_LABELS[activePattern].emoji} יעד נפח שבועי — {PATTERN_LABELS[activePattern].label}
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={volumeValue}
                  onChange={(e) => onVolumeChange(parseInt(e.target.value) || 0)}
                  className="w-28 px-3 py-2.5 border border-cyan-300 rounded-lg text-center text-lg font-bold focus:ring-2 focus:ring-cyan-400 focus:border-transparent"
                />
                <span className="text-sm text-gray-600 font-medium">סטים/שבוע</span>
              </div>
              <p className="text-[10px] text-cyan-500 mt-2">
                Lead Program — אם זו הרמה הגבוהה ביותר של המשתמש ב-{PATTERN_LABELS[activePattern].label}, ערך זה ישמש כתקציב משותף.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-xl p-4 border border-gray-200 opacity-60">
              <label className="block text-sm font-bold text-gray-500 mb-2">יעד נפח שבועי</label>
              <p className="text-xs text-gray-400">
                לתוכנית זו לא הוגדרה תבנית תנועה (Push/Pull/Legs/Core).
                <br />
                הגדר תבנית בעורך התוכניות כדי לאפשר שליטה בנפח.
              </p>
            </div>
          )}

          {/* Max Intense Workouts Per Week */}
          <div className="bg-white rounded-xl p-4 border border-orange-200">
            <label className="block text-sm font-bold text-orange-800 mb-2 flex items-center gap-1.5">
              <Zap size={14} className="text-orange-500" />
              <Zap size={14} className="text-orange-500 -ml-2.5" />
              <Zap size={14} className="text-orange-500 -ml-2.5" />
              {' '}מקסימום 3-Bolt בשבוע
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={0}
                max={99}
                value={maxIntense}
                onChange={(e) => onMaxIntenseChange(parseInt(e.target.value) || 0)}
                className="w-28 px-3 py-2.5 border border-orange-300 rounded-lg text-center text-lg font-bold focus:ring-2 focus:ring-orange-400 focus:border-transparent"
              />
              <span className={`text-xs px-2.5 py-1 rounded-lg font-bold ${
                maxIntense === 0
                  ? 'bg-red-100 text-red-700'
                  : maxIntense >= 99
                    ? 'bg-green-100 text-green-700'
                    : 'bg-orange-100 text-orange-700'
              }`}>
                {maxIntense === 0 ? '🔒 נעול' : maxIntense >= 99 ? '🟢 ∞ ללא הגבלה' : `⚡ עד ${maxIntense}/שבוע`}
              </span>
            </div>
            <p className="text-[10px] text-orange-500 mt-2">
              ספציפי לתוכנית-רמה — הרמה הגבוהה ביותר של המשתמש קובעת את ההגבלה.
            </p>
          </div>
        </div>

        {/* Row 2: SA/BA Ratio + Default Rest */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Straight Arm Ratio */}
          <div className="bg-white rounded-xl p-4 border border-purple-200">
            <label className="block text-sm font-bold text-purple-800 mb-2 flex items-center gap-1.5">
              <Shield size={14} className="text-purple-500" />
              יחס יד ישרה (SA/BA Ratio)
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={straightArmRatio}
                onChange={(e) => onStraightArmRatioChange(parseFloat(e.target.value) || 0)}
                className="w-28 px-3 py-2.5 border border-purple-300 rounded-lg text-center text-lg font-bold focus:ring-2 focus:ring-purple-400 focus:border-transparent"
              />
              <span className="text-xs text-gray-600">
                = {Math.round(straightArmRatio * 100)}% SA / {Math.round((1 - straightArmRatio) * 100)}% BA
              </span>
            </div>
            <p className="text-[10px] text-purple-500 mt-2">
              מגן גידים — מונע עומס יתר של תרגילי יד ישרה (planche, front lever)
            </p>
          </div>

          {/* Default Rest — handled by Tier Engine */}
          <div className="bg-white rounded-xl p-4 border border-teal-200">
            <div className="text-sm font-bold text-teal-800 mb-2 flex items-center gap-1.5">
              <Zap size={14} className="text-teal-500" />
              מנוחה (Rest)
            </div>
            <div className="text-sm text-teal-700 font-semibold">Tier Engine — Auto</div>
            <p className="text-[10px] text-teal-500 mt-2">
              מנוחה נקבעת אוטומטית לפי Delta בין רמת התרגיל לרמת המשתמש.
            </p>
          </div>
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-bold text-gray-700 mb-2">תיאור (אופציונלי)</label>
        <textarea
          value={form.description}
          onChange={(e) => onChange({ ...form, description: e.target.value })}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-transparent"
          rows={2}
          placeholder="הערות לרמה זו או הקשר למשתמש..."
        />
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-3 pt-4 border-t flex-wrap">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-2 bg-violet-500 text-white rounded-lg font-bold hover:bg-violet-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save size={18} />
          {saving ? 'שומר...' : 'שמור'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-2 px-6 py-2 bg-gray-200 text-gray-700 rounded-lg font-bold hover:bg-gray-300 transition-colors"
        >
          <X size={18} />
          ביטול
        </button>
        {onCloneToRange && (
          <button
            type="button"
            onClick={onCloneToRange}
            className="flex items-center gap-2 px-6 py-2 bg-indigo-100 text-indigo-700 rounded-lg font-bold hover:bg-indigo-200 transition-colors"
          >
            <CopyPlus size={18} />
            Clone to Range
          </button>
        )}
      </div>
    </div>
  );
}
