'use client';

import { useState } from 'react';
import { Loader2, FileSpreadsheet } from 'lucide-react';
import { parsePastedTextToGrid, parseSpreadsheetFileToGrid, type CellValue } from '@/features/readiness/core/services/readiness-results-import-parse';

/**
 * Step 1 — two input paths, one meeting point (04.10.2026,
 * 00-MASTER-PLAN.md §13.83): paste (tab-separated, matches an Excel
 * column copy) and file upload (.xlsx/.csv). Each has its OWN
 * conversion function into the same CellValue[][] grid shape
 * (parsePastedTextToGrid / parseSpreadsheetFileToGrid) — this component
 * owns only the raw input and which tab is active; every column/value
 * interpretation from the grid onward is the page's own shared
 * parseResultsGrid call, identical regardless of which tab produced it.
 *
 * The xlsx (SheetJS) library is dynamic-imported inside
 * parseSpreadsheetFileToGrid itself, the moment a file is actually
 * picked — never in the main bundle.
 */
interface BulkResultsInputStepProps {
  onGridChange: (grid: CellValue[][]) => void;
  rowCount: number;
  maxRows: number;
}

export default function BulkResultsInputStep({ onGridChange, rowCount, maxRows }: BulkResultsInputStepProps) {
  const [tab, setTab] = useState<'paste' | 'file'>('paste');
  const [pasteText, setPasteText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const overCap = rowCount > maxRows;

  const handlePasteChange = (text: string) => {
    setPasteText(text);
    onGridChange(parsePastedTextToGrid(text));
  };

  const handleFileSelect = async (file: File) => {
    setFileName(file.name);
    setFileError(null);
    setFileLoading(true);
    try {
      const grid = await parseSpreadsheetFileToGrid(file);
      onGridChange(grid);
    } catch (err: any) {
      setFileError(err?.message ?? 'שגיאה בקריאת הקובץ.');
      onGridChange([]);
    } finally {
      setFileLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col h-full">
      <h2 className="text-sm font-black text-gray-900 mb-1">1 · קלט</h2>

      <div className="flex items-center gap-1.5 mb-3">
        <button
          onClick={() => setTab('paste')}
          className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${tab === 'paste' ? 'bg-lime-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
        >
          הדבקה
        </button>
        <button
          onClick={() => setTab('file')}
          className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${tab === 'file' ? 'bg-lime-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
        >
          העלאת קובץ
        </button>
      </div>

      {tab === 'paste' ? (
        <>
          <p className="text-xs text-gray-500 mb-3">
            שם · מגדר · ריצת 3,000 · עליות מתח · מקבילים — טווח מודבק מאקסל (עמודות מופרדות בטאב). שורת כותרת מזוהה אוטומטית אם קיימת; אם לא — לפי הסדר הזה.
          </p>
          <textarea
            value={pasteText}
            onChange={(e) => handlePasteChange(e.target.value)}
            placeholder={'דוד כהן\tM\t17:42\t10\t8\nנועה לוי\tF\t18:30\t5\t4'}
            dir="ltr"
            className="flex-1 min-h-[260px] text-sm border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-cyan-200 resize-none font-mono"
          />
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-xl p-6 min-h-[260px]">
          {fileLoading ? (
            <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
          ) : (
            <>
              <FileSpreadsheet size={32} className="text-slate-300 mb-3" />
              <label className="text-sm font-bold text-lime-700 hover:text-lime-800 cursor-pointer">
                בחר קובץ (.xlsx / .csv)
                <input
                  type="file"
                  accept=".xlsx,.csv"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
                />
              </label>
              {fileName && !fileError && <p className="text-xs text-slate-400 mt-2">{fileName} · {rowCount} שורות</p>}
              {fileError && <p className="text-xs text-red-600 font-bold mt-2">{fileError}</p>}
            </>
          )}
        </div>
      )}

      <div className="flex items-center justify-between mt-2">
        <p className={`text-[11px] font-bold ${overCap ? 'text-red-600' : 'text-gray-400'}`}>
          {rowCount} שורות · עד {maxRows} בייבוא אחד
        </p>
      </div>
      {overCap && (
        <p className="text-[11px] text-red-600 font-bold mt-1">
          חריגה מהמגבלה — הסר {rowCount - maxRows} שורות, או פצל לשתי העברות נפרדות. הקובץ/ההדבקה לא נחתכים בשקט.
        </p>
      )}
    </div>
  );
}
