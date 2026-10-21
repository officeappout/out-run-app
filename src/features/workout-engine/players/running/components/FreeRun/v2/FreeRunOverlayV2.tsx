'use client';

/**
 * FreeRunOverlayV2 — home-v2 (enable_home_v2) free-run overlay inside
 * FreeRunLayer's TOP layer (the map moves with it; TwoLayerShell owns the
 * drag). Boards R2-prop-easy (goal card + card) and U-B1…B3 (pages).
 *
 * Keeps every non-visual duty of FreeRunOverlay: the group-goal bridge, the
 * stale group-session clear, the story-bar height published for the map
 * camera / turn card / recenter pill, GPS + goal toasts, the side rail and
 * the settings drawer. Free runs have no planned zone, so the zone chip and
 * the time-in-zone stay hidden; the rolling pace still smooths the numbers.
 */

import React, { useEffect, useRef, useState } from 'react';
import type { useDragControls } from 'framer-motion';
import { Check, Settings2 } from 'lucide-react';
import { CartProgressIcon } from '@/components/ui/v2';
import GpsIndicator from '@/features/workout-engine/components/GpsIndicator';
import { useMapStore } from '@/features/parks/core/store/useMapStore';
import { useSharedSession } from '@/features/workout-engine/core/store/useSharedSession';
import type { Participant } from '@/features/workout-engine/shared/types/session-policy';
import { HeaderProgressBar, PlayerHeaderCard, RunHeaderStrip, RunMetricsDrawer, usePublishedPlayerChrome } from '../../../../shared/v2';
import { useRunningPlayer } from '../../../store/useRunningPlayer';
import { useGroupSessionGoal } from '../../../hooks/useGroupSessionGoal';
import { useZoneTracking } from '../../../hooks/useZoneTracking';
import { V2_BLOCK_COLORS, fmtClock, fmtPace } from '../../../lib/planned-rep-results';
import { fmtSpeed, paceSecToKmh, rateLabels } from '../../../lib/aerobic-activity';
import { goalView, heroKind } from '../../../lib/continuous-run';
import ContinuousRunCardV2 from '../../Continuous/v2/ContinuousRunCardV2';
import SideRail from '../SideRail';
import WorkoutSettingsDrawer from '../WorkoutSettingsDrawer';
import InviteRunButton from '../InviteRunButton';
import { useFreeRunLive } from './useFreeRunLive';
import { useT } from '@/hooks/useT';
import { player, type PlayerKey } from '@/messages/ns/player';

interface Props {
  dragControls: ReturnType<typeof useDragControls>;
  /** Reveal the laps list behind (TwoLayerShell). */
  onMinimize: () => void;
  sideRailParticipants?: Participant[];
  onSelectParticipant?: (uid: string) => void;
  /** For the invite button (same as today's overlay). */
  activityType: 'running' | 'walking';
  /**
   * enable_run_player_drawer_v1: header attached to the top edge, metrics as a
   * drawer (compact ⇄ full), camera keeps the marker above it. Off = today's layout.
   */
  drawerV1?: boolean;
}

function Toast({ children, tone = 'dark' }: { children: React.ReactNode; tone?: 'dark' | 'good' }) {
  return (
    <div className="absolute left-1/2 z-[55] -translate-x-1/2 pointer-events-none" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 112px)' }} role="status" aria-live="polite">
      <div
        dir="rtl"
        className={`inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-[13px] font-extrabold text-white ${tone === 'good' ? 'bg-v2-up' : 'bg-v2-ink'}`}
      >
        {children}
      </div>
    </div>
  );
}

export default function FreeRunOverlayV2({ dragControls, onMinimize, sideRailParticipants, onSelectParticipant, activityType, drawerV1 = false }: Props) {
  useGroupSessionGoal();
  useEffect(() => {
    const s = useSharedSession.getState();
    if (s.groupId && s.phase !== 'active') s.clearGroupSession();
  }, []);

  const t = useT(player);
  const live = useFreeRunLive();
  const tracking = useZoneTracking(null, 0);
  const gpsStatus = useRunningPlayer((s) => s.gpsStatus);
  const gpsAccuracy = useRunningPlayer((s) => s.gpsAccuracy);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const gv = live.goal ? goalView(live.goal) : null;
  const kind = heroKind(live.goal);
  const cartItems = live.laps.map((l) => ({ color: V2_BLOCK_COLORS.easy, done: !l.isActive }));
  const lapNo = live.laps.find((l) => l.isActive)?.lapNumber ?? Math.max(1, live.laps.length);

  // ── Goal reached ─────────────────────────────────────────────────────
  const [goalToast, setGoalToast] = useState(false);
  const prevDone = useRef(false);
  useEffect(() => {
    const done = gv?.done ?? false;
    if (done && !prevDone.current) {
      prevDone.current = true;
      setGoalToast(true);
      const timer = setTimeout(() => setGoalToast(false), 3000);
      return () => clearTimeout(timer);
    }
    if (!done) prevDone.current = false;
  }, [gv?.done]);

  // ── GPS status ───────────────────────────────────────────────────────
  const [gpsToast, setGpsToast] = useState<PlayerKey | null>(null);
  const prevGps = useRef(gpsStatus);
  useEffect(() => {
    if (gpsStatus === prevGps.current) return;
    prevGps.current = gpsStatus;
    if (gpsStatus === 'searching') setGpsToast('run.free.v2.gps.searching');
    else if (gpsStatus === 'poor') setGpsToast('run.free.v2.gps.poor');
    else if (gpsStatus === 'good' || gpsStatus === 'perfect') setGpsToast('run.free.v2.gps.good');
  }, [gpsStatus]);
  useEffect(() => {
    if (!gpsToast) return;
    const timer = setTimeout(() => setGpsToast(null), 4000);
    return () => clearTimeout(timer);
  }, [gpsToast]);

  // ── Header height → map camera padding, turn card, recenter pill ─────
  const headerRef = useRef<HTMLDivElement>(null);
  // Map camera keeps the runner's marker between the header and the card
  // (the legacy framing put it right under the bottom card).
  const chrome = usePublishedPlayerChrome({ bottomGapPx: 12, headerIncludesSafeTop: true, drawer: drawerV1 });
  const [headerH, setHeaderH] = useState(96);
  const setStoreStoryBarHeight = useMapStore((s) => s.setStoryBarHeight);
  const navCardH = useMapStore((s) => s.navCardHeight);
  useEffect(() => {
    const node = headerRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const obs = new ResizeObserver(([entry]) => {
      const h = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
      if (Number.isFinite(h) && h > 0) setHeaderH(Math.round(h));
    });
    obs.observe(node);
    return () => obs.disconnect();
  }, []);
  useEffect(() => {
    setStoreStoryBarHeight(headerH);
    return () => setStoreStoryBarHeight(0);
  }, [headerH, setStoreStoryBarHeight]);

  const startShellDrag = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    dragControls.start(e);
  };
  const headerProps = {
    leading: <CartProgressIcon items={cartItems} onClick={onMinimize} size={48} ariaLabel={t('run.free.v2.lapsListAria', { done: String(cartItems.filter((i) => i.done).length) })} />,
    eyebrow: gv ? `${live.title} · ${gv.targetText}` : live.title,
    eyebrowColor: '#4d7c0f',
    title: gv ? gv.remainingText : t('run.free.v2.lapTitle', { n: String(lapNo), time: fmtClock(live.totals.durationSec) }),
    trailing: gv ? <span dir="ltr" className="shrink-0 whitespace-nowrap text-[14px] font-black tabular-nums text-v2-deep">{`${gv.percent}%`}</span> : null,
    strip: gv ? <HeaderProgressBar progress={gv.progress} color={V2_BLOCK_COLORS.easy} /> : null,
  };

  const card = (
    <ContinuousRunCardV2
      data={{
        heroKind: kind,
        heroSeconds: live.totals.durationSec,
        heroKm: live.totals.distanceKm,
        zone: null,
        tracking,
        currentPaceSec: live.currentPaceSec,
        showLivePace: true,
        totals: live.totals,
        plannedKm: live.goal?.type === 'distance' ? live.goal.target : null,
        metric: live.metric,
      }}
      isPaused={live.isPaused}
      onPause={live.pause}
      onResume={live.resume}
      onLap={live.lap}
      onStop={live.stop}
    />
  );
  const rateText =
    live.currentPaceSec > 0 ? (live.metric === 'speed' ? fmtSpeed(paceSecToKmh(live.currentPaceSec)) : fmtPace(live.currentPaceSec)) : '--:--';

  return (
    <>
      {drawerV1 ? (
        <RunHeaderStrip outerRef={chrome.headerRef} innerRef={headerRef} onPointerDown={startShellDrag} {...headerProps} />
      ) : (
      <div ref={chrome.headerRef} className="absolute inset-x-0 top-0 z-10" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div ref={headerRef} className="px-3 pt-2">
          <PlayerHeaderCard onPointerDown={startShellDrag} {...headerProps} />
        </div>
      </div>
      )}

      {/* Left column under the header (the recenter pill owns the right side). */}
      <div
        className="pointer-events-auto absolute left-4 z-10 flex items-center gap-2"
        style={{ top: `calc(env(safe-area-inset-top, 0px) + ${headerH + navCardH + 16}px)` }}
      >
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          aria-label={t('run.free.v2.settings')}
          className="grid h-10 w-10 place-items-center rounded-full bg-white shadow-v2-ring active:scale-[0.97] transition-transform duration-150 ease-v2"
        >
          <Settings2 size={18} strokeWidth={2.3} className="text-v2-ink" aria-hidden />
        </button>
        <InviteRunButton activityType={activityType} inline />
        <div className="pointer-events-none">
          <GpsIndicator accuracy={gpsAccuracy} status={gpsStatus} />
        </div>
      </div>

      {gpsToast && <Toast>{t(gpsToast)}</Toast>}
      {goalToast && (
        <Toast tone="good">
          <Check size={15} strokeWidth={2.8} aria-hidden />
          {t('run.free.v2.goalReached')}
        </Toast>
      )}

      <SideRail participants={sideRailParticipants ?? []} storyBarHeight={headerH} onSelect={onSelectParticipant} />

      {drawerV1 ? (
        <RunMetricsDrawer
          cardRef={chrome.cardRef}
          bottomGapPx={12}
          className="z-10"
          onOpenList={onMinimize}
          full={card}
          compact={{
            time: fmtClock(live.totals.durationSec),
            distanceKm: live.totals.distanceKm.toFixed(2),
            rate: rateText,
            rateLabel: rateLabels(live.metric ?? 'pace').page,
            isPaused: live.isPaused,
            onPause: live.pause,
            onResume: live.resume,
            onStop: live.stop,
          }}
        />
      ) : (
        <div ref={chrome.cardRef} className="absolute inset-x-3 z-10" style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}>
          {card}
        </div>
      )}

      <WorkoutSettingsDrawer isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
