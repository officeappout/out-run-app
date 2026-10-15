/**
 * The panel home — "מה קורה היום ומה מחכה לי". Pure, unit-tested part: the
 * weekly growth pulse from users + recent real workouts. The route adds the
 * "needs attention" counts (approvals, stale reports, invoices, failures).
 */
import { userChannel, CHANNEL_LABELS, type ChannelKey } from './journey-sources';

const DAY = 24 * 60 * 60 * 1000;

export interface HomeUser {
  uid: string;
  createdAt: Date;
  source: string | null;
  linkId: string | null;
  onboardingDone: boolean;
  onboardingCompletedAt: Date | null;
}

export interface HomeWorkout {
  uid: string;
  at: Date;
}

export interface WeekPulse {
  signupsThisWeek: number;
  signupsLastWeek: number;
  /** of users who signed up 8–14 days ago (a full 7-day window), % with a real workout within 7 days */
  activationPct: number | null;
  activationSample: number;
  activeThisWeek: number;
  activeLastWeek: number;
  /** trained 15–28 days ago, nothing in the last 14 */
  atRisk: number;
  /** finished onboarding ≥3 days ago (within the last 30), no real workout since signup */
  toNudge: number;
  topChannel: { key: ChannelKey; label: string; signups: number } | null;
}

export function computeWeekPulse(users: HomeUser[], workouts: HomeWorkout[], now = new Date()): WeekPulse {
  const t = now.getTime();
  const ago = (d: Date) => (t - d.getTime()) / DAY;

  const signupsThisWeek = users.filter((u) => ago(u.createdAt) < 7);
  const signupsLastWeek = users.filter((u) => ago(u.createdAt) >= 7 && ago(u.createdAt) < 14).length;

  const byUser = new Map<string, Date[]>();
  for (const w of workouts) {
    const arr = byUser.get(w.uid) ?? [];
    arr.push(w.at);
    byUser.set(w.uid, arr);
  }
  const trainedBetween = (uid: string, fromDaysAgo: number, toDaysAgo: number) =>
    (byUser.get(uid) ?? []).some((d) => ago(d) >= fromDaysAgo && ago(d) < toDaysAgo);

  // activation: cohort 8–14 days ago, first real workout within 7 days of signup
  const cohort = users.filter((u) => ago(u.createdAt) >= 8 && ago(u.createdAt) < 15);
  const activated = cohort.filter((u) =>
    (byUser.get(u.uid) ?? []).some((d) => d.getTime() >= u.createdAt.getTime() && d.getTime() - u.createdAt.getTime() <= 7 * DAY),
  ).length;

  const uids = Array.from(byUser.keys());
  const activeThisWeek = uids.filter((uid) => trainedBetween(uid, 0, 7)).length;
  const activeLastWeek = uids.filter((uid) => trainedBetween(uid, 7, 14)).length;
  const atRisk = uids.filter((uid) => trainedBetween(uid, 14, 28) && !trainedBetween(uid, 0, 14)).length;

  const toNudge = users.filter((u) => {
    if (!u.onboardingDone) return false;
    const since = u.onboardingCompletedAt ?? u.createdAt;
    if (ago(since) < 3 || ago(u.createdAt) > 30) return false;
    return !(byUser.get(u.uid) ?? []).some((d) => d.getTime() >= u.createdAt.getTime());
  }).length;

  const counts = new Map<ChannelKey, number>();
  for (const u of signupsThisWeek) {
    const ch = userChannel({ uid: u.uid, createdAt: u.createdAt, source: u.source, linkId: u.linkId, firstWorkoutAt: null }, new Map(), new Set());
    if (ch === 'organic') continue; // "top source" means a known one
    counts.set(ch, (counts.get(ch) ?? 0) + 1);
  }
  const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];

  return {
    signupsThisWeek: signupsThisWeek.length,
    signupsLastWeek,
    activationPct: cohort.length > 0 ? Math.round((activated / cohort.length) * 100) : null,
    activationSample: cohort.length,
    activeThisWeek,
    activeLastWeek,
    atRisk,
    toNudge,
    topChannel: top ? { key: top[0], label: CHANNEL_LABELS[top[0]], signups: top[1] } : null,
  };
}

export interface AttentionItem {
  key: string;
  label: string;
  /** null = this count failed to load (shown as such, never as 0) */
  count: number | null;
  href: string;
  tone: 'warn' | 'bad' | 'info';
}

export interface HomeTodayResponse {
  pulse: WeekPulse;
  attention: AttentionItem[];
}
