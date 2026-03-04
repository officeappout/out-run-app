'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Upload,
  Loader2,
  CheckCircle,
  AlertTriangle,
  XCircle,
  FileJson,
} from 'lucide-react';
import {
  getRunWorkoutTemplates,
  createRunWorkoutTemplate,
  updateRunWorkoutTemplate,
} from '@/features/workout-engine/core/services/running-admin.service';
import type {
  RunWorkoutTemplate,
  RunBlockTemplate,
  WorkoutCategory,
  RunnerProfileType,
} from '@/features/workout-engine/core/types/running.types';

// ── Validation helpers ──────────────────────────────────────────────

const VALID_BLOCK_TYPES = ['warmup', 'run', 'walk', 'interval', 'recovery', 'cooldown'];
const VALID_ZONE_TYPES = [
  'walk', 'jogging', 'recovery', 'easy', 'long_run',
  'fartlek_medium', 'tempo', 'fartlek_fast', 'interval_short',
];
const VALID_CATEGORIES: WorkoutCategory[] = [
  'short_intervals', 'long_intervals', 'fartlek_easy', 'fartlek_structured',
  'tempo', 'hill_long', 'hill_short', 'hill_sprints', 'long_run', 'easy_run', 'strides',
];
const VALID_MEASURE_BY = ['time', 'distance'];
const VALID_BLOCK_MODES = ['pace', 'effort'];
const VALID_EFFORT_LEVELS = ['moderate', 'hard', 'max'];
const VALID_REST_TYPES = ['standing', 'walk', 'jog'];

interface ValidationError {
  workoutIndex: number;
  workoutName: string;
  field: string;
  message: string;
}

function validateBlock(block: Record<string, unknown>, blockIdx: number, wIdx: number, wName: string): ValidationError[] {
  const errors: ValidationError[] = [];
  const ctx = `blocks[${blockIdx}]`;

  if (typeof block.id !== 'string' || !block.id) {
    errors.push({ workoutIndex: wIdx, workoutName: wName, field: `${ctx}.id`, message: 'חסר או לא תקין' });
  }
  if (!VALID_BLOCK_TYPES.includes(block.type as string)) {
    errors.push({ workoutIndex: wIdx, workoutName: wName, field: `${ctx}.type`, message: `חייב להיות אחד מ: ${VALID_BLOCK_TYPES.join(', ')}` });
  }
  if (!VALID_ZONE_TYPES.includes(block.zoneType as string)) {
    errors.push({ workoutIndex: wIdx, workoutName: wName, field: `${ctx}.zoneType`, message: `חייב להיות אחד מ: ${VALID_ZONE_TYPES.join(', ')}` });
  }
  if (typeof block.isQualityExercise !== 'boolean') {
    errors.push({ workoutIndex: wIdx, workoutName: wName, field: `${ctx}.isQualityExercise`, message: 'חייב להיות true או false' });
  }
  if (!VALID_MEASURE_BY.includes(block.measureBy as string)) {
    errors.push({ workoutIndex: wIdx, workoutName: wName, field: `${ctx}.measureBy`, message: "חייב להיות 'time' או 'distance'" });
  }
  if (typeof block.baseValue !== 'number' || block.baseValue <= 0) {
    errors.push({ workoutIndex: wIdx, workoutName: wName, field: `${ctx}.baseValue`, message: 'חייב להיות מספר חיובי' });
  }
  if (typeof block.sets !== 'number' || block.sets < 1) {
    errors.push({ workoutIndex: wIdx, workoutName: wName, field: `${ctx}.sets`, message: 'חייב להיות לפחות 1' });
  }
  if (typeof block.label !== 'string' || !block.label) {
    errors.push({ workoutIndex: wIdx, workoutName: wName, field: `${ctx}.label`, message: 'חסר' });
  }
  if (typeof block.colorHex !== 'string' || !block.colorHex) {
    errors.push({ workoutIndex: wIdx, workoutName: wName, field: `${ctx}.colorHex`, message: 'חסר' });
  }

  if (block.blockMode !== undefined && !VALID_BLOCK_MODES.includes(block.blockMode as string)) {
    errors.push({ workoutIndex: wIdx, workoutName: wName, field: `${ctx}.blockMode`, message: "חייב להיות 'pace' או 'effort'" });
  }

  if (block.blockMode === 'effort') {
    const ec = block.effortConfig as Record<string, unknown> | undefined;
    if (!ec || !VALID_EFFORT_LEVELS.includes(ec.effortLevel as string)) {
      errors.push({ workoutIndex: wIdx, workoutName: wName, field: `${ctx}.effortConfig.effortLevel`, message: 'חסר או לא תקין עבור blockMode=effort' });
    }
  }

  if (block.restBetweenSetsSeconds !== undefined && typeof block.restBetweenSetsSeconds !== 'number') {
    errors.push({ workoutIndex: wIdx, workoutName: wName, field: `${ctx}.restBetweenSetsSeconds`, message: 'חייב להיות מספר' });
  }
  if (block.restType !== undefined && !VALID_REST_TYPES.includes(block.restType as string)) {
    errors.push({ workoutIndex: wIdx, workoutName: wName, field: `${ctx}.restType`, message: "חייב להיות 'standing', 'walk' או 'jog'" });
  }

  return errors;
}

function validateWorkout(w: Record<string, unknown>, idx: number): ValidationError[] {
  const errors: ValidationError[] = [];
  const name = typeof w.name === 'string' ? w.name : `#${idx + 1}`;

  if (typeof w.name !== 'string' || !w.name.trim()) {
    errors.push({ workoutIndex: idx, workoutName: name, field: 'name', message: 'חסר' });
  }
  if (typeof w.isQualityWorkout !== 'boolean') {
    errors.push({ workoutIndex: idx, workoutName: name, field: 'isQualityWorkout', message: 'חייב להיות true או false' });
  }
  if (!Array.isArray(w.targetProfileTypes) || w.targetProfileTypes.length === 0) {
    errors.push({ workoutIndex: idx, workoutName: name, field: 'targetProfileTypes', message: 'חייב להיות מערך עם לפחות פרופיל אחד [1,2,3,4]' });
  }
  if (!Array.isArray(w.blocks) || w.blocks.length === 0) {
    errors.push({ workoutIndex: idx, workoutName: name, field: 'blocks', message: 'חייב להכיל לפחות בלוק אחד' });
  }
  if (w.category !== undefined && !VALID_CATEGORIES.includes(w.category as WorkoutCategory)) {
    errors.push({ workoutIndex: idx, workoutName: name, field: 'category', message: `לא תקין. ערכים: ${VALID_CATEGORIES.join(', ')}` });
  }
  if (w.priority !== undefined && (typeof w.priority !== 'number' || w.priority < 1)) {
    errors.push({ workoutIndex: idx, workoutName: name, field: 'priority', message: 'חייב להיות מספר >= 1' });
  }

  if (Array.isArray(w.blocks)) {
    for (let bi = 0; bi < w.blocks.length; bi++) {
      errors.push(...validateBlock(w.blocks[bi] as Record<string, unknown>, bi, idx, name));
    }
  }

  return errors;
}

// ── Preview row type ────────────────────────────────────────────────

interface PreviewRow {
  name: string;
  category: string;
  priority: number | undefined;
  blockCount: number;
  isQuality: boolean;
  action: 'create' | 'update';
  existingId?: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  short_intervals: 'אינטרוולים קצרים',
  long_intervals: 'אינטרוולים ארוכים',
  fartlek_easy: 'פארטלק קל',
  fartlek_structured: 'פארטלק מובנה',
  tempo: 'טמפו',
  hill_long: 'עליות ארוכות',
  hill_short: 'עליות קצרות',
  hill_sprints: 'ספרינט עליות',
  long_run: 'ריצה ארוכה',
  easy_run: 'ריצה קלה',
  strides: 'סטרייד',
};

// ── Component ───────────────────────────────────────────────────────

type Stage = 'input' | 'preview' | 'importing' | 'done';

interface ImportResult {
  created: number;
  updated: number;
  errors: string[];
}

export default function ImportWorkoutTemplatesPage() {
  const [jsonText, setJsonText] = useState('');
  const [stage, setStage] = useState<Stage>('input');
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [parsedWorkouts, setParsedWorkouts] = useState<Omit<RunWorkoutTemplate, 'id'>[]>([]);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const handleValidate = async () => {
    setValidationErrors([]);
    setPreviewRows([]);

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      setValidationErrors([{
        workoutIndex: -1, workoutName: 'JSON', field: 'root', message: 'JSON לא תקין — בדוק סוגריים וגרשיים',
      }]);
      return;
    }

    if (!Array.isArray(parsed)) {
      setValidationErrors([{
        workoutIndex: -1, workoutName: 'JSON', field: 'root', message: 'השורש חייב להיות מערך []',
      }]);
      return;
    }

    if (parsed.length === 0) {
      setValidationErrors([{
        workoutIndex: -1, workoutName: 'JSON', field: 'root', message: 'המערך ריק',
      }]);
      return;
    }

    const allErrors: ValidationError[] = [];
    for (let i = 0; i < parsed.length; i++) {
      allErrors.push(...validateWorkout(parsed[i] as Record<string, unknown>, i));
    }

    if (allErrors.length > 0) {
      setValidationErrors(allErrors);
      return;
    }

    const existing = await getRunWorkoutTemplates();
    const existingByName = new Map(existing.map((t) => [t.name.trim().toLowerCase(), t]));

    const rows: PreviewRow[] = [];
    const workouts: Omit<RunWorkoutTemplate, 'id'>[] = [];

    for (const item of parsed as Record<string, unknown>[]) {
      const name = (item.name as string).trim();
      const key = name.toLowerCase();
      const match = existingByName.get(key);

      const workout: Omit<RunWorkoutTemplate, 'id'> = {
        name,
        isQualityWorkout: item.isQualityWorkout as boolean,
        targetProfileTypes: item.targetProfileTypes as RunnerProfileType[],
        blocks: item.blocks as RunBlockTemplate[],
        ...(item.category ? { category: item.category as WorkoutCategory } : {}),
        ...(item.priority !== undefined ? { priority: item.priority as number } : {}),
        ...(item.videoIds ? { videoIds: item.videoIds as string[] } : {}),
      };

      rows.push({
        name,
        category: CATEGORY_LABELS[item.category as string] ?? (item.category as string) ?? '—',
        priority: item.priority as number | undefined,
        blockCount: (item.blocks as unknown[]).length,
        isQuality: item.isQualityWorkout as boolean,
        action: match ? 'update' : 'create',
        existingId: match?.id,
      });

      workouts.push(workout);
    }

    setParsedWorkouts(workouts);
    setPreviewRows(rows);
    setStage('preview');
  };

  const handleImport = async () => {
    setStage('importing');
    const result: ImportResult = { created: 0, updated: 0, errors: [] };

    for (let i = 0; i < parsedWorkouts.length; i++) {
      const workout = parsedWorkouts[i];
      const row = previewRows[i];

      try {
        if (row.action === 'update' && row.existingId) {
          const ok = await updateRunWorkoutTemplate(row.existingId, workout);
          if (ok) result.updated++;
          else result.errors.push(`${row.name}: שגיאה בעדכון`);
        } else {
          const id = await createRunWorkoutTemplate(workout);
          if (id) result.created++;
          else result.errors.push(`${row.name}: שגיאה ביצירה`);
        }
      } catch (err) {
        result.errors.push(`${row.name}: ${(err as Error).message}`);
      }
    }

    setImportResult(result);
    setStage('done');
  };

  const handleReset = () => {
    setJsonText('');
    setStage('input');
    setValidationErrors([]);
    setPreviewRows([]);
    setParsedWorkouts([]);
    setImportResult(null);
  };

  const createCount = previewRows.filter((r) => r.action === 'create').length;
  const updateCount = previewRows.filter((r) => r.action === 'update').length;

  return (
    <div className="max-w-5xl space-y-6" dir="rtl">
      {/* Header */}
      <div>
        <Link
          href="/admin/running/workouts"
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-2"
        >
          <ArrowRight size={18} />
          חזרה לתבניות אימון
        </Link>
        <h1 className="text-3xl font-black text-gray-900">ייבוא תבניות אימון</h1>
        <p className="text-gray-500 mt-1">
          הדבק מערך JSON של RunWorkoutTemplate. המערכת תזהה אימונים קיימים לפי שם ותעדכן אותם.
        </p>
      </div>

      {/* Stage: Input */}
      {(stage === 'input' || stage === 'preview') && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-center gap-2 text-gray-700">
            <FileJson size={20} />
            <h2 className="text-lg font-bold">JSON Input</h2>
          </div>

          <textarea
            value={jsonText}
            onChange={(e) => {
              setJsonText(e.target.value);
              if (stage === 'preview') setStage('input');
            }}
            dir="ltr"
            className="w-full h-72 px-4 py-3 font-mono text-sm bg-gray-50 border border-gray-300 rounded-xl resize-y focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400"
            placeholder={`[\n  {\n    "name": "אינטרוולים 400 מטר",\n    "isQualityWorkout": true,\n    "category": "short_intervals",\n    "targetProfileTypes": [1, 2],\n    "blocks": [\n      {\n        "id": "warmup_1",\n        "type": "warmup",\n        "zoneType": "easy",\n        "isQualityExercise": false,\n        "measureBy": "time",\n        "baseValue": 600,\n        "sets": 1,\n        "label": "חימום",\n        "colorHex": "#10B981"\n      }\n    ]\n  }\n]`}
          />

          {/* Validation errors */}
          {validationErrors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-red-700 font-bold">
                <XCircle size={18} />
                <span>שגיאות ולידציה ({validationErrors.length})</span>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {validationErrors.map((err, i) => (
                  <div key={i} className="text-sm text-red-600">
                    <span className="font-bold">{err.workoutName}</span>
                    {' → '}
                    <span className="font-mono text-red-800">{err.field}</span>
                    {': '}
                    {err.message}
                  </div>
                ))}
              </div>
            </div>
          )}

          {stage === 'input' && (
            <button
              onClick={handleValidate}
              disabled={!jsonText.trim()}
              className="flex items-center gap-2 px-6 py-3 bg-cyan-500 text-white rounded-xl font-bold hover:bg-cyan-600 disabled:opacity-50"
            >
              <Upload size={18} />
              אמת ותצוגה מקדימה
            </button>
          )}
        </div>
      )}

      {/* Stage: Preview */}
      {stage === 'preview' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">
              תצוגה מקדימה — {previewRows.length} אימונים
            </h2>
            <div className="flex items-center gap-3 text-sm">
              <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 font-bold">
                {createCount} חדשים
              </span>
              <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-700 font-bold">
                {updateCount} עדכונים
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-600">
                  <th className="py-2 px-3 text-right font-bold">#</th>
                  <th className="py-2 px-3 text-right font-bold">שם</th>
                  <th className="py-2 px-3 text-right font-bold">קטגוריה</th>
                  <th className="py-2 px-3 text-right font-bold">עדיפות</th>
                  <th className="py-2 px-3 text-right font-bold">בלוקים</th>
                  <th className="py-2 px-3 text-right font-bold">איכות</th>
                  <th className="py-2 px-3 text-right font-bold">פעולה</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, i) => (
                  <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 px-3 text-gray-400">{i + 1}</td>
                    <td className="py-2 px-3 font-bold text-gray-800">{row.name}</td>
                    <td className="py-2 px-3 text-gray-600">{row.category}</td>
                    <td className="py-2 px-3 text-gray-600">{row.priority ?? '—'}</td>
                    <td className="py-2 px-3 text-gray-600">{row.blockCount}</td>
                    <td className="py-2 px-3">
                      {row.isQuality ? (
                        <span className="px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-700 text-xs font-bold">כן</span>
                      ) : (
                        <span className="text-gray-400 text-xs">לא</span>
                      )}
                    </td>
                    <td className="py-2 px-3">
                      {row.action === 'create' ? (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
                          יצירה
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">
                          עדכון
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleImport}
              className="flex items-center gap-2 px-6 py-3 bg-emerald-500 text-white rounded-xl font-bold hover:bg-emerald-600"
            >
              <CheckCircle size={18} />
              אשר ייבוא ({previewRows.length} אימונים)
            </button>
            <button
              onClick={() => setStage('input')}
              className="px-4 py-3 text-gray-600 hover:text-gray-900 font-bold"
            >
              חזור לעריכה
            </button>
          </div>
        </div>
      )}

      {/* Stage: Importing */}
      {stage === 'importing' && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-cyan-500" size={40} />
          <p className="text-gray-600 font-bold">מייבא אימונים...</p>
        </div>
      )}

      {/* Stage: Done */}
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
            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-6 py-3 bg-cyan-500 text-white rounded-xl font-bold hover:bg-cyan-600"
            >
              ייבוא נוסף
            </button>
            <Link
              href="/admin/running/workouts"
              className="px-4 py-3 text-gray-600 hover:text-gray-900 font-bold"
            >
              עבור לתבניות אימון
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
