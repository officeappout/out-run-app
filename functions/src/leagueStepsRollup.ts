/**
 * leagueStepsRollup — every hour, today's and yesterday's steps
 * (dailyActivity.steps) into the league aggregates: 3 points per 1,000 steps
 * (lib/apply-league-stats.ts applyStepsToLeagueStats — idempotent by delta,
 * so re-running only adds what's new). Yesterday is included so the steps
 * walked after the last run before midnight still count.
 *
 * The same pass adds the day's distance (dailyActivity.distanceMeters, or the
 * steps estimate) as a separate km tally — shown next to the points, never
 * part of them. A day under 1,000 steps still adds its km (no points).
 *
 * Scheduled, not a dailyActivity write trigger, for the same reason as
 * dailyActivityPublicSync: passive health sync writes that doc many times a
 * day, and the leagues are not a real-time screen.
 *
 * SCALE (19.10.2026, architecture audit)
 * ──────────────────────────────────────
 * Was: one unbounded where(date ==) read per day, then one user read + one
 * transaction per doc, sequentially, every hour — even for days that hadn't
 * changed since the last run. Now:
 *   - each day is read in cursor pages (PAGE_SIZE, at most MAX_PAGES);
 *   - per page, the days' league_steps_applied markers are read in ONE
 *     getAll and a day whose steps / km haven't grown (stepsDayNeedsApply —
 *     the transaction's own delta arithmetic) is skipped: no user read, no
 *     transaction. Only changed days reach applyStepsToLeagueStats, which
 *     re-checks the delta inside its transaction, so it stays idempotent;
 *   - changed days run APPLY_CONCURRENCY transactions at a time.
 * Why not "updatedAt >= last run": dailyActivity has no reliable change
 * stamp — the server health sync (ingestHealthSamples) writes
 * lastPassiveSyncAt and the app writes updatedAt, never both — so a
 * timestamp filter would miss one of the two writers. The marker check
 * catches both.
 */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import { applyStepsToLeagueStats } from './lib/apply-league-stats';
import { distanceMetersOfDay, stepsDayNeedsApply } from './lib/league-scope-stats';
import { envInt, forEachQueryPage, mapWithConcurrency } from './lib/paginate';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const PAGE_SIZE = envInt(process.env.LEAGUE_STEPS_PAGE_SIZE, 300, 500);
/** Per day (default 50 → 15,000 user-days). */
const MAX_PAGES = envInt(process.env.LEAGUE_STEPS_MAX_PAGES, 50, 200);
/** Parallel applyStepsToLeagueStats transactions. */
const APPLY_CONCURRENCY = 10;

function jerusalemDate(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}

interface DayRow {
  uid: string;
  steps: unknown;
  distanceMeters: unknown;
}

/** dailyActivity docs of one page → the rows that could add anything at all. */
function rowsOf(docs: admin.firestore.QueryDocumentSnapshot[]): DayRow[] {
  const rows: DayRow[] = [];
  for (const doc of docs) {
    const d = doc.data();
    const uid = typeof d.userId === 'string' ? d.userId : '';
    const hasStepPoints = typeof d.steps === 'number' && d.steps >= 1000;
    if (!uid || !(hasStepPoints || distanceMetersOfDay(d.steps, d.distanceMeters) > 0)) continue;
    rows.push({ uid, steps: d.steps, distanceMeters: d.distanceMeters });
  }
  return rows;
}

export const leagueStepsRollup = onSchedule(
  { schedule: '15 * * * *', timeZone: 'Asia/Jerusalem', timeoutSeconds: 540, memory: '512MiB' },
  async () => {
    const now = new Date();
    const days = [jerusalemDate(now), jerusalemDate(new Date(now.getTime() - 24 * 3600 * 1000))];
    const tally: Record<string, number> = {};
    const bump = (k: string, n = 1) => {
      tally[k] = (tally[k] ?? 0) + n;
    };

    for (const date of days) {
      try {
        const stats = await forEachQueryPage(
          db.collection('dailyActivity').where('date', '==', date),
          { pageSize: PAGE_SIZE, maxPages: MAX_PAGES },
          async (docs) => {
            const rows = rowsOf(docs);
            if (!rows.length) return;
            // One batched read of the markers — the delta pre-check.
            const markers = await db.getAll(...rows.map((r) => db.collection('league_steps_applied').doc(`${r.uid}_${date}`)));
            const changed = rows.filter((r, i) => stepsDayNeedsApply(markers[i].data(), r.steps, r.distanceMeters));
            bump('unchanged', rows.length - changed.length);
            await mapWithConcurrency(changed, APPLY_CONCURRENCY, async (r) => {
              try {
                const res = await applyStepsToLeagueStats(
                  db,
                  () => admin.firestore.FieldValue.serverTimestamp(),
                  r.uid,
                  date,
                  r.steps,
                  r.distanceMeters,
                );
                bump(res);
              } catch (e) {
                bump('error');
                logger.warn('leagueStepsRollup: one user failed', { uid: r.uid, date, e });
              }
            });
          },
        );
        bump('docsRead', stats.read);
        if (stats.truncated) logger.warn('leagueStepsRollup: stopped at MAX_PAGES (raise LEAGUE_STEPS_MAX_PAGES)', { date, maxPages: MAX_PAGES });
      } catch (e) {
        // A failed page ends this day; what was applied stays applied (idempotent), the rest is picked up next hour.
        bump('pageError');
        logger.error('leagueStepsRollup: page read failed', { date, e });
      }
    }
    logger.info('leagueStepsRollup done', { days, tally });
  },
);
