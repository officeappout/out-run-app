'use client';

/**
 * HybridSessionListV2 — the session list BEHIND the v2 hybrid player
 * (F-2e, F-3d) in the shared SessionListLayer frame: one section per leg,
 * a station as exercise cards with a box per set, a run leg in the same
 * boxes. The live leg is marked "עכשיו".
 *
 * enable_combo_flow_v1: the blocks sit on a side axis with the "you" dot (ComboAxisSection), and
 * while the stage-change choreography is on screen a tap anywhere skips to the next player.
 */

import React, { useMemo } from 'react';
import { useT } from '@/hooks/useT';
import { player } from '@/messages/ns/player';
import { Footprints } from 'lucide-react';
import { ExerciseSetsTable, StoryBars } from '@/components/ui/v2';
import { useParkLiveV2 } from '@/hooks/useParkLiveV2';
import { toStorySegments } from '../../engines/strip-item';
import { SessionListLayer } from '../../players/shared/v2';
import { useFreeRunLive } from '../../players/running/components/FreeRun/v2/useFreeRunLive';
import { useHybridPlayerV2 } from './HybridPlayerV2Context';
import { hybridListSections, listTotals } from './hybrid-v2-list';
import { HYBRID_V2_COLORS, headerView } from './hybrid-v2-view';
import { exerciseImageOf, exerciseNameOf } from './exercise-display';
import { useComboFlow } from './combo/ComboFlowContext';
import ComboAxisSection, { axisColor } from './combo/ComboAxisSection';
import { comboDotIndex, comboSkippable } from './combo/combo-list';
import HybridJourneyAxis from '@/features/parks/core/components/hybrid/HybridJourneyAxis';
import { useUnifiedPlayerV1 } from '../../players/shared/v2/useUnifiedPlayerV1';

function RunThumb() {
  return (
    <div className="grid h-[58px] w-[58px] shrink-0 place-items-center bg-[#ecfccb] text-[#65a30d]" aria-hidden>
      <Footprints size={22} strokeWidth={2.3} />
    </div>
  );
}

export default function HybridSessionListV2({ onClose }: { onClose: () => void }) {
  const t = useT(player);
  const api = useHybridPlayerV2();
  const { totals } = useFreeRunLive();
  // Pilot M24 (enable_park_live_v2): the list behind had no progress during the walk; the same
  // story bars as the header (walk legs fill live from the strip).
  const parkLive = useParkLiveV2();
  const sections = useMemo(
    () => (api?.enabled ? hybridListSections(api.plan, api.legs, api.names, exerciseNameOf, exerciseImageOf, t) : []),
    [api?.enabled, api?.plan, api?.legs, api?.names, t],
  );
  const combo = useComboFlow();
  // enable_unified_player_v1 (AL2): the back layer is the route overview's own timeline
  // (HybridJourneyAxis, the "מהלך האימון" of the route + stops overview), not a separate strip.
  // The stage choreography (combo reveal / move / open) still runs on its axis with the moving dot.
  const unified = useUnifiedPlayerV1();
  if (!api?.enabled || !api.view) return null;
  const overviewAxis = unified && !combo.stage;
  const dot = combo.on ? comboDotIndex(sections.map((x) => x.status), combo.kind, combo.stage) : -1;
  const withThumb = (x: (typeof sections)[number]) => (x.kind === 'run' ? x.rows.map((r) => ({ ...r, thumb: <RunThumb /> })) : x.rows);
  const h = headerView(api.view, api.plan, api.names, api.label, t);

  return (
    <SessionListLayer
      subtitle={t('hybrid.v2.list.subtitle', { eyebrow: h.eyebrow, count: String(api.plan.length) })}
      onClose={onClose}
      safeTop={false}
      totals={listTotals(sections, totals.durationSec, totals.distanceKm, t)}
    >
      {parkLive && !unified && api.strip && (
        <StoryBars
          className="mt-3"
          segments={toStorySegments(api.strip)}
          currentIndex={api.strip.currentIndex}
          progress={api.strip.progress}
        />
      )}
      {combo.on && comboSkippable(combo.stage) && (
        <button type="button" onClick={combo.skip} aria-label={t('hybrid.v2.combo.skipAria')} className="fixed inset-0 z-30 cursor-default bg-transparent" />
      )}
      {overviewAxis ? (
        <div className="mt-4">
          <HybridJourneyAxis v2 segments={api.plan} />
        </div>
      ) : combo.on ? (
        <div className="mt-4">
          {sections.map((s, i) => (
            <ComboAxisSection
              key={s.key}
              section={s}
              rows={withThumb(s)}
              hasDot={i === dot}
              nextColor={sections[i + 1] ? axisColor(sections[i + 1].kind) : null}
            />
          ))}
        </div>
      ) : (
      <div className="mt-4 space-y-5">
        {sections.map((s) => (
          <section key={s.key} aria-current={s.status === 'active' ? 'step' : undefined}>
            <div className="mb-1.5 flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: s.kind === 'run' ? HYBRID_V2_COLORS.run : HYBRID_V2_COLORS.strength }}
                aria-hidden
              />
              <h3 className="min-w-0 truncate whitespace-nowrap text-[15px] font-black text-v2-ink">{s.title}</h3>
              {s.status === 'active' && (
                <span className="shrink-0 whitespace-nowrap rounded-full bg-v2-tint px-2 py-0.5 text-[11.5px] font-extrabold text-v2-deep ring-1 ring-inset ring-v2-accent/40">
                  {t('hybrid.v2.list.status.active')}
                </span>
              )}
              <span className="ms-auto shrink-0 whitespace-nowrap text-[12px] font-bold text-v2-muted">{s.meta}</span>
            </div>
            <ExerciseSetsTable hideLegend rows={withThumb(s)} />
          </section>
        ))}
      </div>
      )}
    </SessionListLayer>
  );
}
