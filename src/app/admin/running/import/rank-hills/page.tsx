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
  Mountain,
} from 'lucide-react';
import {
  getRunWorkoutTemplates,
  updateRunWorkoutTemplate,
  getRunProgramTemplates,
  updateRunProgramTemplate,
} from '@/features/workout-engine/core/services/running-admin.service';
import type {
  RunWorkoutTemplate,
  RunProgramTemplate,
  WorkoutCategory,
} from '@/features/workout-engine/core/types/running.types';

const HILL_CATEGORIES: WorkoutCategory[] = ['hill_short', 'hill_sprints', 'hill_long'];
const FARTLEK_CATEGORY: WorkoutCategory = 'fartlek_structured';
const HILL_ONLY_CATEGORIES: WorkoutCategory[] = ['hill_short', 'hill_sprints'];

function computeHillIntensityRank(template: RunWorkoutTemplate): number {
  const runBlocks = template.blocks.filter(
    (b) => b.type === 'run' || b.type === 'interval' || b.type === 'sprint',
  );
  if (runBlocks.length === 0) return 2;

  let maxDuration = 0;
  let maxDistance = 0;
  let totalReps = 0;

  for (const block of runBlocks) {
    totalReps += block.sets;
    if (block.measureBy === 'time' && block.baseValue > maxDuration) {
      maxDuration = block.baseValue;
    }
    if (block.measureBy === 'distance' && block.baseValue > maxDistance) {
      maxDistance = block.baseValue;
    }
  }

  // Long hills (2min+ reps) → 3.0 to 4.0
  if (maxDuration >= 180) return 4.0;
  if (maxDuration >= 120) return 3.0;
  // 300m+ distance → 3.0
  if (maxDistance >= 300) return 3.0;

  // Medium hills (30-60s reps): ranked by total reps
  // 6x30s=1, 8x45s=2, 10x60s=3
  if (maxDuration >= 30) {
    if (totalReps >= 10) return 3.0;
    if (totalReps >= 8) return 2.0;
    return 1.0;
  }

  // Short/sprint hills (10-15s reps): ranked by total reps
  // 8x10s=1, 10x10s=2, 12x15s=3
  if (totalReps >= 12) return 3.0;
  if (totalReps >= 10) return 2.0;
  return 1.0;
}

const FARTLEK_SHORT_KEYWORDS = ['15/15', '30/30', '200/200', 'micro', 'מיקרו'];
const FARTLEK_LONG_KEYWORDS = ['1000', 'mile', 'pyramid', 'פירמידה', '1-2-3-4', 'מייל'];

function computeFartlekIntensityRank(template: RunWorkoutTemplate): number {
  const name = (template.name ?? '').toLowerCase();

  if (FARTLEK_SHORT_KEYWORDS.some((kw) => name.includes(kw))) return 1;
  if (FARTLEK_LONG_KEYWORDS.some((kw) => name.includes(kw))) return 3;

  const runBlocks = template.blocks.filter(
    (b) => b.type === 'run' || b.type === 'interval' || b.type === 'sprint' || b.type === 'float',
  );
  if (runBlocks.length === 0) return 2;

  let maxDuration = 0;
  let maxDistance = 0;

  for (const block of runBlocks) {
    if (block.measureBy === 'time' && block.baseValue > maxDuration) {
      maxDuration = block.baseValue;
    }
    if (block.measureBy === 'distance' && block.baseValue > maxDistance) {
      maxDistance = block.baseValue;
    }
  }

  if (maxDistance >= 800 || maxDuration >= 180) return 3;
  if (maxDistance >= 400 || maxDuration >= 60) return 2;
  return 1;
}

const RANK_LABELS: Record<number, string> = {
  1: 'קל / קצר',
  1.2: 'קל+',
  1.5: 'קל-בינוני',
  1.8: 'בינוני-',
  2: 'בינוני',
  2.5: 'בינוני-קשה (נפח גבוה)',
  3: 'קשה / ארוך',
  4: 'עליות ארוכות (2 דק+)',
};

const RANK_COLORS: Record<number, string> = {
  1: 'bg-emerald-100 text-emerald-700',
  1.2: 'bg-emerald-100 text-emerald-700',
  1.5: 'bg-lime-100 text-lime-700',
  1.8: 'bg-yellow-100 text-yellow-700',
  2: 'bg-amber-100 text-amber-700',
  2.5: 'bg-orange-100 text-orange-700',
  3: 'bg-red-100 text-red-700',
  4: 'bg-red-200 text-red-800',
};

type Stage = 'idle' | 'scanning' | 'preview' | 'updating' | 'done';

interface RankPreview {
  template: RunWorkoutTemplate;
  currentRank: number | undefined;
  newRank: number;
  changed: boolean;
  blockSummary: string;
  group: 'hill' | 'fartlek';
}

interface FartlekProfileIssue {
  template: RunWorkoutTemplate;
  currentProfiles: number[];
  needsFix: boolean;
}

interface ProgramPatch {
  program: RunProgramTemplate;
  phaseIndex: number;
  slotId: string;
  currentCategories: WorkoutCategory[];
  newCategories: WorkoutCategory[];
  changed: boolean;
}

export default function RankHillsPage() {
  const [stage, setStage] = useState<Stage>('idle');
  const [rankPreviews, setRankPreviews] = useState<RankPreview[]>([]);
  const [fartlekProfileIssues, setFartlekProfileIssues] = useState<FartlekProfileIssue[]>([]);
  const [programPatches, setProgramPatches] = useState<ProgramPatch[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [result, setResult] = useState({ ranked: 0, profilesFixed: 0, programsPatched: 0, errors: 0 });

  const addLog = (msg: string) => setLogs((prev) => [...prev, msg]);

  const handleScan = async () => {
    setStage('scanning');
    setLogs([]);
    setRankPreviews([]);
    setFartlekProfileIssues([]);
    setProgramPatches([]);

    addLog('טוען תבניות אימון מ-Firestore...');
    const allTemplates = await getRunWorkoutTemplates();
    addLog(`נמצאו ${allTemplates.length} תבניות סה״כ`);

    const items: RankPreview[] = [];

    // --- Hill ranking ---
    const hills = allTemplates.filter(
      (t) => t.category && HILL_CATEGORIES.includes(t.category),
    );
    addLog(`\n🏔️ נמצאו ${hills.length} תבניות גבעות`);

    for (const t of hills) {
      const runBlocks = t.blocks.filter(
        (b) => b.type === 'run' || b.type === 'interval' || b.type === 'sprint',
      );
      const descriptions = runBlocks.map((b) =>
        b.measureBy === 'distance' ? `${b.baseValue}m×${b.sets}` : `${b.baseValue}s×${b.sets}`,
      );
      const newRank = computeHillIntensityRank(t);
      const changed = t.intensityRank !== newRank;
      items.push({ template: t, currentRank: t.intensityRank, newRank, changed, blockSummary: descriptions.join(' + ') || '—', group: 'hill' });
      addLog(`${changed ? '⚠' : '✓'} "${t.name}" (${t.category}) — ${descriptions.join(' + ')} → rank ${newRank}${changed ? ` (was ${t.intensityRank ?? '—'})` : ''}`);
    }

    // --- Fartlek ranking ---
    const fartleks = allTemplates.filter((t) => t.category === FARTLEK_CATEGORY);
    addLog(`\n🏃 נמצאו ${fartleks.length} תבניות fartlek_structured`);

    const profileIssues: FartlekProfileIssue[] = [];
    let profileBroken = 0;

    for (const t of fartleks) {
      const runBlocks = t.blocks.filter(
        (b) => b.type === 'run' || b.type === 'interval' || b.type === 'sprint' || b.type === 'float',
      );
      const descriptions = runBlocks.map((b) =>
        b.measureBy === 'distance' ? `${b.baseValue}m×${b.sets}` : `${b.baseValue}s×${b.sets}`,
      );
      const newRank = computeFartlekIntensityRank(t);
      const changed = t.intensityRank !== newRank;
      items.push({ template: t, currentRank: t.intensityRank, newRank, changed, blockSummary: descriptions.join(' + ') || '—', group: 'fartlek' });
      addLog(`${changed ? '⚠' : '✓'} "${t.name}" → rank ${newRank}${changed ? ` (was ${t.intensityRank ?? '—'})` : ''}`);

      const profiles = t.targetProfileTypes ?? [];
      const hasAdvanced = profiles.includes(1 as never) || profiles.includes(2 as never);
      if (!hasAdvanced) {
        profileBroken++;
        profileIssues.push({ template: t, currentProfiles: profiles, needsFix: true });
        addLog(`✗ "${t.name}" — profiles=[${profiles.join(', ')}] — חסר Profile 1/2!`);
      } else {
        profileIssues.push({ template: t, currentProfiles: profiles, needsFix: false });
      }
    }

    if (profileBroken === 0) {
      addLog('✓ כל תבניות ה-Fartlek כבר כוללות Profile 1 או 2');
    } else {
      addLog(`⚠ ${profileBroken} תבניות Fartlek חסרות Profile 1/2 ויתוקנו`);
    }

    // --- Program phase patching (base phase → hills only for quality_secondary) ---
    addLog('\n📋 בודק תוכניות — נעילת גבעות בפאזת Base...');
    const allPrograms = await getRunProgramTemplates();
    addLog(`נמצאו ${allPrograms.length} תוכניות`);

    const patches: ProgramPatch[] = [];

    for (const prog of allPrograms) {
      if (!prog.phases?.length) continue;
      for (let pi = 0; pi < prog.phases.length; pi++) {
        const phase = prog.phases[pi];
        if (phase.name !== 'base') continue;

        for (const slot of phase.weekSlots) {
          if (slot.slotType !== 'quality_secondary') continue;

          const current = slot.allowedCategories ?? [];
          const hasNonHill = current.some((c) => !HILL_ONLY_CATEGORIES.includes(c));

          if (hasNonHill || current.length === 0) {
            patches.push({
              program: prog,
              phaseIndex: pi,
              slotId: slot.id,
              currentCategories: current,
              newCategories: [...HILL_ONLY_CATEGORIES],
              changed: true,
            });
            addLog(`⚠ "${prog.name}" → base phase, slot "${slot.id}": [${current.join(', ')}] → [${HILL_ONLY_CATEGORIES.join(', ')}]`);
          } else {
            addLog(`✓ "${prog.name}" → base phase, slot "${slot.id}": כבר מוגבל לגבעות`);
          }
        }
      }
    }

    setRankPreviews(items);
    setFartlekProfileIssues(profileIssues);
    setProgramPatches(patches);
    setStage('preview');
  };

  const handleApply = async () => {
    setStage('updating');
    let ranked = 0;
    let profilesFixed = 0;
    let programsPatched = 0;
    let errors = 0;

    // Update intensity ranks (hills + fartleks)
    const toRank = rankPreviews.filter((r) => r.changed);
    addLog(`\n🎯 מעדכן ${toRank.length} תבניות עם intensityRank...`);

    for (const item of toRank) {
      try {
        const ok = await updateRunWorkoutTemplate(item.template.id, {
          intensityRank: item.newRank,
        } as Partial<RunWorkoutTemplate>);
        if (ok) {
          ranked++;
          addLog(`✓ "${item.template.name}" → intensityRank: ${item.newRank}`);
        } else {
          errors++;
          addLog(`✗ שגיאה בעדכון "${item.template.name}"`);
        }
      } catch (err) {
        errors++;
        addLog(`✗ ${(err as Error).message}`);
      }
    }

    // Fix fartlek profiles
    const profilesToFix = fartlekProfileIssues.filter((f) => f.needsFix);
    if (profilesToFix.length > 0) {
      addLog(`\n🏃 מתקן ${profilesToFix.length} תבניות Fartlek → profiles [1, 2]...`);
      for (const item of profilesToFix) {
        try {
          const merged = Array.from(new Set([...item.currentProfiles, 1, 2])).sort();
          const ok = await updateRunWorkoutTemplate(item.template.id, {
            targetProfileTypes: merged,
          } as Partial<RunWorkoutTemplate>);
          if (ok) {
            profilesFixed++;
            addLog(`✓ "${item.template.name}" → profiles [${merged.join(', ')}]`);
          } else {
            errors++;
            addLog(`✗ שגיאה בעדכון "${item.template.name}"`);
          }
        } catch (err) {
          errors++;
          addLog(`✗ ${(err as Error).message}`);
        }
      }
    }

    // Patch program phases
    if (programPatches.length > 0) {
      addLog(`\n📋 מעדכן ${programPatches.length} סלוטים בתוכניות...`);
      for (const patch of programPatches) {
        try {
          const prog = patch.program;
          const updatedPhases = [...(prog.phases ?? [])];
          const phase = { ...updatedPhases[patch.phaseIndex] };
          phase.weekSlots = phase.weekSlots.map((s) =>
            s.id === patch.slotId ? { ...s, allowedCategories: patch.newCategories } : s,
          );
          updatedPhases[patch.phaseIndex] = phase;

          const ok = await updateRunProgramTemplate(prog.id, {
            phases: updatedPhases,
          } as Partial<RunProgramTemplate>);
          if (ok) {
            programsPatched++;
            addLog(`✓ "${prog.name}" → base slot "${patch.slotId}" → [${patch.newCategories.join(', ')}]`);
          } else {
            errors++;
            addLog(`✗ שגיאה בעדכון תוכנית "${prog.name}"`);
          }
        } catch (err) {
          errors++;
          addLog(`✗ ${(err as Error).message}`);
        }
      }
    }

    setResult({ ranked, profilesFixed, programsPatched, errors });
    addLog(`\n✓ הושלם: ${ranked} דירוגים, ${profilesFixed} פרופילים, ${programsPatched} תוכניות, ${errors} שגיאות`);
    setStage('done');
  };

  const rankChangedCount = rankPreviews.filter((r) => r.changed).length;
  const profileFixCount = fartlekProfileIssues.filter((f) => f.needsFix).length;
  const patchCount = programPatches.filter((p) => p.changed).length;
  const totalActions = rankChangedCount + profileFixCount + patchCount;

  const hillItems = rankPreviews.filter((r) => r.group === 'hill');
  const fartlekItems = rankPreviews.filter((r) => r.group === 'fartlek');

  return (
    <div className="max-w-5xl space-y-6" dir="rtl">
      <div>
        <Link
          href="/admin/running/workouts"
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-2"
        >
          <ArrowRight size={18} /> חזור לתבניות
        </Link>
        <h1 className="text-3xl font-black text-gray-900">
          דירוג עוצמה + נעילת גבעות + תיקון Fartlek
        </h1>
        <p className="text-gray-500 mt-1">
          מגדיר <code className="bg-gray-100 px-1 rounded">intensityRank</code>{' '}
          (1-3) לגבעות ופארטלקים, נועל גבעות בפאזת Base, ומוודא Fartlek כולל Profile 1/2.
        </p>
      </div>

      {/* --- Scan Button --- */}
      {stage === 'idle' && (
        <button
          onClick={handleScan}
          className="flex items-center gap-2 px-6 py-3 bg-cyan-500 text-white rounded-xl font-bold hover:bg-cyan-600"
        >
          <Mountain size={18} /> סרוק הכל
        </button>
      )}

      {stage === 'scanning' && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-cyan-500" size={40} />
          <p className="text-gray-600 font-bold">סורק תבניות ותוכניות...</p>
        </div>
      )}

      {/* --- Preview --- */}
      {stage === 'preview' && (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-center">
              <div className="text-2xl font-black text-orange-600">{hillItems.length}</div>
              <div className="text-xs text-orange-700 font-bold">גבעות</div>
            </div>
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 text-center">
              <div className="text-2xl font-black text-purple-600">{fartlekItems.length}</div>
              <div className="text-xs text-purple-700 font-bold">Fartlek</div>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
              <div className="text-2xl font-black text-emerald-600">{rankChangedCount}</div>
              <div className="text-xs text-emerald-700 font-bold">יקבלו דירוג</div>
            </div>
            <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-4 text-center">
              <div className="text-2xl font-black text-cyan-600">{patchCount}</div>
              <div className="text-xs text-cyan-700 font-bold">תוכניות לעדכון</div>
            </div>
          </div>

          {/* Hill table */}
          {hillItems.length > 0 && (
            <RankTable title="🏔️ גבעות" color="orange" items={hillItems} />
          )}

          {/* Fartlek table */}
          {fartlekItems.length > 0 && (
            <RankTable title="🏃 Fartlek" color="purple" items={fartlekItems} />
          )}

          {/* Fartlek profile issues */}
          {profileFixCount > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 bg-red-50 border-b border-red-100">
                <h2 className="font-black text-red-800">⚠ Fartlek חסרי Profile 1/2</h2>
              </div>
              <div className="max-h-48 overflow-y-auto">
                <table className="w-full text-right text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-2 font-bold text-gray-700">שם</th>
                      <th className="px-4 py-2 font-bold text-gray-700">פרופילים</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {fartlekProfileIssues.filter((f) => f.needsFix).map((f) => (
                      <tr key={f.template.id} className="bg-red-50/50">
                        <td className="px-4 py-2 font-bold text-gray-800">{f.template.name}</td>
                        <td className="px-4 py-2 font-mono text-xs text-gray-600">[{f.currentProfiles.join(', ')}] → [1, 2]</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Program patches */}
          {programPatches.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 bg-cyan-50 border-b border-cyan-100">
                <h2 className="font-black text-cyan-800">📋 נעילת גבעות בפאזת Base</h2>
              </div>
              <div className="max-h-48 overflow-y-auto">
                <table className="w-full text-right text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-2 font-bold text-gray-700">תוכנית</th>
                      <th className="px-4 py-2 font-bold text-gray-700">סלוט</th>
                      <th className="px-4 py-2 font-bold text-gray-700">נוכחי</th>
                      <th className="px-4 py-2 font-bold text-gray-700">חדש</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {programPatches.map((p, i) => (
                      <tr key={i} className={p.changed ? 'bg-cyan-50/50' : ''}>
                        <td className="px-4 py-2 font-bold text-gray-800">{p.program.name}</td>
                        <td className="px-4 py-2 text-xs font-mono text-gray-600">{p.slotId}</td>
                        <td className="px-4 py-2 text-xs text-gray-500">[{p.currentCategories.join(', ')}]</td>
                        <td className="px-4 py-2">
                          <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 text-xs font-bold">
                            [{p.newCategories.join(', ')}]
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleApply}
              disabled={totalActions === 0}
              className="flex items-center gap-2 px-6 py-3 bg-emerald-500 text-white rounded-xl font-bold hover:bg-emerald-600 disabled:opacity-50"
            >
              <Play size={18} /> בצע {totalActions} עדכונים
            </button>
            <button
              onClick={() => { setStage('idle'); setLogs([]); setRankPreviews([]); setFartlekProfileIssues([]); setProgramPatches([]); }}
              className="px-4 py-3 text-gray-600 hover:text-gray-900 font-bold"
            >
              בטל
            </button>
          </div>
        </div>
      )}

      {/* --- Updating --- */}
      {stage === 'updating' && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-emerald-500" size={40} />
          <p className="text-gray-600 font-bold">מעדכן...</p>
        </div>
      )}

      {/* --- Done --- */}
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
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-orange-50 rounded-xl p-4 text-center">
              <div className="text-2xl font-black text-orange-600">{result.ranked}</div>
              <div className="text-xs text-orange-700 font-bold">דירוגים</div>
            </div>
            <div className="bg-purple-50 rounded-xl p-4 text-center">
              <div className="text-2xl font-black text-purple-600">{result.profilesFixed}</div>
              <div className="text-xs text-purple-700 font-bold">פרופילים</div>
            </div>
            <div className="bg-cyan-50 rounded-xl p-4 text-center">
              <div className="text-2xl font-black text-cyan-600">{result.programsPatched}</div>
              <div className="text-xs text-cyan-700 font-bold">תוכניות</div>
            </div>
            <div className={`rounded-xl p-4 text-center ${result.errors > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
              <div className={`text-2xl font-black ${result.errors > 0 ? 'text-red-600' : 'text-gray-400'}`}>{result.errors}</div>
              <div className="text-xs text-gray-600 font-bold">שגיאות</div>
            </div>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={() => { setStage('idle'); setLogs([]); setRankPreviews([]); setFartlekProfileIssues([]); setProgramPatches([]); setResult({ ranked: 0, profilesFixed: 0, programsPatched: 0, errors: 0 }); }}
              className="flex items-center gap-2 px-6 py-3 bg-cyan-500 text-white rounded-xl font-bold hover:bg-cyan-600"
            >
              סריקה חוזרת
            </button>
            <Link href="/admin/running/workouts" className="px-4 py-3 text-gray-600 hover:text-gray-900 font-bold">
              עבור לתבניות
            </Link>
          </div>
        </div>
      )}

      {/* --- Log --- */}
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
                : log.includes('🏔️') || log.includes('🏃') || log.includes('📋') || log.includes('🎯') ? 'text-cyan-400'
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

function RankTable({ title, color, items }: { title: string; color: string; items: RankPreview[] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className={`px-4 py-3 bg-${color}-50 border-b border-${color}-100`}>
        <h2 className={`font-black text-${color}-800`}>{title} — intensityRank</h2>
      </div>
      <div className="max-h-72 overflow-y-auto">
        <table className="w-full text-right text-sm">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              <th className="px-4 py-2 font-bold text-gray-700">שם</th>
              <th className="px-4 py-2 font-bold text-gray-700">קטגוריה</th>
              <th className="px-4 py-2 font-bold text-gray-700">בלוקים</th>
              <th className="px-4 py-2 font-bold text-gray-700">נוכחי</th>
              <th className="px-4 py-2 font-bold text-gray-700">חדש</th>
              <th className="px-4 py-2 font-bold text-gray-700">סטטוס</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((h) => (
              <tr key={h.template.id} className={h.changed ? `bg-${color}-50/50` : ''}>
                <td className="px-4 py-2 font-bold text-gray-800">{h.template.name}</td>
                <td className="px-4 py-2">
                  <span className={`px-2 py-0.5 rounded-full bg-${color}-50 text-${color}-700 text-xs font-bold`}>
                    {h.template.category}
                  </span>
                </td>
                <td className="px-4 py-2 text-xs font-mono text-gray-600">{h.blockSummary}</td>
                <td className="px-4 py-2">
                  {h.currentRank != null ? (
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${RANK_COLORS[h.currentRank] ?? 'bg-gray-100 text-gray-600'}`}>
                      {h.currentRank}
                    </span>
                  ) : (
                    <span className="text-gray-300 text-xs">—</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${RANK_COLORS[h.newRank]}`}>
                    {h.newRank} — {RANK_LABELS[h.newRank]}
                  </span>
                </td>
                <td className="px-4 py-2">
                  {h.changed ? (
                    <span className={`px-2 py-0.5 rounded-full bg-${color}-100 text-${color}-700 text-xs font-bold`}>עדכון</span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-xs font-bold">תקין</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
