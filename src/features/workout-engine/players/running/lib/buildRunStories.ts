import { formatPace } from '@/features/workout-engine/core/utils/formatPace';
import type { StoryContext, StorySpec, TrackData } from '../types/story-spec';

// ── Duration helper (supports h:mm:ss for long sessions) ──────────────────────
function fmtDuration(secs: number): string {
  if (!secs || secs <= 0) return '00:00';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ── Story definitions (plain consts — no hooks, no side effects) ──────────────

const distanceStory: StorySpec = {
  id: 'distance',
  kind: 'metric-goal',
  label: 'מרחק',
  render: 'fill',
  getValue: (ctx) => {
    const dist = ctx.totalDistance.toFixed(2);
    if (ctx.sessionGoal?.type === 'distance' && ctx.sessionGoal.value > 0) {
      return `${dist} / ${ctx.sessionGoal.value.toFixed(1)} ק"מ`;
    }
    return `${dist} ק"מ`;
  },
  getProgress: (ctx) => {
    if (ctx.sessionGoal?.type === 'distance' && ctx.sessionGoal.value > 0) {
      return Math.min(100, (ctx.totalDistance / ctx.sessionGoal.value) * 100);
    }
    return null;
  },
  visibleWhen: () => true,
};

const timeStory: StorySpec = {
  id: 'time',
  kind: 'metric-goal',
  label: 'זמן',
  render: 'fill',
  getValue: (ctx) => {
    const current = fmtDuration(ctx.totalDuration);
    if (ctx.sessionGoal?.type === 'time' && ctx.sessionGoal.value > 0) {
      return `${current} / ${fmtDuration(ctx.sessionGoal.value)}`;
    }
    return current;
  },
  getProgress: (ctx) => {
    if (ctx.sessionGoal?.type === 'time' && ctx.sessionGoal.value > 0) {
      return Math.min(100, (ctx.totalDuration / ctx.sessionGoal.value) * 100);
    }
    return null;
  },
  visibleWhen: () => true,
};

const versusStory: StorySpec = {
  id: 'versus',
  kind: 'versus',
  label: 'מובילות',
  render: 'track',
  getValue: (ctx) => {
    const gap = ctx.standings?.gapM ?? 0;
    if (gap > 0) return `מוביל ב-${gap} מ'`;
    if (gap < 0) return `מפגר ב-${Math.abs(gap)} מ'`;
    return 'שווה';
  },
  getTrack: (ctx): TrackData | null => {
    const { standings, totalDistance, sessionGoal } = ctx;
    if (!standings?.rival) return null;
    const rivalKm = standings.rival.distanceKm;
    const hasDistanceGoal = sessionGoal?.type === 'distance' && (sessionGoal.value ?? 0) > 0;
    const goalKm = hasDistanceGoal
      ? (sessionGoal!.value as number)
      : Math.max(totalDistance, rivalKm) * 1.25 || 1;
    return {
      meKm: totalDistance,
      rivalKm,
      goalKm,
      gapM: standings.gapM,
      myColor: '#00dcd0',
      rivalColor: standings.rival.color,
    };
  },
  visibleWhen: (ctx) => ctx.selectedUid !== null && (ctx.standings?.rival ?? null) !== null,
};

const groupAggregateStory: StorySpec = {
  id: 'group-distance',
  kind: 'group-aggregate',
  label: 'יחד',
  render: 'fill',
  getValue: (ctx) => {
    if (ctx.groupTotalDistance === null || ctx.groupGoalTarget === null) return '—';
    const current = ctx.groupTotalDistance.toFixed(2);
    const target = ctx.groupGoalTarget.toFixed(1);
    return `יחד ${current} / ${target} ק״מ · ${ctx.groupActiveCount ?? 0} משתתפים`;
  },
  getProgress: (ctx) => {
    if (ctx.groupTotalDistance === null || !ctx.groupGoalTarget) return null;
    return Math.min(100, (ctx.groupTotalDistance / ctx.groupGoalTarget) * 100);
  },
  // Hidden when unit is not distance (partner durations not tracked in presence)
  // or when no partners are tracked (groupActiveCount null → no group session).
  visibleWhen: (ctx) =>
    ctx.groupGoalUnit === 'distance' &&
    ctx.groupGoalTarget !== null &&
    ctx.groupActiveCount !== null,
};

// ── Builder (pure function — add new story consts + push here) ─────────────────

export function buildRunStories(ctx: StoryContext): StorySpec[] {
  const stories: StorySpec[] = [distanceStory, timeStory];
  if (versusStory.visibleWhen(ctx)) {
    stories.push(versusStory);
  }
  if (groupAggregateStory.visibleWhen(ctx)) {
    stories.push(groupAggregateStory);
  }
  return stories;
}

// Re-export formatPace so RunStoryBar doesn't need a second import path
export { formatPace };
