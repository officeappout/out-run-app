/**
 * Kelly round 4 — the server-side executors for the round 4 tools, plus the per-turn state they
 * fill (cards / parks shown under the reply, the tutorial chapter). Server only. Called from
 * executeServerTool only while ctx.round4 is set (flag ai_coach_round4).
 */
import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import type { ToolExecResult } from '../turn-engine';
import type { UserContextSheet } from '../context-sheet';
import { coachGenderOf } from '../persona';
import { ROUND4_TOOL_NAMES, type FindNearbyParksInputT, type PlanAerobicInputT, type StartTutorialInputT } from './tool-specs';
import { newRound4TurnState, type Round4TurnState } from './types';
import { planAerobicSession } from './aerobic.server';
import { findNearbyParks } from './parks.server';
import { getWeatherForUser } from './weather.server';
import { withWeather } from './weather-result';
import { tutorialToolResult } from './tutorial';

export interface Round4ToolContext {
  db: Firestore;
  uid: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw Firestore profile
  profile: Record<string, any>;
  now: Date;
  /** The turn's pre-loaded sheet (null when it failed). */
  sheet: UserContextSheet | null;
  flags: { graphhopper: boolean; weatherEnabled: boolean; weatherAdminsOnly: boolean };
  state: Round4TurnState;
}

const json = (v: unknown): ToolExecResult => ({ content: JSON.stringify(v) });

export function isRound4Tool(name: string): boolean {
  return ROUND4_TOOL_NAMES.includes(name);
}

export async function executeRound4Tool(ctx: Round4ToolContext, name: string, input: unknown): Promise<ToolExecResult> {
  const st = ctx.state ?? newRound4TurnState();
  switch (name) {
    case 'plan_aerobic_session': {
      if (st.extras.aerobic) return { content: 'One walk or run per reply: it is already shown.', isError: true };
      const [r, weather] = await Promise.all([
        planAerobicSession({ ...ctx, graphhopper: ctx.flags.graphhopper }, input as PlanAerobicInputT),
        getWeatherForUser({ ...ctx, flags: ctx.flags }).catch(() => ({ available: false })),
      ]);
      st.extras.aerobic = r.card;
      if (r.offerQuestionnaire) st.offerQuestionnaire = true;
      if (r.card.route.status === 'map') st.pickRoute = r.card.kind === 'walk' ? 'walking' : 'running';
      return json(withWeather(r.result, weather as Record<string, unknown>));
    }
    case 'find_nearby_parks': {
      const r = await findNearbyParks(ctx, input as FindNearbyParksInputT);
      if (r.parks.length) st.extras.parks = r.parks;
      return json(r.result);
    }
    case 'get_weather':
      return json(await getWeatherForUser({ ...ctx, flags: ctx.flags }));
    case 'start_tutorial': {
      const t = input as StartTutorialInputT;
      st.tutorial = t.topic;
      return json(tutorialToolResult(t, coachGenderOf(ctx.profile?.core?.gender)));
    }
    default:
      return { content: `unknown tool ${name}`, isError: true };
  }
}
