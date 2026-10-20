/**
 * demoSimulatorTick — Scheduled Cloud Function (v2), every 30 minutes 05:00–23:30
 * Asia/Jerusalem: the demo world's "life" (layer A, agent-briefs/demo-users-design.md §3 +
 * ai-testers-design.md §1.1). The logic lives in ./demo-life/ (tick.ts orchestrates).
 *
 *   enable_demo_users off (the default) → one flag read, nothing written (the first tick
 *   after a switch-off only removes the engine's own presence pings).
 *   demo_life_llm on + secret ANTHROPIC_DEMO_KEY set → short chat replies / park / app
 *   comments by a small model, under the caps in demo_registry/config; otherwise the
 *   Hebrew sentence banks. Usage → demo_registry/usage/days/{date}.bySource.life.
 *
 * Everything it writes is a demo doc, checked against the demo allowlist + registry first.
 *
 * DEPLOY (owner):
 *   firebase functions:secrets:set ANTHROPIC_DEMO_KEY      (once — the deploy needs the secret to exist)
 *   firebase deploy --only functions:demoSimulatorTick
 */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import { anthropicLifeLlm } from './demo-life/llm';
import { DEFAULT_LIFE_MODEL, parseLifeConfig } from './demo-life/config';
import { runLifeTick } from './demo-life/tick';

if (!admin.apps.length) admin.initializeApp();

const ANTHROPIC_DEMO_KEY = defineSecret('ANTHROPIC_DEMO_KEY');

export const demoSimulatorTick = onSchedule(
  {
    schedule: '0,30 5-23 * * *',
    timeZone: 'Asia/Jerusalem',
    timeoutSeconds: 300,
    memory: '512MiB',
    maxInstances: 1,
    retryCount: 0,
    secrets: [ANTHROPIC_DEMO_KEY],
  },
  async () => {
    const db = admin.firestore();
    let key = '';
    try {
      key = ANTHROPIC_DEMO_KEY.value() ?? '';
    } catch {
      key = '';
    }
    let model = DEFAULT_LIFE_MODEL;
    if (key) {
      // Model from demo_registry/config.life.model (read again inside the tick for the caps).
      model = parseLifeConfig((await db.doc('demo_registry/config').get()).data()).model;
    }
    try {
      const report = await runLifeTick({
        db,
        nowMs: Date.now(),
        llm: key ? anthropicLifeLlm(key, model) : null,
        log: (msg, data) => logger.warn(msg, data ?? {}),
      });
      if (report.status !== 'off') logger.info('[demoSimulatorTick] done', report);
    } catch (e) {
      // A guard refusal or a Firestore error stops this tick; the next one starts clean.
      logger.error('[demoSimulatorTick] tick stopped', { error: e instanceof Error ? e.message : String(e) });
    }
  },
);
