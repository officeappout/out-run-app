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
  Search,
  Link2,
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

// ── Types for the import JSON format ────────────────────────────────

/**
 * The user pastes this format — workout references use NAMES, not IDs.
 * The importer resolves names → Firestore IDs automatically.
 */
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
  targetDistance: '3k' | '5k' | '10k' | 'maintenance';
  targetProfileTypes: RunnerProfileType[];
  canonicalWeeks: number;
  canonicalFrequency: 2 | 3 | 4;
  weekTemplates: ImportWeekTemplate[];
  progressionRules?: ProgressionRule[];
  phases?: ImportPhase[];
  volumeCaps?: VolumeCap[];
}

// ── Validation ──────────────────────────────────────────────────────

interface ValidationError {
  path: string;
  message: string;
}

const VALID_DISTANCES = ['3k', '5k', '10k', 'maintenance'];
const VALID_FREQUENCIES = [2, 3, 4];
const VALID_PHASE_NAMES = ['base', 'build', 'peak', 'taper'];

function validateProgram(p: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];

  if (typeof p.name !== 'string' || !p.name.trim()) {
    errors.push({ path: 'name', message: 'חסר' });
  }
  if (!VALID_DISTANCES.includes(p.targetDistance as string)) {
    errors.push({ path: 'targetDistance', message: `חייב להיות: ${VALID_DISTANCES.join(', ')}` });
  }
  if (!Array.isArray(p.targetProfileTypes) || p.targetProfileTypes.length === 0) {
    errors.push({ path: 'targetProfileTypes', message: 'מערך ריק או חסר' });
  }
  if (typeof p.canonicalWeeks !== 'number' || p.canonicalWeeks < 1) {
    errors.push({ path: 'canonicalWeeks', message: 'חייב להיות מספר >= 1' });
  }
  if (!VALID_FREQUENCIES.includes(p.canonicalFrequency as number)) {
    errors.push({ path: 'canonicalFrequency', message: 'חייב להיות 2, 3 או 4' });
  }

  if (!Array.isArray(p.weekTemplates)) {
    errors.push({ path: 'weekTemplates', message: 'חסר — חייב להיות מערך' });
  } else {
    for (let i = 0; i < (p.weekTemplates as ImportWeekTemplate[]).length; i++) {
      const wt = (p.weekTemplates as ImportWeekTemplate[])[i];
      if (typeof wt.weekNumber !== 'number') {
        errors.push({ path: `weekTemplates[${i}].weekNumber`, message: 'חסר' });
      }
      if (!Array.isArray(wt.workoutNames)) {
        errors.push({ path: `weekTemplates[${i}].workoutNames`, message: 'חסר — חייב להיות מערך של שמות אימונים' });
      } else {
        for (let j = 0; j < wt.workoutNames.length; j++) {
          if (typeof wt.workoutNames[j] !== 'string' || !wt.workoutNames[j].trim()) {
            errors.push({ path: `weekTemplates[${i}].workoutNames[${j}]`, message: 'שם ריק' });
          }
        }
      }
    }
  }

  if (p.phases !== undefined) {
    if (!Array.isArray(p.phases)) {
      errors.push({ path: 'phases', message: 'חייב להיות מערך' });
    } else {
      for (let i = 0; i < (p.phases as ImportPhase[]).length; i++) {
        const phase = (p.phases as ImportPhase[])[i];
        if (!VALID_PHASE_NAMES.includes(phase.name)) {
          errors.push({ path: `phases[${i}].name`, message: `חייב להיות: ${VALID_PHASE_NAMES.join(', ')}` });
        }
        if (typeof phase.startWeek !== 'number') {
          errors.push({ path: `phases[${i}].startWeek`, message: 'חסר' });
        }
        if (typeof phase.endWeek !== 'number') {
          errors.push({ path: `phases[${i}].endWeek`, message: 'חסר' });
        }
        if (phase.volumeMultiplier !== undefined) {
          if (Array.isArray(phase.volumeMultiplier)) {
            if (phase.volumeMultiplier.some((v: unknown) => typeof v !== 'number' || v <= 0)) {
              errors.push({ path: `phases[${i}].volumeMultiplier`, message: 'כל הערכים במערך חייבים להיות מספרים חיוביים' });
            }
          } else if (typeof phase.volumeMultiplier !== 'number' || phase.volumeMultiplier <= 0) {
            errors.push({ path: `phases[${i}].volumeMultiplier`, message: 'חייב להיות מספר חיובי או מערך מספרים' });
          }
        }
      }
    }
  }

  return errors;
}

// ── Name resolution types ───────────────────────────────────────────

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
}

// ── Component ───────────────────────────────────────────────────────

type Stage = 'input' | 'resolving' | 'preview' | 'importing' | 'done';

interface ImportResult {
  created: number;
  updated: number;
  errors: string[];
}

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
      setValidationErrors([{ path: 'JSON', message: 'JSON לא תקין — בדוק סוגריים וגרשיים' }]);
      return;
    }

    const isArray = Array.isArray(parsed);
    const program: Record<string, unknown> = isArray
      ? (parsed as Record<string, unknown>[])[0]
      : (parsed as Record<string, unknown>);

    if (!program) {
      setValidationErrors([{ path: 'root', message: 'אובייקט ריק' }]);
      return;
    }

    const errors = validateProgram(program);
    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }

    setStage('resolving');

    const programData = program as unknown as ImportProgramJSON;

    // Fetch all workout templates and existing programs from Firestore
    const [allWorkouts, allPrograms] = await Promise.all([
      getRunWorkoutTemplates(),
      getRunProgramTemplates(),
    ]);

    const workoutByName = new Map<string, RunWorkoutTemplate>();
    for (const w of allWorkouts) {
      workoutByName.set(w.name.trim().toLowerCase(), w);
    }

    // Collect all unique workout names referenced across all weeks
    const allReferencedNames = new Set<string>();
    for (const wt of programData.weekTemplates) {
      for (const name of wt.workoutNames) {
        allReferencedNames.add(name.trim());
      }
    }

    // Resolve each name
    const resolutions: NameResolution[] = [];
    for (const name of allReferencedNames) {
      const match = workoutByName.get(name.toLowerCase());
      resolutions.push({
        name,
        found: !!match,
        firestoreId: match?.id ?? null,
      });
    }

    const resolutionMap = new Map(resolutions.map((r) => [r.name.toLowerCase(), r]));

    // Build resolved weekTemplates (name → ID)
    const resolvedWeekTemplates: RunProgramWeekTemplate[] = programData.weekTemplates.map((wt) => ({
      weekNumber: wt.weekNumber,
      workoutIds: wt.workoutNames
        .map((name) => resolutionMap.get(name.trim().toLowerCase())?.firestoreId)
        .filter((id): id is string => id != null),
    }));

    // Check if this program already exists by name
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
        <Link
          href="/admin/running/programs"
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-2"
        >
          <ArrowRight size={18} />
          חזרה לתוכניות
        </Link>
        <h1 className="text-3xl font-black text-gray-900">ייבוא תוכנית ריצה</h1>
        <p className="text-gray-500 mt-1">
          הדבק JSON של תוכנית עם <strong>שמות אימונים</strong> (לא IDs).
          המערכת תמצא את ה-ID של כל אימון מ-Firestore אוטומטית.
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
            onChange={(e) => {
              setJsonText(e.target.value);
              if (stage === 'preview') setStage('input');
            }}
            dir="ltr"
            className="w-full h-80 px-4 py-3 font-mono text-sm bg-gray-50 border border-gray-300 rounded-xl resize-y focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400"
            placeholder={`{
  "name": "תוכנית 0-3 ק״מ",
  "targetDistance": "3k",
  "targetProfileTypes": [3],
  "canonicalWeeks": 8,
  "canonicalFrequency": 3,
  "weekTemplates": [
    { "weekNumber": 1, "workoutNames": ["הליכה-ריצה שבוע 1", "ריצה קלה 20 דקות", "הליכה-ריצה שבוע 1"] },
    { "weekNumber": 2, "workoutNames": ["הליכה-ריצה שבוע 2", "ריצה קלה 25 דקות", "הליכה-ריצה שבוע 2"] }
  ],
  "progressionRules": [
    { "type": "adjust_walk_run_ratio", "initialRunSeconds": 30, "initialWalkSeconds": 120, "runIncrementSeconds": 30, "walkDecrementSeconds": 15, "everyWeeks": 1, "maxContinuousRunSeconds": 1800, "minWalkSeconds": 15 }
  ]
}`}
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
                    <span className="font-mono text-red-800">{err.path}</span>
                    {': '}
                    {err.message}
                  </div>
                ))}
              </div>
            </div>
          )}

          {stage === 'input' && (
            <button
              onClick={handleValidateAndResolve}
              disabled={!jsonText.trim()}
              className="flex items-center gap-2 px-6 py-3 bg-cyan-500 text-white rounded-xl font-bold hover:bg-cyan-600 disabled:opacity-50"
            >
              <Search size={18} />
              אמת ומצא אימונים
            </button>
          )}
        </div>
      )}

      {/* Resolving spinner */}
      {stage === 'resolving' && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-cyan-500" size={40} />
          <p className="text-gray-600 font-bold">מחפש אימונים ב-Firestore...</p>
        </div>
      )}

      {/* Preview */}
      {stage === 'preview' && preview && (
        <>
          {/* Name resolution table */}
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
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
                            נמצא
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-bold">
                            לא נמצא!
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 font-mono text-xs text-gray-500" dir="ltr">
                        {res.firestoreId ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {preview.unresolvedCount > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
                <strong>{preview.unresolvedCount} אימונים לא נמצאו ב-Firestore.</strong>{' '}
                ייבא קודם את תבניות האימון דרך{' '}
                <Link href="/admin/running/import/workouts" className="underline font-bold">
                  ייבוא אימונים
                </Link>
                , ואז חזור לכאן. אימונים חסרים יושמטו מהשבועות.
              </div>
            )}
          </div>

          {/* Program summary */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-900">סיכום תוכנית</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
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
                <div className="text-gray-500">אימונים/שבוע</div>
                <div className="font-bold text-gray-900">{preview.program.canonicalFrequency}</div>
              </div>
            </div>

            {preview.program.phases && preview.program.phases.length > 0 && (
              <div>
                <div className="text-sm font-bold text-gray-600 mb-2">פאזות</div>
                <div className="flex gap-2">
                  {preview.program.phases.map((p, i) => (
                    <span key={i} className="px-3 py-1 rounded-full bg-cyan-100 text-cyan-700 text-xs font-bold">
                      {p.name} (שבועות {p.startWeek}–{p.endWeek})
                    </span>
                  ))}
                </div>
              </div>
            )}

            {preview.program.progressionRules && preview.program.progressionRules.length > 0 && (
              <div className="text-sm text-gray-600">
                {preview.program.progressionRules.length} חוקי התקדמות
              </div>
            )}

            {/* Week-by-week preview */}
            <div>
              <div className="text-sm font-bold text-gray-600 mb-2">שבועות</div>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {preview.resolvedWeekTemplates.map((wt) => {
                  const originalNames = preview.program.weekTemplates.find(
                    (w) => w.weekNumber === wt.weekNumber,
                  )?.workoutNames ?? [];
                  return (
                    <div key={wt.weekNumber} className="flex items-center gap-3 text-sm">
                      <span className="w-16 font-bold text-gray-700">שבוע {wt.weekNumber}</span>
                      <div className="flex-1 flex flex-wrap gap-1">
                        {originalNames.map((name, ni) => {
                          const resolved = preview.nameResolutions.find(
                            (r) => r.name.toLowerCase() === name.trim().toLowerCase(),
                          );
                          return (
                            <span
                              key={ni}
                              className={`px-2 py-0.5 rounded text-xs font-bold ${
                                resolved?.found
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-red-100 text-red-600 line-through'
                              }`}
                            >
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

            {/* Action */}
            <div className="flex items-center gap-2 pt-1">
              <span className="text-sm text-gray-600">פעולה:</span>
              {preview.action === 'create' ? (
                <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-sm font-bold">
                  יצירת תוכנית חדשה
                </span>
              ) : (
                <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-sm font-bold">
                  עדכון תוכנית קיימת ({preview.existingId})
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleImport}
                className="flex items-center gap-2 px-6 py-3 bg-emerald-500 text-white rounded-xl font-bold hover:bg-emerald-600"
              >
                <CheckCircle size={18} />
                אשר ייבוא
              </button>
              <button
                onClick={() => setStage('input')}
                className="px-4 py-3 text-gray-600 hover:text-gray-900 font-bold"
              >
                חזור לעריכה
              </button>
            </div>
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
            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-6 py-3 bg-cyan-500 text-white rounded-xl font-bold hover:bg-cyan-600"
            >
              ייבוא נוסף
            </button>
            <Link
              href="/admin/running/programs"
              className="px-4 py-3 text-gray-600 hover:text-gray-900 font-bold"
            >
              עבור לתוכניות
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
