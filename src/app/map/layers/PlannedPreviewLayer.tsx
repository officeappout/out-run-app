'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMapMode } from '@/features/parks/core/context/MapModeContext';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import { useUserStore } from '@/features/user';
import { getRunWorkoutTemplate, getPaceMapConfig, getRunProgramTemplate } from '@/features/workout-engine/core/services/running-admin.service';
import { materializeWorkout } from '@/features/workout-engine/core/services/running-engine.service';
import { resolveRunningWorkoutMetadata } from '@/features/workout-engine/services/running-metadata.service';
import { useMapLogic } from '@/features/parks';
import { Play, Zap, ChevronDown } from 'lucide-react';
import RunBriefingDrawer from '@/features/workout-engine/players/running/components/RunBriefingDrawer';

type MapLogic = ReturnType<typeof useMapLogic>;

interface PlannedPreviewLayerProps {
  logic: MapLogic;
}

export default function PlannedPreviewLayer({ logic }: PlannedPreviewLayerProps) {
  const { setMode, workoutId: contextWorkoutId } = useMapMode();
  const searchParams = useSearchParams();
  const { profile, refreshProfile } = useUserStore();
  const currentWorkout = useRunningPlayer((s) => s.currentWorkout);

  const plannedLoadedRef = useRef(false);
  const paceRetryCount = useRef(0);
  const autoStartFiredRef = useRef(false);
  const MAX_PACE_RETRIES = 3;
  const [isLoading, setIsLoading] = useState(true);
  const [showDrawer, setShowDrawer] = useState(false);

  const autoStart = searchParams.get('autoStart') === 'true';

  useEffect(() => {
    if (!contextWorkoutId) {
      setIsLoading(false);
      return;
    }
    if (plannedLoadedRef.current) return;
    plannedLoadedRef.current = true;
    setIsLoading(true);

    const weekNumber = parseInt(searchParams.get('week') ?? '1', 10);
    const dayNumber = parseInt(searchParams.get('day') ?? '1', 10);
    const paceProfile = profile?.running?.paceProfile;
    const programId = profile?.running?.activeProgram?.programId;

    if (!paceProfile) {
      if (paceRetryCount.current >= MAX_PACE_RETRIES) { setIsLoading(false); return; }
      paceRetryCount.current += 1;
      refreshProfile().then(() => { plannedLoadedRef.current = false; });
      return;
    }

    sessionStorage.setItem('planned_run_week', String(weekNumber));
    sessionStorage.setItem('planned_run_day', String(dayNumber));

    (async () => {
      try {
        const rawTemplateId = contextWorkoutId.replace(/_w\d+$/, '');
        const [template, paceMapConfig, fullProgram] = await Promise.all([
          getRunWorkoutTemplate(rawTemplateId),
          getPaceMapConfig(),
          programId ? getRunProgramTemplate(programId) : Promise.resolve(null),
        ]);
        if (!template) { setIsLoading(false); return; }
        const rules = fullProgram?.progressionRules ?? [];
        const workout = materializeWorkout(template, weekNumber, rules, paceProfile, paceMapConfig);

        await resolveRunningWorkoutMetadata({
          workout,
          paceProfile,
          persona: (profile?.core as any)?.personaId ?? null,
          gender: profile?.core?.gender as 'male' | 'female' | undefined,
          targetDistance: profile?.running?.generatedProgramTemplate?.targetDistance,
          weekNumber,
          totalWeeks: profile?.running?.generatedProgramTemplate?.canonicalWeeks,
          userAge: (() => {
            const bd = profile?.core?.birthDate;
            if (!bd) return undefined;
            const d = bd instanceof Date ? bd : new Date(bd as any);
            return isNaN(d.getTime()) ? undefined : Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
          })(),
        });

        useRunningPlayer.getState().setCurrentWorkout(workout);
        setIsLoading(false);
      } catch { setIsLoading(false); }
    })();
  }, [contextWorkoutId, searchParams, profile?.running?.paceProfile, profile?.running?.activeProgram?.programId, refreshProfile]);

  // autoStart: skip preview and start GPS immediately once workout is ready
  useEffect(() => {
    if (autoStart && currentWorkout && !isLoading && !autoStartFiredRef.current) {
      autoStartFiredRef.current = true;
      logic.startActiveWorkout();
    }
  }, [autoStart, currentWorkout, isLoading, logic]);

  const handleStart = () => {
    logic.startActiveWorkout();
  };

  const hasPlannedWorkout = !!currentWorkout;

  // autoStart mode: show loading until workout is ready, then auto-start (no preview card)
  if (autoStart) {
    if (isLoading) {
      return (
        <div className="absolute bottom-32 left-0 right-0 z-20 flex justify-center">
          <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-xl px-6 py-4 flex items-center gap-3" dir="rtl">
            <div className="animate-spin w-5 h-5 border-[3px] border-[#00BAF7] border-t-transparent rounded-full" />
            <span className="text-sm font-bold text-gray-700">מכין את האימון...</span>
          </div>
        </div>
      );
    }
    return null;
  }

  if (isLoading) {
    return (
      <div className="absolute bottom-32 left-0 right-0 z-20 flex justify-center">
        <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-xl px-6 py-4 flex items-center gap-3" dir="rtl">
          <div className="animate-spin w-5 h-5 border-[3px] border-[#00BAF7] border-t-transparent rounded-full" />
          <span className="text-sm font-bold text-gray-700">טוען אימון מתוכנן...</span>
        </div>
      </div>
    );
  }

  if (!hasPlannedWorkout) return null;

  return (
    <>
      <div className="absolute bottom-0 left-0 right-0 z-20 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="mx-4 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-gray-100 p-5" dir="rtl">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00E5FF] to-[#00BAF7] flex items-center justify-center">
              <Zap size={20} className="text-white" />
            </div>
            <div>
              <h3 className="text-base font-black text-gray-800">{currentWorkout.title}</h3>
              <p className="text-[11px] text-gray-500 font-medium">
                {currentWorkout.blocks?.length ?? 0} בלוקים
              </p>
            </div>
          </div>

          <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
            {currentWorkout.blocks?.slice(0, 4).map((block: any, i: number) => (
              <div key={i} className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-100">
                <p className="text-[10px] font-bold text-gray-600 whitespace-nowrap">
                  {block.label || block.type || `בלוק ${i + 1}`}
                </p>
              </div>
            ))}
          </div>

          <button
            onClick={handleStart}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#00E5FF] to-[#00BAF7] text-white font-black text-lg shadow-2xl active:scale-[0.97] transition-all flex items-center justify-center gap-3"
          >
            <Play size={22} fill="white" />
            <span>התחל אימון</span>
          </button>

          <button
            onClick={() => setShowDrawer(true)}
            className="w-full mt-2 py-2.5 rounded-xl text-[#00BAF7] font-bold text-sm hover:bg-blue-50/60 transition-all flex items-center justify-center gap-1"
          >
            <ChevronDown size={16} />
            <span>פרטי האימון</span>
          </button>

          <button
            onClick={() => setMode('discover')}
            className="w-full mt-1 py-2 rounded-xl text-gray-400 font-bold text-xs hover:bg-gray-50 transition-all"
          >
            ביטול
          </button>
        </div>
      </div>

      <RunBriefingDrawer
        isOpen={showDrawer}
        onClose={() => setShowDrawer(false)}
        onGo={() => {
          setShowDrawer(false);
          handleStart();
        }}
        workout={currentWorkout}
      />
    </>
  );
}
