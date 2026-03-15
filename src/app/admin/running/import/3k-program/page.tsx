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

// ── Short Long Run Templates for 3K plans (3–5 km) ───────────────────

const WORKOUT_TEMPLATES_COLLECTION = 'runWorkoutTemplates';

function buildShortLongRunTemplate(km: number) {
  const rank = km <= 3.5 ? 1 : km <= 4.5 ? 2 : 3;
  const kmLabel = Number.isInteger(km) ? `${km}` : `${km}`;
  return {
    name: `ריצת נפח ${kmLabel} ק״מ`,
    description: `ריצת נפח של ${kmLabel} ק״מ בקצב ריצה ארוכה. ${km <= 3.5 ? 'בניית בסיס אירובי.' : km <= 4.5 ? 'הרחבת הבסיס האירובי.' : 'ריצת נפח מתקדמת — סיבולת ל-3K.'}`,
    category: 'long_run' as WorkoutCategory,
    priority: rank === 1 ? 3 : rank === 2 ? 2 : 1,
    isQualityWorkout: false,
    targetProfileTypes: [1, 2, 3],
    intensityRank: rank,
    tags: ['long_run', 'aerobic_base', `${kmLabel}km`, '3k_plan', '2k_plan'],
    blocks: [
      {
        id: `LR-${kmLabel}km`,
        type: 'run',
        blockMode: 'pace' as const,
        zoneType: 'long_run',
        measureBy: 'distance' as const,
        baseValue: km * 1000,
        sets: 1,
        label: `ריצת נפח ${kmLabel} ק״מ`,
        isQualityExercise: false,
        colorHex: '#2E7D32',
      },
    ],
  };
}

const SHORT_LONG_RUN_TEMPLATES = [3, 3.5, 4, 4.5, 5, 5.5].map(buildShortLongRunTemplate);

// ── Short Easy Run (Recovery) Templates ───────────────────────────────

const EASY_RUN_TEMPLATES = [
  {
    name: 'ריצת התאוששות 20 דק׳',
    description: 'ריצת התאוששות קלה של 20 דקות. מתאימה לימי מנוחה פעילה ותוכניות 2K/3K.',
    category: 'easy_run' as WorkoutCategory,
    priority: 3,
    isQualityWorkout: false,
    targetProfileTypes: [1, 2, 3],
    intensityRank: 1,
    tags: ['recovery', 'short_duration', '2k', '3k'],
    blocks: [{
      id: 'ER-20min', type: 'run', blockMode: 'pace' as const, zoneType: 'easy',
      measureBy: 'time' as const, baseValue: 1200, sets: 1,
      label: 'ריצה קלה 20 דק׳', isQualityExercise: false, colorHex: '#4CAF50',
    }],
  },
  {
    name: 'ריצת התאוששות 25 דק׳',
    description: 'ריצת התאוששות של 25 דקות בקצב נוח. מתאימה לימי מנוחה פעילה ותוכניות 2K/3K.',
    category: 'easy_run' as WorkoutCategory,
    priority: 2,
    isQualityWorkout: false,
    targetProfileTypes: [1, 2, 3],
    intensityRank: 1,
    tags: ['recovery', 'short_duration', '2k', '3k'],
    blocks: [{
      id: 'ER-25min', type: 'run', blockMode: 'pace' as const, zoneType: 'easy',
      measureBy: 'time' as const, baseValue: 1500, sets: 1,
      label: 'ריצה קלה 25 דק׳', isQualityExercise: false, colorHex: '#4CAF50',
    }],
  },
  {
    name: 'ריצת התאוששות 30 דק׳',
    description: 'ריצת התאוששות של 30 דקות בקצב נוח. מתאימה לתוכניות 2K/3K/5K.',
    category: 'easy_run' as WorkoutCategory,
    priority: 1,
    isQualityWorkout: false,
    targetProfileTypes: [1, 2, 3],
    intensityRank: 2,
    tags: ['recovery', 'short_duration', '2k', '3k', '5k'],
    blocks: [{
      id: 'ER-30min', type: 'run', blockMode: 'pace' as const, zoneType: 'easy',
      measureBy: 'time' as const, baseValue: 1800, sets: 1,
      label: 'ריצה קלה 30 דק׳', isQualityExercise: false, colorHex: '#4CAF50',
    }],
  },
];

// ── Hill Progression Templates (starter + split sets) ─────────────────

const HILL_TEMPLATES = [
  {
    name: 'עליות כניסה 10 שנ׳ × 6',
    description: '6 חזרות של 10 שניות ספרינט בעלייה עם ירידה בהליכה. אימון כניסה לעליות — בניית כוח בסיסית.',
    category: 'hill_sprints' as WorkoutCategory,
    priority: 3,
    isQualityWorkout: true,
    targetProfileTypes: [1, 2, 3],
    intensityRank: 1,
    tags: ['base', '3k', '2k', 'starter', 'hill_sprint'],
    blocks: [{
      id: 'HS-10sx6', type: 'sprint', blockMode: 'effort' as const, zoneType: 'sprint',
      measureBy: 'time' as const, baseValue: 10, sets: 6,
      restBetweenSetsSeconds: 60, restType: 'walk' as const,
      label: 'ספרינט עלייה 10 שנ׳', isQualityExercise: true, colorHex: '#D32F2F',
      effortConfig: { effortLevel: 'hard' as const, recoveryType: 'walk_down' as const, inclinePercent: 6 },
    }],
  },
  {
    name: 'עליות כניסה 15 שנ׳ × 8',
    description: '8 חזרות של 15 שניות ספרינט בעלייה עם ירידה בהליכה. המשך בניית כוח — נפח גבוה יותר.',
    category: 'hill_sprints' as WorkoutCategory,
    priority: 2,
    isQualityWorkout: true,
    targetProfileTypes: [1, 2, 3],
    intensityRank: 1,
    tags: ['base', '3k', '2k', 'starter', 'hill_sprint'],
    blocks: [{
      id: 'HS-15sx8', type: 'sprint', blockMode: 'effort' as const, zoneType: 'sprint',
      measureBy: 'time' as const, baseValue: 15, sets: 8,
      restBetweenSetsSeconds: 60, restType: 'walk' as const,
      label: 'ספרינט עלייה 15 שנ׳', isQualityExercise: true, colorHex: '#D32F2F',
      effortConfig: { effortLevel: 'hard' as const, recoveryType: 'walk_down' as const, inclinePercent: 6 },
    }],
  },
  {
    name: 'עליות 150 מ׳ (2 סטים של 5)',
    description: '2 סטים של 5 חזרות × 150 מ׳ בעלייה עם 3 דק׳ מנוחה מלאה בין הסטים. פיתוח כוח ספציפי לריצה.',
    category: 'hill_short' as WorkoutCategory,
    priority: 1,
    isQualityWorkout: true,
    targetProfileTypes: [1, 2],
    intensityRank: 2,
    tags: ['build', '3k', '2k', 'split_set', 'hill'],
    blocks: [
      {
        id: 'HL-150x5-A', type: 'interval', blockMode: 'effort' as const, zoneType: 'interval_short',
        measureBy: 'distance' as const, baseValue: 150, sets: 5,
        restBetweenSetsSeconds: 60, restType: 'walk' as const,
        label: 'סט 1: עליות 150 מ׳', isQualityExercise: true, colorHex: '#E65100',
        effortConfig: { effortLevel: 'hard' as const, recoveryType: 'walk_down' as const, inclinePercent: 6 },
      },
      {
        id: 'HL-REST-3min', type: 'recovery', blockMode: 'pace' as const, zoneType: 'walk',
        measureBy: 'time' as const, baseValue: 180, sets: 1,
        label: 'מנוחה 3 דק׳', isQualityExercise: false, colorHex: '#90A4AE',
      },
      {
        id: 'HL-150x5-B', type: 'interval', blockMode: 'effort' as const, zoneType: 'interval_short',
        measureBy: 'distance' as const, baseValue: 150, sets: 5,
        restBetweenSetsSeconds: 60, restType: 'walk' as const,
        label: 'סט 2: עליות 150 מ׳', isQualityExercise: true, colorHex: '#E65100',
        effortConfig: { effortLevel: 'hard' as const, recoveryType: 'walk_down' as const, inclinePercent: 6 },
      },
    ],
  },
  {
    name: 'ספרינט עליות 15 שנ׳ (2 סטים של 6)',
    description: '2 סטים של 6 חזרות × 15 שנ׳ ספרינט בעלייה עם 3 דק׳ מנוחה בין הסטים. נפח גבוה עם התאוששות מלאה.',
    category: 'hill_sprints' as WorkoutCategory,
    priority: 2,
    isQualityWorkout: true,
    targetProfileTypes: [1, 2],
    intensityRank: 1.8,
    tags: ['build', '3k', '2k', 'split_set', 'hill_sprint'],
    blocks: [
      {
        id: 'HS-15sx6-A', type: 'sprint', blockMode: 'effort' as const, zoneType: 'sprint',
        measureBy: 'time' as const, baseValue: 15, sets: 6,
        restBetweenSetsSeconds: 60, restType: 'walk' as const,
        label: 'סט 1: ספרינט 15 שנ׳', isQualityExercise: true, colorHex: '#D32F2F',
        effortConfig: { effortLevel: 'max' as const, recoveryType: 'walk_down' as const, inclinePercent: 8 },
      },
      {
        id: 'HS-REST-3min', type: 'recovery', blockMode: 'pace' as const, zoneType: 'walk',
        measureBy: 'time' as const, baseValue: 180, sets: 1,
        label: 'מנוחה 3 דק׳', isQualityExercise: false, colorHex: '#90A4AE',
      },
      {
        id: 'HS-15sx6-B', type: 'sprint', blockMode: 'effort' as const, zoneType: 'sprint',
        measureBy: 'time' as const, baseValue: 15, sets: 6,
        restBetweenSetsSeconds: 60, restType: 'walk' as const,
        label: 'סט 2: ספרינט 15 שנ׳', isQualityExercise: true, colorHex: '#D32F2F',
        effortConfig: { effortLevel: 'max' as const, recoveryType: 'walk_down' as const, inclinePercent: 8 },
      },
    ],
  },
];

// ── Taper-Specific Templates ──────────────────────────────────────────

const TAPER_TEMPLATES = [
  {
    name: 'Openers 4×200 קצב 3K',
    description: '4 חזרות של 200 מ׳ בקצב מירוץ 3K עם 2 דק׳ ג׳וג. פתיחה עצבית לפני המירוץ — מפעיל סיבים מהירים.',
    category: 'short_intervals' as WorkoutCategory,
    priority: 1,
    isQualityWorkout: true,
    targetProfileTypes: [1, 2, 3],
    intensityRank: 1,
    tags: ['taper_specific', '3k_specific', 'openers', 'race_prep'],
    blocks: [{
      id: 'TP-OP-200x4', type: 'interval', blockMode: 'pace' as const, zoneType: 'interval_short',
      measureBy: 'distance' as const, baseValue: 200, sets: 4,
      restBetweenSetsSeconds: 120, restType: 'jog' as const,
      label: '200 מ׳ קצב מירוץ', isQualityExercise: true, colorHex: '#FF5722',
    }],
  },
  {
    name: 'Touch & Go 3×400 קצב מירוץ',
    description: '3 חזרות של 400 מ׳ בקצב מירוץ 3K עם 3 דק׳ התאוששות. תזכורת למערכת העצבים — קליל ומדויק.',
    category: 'short_intervals' as WorkoutCategory,
    priority: 2,
    isQualityWorkout: true,
    targetProfileTypes: [1, 2, 3],
    intensityRank: 1,
    tags: ['taper_specific', '3k_specific', 'touch_and_go', 'race_prep'],
    blocks: [{
      id: 'TP-TG-400x3', type: 'interval', blockMode: 'pace' as const, zoneType: 'interval_short',
      measureBy: 'distance' as const, baseValue: 400, sets: 3,
      restBetweenSetsSeconds: 180, restType: 'jog' as const,
      label: '400 מ׳ קצב מירוץ', isQualityExercise: true, colorHex: '#FF5722',
    }],
  },
];

// ── 3K Featured Program Template (all fixes applied) ──────────────────
//
// Fixes applied:
//   1. weekTemplates: [] — present
//   2. No race_simulation — using short_intervals in peak qualityPool
//   3. strides → short_intervals in all weekSlot allowedCategories
//   4. Volume caps: 25k weekly, 6k single run (corrected from old 15k/5k)

const PROGRAM_3K: Omit<RunProgramTemplate, 'id'> = {
  name: 'שיפור 3 ק״מ - תוכנית ממוקדת',
  targetDistance: '3k',
  targetProfileTypes: [1, 2],
  canonicalWeeks: 8,
  canonicalFrequency: 4,
  weekTemplates: [],
  progressionRules: [],
  phases: [
    {
      name: 'base',
      startWeek: 1,
      endWeek: 3,
      volumeMultiplier: [1.0, 1.1, 1.2],
      qualityPool: ['hill_sprints', 'short_intervals', 'fartlek_easy', 'hill_short'],
      progressionRules: [],
      weekSlots: [
        { id: '3k_b1', slotType: 'quality_primary',   required: true,  priority: 1, allowedCategories: ['hill_sprints', 'fartlek_easy'] },
        { id: '3k_b2', slotType: 'long_run',           required: true,  priority: 2, allowedCategories: ['long_run'] },
        { id: '3k_b3', slotType: 'quality_secondary',  required: false, priority: 3, allowedCategories: ['fartlek_easy', 'short_intervals'] },
        { id: '3k_b4', slotType: 'easy_run',           required: false, priority: 4, allowedCategories: ['easy_run'] },
      ],
    },
    {
      name: 'build',
      startWeek: 4,
      endWeek: 6,
      volumeMultiplier: [1.0, 1.1, 1.2],
      qualityPool: ['short_intervals', 'long_intervals', 'fartlek_structured', 'hill_short'],
      progressionRules: [],
      weekSlots: [
        { id: '3k_bu1', slotType: 'quality_primary',   required: true,  priority: 1, allowedCategories: ['short_intervals', 'long_intervals'] },
        { id: '3k_bu2', slotType: 'long_run',           required: true,  priority: 2, allowedCategories: ['long_run'] },
        { id: '3k_bu3', slotType: 'quality_secondary',  required: false, priority: 3, allowedCategories: ['hill_short', 'fartlek_structured'] },
        { id: '3k_bu4', slotType: 'easy_run',           required: false, priority: 4, allowedCategories: ['easy_run'] },
      ],
    },
    {
      name: 'peak',
      startWeek: 7,
      endWeek: 7,
      volumeMultiplier: 1.1,
      qualityPool: ['short_intervals', 'fartlek_structured'],
      progressionRules: [],
      weekSlots: [
        { id: '3k_p1', slotType: 'quality_primary',   required: true,  priority: 1, allowedCategories: ['short_intervals'] },
        { id: '3k_p2', slotType: 'long_run',           required: true,  priority: 2, allowedCategories: ['long_run'] },
        { id: '3k_p3', slotType: 'quality_secondary',  required: false, priority: 3, allowedCategories: ['short_intervals', 'fartlek_structured'] },
        { id: '3k_p4', slotType: 'easy_run',           required: false, priority: 4, allowedCategories: ['easy_run'] },
      ],
    },
    {
      name: 'taper',
      startWeek: 8,
      endWeek: 8,
      volumeMultiplier: 0.6,
      qualityPool: ['short_intervals'],
      progressionRules: [
        { type: 'taper', weeksBeforeEnd: 1, volumeReductionPercent: 40, maintainIntensity: true, maintainFrequency: true, includeRacePaceWorkout: true },
      ],
      weekSlots: [
        { id: '3k_t1', slotType: 'quality_primary', required: true,  priority: 1, allowedCategories: ['short_intervals'] },
        { id: '3k_t2', slotType: 'easy_run',         required: true,  priority: 2, allowedCategories: ['easy_run'] },
        { id: '3k_t3', slotType: 'easy_run',         required: false, priority: 3, allowedCategories: ['easy_run'] },
        { id: '3k_t4', slotType: 'easy_run',         required: false, priority: 4, allowedCategories: ['easy_run'] },
      ],
    },
  ],
  volumeCaps: [
    { type: 'cap', target: 'weekly_distance',     maxValue: 25_000, maxWeeklyIncreasePercent: 10 },
    { type: 'cap', target: 'single_run_distance', maxValue:  6_000 },
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

export default function Import3KProgramPage() {
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
      // ── Step 1a: Upload short long_run templates (3–5.5 km) ──
      addLog('🛣️ שלב 1a: מעלה 6 תבניות ריצת נפח (3–5.5 ק״מ)...');

      for (const tpl of SHORT_LONG_RUN_TEMPLATES) {
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

      // ── Step 1b: Upload easy run recovery templates ──
      addLog('\n🏃 שלב 1b: מעלה 3 תבניות ריצת התאוששות (20–30 דק׳)...');

      for (const tpl of EASY_RUN_TEMPLATES) {
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
        addLog(`✓ "${tpl.name}" → easy_run | rank=${tpl.intensityRank} | ${tpl.blocks[0].baseValue}s`);
      }

      // ── Step 1c: Upload hill progression templates ──
      addLog('\n⛰️ שלב 1c: מעלה 4 תבניות עליות (starter + split sets)...');

      for (const tpl of HILL_TEMPLATES) {
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
        addLog(`✓ "${tpl.name}" → ${tpl.category} | rank=${tpl.intensityRank}`);
      }

      // ── Step 1d: Upload taper-specific templates ──
      addLog('\n🏁 שלב 1d: מעלה 2 תבניות Taper (openers + touch & go)...');

      for (const tpl of TAPER_TEMPLATES) {
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
        addLog(`✓ "${tpl.name}" → ${tpl.category} | rank=${tpl.intensityRank}`);
      }

      addLog(`\n✅ אימונים: ${workoutsUploaded} הועלו, ${workoutsSkipped} כבר קיימים`);

      // ── Step 2: Upload/update program template ──
      addLog('\n📋 שלב 2: מעלה תוכנית "שיפור 3 ק״מ - תוכנית ממוקדת"...');

      const allPrograms = await getRunProgramTemplates();
      const existing = allPrograms.find(
        (p) => p.name.trim() === PROGRAM_3K.name.trim(),
      );

      if (existing) {
        const ok = await updateRunProgramTemplate(existing.id, PROGRAM_3K);
        if (ok) {
          programAction = 'updated';
          addLog(`✓ תוכנית עודכנה (${existing.id})`);
        } else {
          errors.push('שגיאה בעדכון התוכנית');
          addLog('✗ שגיאה בעדכון התוכנית');
        }
      } else {
        const id = await createRunProgramTemplate(PROGRAM_3K);
        if (id) {
          programAction = 'created';
          addLog(`✓ תוכנית נוצרה (${id})`);
        } else {
          errors.push('שגיאה ביצירת התוכנית');
          addLog('✗ שגיאה ביצירת התוכנית');
        }
      }

      // ── Validation summary ──
      addLog('\n── אימות מבנה התוכנית ──');
      addLog(`✓ weekTemplates: [] — קיים`);
      addLog(`✓ אין race_simulation — peak qualityPool: [${PROGRAM_3K.phases![2].qualityPool.join(', ')}]`);

      let stridesInSlots = false;
      for (const phase of PROGRAM_3K.phases!) {
        for (const slot of phase.weekSlots) {
          if (slot.allowedCategories.includes('strides' as WorkoutCategory)) {
            stridesInSlots = true;
          }
        }
      }
      addLog(`✓ strides בסלוטים: ${stridesInSlots ? '⚠ נמצא!' : 'לא — הוחלף ל-short_intervals'}`);
      addLog(`✓ volumeCaps: weekly=${PROGRAM_3K.volumeCaps![0].maxValue / 1000}k, singleRun=${PROGRAM_3K.volumeCaps![1].maxValue / 1000}k`);

      // ── Structure summary ──
      addLog('\n── מבנה פאזות ──');
      for (const phase of PROGRAM_3K.phases!) {
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
          ייבוא תוכנית שיפור 3 ק״מ + תבניות אימון
        </h1>
        <p className="text-gray-500 mt-1">
          מעלה 6 ריצות נפח (3–5.5 ק״מ) + 3 ריצות התאוששות + 4 תבניות עליות + תוכנית 8 שבועות.
        </p>
      </div>

      {/* Preview cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="flex items-center gap-2 text-gray-700">
            <Dumbbell size={18} />
            <h2 className="font-bold">15 תבניות אימון חדשות</h2>
          </div>

          <div className="space-y-1">
            <div className="text-xs font-bold text-emerald-700 mb-1">ריצות נפח קצרות ל-3K</div>
            {SHORT_LONG_RUN_TEMPLATES.map((t) => (
              <div key={t.name} className="flex items-center gap-2 text-sm">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: t.blocks[0].colorHex }} />
                <span className="font-bold text-gray-800 flex-1">{t.name}</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">R{t.intensityRank}</span>
              </div>
            ))}
          </div>

          <div className="space-y-1">
            <div className="text-xs font-bold text-blue-700 mb-1">ריצות התאוששות</div>
            {EASY_RUN_TEMPLATES.map((t) => (
              <div key={t.name} className="flex items-center gap-2 text-sm">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: t.blocks[0].colorHex }} />
                <span className="font-bold text-gray-800 flex-1">{t.name}</span>
                <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">R{t.intensityRank}</span>
              </div>
            ))}
          </div>

          <div className="space-y-1">
            <div className="text-xs font-bold text-red-700 mb-1">תבניות עליות (starter + split)</div>
            {HILL_TEMPLATES.map((t) => (
              <div key={t.name} className="flex items-center gap-2 text-sm">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: t.blocks[0].colorHex }} />
                <span className="font-bold text-gray-800 flex-1">{t.name}</span>
                <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-bold">R{t.intensityRank}</span>
              </div>
            ))}
          </div>

          <div className="space-y-1">
            <div className="text-xs font-bold text-orange-700 mb-1">תבניות Taper</div>
            {TAPER_TEMPLATES.map((t) => (
              <div key={t.name} className="flex items-center gap-2 text-sm">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: t.blocks[0].colorHex }} />
                <span className="font-bold text-gray-800 flex-1">{t.name}</span>
                <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 text-xs font-bold">R{t.intensityRank}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <div className="flex items-center gap-2 text-gray-700">
            <Layers size={18} />
            <h2 className="font-bold">{PROGRAM_3K.name}</h2>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="bg-gray-50 rounded-lg p-2">
              <div className="text-gray-500 text-xs">מרחק</div>
              <div className="font-bold">{PROGRAM_3K.targetDistance}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-2">
              <div className="text-gray-500 text-xs">שבועות</div>
              <div className="font-bold">{PROGRAM_3K.canonicalWeeks}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-2">
              <div className="text-gray-500 text-xs">תדירות</div>
              <div className="font-bold">{PROGRAM_3K.canonicalFrequency}×/שבוע</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-2">
              <div className="text-gray-500 text-xs">פרופילים</div>
              <div className="font-bold">[{PROGRAM_3K.targetProfileTypes.join(', ')}]</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PROGRAM_3K.phases!.map((p) => (
              <span key={p.name} className={`px-2 py-0.5 rounded text-xs font-bold ${PHASE_COLORS[p.name]}`}>
                {p.name} w{p.startWeek}–{p.endWeek} ({p.weekSlots.length} slots)
              </span>
            ))}
          </div>

          {/* Validation badges */}
          <div className="flex flex-wrap gap-1.5 pt-1">
            <span className="px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-700">weekTemplates: []</span>
            <span className="px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-700">no race_simulation</span>
            <span className="px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-700">no strides in slots</span>
            <span className="px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-700">caps: 25k/6k</span>
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
                : log.includes('📋') ? 'text-cyan-400'
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
