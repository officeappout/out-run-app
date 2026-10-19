/**
 * Kelly round 4 — plan_aerobic_session (server). Facts from the profile + the turn's sheet,
 * the pure decision (aerobic-plan.ts), and, when a loop length is known and GraphHopper is on
 * (enable_graphhopper_routes + the server client), one quick loop search from the user's area
 * with the existing loop service. Read-only; a failed or slow search just means "pick a route
 * on the map".
 */
import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import { getDaysAway } from '@/lib/calm-return/days-away';
import { generateLoops } from '@/lib/routing/loop-service';
import { getServerGraphHopperClient } from '@/lib/routing/graphhopper/server-client';
import type { UserContextSheet } from '../context-sheet';
import { aerobicCard, aerobicToolResult, planAerobic, type AerobicFacts, type RouteOutcome } from './aerobic-plan';
import type { PlanAerobicInputT } from './tool-specs';
import type { AerobicCardView } from './types';
import { readUserOrigin } from './location.server';

const LOOP_DEADLINE_MS = 3500;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw Firestore profile, read through field guards
export function aerobicFactsFrom(profile: Record<string, any>, sheet: Pick<UserContextSheet, 'today'> | null, now: Date): AerobicFacts {
  const running = profile?.running ?? {};
  const hasRunningProgram = Array.isArray(running?.activeProgram?.schedule) && running.activeProgram.schedule.length > 0;
  const basePace = running?.paceProfile?.basePace;
  return {
    hasRunningProgram,
    hasPaceProfile: typeof basePace === 'number' && basePace > 0,
    plannedRunToday: (sheet?.today ?? []).some((e) => e.kind === 'cardio' && !e.completed),
    daysAway: getDaysAway(profile, now),
  };
}

export async function planAerobicSession(
  ctx: {
    db: Firestore;
    uid: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw Firestore profile
    profile: Record<string, any>;
    now: Date;
    sheet: Pick<UserContextSheet, 'today'> | null;
    graphhopper: boolean;
  },
  input: PlanAerobicInputT,
): Promise<{ result: Record<string, unknown>; card: AerobicCardView; offerQuestionnaire: boolean }> {
  const plan = planAerobic(input, aerobicFactsFrom(ctx.profile, ctx.sheet, ctx.now));
  let route: RouteOutcome = { status: 'map' };
  const client = plan.routeTargetKm && ctx.graphhopper ? getServerGraphHopperClient() : null;
  if (client && plan.routeTargetKm) {
    try {
      const origin = await readUserOrigin(ctx.db, ctx.uid, ctx.profile, ctx.now);
      if (origin && origin.kind !== 'city') {
        const res = await generateLoops(client, {
          start: { lat: origin.lat, lng: origin.lng },
          targetKm: plan.routeTargetKm,
          activity: plan.activity,
          seed: ctx.now.getUTCDate(),
          maxResults: 1,
          deadlineMs: LOOP_DEADLINE_MS,
        });
        const km = res.loops[0]?.distanceKm;
        if (typeof km === 'number' && km > 0.3) route = { status: 'found', distanceKm: km };
      }
    } catch {
      /* no route → the map */
    }
  }
  const card = aerobicCard(plan, route, `aer-${ctx.now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 6)}`);
  return { result: aerobicToolResult(plan, card), card, offerQuestionnaire: plan.offerQuestionnaire };
}
