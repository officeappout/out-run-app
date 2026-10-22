/**
 * ai-costs.server — estimated AI spend from the usage ledger (ai_usage_global/{day}, written by
 * recordAiUsage) + the admin assistant's own day counter (admin_ai_stats/{day}). These are
 * ESTIMATES from ai-pricing.ts; the Anthropic Console bill is the source of truth (the costs
 * page reconciles monthly).
 */
import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import { AI_USAGE_GLOBAL_COLLECTION } from '@/lib/ai/anthropic.server';
import { ADMIN_AI_STATS } from '@/lib/ai/admin-assistant/collections';
import { loadAiConfig } from '@/lib/ai/anthropic.server';
import { lastDayKeys } from './dates';

export interface AiCosts {
  todayUsd: number;
  todayCalls: number;
  last7Days: Array<{ day: string; usd: number }>;
  last7DaysUsd: number;
  monthToDateUsd: number;
  /** the admin assistant only, today */
  adminAssistantTodayUsd: number;
  dailyBudgetUsd: number | null;
  adminAiBudgetUsd: number | null;
  killSwitch: boolean | null;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export async function computeAiCosts(db: Firestore, now: Date = new Date()): Promise<AiCosts> {
  const days = lastDayKeys(now, 31);
  const today = days[days.length - 1];
  const month = today.slice(0, 7);
  const monthDays = days.filter((d) => d.startsWith(month));
  const col = db.collection(AI_USAGE_GLOBAL_COLLECTION);
  const [snaps, adminSnap, config] = await Promise.all([
    db.getAll(...days.map((d) => col.doc(d))),
    db.collection(ADMIN_AI_STATS).doc(today).get(),
    loadAiConfig(db).catch(() => null),
  ]);
  const byDay = new Map<string, { usd: number; calls: number }>();
  snaps.forEach((s, i) => byDay.set(days[i], { usd: num(s.data()?.costUsd), calls: num(s.data()?.calls) }));
  const last7 = days.slice(-7).map((day) => ({ day, usd: round4(byDay.get(day)?.usd ?? 0) }));
  return {
    todayUsd: round4(byDay.get(today)?.usd ?? 0),
    todayCalls: byDay.get(today)?.calls ?? 0,
    last7Days: last7,
    last7DaysUsd: round4(last7.reduce((a, r) => a + r.usd, 0)),
    monthToDateUsd: round4(monthDays.reduce((a, d) => a + (byDay.get(d)?.usd ?? 0), 0)),
    adminAssistantTodayUsd: round4(num(adminSnap.data()?.costUsd)),
    dailyBudgetUsd: config?.dailyBudgetUsd ?? null,
    adminAiBudgetUsd: config?.adminAiBudgetUsd ?? null,
    killSwitch: config?.killSwitch ?? null,
  };
}

function round4(v: number): number {
  return Math.round(v * 10_000) / 10_000;
}
