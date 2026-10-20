/**
 * The running plan's progress, read from running.activeProgram (P-4):
 * "שבוע 3 מתוך 8 · 7/9 אימונים בוצעו". Pure; no new data.
 */

export const RUN_DIST_LABEL: Record<string, string> = {
  '2k': '2 ק״מ',
  '3k': '3 ק״מ',
  '5k': '5 ק״מ',
  '10k': '10 ק״מ',
  maintenance: 'שמירה על כושר',
};

interface RunningLike {
  activeProgram?: {
    currentWeek?: number;
    startDate?: unknown;
    schedule?: { week?: number; status?: string }[];
  } | null;
  generatedProgramTemplate?: { name?: string; targetDistance?: string; canonicalWeeks?: number; canonicalFrequency?: number } | null;
  weeklyFrequency?: number;
}

export interface RunningPlanProgress {
  title: string;
  distKey: string | null;
  weeks: number;
  currentWeek: number;
  /** Sessions completed so far (all weeks). */
  done: number;
  /** Sessions scheduled up to and including the current week. */
  dueSoFar: number;
  total: number;
  frequency: number;
}

export function runningPlanProgress(running: RunningLike | null | undefined): RunningPlanProgress | null {
  const ap = running?.activeProgram;
  const schedule = Array.isArray(ap?.schedule) ? ap!.schedule! : [];
  if (!ap || schedule.length === 0) return null;
  const tpl = running?.generatedProgramTemplate ?? null;
  const maxWeek = schedule.reduce((m, s) => Math.max(m, s.week ?? 0), 0);
  const weeks = Math.max(maxWeek, tpl?.canonicalWeeks ?? 0, 1);
  const currentWeek = Math.min(Math.max(ap.currentWeek ?? 1, 1), weeks);
  const done = schedule.filter((s) => s.status === 'completed').length;
  const dueSoFar = schedule.filter((s) => (s.week ?? 0) <= currentWeek).length;
  const distKey = tpl?.targetDistance ?? null;
  const frequency =
    running?.weeklyFrequency ?? tpl?.canonicalFrequency ?? Math.max(1, Math.round(schedule.length / weeks));
  const title =
    distKey === 'maintenance'
      ? 'תוכנית לשמירה על כושר'
      : distKey && RUN_DIST_LABEL[distKey]
        ? `תוכנית ${RUN_DIST_LABEL[distKey]}`
        : tpl?.name || 'תוכנית ריצה';
  return { title, distKey, weeks, currentWeek, done, dueSoFar, total: schedule.length, frequency };
}
