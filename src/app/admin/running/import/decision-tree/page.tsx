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
  TreeDeciduous,
} from 'lucide-react';
import {
  collection,
  doc,
  setDoc,
  getDocs,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { RunBlockTemplate, RunZoneType, WorkoutCategory } from '@/features/workout-engine/core/types/running.types';
import { RUNNING_QUESTIONS, RUNNING_ANSWERS } from '@/features/user/onboarding/data/running-improvement-branch.draft';

const WORKOUT_TEMPLATES_COLLECTION = 'runWorkoutTemplates';
const ONBOARDING_QUESTIONS_COLLECTION = 'onboarding_questions';
const ONBOARDING_ANSWERS_COLLECTION = 'onboarding_answers';

// ── Taper Templates (user-provided JSONs) ─────────────────────────────

const TAPER_TEMPLATES: Array<{
  id: string;
  name: string;
  category: WorkoutCategory;
  intensityRank: number;
  targetProfileTypes: number[];
  tags: string[];
  description: string;
  isQualityWorkout: boolean;
  priority: number;
  blocks: RunBlockTemplate[];
}> = [
  {
    id: 'taper_openers_4x200',
    name: 'Openers 4×200 — חידוד קצב',
    category: 'short_intervals',
    intensityRank: 1.0,
    targetProfileTypes: [1, 2, 3],
    tags: ['taper_specific', '3k_specific', '2k_specific', 'sharpening'],
    description: 'אימון \'פתיחת רגליים\' קצרצר לשמירה על חדות וזרימת דם לפני מרוץ.',
    isQualityWorkout: true,
    priority: 1,
    blocks: [
      {
        id: 'TO-warmup',
        type: 'warmup' as RunBlockTemplate['type'],
        zoneType: 'easy' as RunZoneType,
        isQualityExercise: false,
        measureBy: 'time',
        baseValue: 900,
        sets: 1,
        label: 'חימום קל מאוד',
        colorHex: '#90EE90',
        blockMode: 'pace',
      },
      {
        id: 'TO-sprint',
        type: 'interval' as RunBlockTemplate['type'],
        zoneType: 'sprint' as RunZoneType,
        isQualityExercise: true,
        measureBy: 'distance',
        baseValue: 200,
        sets: 4,
        label: 'קצב מרוץ (חד וקליל)',
        colorHex: '#FF4500',
        blockMode: 'pace',
        restBetweenSetsSeconds: 150,
        restType: 'walk',
      },
      {
        id: 'TO-cooldown',
        type: 'cooldown' as RunBlockTemplate['type'],
        zoneType: 'easy' as RunZoneType,
        isQualityExercise: false,
        measureBy: 'time',
        baseValue: 600,
        sets: 1,
        label: 'שחרור קל',
        colorHex: '#90EE90',
        blockMode: 'pace',
      },
    ],
  },
  {
    id: 'taper_touch_go_3x400',
    name: 'Touch & Go 3×400 — חידוד',
    category: 'short_intervals',
    intensityRank: 1.5,
    targetProfileTypes: [1, 2, 3],
    tags: ['taper_specific', '3k_specific', '5k_specific', 'sharpening'],
    description: 'אימון חידוד קלאסי לשמירה על קצב המרוץ בנפח נמוך מאוד.',
    isQualityWorkout: true,
    priority: 1,
    blocks: [
      {
        id: 'TG-warmup',
        type: 'warmup' as RunBlockTemplate['type'],
        zoneType: 'easy' as RunZoneType,
        isQualityExercise: false,
        measureBy: 'time',
        baseValue: 900,
        sets: 1,
        label: 'חימום הדרגתי',
        colorHex: '#90EE90',
        blockMode: 'pace',
      },
      {
        id: 'TG-interval',
        type: 'interval' as RunBlockTemplate['type'],
        zoneType: 'interval_short' as RunZoneType,
        isQualityExercise: true,
        measureBy: 'distance',
        baseValue: 400,
        sets: 3,
        label: 'קצב מרוץ יעד',
        colorHex: '#FF6347',
        blockMode: 'pace',
        restBetweenSetsSeconds: 180,
        restType: 'jog',
      },
      {
        id: 'TG-cooldown',
        type: 'cooldown' as RunBlockTemplate['type'],
        zoneType: 'easy' as RunZoneType,
        isQualityExercise: false,
        measureBy: 'time',
        baseValue: 600,
        sets: 1,
        label: 'שחרור קל',
        colorHex: '#90EE90',
        blockMode: 'pace',
      },
    ],
  },
];

type Stage = 'idle' | 'running' | 'done';

interface DiagnosticDoc {
  id: string;
  type?: string;
  part?: string;
  order?: number;
  title?: string;
  hasOrder: boolean;
  isRunning: boolean;
}

export default function DecisionTreeUploadPage() {
  const [stage, setStage] = useState<Stage>('idle');
  const [logs, setLogs] = useState<string[]>([]);
  const [counts, setCounts] = useState({ templates: 0, questions: 0, answers: 0, errors: 0 });
  const [diagDocs, setDiagDocs] = useState<DiagnosticDoc[]>([]);
  const [diagAnswers, setDiagAnswers] = useState<DiagnosticDoc[]>([]);
  const [diagLoading, setDiagLoading] = useState(false);

  const addLog = (msg: string) => setLogs((prev) => [...prev, msg]);

  const handleDiagnostic = async () => {
    setDiagLoading(true);
    setDiagDocs([]);
    setDiagAnswers([]);
    try {
      const qSnap = await getDocs(collection(db, ONBOARDING_QUESTIONS_COLLECTION));
      const runQuestions: DiagnosticDoc[] = [];
      qSnap.docs.forEach((d) => {
        if (d.id.startsWith('q_run_')) {
          const data = d.data();
          const titleStr = typeof data.title === 'string'
            ? data.title
            : data.title?.he?.neutral ?? '(no title)';
          runQuestions.push({
            id: d.id,
            type: data.type,
            part: data.part,
            order: data.order,
            title: titleStr,
            hasOrder: data.order !== undefined && data.order !== null,
            isRunning: d.id.startsWith('q_run_'),
          });
        }
      });
      setDiagDocs(runQuestions.sort((a, b) => (a.order ?? 999) - (b.order ?? 999)));

      const aSnap = await getDocs(collection(db, ONBOARDING_ANSWERS_COLLECTION));
      const runAnswers: DiagnosticDoc[] = [];
      aSnap.docs.forEach((d) => {
        if (d.id.startsWith('a_run_')) {
          const data = d.data();
          const textStr = typeof data.text === 'string'
            ? data.text
            : data.text?.he?.neutral ?? '(no text)';
          runAnswers.push({
            id: d.id,
            type: data.questionId,
            part: data.nextQuestionId ?? 'TERMINAL',
            order: data.order,
            title: textStr,
            hasOrder: data.order !== undefined && data.order !== null,
            isRunning: true,
          });
        }
      });
      setDiagAnswers(runAnswers.sort((a, b) => (a.order ?? 999) - (b.order ?? 999)));
    } catch (err) {
      console.error('Diagnostic error:', err);
    }
    setDiagLoading(false);
  };

  const handleRun = async () => {
    setStage('running');
    setLogs([]);
    let templates = 0, questions = 0, answers = 0, errors = 0;

    // ── 1. Upload Taper Templates ──────────────────────────────────
    addLog('📦 Uploading 2 taper workout templates...');
    for (const tpl of TAPER_TEMPLATES) {
      try {
        const ref = doc(db, WORKOUT_TEMPLATES_COLLECTION, tpl.id);
        await setDoc(ref, {
          ...tpl,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        templates++;
        addLog(`✓ Template: "${tpl.name}" (${tpl.id})`);
      } catch (err) {
        errors++;
        addLog(`✗ Template error "${tpl.name}": ${(err as Error).message}`);
      }
    }

    // ── 2. Upload Decision Tree Questions ──────────────────────────
    addLog(`\n🌳 Uploading ${RUNNING_QUESTIONS.length} decision tree questions...`);
    for (const q of RUNNING_QUESTIONS) {
      try {
        const ref = doc(db, ONBOARDING_QUESTIONS_COLLECTION, q.id);
        await setDoc(ref, {
          ...q,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        questions++;
        addLog(`✓ Question: "${q.id}" — ${q.title.he.neutral}`);
      } catch (err) {
        errors++;
        addLog(`✗ Question error "${q.id}": ${(err as Error).message}`);
      }
    }

    // ── 3. Upload Decision Tree Answers ────────────────────────────
    addLog(`\n📝 Uploading ${RUNNING_ANSWERS.length} decision tree answers...`);
    for (const a of RUNNING_ANSWERS) {
      try {
        const ref = doc(db, ONBOARDING_ANSWERS_COLLECTION, a.id);
        await setDoc(ref, {
          ...a,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        answers++;
        addLog(`✓ Answer: "${a.id}" → next=${a.nextQuestionId ?? 'TERMINAL'}`);
      } catch (err) {
        errors++;
        addLog(`✗ Answer error "${a.id}": ${(err as Error).message}`);
      }
    }

    // ── 4. Delete removed question/answer docs from Firestore ─────
    const REMOVED_DOCS = [
      { col: ONBOARDING_QUESTIONS_COLLECTION, id: 'q_run_injuries' },
      { col: ONBOARDING_QUESTIONS_COLLECTION, id: 'q_run_experience' },
      { col: ONBOARDING_QUESTIONS_COLLECTION, id: 'q_run_frequency' },
      { col: ONBOARDING_ANSWERS_COLLECTION, id: 'a_run_injuries_yes' },
      { col: ONBOARDING_ANSWERS_COLLECTION, id: 'a_run_injuries_no' },
      { col: ONBOARDING_ANSWERS_COLLECTION, id: 'a_run_experience_less_3' },
      { col: ONBOARDING_ANSWERS_COLLECTION, id: 'a_run_experience_3_12' },
      { col: ONBOARDING_ANSWERS_COLLECTION, id: 'a_run_experience_12_plus' },
      { col: ONBOARDING_ANSWERS_COLLECTION, id: 'a_run_freq_1' },
      { col: ONBOARDING_ANSWERS_COLLECTION, id: 'a_run_freq_2' },
      { col: ONBOARDING_ANSWERS_COLLECTION, id: 'a_run_freq_3' },
      { col: ONBOARDING_ANSWERS_COLLECTION, id: 'a_run_freq_4' },
    ];
    addLog(`\n🗑️ Cleaning up ${REMOVED_DOCS.length} removed docs...`);
    for (const { col, id } of REMOVED_DOCS) {
      try {
        await deleteDoc(doc(db, col, id));
        addLog(`✓ Deleted: ${id}`);
      } catch (err) {
        addLog(`⚠ Delete skip "${id}": ${(err as Error).message}`);
      }
    }

    setCounts({ templates, questions, answers, errors });
    addLog(`\n✅ Done: ${templates} templates, ${questions} questions, ${answers} answers, ${errors} errors`);
    setStage('done');
  };

  return (
    <div className="max-w-4xl space-y-6" dir="rtl">
      <div>
        <Link
          href="/admin/running/workouts"
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-2"
        >
          <ArrowRight size={18} /> חזור לתבניות
        </Link>
        <h1 className="text-3xl font-black text-gray-900">
          העלאת עץ החלטות + תבניות Taper
        </h1>
        <p className="text-gray-500 mt-1">
          מעלה <strong>2 תבניות Taper</strong> (Openers 4×200, Touch & Go 3×400),
          <strong> {RUNNING_QUESTIONS.length} שאלות</strong> ו-<strong>{RUNNING_ANSWERS.length} תשובות</strong> ל-Firestore.
        </p>
      </div>

      {/* ── Diagnostic: Fetch q_run_ docs from Firestore ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-amber-50 border-b border-amber-100 flex items-center justify-between">
          <h2 className="font-black text-amber-800">🔍 אבחון — שאלות q_run_ ב-Firestore</h2>
          <button
            onClick={handleDiagnostic}
            disabled={diagLoading}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg font-bold text-sm hover:bg-amber-600 disabled:opacity-50"
          >
            {diagLoading ? <Loader2 className="animate-spin" size={14} /> : <Play size={14} />}
            {diagLoading ? 'סורק...' : 'סרוק Firestore'}
          </button>
        </div>

        {diagDocs.length > 0 && (
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-sm font-bold">
                {diagDocs.length} שאלות q_run_
              </span>
              <span className="px-3 py-1 rounded-full bg-cyan-100 text-cyan-700 text-sm font-bold">
                {diagAnswers.length} תשובות a_run_
              </span>
            </div>
            <table className="w-full text-right text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 font-bold text-gray-700">ID</th>
                  <th className="px-3 py-2 font-bold text-gray-700">כותרת</th>
                  <th className="px-3 py-2 font-bold text-gray-700">type</th>
                  <th className="px-3 py-2 font-bold text-gray-700">part</th>
                  <th className="px-3 py-2 font-bold text-gray-700">order</th>
                  <th className="px-3 py-2 font-bold text-gray-700">סטטוס</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {diagDocs.map((d) => (
                  <tr key={d.id} className={d.hasOrder ? '' : 'bg-red-50'}>
                    <td className="px-3 py-2 font-mono text-xs text-gray-600">{d.id}</td>
                    <td className="px-3 py-2 text-gray-800">{d.title}</td>
                    <td className="px-3 py-2 text-xs">{d.type}</td>
                    <td className="px-3 py-2 text-xs">{d.part}</td>
                    <td className="px-3 py-2 text-xs font-mono">{d.order ?? <span className="text-red-600 font-bold">MISSING</span>}</td>
                    <td className="px-3 py-2">
                      {d.hasOrder ? (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">OK</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-bold">חסר order!</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {diagDocs.some((d) => !d.hasOrder) && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
                <strong>⚠ בעיה:</strong> שאלות ללא שדה <code className="bg-red-100 px-1 rounded">order</code> לא מופיעות ב-Admin
                כי השאילתה משתמשת ב-<code className="bg-red-100 px-1 rounded">orderBy(&apos;order&apos;)</code>.
                לחצו &quot;העלה הכל&quot; כדי לתקן.
              </div>
            )}
          </div>
        )}

        {!diagLoading && diagDocs.length === 0 && diagAnswers.length === 0 && (
          <div className="p-4 text-sm text-gray-500">
            לחצו &quot;סרוק Firestore&quot; כדי לבדוק מה קיים.
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-center">
          <div className="text-2xl font-black text-orange-600">2</div>
          <div className="text-xs text-orange-700 font-bold">תבניות Taper</div>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
          <div className="text-2xl font-black text-emerald-600">{RUNNING_QUESTIONS.length}</div>
          <div className="text-xs text-emerald-700 font-bold">שאלות</div>
        </div>
        <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-4 text-center">
          <div className="text-2xl font-black text-cyan-600">{RUNNING_ANSWERS.length}</div>
          <div className="text-xs text-cyan-700 font-bold">תשובות</div>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 text-center">
          <div className="text-2xl font-black text-purple-600">{RUNNING_QUESTIONS.length + RUNNING_ANSWERS.length + 2}</div>
          <div className="text-xs text-purple-700 font-bold">סה״כ מסמכים</div>
        </div>
      </div>

      {/* Question + Answer preview */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-emerald-50 border-b border-emerald-100">
          <h2 className="font-black text-emerald-800">🌳 שאלות בעץ ההחלטות</h2>
        </div>
        <div className="max-h-60 overflow-y-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-4 py-2 font-bold text-gray-700">ID</th>
                <th className="px-4 py-2 font-bold text-gray-700">כותרת</th>
                <th className="px-4 py-2 font-bold text-gray-700">סוג</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {RUNNING_QUESTIONS.map((q) => (
                <tr key={q.id}>
                  <td className="px-4 py-2 font-mono text-xs text-gray-600">{q.id}</td>
                  <td className="px-4 py-2 font-bold text-gray-800">{q.title.he.neutral}</td>
                  <td className="px-4 py-2">
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">{q.type}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Taper templates preview */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-orange-50 border-b border-orange-100">
          <h2 className="font-black text-orange-800">🏃 תבניות Taper</h2>
        </div>
        <div className="p-4 space-y-2">
          {TAPER_TEMPLATES.map((t) => (
            <div key={t.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 text-xs font-bold">
                rank {t.intensityRank}
              </span>
              <span className="font-bold text-gray-800">{t.name}</span>
              <span className="text-xs text-gray-500">{t.description}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Action */}
      {stage === 'idle' && (
        <button
          onClick={handleRun}
          className="flex items-center gap-2 px-6 py-3 bg-emerald-500 text-white rounded-xl font-bold hover:bg-emerald-600"
        >
          <TreeDeciduous size={18} /> העלה הכל ל-Firestore
        </button>
      )}

      {stage === 'running' && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-emerald-500" size={40} />
          <p className="text-gray-600 font-bold">מעלה ל-Firestore...</p>
        </div>
      )}

      {stage === 'done' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-center gap-3">
            {counts.errors === 0 ? (
              <CheckCircle size={28} className="text-emerald-500" />
            ) : (
              <AlertTriangle size={28} className="text-amber-500" />
            )}
            <h2 className="text-xl font-black text-gray-900">העלאה הושלמה</h2>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-orange-50 rounded-xl p-4 text-center">
              <div className="text-2xl font-black text-orange-600">{counts.templates}</div>
              <div className="text-xs text-orange-700 font-bold">תבניות</div>
            </div>
            <div className="bg-emerald-50 rounded-xl p-4 text-center">
              <div className="text-2xl font-black text-emerald-600">{counts.questions}</div>
              <div className="text-xs text-emerald-700 font-bold">שאלות</div>
            </div>
            <div className="bg-cyan-50 rounded-xl p-4 text-center">
              <div className="text-2xl font-black text-cyan-600">{counts.answers}</div>
              <div className="text-xs text-cyan-700 font-bold">תשובות</div>
            </div>
            <div className={`rounded-xl p-4 text-center ${counts.errors > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
              <div className={`text-2xl font-black ${counts.errors > 0 ? 'text-red-600' : 'text-gray-400'}`}>{counts.errors}</div>
              <div className="text-xs text-gray-600 font-bold">שגיאות</div>
            </div>
          </div>
          <button
            onClick={() => { setStage('idle'); setLogs([]); setCounts({ templates: 0, questions: 0, answers: 0, errors: 0 }); }}
            className="flex items-center gap-2 px-6 py-3 bg-cyan-500 text-white rounded-xl font-bold hover:bg-cyan-600"
          >
            <Play size={18} /> הרץ שוב
          </button>
        </div>
      )}

      {/* Log */}
      {logs.length > 0 && (
        <div className="bg-gray-950 border border-gray-700 rounded-xl p-5 max-h-96 overflow-y-auto space-y-0.5">
          {logs.map((log, i) => (
            <div
              key={i}
              dir="ltr"
              className={`text-sm font-mono leading-relaxed ${
                log.startsWith('✗') ? 'text-red-400'
                : log.startsWith('✓') ? 'text-emerald-400'
                : log.startsWith('⚠') ? 'text-amber-400'
                : log.includes('📦') || log.includes('🌳') || log.includes('📝') || log.includes('✅') ? 'text-cyan-400'
                : 'text-gray-100'
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
