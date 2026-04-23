'use client';

/**
 * BulkTranslationDialog — Phase 5.5 i18n
 *
 * Single-screen modal that drives the entire library translation flow:
 *   1. Export all exercises (or only untranslated) to one JSON file.
 *   2. Send to Gemini / Claude (the user does this manually).
 *   3. Import the translated file back; we batch-write only the EN slots.
 *
 * Mounted from the /admin/exercises page header.
 */

import { useRef, useState } from 'react';
import { X, Download, Upload, Languages, FileText, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import type { Exercise, ExerciseLang, LocalizedText } from '../../core/exercise.types';
import {
  exportAllExercisesToTranslationJSON,
  downloadBulkTranslationFile,
  validateBulkTranslationFile,
  applyBulkTranslations,
  type BulkApplyResult,
  type BulkTranslationFile,
} from '../../services/exercise-translation.utils';

interface BulkTranslationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  exercises: Exercise[];
  /** Called after a successful import so the parent can re-fetch. */
  onImportSuccess?: () => void;
}

export default function BulkTranslationDialog({
  isOpen,
  onClose,
  exercises,
  onImportSuccess,
}: BulkTranslationDialogProps) {
  const [skipAlreadyTranslated, setSkipAlreadyTranslated] = useState(true);
  const [targetLang, setTargetLang] = useState<ExerciseLang>('en');

  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<BulkApplyResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [parsedFile, setParsedFile] = useState<BulkTranslationFile | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Pre-compute counts for the export panel
  const totalCount = exercises.length;
  const untranslatedCount = exercises.filter((ex) => {
    const en = (ex.name as LocalizedText | undefined)?.en;
    return !en || !en.trim();
  }).length;
  const exportCount = skipAlreadyTranslated ? untranslatedCount : totalCount;

  const handleExport = () => {
    const file = exportAllExercisesToTranslationJSON(exercises, {
      sourceLang: 'he',
      targetLang,
      skipAlreadyTranslated,
    });
    downloadBulkTranslationFile(file);
  };

  const handleFilePick = () => fileInputRef.current?.click();

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setImportError(null);
    setImportResult(null);
    setParsedFile(null);

    try {
      const text = await file.text();
      const raw = JSON.parse(text);
      const validated = validateBulkTranslationFile(raw);
      setParsedFile(validated);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleApply = async () => {
    if (!parsedFile) return;
    setImporting(true);
    setImportError(null);
    try {
      const result = await applyBulkTranslations(exercises, parsedFile, targetLang);
      setImportResult(result);
      if (result.updated > 0) onImportSuccess?.();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  };

  const handleResetImport = () => {
    setParsedFile(null);
    setImportResult(null);
    setImportError(null);
  };

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
              <Languages className="text-white" size={20} />
            </div>
            <div>
              <h2 className="text-lg font-black text-gray-900">תרגום בכמות (Bulk Translation)</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                ייצוא, תרגום עם AI, ייבוא חזרה — בלי לפגוע בעברית המקורית
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100"
          >
            <X size={20} />
          </button>
        </header>

        <div className="p-6 space-y-6">
          {/* Target language selector — applies to both export & import */}
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <label className="text-xs font-bold text-gray-600 mb-1.5 block">שפת יעד</label>
            <div className="flex gap-2">
              {(['en'] as ExerciseLang[]).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setTargetLang(l)}
                  className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all ${
                    targetLang === l
                      ? 'bg-cyan-500 text-white shadow-sm'
                      : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-100'
                  }`}
                >
                  {l === 'en' ? '🇺🇸 English' : l.toUpperCase()}
                </button>
              ))}
              <span className="text-[11px] text-gray-400 self-center">
                (כעת תומך ב-EN בלבד)
              </span>
            </div>
          </div>

          {/* ── Step 1: Export ───────────────────────────────────────────── */}
          <section className="rounded-2xl border-2 border-blue-100 bg-blue-50/30 p-5">
            <div className="flex items-start gap-3 mb-3">
              <div className="shrink-0 w-8 h-8 rounded-full bg-blue-500 text-white font-bold flex items-center justify-center">1</div>
              <div className="flex-1">
                <h3 className="text-sm font-black text-gray-900">ייצוא קובץ לתרגום</h3>
                <p className="text-xs text-gray-600 mt-0.5">
                  מוריד JSON אחד עם כל הטקסטים מכל התרגילים. שלח אותו ל-Gemini או Claude.
                </p>
              </div>
            </div>

            <label className="flex items-center gap-2 mb-4 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={skipAlreadyTranslated}
                onChange={(e) => setSkipAlreadyTranslated(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-cyan-500 focus:ring-cyan-400"
              />
              <span className="text-gray-700">דלג על תרגילים שכבר תורגמו (יש להם ערך ב-name.en)</span>
            </label>

            <div className="flex items-center justify-between gap-4 bg-white rounded-xl border border-blue-200 p-3 mb-4">
              <div className="flex items-center gap-2 text-sm">
                <FileText size={16} className="text-blue-500" />
                <span className="font-bold text-gray-700">{exportCount}</span>
                <span className="text-gray-500">
                  תרגילים יכללו בקובץ
                  {skipAlreadyTranslated && ` (מתוך ${totalCount} סה"כ)`}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleExport}
              disabled={exportCount === 0}
              className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-blue-500 text-white rounded-xl font-bold hover:bg-blue-600 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              <Download size={18} />
              הורד קובץ JSON ({exportCount} תרגילים)
            </button>

            <details className="mt-3 text-xs">
              <summary className="cursor-pointer text-gray-500 hover:text-gray-700 font-bold">
                איך משתמשים בקובץ הזה?
              </summary>
              <ol className="mt-2 ms-4 space-y-1 text-gray-600 list-decimal list-inside">
                <li>הורד את הקובץ.</li>
                <li>פתח שיחה ב-Gemini / Claude עם ההנחיה: <em>&quot;Translate every empty &apos;en&apos; value to English. Do not change the structure or any &apos;he&apos; values.&quot;</em></li>
                <li>הדבק את הקובץ; קבל בחזרה JSON זהה במבנה אך עם ערכי EN מלאים.</li>
                <li>שמור את התוצאה לקובץ והעלה אותה בשלב 2 כאן.</li>
              </ol>
            </details>
          </section>

          {/* ── Step 2: Import ───────────────────────────────────────────── */}
          <section className="rounded-2xl border-2 border-green-100 bg-green-50/30 p-5">
            <div className="flex items-start gap-3 mb-3">
              <div className="shrink-0 w-8 h-8 rounded-full bg-green-500 text-white font-bold flex items-center justify-center">2</div>
              <div className="flex-1">
                <h3 className="text-sm font-black text-gray-900">ייבוא קובץ מתורגם</h3>
                <p className="text-xs text-gray-600 mt-0.5">
                  מעלה את הקובץ ש-AI החזיר. נכתבים אך ורק ערכי <code className="px-1 bg-white rounded">en</code>; העברית המקורית לא נוגעת.
                </p>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleFileSelected}
              className="hidden"
            />

            {!parsedFile && !importError && (
              <button
                type="button"
                onClick={handleFilePick}
                className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-white text-green-700 rounded-xl font-bold border-2 border-dashed border-green-300 hover:bg-green-50 transition-colors"
              >
                <Upload size={18} />
                בחר קובץ JSON מתורגם
              </button>
            )}

            {/* Validation success → preview before applying */}
            {parsedFile && !importResult && !importError && (
              <div className="space-y-3">
                <div className="bg-white rounded-xl border border-green-200 p-3 space-y-1.5 text-sm">
                  <div className="flex items-center gap-2 text-green-700 font-bold">
                    <CheckCircle2 size={16} />
                    הקובץ תקין
                  </div>
                  <div className="text-xs text-gray-600 space-y-0.5 ms-6">
                    <div>שפת מקור: <span className="font-bold">{parsedFile.sourceLang.toUpperCase()}</span></div>
                    <div>שפת יעד: <span className="font-bold">{parsedFile.targetLang.toUpperCase()}</span></div>
                    <div>מספר תרגילים: <span className="font-bold">{parsedFile.exerciseCount}</span></div>
                    <div>מועד ייצוא: <span className="font-mono text-[11px]">{parsedFile.exportedAt}</span></div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleResetImport}
                    disabled={importing}
                    className="px-4 py-2.5 bg-white text-gray-600 rounded-xl font-bold border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                  >
                    בחר קובץ אחר
                  </button>
                  <button
                    type="button"
                    onClick={handleApply}
                    disabled={importing}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 bg-green-500 text-white rounded-xl font-bold hover:bg-green-600 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed shadow-sm"
                  >
                    {importing ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        מעדכן…
                      </>
                    ) : (
                      <>
                        <Upload size={16} />
                        החל על {parsedFile.exerciseCount} תרגילים
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Validation error */}
            {importError && (
              <div className="bg-white rounded-xl border-2 border-red-200 p-3 text-sm">
                <div className="flex items-start gap-2 text-red-700">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">לא ניתן לייבא את הקובץ</div>
                    <div className="text-xs text-red-600 mt-1">{importError}</div>
                    <button
                      type="button"
                      onClick={handleResetImport}
                      className="mt-2 text-xs underline text-red-700 hover:text-red-900"
                    >
                      נסה שוב
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Apply result */}
            {importResult && (
              <div className="space-y-3">
                <div className="bg-white rounded-xl border border-green-300 p-3 text-sm">
                  <div className="flex items-center gap-2 text-green-700 font-bold mb-2">
                    <CheckCircle2 size={16} />
                    סיים בהצלחה
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-green-50 p-2">
                      <div className="text-2xl font-black text-green-700">{importResult.updated}</div>
                      <div className="text-[10px] text-green-600 font-bold">עודכנו</div>
                    </div>
                    <div className="rounded-lg bg-amber-50 p-2">
                      <div className="text-2xl font-black text-amber-700">{importResult.skipped.length}</div>
                      <div className="text-[10px] text-amber-600 font-bold">דולגו</div>
                    </div>
                    <div className="rounded-lg bg-red-50 p-2">
                      <div className="text-2xl font-black text-red-700">{importResult.errors.length}</div>
                      <div className="text-[10px] text-red-600 font-bold">שגיאות</div>
                    </div>
                  </div>
                </div>

                {importResult.skipped.length > 0 && (
                  <details className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs">
                    <summary className="cursor-pointer font-bold text-amber-700">
                      פירוט דילוגים ({importResult.skipped.length})
                    </summary>
                    <ul className="mt-2 ms-4 space-y-1 max-h-40 overflow-y-auto">
                      {importResult.skipped.map((s, i) => (
                        <li key={i} className="text-amber-700">
                          <span className="font-mono">{s.exerciseId.slice(0, 8)}…</span> — {s.reason}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}

                {importResult.errors.length > 0 && (
                  <details className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs">
                    <summary className="cursor-pointer font-bold text-red-700">
                      פירוט שגיאות ({importResult.errors.length})
                    </summary>
                    <ul className="mt-2 ms-4 space-y-1 max-h-40 overflow-y-auto">
                      {importResult.errors.map((s, i) => (
                        <li key={i} className="text-red-700">
                          <span className="font-mono">{s.exerciseId.slice(0, 8)}…</span> — {s.message}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}

                <button
                  type="button"
                  onClick={handleResetImport}
                  className="w-full px-4 py-2 bg-white text-gray-600 rounded-xl font-bold border border-gray-300 hover:bg-gray-50"
                >
                  ייבא קובץ נוסף
                </button>
              </div>
            )}
          </section>

          {/* Safety footer */}
          <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-3 text-xs text-cyan-800 leading-relaxed">
            <strong>בטיחות:</strong> פעולת הייבוא כותבת אך ורק את שדות{' '}
            <code className="px-1 bg-white rounded">.{targetLang}</code> (שפת היעד) של כל
            טקסט מולטי-לשוני. שדות העברית המקוריים נשארים בדיוק כפי שהם, גם אם הקובץ
            המתורגם החזיר ערך אחר. הקריאות נעשות מול המסמך החי בעת הכתיבה.
          </div>
        </div>
      </div>
    </div>
  );
}
