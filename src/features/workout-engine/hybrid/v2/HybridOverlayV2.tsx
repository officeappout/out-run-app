'use client';

/**
 * HybridOverlayV2 — the home-v2 hybrid player over the live map (inside
 * FreeRunLayer's TOP layer; TwoLayerShell owns the drag, the session list
 * is the layer behind). Boards U-D1..U-D4, F-2b..F-2d, F-3b/F-3c.
 *
 *   top    — header card: cart icon (opens the list, ring = legs + sets),
 *            "ריצה + כוח", the leg / station line, the session clock, and
 *            story bars from the same strip as the ring.
 *   bottom — run / cool-down: HybridRunLegV2; transition: the countdown
 *            card; station: nothing (StrengthRunner owns the screen).
 * enable_unified_player_v1: walking AND running legs use ParkWalkSheet (the attached
 * drawer; `running` adds pace + lap), and the header carries the tour's "pull down" anchor.
 */

import React from 'react';
import { useT } from '@/hooks/useT';
import { player } from '@/messages/ns/player';
import type { useDragControls } from 'framer-motion';
import { CartProgressIcon, StoryBars } from '@/components/ui/v2';
import GpsIndicator from '@/features/workout-engine/components/GpsIndicator';
import { PlayerHeaderCard, usePublishedHeaderHeight, usePublishedPlayerChrome } from '../../players/shared/v2';
import { useRunningPlayer } from '../../players/running/store/useRunningPlayer';
import { useSessionStore } from '../../core/store/useSessionStore';
import { fmtClock } from '../../players/running/lib/planned-rep-results';
import { toCartItems, toStorySegments } from '../../engines/strip-item';
import { useHybridPlayerV2 } from './HybridPlayerV2Context';
import { headerView } from './hybrid-v2-view';
import HybridRunLegV2 from './HybridRunLegV2';
import HybridTransitionCardV2 from './HybridTransitionCardV2';
import { useParkLiveV2 } from '@/hooks/useParkLiveV2';
import { isWalkingLeg, unifiedLegSheet } from '../park-live-v2';
import ParkWalkDrawer from './park/ParkWalkDrawer';
import ParkMessageRow from './park/ParkMessageRow';
import ComboStartChip from './combo/ComboStartChip';
import ParkWalkSheet from './park/ParkWalkSheet';
import { RunHeaderChrome, UnifiedGpsMark, UnifiedHeaderLayer } from '../../players/shared/v2/run-chrome';
import { useUnifiedPlayerV1 } from '../../players/shared/v2/useUnifiedPlayerV1';
import { useUnifiedGps } from '../../players/running/hooks/useUnifiedGps';
import { useComboFlow } from './combo/ComboFlowContext';

import { useUiDir } from '@/lib/i18n/useUiDir';
interface Props {
  dragControls: ReturnType<typeof useDragControls>;
  /** Reveal the session list behind (TwoLayerShell). */
  onMinimize: () => void;
}

export default function HybridOverlayV2({ dragControls, onMinimize }: Props) {
  const { direction } = useUiDir();
  const t = useT(player);
  const api = useHybridPlayerV2();
  const totalDuration = useSessionStore((s) => s.totalDuration);
  const gpsStatus = useRunningPlayer((s) => s.gpsStatus);
  const gpsAccuracy = useRunningPlayer((s) => s.gpsAccuracy);
  const header = usePublishedHeaderHeight();
  // Map camera keeps the runner's marker between the header and the card.
  const chrome = usePublishedPlayerChrome({ bottomGapPx: 12, headerIncludesSafeTop: true });
  // enable_park_live_v2 (boards Park 1-2): walking legs get the walk drawer + the station message row.
  const parkLive = useParkLiveV2();
  // enable_combo_flow_v1: the start chip under the header (board PlayerTransitionStart).
  const combo = useComboFlow();
  // enable_unified_player_v1: the run players' frame (top fade with name / bars / data, attached
  // drawer with pages, the new buttons). Pull the header down for the session list (no cart icon).
  const unified = useUnifiedPlayerV1();
  const gps = useUnifiedGps(unified);
  if (!api?.enabled || !api.view || !api.strip) return null;

  const view = api.view;
  const h = headerView(view, api.plan, api.names, api.label, t);
  const cart = toCartItems(api.strip);
  const walkLeg = view.phase === 'run' || view.phase === 'cooldown' || view.phase === 'idle';
  const parkWalk = parkLive && walkLeg && isWalkingLeg(view);
  // enable_combo_flow_v1: the arrival card is the attached bottom sheet too.
  const arrival = combo.on && view.phase === 'transition';
  // Walking and running legs both get the attached drawer under the flag (running: pace + lap).
  const unifiedLeg = unified ? unifiedLegSheet(view) : null;

  // The tour anchors wrap the cart and the bars only under the flag, so the flag-off DOM is unchanged.
  const cartIcon = (
    <CartProgressIcon items={cart} onClick={onMinimize} size={48} ariaLabel={t('hybrid.v2.overlay.cartAria', { count: String(api.strip.doneCount) })} />
  );
  const storyBars = <StoryBars segments={toStorySegments(api.strip)} currentIndex={api.strip.currentIndex} progress={api.strip.progress} />;
  const startDrag = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    dragControls.start(e);
  };
  return (
    <>
      {unified ? (
        <RunHeaderChrome
          outerRef={chrome.headerRef}
          innerRef={header.ref}
          coach={parkLive ? 'park-live-header' : undefined}
          onPointerDown={startDrag}
          layers={[
            <UnifiedHeaderLayer
              key="blocks"
              title={h.eyebrow}
              bars={<div data-coach="park-live-bars">{storyBars}</div>}
              label={h.title}
              hint={parkLive ? <ParkMessageRow api={api} /> : undefined}
            />,
          ]}
          index={0}
          onIndexChange={() => {}}
          strip={[]}
          trailing={<UnifiedGpsMark state={gps} />}
        />
      ) : (
      <div ref={chrome.headerRef} className="absolute inset-x-0 top-0 z-10" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div ref={header.ref} className="px-3 pt-2">
          <PlayerHeaderCard
            onPointerDown={(e) => {
              if ((e.target as HTMLElement).closest('button')) return;
              dragControls.start(e);
            }}
            leading={parkLive ? <span data-coach="park-live-list">{cartIcon}</span> : cartIcon}
            eyebrow={h.eyebrow}
            eyebrowColor={h.color}
            title={h.title}
            trailing={
              <span dir="ltr" className="shrink-0 whitespace-nowrap text-[15px] font-black tabular-nums text-v2-ink">
                {fmtClock(Number.isFinite(totalDuration) ? totalDuration : 0)}
              </span>
            }
            strip={parkLive ? <div data-coach="park-live-bars">{storyBars}</div> : storyBars}
          />
          {parkLive && <ParkMessageRow api={api} />}
        </div>
      </div>
      )}

      {combo.on && <ComboStartChip top={`calc(env(safe-area-inset-top, 0px) + ${header.height + 12}px)`} />}

      {!unified && (
      <div className="pointer-events-none absolute left-4 z-10" style={{ top: `calc(env(safe-area-inset-top, 0px) + ${header.height + 16}px)` }}>
        <GpsIndicator accuracy={gpsAccuracy} status={gpsStatus} />
      </div>
      )}

      {unifiedLeg && !arrival ? (
        <div className="pointer-events-none absolute inset-0 z-10" dir={direction}>
          <ParkWalkSheet api={api} onOpenList={onMinimize} cardRef={chrome.cardRef} running={unifiedLeg === 'run'} />
        </div>
      ) : parkWalk || arrival ? (
        <div ref={chrome.cardRef} className="absolute inset-x-0 bottom-0 z-10" dir={direction}>
          {arrival ? <HybridTransitionCardV2 api={api} arrival /> : <ParkWalkDrawer api={api} onOpenList={onMinimize} />}
        </div>
      ) : (
      <div ref={chrome.cardRef} className="absolute inset-x-3 z-10" style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }} dir={direction}>
        {view.phase === 'transition' ? (
          <HybridTransitionCardV2 api={api} />
        ) : view.phase === 'run' || view.phase === 'cooldown' || view.phase === 'idle' ? (
          <HybridRunLegV2 api={api} />
        ) : null}
      </div>
      )}
    </>
  );
}
