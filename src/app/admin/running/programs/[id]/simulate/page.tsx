'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Loader2, Play, AlertTriangle, CheckCircle } from 'lucide-react';
import {
  getRunProgramTemplate,
  getRunWorkoutTemplates,
  getPaceMapConfig,
} from '@/features/workout-engine/core/services/running-admin.service';
import {
  generatePlan,
  formatPaceSeconds,
} from '@/features/workout-engine/core/services/running-engine.service';
import type { GeneratePlanResult } from '@/features/workout-engine/core/services/running-engine.service';
import { DEFAULT_PACE_MAP_CONFIG } from '@/features/workout-engine/core/config/pace-map-config';
import type {
  RunProgramTemplate,
  RunWorkoutTemplate,
  PaceMapConfig,
  PaceProfile,
  RunnerProfileType,
  WeekIntensityBreakdown,
} from '@/features/workout-engine/core/types/running.types';

export default function PlanSimulatorPage() {
  const params = useParams();
  const id = params?.id as string;

  const [template, setTemplate] = useState<RunProgramTemplate | null>(null);
  const [workoutTemplates, setWorkoutTemplates] = useState<RunWorkoutTemplate[]>([]);
  const [config, setConfig] = useState<PaceMapConfig>(DEFAULT_PACE_MAP_CONFIG);
  const [loading, setLoading] = useState(true);

  const [basePace, setBasePace] = useState(330);
  const [profileType, setProfileType] = useState<RunnerProfileType>(1);
  const [result, setResult] = useState<GeneratePlanResult | null>(null);
  const [simulating, setSimulating] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      getRunProgramTemplate(id),
      getRunWorkoutTemplates(),
      getPaceMapConfig(),
    ])
      .then(([t, w, c]) => {
        setTemplate(t);
        setWorkoutTemplates(w);
        setConfig(c);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const userProfile: PaceProfile = useMemo(() => ({
    basePace,
    profileType,
    qualityWorkoutsHistory: [],
    qualityWorkoutCount: 0,
    lastSelfCorrectionDate: null,
  }), [basePace, profileType]);

  const runSimulation = () => {
    if (!template) return;
    setSimulating(true);
    setTimeout(() => {
      const res = generatePlan(template, userProfile, config, workoutTemplates);
      setResult(res);
      setSimulating(false);
    }, 50);
  };

  // Volume data for the bar chart
  const weeklyVolumes = useMemo(() => {
    if (!result) return [];
    return result.plan.weeks.map((week) => {
      let totalMinutes = 0;
      for (const workout of week.workouts) {
        for (const block of workout.blocks) {
          if (block.durationSeconds) totalMinutes += block.durationSeconds / 60;
          else if (block.distanceMeters) totalMinutes += (block.distanceMeters / 1000) * 6;
        }
      }
      return { weekNumber: week.weekNumber, minutes: Math.round(totalMinutes) };
    });
  }, [result]);

  const maxVolume = Math.max(...weeklyVolumes.map((w) => w.minutes), 1);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-gray-400" size={32} />
      </div>
    );
  }

  if (!template) {
    return <div className="text-red-500 text-center mt-10">תוכנית לא נמצאה</div>;
  }

  return (
    <div className="max-w-6xl space-y-6" dir="rtl">
      <div>
        <Link
          href={`/admin/running/programs/${id}`}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-2"
        >
          <ArrowRight size={18} />
          חזרה לעריכת תוכנית
        </Link>
        <h1 className="text-3xl font-black text-gray-900">סימולטור תוכנית</h1>
        <p className="text-gray-500 mt-1">{template.name} — {template.canonicalWeeks} שבועות</p>
      </div>

      {/* Simulation controls */}
      <div className="bg-cyan-50 rounded-xl border border-cyan-200 p-6">
        <h2 className="text-lg font-bold text-cyan-900 mb-4">פרמטרי סימולציה</h2>
        <div className="flex flex-wrap gap-6 items-end">
          <div>
            <label className="block text-xs font-bold text-cyan-800 mb-1">קצב בסיס (דק׳/ק״מ)</label>
            <input
              type="number"
              min={3}
              max={12}
              step={0.5}
              value={basePace / 60}
              onChange={(e) => setBasePace(Math.round(parseFloat(e.target.value || '5.5') * 60))}
              className="w-24 px-3 py-2 border border-cyan-300 rounded"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-cyan-800 mb-1">פרופיל</label>
            <select
              value={profileType}
              onChange={(e) => setProfileType(Number(e.target.value) as RunnerProfileType)}
              className="px-3 py-2 border border-cyan-300 rounded"
            >
              <option value={1}>משפר מהיר (Profile 1)</option>
              <option value={2}>משפר איטי (Profile 2)</option>
              <option value={3}>מתחיל (Profile 3)</option>
              <option value={4}>שימור (Profile 4)</option>
            </select>
          </div>
          <button
            onClick={runSimulation}
            disabled={simulating}
            className="flex items-center gap-2 px-6 py-2 bg-cyan-500 text-white rounded-lg font-bold hover:bg-cyan-600 disabled:opacity-50"
          >
            {simulating ? <Loader2 className="animate-spin" size={18} /> : <Play size={18} />}
            {simulating ? 'מייצר...' : 'הרץ סימולציה'}
          </button>
        </div>
      </div>

      {result && (
        <>
          {/* Warnings */}
          {result.warnings.length > 0 && (
            <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={18} className="text-amber-600" />
                <span className="font-bold text-amber-800">אזהרות ({result.warnings.length})</span>
              </div>
              <ul className="text-sm text-amber-700 space-y-1 list-disc list-inside">
                {result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Volume Graph (P2 Enhancement) */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">נפח שבועי (דקות)</h2>
            <div className="flex items-end gap-1 h-40">
              {weeklyVolumes.map((wv) => {
                const intensity = result.intensityBreakdown.find((b) => b.weekNumber === wv.weekNumber);
                const isDeload = template.phases?.some(
                  (p) => p.progressionRules.some((r) => r.type === 'deload_week' && wv.weekNumber % (r as { everyWeeks: number }).everyWeeks === 0),
                );
                const isTaper = template.phases?.some(
                  (p) => p.name === 'taper' && wv.weekNumber >= p.startWeek && wv.weekNumber <= p.endWeek,
                );

                let barColor = '#3B82F6';
                if (isTaper) barColor = '#8B5CF6';
                else if (isDeload) barColor = '#F59E0B';

                const heightPct = maxVolume > 0 ? (wv.minutes / maxVolume) * 100 : 0;

                return (
                  <div key={wv.weekNumber} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[10px] text-gray-500 font-bold">{wv.minutes}</span>
                    <div
                      className="w-full rounded-t-sm transition-all"
                      style={{ height: `${heightPct}%`, backgroundColor: barColor, minHeight: 2 }}
                      title={`שבוע ${wv.weekNumber}: ${wv.minutes} דק׳${isDeload ? ' (deload)' : ''}${isTaper ? ' (taper)' : ''}`}
                    />
                    <span className="text-[9px] text-gray-400">{wv.weekNumber}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-4 mt-3 text-xs text-gray-500">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-blue-500" /> רגיל</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-amber-500" /> Deload</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-purple-500" /> Taper</span>
            </div>
          </div>

          {/* 80/20 Breakdown */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">פירוט 80/20 לפי שבוע</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-600">
                    <th className="py-2 px-3 text-right font-bold">שבוע</th>
                    <th className="py-2 px-3 text-right font-bold">סה״כ (דק׳)</th>
                    <th className="py-2 px-3 text-right font-bold">קל (דק׳)</th>
                    <th className="py-2 px-3 text-right font-bold">קשה (דק׳)</th>
                    <th className="py-2 px-3 text-right font-bold">% קשה</th>
                    <th className="py-2 px-3 text-right font-bold">תקין</th>
                  </tr>
                </thead>
                <tbody>
                  {result.intensityBreakdown.map((week) => (
                    <tr key={week.weekNumber} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 px-3 font-bold">{week.weekNumber}</td>
                      <td className="py-2 px-3">{week.totalMinutes}</td>
                      <td className="py-2 px-3 text-emerald-600">{week.easyMinutes}</td>
                      <td className="py-2 px-3 text-red-600">{week.hardMinutes}</td>
                      <td className="py-2 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                            week.isValid
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {week.hardPercent}%
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        {week.isValid ? (
                          <CheckCircle size={16} className="text-emerald-500" />
                        ) : (
                          <AlertTriangle size={16} className="text-red-500" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Week-by-week plan output */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">תוכנית מלאה — שבוע אחר שבוע</h2>
            <div className="space-y-4 max-h-[600px] overflow-y-auto">
              {result.plan.weeks.map((week) => {
                const intensity = result.intensityBreakdown.find((b) => b.weekNumber === week.weekNumber);
                return (
                  <div key={week.weekNumber} className="border border-gray-200 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-gray-800">שבוע {week.weekNumber}</span>
                      <div className="flex gap-2 text-xs">
                        <span className="text-gray-500">{week.workouts.length} אימונים</span>
                        {intensity && (
                          <span className={`px-2 py-0.5 rounded-full font-bold ${intensity.isValid ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                            {intensity.hardPercent}% קשה
                          </span>
                        )}
                      </div>
                    </div>
                    {week.workouts.length === 0 && (
                      <p className="text-gray-400 text-sm">אין אימונים בשבוע זה</p>
                    )}
                    {week.workouts.map((workout) => (
                      <div key={workout.id} className="mt-2 p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-sm text-gray-700">{workout.title}</span>
                          {workout.isQualityWorkout && (
                            <span className="px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-700 text-xs font-bold">איכות</span>
                          )}
                        </div>
                        {workout.description && (
                          <p className="text-xs text-gray-500 mb-1">{workout.description}</p>
                        )}
                        <div className="flex flex-wrap gap-1">
                          {workout.blocks.map((block) => (
                            <span
                              key={block.id}
                              className="px-2 py-0.5 rounded text-[10px] font-medium text-white"
                              style={{ backgroundColor: block.colorHex }}
                              title={`${block.label}${block.durationSeconds ? ` — ${Math.round(block.durationSeconds / 60)}דק׳` : ''}${block._isSynthesizedRest ? ' (מנוחה)' : ''}`}
                            >
                              {block.label}
                              {block.durationSeconds ? ` ${Math.round(block.durationSeconds / 60)}′` : ''}
                              {block.targetPacePercentage
                                ? ` ${formatPaceSeconds(block.targetPacePercentage.min)}–${formatPaceSeconds(block.targetPacePercentage.max)}`
                                : ''}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
