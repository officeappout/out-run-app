'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Play,
  Users,
} from 'lucide-react';
import {
  getRunWorkoutTemplates,
  updateRunWorkoutTemplate,
} from '@/features/workout-engine/core/services/running-admin.service';
import type { RunWorkoutTemplate } from '@/features/workout-engine/core/types/running.types';

const BEGINNER_TAG = 'beginner_only';
const ADVANCED_PROFILES = [1, 2] as const;

type Stage = 'idle' | 'scanning' | 'preview' | 'updating' | 'done';

interface TemplatePreview {
  template: RunWorkoutTemplate;
  currentProfiles: number[];
  hasBegTag: boolean;
  action: 'set_advanced' | 'skip_beginner' | 'already_correct';
}

export default function FixProfilesPage() {
  const [stage, setStage] = useState<Stage>('idle');
  const [previews, setPreviews] = useState<TemplatePreview[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [result, setResult] = useState({ updated: 0, skipped: 0, errors: 0 });

  const addLog = (msg: string) => setLogs((prev) => [...prev, msg]);

  const handleScan = async () => {
    setStage('scanning');
    setLogs([]);
    setPreviews([]);

    addLog('טוען תבניות אימון מ-Firestore...');
    const allTemplates = await getRunWorkoutTemplates();
    addLog(`נמצאו ${allTemplates.length} תבניות`);

    const items: TemplatePreview[] = [];
    let advancedCount = 0;
    let beginnerCount = 0;
    let alreadyCorrect = 0;

    for (const t of allTemplates) {
      const hasBegTag = Array.isArray(t.tags) && t.tags.includes(BEGINNER_TAG);
      const currentProfiles = t.targetProfileTypes ?? [];
      const isAlreadyAdvanced =
        currentProfiles.length === 2 &&
        currentProfiles.includes(1) &&
        currentProfiles.includes(2);

      if (hasBegTag) {
        beginnerCount++;
        items.push({
          template: t,
          currentProfiles,
          hasBegTag: true,
          action: 'skip_beginner',
        });
      } else if (isAlreadyAdvanced) {
        alreadyCorrect++;
        items.push({
          template: t,
          currentProfiles,
          hasBegTag: false,
          action: 'already_correct',
        });
      } else {
        advancedCount++;
        items.push({
          template: t,
          currentProfiles,
          hasBegTag: false,
          action: 'set_advanced',
        });
      }
    }

    items.sort((a, b) => {
      const order = { set_advanced: 0, skip_beginner: 1, already_correct: 2 };
      return order[a.action] - order[b.action];
    });

    setPreviews(items);
    addLog(`✓ ${advancedCount} תבניות יעודכנו ל-[1, 2]`);
    addLog(`⚠ ${beginnerCount} תבניות עם תג beginner_only — ידולגו`);
    addLog(`✓ ${alreadyCorrect} תבניות כבר מוגדרות [1, 2]`);
    setStage('preview');
  };

  const handleUpdate = async () => {
    setStage('updating');
    const toUpdate = previews.filter((p) => p.action === 'set_advanced');
    let updated = 0;
    let errors = 0;

    addLog(`\nמעדכן ${toUpdate.length} תבניות ל-targetProfileTypes: [1, 2]...`);

    for (const item of toUpdate) {
      try {
        const ok = await updateRunWorkoutTemplate(item.template.id, {
          targetProfileTypes: [1, 2],
        } as Partial<RunWorkoutTemplate>);
        if (ok) {
          updated++;
          addLog(`✓ "${item.template.name}" → [1, 2]`);
        } else {
          errors++;
          addLog(`✗ שגיאה בעדכון "${item.template.name}"`);
        }
      } catch (err) {
        errors++;
        addLog(`✗ ${(err as Error).message}`);
      }
    }

    const skipped = previews.filter((p) => p.action !== 'set_advanced').length;
    setResult({ updated, skipped, errors });
    addLog(`\n✓ הושלם: ${updated} עודכנו, ${skipped} דולגו, ${errors} שגיאות`);
    setStage('done');
  };

  const toUpdateCount = previews.filter((p) => p.action === 'set_advanced').length;
  const beginnerCount = previews.filter((p) => p.action === 'skip_beginner').length;
  const correctCount = previews.filter((p) => p.action === 'already_correct').length;

  return (
    <div className="max-w-4xl space-y-6" dir="rtl">
      <div>
        <Link href="/admin/running/workouts" className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-2">
          <ArrowRight size={18} /> חזור לתבניות
        </Link>
        <h1 className="text-3xl font-black text-gray-900">תיקון פרופילים — שחרור אימונים למתקדמים</h1>
        <p className="text-gray-500 mt-1">
          מעדכן את <code className="bg-gray-100 px-1 rounded">targetProfileTypes</code> ל-<strong>[1, 2]</strong>{' '}
          עבור כל תבנית שאין לה תג <code className="bg-red-100 text-red-700 px-1 rounded">beginner_only</code>.
        </p>
      </div>

      {/* Scan button */}
      {stage === 'idle' && (
        <button
          onClick={handleScan}
          className="flex items-center gap-2 px-6 py-3 bg-cyan-500 text-white rounded-xl font-bold hover:bg-cyan-600"
        >
          <Users size={18} /> סרוק תבניות
        </button>
      )}

      {stage === 'scanning' && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-cyan-500" size={40} />
          <p className="text-gray-600 font-bold">סורק תבניות...</p>
        </div>
      )}

      {/* Preview */}
      {stage === 'preview' && previews.length > 0 && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
              <div className="text-3xl font-black text-emerald-600">{toUpdateCount}</div>
              <div className="text-sm text-emerald-700 font-bold">יעודכנו ל-[1, 2]</div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
              <div className="text-3xl font-black text-amber-600">{beginnerCount}</div>
              <div className="text-sm text-amber-700 font-bold">beginner_only — ידולגו</div>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center">
              <div className="text-3xl font-black text-gray-500">{correctCount}</div>
              <div className="text-sm text-gray-600 font-bold">כבר [1, 2]</div>
            </div>
          </div>

          {/* Preview table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-right text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 font-bold text-gray-700">שם</th>
                    <th className="px-4 py-3 font-bold text-gray-700">קטגוריה</th>
                    <th className="px-4 py-3 font-bold text-gray-700">פרופילים נוכחי</th>
                    <th className="px-4 py-3 font-bold text-gray-700">תגיות</th>
                    <th className="px-4 py-3 font-bold text-gray-700">פעולה</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {previews.map((p) => (
                    <tr
                      key={p.template.id}
                      className={
                        p.action === 'set_advanced'
                          ? 'bg-emerald-50/50'
                          : p.action === 'skip_beginner'
                            ? 'bg-amber-50/50'
                            : ''
                      }
                    >
                      <td className="px-4 py-2 font-bold text-gray-800">{p.template.name}</td>
                      <td className="px-4 py-2">
                        <span className="px-2 py-0.5 rounded-full bg-cyan-50 text-cyan-700 text-xs font-bold">
                          {p.template.category ?? '—'}
                        </span>
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-gray-600">
                        [{p.currentProfiles.join(', ')}]
                      </td>
                      <td className="px-4 py-2">
                        {p.hasBegTag ? (
                          <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-xs font-bold">beginner_only</span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {p.action === 'set_advanced' && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">→ [1, 2]</span>
                        )}
                        {p.action === 'skip_beginner' && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">דילוג</span>
                        )}
                        {p.action === 'already_correct' && (
                          <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-xs font-bold">תקין</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleUpdate}
              disabled={toUpdateCount === 0}
              className="flex items-center gap-2 px-6 py-3 bg-emerald-500 text-white rounded-xl font-bold hover:bg-emerald-600 disabled:opacity-50"
            >
              <Play size={18} /> עדכן {toUpdateCount} תבניות
            </button>
            <button onClick={() => { setStage('idle'); setLogs([]); setPreviews([]); }} className="px-4 py-3 text-gray-600 hover:text-gray-900 font-bold">
              בטל
            </button>
          </div>
        </div>
      )}

      {/* Updating spinner */}
      {stage === 'updating' && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-emerald-500" size={40} />
          <p className="text-gray-600 font-bold">מעדכן פרופילים...</p>
        </div>
      )}

      {/* Done */}
      {stage === 'done' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-center gap-3">
            {result.errors === 0 ? (
              <CheckCircle size={28} className="text-emerald-500" />
            ) : (
              <AlertTriangle size={28} className="text-amber-500" />
            )}
            <h2 className="text-xl font-black text-gray-900">עדכון הושלם</h2>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-emerald-50 rounded-xl p-4 text-center">
              <div className="text-3xl font-black text-emerald-600">{result.updated}</div>
              <div className="text-sm text-emerald-700 font-bold">עודכנו</div>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 text-center">
              <div className="text-3xl font-black text-gray-500">{result.skipped}</div>
              <div className="text-sm text-gray-600 font-bold">דולגו</div>
            </div>
            <div className={`rounded-xl p-4 text-center ${result.errors > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
              <div className={`text-3xl font-black ${result.errors > 0 ? 'text-red-600' : 'text-gray-400'}`}>{result.errors}</div>
              <div className="text-sm text-gray-600 font-bold">שגיאות</div>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button onClick={() => { setStage('idle'); setLogs([]); setPreviews([]); setResult({ updated: 0, skipped: 0, errors: 0 }); }} className="flex items-center gap-2 px-6 py-3 bg-cyan-500 text-white rounded-xl font-bold hover:bg-cyan-600">
              סריקה חוזרת
            </button>
            <Link href="/admin/running/workouts" className="px-4 py-3 text-gray-600 hover:text-gray-900 font-bold">
              עבור לתבניות
            </Link>
          </div>
        </div>
      )}

      {/* Log */}
      {logs.length > 0 && (
        <div className="bg-gray-950 border border-gray-700 rounded-xl p-5 max-h-80 overflow-y-auto space-y-0.5">
          {logs.map((log, i) => (
            <div
              key={i}
              dir="ltr"
              className={`text-sm font-mono leading-relaxed ${
                log.startsWith('✗') ? 'text-red-400' :
                log.startsWith('✓') ? 'text-emerald-400' :
                log.startsWith('⚠') ? 'text-amber-400' :
                'text-gray-100'
              }`}
            >
              {log}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
