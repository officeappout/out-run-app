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
import { HeaderProgressBar, PlayerHeaderCard, RunHeaderStrip, usePublishedPlayerChrome } from '../../../../shared/v2';
import { ArrivalPanel, RouteEndPanel, RunDrawerSheet, RunFloatingButtons, RunHeaderChrome, UnifiedGpsMark, UnifiedHeaderLayer, type RunDrawerPage } from '../../../../shared/v2/run-chrome';
import { Cell, Cells } from '../../../../shared/v2/run-chrome/RunDrawerBlocks';
import { PAGE_CAPTION_KEY, arrivalDue, currentLapView, drawerPagesFor, routeEndDue, type CurrentLapView, type UnifiedSituation } from '../../../../shared/v2/run-chrome/unified-chrome-logic';
import { useUnifiedGps } from '../../../hooks/useUnifiedGps';
import { fetchRealParks } from '@/features/parks/core/services/parks.service';
import { useUnifiedPlayerV1 } from '../../../../shared/v2/useUnifiedPlayerV1';
import { together } from '@/messages/ns/together';
import { useRunTogetherChrome } from '@/features/workout-engine/together/hooks/useRunTogetherChrome';
import { aerobicCells, showLapButton } from '../../../lib/aerobic-player-view';
import ArriveAtStartCard from './ArriveAtStartCard';
import { routeKmOf, useWalkToStartStore } from '../../../store/useWalkToStartStore';
import { useFreeChromeNodes } from './useFreeChromeNodes';
import { useRunningPlayer } from '../../../store/useRunningPlayer';
import { useGroupSessionGoal } from '../../../hooks/useGroupSessionGoal';
import { useZoneTracking } from '../../../hooks/useZoneTracking';
import { V2_BLOCK_COLORS, fmtClock, fmtPace } from '../../../lib/planned-rep-results';
import { goalView, heroKind } from '../../../lib/continuous-run';
import ContinuousRunCardV2 from '../../Continuous/v2/ContinuousRunCardV2';
import SideRail from '../SideRail';
import WorkoutSettingsDrawer from '../WorkoutSettingsDrawer';
import InviteRunButton from '../InviteRunButton';
import { useFreeRunLive } from './useFreeRunLive';
import { useCommuteEta } from '../../Commute/useCommuteEta';
import { commuteHeaderText } from '../../Commute/commute-format';
import { useT } from '@/hooks/useT';
import { player, type PlayerKey } from '@/messages/ns/player';

import { useUiDir } from '@/lib/i18n/useUiDir';
import { usePilotAhV1 } from '@/hooks/usePilotAhV1';
import { RouteTurnRow } from '@/features/workout-engine/hybrid/v2/park/ParkMessageRow';
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
  /** enable_combo_flow_v1 (board PlayerArrive): at the route's start, go on on the route in the same session. */
  onContinueRoute?: (activity: 'walking' | 'running') => void;
}

function Toast({ children, tone = 'dark' }: { children: React.ReactNode; tone?: 'dark' | 'good' }) {
  const { direction } = useUiDir();
  return (
    <div className="absolute left-1/2 z-[55] -translate-x-1/2 pointer-events-none" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 112px)' }} role="status" aria-live="polite">
      <div
        dir={direction}
        className={`inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-[13px] font-extrabold text-white ${tone === 'good' ? 'bg-v2-up' : 'bg-v2-ink'}`}
      >
        {children}
      </div>
    </div>
  );
}

export default function FreeRunOverlayV2({ dragControls, onMinimize, sideRailParticipants, onSelectParticipant, activityType, drawerV1 = false, onContinueRoute }: Props) {
  useGroupSessionGoal();
  useEffect(() => {
    const s = useSharedSession.getState();
    if (s.groupId && s.phase !== 'active') s.clearGroupSession();
  }, []);

  const t = useT(player);
  const tt = useT(together);
  // enable_unified_player_v1: the final canvas frame (name / bars / data on top, drawer pages, new buttons).
  const unified = useUnifiedPlayerV1() && drawerV1;
  // enable_pilot_ah_v1: AH23 turn row; AK2/AK3 (drawer layout) numbers in the drawer only, settings at
  // thumb reach, one GPS indicator.
  const pilotAh = usePilotAhV1();
  const tidy = pilotAh && drawerV1;
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
    // AK2: the chip already says searching / poor; a toast on top of it collided with it.
    if (gpsStatus === 'searching') { if (!tidy) setGpsToast('run.free.v2.gps.searching'); }
    else if (gpsStatus === 'poor') { if (!tidy) setGpsToast('run.free.v2.gps.poor'); }
    else if (gpsStatus === 'good' || gpsStatus === 'perfect') setGpsToast('run.free.v2.gps.good');
  }, [gpsStatus, tidy]);
  useEffect(() => {
    if (!gpsToast) return;
    const timer = setTimeout(() => setGpsToast(null), 4000);
    return () => clearTimeout(timer);
  }, [gpsToast]);

  // ── enable_unified_player_v1 (canvas 9ב): GPS mark, passing lines, lap page jump, route end ──
  const gps = useUnifiedGps(unified);
  const [closedLap, setClosedLap] = useState<CurrentLapView | null>(null);
  const [pageRequest, setPageRequest] = useState<{ id: string; nonce: number; holdMs: number } | null>(null);
  const prevLapCount = useRef(live.laps.length);
  useEffect(() => {
    const count = live.laps.length;
    const grew = count > prevLapCount.current;
    prevLapCount.current = count;
    if (!unified || !grew || count < 2) return;
    const done = currentLapView([{ ...live.laps[count - 2], isActive: true }]);
    if (!done || done.distanceKm <= 0) return;
    setClosedLap(done);
    setPageRequest({ id: 'lap', nonce: Date.now(), holdMs: 5000 });
  }, [unified, live.laps]);
  // Its own timer: the laps array changes every second (the active lap is live).
  useEffect(() => {
    if (!closedLap) return;
    const timer = setTimeout(() => setClosedLap(null), 5000);
    return () => clearTimeout(timer);
  }, [closedLap]);
  const [routeLoops, setRouteLoops] = useState(1);
  const [routeFree, setRouteFree] = useState(false);

  // ── Header height → map camera padding, turn card, recenter pill ─────
  const headerRef = useRef<HTMLDivElement>(null);
  // Map camera keeps the runner's marker between the header and the card
  // (the legacy framing put it right under the bottom card).
  // enable_pilot_ah_v1 (AH23): the next turn as one line here; MapShell keeps the big turn card off.
  const chrome = usePublishedPlayerChrome({ bottomGapPx: drawerV1 ? 0 : 12, headerIncludesSafeTop: true, drawer: drawerV1 });
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

  // Navigate-to-a-place (commute, enable_commute_v2_player_v1): the destination + remaining + arrival
  // in the header instead of the lap line (phone test AA2).
  const commuteContext = useRunningPlayer((s) => (s.sessionMode === 'commute' ? s.commuteContext : null));
  const commuteEta = useCommuteEta();
  // Board PlayerArrive: arrived at the start of the route this walk leads to → ask how to go on.
  const walkTarget = useWalkToStartStore((s) => s.route);
  const arriveRoute = onContinueRoute && commuteContext && commuteEta.hasArrived ? walkTarget : null;
  // enable_combo_flow_v1 (board PlayerMetrics): time + the mode's number + steps / pace / speed.
  const cells = live.combo
    ? aerobicCells({
        mode: live.combo.mode,
        activity: live.combo.activity,
        durationSec: live.totals.durationSec,
        distanceKm: live.totals.distanceKm,
        routeKm: live.combo.routeKm,
        etaSec: commuteEta.etaSeconds,
        paceSec: live.currentPaceSec,
      })
    : null;
  const lapOn = !live.combo || showLapButton(live.combo.mode, live.combo.activity);
  const chromeNodes = useFreeChromeNodes({ totals: live.totals, currentPaceSec: live.currentPaceSec, metric: live.metric, isPaused: live.isPaused, cells });
  const tg = useRunTogetherChrome({ live: chromeNodes.live, headerHeight: headerH + 56, metric: live.metric === 'speed' ? 'speed' : 'pace', enabled: drawerV1 });
  const situation: UnifiedSituation = commuteContext ? 'nav' : live.combo?.mode === 'route' ? 'route' : activityType === 'walking' ? 'free_walk' : 'free_run';
  const lapView = closedLap ?? currentLapView(live.laps);
  const drawerPages: RunDrawerPage[] | undefined = unified
    ? drawerPagesFor(situation, { lapOn }).map((id) => {
        if (id !== 'lap') return { id, caption: tt(PAGE_CAPTION_KEY[id]), compact: chromeNodes.compact, large: chromeNodes.large };
        const lapCells = (size: number) => (
          <Cells>
            <Cell label={tt('chrome.label.time')} value={fmtClock(lapView?.durationSec ?? 0)} size={size} />
            <Cell label={tt('chrome.label.km')} value={(lapView?.distanceKm ?? 0).toFixed(2)} size={size} />
            <Cell label={tt('chrome.label.pace')} value={lapView && lapView.paceSec > 0 ? fmtPace(lapView.paceSec) : '--:--'} size={size} />
          </Cells>
        );
        const lapCaption = closedLap ? tt('chrome.page.lapClosed', { n: closedLap.n }) : lapView ? tt('chrome.page.lapN', { n: lapView.n }) : tt(PAGE_CAPTION_KEY.lap);
        return { id, caption: lapCaption, compact: lapCells(26), large: lapCells(30) };
      })
    : undefined;
  // One passing line under the bars: GPS lost > lap closed > goal reached.
  const flash = !unified
    ? null
    : gps === 'lost'
      ? { text: tt('chrome.gps.lostHint'), tone: 'warn' as const }
      : closedLap
        ? { text: tt('chrome.hint.lapClosed', { n: closedLap.n, km: closedLap.distanceKm.toFixed(2), time: fmtClock(closedLap.durationSec) }), tone: 'info' as const }
        : goalToast && gv
          ? { text: tt('chrome.hint.goal', { target: gv.targetText }), tone: 'good' as const }
          : null;
  // Arrival at a navigation destination: start a workout here (a park) or finish and save.
  // The park id rides on the map's commute pin (set when the destination is a park), read before
  // finishWorkout clears it.
  const destParkId = useMapStore((st) => st.commuteDestination?.park?.id ?? null);
  const arrival = unified && commuteContext && arrivalDue({ situation, hasArrived: commuteEta.hasArrived, toRouteStart: !!arriveRoute || !!walkTarget, dismissed: false })
    ? (
      <ArrivalPanel
        place={commuteContext.label ?? live.title}
        km={live.totals.distanceKm.toFixed(2)}
        time={fmtClock(live.totals.durationSec)}
        onFinish={live.stop}
        onStartHere={destParkId ? async () => {
          const id = destParkId;
          await live.stop();
          const park = (await fetchRealParks()).find((pk) => pk.id === id);
          if (park) useMapStore.getState().openGlobalParkSheet(park);
        } : undefined}
      />
    )
    : null;
  const routeKm = live.combo?.routeKm ?? null;
  const routeEnd = unified && situation === 'route' && !routeFree && routeEndDue(live.totals.distanceKm, routeKm, routeLoops)
    ? (
      <RouteEndPanel
        name={live.title}
        km={(routeKm ?? 0).toFixed(1)}
        time={fmtClock(live.totals.durationSec)}
        onFinish={live.stop}
        onAgain={() => setRouteLoops((n) => n + 1)}
        onFree={() => setRouteFree(true)}
      />
    )
    : null;

  const startShellDrag = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    dragControls.start(e);
  };
  const commute = commuteContext ? commuteHeaderText(commuteEta, commuteContext.label, t) : null;
  const headerProps = {
    leading: <CartProgressIcon items={cartItems} onClick={onMinimize} size={48} ariaLabel={t('run.free.v2.lapsListAria', { done: String(cartItems.filter((i) => i.done).length) })} />,
    eyebrow: commute ? commute.eyebrow : gv ? `${live.title} · ${gv.targetText}` : live.title,
    eyebrowColor: '#4d7c0f',
    title: commute ? commute.title : gv ? gv.remainingText : t('run.free.v2.lapTitle', { n: String(lapNo), time: fmtClock(live.totals.durationSec) }),
    trailing: !commute && gv ? <span dir="ltr" className="shrink-0 whitespace-nowrap text-[14px] font-black tabular-nums text-v2-deep">{`${gv.percent}%`}</span> : null,
    strip: !commute && gv ? <HeaderProgressBar progress={gv.progress} color={V2_BLOCK_COLORS.easy} /> : null,
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
  return (
    <>
      {drawerV1 ? (
        <RunHeaderChrome
          outerRef={chrome.headerRef}
          innerRef={headerRef}
          onPointerDown={startShellDrag}
          layers={tg.layers(
            unified ? (
              <UnifiedHeaderLayer
                title={commute ? commute.eyebrow : live.title}
                bars={!commute && gv ? headerProps.strip : undefined}
                label={headerProps.title}
                hint={pilotAh ? <RouteTurnRow /> : undefined}
                flash={flash}
              />
            ) : (
            <div className="px-5">
              <div className="flex h-[46px] flex-col justify-center">
                {headerProps.strip}
                <div className="mt-2 text-center text-[13px] font-extrabold text-slate-600">{headerProps.eyebrow}</div>
              </div>
              {pilotAh && <RouteTurnRow />}
            </div>
            ),
          )}
          index={tg.layerIndex}
          onIndexChange={tg.setLayerIndex}
          strip={tidy ? [] : chromeNodes.strip}
          trailing={unified ? <UnifiedGpsMark state={gps} /> : undefined}
        />
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
        {!tidy && (
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          aria-label={t('run.free.v2.settings')}
          className="grid h-10 w-10 place-items-center rounded-full bg-white shadow-v2-ring active:scale-[0.97] transition-transform duration-150 ease-v2"
        >
          <Settings2 size={18} strokeWidth={2.3} className="text-v2-ink" aria-hidden />
        </button>
        )}
        <InviteRunButton activityType={activityType} inline />
        {!unified && (
        <div className="pointer-events-none">
          <GpsIndicator accuracy={gpsAccuracy} status={gpsStatus} />
        </div>
        )}
      </div>

      {gpsToast && !unified && <Toast>{t(gpsToast)}</Toast>}
      {goalToast && !unified && (
        <Toast tone="good">
          <Check size={15} strokeWidth={2.8} aria-hidden />
          {t('run.free.v2.goalReached')}
        </Toast>
      )}

      {!(drawerV1 && tg.on) && <SideRail participants={sideRailParticipants ?? []} storyBarHeight={headerH} onSelect={onSelectParticipant} />}

      {drawerV1 ? (
        <RunDrawerSheet
          cardRef={chrome.cardRef}
          onHeight={tg.setSheetHeight}
          onOpenList={onMinimize}
          compact={chromeNodes.compact}
          large={chromeNodes.large}
          pages={drawerPages}
          pageRequest={pageRequest}
          override={arrival ?? routeEnd ?? tg.vsPanel}
          overrideCaption={unified && !arrival && !routeEnd && tg.vsPanel ? tt('chrome.page.vs') : undefined}
          buttons={(
            <RunFloatingButtons
              unified={unified}
              isPaused={live.isPaused}
              onPause={live.pause}
              onResume={live.resume}
              onLap={lapOn ? live.lap : undefined}
              onStop={live.stop}
              {...(tidy ? {
                extra: (
                  <button
                    type="button"
                    onClick={() => setSettingsOpen(true)}
                    aria-label={t('run.free.v2.settings')}
                    className="pointer-events-auto mb-[22px] grid h-12 w-12 place-items-center rounded-full bg-white shadow-v2-ring active:scale-[0.97] transition-transform duration-150 ease-v2"
                  >
                    <Settings2 size={20} strokeWidth={2.3} className="text-v2-ink" aria-hidden />
                  </button>
                ),
              } : {})}
            />
          )}
        />
      ) : (
        <div ref={chrome.cardRef} className="absolute inset-x-3 z-10" style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}>
          {card}
        </div>
      )}

      {drawerV1 && tg.overlay}

      {arriveRoute && onContinueRoute && (
        <ArriveAtStartCard routeName={arriveRoute.name} routeKm={routeKmOf(arriveRoute)} walkedKm={live.totals.distanceKm} onContinue={onContinueRoute} />
      )}

      <WorkoutSettingsDrawer isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} sheet={tidy} />
    </>
  );
}
