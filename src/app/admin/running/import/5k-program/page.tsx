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
  Dumbbell,
  Layers,
} from 'lucide-react';
import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  getRunProgramTemplates,
  createRunProgramTemplate,
  updateRunProgramTemplate,
} from '@/features/workout-engine/core/services/running-admin.service';
import type {
  RunProgramTemplate,
  WorkoutCategory,
  VolumeCap,
} from '@/features/workout-engine/core/types/running.types';

// ── 7 Bridge Long Run Templates (6–12 km) ────────────────────────────

const WORKOUT_TEMPLATES_COLLECTION = 'runWorkoutTemplates';

function buildLongRunTemplate(km: number) {
  let rank: number;
  if (km <= 7) rank = 1;
  else if (km <= 10) rank = 2;
  else rank = 3;

  return {
    name: `ריצת נפח ${km} ק״מ`,
    description: `ריצת נפח של ${km} ק״מ בקצב ריצה ארוכה. ${km <= 7 ? 'בניית בסיס אירובי.' : km <= 10 ? 'הרחבת הבסיס האירובי.' : 'ריצת נפח מתקדמת — סיבולת.'}`,
    category: 'long_run' as WorkoutCategory,
    priority: rank === 1 ? 3 : rank === 2 ? 2 : 1,
    isQualityWorkout: false,
    targetProfileTypes: [1, 2],
    intensityRank: rank,
    tags: ['long_run', 'aerobic_base', `${km}km`],
    blocks: [
      {
        id: `LR-${km}km`,
        type: 'run',
        blockMode: 'pace' as const,
        zoneType: 'long_run',
        measureBy: 'distance' as const,
        baseValue: km * 1000,
        sets: 1,
        label: `ריצת נפח ${km} ק״מ`,
        isQualityExercise: false,
        colorHex: '#2E7D32',
      },
    ],
  };
}

const LONG_RUN_TEMPLATES = [6, 7, 8, 9, 10, 11, 12].map(buildLongRunTemplate);

// ── 4 Specific Workout Templates ─────────────────────────────────────

const NEW_WORKOUT_TEMPLATES = [
  {
    name: '5×1000 מ׳ VO2max ספציפי 5K',
    description: '5 חזרות של 1000 מ׳ בקצב I (VO2max) עם 3 דק׳ ג׳וג. אימון VO2max ממוקד ל-5 ק״מ — 5,000 מ׳ באיכות.',
    category: 'long_intervals' as WorkoutCategory,
    priority: 1,
    isQualityWorkout: true,
    targetProfileTypes: [1, 2],
    intensityRank: 3,
    tags: ['vo2max', '5k_specific', 'elite'],
    blocks: [
      {
        id: '5K-VO2-1000x5',
        type: 'interval',
        blockMode: 'pace',
        zoneType: 'interval_long',
        measureBy: 'distance',
        baseValue: 1000,
        sets: 5,
        restBetweenSetsSeconds: 180,
        restType: 'jog',
        label: '1000 מ׳ I-pace',
        isQualityExercise: true,
        colorHex: '#FF5722',
      },
    ],
  },
  {
    name: '2×2000 מ׳ טמפו ספציפי 5K',
    description: '2 חזרות של 2000 מ׳ בקצב טמפו עם 2 דק׳ ג׳וג. אימון סף לקטט ממוקד — 4 ק״מ רצוף בסביבות קצב תחרות.',
    category: 'tempo' as WorkoutCategory,
    priority: 1,
    isQualityWorkout: true,
    targetProfileTypes: [1, 2],
    intensityRank: 3,
    tags: ['tempo', '5k_specific', 'race_pace', 'elite'],
    blocks: [
      {
        id: '5K-TMP-2000x2',
        type: 'interval',
        blockMode: 'pace',
        zoneType: 'tempo',
        measureBy: 'distance',
        baseValue: 2000,
        sets: 2,
        restBetweenSetsSeconds: 120,
        restType: 'jog',
        label: '2000 מ׳ טמפו',
        isQualityExercise: true,
        colorHex: '#9C27B0',
      },
    ],
  },
  {
    name: '6×300 מ׳ כוח ספרינט 3K',
    description: '6 חזרות של 300 מ׳ בקצב ספרינט עם 2 דק׳ ג׳וג. פיתוח כוח אנאירובי ומהירות ספציפית ל-3 ק״מ.',
    category: 'short_intervals' as WorkoutCategory,
    priority: 1,
    isQualityWorkout: true,
    targetProfileTypes: [1, 2],
    intensityRank: 3,
    tags: ['sprint', '3k_specific', 'power', 'elite'],
    blocks: [
      {
        id: '3K-PWR-300x6',
        type: 'interval',
        blockMode: 'pace',
        zoneType: 'sprint',
        measureBy: 'distance',
        baseValue: 300,
        sets: 6,
        restBetweenSetsSeconds: 120,
        restType: 'jog',
        label: '300 מ׳ ספרינט',
        isQualityExercise: true,
        colorHex: '#E91E63',
      },
    ],
  },
  {
    name: '15×10שׁ ספרינט עליות נפח 3K',
    description: '15 חזרות של 10 שניות ספרינט בעלייה תלולה עם ירידה בהליכה. אימון כוח נוירומוסקולרי מרבי — פיתוח running economy.',
    category: 'hill_sprints' as WorkoutCategory,
    priority: 1,
    isQualityWorkout: true,
    targetProfileTypes: [1, 2],
    intensityRank: 3,
    tags: ['hill_sprint', '3k_specific', 'power', 'neuromuscular', 'elite'],
    blocks: [
      {
        id: '3K-HILL-10sx15',
        type: 'sprint',
        blockMode: 'effort',
        zoneType: 'sprint',
        measureBy: 'time',
        baseValue: 10,
        sets: 15,
        restBetweenSetsSeconds: 60,
        restType: 'walk',
        label: 'ספרינט עלייה 10 שנ׳',
        isQualityExercise: true,
        colorHex: '#D32F2F',
        effortConfig: {
          effortLevel: 'max',
          recoveryType: 'walk_down',
          inclinePercent: 8,
        },
      },
    ],
  },
];

// ── 5K Program Template (complete & correct) ─────────────────────────

const PROGRAM_5K: Omit<RunProgramTemplate, 'id'> = {
  name: 'שיפור 5 ק״מ - תוכנית ממוקדת',
  targetDistance: '5k',
  targetProfileTypes: [1, 2],
  canonicalWeeks: 8,
  canonicalFrequency: 4,
  weekTemplates: [],
  progressionRules: [],
  phases: [
    {
      name: 'base',
      startWeek: 1,
      endWeek: 2,
      volumeMultiplier: [1.0, 1.1],
      qualityPool: ['fartlek_structured', 'hill_short', 'strides'],
      progressionRules: [],
      weekSlots: [
        { id: '5k_b1', slotType: 'quality_primary', required: true, priority: 1, allowedCategories: ['fartlek_structured'] },
        { id: '5k_b2', slotType: 'long_run', required: true, priority: 2, allowedCategories: ['long_run'] },
        { id: '5k_b3', slotType: 'quality_secondary', required: false, priority: 3, allowedCategories: ['hill_short', 'strides'] },
        { id: '5k_b4', slotType: 'easy_run', required: false, priority: 4, allowedCategories: ['easy_run'] },
      ],
    },
    {
      name: 'build',
      startWeek: 3,
      endWeek: 6,
      volumeMultiplier: [1.0, 1.1, 1.2, 0.8],
      qualityPool: ['short_intervals', 'long_intervals', 'tempo'],
      progressionRules: [
        { type: 'deload_week', everyWeeks: 4, volumeReductionPercent: 20, intensityReductionPercent: 10, maintainFrequency: true, skipQualityWorkouts: false },
      ],
      weekSlots: [
        { id: '5k_bu1', slotType: 'quality_primary', required: true, priority: 1, allowedCategories: ['long_intervals', 'short_intervals'] },
        { id: '5k_bu2', slotType: 'long_run', required: true, priority: 2, allowedCategories: ['long_run'] },
        { id: '5k_bu3', slotType: 'quality_secondary', required: false, priority: 3, allowedCategories: ['tempo', 'fartlek_structured'] },
        { id: '5k_bu4', slotType: 'easy_run', required: false, priority: 4, allowedCategories: ['easy_run'] },
      ],
    },
    {
      name: 'peak',
      startWeek: 7,
      endWeek: 7,
      volumeMultiplier: 1.1,
      qualityPool: ['short_intervals', 'long_intervals'],
      progressionRules: [],
      weekSlots: [
        { id: '5k_p1', slotType: 'quality_primary', required: true, priority: 1, allowedCategories: ['short_intervals'] },
        { id: '5k_p2', slotType: 'long_run', required: true, priority: 2, allowedCategories: ['long_run'] },
        { id: '5k_p3', slotType: 'easy_run', required: false, priority: 3, allowedCategories: ['easy_run'] },
      ],
    },
    {
      name: 'taper',
      startWeek: 8,
      endWeek: 8,
      volumeMultiplier: 0.6,
      qualityPool: ['short_intervals', 'strides'],
      progressionRules: [
        { type: 'taper', weeksBeforeEnd: 1, volumeReductionPercent: 40, maintainIntensity: true, maintainFrequency: true, includeRacePaceWorkout: true },
      ],
      weekSlots: [
        { id: '5k_t1', slotType: 'quality_primary', required: true, priority: 1, allowedCategories: ['short_intervals', 'strides'] },
        { id: '5k_t2', slotType: 'easy_run', required: true, priority: 2, allowedCategories: ['easy_run'] },
        { id: '5k_t3', slotType: 'easy_run', required: false, priority: 3, allowedCategories: ['easy_run'] },
      ],
    },
  ],
  volumeCaps: [
    { type: 'cap', target: 'weekly_distance', maxValue: 40_000, maxWeeklyIncreasePercent: 10 },
    { type: 'cap', target: 'single_run_distance', maxValue: 12_000 },
  ] as VolumeCap[],
};

// ── Component ────────────────────────────────────────────────────────

type Stage = 'idle' | 'running' | 'done';

interface Result {
  workoutsUploaded: number;
  workoutsSkipped: number;
  programAction: 'created' | 'updated' | null;
  errors: string[];
}

const PHASE_COLORS: Record<string, string> = {
  base: 'bg-emerald-100 text-emerald-700',
  build: 'bg-blue-100 text-blue-700',
  peak: 'bg-purple-100 text-purple-700',
  taper: 'bg-amber-100 text-amber-700',
};

export default function Import5KProgramPage() {
  const [stage, setStage] = useState<Stage>('idle');
  const [logs, setLogs] = useState<string[]>([]);
  const [result, setResult] = useState<Result | null>(null);

  const addLog = (msg: string) => setLogs((prev) => [...prev, msg]);

  const handleRun = async () => {
    setStage('running');
    setLogs([]);
    const errors: string[] = [];
    let workoutsUploaded = 0;
    let workoutsSkipped = 0;
    let programAction: 'created' | 'updated' | null = null;

    try {
      // ── Step 1a: Upload 7 long_run bridge templates ──
      addLog('🛣️ שלב 1a: מעלה 7 תבניות ריצת נפח (6–12 ק״מ)...');

      for (const tpl of LONG_RUN_TEMPLATES) {
        const q = query(
          collection(db, WORKOUT_TEMPLATES_COLLECTION),
          where('name', '==', tpl.name),
        );
        const snap = await getDocs(q);

        if (snap.size > 0) {
          workoutsSkipped++;
          addLog(`⏭ "${tpl.name}" — כבר קיים (${snap.docs[0].id})`);
          continue;
        }

        const ref = doc(collection(db, WORKOUT_TEMPLATES_COLLECTION));
        await setDoc(ref, {
          ...tpl,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        workoutsUploaded++;
        addLog(`✓ "${tpl.name}" → long_run | rank=${tpl.intensityRank} | ${tpl.blocks[0].baseValue / 1000} ק״מ`);
      }

      // ── Step 1b: Upload 4 specific workout templates ──
      addLog('\n🏃 שלב 1b: מעלה 4 תבניות אימון ספציפיות...');

      for (const tpl of NEW_WORKOUT_TEMPLATES) {
        const q = query(
          collection(db, WORKOUT_TEMPLATES_COLLECTION),
          where('name', '==', tpl.name),
        );
        const snap = await getDocs(q);

        if (snap.size > 0) {
          workoutsSkipped++;
          addLog(`⏭ "${tpl.name}" — כבר קיים (${snap.docs[0].id})`);
          continue;
        }

        const ref = doc(collection(db, WORKOUT_TEMPLATES_COLLECTION));
        await setDoc(ref, {
          ...tpl,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        workoutsUploaded++;
        addLog(`✓ "${tpl.name}" → ${tpl.category} | rank=${tpl.intensityRank} | profiles=[${tpl.targetProfileTypes}]`);
      }

      addLog(`\n✅ אימונים: ${workoutsUploaded} הועלו (${LONG_RUN_TEMPLATES.length} long_run + ${NEW_WORKOUT_TEMPLATES.length} ספציפיים), ${workoutsSkipped} כבר קיימים`);

      // ── Step 2: Upload/update program template ──
      addLog('\n📋 שלב 2: מעלה תוכנית "שיפור 5 ק״מ - תוכנית ממוקדת"...');

      const allPrograms = await getRunProgramTemplates();
      const existing = allPrograms.find(
        (p) => p.name.trim() === PROGRAM_5K.name.trim(),
      );

      if (existing) {
        const ok = await updateRunProgramTemplate(existing.id, PROGRAM_5K);
        if (ok) {
          programAction = 'updated';
          addLog(`✓ תוכנית עודכנה (${existing.id})`);
        } else {
          errors.push('שגיאה בעדכון התוכנית');
          addLog('✗ שגיאה בעדכון התוכנית');
        }
      } else {
        const id = await createRunProgramTemplate(PROGRAM_5K);
        if (id) {
          programAction = 'created';
          addLog(`✓ תוכנית נוצרה (${id})`);
        } else {
          errors.push('שגיאה ביצירת התוכנית');
          addLog('✗ שגיאה ביצירת התוכנית');
        }
      }

      // ── Summary ──
      addLog('\n── סיכום מבנה התוכנית ──');
      for (const phase of PROGRAM_5K.phases!) {
        const vm = Array.isArray(phase.volumeMultiplier)
          ? `[${phase.volumeMultiplier.join(', ')}]`
          : `×${phase.volumeMultiplier}`;
        addLog(`  ${phase.name.toUpperCase()} w${phase.startWeek}–${phase.endWeek} | ${phase.weekSlots.length} slots | pool=[${phase.qualityPool.join(', ')}] | vol=${vm}`);
        for (const slot of phase.weekSlots) {
          addLog(`    → ${slot.id} (${slot.slotType}) P${slot.priority} ${slot.required ? '★' : ''} [${slot.allowedCategories.join(', ')}]`);
        }
      }

      addLog(`\n✅ הושלם: ${workoutsUploaded} אימונים, תוכנית ${programAction ?? 'לא נוצרה'}, ${errors.length} שגיאות`);
    } catch (err) {
      const msg = (err as Error).message;
      errors.push(msg);
      addLog(`✗ שגיאה: ${msg}`);
    }

    setResult({ workoutsUploaded, workoutsSkipped, programAction, errors });
    setStage('done');
  };

  return (
    <div className="max-w-5xl space-y-6" dir="rtl">
      <div>
        <Link
          href="/admin/running/programs"
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-2"
        >
          <ArrowRight size={18} /> חזרה לתוכניות
        </Link>
        <h1 className="text-3xl font-black text-gray-900">
          ייבוא תוכנית שיפור 5 ק״מ + 11 אימונים
        </h1>
        <p className="text-gray-500 mt-1">
          מעלה 7 תבניות ריצת נפח (6–12 ק״מ) + 4 תבניות ספציפיות (5K VO2max, 5K Tempo, 3K Power, 3K Hills)
          + תוכנית 8 שבועות עם 4 פאזות.
        </p>
      </div>

      {/* Preview cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="flex items-center gap-2 text-gray-700">
            <Dumbbell size={18} />
            <h2 className="font-bold">11 אימונים חדשים</h2>
          </div>

          <div className="space-y-1">
            <div className="text-xs font-bold text-emerald-700 mb-1">🛣️ ריצות נפח (7)</div>
            {LONG_RUN_TEMPLATES.map((t) => (
              <div key={t.name} className="flex items-center gap-2 text-sm">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: t.blocks[0].colorHex }} />
                <span className="font-bold text-gray-800 flex-1">{t.name}</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">R{t.intensityRank}</span>
              </div>
            ))}
          </div>

          <div className="space-y-1">
            <div className="text-xs font-bold text-orange-700 mb-1">🏃 ספציפיים (4)</div>
            {NEW_WORKOUT_TEMPLATES.map((t) => (
              <div key={t.name} className="flex items-center gap-2 text-sm">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: t.blocks[0].colorHex }} />
                <span className="font-bold text-gray-800 flex-1">{t.name}</span>
                <span className="px-2 py-0.5 rounded-full bg-gray-100 text-xs text-gray-600">{t.category}</span>
                <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-bold">R{t.intensityRank}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <div className="flex items-center gap-2 text-gray-700">
            <Layers size={18} />
            <h2 className="font-bold">{PROGRAM_5K.name}</h2>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="bg-gray-50 rounded-lg p-2">
              <div className="text-gray-500 text-xs">מרחק</div>
              <div className="font-bold">{PROGRAM_5K.targetDistance}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-2">
              <div className="text-gray-500 text-xs">שבועות</div>
              <div className="font-bold">{PROGRAM_5K.canonicalWeeks}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-2">
              <div className="text-gray-500 text-xs">תדירות</div>
              <div className="font-bold">{PROGRAM_5K.canonicalFrequency}×/שבוע</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-2">
              <div className="text-gray-500 text-xs">פרופילים</div>
              <div className="font-bold">[{PROGRAM_5K.targetProfileTypes.join(', ')}]</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PROGRAM_5K.phases!.map((p) => (
              <span key={p.name} className={`px-2 py-0.5 rounded text-xs font-bold ${PHASE_COLORS[p.name]}`}>
                {p.name} w{p.startWeek}–{p.endWeek} ({p.weekSlots.length} slots)
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Action */}
      {stage === 'idle' && (
        <button
          onClick={handleRun}
          className="flex items-center gap-2 px-6 py-3 bg-cyan-500 text-white rounded-xl font-bold hover:bg-cyan-600"
        >
          <Play size={18} /> העלה הכל
        </button>
      )}

      {stage === 'running' && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-cyan-500" size={40} />
          <p className="text-gray-600 font-bold">מעלה אימונים ותוכנית...</p>
        </div>
      )}

      {stage === 'done' && result && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-center gap-3">
            {result.errors.length === 0 ? (
              <CheckCircle size={28} className="text-emerald-500" />
            ) : (
              <AlertTriangle size={28} className="text-amber-500" />
            )}
            <h2 className="text-xl font-black text-gray-900">הושלם</h2>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-emerald-50 rounded-xl p-4 text-center">
              <div className="text-2xl font-black text-emerald-600">{result.workoutsUploaded}</div>
              <div className="text-xs text-emerald-700 font-bold">אימונים הועלו</div>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 text-center">
              <div className="text-2xl font-black text-gray-400">{result.workoutsSkipped}</div>
              <div className="text-xs text-gray-600 font-bold">כבר קיימים</div>
            </div>
            <div className="bg-blue-50 rounded-xl p-4 text-center">
              <div className="text-2xl font-black text-blue-600">{result.programAction === 'created' ? '1' : result.programAction === 'updated' ? '1' : '0'}</div>
              <div className="text-xs text-blue-700 font-bold">תוכנית {result.programAction === 'updated' ? 'עודכנה' : 'נוצרה'}</div>
            </div>
            <div className={`rounded-xl p-4 text-center ${result.errors.length > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
              <div className={`text-2xl font-black ${result.errors.length > 0 ? 'text-red-600' : 'text-gray-400'}`}>{result.errors.length}</div>
              <div className="text-xs text-gray-600 font-bold">שגיאות</div>
            </div>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={() => { setStage('idle'); setLogs([]); setResult(null); }}
              className="flex items-center gap-2 px-6 py-3 bg-cyan-500 text-white rounded-xl font-bold hover:bg-cyan-600"
            >
              הרצה חוזרת
            </button>
            <Link href="/admin/running/programs" className="px-4 py-3 text-gray-600 hover:text-gray-900 font-bold">
              עבור לתוכניות
            </Link>
          </div>
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
                : log.startsWith('⏭') ? 'text-gray-400'
                : log.includes('✅') ? 'text-emerald-400'
                : log.includes('🏃') || log.includes('📋') ? 'text-cyan-400'
                : log.startsWith('  ') ? 'text-gray-400'
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
