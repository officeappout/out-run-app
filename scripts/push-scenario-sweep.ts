/**
 * push-scenario-sweep.ts — Push Notification Decision Sweep.
 *
 * The push-decision analog of scripts/scenario-sweep.ts (the 560-scenario
 * workout-content coherence sweep) — same shape (deterministic matrix of
 * cells, run-the-real-decision-logic, structured findings), but auditing
 * WHICH PUSH FIRES/SUPPRESSES across a grid of user states instead of
 * content coherence.
 *
 * SOURCE OF TRUTH — every constant below is a faithful, cited mirror of
 * functions/src/services/push.service.ts (module-scoped there, so it can't
 * be imported directly — same "duplicated here deliberately, zero
 * dependency on the app's TS module graph" convention already used by
 * scripts/_migrate-persona-cleanup.ts's PERSONA_MAP). This script makes
 * ZERO Firestore reads/writes and ZERO FCM calls — pure arithmetic over
 * synthetic scenario state, so it can enumerate thousands of rows in
 * milliseconds. It does not call sendPush() or any live resolver.
 *
 * DESIGN NOTES (agreed before generating, see chat):
 *  - `persona` is FIXED to one representative value ('parent'), not swept.
 *    Confirmed by code inspection: push.service.ts's decision logic (quiet
 *    hours / rate cap / daily cap / recipient resolution) never reads
 *    persona — it only affects which CONTENT STRING gets picked, which
 *    isn't a column in this sweep's output. Sweeping 7 personas would
 *    7x the row count for zero new decision coverage. Still labeled per
 *    row for traceability.
 *  - `daily_engagement_count_before` {0,1,2,3} is only varied for triggers
 *    where it's causally reachable (channel ∈ ENGAGEMENT_CHANNELS AND not
 *    isPersonalInteraction) — fixed at 0 for the exempt triggers (kudos,
 *    group-join, level-up), since varying it there can't change the
 *    outcome and would only pad the CSV with duplicate rows.
 *  - GAP, FLAGGED NOT SILENTLY SKIPPED: the approved axis set has no
 *    "recently sent on this channel" dimension, so the per-channel
 *    RATE_CAP_HOURS gate is never exercised — every row assumes the
 *    recipient is not currently rate-capped. `suppressed_reason` can
 *    therefore never come out as 'channel_cap' in this run, even though
 *    it's a real gate in production. See the summary's "KNOWN GAP" note.
 *    Adding a `recently_sent_on_channel: bool` axis would close this with
 *    a 2x row multiplier on the triggers where it's reachable — flagged
 *    for a follow-up run if wanted.
 *  - Recipient existence (no_recipients) is checked BEFORE quiet hours,
 *    matching real control flow: every event-driven trigger in this
 *    codebase resolves its recipient set and early-returns BEFORE ever
 *    calling sendPush() when that set is empty (e.g.
 *    onPlannedActivityCreated.ts:228's `if (recipients.size === 0) return`)
 *    — sendPush()'s own quiet-hours/daily-cap checks are never reached in
 *    that case. Precedence here: no_recipients → quiet_hours → daily_cap
 *    → fired.
 *  - `chat` is excluded — trivial gate (rateCapHours=0, skipQuietHours=
 *    true, no engagement-channel membership), not in the requested
 *    trigger list, not interesting to enumerate.
 *
 * Run:
 *   npx tsx scripts/push-scenario-sweep.ts
 *
 * Output:
 *   docs/research/push-scenario-sweep.csv   — one row per scenario
 *   docs/research/push-scenario-sweep-summary.txt — plain-text findings
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

// ─── Mirrored constants (functions/src/services/push.service.ts) ──────────

const QUIET_START_HOUR = 22; // push.service.ts:72
const QUIET_END_HOUR = 7; // push.service.ts:73 — window is hour >= 22 || hour < 7
const DAILY_ENGAGEMENT_CAP = 3; // push.service.ts:82

// push.service.ts:112-119
const ENGAGEMENT_CHANNELS = new Set([
  'health_milestone',
  'training_reminder',
  'social',
  'community',
  'retention',
  'onboarding_dropoff',
]);

function isQuietHour(hour: number): boolean {
  return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
}

// ─── Fixed representative persona (see header note) ────────────────────────

const PERSONA_LABEL = 'parent';

// ─── Trigger definitions ────────────────────────────────────────────────────

interface TriggerDef<S> {
  id: string;
  channel: string; // 'varies' for admin-broadcast, resolved per-row instead
  skipQuietHours: boolean;
  isPersonalInteraction: boolean;
  sourceFile: string;
  /** Extra scenario axes beyond hour + daily_count. Cartesian product. */
  axes: Array<{ name: string; values: Array<string | number | boolean> }>;
  /** Does daily_engagement_count_before vary for this trigger? */
  variesDailyCount: boolean;
  /** Given the row's extra-axis values, is there a recipient at all? */
  hasRecipient: (state: S) => boolean;
  /** Resolve the channel actually used for this row (constant, or varies). */
  resolveChannel: (state: S) => string;
  /** Representative deep-link string for this row. */
  deepLink: (state: S) => string;
}

type Row = Record<string, string | number | boolean>;

const TRIGGERS: TriggerDef<Row>[] = [
  {
    id: 'friend-published-nearby',
    channel: 'community',
    skipQuietHours: false,
    isPersonalInteraction: false,
    sourceFile: 'functions/src/onPlannedActivityCreated.ts',
    variesDailyCount: true,
    axes: [
      { name: 'has_partner', values: [true, false] },
      { name: 'has_nearby', values: [true, false] },
      { name: 'privacy_mode', values: ['verified_global', 'squad', 'ghost'] },
    ],
    hasRecipient: (s) => {
      if (s.privacy_mode === 'ghost') return false;
      if (s.privacy_mode === 'squad') return !!s.has_partner;
      return !!s.has_partner || !!s.has_nearby; // verified_global — both axes
    },
    resolveChannel: () => 'community',
    deepLink: () => '/map?openPark=<id> (or openRoute=<id>)',
  },
  {
    id: 'kudos-received',
    channel: 'social',
    skipQuietHours: false,
    isPersonalInteraction: true,
    sourceFile: 'functions/src/onKudosCreated.ts',
    variesDailyCount: false,
    axes: [],
    hasRecipient: () => true,
    resolveChannel: () => 'social',
    deepLink: () => '/activity',
  },
  {
    id: 'group-join',
    channel: 'social',
    skipQuietHours: false,
    isPersonalInteraction: true,
    sourceFile: 'functions/src/onGroupMemberJoin.ts',
    variesDailyCount: false,
    axes: [{ name: 'role', values: ['joiner', 'admin'] }],
    // Both sends assumed deliverable (role='admin' assumes an admin exists
    // and differs from the joiner — the realistic case; the edge case of
    // the group creator bootstrapping their own admin role is a separate,
    // pre-sendPush early-return in the source and out of scope here).
    hasRecipient: () => true,
    resolveChannel: () => 'social',
    deepLink: () => '/community/<groupId>',
  },
  {
    id: 'level-up',
    channel: 'progression',
    skipQuietHours: false,
    isPersonalInteraction: false,
    sourceFile: 'functions/src/onLevelUp.ts',
    variesDailyCount: false, // channel excluded from ENGAGEMENT_CHANNELS anyway
    axes: [],
    hasRecipient: () => true,
    resolveChannel: () => 'progression',
    deepLink: () => '/',
  },
  {
    id: 'scheduled-training-reminder',
    channel: 'training_reminder',
    skipQuietHours: true,
    isPersonalInteraction: false,
    sourceFile: 'functions/src/trainingReminderScheduler.ts',
    variesDailyCount: true,
    axes: [{ name: 'has_incomplete_session_today', values: [true, false] }],
    hasRecipient: (s) => !!s.has_incomplete_session_today,
    resolveChannel: () => 'training_reminder',
    deepLink: () => '/',
  },
  {
    id: 'step-goal',
    channel: 'health_milestone',
    skipQuietHours: true,
    isPersonalInteraction: false,
    sourceFile: 'functions/src/stepGoalNudgeScheduler.ts',
    variesDailyCount: true,
    axes: [{ name: 'below_goal', values: [true, false] }],
    hasRecipient: (s) => !!s.below_goal,
    resolveChannel: () => 'health_milestone',
    deepLink: () => '/map?openRun=walking&targetSteps=<n>',
  },
  {
    id: 'onboarding-dropoff',
    channel: 'onboarding_dropoff',
    skipQuietHours: true,
    isPersonalInteraction: false,
    sourceFile: 'functions/src/onboardingDropoffDispatcher.ts',
    variesDailyCount: true,
    axes: [
      {
        name: 'onboarding_state',
        values: ['stale_incomplete', 'fresh_incomplete', 'completed'],
      },
    ],
    hasRecipient: (s) => s.onboarding_state === 'stale_incomplete',
    resolveChannel: () => 'onboarding_dropoff',
    deepLink: () => '/onboarding-new/selection',
  },
  {
    id: 'inactivity-retention',
    channel: 'retention',
    skipQuietHours: true,
    isPersonalInteraction: false,
    sourceFile: 'functions/src/retentionScheduler.ts',
    variesDailyCount: true,
    axes: [{ name: 'days_inactive', values: [0, 1, 2, 3, 7] }],
    hasRecipient: (s) => Number(s.days_inactive) >= 7, // INACTIVITY_DAYS
    resolveChannel: () => 'retention',
    deepLink: () => '/',
  },
  {
    id: 'admin-broadcast',
    channel: 'varies',
    skipQuietHours: true,
    isPersonalInteraction: false,
    sourceFile: 'functions/src/sendPushFromQueue.ts',
    variesDailyCount: true,
    axes: [
      {
        name: 'audience_type',
        values: ['all', 'active_users', 'inactive_users', 'park_users'],
      },
      { name: 'channel_choice', values: ['encouragement', 'community'] },
    ],
    // Assumes the resolved audience query is non-empty — a real 0-result
    // query is an edge case not modeled here.
    hasRecipient: () => true,
    resolveChannel: (s) => String(s.channel_choice),
    deepLink: () => 'n/a (admin-typed per broadcast; empty = no navigation)',
  },
];

const DAILY_COUNT_VALUES = [0, 1, 2, 3];
const HOURS = Array.from({ length: 24 }, (_, h) => h);

// ─── Decision logic (mirrors push.service.ts's real precedence) ───────────

interface Decision {
  fired: boolean;
  suppressedReason: 'quiet_hours' | 'daily_cap' | 'no_recipients' | 'n/a';
}

function decide(trigger: TriggerDef<Row>, state: Row, hour: number): Decision {
  // 1. Recipient resolution — happens at the CALLER level, before sendPush
  //    is ever invoked in every real trigger file (see header note).
  if (!trigger.hasRecipient(state)) {
    return { fired: false, suppressedReason: 'no_recipients' };
  }

  // 2. Quiet hours — checked once, before the per-uid loop, inside sendPush.
  if (!trigger.skipQuietHours && isQuietHour(hour)) {
    return { fired: false, suppressedReason: 'quiet_hours' };
  }

  // 3. Daily engagement cap — only reachable on engagement channels that
  //    aren't marked isPersonalInteraction for this send.
  const channel = trigger.resolveChannel(state);
  const isEngagementChannel = ENGAGEMENT_CHANNELS.has(channel) && !trigger.isPersonalInteraction;
  if (isEngagementChannel && trigger.variesDailyCount) {
    const dailyCount = Number(state.daily_count);
    if (dailyCount >= DAILY_ENGAGEMENT_CAP) {
      return { fired: false, suppressedReason: 'daily_cap' };
    }
  }

  // (Channel rate cap would sit here in real precedence — not modeled,
  // see header GAP note.)

  return { fired: true, suppressedReason: 'n/a' };
}

// ─── Row generation ──────────────────────────────────────────────────────

function cartesian(axes: Array<{ name: string; values: Array<string | number | boolean> }>): Row[] {
  let combos: Row[] = [{}];
  for (const axis of axes) {
    const next: Row[] = [];
    for (const combo of combos) {
      for (const v of axis.values) {
        next.push({ ...combo, [axis.name]: v });
      }
    }
    combos = next;
  }
  return combos;
}

interface OutputRow {
  persona: string;
  hour: number;
  event: string;
  extra_state: string;
  daily_count: number | string;
  push_fired: string;
  channel: string;
  suppressed_reason: string;
  deep_link_route: string;
}

function generateRows(): OutputRow[] {
  const rows: OutputRow[] = [];

  for (const trigger of TRIGGERS) {
    const baseCombos = cartesian(trigger.axes);
    const dailyCounts = trigger.variesDailyCount ? DAILY_COUNT_VALUES : [0];

    for (const hour of HOURS) {
      for (const base of baseCombos) {
        for (const dailyCount of dailyCounts) {
          const state: Row = { ...base, daily_count: dailyCount };
          const decision = decide(trigger, state, hour);
          const channel = trigger.resolveChannel(state);

          const extraStateStr = trigger.axes
            .map((a) => `${a.name}=${state[a.name]}`)
            .join(';') || 'n/a';

          rows.push({
            persona: PERSONA_LABEL,
            hour,
            event: trigger.id,
            extra_state: extraStateStr,
            daily_count: trigger.variesDailyCount ? dailyCount : 'n/a',
            push_fired: decision.fired ? channel : 'NONE',
            channel,
            suppressed_reason: decision.suppressedReason,
            deep_link_route: trigger.deepLink(state),
          });
        }
      }
    }
  }

  return rows;
}

// ─── CSV writer ──────────────────────────────────────────────────────────

function csvEscape(v: string | number): string {
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function writeCsv(rows: OutputRow[], outPath: string): void {
  const cols: (keyof OutputRow)[] = [
    'persona', 'hour', 'event', 'extra_state', 'daily_count',
    'push_fired', 'channel', 'suppressed_reason', 'deep_link_route',
  ];
  const lines = [cols.join(',')];
  for (const row of rows) {
    lines.push(cols.map((c) => csvEscape(row[c])).join(','));
  }
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, lines.join('\n') + '\n');
}

// ─── Summary ──────────────────────────────────────────────────────────────

function buildSummary(rows: OutputRow[], runtimeMs: number): string {
  const lines: string[] = [];
  const total = rows.length;
  const fired = rows.filter((r) => r.push_fired !== 'NONE').length;
  const suppressed = total - fired;

  lines.push('PUSH-SCENARIO SWEEP — SUMMARY');
  lines.push(`Generated ${new Date().toISOString().slice(0, 10)} — ${total} scenarios in ${runtimeMs}ms.`);
  lines.push('Read-only simulation. No Firestore writes, no FCM sends, no deploy, no changes to production logic.');
  lines.push('');
  lines.push(`TOTAL: ${total}   FIRED: ${fired} (${((fired / total) * 100).toFixed(1)}%)   SUPPRESSED: ${suppressed} (${((suppressed / total) * 100).toFixed(1)}%)`);
  lines.push('');

  lines.push('SUPPRESSION BREAKDOWN (all triggers):');
  const reasonCounts = new Map<string, number>();
  for (const r of rows) {
    if (r.suppressed_reason !== 'n/a') {
      reasonCounts.set(r.suppressed_reason, (reasonCounts.get(r.suppressed_reason) ?? 0) + 1);
    }
  }
  for (const [reason, count] of [...reasonCounts.entries()].sort((a, b) => b[1] - a[1])) {
    lines.push(`  ${reason}: ${count}`);
  }
  lines.push('  channel_cap: 0 — NOT EXERCISED (see KNOWN GAP below)');
  lines.push('');

  lines.push('BREAKDOWN BY PUSH TYPE:');
  for (const trigger of TRIGGERS) {
    const triggerRows = rows.filter((r) => r.event === trigger.id);
    const triggerFired = triggerRows.filter((r) => r.push_fired !== 'NONE').length;
    lines.push(`  ${trigger.id}: ${triggerRows.length} rows, ${triggerFired} fire (${((triggerFired / triggerRows.length) * 100).toFixed(1)}%)`);
  }
  lines.push('');

  lines.push('INTERESTING / SURPRISING PATTERNS:');

  // Quiet-hours kill rate per trigger that respects it
  for (const trigger of TRIGGERS.filter((t) => !t.skipQuietHours)) {
    const triggerRows = rows.filter((r) => r.event === trigger.id);
    const qhKilled = triggerRows.filter((r) => r.suppressed_reason === 'quiet_hours').length;
    if (qhKilled > 0) {
      lines.push(`  - ${trigger.id}: quiet hours alone kill ${qhKilled}/${triggerRows.length} rows (${((qhKilled / triggerRows.length) * 100).toFixed(1)}%) — every one of these is a SUPPRESSED-FOREVER push (no defer/retry exists anywhere in push.service.ts).`);
    }
  }

  // Daily-cap exposure
  const dailyCapKilled = rows.filter((r) => r.suppressed_reason === 'daily_cap').length;
  lines.push(`  - Daily engagement cap (3/day) suppresses ${dailyCapKilled} rows across community/training_reminder/health_milestone/onboarding_dropoff/retention/admin-broadcast(community) — the only cross-cutting cap that fires regardless of which specific push type it is.`);

  // "Gets nothing all day" — for a fixed extra-state combo, does every hour suppress?
  const alwaysSuppressedCombos = new Set<string>();
  for (const trigger of TRIGGERS) {
    const combos = new Map<string, OutputRow[]>();
    for (const r of rows.filter((row) => row.event === trigger.id)) {
      const key = `${trigger.id}|${r.extra_state}|${r.daily_count}`;
      if (!combos.has(key)) combos.set(key, []);
      combos.get(key)!.push(r);
    }
    for (const [key, group] of combos) {
      if (group.length === 24 && group.every((r) => r.push_fired === 'NONE')) {
        alwaysSuppressedCombos.add(key);
      }
    }
  }
  lines.push(`  - ${alwaysSuppressedCombos.size} (event, state) combinations are suppressed at EVERY hour of the day (0-23) — these are states where no hour would ever have gotten the user this push, not just an unlucky quiet-hours draw. Mostly the "not eligible at all" states (no_recipients holds regardless of hour): ghost-privacy nearby shares, non-below-goal step checks, fresh/completed onboarding, <7-day inactivity.`);

  // Deep-link quality flag
  const genericHomeDeepLinks = new Set(
    TRIGGERS.filter((t) => t.deepLink({} as Row) === '/').map((t) => t.id),
  );
  lines.push(`  - ${genericHomeDeepLinks.size} push types deep-link to bare '/' (generic home), not to the thing the push is actually about: ${[...genericHomeDeepLinks].join(', ')}. A tap on any of these lands the user on the home screen with no indication of what to look at.`);

  const adminBroadcastNoDeepLink = rows.filter((r) => r.event === 'admin-broadcast').length;
  lines.push(`  - admin-broadcast (${adminBroadcastNoDeepLink} rows) has no fixed deep-link at all — it's admin-typed per send and silently does nothing on tap if left blank. Not "broken" exactly, but there's no guardrail requiring one.`);

  lines.push('');
  lines.push('KNOWN GAP (flagged, not silently absorbed):');
  lines.push('  The approved scenario design has no "recently sent on this channel" axis, so the per-channel RATE_CAP_HOURS gate (e.g. kudos 30min, community 2h, retention 48h) is never exercised in this run — every row assumes the recipient is not currently rate-capped. suppressed_reason=channel_cap never appears above. Real production behavior includes this gate; this sweep does not. Adding a recently_sent_on_channel:{true,false} axis to the reachable triggers would close this gap.');
  lines.push('');
  lines.push('  persona is fixed to \'parent\' throughout (not swept) — confirmed causally irrelevant to fire/suppress/deep-link outcomes; only content selection (out of scope here) reads persona.');

  return lines.join('\n');
}

// ─── Main ──────────────────────────────────────────────────────────────────

function main() {
  const t0 = Date.now();
  const rows = generateRows();
  const runtimeMs = Date.now() - t0;

  const csvPath = join(process.cwd(), 'docs/research/push-scenario-sweep.csv');
  const summaryPath = join(process.cwd(), 'docs/research/push-scenario-sweep-summary.txt');

  writeCsv(rows, csvPath);
  const summary = buildSummary(rows, runtimeMs);
  mkdirSync(dirname(summaryPath), { recursive: true });
  writeFileSync(summaryPath, summary + '\n');

  console.log(`[push-scenario-sweep] ${rows.length} rows generated in ${runtimeMs}ms`);
  console.log(`[push-scenario-sweep] CSV: ${csvPath}`);
  console.log(`[push-scenario-sweep] Summary: ${summaryPath}`);
  console.log('');
  console.log(summary);
}

main();
