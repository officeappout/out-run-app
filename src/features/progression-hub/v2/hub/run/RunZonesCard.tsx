'use client';

/**
 * Pace targets (PG-3) — NOT redesigned (owner, 23.10.2026): the existing
 * "where is this pace for you" zone ladder (RunZoneLadder) exactly as the run
 * briefing shows it, built from the runner's own zones; the next planned
 * session's main zone is highlighted.
 */
import { Card } from '@/components/ui/v2';
import { RunZoneLadder } from '@/features/workout-engine/players/running/components/preview-v2/RunBriefingParts';
import type { ZoneLadderItem } from '@/features/workout-engine/players/running/utils/run-preview/run-zone-ladder';

export default function RunZonesCard({ items }: { items: readonly ZoneLadderItem[] }) {
  if (items.length === 0) return null;
  return (
    <Card padding="none" className="px-4 py-3.5" data-run-zones>
      <RunZoneLadder items={items} />
    </Card>
  );
}
