/**
 * Forecast rows + their trend (pure): the main-distance forecast now and 2 / 4 /
 * 6 weeks ago, rebuilt from the pace self-correction history the same way the
 * home's forecast card computes its 30-day chip (basePaceDaysAgo).
 */
import { basePaceDaysAgo, selectRacePrediction, type PaceHistoryRecord, type RaceRow } from '@/features/home/utils/race-prediction';
import { forecastTrend } from './run-page.model';

export interface ForecastModel {
  rows: RaceRow[];
  trend: { daysAgo: number; seconds: number }[];
}

export function forecastModel(
  pace: { basePace?: number; qualityWorkoutsHistory?: readonly PaceHistoryRecord[] } | null | undefined,
  targetDistance: unknown,
  now: Date,
): ForecastModel {
  const basePace = pace?.basePace ?? 0;
  const history = pace?.qualityWorkoutsHistory ?? null;
  const at = (bp: number | null) =>
    bp && bp > 0 ? selectRacePrediction({ basePace: bp, targetDistance, history: null, isRunner: true, runningProgramsEnabled: false, now }) : null;
  const nowView = at(basePace);
  if (!nowView || nowView.state !== 'ready') return { rows: [], trend: [] };
  const points = [42, 28, 14, 0].map((daysAgo) => {
    const bp = daysAgo === 0 ? basePace : basePaceDaysAgo(basePace, history, now, daysAgo);
    const v = at(bp);
    return { daysAgo, seconds: v && v.state === 'ready' ? v.main.seconds : null };
  });
  return { rows: [nowView.main, ...nowView.others], trend: forecastTrend(points) };
}
