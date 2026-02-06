'use client';

import {
  ExerciseType,
  MovementGroup,
  AppLanguage,
  ExerciseFormData,
} from '../../../core/exercise.types';
import { HelpCircle, Hash, CheckCircle2, Flame, Activity, Wind, Users, User } from 'lucide-react';
import {
  EXERCISE_TYPE_LABELS,
  MOVEMENT_GROUP_LABELS,
  BASE_MOVEMENT_OPTIONS,
  BASE_MOVEMENT_LABELS,
} from './shared/constants';
import { ExerciseEditorSectionProps } from './shared/types';
import MobilePreview from './MobilePreview';
import { Program } from '../../../../programs/core/program.types';
import { ExecutionMethod } from '../../../core/exercise.types';
import { GymEquipment } from '../../../../equipment/gym/core/gym-equipment.types';
import { GearDefinition } from '../../../../equipment/gear/core/gear-definition.types';

interface BasicsSectionProps extends ExerciseEditorSectionProps {
  programs?: Program[];
  baseMovementQuery: string;
  setBaseMovementQuery: (query: string) => void;
  showBaseMovementSuggestions: boolean;
  setShowBaseMovementSuggestions: (show: boolean) => void;
  toggleArrayItem: <T,>(array: T[], item: T) => T[];
  executionMethods?: ExecutionMethod[];
  gymEquipmentList?: GymEquipment[];
  gearDefinitionsList?: GearDefinition[];
}

// Component to display equipment from execution methods
function EquipmentDisplay({
  formData,
  executionMethods = [],
  gymEquipmentList = [],
  gearDefinitionsList = [],
}: {
  formData: ExerciseFormData;
  executionMethods?: ExecutionMethod[];
  gymEquipmentList?: GymEquipment[];
  gearDefinitionsList?: GearDefinition[];
}) {
  // Collect unique equipment names from execution methods
  const equipmentNames = new Set<string>();
  
  executionMethods.forEach((method) => {
    // Use new array-based gearIds, fall back to legacy gearId for backward compatibility
    const gearIdsToCheck = method.gearIds?.length ? method.gearIds : (method.gearId ? [method.gearId] : []);
    const equipmentIdsToCheck = method.equipmentIds?.length ? method.equipmentIds : (method.equipmentId ? [method.equipmentId] : []);
    
    if (method.requiredGearType === 'fixed_equipment') {
      // For fixed equipment, check both equipmentIds and gearIds
      const allIds = [...equipmentIdsToCheck, ...gearIdsToCheck];
      allIds.forEach((id) => {
        const equipment = gymEquipmentList.find((eq) => eq.id === id);
        if (equipment) {
          equipmentNames.add(equipment.name);
        }
      });
    } else if (method.requiredGearType === 'user_gear') {
      gearIdsToCheck.forEach((id) => {
        const gear = gearDefinitionsList.find((g) => g.id === id);
        if (gear) {
          const name = gear.name?.he || gear.name?.en || gear.id;
          equipmentNames.add(name);
        }
      });
    } else if (method.requiredGearType === 'improvised') {
      gearIdsToCheck.forEach((id) => {
        equipmentNames.add(id);
      });
    }
  });

  // Also check legacy formData.equipment
  if (formData.equipment && formData.equipment.length > 0) {
    formData.equipment.forEach((eq) => equipmentNames.add(eq));
  }

  const equipmentArray = Array.from(equipmentNames);

  if (equipmentArray.length === 0) {
    return <p className="text-xs text-gray-400">לא נבחר ציוד</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {equipmentArray.map((eq, idx) => (
        <span key={idx} className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-bold">
          {eq}
        </span>
      ))}
    </div>
  );
}

export default function BasicsSection({
  formData,
  setFormData,
  activeLang,
  setActiveLang,
  programs = [],
  baseMovementQuery,
  setBaseMovementQuery,
  showBaseMovementSuggestions,
  setShowBaseMovementSuggestions,
  toggleArrayItem,
  executionMethods = [],
  gymEquipmentList = [],
  gearDefinitionsList = [],
}: BasicsSectionProps) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
      <h2 className="text-xl font-bold flex items-center gap-2 text-gray-800 mb-6">
        <span className="w-1 h-6 bg-blue-500 rounded-full"></span>
        פרטים בסיסיים
      </h2>

      {/* Wide 2-Column Grid for Desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-6">
        {/* Row 1: Exercise Name (Full Width) */}
        <div className="lg:col-span-2 space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-bold text-gray-700">
              שם התרגיל *
            </label>
            <div className="flex gap-2 text-xs font-bold bg-gray-100 rounded-full p-1">
              {[
                { id: 'he' as AppLanguage, label: 'HE' },
                { id: 'en' as AppLanguage, label: 'EN' },
                { id: 'es' as AppLanguage, label: 'ES' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setActiveLang(opt.id)}
                  className={`px-3 py-1 rounded-full transition-all ${
                    activeLang === opt.id
                      ? 'bg-white text-cyan-600 shadow-sm'
                      : 'text-gray-500'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <input
            type="text"
            value={formData.name?.[activeLang] || ''}
            onChange={(e) =>
              setFormData({
                ...formData,
                name: {
                  he: formData.name?.he || '',
                  en: formData.name?.en || '',
                  es: formData.name?.es,
                  [activeLang]: e.target.value,
                },
              })
            }
            required
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            placeholder={
              activeLang === 'he'
                ? 'לדוגמה: מתח יד אחת'
                : activeLang === 'en'
                ? 'e.g. One-arm pull-up'
                : 'por ejemplo: Dominada a una mano'
            }
          />
        </div>

        {/* Row 2: Exercise Type | Exercise Role */}
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">סוג התרגיל *</label>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(EXERCISE_TYPE_LABELS) as ExerciseType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setFormData({ ...formData, type })}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${
                  formData.type === type
                    ? 'border-cyan-500 bg-cyan-50 text-cyan-700'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="scale-75">{EXERCISE_TYPE_LABELS[type].icon}</div>
                <span className="text-xs font-bold">{EXERCISE_TYPE_LABELS[type].label}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">תפקיד התרגיל באימון</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: 'main' as const, label: 'תרגיל עיקרי', icon: <Activity size={18} /> },
              { value: 'warmup' as const, label: 'חימום', icon: <Flame size={18} /> },
              { value: 'cooldown' as const, label: 'קירור', icon: <Wind size={18} /> },
            ].map((role) => (
              <button
                key={role.value}
                type="button"
                onClick={() => {
                  const newRole = role.value;
                  const shouldBeFollowAlong = newRole === 'warmup' || newRole === 'cooldown';
                  const shouldBeCompletion = newRole === 'warmup' || newRole === 'cooldown';
                  setFormData({ 
                    ...formData, 
                    exerciseRole: newRole,
                    isFollowAlong: shouldBeFollowAlong ? true : (formData.isFollowAlong || false),
                    // Auto-select "Completion Only" for warmup/cooldown
                    loggingMode: shouldBeCompletion ? 'completion' : (formData.loggingMode || 'reps'),
                  });
                }}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${
                  (formData.exerciseRole || 'main') === role.value
                    ? 'border-cyan-500 bg-cyan-50 text-cyan-700'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                {role.icon}
                <span className="text-xs font-bold">{role.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Row 3: Equipment | Logging Mode */}
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">ציוד</label>
          <div className="space-y-2">
            <EquipmentDisplay 
              formData={formData}
              executionMethods={executionMethods}
              gymEquipmentList={gymEquipmentList}
              gearDefinitionsList={gearDefinitionsList}
            />
          </div>
        </div>

        {/* Follow-Along Toggle (shown for warmup/cooldown) */}
        {(formData.exerciseRole === 'warmup' || formData.exerciseRole === 'cooldown') && (
          <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                <span className="text-blue-600">🎬</span>
                סרטון פאלו-אלונג (Follow-Along Video)
              </label>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isFollowAlong !== false}
                  onChange={(e) => setFormData({ ...formData, isFollowAlong: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
            <p className="text-xs text-gray-600 mt-2">
              במצב זה, הסרטון מתנגן מהתחלה עד הסוף והטיימר מסתנכרן עם אורך הסרטון.
              <br />
              <strong>In this mode, the video plays from start to finish and the timer syncs with the video length.</strong>
            </p>
          </div>
        )}

        {/* Logging Mode */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <label className="text-sm font-bold text-gray-700">מצב מעקב (Logging Mode) *</label>
            <div className="group relative">
              <HelpCircle size={16} className="text-gray-400 cursor-help" />
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50">
                <div className="bg-gray-900 text-white text-xs rounded-lg py-2 px-3 whitespace-nowrap shadow-lg max-w-xs">
                  מעקב חזרות: להזנת מספרים באימון.<br />
                  סימון בוצע בלבד: לחימום, מתיחות או תרגילי זמן.
                  <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
                    <div className="border-4 border-transparent border-t-gray-900"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-500 mb-3">
            בחר איך התרגיל יוצג במהלך האימון - עם קלט מספרים או סימון בוצע בלבד
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                // Prevent switching to 'reps' if exercise is warmup/cooldown
                if (formData.exerciseRole === 'warmup' || formData.exerciseRole === 'cooldown') {
                  return; // Keep it as 'completion'
                }
                setFormData({ ...formData, loggingMode: 'reps' });
              }}
              disabled={formData.exerciseRole === 'warmup' || formData.exerciseRole === 'cooldown'}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                formData.loggingMode === 'reps'
                  ? 'border-cyan-500 bg-cyan-50 text-cyan-700'
                  : 'border-gray-200 hover:border-gray-300'
              } ${(formData.exerciseRole === 'warmup' || formData.exerciseRole === 'cooldown') ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Hash size={24} className={formData.loggingMode === 'reps' ? 'text-cyan-600' : 'text-gray-400'} />
              <span className="text-sm font-bold">מעקב חזרות</span>
              <span className="text-xs text-gray-500 text-center">קלט מספרים (חזרות, זמן וכו&apos;)</span>
            </button>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, loggingMode: 'completion' })}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                formData.loggingMode === 'completion'
                  ? 'border-cyan-500 bg-cyan-50 text-cyan-700'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <CheckCircle2 size={24} className={formData.loggingMode === 'completion' ? 'text-cyan-600' : 'text-gray-400'} />
              <span className="text-sm font-bold">סימון בוצע בלבד</span>
              <span className="text-xs text-gray-500 text-center">לחימום/מתיחות ללא מספרים</span>
            </button>
          </div>
        </div>

        {/* Full Width Fields: Follow-Along Toggle */}
        {(formData.exerciseRole === 'warmup' || formData.exerciseRole === 'cooldown') && (
          <div className="lg:col-span-2 bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                <span className="text-blue-600">🎬</span>
                סרטון פאלו-אלונג (Follow-Along Video)
              </label>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isFollowAlong !== false}
                  onChange={(e) => setFormData({ ...formData, isFollowAlong: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
            <p className="text-xs text-gray-600 mt-2">
              במצב זה, הסרטון מתנגן מהתחלה עד הסוף והטיימר מסתנכרן עם אורך הסרטון.
              <br />
              <strong>In this mode, the video plays from start to finish and the timer syncs with the video length.</strong>
            </p>
          </div>
        )}

        {/* Full Width: Timing Controls */}
        {formData.loggingMode === 'reps' && (
          <div className="lg:col-span-2 bg-gray-50 border-2 border-gray-200 rounded-xl p-4 space-y-4">
            <h3 className="text-sm font-bold text-gray-700 mb-3">הגדרות תזמון (לחישוב זמן אימון)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Seconds per Rep */}
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5">
                  שניות לחזרה (Seconds per Rep)
                </label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={formData.secondsPerRep || 3}
                  onChange={(e) => {
                    const value = parseInt(e.target.value, 10);
                    setFormData({ 
                      ...formData, 
                      secondsPerRep: isNaN(value) ? 3 : Math.max(1, Math.min(60, value))
                    });
                  }}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  placeholder="3"
                />
                <p className="text-[10px] text-gray-500 mt-1">
                  זמן ממוצע לביצוע חזרה אחת (ברירת מחדל: 3 שניות)
                </p>
              </div>

              {/* Default Base Rest Seconds */}
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <label className="block text-xs font-bold text-gray-500">
                    מנוחה בסיסית בין סטים (Default Base Rest)
                  </label>
                  <div className="group relative">
                    <HelpCircle size={12} className="text-gray-400 cursor-help" />
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50">
                      <div className="bg-gray-900 text-white text-xs rounded-lg py-2 px-3 whitespace-nowrap shadow-lg max-w-xs">
                        זהו ערך ברירת מחדל. תוכניות אימון מתקדמות יעדיפו ערך זה.
                        <br />
                        <strong>This is a fallback. Advanced workout programs will override this value.</strong>
                        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
                          <div className="border-4 border-transparent border-t-gray-900"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <input
                  type="number"
                  min="0"
                  max="300"
                  value={formData.defaultRestSeconds || 30}
                  onChange={(e) => {
                    const value = parseInt(e.target.value, 10);
                    setFormData({ 
                      ...formData, 
                      defaultRestSeconds: isNaN(value) ? 30 : Math.max(0, Math.min(300, value))
                    });
                  }}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  placeholder="30"
                />
                <p className="text-[10px] text-gray-500 mt-1">
                  זמן מנוחה מומלץ בין סטים (ברירת מחדל: 30 שניות)
                </p>
              </div>
            </div>
            <p className="text-[11px] text-gray-600 mt-2 bg-blue-50 p-2 rounded border border-blue-200">
              💡 <strong>מידע זה משמש לחישוב זמן האימון הכולל:</strong> זמן ביצוע = (חזרות × שניות לחזרה) + מנוחה
              {formData.symmetry === 'unilateral' && (
                <span className="block mt-1 text-blue-700 font-semibold">
                  ⚠️ תרגיל חד-צדדי: זמן הביצוע יוכפל (×2)
                </span>
              )}
            </p>
          </div>
        )}

        {/* Full Width: Mechanical Classification */}
        <div className="lg:col-span-2 bg-gray-50 border-2 border-gray-200 rounded-xl p-4 space-y-4">
          <h3 className="text-sm font-bold text-gray-700 mb-3">סיווג מכני (Mechanical Classification)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Movement Type */}
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-2">סוג תנועה (Movement Type)</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, movementType: 'compound' })}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border-2 transition-all text-xs font-bold ${
                    formData.movementType === 'compound'
                      ? 'border-cyan-500 bg-cyan-50 text-cyan-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <Activity size={14} />
                  מורכב (Compound)
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, movementType: 'isolation' })}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border-2 transition-all text-xs font-bold ${
                    formData.movementType === 'isolation'
                      ? 'border-cyan-500 bg-cyan-50 text-cyan-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <User size={14} />
                  מבודד (Isolation)
                </button>
              </div>
            </div>

            {/* Symmetry */}
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-2">סימטריה (Symmetry)</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, symmetry: 'bilateral' })}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border-2 transition-all text-xs font-bold ${
                    formData.symmetry === 'bilateral'
                      ? 'border-cyan-500 bg-cyan-50 text-cyan-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <Users size={14} />
                  דו-צדדי (Bilateral)
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, symmetry: 'unilateral' })}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border-2 transition-all text-xs font-bold ${
                    formData.symmetry === 'unilateral'
                      ? 'border-cyan-500 bg-cyan-50 text-cyan-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <User size={14} />
                  חד-צדדי (Unilateral)
                </button>
              </div>
              {formData.symmetry === 'unilateral' && (
                <p className="text-[10px] text-blue-600 mt-1.5 font-semibold">
                  ⚠️ תרגיל חד-צדדי: זמן הביצוע יוכפל (Time = Reps × SecPerRep × 2)
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Full Width: Base Movement ID */}
        <div className="lg:col-span-2">
          <div className="flex items-center gap-2 mb-2">
            <label className="text-sm font-bold text-gray-700">
              משפחת תרגיל (Base Movement ID)
            </label>
            <div className="group relative">
              <HelpCircle size={16} className="text-gray-400 cursor-help" />
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50">
                <div className="bg-gray-900 text-white text-xs rounded-lg py-2 px-3 whitespace-nowrap shadow-lg max-w-xs">
                  ה-DNA של התרגיל. בחר את המשפחה (למשל pull_up) כדי לאפשר החלפה אוטומטית לווריאציות קלות/קשות יותר.
                  <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
                    <div className="border-4 border-transparent border-t-gray-900"></div>
                  </div>
                </div>
              </div>
            </div>
            <span className="text-xs font-normal text-gray-500">
              (לצורך התאמת תרגילים - Smart Swap)
            </span>
          </div>
          <div className="relative">
            <div 
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus-within:ring-2 focus-within:ring-cyan-500 focus-within:border-transparent bg-white cursor-pointer"
              onClick={() => setShowBaseMovementSuggestions(true)}
            >
              <input
                type="text"
                value={baseMovementQuery}
                onChange={(e) => {
                  const value = e.target.value;
                  setBaseMovementQuery(value);
                  setShowBaseMovementSuggestions(true);
                }}
                onFocus={() => setShowBaseMovementSuggestions(true)}
                onBlur={() => {
                  // Delay hiding to allow click
                  setTimeout(() => setShowBaseMovementSuggestions(false), 200);
                }}
                className="w-full border-none outline-none bg-transparent"
                placeholder={formData.base_movement_id 
                  ? `${BASE_MOVEMENT_LABELS[formData.base_movement_id] || formData.base_movement_id}` 
                  : 'חפש או בחר משפחת תרגיל...'}
              />
              {formData.base_movement_id && !baseMovementQuery && (
                <div className="absolute top-0 left-0 right-0 bottom-0 flex items-center px-4 pointer-events-none">
                  <span className="text-gray-800 font-medium">
                    {BASE_MOVEMENT_LABELS[formData.base_movement_id] || formData.base_movement_id}
                  </span>
                  <span className="text-gray-400 text-xs mr-2">
                    ({formData.base_movement_id})
                  </span>
                </div>
              )}
            </div>
            {showBaseMovementSuggestions && (
              <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg text-sm">
                {/* Clear option */}
                {formData.base_movement_id && (
                  <button
                    key="clear"
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setFormData({ ...formData, base_movement_id: undefined });
                      setBaseMovementQuery('');
                      setShowBaseMovementSuggestions(false);
                    }}
                    className="w-full text-right px-4 py-2 hover:bg-red-50 text-red-600 border-b border-gray-100"
                  >
                    ✕ נקה בחירה
                  </button>
                )}
                {BASE_MOVEMENT_OPTIONS.filter((id) =>
                  baseMovementQuery.length === 0
                    ? true
                    : id.toLowerCase().includes(baseMovementQuery.toLowerCase()) ||
                      (BASE_MOVEMENT_LABELS[id] || '').includes(baseMovementQuery)
                ).map((id) => (
                  <button
                    key={id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setFormData({ ...formData, base_movement_id: id });
                      setBaseMovementQuery('');
                      setShowBaseMovementSuggestions(false);
                    }}
                    className={`w-full text-right px-4 py-2.5 hover:bg-gray-50 transition-colors flex items-center justify-between ${
                      formData.base_movement_id === id 
                        ? 'bg-cyan-50 text-cyan-700 font-bold' 
                        : ''
                    }`}
                  >
                    <div className="flex flex-col items-start">
                      <span className="font-medium">{BASE_MOVEMENT_LABELS[id] || id}</span>
                      <span className="text-xs text-gray-400">{id}</span>
                    </div>
                    {formData.base_movement_id === id && (
                      <span className="text-cyan-600">✓</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            מזהה משותף לתרגילים מאותה משפחה. בחר מהרשימה המוגדרת מראש.
          </p>
        </div>

        {/* Full Width: Movement Group */}
        <div className="lg:col-span-2">
          <div className="flex items-center gap-2 mb-2">
            <label className="text-sm font-bold text-gray-700">
              קבוצת תנועה (Movement Group)
            </label>
            <div className="group relative">
              <HelpCircle size={16} className="text-gray-400 cursor-help" />
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50">
                <div className="bg-gray-900 text-white text-xs rounded-lg py-2 px-3 whitespace-nowrap shadow-lg max-w-xs">
                  רשת ביטחון להחלפה. אם לא תימצא וריאציה מדויקת, המערכת תציע תרגיל מאותה קבוצת תנועה (למשל: דחיקה אופקית).
                  <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
                    <div className="border-4 border-transparent border-t-gray-900"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-500 mb-3">
            מקבצת את התרגיל לפי דפוס תנועה ראשי (לדוגמה: דחיקה אופקית, סקוואט, הינג׳).
            משמשת את מנוע ה-Smart Swap כדי להחליף תרגילים מאותה משפחה.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {(Object.keys(MOVEMENT_GROUP_LABELS) as MovementGroup[]).map((group) => {
              const selected = formData.movementGroup === group;
              return (
                <button
                  key={group}
                  type="button"
                  onClick={() =>
                    setFormData({
                      ...formData,
                      movementGroup: selected ? undefined : group,
                    })
                  }
                  className={`text-right p-3 rounded-xl border-2 transition-all ${
                    selected
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <div className="text-sm font-bold">
                    {MOVEMENT_GROUP_LABELS[group].label}
                  </div>
                  <div className="text-[11px] text-gray-500 mt-1">
                    {MOVEMENT_GROUP_LABELS[group].description}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Mobile Preview on small screens */}
      <div className="mt-8 lg:hidden">
        <MobilePreview formData={formData} activeLang={activeLang} programs={programs} />
      </div>
    </div>
  );
}
