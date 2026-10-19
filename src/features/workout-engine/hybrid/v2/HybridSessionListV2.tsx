'use client';

/**
 * HybridSessionListV2 — the session list BEHIND the v2 hybrid player
 * (F-2e, F-3d) in the shared SessionListLayer frame: one section per leg,
 * a station as exercise cards with a box per set, a run leg in the same
 * boxes. The live leg is marked "עכשיו".
 */

import React, { useMemo } from 'react';
import { Footprints } from 'lucide-react';
import { ExerciseSetsTable } from '@/components/ui/v2';
import { SessionListLayer } from '../../players/shared/v2';
import { useFreeRunLive } from '../../players/running/components/FreeRun/v2/useFreeRunLive';
import { useHybridPlayerV2 } from './HybridPlayerV2Context';
import { hybridListSections, listTotals } from './hybrid-v2-list';
import { HYBRID_V2_COLORS, headerView } from './hybrid-v2-view';
import { exerciseImageOf, exerciseNameOf } from './exercise-display';

function RunThumb() {
  return (
    <div className="grid h-[58px] w-[58px] shrink-0 place-items-center bg-[#ecfccb] text-[#65a30d]" aria-hidden>
      <Footprints size={22} strokeWidth={2.3} />
    </div>
  );
}

export default function HybridSessionListV2({ onClose }: { onClose: () => void }) {
  const api = useHybridPlayerV2();
  const { totals } = useFreeRunLive();
  const sections = useMemo(
    () => (api?.enabled ? hybridListSections(api.plan, api.legs, api.names, exerciseNameOf, exerciseImageOf) : []),
    [api?.enabled, api?.plan, api?.legs, api?.names],
  );
  if (!api?.enabled || !api.view) return null;
  const h = headerView(api.view, api.plan, api.names, api.label);

  return (
    <SessionListLayer
      subtitle={`${h.eyebrow} · ${api.plan.length} בלוקים`}
      onClose={onClose}
      safeTop={false}
      totals={listTotals(sections, totals.durationSec, totals.distanceKm)}
    >
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
                  עכשיו
                </span>
              )}
              <span className="ms-auto shrink-0 whitespace-nowrap text-[12px] font-bold text-v2-muted">{s.meta}</span>
            </div>
            <ExerciseSetsTable
              hideLegend
              rows={s.kind === 'run' ? s.rows.map((r) => ({ ...r, thumb: <RunThumb /> })) : s.rows}
            />
          </section>
        ))}
      </div>
    </SessionListLayer>
  );
}
