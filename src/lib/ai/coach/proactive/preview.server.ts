/**
 * Kelly phase 3 — admin preview ("what would Kelly send today and why") and the test send
 * to the admin's OWN uid. Read-only except the test send's one message.
 *
 * The preview evaluates every trigger twice: `now` (the real clock, the same decision a run
 * would make right now) and `atItsHour` (time-of-day windows ignored, so the morning line can
 * be checked at 15:00). The shared gate is shown for both. Text is rendered from the
 * deterministic template (no model call in a preview).
 */
import 'server-only';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import type { ServerFeatureFlags } from '@/lib/ai/entitlement.server';
import { buildProactiveState } from './context.server';
import { recentWorkoutOf } from './loaders.server';
import { explainAll } from './select';
import { writeProactiveMessage } from './send.server';
import { renderProactive } from './templates';
import { TRIGGER_PRIORITY, type ProactiveTrigger, type ProactiveUserState, type TriggerDecision } from './types';

export interface PreviewRow {
  trigger: ProactiveTrigger;
  now: { send: boolean; reason: string };
  atItsHour: { send: boolean; reason: string; text: string | null; actions: string[]; silent: boolean };
}

export interface ProactivePreview {
  uid: string;
  found: boolean;
  summary: Record<string, unknown> | null;
  rows: PreviewRow[];
}

async function latestWorkout(db: Firestore, uid: string) {
  const snap = await db.collection('workouts').where('userId', '==', uid).orderBy('date', 'desc').limit(1).get();
  const d = snap.docs[0];
  return d ? recentWorkoutOf(d.id, d.data() as Record<string, unknown>) : null;
}

const verdict = (d: TriggerDecision, gate: string | null) =>
  d.shouldSend ? (gate ? { send: false, reason: `gate: ${gate}` } : { send: true, reason: d.why }) : { send: false, reason: d.reason };

function summaryOf(s: ProactiveUserState): Record<string, unknown> {
  return {
    hasAi: s.hasAi,
    optedOut: s.optedOut,
    pushEnabled: s.pushEnabled,
    sentToday: s.sentToday,
    daysAway: s.daysAway,
    dailyCount: `${s.dailyCountToday}/${s.dailyCap}`,
    retentionSentToday: s.retentionSentToday,
    trainingReminderToday: s.trainingReminderToday,
    shabbat: s.shabbatObserver && s.inRestWindow,
    preferredHour: s.preferredHour,
    today: s.today,
    weather: s.weather,
    week: s.week,
    gaps: s.gaps.map((g) => g.slug),
    recentWorkout: s.recentWorkout ? { minutes: s.recentWorkout.minutes, endedAt: new Date(s.recentWorkout.endedAtMs).toISOString() } : null,
  };
}

export async function previewProactive(db: Firestore, uid: string, flags: ServerFeatureFlags, now = new Date()): Promise<ProactivePreview> {
  const recentWorkout = await latestWorkout(db, uid).catch(() => null);
  const state = await buildProactiveState({ db, uid, now, flags, due: TRIGGER_PRIORITY, recentWorkout });
  if (!state) return { uid, found: false, summary: null, rows: [] };
  const real = explainAll(state);
  const atHour = explainAll(state, { ignoreSlotTime: true });
  const rows = TRIGGER_PRIORITY.map((trigger, k): PreviewRow => {
    const h = atHour[k];
    const rendered = h.decision.shouldSend ? renderProactive({ templateKey: h.decision.templateKey, vars: h.decision.vars, gender: state.gender, firstName: state.firstName }) : null;
    return {
      trigger,
      now: verdict(real[k].decision, real[k].gate),
      atItsHour: { ...verdict(h.decision, h.gate), text: rendered?.text ?? null, actions: rendered?.actions ?? [], silent: rendered?.silent ?? false },
    };
  });
  return { uid, found: true, summary: summaryOf(state), rows };
}

/**
 * Test send to the admin's own uid: the chosen trigger (or the first that has something to
 * say at its hour), shared gates ignored except "no AI". A separate message id (never the
 * day's lock), not counted in the daily stats; the push goes out without the daily cap
 * (quiet hours and Shabbat still apply in push.service).
 */
export async function testSendProactive(
  db: Firestore,
  adminUid: string,
  flags: ServerFeatureFlags,
  trigger: ProactiveTrigger | null,
  now = new Date(),
): Promise<{ sent: boolean; reason?: string; messageId?: string; trigger?: ProactiveTrigger; text?: string }> {
  const recentWorkout = await latestWorkout(db, adminUid).catch(() => null);
  const state = await buildProactiveState({ db, uid: adminUid, now, flags, due: TRIGGER_PRIORITY, recentWorkout });
  if (!state) return { sent: false, reason: 'no_profile' };
  if (!state.hasAi) return { sent: false, reason: 'no_ai' };
  const pick = explainAll(state, { ignoreSlotTime: true, ...(trigger ? { only: [trigger] } : {}) }).find((v) => v.decision.shouldSend)?.decision;
  if (!pick || !pick.shouldSend) return { sent: false, reason: 'nothing_to_send' };
  const rendered = renderProactive({ templateKey: pick.templateKey, vars: pick.vars, gender: state.gender, firstName: state.firstName });
  const res = await writeProactiveMessage(db, {
    uid: adminUid,
    clock: state.clock,
    trigger: pick.trigger,
    templateKey: pick.templateKey,
    vars: pick.vars,
    rendered: { ...rendered, silent: false },
    llm: false,
    test: true,
  });
  return { sent: res.written, messageId: res.messageId, trigger: pick.trigger, text: rendered.text };
}

/** Last `days` days of ai_coach_proactive_stats, newest first. */
export async function proactiveStats(db: Firestore, days = 14, now = new Date()): Promise<Array<Record<string, unknown>>> {
  const since = new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
  const snap = await db.collection('ai_coach_proactive_stats').where('day', '>=', since).orderBy('day', 'desc').limit(days + 1).get();
  return snap.docs.map((d) => {
    const x = d.data();
    const updatedAt = x.updatedAt instanceof Timestamp ? x.updatedAt.toDate().toISOString() : null;
    return { day: x.day, total: x.total ?? 0, sent: x.sent ?? {}, silent: x.silent ?? 0, llm: x.llm ?? 0, tests: x.tests ?? 0, updatedAt };
  });
}
