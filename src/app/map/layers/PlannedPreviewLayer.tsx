'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMapMode } from '@/features/parks/core/context/MapModeContext';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import { useUserStore } from '@/features/user';
import { getRunWorkoutTemplate, getPaceMapConfig, getRunProgramTemplate } from '@/features/workout-engine/core/services/running-admin.service';
import { materializeWorkout, computeZones } from '@/features/workout-engine/core/services/running-engine.service';
import { calmRunWorkout, calmCopy, getDaysAway, resolveCalmReturn } from '@/lib/calm-return';
import { readLiveFlag } from '@/lib/feature-flag-live';
import { resolveRunningWorkoutMetadata } from '@/features/workout-engine/services/running-metadata.service';
import { useMapLogic } from '@/features/parks';
import { useSuppressBottomNav } from '@/features/parks/core/hooks/useSuppressBottomNav';
import { Play, Zap, ChevronDown } from 'lucide-react';
import RunBriefingDrawer from '@/features/workout-engine/players/running/components/RunBriefingDrawer';
import RunOverviewMapHost from '@/features/workout-engine/players/running/components/overview-v2/RunOverviewMapHost';
import { applyRunEdits, isCustomized, readRunEditParams } from '@/features/workout-engine/players/running/utils/run-overview/run-edits';
import { useRunPreviewModel } from '@/features/workout-engine/players/running/components/preview-v2/useRunPreviewModel';
import { parseRunWeekParams } from '@/features/workout-engine/players/running/utils/run-preview/run-week';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';

type MapLogic = ReturnType<typeof useMapLogic>;

interface PlannedPreviewLayerProps {
  logic: MapLogic;
}

export default function PlannedPreviewLayer({ logic }: PlannedPreviewLayerProps) {
  // Hide the global BottomNavbar while this layer is mounted — the bottom
  // CTA card below would otherwise be partially covered by the floating tab
  // bar. Auto-released on unmount.
  useSuppressBottomNav();

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

  // Home v2 (enable_home_v2): the run overview drawer (RunOverviewMapHost).
  // Flag off → today's card and drawer, unchanged.
  const isSuperAdmin = useUserStore((st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  const v2 = useFeatureFlags(isSuperAdmin).flags.enableHomeV2;
  // The template's category (the beginner walk/run path drops it from the workout) — display only.
  const [templateCategory, setTemplateCategory] = useState<string | null>(null);
  const weekParam = searchParams.get('week');
  const dayParam = searchParams.get('day');
  const totalWeeks = profile?.running?.generatedProgramTemplate?.canonicalWeeks;
  const weekContext = useMemo(() => parseRunWeekParams(weekParam, dayParam, totalWeeks), [weekParam, dayParam, totalWeeks]);
  const previewExtras = useMemo(() => ({ templateCategory, week: weekContext }), [templateCategory, weekContext]);
  const previewModel = useRunPreviewModel(v2 ? currentWorkout : null, previewExtras);
  // v2 overview links (home week card): the runner's edits (level / swap / paces) + "open the route suggestions".
  const editsParam = useMemo(
    () => (v2 ? readRunEditParams({ variant: searchParams.get('variant'), swap: searchParams.get('swap'), pace: searchParams.get('pace') }) : null),
    [v2, searchParams],
  );
  const hasEditsParam = !!editsParam && (editsParam.variant !== 'planned' || isCustomized(editsParam));
  const suggestParam = v2 && searchParams.get('suggest') === '1';

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
        setTemplateCategory(template.category ?? null);
        const rules = fullProgram?.progressionRules ?? [];
        const materialized = materializeWorkout(template, weekNumber, rules, paceProfile, paceMapConfig);
        // Calm return (CALM_RETURN_V1): the same lighter run the home card showed — a quality
        // run becomes an easy one, volume per the return tier. Flag off → unchanged.
        let workout = materialized;
        if (readLiveFlag('enableCalmReturnV1') && profile) {
          const now = new Date();
          const calm = resolveCalmReturn({ daysAway: getDaysAway(profile, now), episode: profile.calmReturn, now });
          if (calm.isLightened) {
            workout = calmRunWorkout(materialized, calm.load, {
              easyPace: paceProfile.basePace > 0
                ? (({ minPace, maxPace }) => ({ min: minPace, max: maxPace }))(
                    computeZones(paceProfile.basePace, paceProfile.profileType, paceMapConfig).easy,
                  )
                : null,
              easyLabel: calmCopy(null).easyRunLabel,
            });
          }
        }

        // v2: edits made on home's overview and started straight away (autoStart —
        // no overview here to apply them). Otherwise the map overview applies them before start.
        if (editsParam && hasEditsParam && autoStart) {
          const zones = paceProfile.basePace > 0 ? computeZones(paceProfile.basePace, paceProfile.profileType, paceMapConfig) : null;
          workout = applyRunEdits(workout, editsParam, { basePace: paceProfile.basePace, zones });
        }

        await resolveRunningWorkoutMetadata({
          workout,
          paceProfile,
          persona: profile?.personas?.[0]?.id ?? null,
          gender: profile?.core?.gender as 'male' | 'female' | undefined,
          targetDistance: profile?.running?.generatedProgramTemplate?.targetDistance,
          weekNumber,
          totalWeeks: profile?.running?.generatedProgramTemplate?.canonicalWeeks,
          lastWorkoutDate: profile?.running?.lastWorkoutDate,
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
        <div className="absolute left-0 right-0 z-20 flex justify-center" style={{ bottom: 'max(8rem, calc(env(safe-area-inset-bottom, 0px) + 6rem))' }}>
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
      <div className="absolute left-0 right-0 z-20 flex justify-center" style={{ bottom: 'max(8rem, calc(env(safe-area-inset-bottom, 0px) + 6rem))' }}>
        <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-xl px-6 py-4 flex items-center gap-3" dir="rtl">
          <div className="animate-spin w-5 h-5 border-[3px] border-[#00BAF7] border-t-transparent rounded-full" />
          <span className="text-sm font-bold text-gray-700">טוען אימון מתוכנן...</span>
        </div>
      </div>
    );
  }

  if (!hasPlannedWorkout) return null;

  const drawer = (
    <RunBriefingDrawer
      isOpen={showDrawer}
      onClose={() => setShowDrawer(false)}
      onGo={() => {
        setShowDrawer(false);
        handleStart();
      }}
      workout={currentWorkout}
    />
  );

  // v2 (boards M-6a…6i): the run overview drawer itself — start from here, or
  // "הצע לי מסלול" → routes on the map. Flag off → today's card + drawer below.
  if (v2 && previewModel) {
    return (
      <RunOverviewMapHost
        logic={logic}
        workout={currentWorkout}
        templateCategory={templateCategory}
        week={weekContext}
        initialSuggest={suggestParam}
        initialEdits={hasEditsParam ? editsParam : null}
        onExit={() => setMode('discover')}
        onPickOnMap={() => setMode('discover')}
      />
    );
  }

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

      {drawer}
    </>
  );
}
