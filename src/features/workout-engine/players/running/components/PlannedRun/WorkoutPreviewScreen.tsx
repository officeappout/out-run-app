'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Play, ArrowLeft, Clock, Zap } from 'lucide-react';
import { usePlannedRunEngine } from '../../hooks/usePlannedRunEngine';
import { formatPaceSeconds } from '../../../../core/services/running-engine.service';
import RunStoryBar from './RunStoryBar';
import type RunWorkout from '../../types/run-workout.type';
import { usePartnerData } from '@/features/parks/core/hooks/usePartnerData';
import { usePartnerFilters } from '@/features/partners';
import { useMapStore } from '@/features/parks/core/store/useMapStore';
import ShareAsLiveToggle from '@/features/workout-engine/components/ShareAsLiveToggle';

interface WorkoutPreviewScreenProps {
  workout: RunWorkout;
  onStart: () => void;
  onBack: () => void;
}

export default function WorkoutPreviewScreen({
  workout,
  onStart,
  onBack,
}: WorkoutPreviewScreenProps) {
  const { zones, basePace, showNumbers } = usePlannedRunEngine();
  const router = useRouter();

  // ── Partner Finder entry point ────────────────────────────────────────────
  // One-shot GPS fetch — no GPS source already exposed in this screen.
  // Mirrors the permission-aware pattern used elsewhere; silently skips
  // when geolocation is unavailable so the section just hides.
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined' || !('geolocation' in navigator)) return;
    let cancelled = false;
    (async () => {
      try {
        const permission = await navigator.permissions.query({ name: 'geolocation' });
        if (permission.state !== 'granted') return;
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false,
            timeout: 8000,
            maximumAge: 60_000,
          }),
        );
        if (cancelled) return;
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      } catch {
        /* permission denied / API unsupported — silently hide partner hint */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const { live: livePartners } = usePartnerData(userLocation, 5);
  const similarCount = useMemo(
    () => livePartners.filter((p) => p.activityStatus === 'running').length,
    [livePartners],
  );

  const handleOpenLivePartners = useCallback(() => {
    usePartnerFilters.getState().setLiveActivity('running');
    useMapStore.getState().setPendingPartnerOverlay({ tab: 'live' });
    router.push('/map');
  }, [router]);

  const totalDuration = workout.blocks.reduce(
    (sum, b) => sum + (b.durationSeconds ?? 0),
    0,
  );
  const totalDistance = workout.blocks.reduce(
    (sum, b) => sum + (b.distanceMeters ?? 0),
    0,
  );

  const blockIntensity = (b: (typeof workout.blocks)[number]): number => {
    if (b.effortConfig?.effortLevel === 'max') return 5;
    if (b.effortConfig?.effortLevel === 'hard') return 4;
    if (b.type === 'interval') return 4;
    if (b.type === 'run') return 3;
    if (b.type === 'recovery' || b.type === 'walk') return 1.5;
    if (b.type === 'warmup' || b.type === 'cooldown') return 1;
    return 2;
  };
  const avgIntensity =
    workout.blocks.length > 0
      ? workout.blocks.reduce((s, b) => s + blockIntensity(b), 0) /
        workout.blocks.length
      : 2;
  const difficultyLabel =
    avgIntensity >= 4 ? 'קשה' : avgIntensity >= 2.5 ? 'בינוני' : 'קל';
  const difficultyColor =
    avgIntensity >= 4 ? '#EF4444' : avgIntensity >= 2.5 ? '#F59E0B' : '#10B981';

  return (
    <div
      className="absolute inset-0 z-20 flex flex-col overflow-hidden bg-transparent"
      style={{ fontFamily: 'var(--font-simpler)' }}
    >
      {/* ── Dark header with Story Bar ── */}
      <header
        className="shrink-0 z-30"
        style={{
          background:
            'linear-gradient(180deg, rgba(15,23,42,0.95) 0%, rgba(15,23,42,0.85) 100%)',
        }}
      >
        {/* Nav row */}
        <div className="flex items-center justify-between px-4 pt-3 pb-1">
          <div className="w-8" />
          <button
            onClick={onBack}
            className="w-8 h-8 flex items-center justify-center rounded-full text-white active:bg-white/20 transition-colors min-w-[44px] min-h-[44px]"
          >
            <ArrowLeft className="transform rotate-180" size={24} />
          </button>
        </div>

        {/* Title overlay on dark header */}
        <div className="px-5 pb-2" dir="rtl">
          <h1 className="text-xl font-black text-white leading-tight">
            {workout.title}
          </h1>
          {workout.description && (
            <p className="text-xs text-white/50 mt-1 leading-relaxed line-clamp-2">
              {workout.logicCue || workout.description}
            </p>
          )}
        </div>

        {/* Story Bar — shows workout structure as a visual overview */}
        <RunStoryBar
          blocks={workout.blocks}
          currentBlockIndex={-1}
          blockProgress={0}
          isPaused={false}
        />
      </header>

      {/* ── Summary pills ── */}
      <div
        className="flex items-center gap-2 px-5 py-3 bg-white border-b border-slate-100"
        dir="rtl"
      >
        {totalDuration > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-slate-500 bg-slate-50 px-2.5 py-1 rounded-full border border-slate-200">
            <Clock size={12} className="text-slate-400" />
            {formatOverviewDuration(totalDuration)}
          </span>
        )}
        {totalDistance > 0 && (
          <span className="text-xs text-slate-500 bg-slate-50 px-2.5 py-1 rounded-full border border-slate-200">
            {formatOverviewDistance(totalDistance)}
          </span>
        )}
        <span
          className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full border"
          style={{
            color: difficultyColor,
            backgroundColor: `${difficultyColor}10`,
            borderColor: `${difficultyColor}30`,
          }}
        >
          <Zap size={12} />
          {difficultyLabel}
        </span>
        {workout.isQualityWorkout && (
          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
            אימון איכות
          </span>
        )}
      </div>

      {/* ── Block list ── */}
      <div className="flex-grow overflow-auto px-5 pt-3 pb-32 bg-white" dir="rtl">
        <div className="space-y-2">
          {workout.blocks.map((block) => {
            let paceLabel = '';
            if (showNumbers && basePace > 0) {
              if (block.zoneType && zones) {
                const z = zones[block.zoneType];
                paceLabel = `${formatPaceSeconds(z.minPace)}–${formatPaceSeconds(z.maxPace)}`;
              } else if (block.targetPacePercentage) {
                const minP = Math.round(
                  (basePace * block.targetPacePercentage.min) / 100,
                );
                const maxP = Math.round(
                  (basePace * block.targetPacePercentage.max) / 100,
                );
                paceLabel = `${formatPaceSeconds(minP)}–${formatPaceSeconds(maxP)}`;
              }
            }

            const metaLabel = block.durationSeconds
              ? formatBlockDuration(block.durationSeconds)
              : block.distanceMeters
                ? formatBlockDistance(block.distanceMeters)
                : '';

            return (
              <div
                key={block.id}
                className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3 border border-slate-100"
              >
                {/* Color indicator */}
                <div
                  className="w-1.5 h-10 rounded-full shrink-0"
                  style={{ backgroundColor: block.colorHex || '#9CA3AF' }}
                />

                {/* Info */}
                <div className="flex-grow min-w-0">
                  <span className="text-sm font-bold text-slate-900 truncate block">
                    {block.label}
                  </span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-slate-400">
                      {metaLabel}
                    </span>
                    {paceLabel && (
                      <span
                        className="text-[11px] text-slate-500 font-medium"
                        dir="ltr"
                      >
                        {paceLabel} /ק"מ
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Sticky start button ── */}
      <div
        className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-white via-white/95 to-transparent pointer-events-auto"
        style={{
          paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {/* Row 1 — "X people running near you" hint (Partner Finder discovery) */}
        {similarCount > 0 && (
          <button
            type="button"
            onClick={handleOpenLivePartners}
            className="block w-full text-center pb-2 active:scale-[0.99] transition-transform"
            style={{ color: '#00ADEF', fontSize: '13px' }}
            dir="rtl"
          >
            {`${similarCount} אנשים רצים קרוב אליך`}
          </button>
        )}

        {/* Row 2 — share-as-live toggle (always visible) */}
        <ShareAsLiveToggle
          activityType="running"
          workoutTitle={workout.title ?? ''}
          userLocation={userLocation}
          className="pb-3"
        />

        <button
          onClick={onStart}
          className="w-full h-14 rounded-2xl flex items-center justify-center gap-3 text-lg font-bold shadow-lg shadow-cyan-500/20 active:scale-[0.98] transition-transform text-white bg-gradient-to-l from-[#00C9F2] to-[#00AEEF]"
        >
          <Play size={24} fill="currentColor" />
          <span>התחל אימון</span>
        </button>
      </div>
    </div>
  );
}

function formatBlockDuration(s: number): string {
  if (s < 60) return `${s} שנ'`;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return sec > 0
    ? `${m}:${sec.toString().padStart(2, '0')} דק'`
    : `${m} דק'`;
}

function formatBlockDistance(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1)} ק"מ`;
  return `${m} מ'`;
}

function formatOverviewDuration(s: number): string {
  if (s < 60) return `${s} שניות`;
  const m = Math.floor(s / 60);
  return `~${m} דק'`;
}

function formatOverviewDistance(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1)} ק"מ`;
  return `${m} מ'`;
}
