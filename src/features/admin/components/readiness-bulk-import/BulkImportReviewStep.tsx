'use client';

import { READINESS_COLORS } from '../readiness-dashboard/colors';
import type { ReadinessGender } from '@/features/readiness/core/services/readiness-write.service';

export interface BulkImportReviewRow {
  name: string;
  gender: ReadinessGender | null;
  isDuplicate: boolean;
  duplicateChoice: 'add' | 'skip';
  extraFields: string[];
}

/**
 * Step 2 (left, wide column) — review table before import. Nothing is
 * written from here; onSubmit (owned by the page) is the only path to
 * the server, and only once the officer clicks it explicitly.
 *
 * Gender is NEVER pre-selected — David, verbatim: "'נ' אברהם' יכולה
 * להיות נועה או נדב... ניחוש שגוי = כשירות שגויה." Every row starts
 * with gender: null until the officer picks one; a null-gender row
 * blocks the whole import (point: atomic, all-or-nothing).
 *
 * A duplicate (name already in this unit's roster) never blocks —
 * "לא נכנס בשקט, ולא נחסם בכוח": the officer explicitly chooses
 * skip/add-anyway per row. Two people can share a name.
 */
interface BulkImportReviewStepProps {
  rows: BulkImportReviewRow[];
  onGenderChange: (index: number, gender: ReadinessGender) => void;
  onDuplicateChoiceChange: (index: number, choice: 'add' | 'skip') => void;
  onCancel: () => void;
  onSubmit: () => void;
  submitting: boolean;
  submitError: string | null;
}

export default function BulkImportReviewStep({
  rows, onGenderChange, onDuplicateChoiceChange, onCancel, onSubmit, submitting, submitError,
}: BulkImportReviewStepProps) {
  const duplicateCount = rows.filter((r) => r.isDuplicate).length;
  const toImportCount = rows.filter((r) => !(r.isDuplicate && r.duplicateChoice === 'skip')).length;
  const missingGenderCount = rows.filter((r) => r.gender === null).length;
  const allSkipped = rows.length > 0 && toImportCount === 0;
  const blocked = missingGenderCount > 0 || allSkipped;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-black text-gray-900">2 · בדיקה לפני ייבוא</h2>
        {rows.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold px-2 py-1 rounded-full" style={{ backgroundColor: `${READINESS_COLORS.pass}1A`, color: READINESS_COLORS.pass }}>
              {toImportCount} ייובאו
            </span>
            {duplicateCount > 0 && (
              <span className="text-[11px] font-bold px-2 py-1 rounded-full" style={{ backgroundColor: `${READINESS_COLORS.fail}1A`, color: READINESS_COLORS.fail }}>
                {duplicateCount} כפילויות
              </span>
            )}
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm text-gray-400 text-center py-10">
          הדבק שמות מימין כדי להתחיל
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto overflow-x-auto -mx-1 px-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-slate-400 font-bold border-b border-slate-200 sticky top-0 bg-white">
                <th className="text-right py-2 px-2 w-10">#</th>
                <th className="text-right py-2 px-2">שם</th>
                <th className="text-right py-2 px-2">מגדר</th>
                <th className="text-right py-2 px-2">מצב</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const rowBg = row.gender === null ? 'bg-amber-50' : row.isDuplicate ? 'bg-slate-50' : '';
                return (
                  <tr key={i} className={`border-b border-slate-100 last:border-b-0 ${rowBg}`}>
                    <td className="py-2 px-2 text-[11px] text-slate-400">{i + 1}</td>
                    <td className="py-2 px-2 font-bold text-slate-800">{row.name}</td>
                    <td className="py-2 px-2">
                      <div className="inline-flex rounded-lg overflow-hidden border border-gray-200">
                        <button
                          onClick={() => onGenderChange(i, 'male')}
                          className={`text-xs font-bold px-2.5 py-1 transition-colors ${
                            row.gender === 'male' ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
                          }`}
                        >
                          זכר
                        </button>
                        <button
                          onClick={() => onGenderChange(i, 'female')}
                          className={`text-xs font-bold px-2.5 py-1 transition-colors border-r border-gray-200 ${
                            row.gender === 'female' ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
                          }`}
                        >
                          נקבה
                        </button>
                      </div>
                    </td>
                    <td className="py-2 px-2">
                      {row.gender === null ? (
                        <span className="text-[11px] font-bold text-amber-700">חסר מגדר</span>
                      ) : row.isDuplicate ? (
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-bold text-red-600">כבר קיים ברשימה</span>
                          <div className="inline-flex rounded-lg overflow-hidden border border-gray-200">
                            <button
                              onClick={() => onDuplicateChoiceChange(i, 'skip')}
                              className={`text-[10px] font-bold px-2 py-1 transition-colors ${
                                row.duplicateChoice === 'skip' ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
                              }`}
                            >
                              דלג
                            </button>
                            <button
                              onClick={() => onDuplicateChoiceChange(i, 'add')}
                              className={`text-[10px] font-bold px-2 py-1 transition-colors border-r border-gray-200 ${
                                row.duplicateChoice === 'add' ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
                              }`}
                            >
                              הוסף בכל זאת
                            </button>
                          </div>
                        </div>
                      ) : (
                        <span className="text-[11px] font-bold" style={{ color: READINESS_COLORS.pass }}>מוכן לייבוא</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 0 && (
        <div className="pt-4 mt-2 border-t border-gray-100">
          {submitError && (
            <p className="text-xs text-red-600 font-semibold mb-2">{submitError}</p>
          )}
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-gray-500 flex-1">
              {missingGenderCount > 0 ? (
                <>
                  <span className="font-bold text-amber-700">
                    {missingGenderCount === 1 ? 'שורה אחת חסרת מגדר' : `${missingGenderCount} שורות חסרות מגדר`}
                  </span>
                  {'. הייבוא הוא פעולה אחת — או שהכל נכנס או שכלום לא.'}
                </>
              ) : allSkipped ? (
                <span className="font-bold text-amber-700">כל השורות דולגו — אין מה לייבא.</span>
              ) : (
                'הייבוא הוא פעולה אחת — או שהכל נכנס או שכלום לא.'
              )}
            </p>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={onCancel}
                className="text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-4 py-2.5 rounded-xl transition-all"
              >
                ביטול
              </button>
              <button
                onClick={onSubmit}
                disabled={blocked || submitting}
                className="text-sm font-bold text-white bg-lime-700 hover:bg-lime-800 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed px-4 py-2.5 rounded-xl transition-all"
              >
                {submitting ? 'מייבא…' : `ייבוא ${toImportCount} חיילים`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
