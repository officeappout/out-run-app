/**
 * Kelly round 4 (ai_coach_round4) — off is byte-identical, and the pure parts: the aerobic
 * planner (never a pace), parks ranking, chips, the "can't" guard, the stored extras.
 */
import { describe, it, expect } from 'vitest';
import { COACH_SYSTEM_PROMPT, buildSessionContext } from '../../persona';
import { coachToolDefinitions, validateToolInput } from '../../tools';
import { appHelpToolResult, findAppHelp } from '../../app-help/retrieve';
import { checkReply } from '../../reply-guards';
import { clientOutcomeToToolResult } from '../../turn-engine';
import { NEW_AEROBIC_LINE, OLD_AEROBIC_LINE, ROUND4_GAP_NOTE, ROUND4_NOTE, coachSystemPrompt } from '../prompt';
import { aerobicCard, aerobicToolResult, planAerobic, type AerobicFacts } from '../aerobic-plan';
import { classifyGear, rankNearbyParks, type ParkCandidate } from '../parks-rank';
import { isRebuildWeekRequest, round4TurnActions } from '../turn-extras';
import { findRound4BlindClaim } from '../blind';
import { parseRound4Extras, newRound4TurnState } from '../types';
import { PlanAerobicInput, ROUND4_TOOL_NAMES } from '../tool-specs';
import { tutorialToolResult } from '../tutorial';
import { withWeather } from '../weather-result';
import { OWNER_SHEET } from '../../__tests__/owner-sheet.fixture';

const ctx = { firstName: 'דוד', gender: 'male' as const, todayKey: '2026-10-19', israelDayOfWeek: 1, israelHour: 10, sheet: OWNER_SHEET };
const NO_RUN: AerobicFacts = { hasRunningProgram: false, hasPaceProfile: false, plannedRunToday: false, daysAway: 1 };

describe('off = byte-identical', () => {
  it('system prompt, session block, tool list', () => {
    expect(coachSystemPrompt()).toBe(COACH_SYSTEM_PROMPT);
    expect(COACH_SYSTEM_PROMPT).toContain(OLD_AEROBIC_LINE);
    const on = coachSystemPrompt({ round4: true });
    expect(on).not.toContain(OLD_AEROBIC_LINE);
    expect(on).toContain(NEW_AEROBIC_LINE);
    expect(buildSessionContext({ ...ctx, round4Note: null })).toBe(buildSessionContext(ctx));
    expect(buildSessionContext({ ...ctx, round4Note: ROUND4_NOTE })).toContain(ROUND4_NOTE);
    for (const opts of [{}, { phase2: true }, { scheduleAdvisor: true, phase2: true }]) {
      const names = coachToolDefinitions(opts).map((t) => t.name);
      for (const n of ROUND4_TOOL_NAMES) expect(names).not.toContain(n);
      expect(coachToolDefinitions({ ...opts, round4: true }).map((t) => t.name)).toEqual([...names, ...ROUND4_TOOL_NAMES]);
    }
  });
  it('app help: round 4 entries only with the flag', () => {
    expect(findAppHelp({ query: 'איך עושים ריצה חופשית' }).map((h) => h.id)).not.toContain('running');
    expect(findAppHelp({ query: 'איך עושים ריצה חופשית' }, 2, { round4: true }).map((h) => h.id)).toContain('running');
    expect(appHelpToolResult({ topic: 'schedule' })).toEqual(appHelpToolResult({ topic: 'schedule' }, {}));
  });
  it('a below-level workout result gets the parks note only with the flag', () => {
    const outcome = { ok: true as const, result: { workoutId: 'ai-abcd-1234', title: 'x', minutes: 20, location: 'home' as const, exercises: [], levelCeiling: true } };
    expect(String(clientOutcomeToToolResult('t', outcome).content)).not.toContain('find_nearby_parks');
    expect(String(clientOutcomeToToolResult('t', outcome, { round4: true }).content)).toContain(ROUND4_GAP_NOTE.slice(0, 40));
    expect(clientOutcomeToToolResult('t', outcome)).toEqual(clientOutcomeToToolResult('t', outcome, {}));
  });
});

describe('planAerobic', () => {
  const p = (i: Record<string, unknown>, f: Partial<AerobicFacts> = {}) => planAerobic(PlanAerobicInput.parse(i), { ...NO_RUN, ...f });
  it('no running program → easy run by feel + the questionnaire', () => {
    const plan = p({ activity: 'run' });
    expect(plan.kind).toBe('easy_run');
    expect(plan.offerQuestionnaire).toBe(true);
    expect(plan.goal).toEqual({ type: 'time', value: 25 });
    const res = aerobicToolResult(plan, aerobicCard(plan, { status: 'map' }, 'aer-test-0001'));
    expect(JSON.stringify(res)).not.toMatch(/\d:\d\d/);
    expect(JSON.stringify(res)).toMatch(/Never state a pace/);
  });
  it("a program user with a run today → today's program run (no minutes, no questionnaire)", () => {
    const plan = p({ activity: 'run' }, { hasRunningProgram: true, hasPaceProfile: true, plannedRunToday: true });
    expect(plan.kind).toBe('program_run');
    expect(plan.minutes).toBeNull();
    expect(plan.offerQuestionnaire).toBe(false);
    expect(p({ activity: 'run', durationMin: 40 }, { hasRunningProgram: true, hasPaceProfile: true, plannedRunToday: true }).kind).toBe('easy_run');
  });
  it('walk, distance goal, strength stops, calm return', () => {
    const walk = p({ activity: 'walk' });
    expect(walk.kind).toBe('walk');
    expect(walk.routeTargetKm).toBe(2.5);
    expect(walk.offerQuestionnaire).toBe(false);
    expect(p({ activity: 'run', distanceKm: 5 }).goal).toEqual({ type: 'distance', value: 5 });
    expect(p({ activity: 'walk', strengthStops: true }).title).toContain('תחנות כוח');
    const back = p({ activity: 'run', durationMin: 45 }, { daysAway: 9, hasRunningProgram: true, hasPaceProfile: true, plannedRunToday: true });
    expect(back.kind).toBe('easy_run');
    expect(back.minutes).toBe(20);
    expect(back.returning).toBe(true);
  });
  it('the card round-trips through the stored-extras validator', () => {
    const plan = p({ activity: 'walk', durationMin: 40 });
    const card = aerobicCard(plan, { status: 'found', distanceKm: 3.27 }, 'aer-test-0002');
    expect(card.route).toEqual({ status: 'found', distanceKm: 3.3 });
    expect(parseRound4Extras({ aerobic: card })?.aerobic).toEqual(card);
  });
  it('weather rides along when available', () => {
    const r = withWeather({ notesForCoach: ['a'] }, { available: true, temperatureC: 33, feelsLikeC: 35, flag: 'heat', labelHe: 'חם', noteForCoach: 'hot' });
    expect(r.weatherNow).toMatchObject({ temperatureC: 33, flag: 'heat' });
    expect(withWeather({ x: 1 }, { available: false })).toEqual({ x: 1 });
  });
});

describe('parks', () => {
  it('classifies the gym_equipment catalog', () => {
    expect(classifyGear({ name: 'מתח רחב', iconKey: 'pullupbar_park', isFunctional: true })).toBe('pullup');
    expect(classifyGear({ name: 'סולם הליכות ידיים', iconKey: 'pullupbar_park' })).toBe('ladder');
    expect(classifyGear({ name: 'מקבילים ארוכים', iconKey: 'parallel_bars' })).toBe('parallel');
    expect(classifyGear({ name: 'קיק בוקס', isFunctional: true })).toBeNull();
    expect(classifyGear({ name: 'פרפר במכונה', iconKey: '', isFunctional: false })).toBe('machines');
  });
  it('closest 3 with the right gear, within 15 km', () => {
    const o = { lat: 32.8, lng: 35.0 };
    const mk = (id: string, dLat: number, groups: ParkCandidate['groups']): ParkCandidate => ({ id, name: `פארק ${id}`, lat: o.lat + dLat, lng: o.lng, groups, area: null });
    const parks = [mk('far1', 0.5, ['pullup']), mk('aaaa', 0.01, ['machines']), mk('bbbb', 0.02, ['pullup', 'parallel']), mk('cccc', 0.03, ['rings']), mk('dddd', 0.005, ['parallel'])];
    expect(rankNearbyParks(parks, o, 'pull').map((p) => p.parkId)).toEqual(['bbbb', 'cccc']);
    const any = rankNearbyParks(parks, o, 'any');
    expect(any.map((p) => p.parkId)).toEqual(['dddd', 'bbbb', 'cccc']);
    expect(any[1].equipment).toEqual(['מתח', 'מקבילים']);
    expect(any[1].distanceKm).toBeCloseTo(2.2, 1);
  });
  it('a stored park list never carries a link: ids are validated', () => {
    expect(parseRound4Extras({ parks: [{ parkId: 'javascript:alert(1)', name: 'x', distanceKm: 1, equipment: [], area: null }] })).toBeNull();
  });
});

describe('chips', () => {
  const st = () => newRound4TurnState();
  it('questionnaire + pick a route after an easy run', () => {
    const s = st();
    s.offerQuestionnaire = true;
    s.pickRoute = 'running';
    expect(round4TurnActions({ state: s, toolNames: ['plan_aerobic_session'], userText: 'ריצה', actions: [] })).toEqual(['running_questionnaire', 'pick_route_run']);
  });
  it('tutorial → the tour of the chapter + the help hub; app help → "show me"', () => {
    const s = st();
    s.tutorial = 'schedule';
    expect(round4TurnActions({ state: s, toolNames: ['start_tutorial'], userText: 'x', actions: [] })).toEqual(['tour_schedule', 'open_help']);
    expect(round4TurnActions({ state: st(), toolNames: ['get_app_help'], userText: 'x', actions: [] })).toEqual(['show_how']);
  });
  it('a below-level home workout → the parks chip, unless the parks were looked up', () => {
    const w = { location: 'home', levelCeiling: true };
    expect(round4TurnActions({ state: st(), toolNames: ['generate_workout'], userText: 'x', workout: w, actions: [] })).toEqual(['find_parks']);
    expect(round4TurnActions({ state: st(), toolNames: ['generate_workout', 'find_nearby_parks'], userText: 'x', workout: w, actions: [] })).toEqual([]);
    expect(round4TurnActions({ state: st(), toolNames: ['generate_workout'], userText: 'x', workout: { location: 'park', levelCeiling: true }, actions: [] })).toEqual([]);
  });
  it('rebuild the week → the schedule builder', () => {
    for (const t of ['תבנה לי מחדש את השבוע', 'תסדר מחדש את הלו״ז שלי', 'אני רוצה לו״ז חדש']) expect(isRebuildWeekRequest(t), t).toBe(true);
    for (const t of ['מה בשבוע הבא?', 'תבנה לי אימון']) expect(isRebuildWeekRequest(t), t).toBe(false);
    expect(round4TurnActions({ state: st(), toolNames: [], userText: 'תבנה לי מחדש את השבוע', actions: ['open_schedule'] })).toEqual(['open_schedule', 'open_builder']);
  });
});

describe('"I can\'t" when a round 4 tool can (owner chat 19.10.2026)', () => {
  it('parks / weather / aerobic / tutorial', () => {
    const r = 'לגבי פארק ומזג אוויר: אני לא יכול להמליץ על פארקים באזור או לבדוק מזג אוויר בצ׳אט הזה.';
    expect(findRound4BlindClaim(r, 'תוכל להמליץ לי על פארק באזור? מזג אוויר אתה יודע?', [])?.tools).toEqual(['find_nearby_parks', 'get_weather']);
    expect(findRound4BlindClaim('כרגע אני לא יכול לבנות אימוני אירובי או ריצה בצ׳אט הזה.', 'אירובי גם?', [])?.tools).toEqual(['plan_aerobic_session']);
    expect(findRound4BlindClaim(r, 'פארק?', ['find_nearby_parks'])).toBeNull();
    const issues = checkReply(r, null, 'male', { userText: 'פארק באזור?', toolNames: [], round4: true });
    expect(issues.some((i) => i.kind === 'blind')).toBe(true);
    expect(checkReply(r, null, 'male', { userText: 'פארק באזור?', toolNames: [] }).some((i) => i.kind === 'blind')).toBe(false);
  });
});

describe('tools', () => {
  it('validates round 4 inputs', () => {
    expect(validateToolInput('plan_aerobic_session', { activity: 'swim' }).ok).toBe(false);
    expect(validateToolInput('plan_aerobic_session', { activity: 'run', durationMin: 30 }).ok).toBe(true);
    expect(validateToolInput('start_tutorial', { topic: 'map' }).ok).toBe(true);
    expect(validateToolInput('find_nearby_parks', {}).ok).toBe(true);
  });
  it('start_tutorial returns the real tour steps from the chapter step', () => {
    const r = tutorialToolResult({ topic: 'schedule' }, 'male') as { tourSteps: string[] };
    expect(r.tourSteps).toEqual(['כאן הלו״ז השבועי שלך']);
  });
});
