'use client';

import { useState, useEffect } from 'react';
import {
  ExerciseFormData,
  ExerciseType,
  LoggingMode,
  MuscleGroup,
  EquipmentType,
  EquipmentRequirementType,
  ExecutionMethod,
  ExecutionLocation,
  RequiredGearType,
  TargetProgramRef,
  InstructionalVideo,
  InstructionalVideoLang,
  AppLanguage,
  MovementGroup,
} from '@/types/exercise.type';
import { Program } from '@/types/workout';
import { getAllGymEquipment } from '@/features/admin/services/gym-equipment.service';
import { getAllGearDefinitions } from '@/features/admin/services/gear-definition.service';
import { GymEquipment } from '@/types/gym-equipment.type';
import { GearDefinition } from '@/types/gear-definition.type';
import {
  Dumbbell,
  Clock,
  Pause,
  Video,
  Image as ImageIcon,
  Target,
  FileText,
  Star,
  Link as LinkIcon,
  Check,
  X,
  ArrowUp,
  ArrowDown,
  Building2,
  User,
  Home,
  MapPin,
  Navigation,
  Plus,
  Trash2,
  Hash,
  CheckCircle2,
  Volume2,
  List,
  Play,
  HelpCircle,
} from 'lucide-react';
import { storage } from '@/lib/firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';

interface ExerciseEditorFormProps {
  programs: Program[];
  onSubmit: (data: ExerciseFormData) => void;
  isSubmitting: boolean;
  initialData?: ExerciseFormData;
}

// Muscle group labels in Hebrew
const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  chest: 'חזה',
  back: 'גב',
  shoulders: 'כתפיים',
  abs: 'בטן',
  obliques: 'אלכסונים',
  forearms: 'אמות',
  biceps: 'דו-ראשי',
  triceps: 'שלושה ראשים',
  quads: 'ארבע ראשי',
  hamstrings: 'המסטרינג',
  glutes: 'ישבן',
  calves: 'שוקיים',
  traps: 'טרפז',
  cardio: 'קרדיו',
  full_body: 'כל הגוף',
  core: 'ליבה',
  legs: 'רגליים',
};

// Equipment labels in Hebrew
const EQUIPMENT_LABELS: Record<EquipmentType, string> = {
  rings: 'טבעות',
  bar: 'מוט',
  dumbbells: 'משקולות',
  bands: 'גומיות',
  pullUpBar: 'מתח',
  mat: 'מזרן',
  kettlebell: 'קיטלבל',
  bench: 'ספסל',
  lowBar: 'מוט נמוך',
  highBar: 'מוט גבוה',
  dipStation: 'מקבילים',
  wall: 'קיר',
  stairs: 'מדרגות',
  streetBench: 'ספסל רחוב',
  none: 'ללא ציוד',
};

// Exercise type labels
const EXERCISE_TYPE_LABELS: Record<ExerciseType, { label: string; icon: React.ReactNode }> = {
  reps: { label: 'חזרות', icon: <Dumbbell size={18} /> },
  time: { label: 'זמן', icon: <Clock size={18} /> },
  rest: { label: 'התאוששות/חימום', icon: <Pause size={18} /> },
};

const MOVEMENT_GROUP_LABELS: Record<MovementGroup, { label: string; description: string }> = {
  squat: { label: 'סקוואט', description: 'כיפוף ברכיים/ירכיים (Squat)' },
  hinge: { label: 'הינג׳', description: 'כיפוף ירכיים (Hip Hinge)' },
  horizontal_push: { label: 'דחיקה אופקית', description: 'לדוגמה: שכיבות סמיכה, לחיצת חזה' },
  vertical_push: { label: 'דחיקה אנכית', description: 'לדוגמה: לחיצת כתפיים' },
  horizontal_pull: { label: 'משיכה אופקית', description: 'לדוגמה: חתירה' },
  vertical_pull: { label: 'משיכה אנכית', description: 'לדוגמה: מתח' },
  core: { label: 'ליבה', description: 'תרגילי בטן ויציבה' },
  isolation: { label: 'איסוליישן', description: 'תרגיל מבודד לשריר אחד' },
};

// Predefined Base Movement IDs
const BASE_MOVEMENT_OPTIONS: string[] = [
  // Strength
  'push_up',
  'pull_up',
  'squat',
  'dip',
  'row',
  'overhead_push',
  'hinge',
  'lunge',
  'plank',
  'leg_raise',
  // Calisthenics Skills
  'planche',
  'front_lever',
  'back_lever',
  'human_flag',
  'l_sit',
  'handstand',
  'one_arm_pull',
  'muscle_up',
  // Runner's Power
  'explosive_leg',
  'single_leg_stability',
  'calf_work',
  'pistol_squat',
];

export default function ExerciseEditorForm({
  programs,
  onSubmit,
  isSubmitting,
  initialData,
}: ExerciseEditorFormProps) {
  const [activeLang, setActiveLang] = useState<AppLanguage>('he');
  const [formData, setFormData] = useState<ExerciseFormData>({
    name: initialData?.name || { he: '', en: '', es: '' },
    type: initialData?.type || 'reps',
    loggingMode: initialData?.loggingMode || 'reps',
    equipment: initialData?.equipment || [],
    muscleGroups: initialData?.muscleGroups || [],
    programIds: initialData?.programIds || [],
    media: initialData?.media || {},
    content: {
      description: initialData?.content?.description || { he: '', en: '', es: '' },
      instructions: initialData?.content?.instructions || { he: '', en: '', es: '' },
      goal: initialData?.content?.goal,
      notes: initialData?.content?.notes,
      highlights: initialData?.content?.highlights,
    },
    requiredGymEquipment: initialData?.requiredGymEquipment,
    requiredUserGear: initialData?.requiredUserGear || [],
    base_movement_id: initialData?.base_movement_id,
    execution_methods: initialData?.execution_methods,
    targetPrograms: initialData?.targetPrograms,
  });

  const [highlights, setHighlights] = useState<string[]>(initialData?.content?.highlights || []);
  const [gymEquipmentList, setGymEquipmentList] = useState<GymEquipment[]>([]);
  const [gearDefinitionsList, setGearDefinitionsList] = useState<GearDefinition[]>([]);
  const [loadingRequirements, setLoadingRequirements] = useState(true);
  const [executionMethods, setExecutionMethods] = useState<ExecutionMethod[]>(
    initialData?.execution_methods || []
  );
  const [targetPrograms, setTargetPrograms] = useState<TargetProgramRef[]>(
    initialData?.targetPrograms || []
  );
  const [baseMovementQuery, setBaseMovementQuery] = useState<string>('');
  const [showBaseMovementSuggestions, setShowBaseMovementSuggestions] = useState(false);

  useEffect(() => {
    if (initialData) {
      setFormData({
        ...formData,
        ...initialData,
        name: initialData.name || formData.name,
        content: {
          description: initialData.content?.description || formData.content.description,
          goal: initialData.content?.goal ?? formData.content.goal,
          highlights: initialData.content?.highlights ?? formData.content.highlights,
        },
        base_movement_id: initialData.base_movement_id || undefined,
      });
      setHighlights(initialData.content?.highlights || []);
    }
  }, [initialData]);

  useEffect(() => {
    loadRequirements();
  }, []);

  const loadRequirements = async () => {
    try {
      setLoadingRequirements(true);
      const [equipment, gear] = await Promise.all([
        getAllGymEquipment(),
        getAllGearDefinitions(),
      ]);
      setGymEquipmentList(equipment);
      setGearDefinitionsList(gear);
    } catch (error) {
      console.error('Error loading requirements:', error);
    } finally {
      setLoadingRequirements(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      ...formData,
      content: {
        ...formData.content,
        // Keep legacy goal in sync with Hebrew description when available
        goal: formData.content.description?.he || formData.content.goal,
        highlights: highlights.filter((h) => h.trim()),
      },
      execution_methods: executionMethods.length > 0 ? executionMethods : undefined,
      targetPrograms: targetPrograms.length > 0 ? targetPrograms : undefined,
    });
  };

  // Keep legacy programIds in sync with selected targetPrograms (for backward compatibility)
  useEffect(() => {
    const linkedProgramIds = Array.from(
      new Set(targetPrograms.map((tp) => tp.programId).filter(Boolean))
    );
    setFormData((prev) => ({
      ...prev,
      programIds: linkedProgramIds,
    }));
  }, [targetPrograms]);

  const toggleArrayItem = <T,>(array: T[], item: T): T[] => {
    return array.includes(item) ? array.filter((i) => i !== item) : [...array, item];
  };

  const addArrayItem = (setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    setter((prev) => [...prev, '']);
  };

  const removeArrayItem = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    index: number
  ) => {
    setter((prev) => prev.filter((_, i) => i !== index));
  };

  const updateArrayItem = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    index: number,
    value: string
  ) => {
    setter((prev) => prev.map((item, i) => (i === index ? value : item)));
  };

  return (
    <form id="exercise-form" onSubmit={handleSubmit} className="space-y-6">
      <div className="lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-6">
        {/* Left: Form */}
        <div className="space-y-6">
          {/* Basic Info Section */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
            <h2 className="text-xl font-bold flex items-center gap-2 text-gray-800 mb-6">
              <span className="w-1 h-6 bg-blue-500 rounded-full"></span>
              פרטים בסיסיים
            </h2>

            <div className="space-y-6">
              {/* Name (Multi-language HE / EN / ES) */}
              <div className="space-y-2">
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

              {/* Exercise Type */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">סוג התרגיל *</label>
                <div className="grid grid-cols-3 gap-3">
                  {(Object.keys(EXERCISE_TYPE_LABELS) as ExerciseType[]).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setFormData({ ...formData, type })}
                      className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                        formData.type === type
                          ? 'border-cyan-500 bg-cyan-50 text-cyan-700'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {EXERCISE_TYPE_LABELS[type].icon}
                      <span className="text-xs font-bold">{EXERCISE_TYPE_LABELS[type].label}</span>
                    </button>
                  ))}
                </div>
              </div>

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
                    onClick={() => setFormData({ ...formData, loggingMode: 'reps' })}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                      formData.loggingMode === 'reps'
                        ? 'border-cyan-500 bg-cyan-50 text-cyan-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <Hash size={24} className={formData.loggingMode === 'reps' ? 'text-cyan-600' : 'text-gray-400'} />
                    <span className="text-sm font-bold">מעקב חזרות</span>
                    <span className="text-xs text-gray-500 text-center">קלט מספרים (חזרות, זמן וכו')</span>
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

              {/* Equipment */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">ציוד נדרש</label>
                <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {(Object.keys(EQUIPMENT_LABELS) as EquipmentType[]).map((equipment) => (
                    <button
                      key={equipment}
                      type="button"
                      onClick={() =>
                        setFormData({
                          ...formData,
                          equipment: toggleArrayItem(formData.equipment, equipment),
                        })
                      }
                      className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all ${
                        formData.equipment.includes(equipment)
                          ? 'border-cyan-500 bg-cyan-50 text-cyan-700'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {formData.equipment.includes(equipment) && <Check size={16} />}
                      <span className="text-sm font-bold">{EQUIPMENT_LABELS[equipment]}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Base Movement ID - for Smart Swap */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <label className="text-sm font-bold text-gray-700">
                    Base Movement ID
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
                  <input
                    type="text"
                    value={baseMovementQuery || formData.base_movement_id || ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      setBaseMovementQuery(value);
                      setShowBaseMovementSuggestions(true);
                      setFormData({
                        ...formData,
                        base_movement_id: value || undefined,
                      });
                    }}
                    onFocus={() => setShowBaseMovementSuggestions(true)}
                    onBlur={() => {
                      // Delay hiding to allow click
                      setTimeout(() => setShowBaseMovementSuggestions(false), 150);
                    }}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    placeholder="חפש או בחר Base Movement ID..."
                  />
                  {showBaseMovementSuggestions && (
                    <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg text-sm">
                      {BASE_MOVEMENT_OPTIONS.filter((id) =>
                        (baseMovementQuery || '').length === 0
                          ? true
                          : id.toLowerCase().includes(baseMovementQuery.toLowerCase())
                      ).map((id) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => {
                            setFormData({ ...formData, base_movement_id: id });
                            setBaseMovementQuery(id);
                            setShowBaseMovementSuggestions(false);
                          }}
                          className={`w-full text-right px-4 py-2 hover:bg-gray-50 ${
                            formData.base_movement_id === id ? 'bg-cyan-50 text-cyan-700' : ''
                          }`}
                        >
                          {id}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  מזהה משותף לתרגילים מאותה משפחה. בחר מהרשימה המוגדרת מראש.
                </p>
              </div>

              {/* Movement Group */}
              <div>
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
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
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
              <ExerciseMobilePreview formData={formData} activeLang={activeLang} programs={programs} />
            </div>
          </div>

          {/* Execution Methods Section */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold flex items-center gap-2 text-gray-800">
            <span className="w-1 h-6 bg-purple-500 rounded-full"></span>
            שיטות ביצוע (Execution Methods)
          </h2>
          <button
            type="button"
            onClick={() => {
              setExecutionMethods([
                ...executionMethods,
                {
                  location: 'home',
                  requiredGearType: 'user_gear',
                  gearId: '',
                  media: {},
                },
              ]);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-500 text-white rounded-lg font-bold hover:bg-cyan-600 transition-colors"
          >
            <Plus size={18} />
            הוסף שיטת ביצוע
          </button>
        </div>

        <div className="space-y-4">
          {executionMethods.map((method, index) => (
            <ExecutionMethodCard
              key={index}
              method={method}
              index={index}
              gymEquipmentList={gymEquipmentList}
              gearDefinitionsList={gearDefinitionsList}
              loadingRequirements={loadingRequirements}
              onUpdate={(updated) => {
                const newMethods = [...executionMethods];
                newMethods[index] = updated;
                setExecutionMethods(newMethods);
              }}
              onRemove={() => {
                setExecutionMethods(executionMethods.filter((_, i) => i !== index));
              }}
            />
          ))}

          {executionMethods.length === 0 && (
            <div className="text-center py-10 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
              <p className="text-gray-400 mb-2">לא נוספו שיטות ביצוע</p>
              <p className="text-xs text-gray-500 mb-4">
                הוסף שיטות ביצוע שונות לפי מיקום וסוג הציוד הנדרש
              </p>
              <button
                type="button"
                onClick={() => {
                  setExecutionMethods([
                    {
                      location: 'home',
                      requiredGearType: 'user_gear',
                      gearId: '',
                      media: {},
                    },
                  ]);
                }}
                className="text-cyan-600 hover:text-cyan-700 font-bold text-sm"
              >
                הוסף את שיטת הביצוע הראשונה
              </button>
            </div>
          )}
        </div>

        <div className="mt-6 p-4 bg-purple-50 border border-purple-200 rounded-xl">
          <p className="text-sm text-purple-800 font-bold mb-2">ℹ️ איך זה עובד:</p>
          <ul className="text-xs text-purple-700 space-y-1 list-disc list-inside">
            <li>כל שיטת ביצוע כוללת סרטון ותמונה ספציפיים</li>
            <li>המערכת תבחר את השיטה המתאימה לפי המיקום והציוד הזמין</li>
            <li>בבית: תעדיף ציוד אישי, אחרת תציע שיטה מאולתרת</li>
            <li>בפארק: תעדיף מתקן קבוע עם המותג הספציפי</li>
          </ul>
        </div>
      </div>

          {/* Muscle Groups Section */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
        <h2 className="text-xl font-bold flex items-center gap-2 text-gray-800 mb-6">
          <span className="w-1 h-6 bg-orange-500 rounded-full"></span>
          קבוצות שרירים
        </h2>

        <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {(Object.keys(MUSCLE_GROUP_LABELS) as MuscleGroup[]).map((muscle) => (
            <button
              key={muscle}
              type="button"
              onClick={() =>
                setFormData({
                  ...formData,
                  muscleGroups: toggleArrayItem(formData.muscleGroups, muscle),
                })
              }
              className={`flex items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all ${
                formData.muscleGroups.includes(muscle)
                  ? 'border-cyan-500 bg-cyan-50 text-cyan-700'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              {formData.muscleGroups.includes(muscle) && <Check size={16} />}
              <span className="text-sm font-bold">{MUSCLE_GROUP_LABELS[muscle]}</span>
            </button>
          ))}
        </div>
      </div>

          {/* Content Section */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
        <h2 className="text-xl font-bold flex items-center gap-2 text-gray-800 mb-6">
          <span className="w-1 h-6 bg-green-500 rounded-full"></span>
          תוכן
        </h2>

        <div className="space-y-6">
          {/* Description (Multi-language) */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">
              <Target size={16} className="inline mr-2" />
              תיאור התרגיל ({activeLang.toUpperCase()})
            </label>
            <textarea
              value={formData.content.description?.[activeLang] || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  content: {
                    ...formData.content,
                    description: {
                      he: formData.content.description?.he || '',
                      en: formData.content.description?.en || '',
                      es: formData.content.description?.es,
                      [activeLang]: e.target.value,
                    },
                  },
                })
              }
              rows={3}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent resize-none"
              placeholder={
                activeLang === 'he'
                  ? 'תיאור קצר של התרגיל...'
                  : activeLang === 'en'
                  ? 'Short description of the exercise...'
                  : 'Descripción corta del ejercicio...'
              }
            />
          </div>

          {/* Highlights */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">
              <Star size={16} className="inline mr-2" />
              נקודות מרכזיות
            </label>
            <div className="space-y-3">
              {highlights.map((highlight, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={highlight}
                    onChange={(e) => updateArrayItem(setHighlights, index, e.target.value)}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    placeholder="נקודה מרכזית..."
                  />
                  {highlights.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeArrayItem(setHighlights, index)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <X size={18} />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => addArrayItem(setHighlights)}
                className="text-cyan-600 hover:text-cyan-700 font-bold text-sm flex items-center gap-1"
              >
                <span>+</span> הוסף נקודה מרכזית
              </button>
            </div>
          </div>
        </div>
      </div>

          {/* Domain Linking Section */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
        <h2 className="text-xl font-bold flex items-center gap-2 text-gray-800 mb-6">
          <span className="w-1 h-6 bg-indigo-500 rounded-full"></span>
          קישור לתוכניות
        </h2>

        {/* Program Assignments (Program + Level Rows) */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-md font-bold text-gray-800 flex items-center gap-2">
                <LinkIcon size={16} />
                שיוך תרגיל לתוכניות (Program Assignments)
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                הוסף שורות שיוך של תוכנית + רמה שבהן התרגיל הזה מומלץ במיוחד. כל תוכנית יכולה להופיע פעם אחת בלבד.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setTargetPrograms((prev) => [...prev, { programId: '', level: 1 }])
              }
              className="flex items-center gap-2 px-4 py-2 bg-cyan-500 text-white rounded-lg font-bold hover:bg-cyan-600 transition-colors"
            >
              <Plus size={18} />
              הוסף שיוך
            </button>
          </div>

          {programs.length === 0 && (
            <p className="text-gray-500 text-center py-6 border border-dashed border-gray-200 rounded-xl bg-gray-50">
              אין תוכניות זמינות להגדרה.
            </p>
          )}

          {programs.length > 0 && (
            <div className="space-y-3">
              {targetPrograms.length === 0 && (
                <div className="text-xs text-gray-500 bg-gray-50 border border-dashed border-gray-200 rounded-xl p-4">
                  עדיין לא נוספו שיוכים. לחץ על &quot;הוסף שיוך&quot; כדי להתחיל.
                </div>
              )}

              {targetPrograms.map((assignment, index) => {
                const selectedProgramIds = targetPrograms
                  .map((tp, i) => (i === index ? null : tp.programId))
                  .filter((id): id is string => Boolean(id));

                return (
                  <div
                    key={index}
                    className="flex flex-col md:flex-row items-stretch md:items-center gap-3 p-4 bg-gray-50 border border-gray-200 rounded-xl"
                  >
                    <div className="flex-1 flex flex-col md:flex-row gap-3">
                      <div className="flex-1">
                        <label className="block text-xs font-bold text-gray-500 mb-1">
                          תוכנית
                        </label>
                        <select
                          value={assignment.programId}
                          onChange={(e) => {
                            const value = e.target.value;
                            setTargetPrograms((prev) => {
                              const next = [...prev];
                              next[index] = {
                                ...next[index],
                                programId: value,
                              };
                              return next;
                            });
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-sm bg-white"
                        >
                          <option value="">בחר תוכנית...</option>
                          {programs.map((program) => (
                            <option
                              key={program.id}
                              value={program.id}
                              disabled={selectedProgramIds.includes(program.id)}
                            >
                              {program.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="w-full md:w-36">
                        <label className="block text-xs font-bold text-gray-500 mb-1">
                          רמה
                        </label>
                        <select
                          value={assignment.level}
                          onChange={(e) => {
                            const level = parseInt(e.target.value) || 1;
                            setTargetPrograms((prev) => {
                              const next = [...prev];
                              next[index] = {
                                ...next[index],
                                level,
                              };
                              return next;
                            });
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-sm bg-white"
                        >
                          {Array.from({ length: 10 }, (_, i) => i + 1).map((level) => (
                            <option key={level} value={level}>
                              Level {level}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setTargetPrograms((prev) => prev.filter((_, i) => i !== index))
                      }
                      className="self-start md:self-center p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="הסר שיוך"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                );
              })}

              {targetPrograms.length > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  נבחרו {targetPrograms.length} שיוכי תוכנית+רמה. כל תוכנית יכולה להופיע פעם אחת בלבד.
                </p>
              )}
            </div>
          )}
        </div>
          </div>
        </div>

        {/* Right: Live Mobile Preview (desktop) */}
        <div className="hidden lg:block">
          <ExerciseMobilePreview formData={formData} activeLang={activeLang} programs={programs} />
        </div>
      </div>
    </form>
  );
}

interface ExerciseMobilePreviewProps {
  formData: ExerciseFormData;
  activeLang: AppLanguage;
  programs?: Program[];
}

function ExerciseMobilePreview({ formData, activeLang, programs = [] }: ExerciseMobilePreviewProps) {
  const name =
    formData.name?.[activeLang] ||
    formData.name?.he ||
    formData.name?.en ||
    formData.name?.es ||
    'שם התרגיל';

  const description = formData.content?.description?.[activeLang] || formData.content?.description?.he || '';
  const highlights = formData.content?.highlights || [];
  const muscleGroups = formData.muscleGroups || [];
  const primaryMuscle = muscleGroups[0];
  const secondaryMuscles = muscleGroups.slice(1, 3);

  // Get video from execution_methods[0]
  const mainVideoUrl = formData.execution_methods?.[0]?.media?.mainVideoUrl || '';
  const instructionalVideoUrl =
    formData.execution_methods?.[0]?.media?.instructionalVideos?.[0]?.url || '';

  // Get primary program and level from targetPrograms
  const primaryTarget = formData.targetPrograms?.[0];
  const primaryProgram = primaryTarget ? programs.find((p) => p.id === primaryTarget.programId) : null;
  const primaryLevel = primaryTarget?.level;

  // Get exercise type label for title
  const getExerciseTypeLabel = () => {
    switch (formData.type) {
      case 'reps':
        return '10-15 חזרות';
      case 'time':
        return '30-60 שניות';
      case 'rest':
        return 'התאוששות/חימום';
      default:
        return '10-15 חזרות';
    }
  };

  // Extract YouTube video ID for embed
  const getYouTubeVideoId = (url: string): string | null => {
    const youtubeRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(youtubeRegex);
    return match ? match[1] : null;
  };

  const youtubeVideoId = instructionalVideoUrl ? getYouTubeVideoId(instructionalVideoUrl) : null;

  // Prevent scroll propagation
  const handleDrawerScroll = (e: React.WheelEvent<HTMLDivElement>) => {
    e.stopPropagation();
  };

  const handleDrawerTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
  };

  const handleDrawerTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
  };

  return (
    <div className="sticky top-6">
      <div className="relative w-full max-w-md mx-auto overflow-hidden flex flex-col bg-gray-200 dark:bg-gray-800" style={{ height: '800px' }}>
        {/* Hero Section - Video/Image Background (Fixed) */}
        <div className="relative w-full aspect-[9/10] flex-shrink-0 overflow-hidden bg-gray-200 dark:bg-gray-800">
          {mainVideoUrl ? (
            <video
              src={mainVideoUrl}
              className="absolute inset-0 w-full h-full object-cover"
              autoPlay
              loop
              muted
              playsInline
            />
          ) : (
            <div className="absolute inset-0 w-full h-full bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center">
              <Dumbbell size={48} className="text-gray-600" />
            </div>
          )}
          
          {/* Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-transparent h-32" />
          
          {/* Status Bar */}
          <div className="absolute top-0 w-full px-4 pt-2 z-20">
            <div className="flex justify-between items-center text-white text-xs font-semibold">
              <span style={{ fontFamily: 'Assistant, sans-serif' }}>
                {new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
              </span>
              <span className="text-sm">🔋</span>
            </div>
            
            {/* Progress Segments */}
            <div className="flex mt-3">
              {Array.from({ length: 9 }).map((_, i) => (
                <div
                  key={i}
                  className="progress-segment"
                  style={{
                    height: '4px',
                    backgroundColor: i === 8 ? '#00AEEF' : 'rgba(0, 174, 239, 0.4)',
                  }}
                />
              ))}
            </div>
            
            {/* Control Buttons */}
            <div className="flex justify-between items-center mt-4 px-2">
              <button className="w-10 h-10 flex items-center justify-center rounded-full bg-white/20 backdrop-blur-md">
                <Pause size={20} className="text-white" />
              </button>
              <div className="text-white font-bold text-xl tracking-wider" style={{ fontFamily: 'Assistant, sans-serif' }}>
                02:20
              </div>
              <button className="w-10 h-10 flex items-center justify-center rounded-full bg-white/20 backdrop-blur-md">
                <List size={20} className="text-white" />
              </button>
            </div>
          </div>
        </div>

        {/* Floating Drawer with Scroll Indicator */}
        <div className="relative z-30 -mt-10 flex-shrink-0">
          {/* Scroll Indicator (Grabber Bar) */}
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-32 h-1.5 bg-slate-200 dark:bg-zinc-700 rounded-full" />
          </div>
          
          {/* Scrollable Drawer Content */}
          <div
            className="bg-white dark:bg-zinc-900 rounded-t-[32px] shadow-[0_-10px_25px_rgba(0,0,0,0.1)] px-6 pt-4 pb-12 overflow-y-auto scrollbar-hide"
            style={{ maxHeight: '400px' }}
            onWheel={handleDrawerScroll}
            onTouchStart={handleDrawerTouchStart}
            onTouchMove={handleDrawerTouchMove}
          >
            {/* Title Section */}
            <div className="text-center mb-6">
              <h1 className="text-3xl font-extrabold text-slate-800 dark:text-white mb-1" style={{ fontFamily: 'Assistant, sans-serif' }}>
                {getExerciseTypeLabel()}
              </h1>
              <p className="text-slate-500 dark:text-zinc-400 text-lg mb-2" style={{ fontFamily: 'Assistant, sans-serif' }}>
                {name}
              </p>
              {/* Program & Level Badge */}
              {primaryProgram && primaryLevel && (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#00AEEF]/10 text-[#00AEEF] rounded-full text-xs font-bold">
                  <span>{primaryProgram.name}</span>
                  <span>•</span>
                  <span>רמה {primaryLevel}</span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-4 mb-8">
              <button className="w-14 h-14 flex items-center justify-center rounded-2xl border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-300">
                <Volume2 size={24} />
              </button>
              <button className="flex-1 h-14 bg-white dark:bg-zinc-800 border-2 border-slate-100 dark:border-zinc-700 rounded-2xl flex items-center justify-center gap-2 font-bold text-slate-800 dark:text-white shadow-sm active:scale-[0.98] transition-transform" style={{ fontFamily: 'Assistant, sans-serif' }}>
                <span>סיימתי</span>
                <Check size={20} className="text-[#00AEEF]" />
              </button>
            </div>

            {/* Instructional Video */}
            {youtubeVideoId && (
              <div className="mb-8 overflow-hidden rounded-2xl bg-black aspect-video relative group">
                <iframe
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  className="w-full h-full"
                  frameBorder="0"
                  src={`https://www.youtube.com/embed/${youtubeVideoId}?controls=0`}
                  title="YouTube video player"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none group-hover:bg-transparent transition-all">
                  <div className="w-12 h-12 rounded-full bg-red-600 flex items-center justify-center text-white shadow-lg">
                    <Play size={24} className="text-white" fill="white" />
                  </div>
                </div>
              </div>
            )}

            {/* Muscle Groups Section */}
            {muscleGroups.length > 0 && (
              <div className="mb-8">
                <h3 className="text-lg font-bold mb-4 text-slate-800 dark:text-white" style={{ fontFamily: 'Assistant, sans-serif' }}>
                  שרירי התרגיל
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  {primaryMuscle && (
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-slate-50 dark:bg-zinc-800 rounded-lg flex items-center justify-center">
                        <Dumbbell size={20} className="text-[#00AEEF]" />
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 dark:text-zinc-500">שריר ראשי</p>
                        <p className="font-bold text-sm">{MUSCLE_GROUP_LABELS[primaryMuscle] || primaryMuscle}</p>
                      </div>
                    </div>
                  )}
                  {secondaryMuscles.length > 0 && (
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-slate-50 dark:bg-zinc-800 rounded-lg flex items-center justify-center">
                        <User size={20} className="text-slate-400" />
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 dark:text-zinc-500">שרירים משניים</p>
                        <p className="font-bold text-sm">
                          {secondaryMuscles.map((m) => MUSCLE_GROUP_LABELS[m] || m).join(', ')}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Exercise Goal */}
            {description && (
              <div className="mb-8">
                <h3 className="text-lg font-bold mb-2 text-slate-800 dark:text-white" style={{ fontFamily: 'Assistant, sans-serif' }}>
                  מטרת התרגיל
                </h3>
                <p className="text-slate-600 dark:text-zinc-400 leading-relaxed">{description}</p>
              </div>
            )}

            {/* Highlights */}
            {highlights.length > 0 && (
              <div className="mb-10">
                <h3 className="text-lg font-bold mb-4 text-slate-800 dark:text-white" style={{ fontFamily: 'Assistant, sans-serif' }}>
                  דגשים
                </h3>
                <ul className="space-y-4">
                  {highlights.map((highlight, index) => (
                    <li key={index} className="flex gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#00AEEF]/10 text-[#00AEEF] flex items-center justify-center text-xs font-bold">
                        {index + 1}
                      </span>
                      <p className="text-slate-600 dark:text-zinc-400 text-sm leading-relaxed">{highlight}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Replace Exercise Button */}
            <div className="pt-4 border-t border-slate-100 dark:border-zinc-800">
              <button className="w-full py-4 flex items-center justify-center gap-2 text-slate-500 dark:text-zinc-400 hover:text-[#00AEEF] transition-colors font-semibold" style={{ fontFamily: 'Assistant, sans-serif' }}>
                <span className="text-lg">🔄</span>
                <span>החלפת תרגיל</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}



// Video Preview Component
interface VideoPreviewProps {
  url: string;
  onRemove?: () => void;
}

function VideoPreview({ url, onRemove }: VideoPreviewProps) {
  const [videoId, setVideoId] = useState<string | null>(null);
  const [videoType, setVideoType] = useState<'youtube' | 'vimeo' | 'mp4' | 'unknown'>('unknown');

  useEffect(() => {
    // If this is a direct MP4 or Firebase Storage URL, use native video
    const isNativeVideo =
      url.endsWith('.mp4') ||
      url.includes('.mp4?') ||
      url.includes('firebasestorage.googleapis.com');

    if (isNativeVideo) {
      setVideoId(null);
      setVideoType('mp4');
      return;
    }

    // Extract YouTube video ID
    const youtubeRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const youtubeMatch = url.match(youtubeRegex);
    
    if (youtubeMatch) {
      setVideoId(youtubeMatch[1]);
      setVideoType('youtube');
      return;
    }

    // Extract Vimeo video ID
    const vimeoRegex = /(?:vimeo\.com\/)(\d+)/;
    const vimeoMatch = url.match(vimeoRegex);
    
    if (vimeoMatch) {
      setVideoId(vimeoMatch[1]);
      setVideoType('vimeo');
      return;
    }

    setVideoId(null);
    setVideoType('unknown');
  }, [url]);

  // Native MP4 / Storage video - Show small preview with remove button
  if (videoType === 'mp4') {
    return (
      <div className="mt-2 flex items-center gap-3">
        <div className="relative w-[100px] h-[100px] rounded-lg overflow-hidden border-2 border-gray-200 dark:border-zinc-700 bg-black flex-shrink-0">
          <video
            src={url}
            className="w-full h-full object-cover"
            muted
            loop
            playsInline
            autoPlay
          />
        </div>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="px-3 py-2 text-sm font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors border border-red-200 dark:border-red-800"
          >
            הסר
          </button>
        )}
      </div>
    );
  }

  if (!videoId || videoType === 'unknown') {
    return (
      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
        <p className="text-sm text-yellow-700">
          לא ניתן לזהות את הקישור. אנא ודא שהקישור הוא מ-YouTube או Vimeo.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-gray-50">
      <div className="aspect-video w-full">
        {videoType === 'youtube' ? (
          <iframe
            src={`https://www.youtube.com/embed/${videoId}`}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title="Video preview"
          />
        ) : (
          <iframe
            src={`https://player.vimeo.com/video/${videoId}`}
            className="w-full h-full"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            title="Video preview"
          />
        )}
      </div>
    </div>
  );
}

// Image Preview Component
function ImagePreview({ url }: { url: string }) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-gray-50">
      <div className="relative w-full aspect-video bg-gray-100">
        {!imageLoaded && !imageError && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 border-3 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-xs text-gray-500">טוען תמונה...</p>
            </div>
          </div>
        )}
        {imageError ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <ImageIcon size={32} className="text-gray-400 mx-auto mb-2" />
              <p className="text-sm text-gray-500">לא ניתן לטעון את התמונה</p>
              <p className="text-xs text-gray-400 mt-1">ודא שהקישור תקין</p>
            </div>
          </div>
        ) : (
          <img
            src={url}
            alt="Preview"
            className={`w-full h-full object-cover ${imageLoaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300`}
            onLoad={() => setImageLoaded(true)}
            onError={() => {
              setImageError(true);
              setImageLoaded(false);
            }}
          />
        )}
      </div>
    </div>
  );
}

interface InstructionalVideosEditorProps {
  videos: InstructionalVideo[];
  onChange: (videos: InstructionalVideo[]) => void;
}

function InstructionalVideosEditor({ videos, onChange }: InstructionalVideosEditorProps) {
  const languageOptions: { value: InstructionalVideoLang; label: string }[] = [
    { value: 'he', label: 'עברית' },
    { value: 'en', label: 'English' },
    { value: 'es', label: 'Español' },
  ];

  const handleUpdate = (index: number, patch: Partial<InstructionalVideo>) => {
    const next = [...videos];
    next[index] = { ...next[index], ...patch };
    onChange(next);
  };

  const handleAdd = () => {
    onChange([...videos, { lang: 'he', url: '' }]);
  };

  const handleRemove = (index: number) => {
    onChange(videos.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      {videos.map((video, index) => (
        <div
          key={index}
          className="flex flex-col md:flex-row gap-2 items-stretch md:items-center bg-gray-50 border border-gray-200 rounded-xl p-3"
        >
          <select
            value={video.lang}
            onChange={(e) => handleUpdate(index, { lang: e.target.value as InstructionalVideoLang })}
            className="md:w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-xs"
          >
            {languageOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <input
            type="url"
            value={video.url}
            onChange={(e) => handleUpdate(index, { url: e.target.value })}
            placeholder="https://youtube.com/watch?v=..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-xs"
          />
          <button
            type="button"
            onClick={() => handleRemove(index)}
            className="self-end md:self-center p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            title="מחק סרטון"
          >
            <X size={16} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={handleAdd}
        className="flex items-center gap-1 text-xs font-bold text-cyan-600 hover:text-cyan-700"
      >
        <Plus size={14} />
        הוסף סרטון הדרכה
      </button>
    </div>
  );
}

// Execution Method Card Component
interface ExecutionMethodCardProps {
  method: ExecutionMethod;
  index: number;
  gymEquipmentList: GymEquipment[];
  gearDefinitionsList: GearDefinition[];
  loadingRequirements: boolean;
  onUpdate: (method: ExecutionMethod) => void;
  onRemove: () => void;
}

function ExecutionMethodCard({
  method,
  index,
  gymEquipmentList,
  gearDefinitionsList,
  loadingRequirements,
  onUpdate,
  onRemove,
}: ExecutionMethodCardProps) {
  const locationLabels: Record<ExecutionLocation, { label: string; icon: React.ReactNode }> = {
    home: { label: 'בית', icon: <Home size={16} /> },
    park: { label: 'פארק', icon: <MapPin size={16} /> },
    street: { label: 'רחוב', icon: <Navigation size={16} /> },
    office: { label: 'משרד', icon: <Building2 size={16} /> },
    school: { label: 'בית ספר', icon: <Building2 size={16} /> },
    gym: { label: 'חדר כושר', icon: <User size={16} /> },
  };

  const gearTypeLabels: Record<RequiredGearType, string> = {
    fixed_equipment: 'מתקן קבוע',
    user_gear: 'ציוד אישי',
    improvised: 'מאולתר',
  };

  // Improvised gear options will come from Gear Definitions with category "improvised"

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleVideoUpload = (file: File) => {
    const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const path = `exercise-videos/${method.location}/${Date.now()}-${safeName}`;
    const storageRef = ref(storage, path);
    const uploadTask = uploadBytesResumable(storageRef, file);

    setUploading(true);
    setUploadProgress(0);

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        setUploadProgress(Math.round(progress));
      },
      (error) => {
        console.error('Error uploading video:', error);
        setUploading(false);
      },
      async () => {
        try {
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          onUpdate({
            ...method,
            media: { ...method.media, mainVideoUrl: downloadUrl },
          });
        } catch (err) {
          console.error('Error getting download URL:', err);
        } finally {
          setUploading(false);
        }
      }
    );
  };

  return (
    <div className="p-6 border-2 border-gray-200 rounded-xl bg-gray-50/50 space-y-4 relative">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 font-bold text-sm flex items-center justify-center">
            {index + 1}
          </div>
          <div>
            <div className="text-sm font-bold text-gray-700">שיטת ביצוע #{index + 1}</div>
            <div className="text-xs text-gray-500">
              {locationLabels[method.location].label} • {gearTypeLabels[method.requiredGearType]}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
          title="מחק שיטת ביצוע"
        >
          <X size={18} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Location */}
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-2">מיקום</label>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(locationLabels) as ExecutionLocation[]).map((location) => (
              <button
                key={location}
                type="button"
                onClick={() => onUpdate({ ...method, location })}
                className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all ${
                  method.location === location
                    ? 'border-purple-500 bg-purple-50 text-purple-700'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                {locationLabels[location].icon}
                <span className="text-xs font-bold">{locationLabels[location].label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Required Gear Type */}
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-2">סוג ציוד נדרש</label>
          <select
            value={method.requiredGearType}
            onChange={(e) => {
              const newType = e.target.value as RequiredGearType;
              onUpdate({
                ...method,
                requiredGearType: newType,
                gearId: '',
              });
            }}
            disabled={loadingRequirements}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent disabled:opacity-50"
          >
            <option value="fixed_equipment">מתקן קבוע (בפארק)</option>
            <option value="user_gear">ציוד אישי</option>
            <option value="improvised">מאולתר</option>
          </select>
        </div>
      </div>

      {/* Gear Selection based on type */}
      <div>
        {method.requiredGearType === 'fixed_equipment' && (
          <>
            <label className="block text-xs font-bold text-gray-500 mb-2">
              בחר מתקן כושר
            </label>
            <select
              value={method.gearId || ''}
              onChange={(e) => onUpdate({ ...method, gearId: e.target.value })}
              disabled={loadingRequirements}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent disabled:opacity-50"
            >
              <option value="">בחר מתקן...</option>
              {gymEquipmentList.map((equipment) => (
                <option key={equipment.id} value={equipment.id}>
                  {equipment.name}
                </option>
              ))}
            </select>
          </>
        )}

        {method.requiredGearType === 'user_gear' && (
          <>
            <label className="block text-xs font-bold text-gray-500 mb-2">
              בחר ציוד אישי
            </label>
            <select
              value={method.gearId || ''}
              onChange={(e) => onUpdate({ ...method, gearId: e.target.value })}
              disabled={loadingRequirements}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent disabled:opacity-50"
            >
              <option value="">בחר ציוד...</option>
              {gearDefinitionsList.map((gear) => (
                <option key={gear.id} value={gear.id}>
                  {gear.name}
                </option>
              ))}
            </select>
          </>
        )}

        {method.requiredGearType === 'improvised' && (
          <>
            <label className="block text-xs font-bold text-gray-500 mb-2">
              פריט מאולתר
            </label>
            <select
              value={method.gearId || ''}
              onChange={(e) => onUpdate({ ...method, gearId: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            >
              <option value="">בחר פריט מאולתר...</option>
              {/* Predefined common improvised items */}
              <option value="stairs">מדרגות</option>
              <option value="streetBench">ספסל רחוב</option>
              <option value="street_bench">ספסל רחוב (alt)</option>
              <option value="wall">קיר</option>
              <option value="chair">כיסא</option>
              <option value="table">שולחן</option>
              <option value="door">דלת</option>
              <option value="bench">ספסל</option>
              {/* Gear definitions from database */}
              {gearDefinitionsList
                .filter((gear) => gear.category === 'improvised')
                .map((gear) => (
                  <option key={gear.id} value={gear.id}>
                    {typeof gear.name === 'string' ? gear.name : gear.name?.he || gear.name?.en || ''}
                  </option>
                ))}
            </select>
            <p className="text-[11px] text-gray-500 mt-1">
              פריטי אלתור נפוצים (מדרגות, ספסל רחוב) או פריטים מנוהלים במסך &quot;ציוד אישי&quot; תחת קטגוריה &quot;Improvised&quot;.
            </p>
          </>
        )}
      </div>

      {/* Media Section */}
      <div className="space-y-4 pt-4 border-t border-gray-200">
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-2">
            <Video size={14} className="inline mr-1" />
            סרטון ראשי (Main Video URL)
          </label>
          <input
            type="url"
            value={method.media?.mainVideoUrl || ''}
            onChange={(e) =>
              onUpdate({
                ...method,
                media: { ...method.media, mainVideoUrl: e.target.value },
              })
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            placeholder="https://my-cdn.com/video.mp4 או https://youtube.com/watch?v=..."
          />
          <div className="mt-2 flex items-center gap-3">
            <label className="inline-flex items-center text-[11px] font-semibold text-gray-600 cursor-pointer">
              <span className="px-2 py-1 rounded-full bg-gray-100 border border-gray-200 text-xs">
                העלאת MP4 מהמחשב
              </span>
              <input
                type="file"
                accept="video/mp4"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleVideoUpload(file);
                  }
                }}
              />
            </label>
            {uploading && (
              <span className="text-[11px] text-gray-500">
                מעלה וידאו... {uploadProgress}%
              </span>
            )}
          </div>
          {method.media?.mainVideoUrl && (
            <VideoPreview
              url={method.media.mainVideoUrl}
              onRemove={() =>
                onUpdate({
                  ...method,
                  media: { ...method.media, mainVideoUrl: '' },
                })
              }
            />
          )}
        </div>

        {/* Instructional Videos */}
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-2">
            <LinkIcon size={14} className="inline mr-1" />
            סרטוני הדרכה מעמיקים (Instructional Videos)
          </label>
          <p className="text-[11px] text-gray-500 mb-2">
            הוסף קישורים חיצוניים (למשל YouTube) לסרטוני הדרכה ארוכים בשפות שונות.
          </p>
          <InstructionalVideosEditor
            videos={method.media?.instructionalVideos || []}
            onChange={(videos) =>
              onUpdate({
                ...method,
                media: { ...method.media, instructionalVideos: videos },
              })
            }
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-500 mb-2">
            <ImageIcon size={14} className="inline mr-1" />
            קישור לתמונה (URL)
          </label>
          <input
            type="url"
            value={method.media?.imageUrl || ''}
            onChange={(e) =>
              onUpdate({
                ...method,
                media: { ...method.media, imageUrl: e.target.value },
              })
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            placeholder="https://example.com/image.jpg"
          />
          {method.media?.imageUrl && (
            <div className="mt-2">
              <ImagePreview url={method.media.imageUrl} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
