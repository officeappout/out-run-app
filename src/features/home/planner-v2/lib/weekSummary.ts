/**
 * Planner v2 (enable_week_builder_v1) — the week section's numbers: "done / planned" and the
 * plan line under the title ("כוח + ריצה · 3 + 3 בשבוע"). Pure.
 */
import { TRACK_ORDER, type TrackKey } from '@/components/ui/v2/track-colors';

interface SessionLike {
  track: TrackKey;
  status?: 'done' | 'missed';
}
interface WeekLike {
  days: ReadonlyArray<{ sessions: readonly SessionLike[] }>;
}

export interface WeekProgress {
  done: number;
  total: number;
}

/** Every session of the week counts once (runs of the plan included); done = finished. */
export function weekProgress(week: WeekLike): WeekProgress {
  let done = 0;
  let total = 0;
  for (const d of week.days)
    for (const s of d.sessions) {
      total++;
      if (s.status === 'done') done++;
    }
  return { done, total };
}

export interface PlanLine {
  tracks: TrackKey[];
  counts: number[];
}

/** Tracks the week holds (TRACK_ORDER) with their session counts — the caller words it. */
export function planLineOf(week: WeekLike): PlanLine {
  const counts: Record<TrackKey, number> = { strength: 0, run: 0, walk: 0 };
  for (const d of week.days) for (const s of d.sessions) counts[s.track]++;
  const tracks = TRACK_ORDER.filter((t) => counts[t] > 0);
  return { tracks, counts: tracks.map((t) => counts[t]) };
}

/** Sunday ('YYYY-MM-DD') of the week holding `iso`. */
export function sundayOfKey(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() - d.getDay());
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
