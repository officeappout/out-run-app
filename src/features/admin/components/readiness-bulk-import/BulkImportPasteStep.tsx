'use client';

import { useState } from 'react';

/**
 * ⚠️ SUPERSEDED 04.10.2026 (00-MASTER-PLAN.md §13.83) — replaced by
 * BulkResultsInputStep.tsx, used by the same route
 * (/admin/authority/readiness/import), since that route's page.tsx now
 * calls the results-import flow instead of this one. No remaining
 * caller as of this date. Deliberately NOT deleted yet (David: this is
 * the rollback if something breaks in production) — kept for one week
 * of real usage before a separate deletion round. Do not add new
 * behavior here; edit BulkResultsInputStep.tsx instead.
 */

/**
 * Step 1 (right, narrow column) — paste step. David, 03.10.2026: "לקצין
 * יש הודעת וואטסאפ או עמודה מאקסל, לא CSV נקי" — a plain textarea, not
 * a file upload. Cleanup/parsing itself lives in the pure
 * readiness-import-parse.ts module; this component only owns the raw
 * text and reports the discarded-extra-fields count so the officer can
 * see it (never silent — "שום נתון לא נעלם בשקט").
 */
interface BulkImportPasteStepProps {
  text: string;
  onTextChange: (text: string) => void;
  rowCount: number;
  maxRows: number;
  rowsWithExtraFields: number;
  onShowExtraFields: () => void;
  onContinue: () => void;
}

export default function BulkImportPasteStep({
  text, onTextChange, rowCount, maxRows, rowsWithExtraFields, onShowExtraFields, onContinue,
}: BulkImportPasteStepProps) {
  const overCap = rowCount > maxRows;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col h-full">
      <h2 className="text-sm font-black text-gray-900 mb-1">1 · הדבקת שמות</h2>
      <p className="text-xs text-gray-500 mb-3">
        שם בכל שורה. אפשר להדביק ישירות מוואטסאפ או מאקסל — מספור, שורות ריקות ורווחים מיותרים ינוקו אוטומטית.
      </p>

      <textarea
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        placeholder={'1. דוד כהן\n2. נועה לוי\n...'}
        dir="rtl"
        className="flex-1 min-h-[280px] text-sm border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-cyan-200 resize-none font-mono"
      />

      <div className="flex items-center justify-between mt-2 mb-3">
        <p className={`text-[11px] font-bold ${overCap ? 'text-red-600' : 'text-gray-400'}`}>
          {rowCount} שורות · עד {maxRows} בייבוא אחד
        </p>
        {rowsWithExtraFields > 0 && (
          <button
            onClick={onShowExtraFields}
            className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 hover:bg-amber-100 transition-colors"
          >
            הושמטו שדות נוספים מ-{rowsWithExtraFields} שורות · הצג
          </button>
        )}
      </div>

      {overCap && (
        <p className="text-[11px] text-red-600 font-bold mb-2">
          חריגה מהמגבלה — הסר {rowCount - maxRows} שורות, או פצל לשתי העברות נפרדות.
        </p>
      )}

      <button
        onClick={onContinue}
        disabled={rowCount === 0 || overCap}
        className="w-full bg-lime-700 hover:bg-lime-800 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white text-sm font-bold py-2.5 rounded-xl transition-all"
      >
        המשך לבדיקה
      </button>
    </div>
  );
}
