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
  Sparkles
} from 'lucide-react';

const PROGRESSION_RULES_COLLECTION = 'progression_rules';

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
      const data = await getProgressionRulesForProgram(programId);
      setRules(data);
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
    setEditingLevel(rule.level);
    setRuleForm({
      level: rule.level,
      baseSessionGain: rule.baseSessionGain,
      bonusPercent: rule.bonusPercent,
      requiredSetsForFullGain: rule.requiredSetsForFullGain || getDefaultRequiredSets(rule.level),
      linkedPrograms: rule.linkedPrograms || [],
      description: rule.description || '',
    });
    setExpandedLevels(prev => new Set([...prev, rule.level]));
    setShowAddNew(false);
  };

  const handleStartNew = () => {
    const existingLevels = rules.map(r => r.level);
    const nextLevel = Math.max(0, ...existingLevels) + 1;
    const defaults = getDefaultsForLevel(nextLevel);
    
    setRuleForm({
      level: nextLevel,
      baseSessionGain: defaults.baseGain,
      bonusPercent: defaults.bonusPercent,
      requiredSetsForFullGain: getDefaultRequiredSets(nextLevel),
      linkedPrograms: [],
      description: '',
    });
    setShowAddNew(true);
    setEditingLevel(null);
  };

  const handleCancel = () => {
    setEditingLevel(null);
    setShowAddNew(false);
  };

  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const handleSave = async () => {
    if (!selectedProgramId) return;
    
    setSaving(true);
    setSaveSuccess(null);
    try {
      const existingRule = rules.find(r => r.level === ruleForm.level);
      
      // Explicitly read every field from form state to prevent stale/missing values
      const savePayload = {
        id: existingRule?.id,
        programId: selectedProgramId,
        level: Number(ruleForm.level) || 1,
        baseSessionGain: Number(ruleForm.baseSessionGain) || 1,
        bonusPercent: Number(ruleForm.bonusPercent) || 0,
        requiredSetsForFullGain: Number(ruleForm.requiredSetsForFullGain) || 4,
        linkedPrograms: ruleForm.linkedPrograms || [],
        description: ruleForm.description || '',
      };
      
      console.log('[ProgressionManager] handleSave payload:', savePayload);
      
      await saveProgressionRule(savePayload);
      
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

  const selectedProgram = programs.find(p => p.id === selectedProgramId);

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
              </div>
            </div>
          </div>

          {/* Success Notification */}
          {saveSuccess && (
            <div className="bg-green-50 border border-green-300 rounded-xl p-4 flex items-center gap-3 animate-pulse">
              <Check className="text-green-600 flex-shrink-0" size={20} />
              <span className="font-bold text-green-800">{saveSuccess}</span>
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
                              {rule.baseSessionGain}% בסיס | {rule.bonusPercent}% בונוס | {rule.requiredSetsForFullGain || getDefaultRequiredSets(level)} סטים
                            </p>
                          ) : (
                            <p className="text-sm text-gray-400">
                              ברירת מחדל: {defaults.baseGain}% בסיס | {defaults.bonusPercent}% בונוס | {getDefaultRequiredSets(level)} סטים
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
                            >
                              <Edit2 size={18} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(rule.id);
                              }}
                              className="p-2 hover:bg-red-50 text-red-600 rounded-lg transition-colors"
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
                                baseSessionGain: defaults.baseGain,
                                bonusPercent: defaults.bonusPercent,
                                requiredSetsForFullGain: getDefaultRequiredSets(level),
                                linkedPrograms: [],
                                description: '',
                              });
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
                          />
                        ) : rule ? (
                          <LevelRuleDisplay rule={rule} programs={programs} />
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

function LevelRuleDisplay({ rule, programs }: { rule: ProgressionRule; programs: Program[] }) {
  const getProgramName = (id: string) => programs.find(p => p.id === id)?.name || id;

  return (
    <div className="space-y-4">
      {/* Main Settings */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="text-sm text-gray-500 mb-1">רווח בסיסי לאימון</div>
          <div className="text-2xl font-bold text-violet-600">{rule.baseSessionGain}%</div>
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
}: {
  form: LevelRuleForm;
  programs: Program[];
  selectedProgramId: string | null;
  onChange: (form: LevelRuleForm) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {

  return (
    <div className="space-y-6">
      {/* Basic Settings */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">מספר רמה</label>
          <input
            type="number"
            min="1"
            max="30"
            step="1"
            value={form.level}
            onChange={(e) => onChange({ ...form, level: Number(e.target.value) || 1 })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">רווח בסיסי לאימון (%)</label>
          <input
            type="number"
            min="0.1"
            max="50"
            step="0.5"
            value={form.baseSessionGain}
            onChange={(e) => onChange({ ...form, baseSessionGain: Number(e.target.value) || 1 })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-transparent"
          />
          <p className="text-xs text-gray-500 mt-1">כמה % המשתמש מתקדם לאחר כל אימון</p>
        </div>
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">בונוס על חריגה (%)</label>
          <input
            type="number"
            min="0"
            max="30"
            step="0.5"
            value={form.bonusPercent}
            onChange={(e) => {
              const val = Number(e.target.value);
              onChange({ ...form, bonusPercent: isNaN(val) ? 0 : val });
            }}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-transparent"
          />
          <p className="text-xs text-gray-500 mt-1">בונוס כשעוברים את יעד החזרות</p>
        </div>
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">סטים נדרשים ל-100%</label>
          <input
            type="number"
            min="1"
            max="20"
            step="1"
            value={form.requiredSetsForFullGain}
            onChange={(e) => onChange({ ...form, requiredSetsForFullGain: Number(e.target.value) || 4 })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
          />
          <p className="text-xs text-gray-500 mt-1">כמות סטים ל-100% מהרווח</p>
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
      <div className="flex items-center gap-3 pt-4 border-t">
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
      </div>
    </div>
  );
}
