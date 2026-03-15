'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Shield,
  Tag,
  Play,
} from 'lucide-react';
import {
  getRunWorkoutTemplates,
  getRunProgramTemplates,
  updateRunWorkoutTemplate,
} from '@/features/workout-engine/core/services/running-admin.service';
import type { RunWorkoutTemplate, RunProgramTemplate } from '@/features/workout-engine/core/types/running.types';

const BEGINNER_PROGRAM_NAMES = ['0-3 ק״מ', 'מ-3 ל-5 ק״מ', 'מ-5 ל-10 ק״מ'];
const BEGINNER_TAG = 'beginner_only';

type Stage = 'idle' | 'scanning' | 'preview' | 'tagging' | 'done';

interface ScanResult {
  program: RunProgramTemplate;
  workoutIds: string[];
}

interface TagPreview {
  template: RunWorkoutTemplate;
  alreadyTagged: boolean;
}

export default function TagBeginnersPage() {
  const [stage, setStage] = useState<Stage>('idle');
  const [scanResults, setScanResults] = useState<ScanResult[]>([]);
  const [previews, setPreviews] = useState<TagPreview[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [result, setResult] = useState<{ tagged: number; skipped: number; errors: number }>({ tagged: 0, skipped: 0, errors: 0 });

  const addLog = (msg: string) => setLogs((prev) => [...prev, msg]);

  const handleScan = async () => {
    setStage('scanning');
    setLogs([]);
    setScanResults([]);
    setPreviews([]);

    addLog('טוען תוכניות ותבניות אימון מ-Firestore...');
    const [allPrograms, allWorkouts] = await Promise.all([
      getRunProgramTemplates(),
      getRunWorkoutTemplates(),
    ]);

    addLog(`נמצאו ${allPrograms.length} תוכניות, ${allWorkouts.length} תבניות אימון`);

    const workoutMap = new Map<string, RunWorkoutTemplate>();
    for (const w of allWorkouts) workoutMap.set(w.id, w);

    const results: ScanResult[] = [];
    const uniqueWorkoutIds = new Set<string>();

    for (const targetName of BEGINNER_PROGRAM_NAMES) {
      const matching = allPrograms.filter(
        (p) => p.name.trim().includes(targetName),
      );

      if (matching.length === 0) {
        addLog(`⚠ תוכנית המכילה "${targetName}" לא נמצאה ב-Firestore`);
        continue;
      }

      for (const program of matching) {
        const ids: string[] = [];
        for (const wt of program.weekTemplates) {
          for (const id of wt.workoutIds) {
            ids.push(id);
            uniqueWorkoutIds.add(id);
          }
        }

        addLog(`✓ "${program.name}" — ${ids.length} הפניות לאימונים (${new Set(ids).size} ייחודיים)`);
        results.push({ program, workoutIds: [...new Set(ids)] });
      }
    }

    setScanResults(results);

    const tagPreviews: TagPreview[] = [];
    for (const id of uniqueWorkoutIds) {
      const tpl = workoutMap.get(id);
      if (!tpl) {
        addLog(`⚠ תבנית "${id}" לא נמצאה`);
        continue;
      }
      const alreadyTagged = Array.isArray(tpl.tags) && tpl.tags.includes(BEGINNER_TAG);
      tagPreviews.push({ template: tpl, alreadyTagged });
    }

    tagPreviews.sort((a, b) => {
      if (a.alreadyTagged !== b.alreadyTagged) return a.alreadyTagged ? 1 : -1;
      return a.template.name.localeCompare(b.template.name);
    });

    setPreviews(tagPreviews);
    addLog(`\nסה"כ ${tagPreviews.length} תבניות ייחודיות. ${tagPreviews.filter((p) => p.alreadyTagged).length} כבר מתויגות.`);
    setStage('preview');
  };

  const handleTag = async () => {
    setStage('tagging');
    const toTag = previews.filter((p) => !p.alreadyTagged);
    let tagged = 0;
    let errors = 0;

    for (const item of toTag) {
      const existingTags = Array.isArray(item.template.tags) ? item.template.tags : [];
      const newTags = [...existingTags, BEGINNER_TAG];

      try {
        const ok = await updateRunWorkoutTemplate(item.template.id, { tags: newTags } as Partial<RunWorkoutTemplate>);
        if (ok) {
          tagged++;
          addLog(`✓ תויג: "${item.template.name}"`);
        } else {
          errors++;
          addLog(`✗ שגיאה בתיוג: "${item.template.name}"`);
        }
      } catch {
        errors++;
        addLog(`✗ שגיאה בתיוג: "${item.template.name}"`);
      }
    }

    const skipped = previews.filter((p) => p.alreadyTagged).length;
    setResult({ tagged, skipped, errors });
    addLog(`\nהושלם: ${tagged} תויגו, ${skipped} דולגו (כבר מתויגים), ${errors} שגיאות`);
    setStage('done');
  };

  return (
    <div className="max-w-4xl space-y-6" dir="rtl">
      <div>
        <Link href="/admin/running/programs" className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-2">
          <ArrowRight size={18} /> חזרה
        </Link>
        <h1 className="text-3xl font-black text-gray-900">Beginner Firewall — תיוג אימונים</h1>
        <p className="text-gray-500 mt-1">
          סורק את תוכניות המתחילים (<strong>{BEGINNER_PROGRAM_NAMES.join(', ')}</strong>) ומוסיף תג
          <code className="mx-1 px-1.5 py-0.5 bg-red-100 text-red-700 rounded text-xs font-bold">{BEGINNER_TAG}</code>
          לכל תבנית אימון המשויכת אליהן. תבניות עם תג זה ייחסמו אוטומטית עבור תוכניות מתקדמות (Profile 1-2).
        </p>
      </div>

      {/* Action buttons */}
      {stage === 'idle' && (
        <button
          onClick={handleScan}
          className="flex items-center gap-2 px-6 py-3 bg-cyan-500 text-white rounded-xl font-bold hover:bg-cyan-600"
        >
          <Shield size={18} /> סרוק תוכניות מתחילים
        </button>
      )}

      {stage === 'scanning' && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-cyan-500" size={40} />
          <p className="text-gray-600 font-bold">סורק תוכניות ואימונים...</p>
        </div>
      )}

      {/* Preview */}
      {stage === 'preview' && previews.length > 0 && (
        <div className="space-y-4">
          {/* Programs found */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
            <h2 className="text-lg font-bold text-gray-900">תוכניות שנסרקו</h2>
            <div className="space-y-2">
              {scanResults.map((sr) => (
                <div key={sr.program.id} className="flex items-center gap-3 text-sm">
                  <CheckCircle size={16} className="text-emerald-500 flex-shrink-0" />
                  <span className="font-bold">{sr.program.name}</span>
                  <span className="text-gray-400">({sr.workoutIds.length} אימונים ייחודיים)</span>
                </div>
              ))}
            </div>
          </div>

          {/* Templates to tag */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">תבניות אימון לתיוג</h2>
              <div className="flex gap-2 text-sm">
                <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-700 font-bold">
                  {previews.filter((p) => !p.alreadyTagged).length} חדשים
                </span>
                <span className="px-3 py-1 rounded-full bg-gray-100 text-gray-500 font-bold">
                  {previews.filter((p) => p.alreadyTagged).length} כבר מתויגים
                </span>
              </div>
            </div>

            <div className="max-h-72 overflow-y-auto space-y-1">
              {previews.map((p) => (
                <div key={p.template.id} className={`flex items-center gap-3 text-sm px-3 py-2 rounded ${p.alreadyTagged ? 'bg-gray-50 opacity-50' : 'bg-amber-50'}`}>
                  <Tag size={14} className={p.alreadyTagged ? 'text-gray-400' : 'text-amber-500'} />
                  <span className="font-bold flex-1">{p.template.name}</span>
                  <span className="text-xs text-gray-400">{p.template.category ?? '—'}</span>
                  {p.alreadyTagged ? (
                    <span className="text-xs text-gray-400">כבר מתויג</span>
                  ) : (
                    <span className="text-xs text-amber-600 font-bold">יתויג</span>
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={handleTag}
              className="flex items-center gap-2 px-6 py-3 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 mt-4"
            >
              <Play size={18} /> הפעל תיוג ({previews.filter((p) => !p.alreadyTagged).length} תבניות)
            </button>
          </div>
        </div>
      )}

      {stage === 'preview' && previews.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-amber-700">
          <AlertTriangle size={20} className="inline ml-2" />
          לא נמצאו תבניות אימון בתוכניות המתחילים. ודא שלפחות אחת מהתוכניות קיימת ב-Firestore.
        </div>
      )}

      {/* Tagging */}
      {stage === 'tagging' && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-red-500" size={40} />
          <p className="text-gray-600 font-bold">מתייג תבניות...</p>
        </div>
      )}

      {/* Done */}
      {stage === 'done' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <CheckCircle size={28} className="text-emerald-500" />
            <h2 className="text-xl font-black text-gray-900">תיוג הושלם</h2>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-emerald-50 rounded-xl p-4 text-center">
              <div className="text-3xl font-black text-emerald-600">{result.tagged}</div>
              <div className="text-sm text-emerald-700 font-bold">תויגו</div>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 text-center">
              <div className="text-3xl font-black text-gray-400">{result.skipped}</div>
              <div className="text-sm text-gray-500 font-bold">דולגו</div>
            </div>
            <div className={`rounded-xl p-4 text-center ${result.errors > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
              <div className={`text-3xl font-black ${result.errors > 0 ? 'text-red-600' : 'text-gray-400'}`}>{result.errors}</div>
              <div className="text-sm text-gray-600 font-bold">שגיאות</div>
            </div>
          </div>
          <button
            onClick={() => { setStage('idle'); setLogs([]); setPreviews([]); setScanResults([]); }}
            className="flex items-center gap-2 px-6 py-3 bg-cyan-500 text-white rounded-xl font-bold hover:bg-cyan-600"
          >
            סרוק שוב
          </button>
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
