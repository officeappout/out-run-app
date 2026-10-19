/**
 * Kelly round 4 evals — the round 4 tools answered from the case's frozen world, through the
 * REAL pure parts (aerobic planner + card + result, parks result, weather result, tutorial
 * result) so a live run tests the model against exactly what production returns. Pure.
 */
import type { ToolExecResult } from '@/lib/ai/coach/turn-engine';
import { aerobicCard, aerobicToolResult, planAerobic } from '@/lib/ai/coach/round4/aerobic-plan';
import { parksToolResult } from '@/lib/ai/coach/round4/parks-rank';
import { WEATHER_UNAVAILABLE, weatherToolResult, withWeather } from '@/lib/ai/coach/round4/weather-result';
import { tutorialToolResult } from '@/lib/ai/coach/round4/tutorial';
import { PlanAerobicInput, StartTutorialInput, type FindNearbyParksInputT } from '@/lib/ai/coach/round4/tool-specs';
import type { Round4TurnState } from '@/lib/ai/coach/round4/types';
import type { HomeWeather } from '@/features/weather/core/derive-home-weather';
import type { EvalCase } from './eval-case';

const LABELS: Record<string, string> = { rain: 'גשום היום', heat: 'חם מאוד, עדיף בצל או בערב', uv: 'קרינה חזקה, עדיף בצל', cold: 'קר בחוץ, מתחממים טוב' };

function weatherResult(ctx: EvalCase['context']): Record<string, unknown> {
  const w = ctx.round4?.weather;
  if (!w) return { ...WEATHER_UNAVAILABLE };
  const hw = {
    classification: { flag: w.flag, apparentC: w.feelsLikeC, precipProb: w.rainChanceNext3hPct, uv: null, label: w.flag ? LABELS[w.flag] : null },
    temperatureC: w.temperatureC,
    weatherCode: null,
    isNight: w.isNight ?? false,
  } as unknown as HomeWeather;
  return weatherToolResult(hw, 'home_area');
}

export function simulateRound4Tool(name: string, input: unknown, ctx: EvalCase['context'], st: Round4TurnState): ToolExecResult | null {
  const w4 = ctx.round4 ?? {};
  const json = (v: unknown): ToolExecResult => ({ content: JSON.stringify(v) });
  switch (name) {
    case 'plan_aerobic_session': {
      if (st.extras.aerobic) return { content: 'One walk or run per reply: it is already shown.', isError: true };
      const parsed = PlanAerobicInput.parse(input ?? {});
      const plan = planAerobic(parsed, {
        hasRunningProgram: w4.running?.hasRunningProgram ?? false,
        hasPaceProfile: w4.running?.hasPaceProfile ?? false,
        plannedRunToday: w4.running?.plannedRunToday ?? false,
        daysAway: w4.daysAway ?? null,
      });
      const card = aerobicCard(plan, w4.routeKm && plan.routeTargetKm ? { status: 'found', distanceKm: w4.routeKm } : { status: 'map' }, 'aer-eval-0001');
      st.extras.aerobic = card;
      if (plan.offerQuestionnaire) st.offerQuestionnaire = true;
      if (card.route.status === 'map') st.pickRoute = plan.activity;
      return json(withWeather(aerobicToolResult(plan, card), weatherResult(ctx)));
    }
    case 'find_nearby_parks': {
      void (input as FindNearbyParksInputT);
      if (!w4.parks) return json(parksToolResult([], null));
      const parks = w4.parks.slice(0, 3).map((p, i) => ({ parkId: `evalpark${i}`, name: p.name, distanceKm: p.distanceKm, equipment: p.equipment.slice(0, 4), area: p.area ?? null }));
      if (parks.length) st.extras.parks = parks;
      return json(parksToolResult(parks, 'home_area'));
    }
    case 'get_weather':
      return json(weatherResult(ctx));
    case 'start_tutorial': {
      const t = StartTutorialInput.parse(input ?? {});
      st.tutorial = t.topic;
      return json(tutorialToolResult(t, ctx.gender));
    }
    default:
      return null;
  }
}
