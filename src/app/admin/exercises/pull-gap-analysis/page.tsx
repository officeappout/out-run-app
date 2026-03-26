'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';
import { getAllExercises } from '@/features/content/exercises/core/exercise.service';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';
import { resolveToSlug } from '@/features/workout-engine/services/program-hierarchy.utils';
import Link from 'next/link';

interface ExerciseRow {
  id: string;
  name: string;
  movementGroup: string;
  levels: { program: string; slug: string; level: number }[];
  maxLevel: number;
  equipment: string[];
  hasVideo: boolean;
  hasParkVideo: boolean;
  parkVideoUrl: string;
  methodLocations: string[];
}

interface SimulationResult {
  step: string;
  detail: string;
  type: 'info' | 'warn' | 'error' | 'success';
}

const MG_TO_DOMAIN: Record<string, string> = {
  vertical_pull: 'pull',
  horizontal_pull: 'pull',
  vertical_push: 'push',
  horizontal_push: 'push',
  squat: 'legs',
  hinge: 'legs',
  lunge: 'legs',
  core: 'core',
  anti_extension: 'core',
  anti_rotation: 'core',
};

export default function PullGapAnalysisPage() {
  const [loading, setLoading] = useState(true);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [horizontalPulls, setHorizontalPulls] = useState<ExerciseRow[]>([]);
  const [verticalPulls, setVerticalPulls] = useState<ExerciseRow[]>([]);
  const [horizontalPushes, setHorizontalPushes] = useState<ExerciseRow[]>([]);
  const [verticalPushes, setVerticalPushes] = useState<ExerciseRow[]>([]);
  const [allGroups, setAllGroups] = useState<Record<string, ExerciseRow[]>>({});
  const [simulationLog, setSimulationLog] = useState<SimulationResult[]>([]);
  const [userLevel, setUserLevel] = useState(19);

  useEffect(() => {
    loadAndAnalyze();
  }, []);

  const getName = (ex: Exercise): string => {
    if (typeof ex.name === 'string') return ex.name;
    return (ex.name as any)?.he ?? (ex.name as any)?.en ?? ex.id;
  };

  const toRow = (ex: Exercise): ExerciseRow => {
    const tps = ex.targetPrograms ?? [];
    const levels = tps.map(tp => {
      let slug = tp.programId;
      try { slug = resolveToSlug(tp.programId); } catch {}
      return { program: tp.programId, slug, level: tp.level };
    });
    const maxLevel = levels.length > 0 ? Math.max(...levels.map(l => l.level)) : 0;

    const methods = ex.execution_methods ?? ex.executionMethods ?? [];
    const methodLocations = methods.map(m => m.location).filter(Boolean);

    const hasVideo = !!(
      ex.media?.videoUrl ||
      methods.some(m => m.media?.mainVideoUrl)
    );

    const parkMethod = methods.find(m => m.location === 'park');
    const hasParkVideo = !!(parkMethod?.media?.mainVideoUrl);
    const parkVideoUrl = parkMethod?.media?.mainVideoUrl ?? '';

    return {
      id: ex.id,
      name: getName(ex),
      movementGroup: ex.movementGroup ?? 'none',
      levels,
      maxLevel,
      equipment: ex.equipment ?? [],
      hasVideo,
      hasParkVideo,
      parkVideoUrl,
      methodLocations,
    };
  };

  const loadAndAnalyze = async () => {
    setLoading(true);
    try {
      const allExercises = await getAllExercises();
      setExercises(allExercises);

      const grouped: Record<string, ExerciseRow[]> = {};
      for (const ex of allExercises) {
        const mg = ex.movementGroup ?? 'none';
        if (!grouped[mg]) grouped[mg] = [];
        grouped[mg].push(toRow(ex));
      }

      for (const mg of Object.keys(grouped)) {
        grouped[mg].sort((a, b) => b.maxLevel - a.maxLevel);
      }

      setAllGroups(grouped);
      setHorizontalPulls(grouped['horizontal_pull'] ?? []);
      setVerticalPulls(grouped['vertical_pull'] ?? []);
      setHorizontalPushes(grouped['horizontal_push'] ?? []);
      setVerticalPushes(grouped['vertical_push'] ?? []);
    } catch (error) {
      console.error('Error loading exercises:', error);
    } finally {
      setLoading(false);
    }
  };

  const simulateGroup = (
    targetGroup: string,
    domain: string,
    domainLevel: number,
    log: SimulationResult[],
  ) => {
    const RADII = [2, 4, 6] as const;

    const groupExercises = exercises.filter(ex => ex.movementGroup === targetGroup);
    log.push({ step: `${targetGroup}`, detail: `─── ${targetGroup} (domain=${domain}, L${domainLevel}) ───`, type: 'info' });
    log.push({ step: 'Pool Size', detail: `${groupExercises.length} exercises in database`, type: 'info' });

    if (groupExercises.length === 0) {
      log.push({ step: 'CRITICAL', detail: `NO ${targetGroup} exercises exist!`, type: 'error' });
      return;
    }

    const levelBuckets: Record<number, string[]> = {};
    for (const ex of groupExercises) {
      for (const tp of (ex.targetPrograms ?? [])) {
        if (!levelBuckets[tp.level]) levelBuckets[tp.level] = [];
        levelBuckets[tp.level].push(getName(ex));
      }
    }

    const sortedLevels = Object.keys(levelBuckets).map(Number).sort((a, b) => a - b);
    log.push({ step: 'Level Range', detail: `Levels: ${sortedLevels.join(', ')}. Max: L${Math.max(...sortedLevels)}`, type: 'info' });

    for (const lvl of sortedLevels) {
      const gap = Math.abs(lvl - domainLevel);
      log.push({
        step: `L${lvl}`,
        detail: `${levelBuckets[lvl].length} ex: ${levelBuckets[lvl].join(', ')}`,
        type: gap <= 2 ? 'success' : gap <= 4 ? 'warn' : gap <= 6 ? 'info' : 'error',
      });
    }

    // Simulate findLevelAppropriateSubstitute (progressive radius)
    log.push({ step: 'Engine Sim', detail: '─── findLevelAppropriateSubstitute (LIVE logic) ───', type: 'info' });

    type Flat = { name: string; level: number; gap: number; id: string };
    const allFlat: Flat[] = groupExercises.flatMap(ex =>
      (ex.targetPrograms ?? []).map(tp => ({
        name: getName(ex),
        level: tp.level,
        gap: Math.abs(tp.level - domainLevel),
        id: ex.id,
      })),
    );

    let picked: Flat | null = null;
    let pickedRadius = 0;

    for (const radius of RADII) {
      const inRange = allFlat.filter(c => c.gap <= radius);
      if (inRange.length === 0) {
        log.push({ step: `±${radius}`, detail: `0 candidates — expanding radius`, type: 'warn' });
        continue;
      }

      inRange.sort((a, b) => {
        if (a.gap !== b.gap) return a.gap - b.gap;
        return b.level - a.level;
      });

      picked = inRange[0];
      pickedRadius = radius;

      const top5 = inRange.slice(0, 5);
      log.push({
        step: `±${radius} FOUND`,
        detail: `${inRange.length} candidates. Top 5: ${top5.map((c, i) => `${i + 1}. "${c.name}" L${c.level} (gap=${c.gap})`).join(' | ')}`,
        type: 'success',
      });
      break;
    }

    if (picked) {
      log.push({
        step: 'RESULT',
        detail: `Engine picks "${picked.name}" at L${picked.level} (gap=${picked.gap}, radius=±${pickedRadius})`,
        type: 'success',
      });
      const worstCase = allFlat.reduce((worst, c) => c.gap > worst.gap ? c : worst, allFlat[0]);
      if (worstCase && worstCase.gap > 6) {
        log.push({
          step: 'OLD LOGIC',
          detail: `Old score-only logic could have picked "${worstCase.name}" at L${worstCase.level} (gap=${worstCase.gap}!)`,
          type: 'error',
        });
      }
    } else {
      log.push({
        step: 'SKIP',
        detail: `No candidate within ±6 of L${domainLevel}. Guarantee skipped (data safety).`,
        type: 'warn',
      });
    }
  };

  const runSimulation = () => {
    const log: SimulationResult[] = [];
    const domainLevel = userLevel;

    log.push({ step: 'Config', detail: `userLevel=${userLevel}, location=park, progressive radius=±2→±4→±6, hard limit=±6`, type: 'info' });

    simulateGroup('horizontal_pull', 'pull', domainLevel, log);
    simulateGroup('horizontal_push', 'push', domainLevel, log);
    simulateGroup('vertical_pull', 'pull', domainLevel, log);
    simulateGroup('vertical_push', 'push', domainLevel, log);

    setSimulationLog(log);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">טוען תרגילים...</div>
      </div>
    );
  }

  const totalExercises = exercises.length;
  const withMG = exercises.filter(e => e.movementGroup).length;

  return (
    <div className="space-y-6 p-6 text-slate-900" dir="rtl">
      <div className="flex items-center justify-between bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Movement Gap Analysis — Level-Aware Engine</h1>
          <p className="text-gray-500 mt-1">ניתוח פערי רמות עבור Pull ו-Push (horizontal + vertical)</p>
        </div>
        <Link href="/admin/exercises" className="px-4 py-2 bg-gray-200 text-gray-700 rounded-xl font-bold hover:bg-gray-300">
          חזרה לתרגילים
        </Link>
      </div>

      {/* Overview */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
        <h2 className="text-lg font-black text-gray-900 mb-4">סקירה כללית</h2>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
          <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
            <div className="text-3xl font-black text-blue-700">{totalExercises}</div>
            <div className="text-sm text-blue-600 font-bold">סה"כ תרגילים</div>
          </div>
          <div className="bg-purple-50 rounded-xl p-4 border border-purple-200">
            <div className="text-3xl font-black text-purple-700">{withMG}</div>
            <div className="text-sm text-purple-600 font-bold">עם movementGroup</div>
          </div>
          <div className="bg-cyan-50 rounded-xl p-4 border border-cyan-200">
            <div className="text-3xl font-black text-cyan-700">{horizontalPulls.length}</div>
            <div className="text-sm text-cyan-600 font-bold">horizontal_pull</div>
          </div>
          <div className="bg-green-50 rounded-xl p-4 border border-green-200">
            <div className="text-3xl font-black text-green-700">{verticalPulls.length}</div>
            <div className="text-sm text-green-600 font-bold">vertical_pull</div>
          </div>
          <div className="bg-orange-50 rounded-xl p-4 border border-orange-200">
            <div className="text-3xl font-black text-orange-700">{horizontalPushes.length}</div>
            <div className="text-sm text-orange-600 font-bold">horizontal_push</div>
          </div>
          <div className="bg-rose-50 rounded-xl p-4 border border-rose-200">
            <div className="text-3xl font-black text-rose-700">{verticalPushes.length}</div>
            <div className="text-sm text-rose-600 font-bold">vertical_push</div>
          </div>
        </div>
      </div>

      {/* Movement Group Summary */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
        <h2 className="text-lg font-black text-gray-900 mb-4">התפלגות לפי קבוצת תנועה</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {Object.entries(allGroups).sort((a, b) => b[1].length - a[1].length).map(([mg, exs]) => {
            const maxLvl = exs.length > 0 ? Math.max(...exs.map(e => e.maxLevel)) : 0;
            return (
              <div key={mg} className={`rounded-xl p-3 border ${mg === 'horizontal_pull' ? 'bg-red-50 border-red-300' : mg === 'vertical_pull' ? 'bg-amber-50 border-amber-300' : 'bg-gray-50 border-gray-200'}`}>
                <div className="font-bold text-sm">{mg}</div>
                <div className="text-xs text-gray-500">{exs.length} exercises, max L{maxLvl}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Horizontal Pull Detail */}
      <div className="bg-white rounded-2xl border border-red-200 p-6 shadow-sm">
        <h2 className="text-lg font-black text-red-700 mb-4">horizontal_pull — כל התרגילים לפי רמה</h2>
        {horizontalPulls.length === 0 ? (
          <p className="text-red-600 font-bold">אין תרגילי horizontal_pull במאגר!</p>
        ) : (
          <table className="w-full text-right text-sm">
            <thead className="bg-red-50 border-b border-red-200">
              <tr>
                <th className="px-4 py-3 font-bold text-red-700">שם</th>
                <th className="px-4 py-3 font-bold text-red-700">רמה מקס</th>
                <th className="px-4 py-3 font-bold text-red-700">רמות</th>
                <th className="px-4 py-3 font-bold text-red-700">מיקומים</th>
                <th className="px-4 py-3 font-bold text-red-700">וידאו כללי</th>
                <th className="px-4 py-3 font-bold text-red-700">וידאו פארק</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-red-100">
              {horizontalPulls.map(ex => (
                <tr key={ex.id} className={`hover:bg-red-50/50 ${ex.maxLevel >= userLevel - 2 && ex.maxLevel <= userLevel + 2 ? 'bg-green-50' : ex.maxLevel >= userLevel - 6 ? 'bg-yellow-50' : ''}`}>
                  <td className="px-4 py-3 font-bold">{ex.name}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${ex.maxLevel >= userLevel - 2 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      L{ex.maxLevel}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {ex.levels.map((l, i) => (
                      <span key={i} className="inline-block ml-2 px-1.5 py-0.5 bg-gray-100 rounded">
                        {l.slug}:L{l.level}
                      </span>
                    ))}
                    {ex.levels.length === 0 && <span className="text-gray-400">ללא targetPrograms</span>}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {ex.methodLocations.length > 0
                      ? ex.methodLocations.map((loc, i) => (
                          <span key={i} className={`inline-block ml-1 px-1.5 py-0.5 rounded ${loc === 'park' ? 'bg-green-100 text-green-700 font-bold' : 'bg-gray-100'}`}>
                            {loc}
                          </span>
                        ))
                      : <span className="text-gray-400">ללא methods</span>}
                  </td>
                  <td className="px-4 py-3">{ex.hasVideo ? '✅' : '❌'}</td>
                  <td className="px-4 py-3">
                    {ex.hasParkVideo
                      ? <span className="text-green-600 font-bold">✅ Park</span>
                      : ex.methodLocations.includes('park')
                        ? <span className="text-orange-500 font-bold">⚠️ method exists, no video</span>
                        : <span className="text-red-500 font-bold">❌ no park method</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Vertical Pull Detail */}
      <div className="bg-white rounded-2xl border border-amber-200 p-6 shadow-sm">
        <h2 className="text-lg font-black text-amber-700 mb-4">vertical_pull — כל התרגילים לפי רמה</h2>
        {verticalPulls.length === 0 ? (
          <p className="text-amber-600 font-bold">אין תרגילי vertical_pull במאגר!</p>
        ) : (
          <table className="w-full text-right text-sm">
            <thead className="bg-amber-50 border-b border-amber-200">
              <tr>
                <th className="px-4 py-3 font-bold text-amber-700">שם</th>
                <th className="px-4 py-3 font-bold text-amber-700">רמה מקס</th>
                <th className="px-4 py-3 font-bold text-amber-700">רמות</th>
                <th className="px-4 py-3 font-bold text-amber-700">מיקומים</th>
                <th className="px-4 py-3 font-bold text-amber-700">וידאו כללי</th>
                <th className="px-4 py-3 font-bold text-amber-700">וידאו פארק</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-amber-100">
              {verticalPulls.map(ex => (
                <tr key={ex.id} className={`hover:bg-amber-50/50 ${ex.maxLevel >= userLevel - 2 && ex.maxLevel <= userLevel + 2 ? 'bg-green-50' : ex.maxLevel >= userLevel - 6 ? 'bg-yellow-50' : ''}`}>
                  <td className="px-4 py-3 font-bold">{ex.name}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${ex.maxLevel >= userLevel - 2 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      L{ex.maxLevel}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {ex.levels.map((l, i) => (
                      <span key={i} className="inline-block ml-2 px-1.5 py-0.5 bg-gray-100 rounded">
                        {l.slug}:L{l.level}
                      </span>
                    ))}
                    {ex.levels.length === 0 && <span className="text-gray-400">ללא targetPrograms</span>}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {ex.methodLocations.length > 0
                      ? ex.methodLocations.map((loc, i) => (
                          <span key={i} className={`inline-block ml-1 px-1.5 py-0.5 rounded ${loc === 'park' ? 'bg-green-100 text-green-700 font-bold' : 'bg-gray-100'}`}>
                            {loc}
                          </span>
                        ))
                      : <span className="text-gray-400">ללא methods</span>}
                  </td>
                  <td className="px-4 py-3">{ex.hasVideo ? '✅' : '❌'}</td>
                  <td className="px-4 py-3">
                    {ex.hasParkVideo
                      ? <span className="text-green-600 font-bold">✅ Park</span>
                      : ex.methodLocations.includes('park')
                        ? <span className="text-orange-500 font-bold">⚠️ method exists, no video</span>
                        : <span className="text-red-500 font-bold">❌ no park method</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Simulation */}
      <div className="bg-white rounded-2xl border border-indigo-200 p-6 shadow-sm">
        <h2 className="text-lg font-black text-indigo-700 mb-4">סימולציית Level-Aware Guarantee (Pull + Push)</h2>
        <div className="flex items-center gap-4 mb-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-bold">רמת משתמש:</label>
            <input type="number" value={userLevel} onChange={e => setUserLevel(Number(e.target.value))} className="w-20 px-3 py-2 border rounded-lg" />
          </div>
          <div className="text-xs text-gray-500 bg-gray-100 px-3 py-2 rounded-lg">
            Progressive: ±2 → ±4 → ±6 | Hard limit: gap &gt; 6 = skip
          </div>
          <button onClick={runSimulation} className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700">
            הרץ סימולציה
          </button>
        </div>

        {simulationLog.length > 0 && (
          <div className="space-y-1 font-mono text-sm max-h-[600px] overflow-y-auto bg-gray-50 border border-gray-200 text-gray-800 rounded-xl p-4">
            {simulationLog.map((entry, i) => (
              <div key={i} className={`flex gap-3 py-1 border-b border-gray-100 ${
                entry.type === 'error' ? 'text-red-600' :
                entry.type === 'warn' ? 'text-amber-700' :
                entry.type === 'success' ? 'text-emerald-700' :
                'text-gray-700'
              }`}>
                <span className="text-gray-400 w-48 shrink-0 text-left">[{entry.step}]</span>
                <span>{entry.detail}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Implementation Status */}
      <div className="bg-white rounded-2xl border border-emerald-200 p-6 shadow-sm">
        <h2 className="text-lg font-black text-emerald-700 mb-4">סטטוס תיקון — Level-Aware Guarantee (LIVE)</h2>
        <div className="space-y-4 text-sm leading-relaxed">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
            <h3 className="font-black text-emerald-700 mb-2">findLevelAppropriateSubstitute — פעיל</h3>
            <ol className="list-decimal list-inside space-y-2">
              <li><strong>חיפוש ב-globalExercisePool</strong> — הקטלוג המלא, לא רק filteredExercises.</li>
              <li><strong>רדיוס פרוגרסיבי:</strong> ±2 → ±4 → ±6. בכל רדיוס, מיון לפי קרבת רמה ל-domainLevel.</li>
              <li><strong>Hard Limit:</strong> פער &gt; 6 רמות = דילוג. עדיף אימון בלי horizontal מאשר תרגיל L3 למשתמש L19.</li>
              <li><strong>DavidRule משודרג:</strong> גם DavidRule משתמש באותו helper — רדיוס פרוגרסיבי במקום ±2 קבוע.</li>
              <li><strong>reasoning מלא:</strong> כל swap מתועד עם programLevel, levelDelta, radius.</li>
            </ol>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <h3 className="font-black text-blue-700 mb-2">Pipeline Order</h3>
            <ol className="list-decimal list-inside space-y-1">
              <li>Step 4d: <strong>DavidRule</strong> — rescues under-level exercises using progressive radius</li>
              <li>Step 5: Physiological Sort + Antagonist Pairing + Dedup</li>
              <li>Step 5d: <strong>HorizontalGuarantee</strong> — ensures h_push + h_pull using findLevelAppropriateSubstitute</li>
            </ol>
            <p className="mt-2 text-blue-600">Both steps use the same helper, so every injected exercise is level-protected.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
