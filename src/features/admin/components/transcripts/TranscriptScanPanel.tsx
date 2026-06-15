'use client';

import { useState } from 'react';

interface ProcessedTranscript {
  fileId: string;
  fileName: string;
  insightId: string;
  summary: string;
  actionItems: string[];
  concepts: string[];
  entityType: string;
  authorityId: string | null;
  authorityName: string | null;
  transcriptUrl: string;
  movedToProcessed: boolean;
}

interface SkippedTranscript {
  fileId: string;
  fileName: string;
  reason: string;
}

interface ScanResult {
  processed: ProcessedTranscript[];
  skipped: SkippedTranscript[];
  log: string[];
}

export default function TranscriptScanPanel() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [showLog, setShowLog] = useState(false);

  async function runScan() {
    setLoading(true);
    setError(null);
    setResult(null);
    setOpen(true);
    try {
      const res = await fetch('/api/admin/transcripts/scan', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data as ScanResult);
    } catch (err: any) {
      setError(err?.message ?? 'שגיאה לא ידועה');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm mb-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="text-xl">🎙</span>
          <div>
            <h2 className="text-base font-semibold text-gray-900">עיבוד תמלולים</h2>
            <p className="text-xs text-gray-500">סורק תיקיית Drive נכנס → חילוץ סיכום + action items + שיוך רשות</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={runScan}
            disabled={loading}
            className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {loading ? 'מעבד...' : 'עבד תמלולים חדשים'}
          </button>
          {result && (
            <button
              onClick={() => setOpen(o => !o)}
              className="text-gray-400 hover:text-gray-600 text-lg px-1"
              title={open ? 'כווץ' : 'הרחב'}
            >
              {open ? '▲' : '▼'}
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-5 mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          ❌ {error}
        </div>
      )}

      {/* Results */}
      {result && open && (
        <div className="border-t border-gray-100 px-5 py-4 space-y-4">

          {/* Stats row */}
          <div className="flex items-center gap-4 text-sm text-gray-600">
            <span className="font-medium text-gray-900">
              ✅ עובדו: {result.processed.length}
            </span>
            {result.skipped.length > 0 && (
              <span className="text-amber-600">⏭ דולגו: {result.skipped.length}</span>
            )}
          </div>

          {/* Processed transcripts */}
          {result.processed.length === 0 && (
            <p className="text-sm text-gray-500 italic">לא נמצאו תמלולים חדשים בתיקייה.</p>
          )}

          {result.processed.map(t => (
            <div key={t.fileId} className="border border-gray-200 rounded-lg p-4 space-y-3">
              {/* File name + authority */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-gray-900">📄 {t.fileName}</p>
                  {t.authorityName ? (
                    <p className="text-xs text-violet-700 mt-0.5 font-medium">🏛 {t.authorityName}</p>
                  ) : (
                    <p className="text-xs text-gray-400 mt-0.5">לא שויך לרשות</p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {t.movedToProcessed && (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">הועבר למעובד</span>
                  )}
                  {t.transcriptUrl && (
                    <a
                      href={t.transcriptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Drive ↗
                    </a>
                  )}
                </div>
              </div>

              {/* Summary */}
              <p className="text-sm text-gray-700 leading-relaxed">{t.summary}</p>

              {/* Action items */}
              {t.actionItems.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1.5">Action Items</p>
                  <ul className="space-y-1">
                    {t.actionItems.map((item, i) => (
                      <li key={i} className="text-sm text-gray-700 flex gap-2">
                        <span className="text-gray-400 flex-shrink-0">{i + 1}.</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Concepts */}
              {t.concepts.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {t.concepts.map(c => (
                    <span key={c} className="text-xs bg-violet-50 text-violet-700 border border-violet-200 px-2 py-0.5 rounded-full">
                      {c}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Skipped */}
          {result.skipped.length > 0 && (
            <div className="text-xs text-gray-500 space-y-1 pt-1 border-t border-gray-100">
              <p className="font-medium text-gray-600">דולגו:</p>
              {result.skipped.map(s => (
                <p key={s.fileId}>• {s.fileName} — {s.reason}</p>
              ))}
            </div>
          )}

          {/* Log (collapsible) */}
          <div className="pt-1 border-t border-gray-100">
            <button
              onClick={() => setShowLog(v => !v)}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              {showLog ? '▲ הסתר לוג' : '▼ הצג לוג ריצה'}
            </button>
            {showLog && (
              <pre className="mt-2 text-xs text-gray-500 bg-gray-50 rounded p-3 whitespace-pre-wrap leading-relaxed">
                {result.log.join('\n')}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
