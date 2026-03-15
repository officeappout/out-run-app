'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Loader2,
  CheckCircle,
  AlertTriangle,
  XCircle,
  FileJson,
  Search,
  Link2,
  Shield,
  Layers,
  Activity,
  Gauge,
} from 'lucide-react';
import {
  getRunWorkoutTemplates,
  getRunProgramTemplates,
  createRunProgramTemplate,
  updateRunProgramTemplate,
} from '@/features/workout-engine/core/services/running-admin.service';
import type {
  RunProgramTemplate,
  RunProgramWeekTemplate,
  ProgressionRule,
  RunnerProfileType,
  ProgramPhase,
  VolumeCap,
  WorkoutCategory,
  WeekSlot,
  RunWorkoutTemplate,
} from '@/features/workout-engine/core/types/running.types';

// ── Import JSON types ────────────────────────────────────────────────

interface ImportWeekTemplate {
  weekNumber: number;
  workoutNames: string[];
}

interface ImportPhase {
  name: 'base' | 'build' | 'peak' | 'taper';
  startWeek: number;
  endWeek: number;
  weekSlots?: WeekSlot[];
  progressionRules?: ProgressionRule[];
  qualityPool?: WorkoutCategory[];
  volumeMultiplier?: number | number[];
}

interface ImportProgramJSON {
  name: string;
  targetDistance: '2k' | '3k' | '5k' | '10k' | 'maintenance';
  targetProfileTypes: RunnerProfileType[];
  canonicalWeeks: number;
  canonicalFrequency: 2 | 3 | 4;
  weekTemplates: ImportWeekTemplate[];
  progressionRules?: ProgressionRule[];
  phases?: ImportPhase[];
  volumeCaps?: VolumeCap[];
}

// ── Validation ───────────────────────────────────────────────────────

interface ValidationError {
  path: string;
  message: string;
  severity: 'error' | 'warning';
}

const VALID_DISTANCES = ['2k', '3k', '5k', '10k', 'maintenance'];
const VALID_FREQUENCIES = [2, 3, 4];
const VALID_PHASE_NAMES = ['base', 'build', 'peak', 'taper'];
const VALID_SLOT_TYPES = ['quality_primary', 'quality_secondary', 'long_run', 'easy_run', 'recovery'];
const VALID_CATEGORIES: WorkoutCategory[] = [
  'short_intervals', 'long_intervals', 'fartlek_easy', 'fartlek_structured',
  'tempo', 'hill_long', 'hill_short', 'hill_sprints', 'long_run', 'easy_run', 'strides',
];
const VALID_CAP_TARGETS = ['weekly_volume', 'single_run', 'sets_per_block', 'total_session', 'weekly_distance', 'single_run_distance'];

/**
 * Hebrew / alternate category strings found in the DB → canonical WorkoutCategory.
 * When counting templates per category, we normalize DB values through this map.
 */
const CATEGORY_ALIASES: Record<string, WorkoutCategory> = {
  'ריצה ארוכה': 'long_run',
  'ריצה קלה': 'easy_run',
  'אינטרוולים קצרים': 'short_intervals',
  'אינטרוולים ארוכים': 'long_intervals',
  'פארטלק קל': 'fartlek_easy',
  'פארטלק מובנה': 'fartlek_structured',
  'טמפו': 'tempo',
  'עליות ארוכות': 'hill_long',
  'עליות קצרות': 'hill_short',
  'ספרינט עליות': 'hill_sprints',
  'סטרייד': 'strides',
  'סטריידים': 'strides',
};

const PHASE_COLORS: Record<string, string> = {
  base: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  build: 'bg-blue-100 text-blue-700 border-blue-300',
  peak: 'bg-purple-100 text-purple-700 border-purple-300',
  taper: 'bg-amber-100 text-amber-700 border-amber-300',
};

const SLOT_TYPE_LABELS: Record<string, string> = {
  quality_primary: 'איכות ראשי',
  quality_secondary: 'איכות משני',
  long_run: 'ריצה ארוכה',
  easy_run: 'ריצה קלה',
  recovery: 'שחזור',
};

function validateProgram(
  p: Record<string, unknown>,
  dbCategories: Set<string>,
  dbCategoryCount: Map<string, number>,
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (typeof p.name !== 'string' || !p.name.trim())
    errors.push({ path: 'name', message: 'חסר', severity: 'error' });

  if (!VALID_DISTANCES.includes(p.targetDistance as string))
    errors.push({ path: 'targetDistance', message: `חייב להיות: ${VALID_DISTANCES.join(', ')}`, severity: 'error' });

  if (!Array.isArray(p.targetProfileTypes) || p.targetProfileTypes.length === 0)
    errors.push({ path: 'targetProfileTypes', message: 'מערך ריק או חסר', severity: 'error' });

  const weeks = p.canonicalWeeks as number;
  if (typeof weeks !== 'number' || weeks < 1)
    errors.push({ path: 'canonicalWeeks', message: 'חייב להיות מספר >= 1', severity: 'error' });

  const freq = p.canonicalFrequency as number;
  if (!VALID_FREQUENCIES.includes(freq))
    errors.push({ path: 'canonicalFrequency', message: 'חייב להיות 2, 3 או 4', severity: 'error' });

  // weekTemplates
  if (!Array.isArray(p.weekTemplates)) {
    errors.push({ path: 'weekTemplates', message: 'חסר — חייב להיות מערך', severity: 'error' });
  } else {
    for (let i = 0; i < (p.weekTemplates as ImportWeekTemplate[]).length; i++) {
      const wt = (p.weekTemplates as ImportWeekTemplate[])[i];
      if (typeof wt.weekNumber !== 'number')
        errors.push({ path: `weekTemplates[${i}].weekNumber`, message: 'חסר', severity: 'error' });
      if (!Array.isArray(wt.workoutNames))
        errors.push({ path: `weekTemplates[${i}].workoutNames`, message: 'חייב להיות מערך', severity: 'error' });
      else {
        for (let j = 0; j < wt.workoutNames.length; j++) {
          if (typeof wt.workoutNames[j] !== 'string' || !wt.workoutNames[j].trim())
            errors.push({ path: `weekTemplates[${i}].workoutNames[${j}]`, message: 'שם ריק', severity: 'error' });
        }
      }
    }
  }

  // Phases deep validation
  if (p.phases !== undefined) {
    if (!Array.isArray(p.phases)) {
      errors.push({ path: 'phases', message: 'חייב להיות מערך', severity: 'error' });
    } else {
      const phases = p.phases as ImportPhase[];

      for (let i = 0; i < phases.length; i++) {
        const phase = phases[i];
        if (!VALID_PHASE_NAMES.includes(phase.name))
          errors.push({ path: `phases[${i}].name`, message: `חייב להיות: ${VALID_PHASE_NAMES.join(', ')}`, severity: 'error' });
        if (typeof phase.startWeek !== 'number')
          errors.push({ path: `phases[${i}].startWeek`, message: 'חסר', severity: 'error' });
        if (typeof phase.endWeek !== 'number')
          errors.push({ path: `phases[${i}].endWeek`, message: 'חסר', severity: 'error' });
        if (typeof phase.startWeek === 'number' && typeof phase.endWeek === 'number' && phase.startWeek > phase.endWeek)
          errors.push({ path: `phases[${i}]`, message: `startWeek (${phase.startWeek}) > endWeek (${phase.endWeek})`, severity: 'error' });

        // volumeMultiplier
        if (phase.volumeMultiplier !== undefined) {
          if (Array.isArray(phase.volumeMultiplier)) {
            const phaseLen = (phase.endWeek ?? 0) - (phase.startWeek ?? 0) + 1;
            if (phase.volumeMultiplier.length !== phaseLen)
              errors.push({ path: `phases[${i}].volumeMultiplier`, message: `אורך מערך (${phase.volumeMultiplier.length}) לא תואם לאורך הפאזה (${phaseLen} שבועות)`, severity: 'warning' });
            if (phase.volumeMultiplier.some((v: unknown) => typeof v !== 'number' || v <= 0))
              errors.push({ path: `phases[${i}].volumeMultiplier`, message: 'כל הערכים חייבים להיות מספרים חיוביים', severity: 'error' });
          } else if (typeof phase.volumeMultiplier !== 'number' || phase.volumeMultiplier <= 0) {
            errors.push({ path: `phases[${i}].volumeMultiplier`, message: 'חייב להיות מספר חיובי', severity: 'error' });
          }
        }

        // weekSlots validation
        if (phase.weekSlots) {
          for (let s = 0; s < phase.weekSlots.length; s++) {
            const slot = phase.weekSlots[s];
            if (!slot.id)
              errors.push({ path: `phases[${i}].weekSlots[${s}].id`, message: 'חסר', severity: 'error' });
            if (!VALID_SLOT_TYPES.includes(slot.slotType))
              errors.push({ path: `phases[${i}].weekSlots[${s}].slotType`, message: `לא חוקי: "${slot.slotType}"`, severity: 'error' });
            if (typeof slot.priority !== 'number')
              errors.push({ path: `phases[${i}].weekSlots[${s}].priority`, message: 'חסר', severity: 'error' });
            if (!Array.isArray(slot.allowedCategories) || slot.allowedCategories.length === 0)
              errors.push({ path: `phases[${i}].weekSlots[${s}].allowedCategories`, message: 'ריק! המנוע לא ימצא אימונים', severity: 'error' });
            else {
              for (const cat of slot.allowedCategories) {
                if (!VALID_CATEGORIES.includes(cat))
                  errors.push({ path: `phases[${i}].weekSlots[${s}].allowedCategories`, message: `קטגוריה לא חוקית: "${cat}"`, severity: 'error' });
                if (!dbCategories.has(cat)) {
                  const count = dbCategoryCount.get(cat) ?? 0;
                  errors.push({ path: `phases[${i}].weekSlots[${s}].allowedCategories`, message: `קטגוריה "${cat}" — ${count} תבניות ב-DB. ייבא אימונים עם קטגוריה זו קודם.`, severity: 'warning' });
                }
              }
            }
          }

          if (freq && phase.weekSlots.length > 0) {
            const required = phase.weekSlots.filter((s) => s.required).length;
            if (required > freq)
              errors.push({ path: `phases[${i}].weekSlots`, message: `${required} סלוטים חובה > תדירות ${freq}`, severity: 'warning' });
          }
        }

        // qualityPool
        if (phase.qualityPool) {
          for (const cat of phase.qualityPool) {
            if (!VALID_CATEGORIES.includes(cat))
              errors.push({ path: `phases[${i}].qualityPool`, message: `קטגוריה לא חוקית: "${cat}"`, severity: 'error' });
          }
        }
      }

      // Week coverage check
      if (typeof weeks === 'number' && weeks >= 1) {
        const uncoveredWeeks: number[] = [];
        for (let w = 1; w <= weeks; w++) {
          const covered = phases.some((ph) => w >= ph.startWeek && w <= ph.endWeek);
          if (!covered) uncoveredWeeks.push(w);
        }
        if (uncoveredWeeks.length > 0)
          errors.push({
            path: 'phases',
            message: `שבועות לא מכוסים על ידי אף פאזה: ${uncoveredWeeks.join(', ')}`,
            severity: 'error',
          });

        // Overlap check
        for (let a = 0; a < phases.length; a++) {
          for (let b = a + 1; b < phases.length; b++) {
            if (phases[a].startWeek <= phases[b].endWeek && phases[b].startWeek <= phases[a].endWeek)
              errors.push({
                path: 'phases',
                message: `חפיפה בין ${phases[a].name} ו-${phases[b].name}`,
                severity: 'warning',
              });
          }
        }
      }
    }
  }

  // VolumeCaps
  if (p.volumeCaps !== undefined) {
    if (!Array.isArray(p.volumeCaps)) {
      errors.push({ path: 'volumeCaps', message: 'חייב להיות מערך', severity: 'error' });
    } else {
      for (let i = 0; i < (p.volumeCaps as VolumeCap[]).length; i++) {
        const cap = (p.volumeCaps as VolumeCap[])[i];
        if (!VALID_CAP_TARGETS.includes(cap.target))
          errors.push({ path: `volumeCaps[${i}].target`, message: `לא חוקי: "${cap.target}". ערכים חוקיים: ${VALID_CAP_TARGETS.join(', ')}`, severity: 'error' });
        if (typeof cap.maxValue !== 'number' || cap.maxValue <= 0)
          errors.push({ path: `volumeCaps[${i}].maxValue`, message: 'חייב להיות מספר חיובי', severity: 'error' });
        if (cap.maxWeeklyIncreasePercent != null && typeof cap.maxWeeklyIncreasePercent !== 'number')
          errors.push({ path: `volumeCaps[${i}].maxWeeklyIncreasePercent`, message: 'חייב להיות מספר אם קיים', severity: 'warning' });
      }
    }
  }

  return errors;
}

// ── resolveActiveSlots (mirrors engine logic) ────────────────────────

function resolveActiveSlots(slots: WeekSlot[], userFrequency: number): WeekSlot[] {
  const sorted = [...slots].sort((a, b) => a.priority - b.priority);
  const requiredSlots = sorted.filter((s) => s.required);
  const optionalSlots = sorted.filter((s) => !s.required);
  const slotsToFill = Math.min(userFrequency, sorted.length);
  const result = [...requiredSlots];
  for (const slot of optionalSlots) {
    if (result.length >= slotsToFill) break;
    result.push(slot);
  }
  return result;
}

// ── Types ────────────────────────────────────────────────────────────

interface NameResolution {
  name: string;
  found: boolean;
  firestoreId: string | null;
}

interface PreviewData {
  program: ImportProgramJSON;
  action: 'create' | 'update';
  existingId?: string;
  nameResolutions: NameResolution[];
  unresolvedCount: number;
  resolvedWeekTemplates: RunProgramWeekTemplate[];
  dbCategories: Set<string>;
  dbWorkoutsByCategory: Map<string, number>;
}

type Stage = 'input' | 'resolving' | 'preview' | 'importing' | 'done';

interface ImportResult {
  created: number;
  updated: number;
  errors: string[];
}

// ── Component ────────────────────────────────────────────────────────

export default function ImportProgramTemplatesPage() {
  const [jsonText, setJsonText] = useState('');
  const [stage, setStage] = useState<Stage>('input');
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const handleValidateAndResolve = async () => {
    setValidationErrors([]);
    setPreview(null);

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      setValidationErrors([{ path: 'JSON', message: 'JSON לא תקין — בדוק סוגריים וגרשיים', severity: 'error' }]);
      return;
    }

    const isArray = Array.isArray(parsed);
    const program: Record<string, unknown> = isArray
      ? (parsed as Record<string, unknown>[])[0]
      : (parsed as Record<string, unknown>);

    if (!program) {
      setValidationErrors([{ path: 'root', message: 'אובייקט ריק', severity: 'error' }]);
      return;
    }

    setStage('resolving');

    const [allWorkouts, allPrograms] = await Promise.all([
      getRunWorkoutTemplates(),
      getRunProgramTemplates(),
    ]);

    // Build category → count map from DB, normalizing Hebrew aliases to canonical keys
    const dbCategoryCount = new Map<string, number>();
    for (const w of allWorkouts) {
      if (w.category) {
        const canonical = CATEGORY_ALIASES[w.category] ?? w.category;
        dbCategoryCount.set(canonical, (dbCategoryCount.get(canonical) ?? 0) + 1);
      }
    }
    const dbCategories = new Set(dbCategoryCount.keys());

    const errors = validateProgram(program, dbCategories, dbCategoryCount);
    if (errors.some((e) => e.severity === 'error')) {
      setValidationErrors(errors);
      setStage('input');
      return;
    }
    setValidationErrors(errors.filter((e) => e.severity === 'warning'));

    const programData = program as unknown as ImportProgramJSON;

    // Resolve workout names → IDs
    const workoutByName = new Map<string, RunWorkoutTemplate>();
    for (const w of allWorkouts) workoutByName.set(w.name.trim().toLowerCase(), w);

    const allNames = new Set<string>();
    for (const wt of programData.weekTemplates) {
      for (const name of wt.workoutNames) allNames.add(name.trim());
    }

    const resolutions: NameResolution[] = [];
    for (const name of allNames) {
      const match = workoutByName.get(name.toLowerCase());
      resolutions.push({ name, found: !!match, firestoreId: match?.id ?? null });
    }

    const resolutionMap = new Map(resolutions.map((r) => [r.name.toLowerCase(), r]));

    const resolvedWeekTemplates: RunProgramWeekTemplate[] = programData.weekTemplates.map((wt) => ({
      weekNumber: wt.weekNumber,
      workoutIds: wt.workoutNames
        .map((name) => resolutionMap.get(name.trim().toLowerCase())?.firestoreId)
        .filter((id): id is string => id != null),
    }));

    const existingProgram = allPrograms.find(
      (p) => p.name.trim().toLowerCase() === programData.name.trim().toLowerCase(),
    );

    setPreview({
      program: programData,
      action: existingProgram ? 'update' : 'create',
      existingId: existingProgram?.id,
      nameResolutions: resolutions.sort((a, b) => {
        if (a.found === b.found) return a.name.localeCompare(b.name);
        return a.found ? 1 : -1;
      }),
      unresolvedCount: resolutions.filter((r) => !r.found).length,
      resolvedWeekTemplates,
      dbCategories,
      dbWorkoutsByCategory: dbCategoryCount,
    });
    setStage('preview');
  };

  const handleImport = async () => {
    if (!preview) return;
    setStage('importing');

    const { program, action, existingId, resolvedWeekTemplates } = preview;

    const template: Omit<RunProgramTemplate, 'id'> = {
      name: program.name.trim(),
      targetDistance: program.targetDistance,
      targetProfileTypes: program.targetProfileTypes,
      canonicalWeeks: program.canonicalWeeks,
      canonicalFrequency: program.canonicalFrequency,
      weekTemplates: resolvedWeekTemplates,
      progressionRules: program.progressionRules ?? [],
      ...(program.phases && program.phases.length > 0
        ? {
            phases: program.phases.map((p) => ({
              name: p.name,
              startWeek: p.startWeek,
              endWeek: p.endWeek,
              weekSlots: p.weekSlots ?? [],
              progressionRules: p.progressionRules ?? [],
              qualityPool: p.qualityPool ?? [],
              volumeMultiplier: p.volumeMultiplier ?? 1,
            })),
          }
        : {}),
      ...(program.volumeCaps && program.volumeCaps.length > 0
        ? { volumeCaps: program.volumeCaps }
        : {}),
    };

    const result: ImportResult = { created: 0, updated: 0, errors: [] };

    try {
      if (action === 'update' && existingId) {
        const ok = await updateRunProgramTemplate(existingId, template);
        if (ok) result.updated = 1;
        else result.errors.push('שגיאה בעדכון התוכנית');
      } else {
        const id = await createRunProgramTemplate(template);
        if (id) result.created = 1;
        else result.errors.push('שגיאה ביצירת התוכנית');
      }
    } catch (err) {
      result.errors.push((err as Error).message);
    }

    setImportResult(result);
    setStage('done');
  };

  const handleReset = () => {
    setJsonText('');
    setStage('input');
    setValidationErrors([]);
    setPreview(null);
    setImportResult(null);
  };

  return (
    <div className="max-w-5xl space-y-6" dir="rtl">
      {/* Header */}
      <div>
        <Link href="/admin/running/programs" className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-2">
          <ArrowRight size={18} /> חזרה לתוכניות
        </Link>
        <h1 className="text-3xl font-black text-gray-900">ייבוא תוכנית ריצה</h1>
        <p className="text-gray-500 mt-1">
          הדבק JSON של תוכנית עם <strong>שמות אימונים</strong> ו-<strong>phases</strong>.
          המערכת תאמת, תמפה IDs, ותראה סימולציית תדירות לפני הייבוא.
        </p>
      </div>

      {/* Input */}
      {(stage === 'input' || stage === 'preview') && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-center gap-2 text-gray-700">
            <FileJson size={20} />
            <h2 className="text-lg font-bold">JSON Input</h2>
          </div>

          <textarea
            value={jsonText}
            onChange={(e) => { setJsonText(e.target.value); if (stage === 'preview') setStage('input'); }}
            dir="ltr"
            className="w-full h-80 px-4 py-3 font-mono text-sm bg-gray-50 border border-gray-300 rounded-xl resize-y focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400"
            placeholder={`{
  "name": "תוכנית 5 ק״מ — 12 שבועות",
  "targetDistance": "5k",
  "targetProfileTypes": [1, 2],
  "canonicalWeeks": 12,
  "canonicalFrequency": 3,
  "weekTemplates": [
    { "weekNumber": 1, "workoutNames": ["8×400 מ׳ קלאסי", "ריצה קלה", "ריצה ארוכה"] }
  ],
  "phases": [
    {
      "name": "base", "startWeek": 1, "endWeek": 4,
      "volumeMultiplier": [1.0, 1.05, 0.85, 1.1],
      "qualityPool": ["fartlek_structured", "easy_run", "long_run"],
      "weekSlots": [
        { "id": "q1", "slotType": "quality_primary", "required": true, "priority": 1, "allowedCategories": ["fartlek_structured"] },
        { "id": "lr", "slotType": "long_run", "required": true, "priority": 2, "allowedCategories": ["long_run"] },
        { "id": "e1", "slotType": "easy_run", "required": false, "priority": 3, "allowedCategories": ["easy_run"] }
      ]
    }
  ],
  "volumeCaps": [
    { "type": "cap", "target": "weekly_volume", "maxValue": 180, "maxWeeklyIncreasePercent": 10 }
  ]
}`}
          />

          {/* Validation errors/warnings */}
          {validationErrors.length > 0 && (
            <div className="space-y-2">
              {validationErrors.filter((e) => e.severity === 'error').length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2 text-red-700 font-bold">
                    <XCircle size={18} />
                    <span>שגיאות ({validationErrors.filter((e) => e.severity === 'error').length})</span>
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {validationErrors.filter((e) => e.severity === 'error').map((err, i) => (
                      <div key={i} className="text-sm text-red-600">
                        <span className="font-mono text-red-800">{err.path}</span>: {err.message}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {validationErrors.filter((e) => e.severity === 'warning').length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2 text-amber-700 font-bold">
                    <AlertTriangle size={18} />
                    <span>אזהרות ({validationErrors.filter((e) => e.severity === 'warning').length})</span>
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {validationErrors.filter((e) => e.severity === 'warning').map((err, i) => (
                      <div key={i} className="text-sm text-amber-600">
                        <span className="font-mono text-amber-800">{err.path}</span>: {err.message}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {stage === 'input' && (
            <button
              onClick={handleValidateAndResolve}
              disabled={!jsonText.trim()}
              className="flex items-center gap-2 px-6 py-3 bg-cyan-500 text-white rounded-xl font-bold hover:bg-cyan-600 disabled:opacity-50"
            >
              <Search size={18} /> אמת ומצא אימונים
            </button>
          )}
        </div>
      )}

      {/* Resolving spinner */}
      {stage === 'resolving' && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-cyan-500" size={40} />
          <p className="text-gray-600 font-bold">מחפש אימונים ואימות פאזות...</p>
        </div>
      )}

      {/* Preview */}
      {stage === 'preview' && preview && (
        <>
          {/* Program Summary */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-900">סיכום תוכנית</h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-gray-500">שם</div>
                <div className="font-bold text-gray-900">{preview.program.name}</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-gray-500">מרחק יעד</div>
                <div className="font-bold text-gray-900">{preview.program.targetDistance}</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-gray-500">שבועות</div>
                <div className="font-bold text-gray-900">{preview.program.canonicalWeeks}</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-gray-500">תדירות</div>
                <div className="font-bold text-gray-900">{preview.program.canonicalFrequency}×/שבוע</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-gray-500">פעולה</div>
                <div className={`font-bold ${preview.action === 'create' ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {preview.action === 'create' ? 'יצירה חדשה' : `עדכון (${preview.existingId?.slice(0, 8)}…)`}
                </div>
              </div>
            </div>
          </div>

          {/* Phases + Frequency Simulation */}
          {preview.program.phases && preview.program.phases.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Layers size={20} className="text-gray-600" />
                <h2 className="text-lg font-bold text-gray-900">פאזות וסימולציית תדירות</h2>
              </div>

              {preview.program.phases.map((phase, pi) => {
                const activeSlots = phase.weekSlots
                  ? resolveActiveSlots(phase.weekSlots, preview.program.canonicalFrequency)
                  : [];
                const droppedSlots = (phase.weekSlots ?? []).filter(
                  (s) => !activeSlots.find((a) => a.id === s.id),
                );

                return (
                  <div key={pi} className={`border rounded-xl p-4 space-y-3 ${PHASE_COLORS[phase.name] ?? 'border-gray-200'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-black capitalize">{phase.name}</span>
                        <span className="text-sm opacity-75">שבועות {phase.startWeek}–{phase.endWeek}</span>
                      </div>
                      <div className="text-sm font-bold">
                        {Array.isArray(phase.volumeMultiplier)
                          ? `מכפילים: [${phase.volumeMultiplier.join(', ')}]`
                          : `מכפיל: ×${phase.volumeMultiplier ?? 1}`}
                      </div>
                    </div>

                    {/* Quality Pool */}
                    {phase.qualityPool && phase.qualityPool.length > 0 && (
                      <div>
                        <div className="text-xs font-bold opacity-60 mb-1">Quality Pool</div>
                        <div className="flex flex-wrap gap-1">
                          {phase.qualityPool.map((cat) => (
                            <span key={cat} className="px-2 py-0.5 rounded text-xs font-bold bg-white/60">
                              {cat}
                              {preview.dbWorkoutsByCategory.has(cat) && (
                                <span className="mr-1 opacity-60">({preview.dbWorkoutsByCategory.get(cat)})</span>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Slot simulation */}
                    {phase.weekSlots && phase.weekSlots.length > 0 && (
                      <div>
                        <div className="text-xs font-bold opacity-60 mb-1">
                          <Activity size={12} className="inline ml-1" />
                          סלוטים פעילים בתדירות {preview.program.canonicalFrequency} ({activeSlots.length}/{phase.weekSlots.length})
                        </div>
                        <div className="space-y-1">
                          {activeSlots.map((slot) => (
                            <div key={slot.id} className="flex items-center gap-2 text-sm bg-white/50 rounded px-3 py-1.5">
                              <CheckCircle size={14} className="text-emerald-600 flex-shrink-0" />
                              <span className="font-bold w-20">{SLOT_TYPE_LABELS[slot.slotType] ?? slot.slotType}</span>
                              <span className="text-xs opacity-60">P{slot.priority}</span>
                              {slot.required && <Shield size={12} className="text-blue-500" title="חובה" />}
                              <div className="flex-1 flex flex-wrap gap-1">
                                {slot.allowedCategories.map((c) => (
                                  <span key={c} className="px-1.5 py-0.5 rounded bg-gray-100 text-xs">{c}</span>
                                ))}
                              </div>
                            </div>
                          ))}
                          {droppedSlots.map((slot) => (
                            <div key={slot.id} className="flex items-center gap-2 text-sm bg-red-50/50 rounded px-3 py-1.5 opacity-50 line-through">
                              <XCircle size={14} className="text-red-400 flex-shrink-0" />
                              <span className="font-bold w-20">{SLOT_TYPE_LABELS[slot.slotType] ?? slot.slotType}</span>
                              <span className="text-xs">P{slot.priority} — יושמט</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Phase progression rules */}
                    {phase.progressionRules && phase.progressionRules.length > 0 && (
                      <div className="text-xs opacity-60">
                        {phase.progressionRules.length} חוקי התקדמות בפאזה
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Volume Caps */}
          {preview.program.volumeCaps && preview.program.volumeCaps.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
              <div className="flex items-center gap-2">
                <Gauge size={20} className="text-gray-600" />
                <h2 className="text-lg font-bold text-gray-900">Volume Caps</h2>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {preview.program.volumeCaps.map((cap, i) => {
                  const isDistance = cap.target === 'weekly_distance' || cap.target === 'single_run_distance';
                  const unit = cap.target === 'sets_per_block'
                    ? 'סטים'
                    : isDistance
                      ? 'מ׳'
                      : 'דק׳';
                  const displayValue = isDistance && cap.maxValue >= 1000
                    ? `${(cap.maxValue / 1000).toFixed(1)} ק״מ`
                    : `${cap.maxValue} ${unit}`;

                  return (
                    <div key={i} className="bg-gray-50 rounded-lg p-3 text-sm">
                      <div className="text-gray-500">{cap.target}</div>
                      <div className="font-bold text-gray-900">{displayValue}</div>
                      {cap.maxWeeklyIncreasePercent != null && (
                        <div className="text-xs text-gray-400">עליה שבועית: {cap.maxWeeklyIncreasePercent}%</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Name resolution */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Link2 size={20} className="text-gray-600" />
                <h2 className="text-lg font-bold text-gray-900">מיפוי שמות → IDs</h2>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 font-bold">
                  {preview.nameResolutions.filter((r) => r.found).length} נמצאו
                </span>
                {preview.unresolvedCount > 0 && (
                  <span className="px-3 py-1 rounded-full bg-red-100 text-red-700 font-bold">
                    {preview.unresolvedCount} חסרים
                  </span>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-600">
                    <th className="py-2 px-3 text-right font-bold">שם אימון</th>
                    <th className="py-2 px-3 text-right font-bold">סטטוס</th>
                    <th className="py-2 px-3 text-right font-bold" dir="ltr">Firestore ID</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.nameResolutions.map((res, i) => (
                    <tr key={i} className={`border-b border-gray-100 ${!res.found ? 'bg-red-50' : 'hover:bg-gray-50'}`}>
                      <td className="py-2 px-3 font-bold text-gray-800">{res.name}</td>
                      <td className="py-2 px-3">
                        {res.found ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">נמצא</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-bold">לא נמצא!</span>
                        )}
                      </td>
                      <td className="py-2 px-3 font-mono text-xs text-gray-500" dir="ltr">{res.firestoreId ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {preview.unresolvedCount > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
                <strong>{preview.unresolvedCount} אימונים לא נמצאו.</strong>{' '}
                ייבא קודם דרך{' '}
                <Link href="/admin/running/import/workouts" className="underline font-bold">ייבוא אימונים</Link>.
              </div>
            )}
          </div>

          {/* Week-by-week preview */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-900">תצוגת שבועות (Legacy)</h2>
            <div className="max-h-60 overflow-y-auto space-y-1">
              {preview.resolvedWeekTemplates.map((wt) => {
                const origNames = preview.program.weekTemplates.find((w) => w.weekNumber === wt.weekNumber)?.workoutNames ?? [];
                const phase = preview.program.phases?.find((p) => wt.weekNumber >= p.startWeek && wt.weekNumber <= p.endWeek);
                return (
                  <div key={wt.weekNumber} className="flex items-center gap-3 text-sm">
                    <span className="w-16 font-bold text-gray-700">שבוע {wt.weekNumber}</span>
                    {phase && (
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${PHASE_COLORS[phase.name] ?? ''}`}>
                        {phase.name}
                      </span>
                    )}
                    <div className="flex-1 flex flex-wrap gap-1">
                      {origNames.map((name, ni) => {
                        const res = preview.nameResolutions.find((r) => r.name.toLowerCase() === name.trim().toLowerCase());
                        return (
                          <span key={ni} className={`px-2 py-0.5 rounded text-xs font-bold ${res?.found ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600 line-through'}`}>
                            {name}
                          </span>
                        );
                      })}
                    </div>
                    <span className="text-gray-400 text-xs">{wt.workoutIds.length} מקושרים</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleImport}
              className="flex items-center gap-2 px-6 py-3 bg-emerald-500 text-white rounded-xl font-bold hover:bg-emerald-600"
            >
              <CheckCircle size={18} /> אשר ייבוא
            </button>
            <button onClick={() => setStage('input')} className="px-4 py-3 text-gray-600 hover:text-gray-900 font-bold">
              חזור לעריכה
            </button>
          </div>
        </>
      )}

      {/* Importing */}
      {stage === 'importing' && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-cyan-500" size={40} />
          <p className="text-gray-600 font-bold">מייבא תוכנית...</p>
        </div>
      )}

      {/* Done */}
      {stage === 'done' && importResult && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-center gap-3">
            {importResult.errors.length === 0 ? (
              <CheckCircle size={28} className="text-emerald-500" />
            ) : (
              <AlertTriangle size={28} className="text-amber-500" />
            )}
            <h2 className="text-xl font-black text-gray-900">ייבוא הושלם</h2>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="bg-emerald-50 rounded-xl p-4 text-center">
              <div className="text-3xl font-black text-emerald-600">{importResult.created}</div>
              <div className="text-sm text-emerald-700 font-bold mt-1">נוצרו</div>
            </div>
            <div className="bg-amber-50 rounded-xl p-4 text-center">
              <div className="text-3xl font-black text-amber-600">{importResult.updated}</div>
              <div className="text-sm text-amber-700 font-bold mt-1">עודכנו</div>
            </div>
            <div className={`rounded-xl p-4 text-center ${importResult.errors.length > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
              <div className={`text-3xl font-black ${importResult.errors.length > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                {importResult.errors.length}
              </div>
              <div className="text-sm text-gray-600 font-bold mt-1">שגיאות</div>
            </div>
          </div>

          {importResult.errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-1">
              {importResult.errors.map((err, i) => (
                <div key={i} className="text-sm text-red-600">{err}</div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button onClick={handleReset} className="flex items-center gap-2 px-6 py-3 bg-cyan-500 text-white rounded-xl font-bold hover:bg-cyan-600">
              ייבוא נוסף
            </button>
            <Link href="/admin/running/programs" className="px-4 py-3 text-gray-600 hover:text-gray-900 font-bold">
              עבור לתוכניות
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
