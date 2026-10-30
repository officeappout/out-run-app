import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { resolveDescription, getAvailableContentTags } from '../branding.utils';
import type { TagResolverContext } from '../branding.utils';
import type { NotificationTriggerType } from '../branding.types';

/**
 * Hebrew parity gate for the locale-aware tag resolver.
 * The golden file was recorded from main BEFORE the resolver read its values
 * from catalogs: every tag x representative context must stay byte-identical
 * in Hebrew. Regenerate only on purpose: UPDATE_TAG_PARITY=1.
 */
const GOLDEN = join(__dirname, '__fixtures__', 'he-parity.golden.json');

const TRIGGERS: NotificationTriggerType[] = [
  'Inactivity', 'Scheduled', 'Location_Based', 'Habit_Maintenance', 'Proximity',
  'League_Overtake', 'Social_Matchmaking', 'Future_Partner_Plan', 'Community_Group_New', 'Daily_Goal',
];
const NOW_MORNING = new Date(2026, 9, 1, 7, 5);
const NOW_NOON = new Date(2026, 9, 1, 13, 30);
const NOW_EVENING = new Date(2026, 9, 1, 19, 0);
const NOW_NIGHT = new Date(2026, 9, 1, 23, 59);

const MUSCLES = ['chest', 'back', 'shoulders', 'abs', 'obliques', 'forearms', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'traps', 'cardio', 'full_body', 'core', 'legs', 'lats', 'hip_flexors', 'zzz_unknown'];
const LOCATIONS = ['home', 'park', 'office', 'street', 'gym', 'school', 'airport', 'library', 'mars'];
const SPORTS = ['calisthenics', 'crossfit', 'functional', 'movement', 'running', 'walking', 'cycling', 'swimming', 'basketball', 'soccer', 'tennis', 'padel', 'yoga', 'pilates', 'flexibility', 'climbing', 'skate_roller', 'martial_arts', 'general', 'zzz'];
const LEVELS = ['beginner', 'intermediate', 'advanced', 'pro', 'zzz'];
const PROGRAMS = ['pulling', 'pushing', 'core', 'legs', 'upper_body', 'lower_body', 'full_body', 'handstand', 'skills', 'zzz'];
const CATS = ['strength', 'volume', 'endurance', 'skills', 'mobility', 'hiit', 'general', 'maintenance', 'zzz'];
const PERSONAS = ['parent', 'student', 'pupil', 'office_worker', 'military', 'vatikim', 'pro_athlete', 'zzz'];
const RUN_CATS = ['easy_run', 'long_run', 'short_intervals', 'long_intervals', 'fartlek_easy', 'fartlek_structured', 'tempo', 'hill_long', 'hill_short', 'hill_sprints', 'strides', 'zzz'];
const PHASES = ['base', 'build', 'peak', 'taper', 'zzz'];
const GOALS = ['healthy_lifestyle', 'performance_boost', 'weight_loss', 'skill_mastery', 'אורח חיים בריא', 'ירידה במשקל', 'zzz'];

const base = (): TagResolverContext => ({ currentTime: NOW_NOON });

function contexts(): Array<[string, TagResolverContext]> {
  const out: Array<[string, TagResolverContext]> = [['empty', base()]];
  const add = (name: string, c: Partial<TagResolverContext>) => out.push([name, { ...base(), ...c }]);
  for (const g of ['male', 'female', 'other'] as const) add(`gender:${g}`, { userGender: g });
  for (const [n, d] of [['morning', NOW_MORNING], ['evening', NOW_EVENING], ['night', NOW_NIGHT]] as const) add(`time:${n}`, { currentTime: d });
  for (const m of MUSCLES) { add(`muscles:${m}`, { muscles: [m] }); add(`dominant:${m}`, { dominantMuscle: m }); }
  add('muscles:two', { muscles: ['chest', 'back', 'abs'] });
  add('muscles:empty', { muscles: [] });
  for (const l of LOCATIONS) add(`loc:${l}`, { location: l });
  add('locName', { locationName: 'פארק הירקון' });
  add('loc:park+name', { location: 'park', locationName: 'פארק הירקון' });
  add('loc:gym+name', { location: 'gym', locationName: 'מכון X' });
  for (const s of SPORTS) add(`sport:${s}`, { sportType: s });
  for (const l of LEVELS) for (const g of ['male', 'female', 'other'] as const) add(`level:${l}:${g}`, { experienceLevel: l, userGender: g });
  for (const p of PROGRAMS) add(`program:${p}`, { currentProgram: p });
  for (const c of CATS) { add(`cat:${c}`, { category: c }); add(`catLabel:${c}`, { categoryLabel: 'תווית', category: c }); }
  for (const p of PERSONAS) add(`persona:${p}`, { persona: p });
  for (const r of RUN_CATS) add(`runCat:${r}`, { runningCategory: r });
  for (const p of PHASES) add(`phase:${p}`, { programPhase: p });
  for (const g of GOALS) { add(`goal:${g}`, { goal: g }); add(`userGoal:${g}`, { userGoal: g }); }
  for (const p of [0, 1, 37.6, 100]) add(`progress:${p}`, { programProgress: p, goalProgressPercent: p });
  for (const t of [0, 4, 12]) add(`targetLevel:${t}`, { targetLevel: t });
  for (const d of [0, 250, 999, 1000, 1550, 12345]) add(`dist:${d}`, { distanceMeters: d });
  for (const m of [0, 0.5, 1, 7.4, 20]) add(`eta:${m}`, { estimatedArrivalMinutes: m });
  for (const m of [0, 12.4, 45]) add(`dur:${m}`, { durationMinutes: m });
  for (const d of [1, 2, 3, 'easy', 'medium', 'hard', 'zzz', 9]) add(`diff:${d}`, { difficulty: d });
  add('names', { userName: 'דנה כהן', exerciseName: 'משיכות', equipment: ['מקבילים', 'טבעות', 'גומיה'] });
  add('names:one', { userName: 'רון', equipment: ['מוט'] });
  add('names:equipEmpty', { equipment: [] });
  add('target', { targetExerciseName: 'משיכה', targetValue: '10 חזרות' });
  for (const p of [0, 330, 359.6, 600]) add(`pace:${p}`, { runningBasePace: p });
  add('distLabel', { targetDistanceLabel: '5 ק"מ' });
  add('week:4/12', { weekNumber: 4, totalWeeks: 12 });
  add('week:4', { weekNumber: 4 });
  add('week:0', { weekNumber: 0, totalWeeks: 3 });
  add('gap', { weeklyGapDomain: 'דחיפה', weeklyGapPercent: 34.6 });
  add('gap:noPct', { weeklyGapDomain: 'משיכה' });
  for (const [i, s] of [[0, 0], [5, 0], [0, 3], [0, 7], [0, 14], [0, 20], [4, 20], [10, 1]] as const) add(`streak:${i}/${s}`, { daysInactive: i, streakDays: s });
  add('step', { currentProgressionStep: 'Diamond Push-ups 3×8' });
  for (const r of [0, 3, 5, 6, 7, 8, 12, 13, 14, 15, 30]) add(`reps:${r}`, { avgRepCount: r });
  for (const [c, q] of [[24, 24], [30, 24], [20, 24], [12, 24], [5, 24], [0, 24], [3, 0]] as const) add(`vol:${c}/${q}`, { weeklyCompletedSets: c, weeklySetQuota: q });
  add('vol:noQuota', { weeklyCompletedSets: 3 });
  add('logic', { intensityReason: 'מנוחה קצרה', challengeType: 'התקדמות', equipmentAdaptation: 'משקל גוף' });
  for (const t of TRIGGERS) {
    add(`trig:${t}`, { triggerType: t, daysInactive: 5, locationName: 'פארק', location: 'park', stepsLeft: 1234, walkMinutes: 12, streakDays: 6 });
    add(`trig:${t}:empty`, { triggerType: t });
    add(`trig:${t}:female`, { triggerType: t, userGender: 'female' });
  }
  add('league', { triggerType: 'League_Overtake', overtakingUserName: 'נועה', newLeaderboardRank: 3, stepDelta: 12500 });
  add('league:nan', { triggerType: 'League_Overtake', stepDelta: NaN });
  add('group', { triggerType: 'Community_Group_New', groupName: 'ריצת בוקר', groupTypeLabel: 'קבוצת ריצה', meetingLocationName: 'פארק', meetingTimeFormatted: '06:30', meetingDayFormatted: 'יום שלישי' });
  add('partner:matchmaking', { triggerType: 'Social_Matchmaking', partnerName: 'יוסי', partnerLevel: 'רמה 7', partnerArrivalTime: '18:30' });
  add('partner:future', { triggerType: 'Future_Partner_Plan', partnerName: 'יוסי' });
  add('daily', { triggerType: 'Daily_Goal', stepsLeft: 1234567, walkMinutes: 9, streakDays: 15 });
  add('daily:zero', { triggerType: 'Daily_Goal', stepsLeft: 0, walkMinutes: 0, streakDays: 0 });
  return out;
}

const EXTRA_TAGS = ['@עשית/ה', '@שם_עוקף', '@מיקום_חדש', '@פער_צעדים', '@שם_קבוצה', '@סוג_קבוצה', '@מיקום_מפגש', '@שעת_מפגש', '@יום_מפגש', '@שם_שותף', '@רמת_שותף', '@שעת_הגעה_שותף', '@פרסונה', '@שרירים', '@שעה', '@זמן_יום', '@ימי_אי_פעילות', '@שם_הפארק', '@שם_המתקן', '@סיבת_עצימות', '@סוג_אתגר', '@התאמת_ציוד', '@UNKNOWN_TAG'];

function allTags(): string[] {
  return Array.from(new Set([...getAvailableContentTags().map((t) => t.tag), ...EXTRA_TAGS]));
}

function compute(): Record<string, string[]> {
  const ctxs = contexts();
  const result: Record<string, string[]> = {};
  for (const tag of allTags()) {
    result[tag] = ctxs.map(([, c]) => resolveDescription(`א ${tag} ב.`, c));
  }
  // A mixed sentence: several tags at once, incl. the sentence-drop path.
  result['__mixed__'] = ctxs.map(([, c]) =>
    resolveDescription('@בוא/י @שם, @את/ה @מוכן/ה? רמת @רמה ב-@שם_תוכנית. @אחוז_התקדמות הושלמו. מיקוד: @מיקוד_פיזיולוגי. @סיבת_רצף @סטטוס_נפח @זמן_יום ב-@מיקום.', c),
  );
  return result;
}

describe('resolveDescription Hebrew parity (golden recorded from main)', () => {
  const actual = compute();
  if (process.env.UPDATE_TAG_PARITY === '1') {
    it('records the golden', () => {
      writeFileSync(GOLDEN, JSON.stringify({ contexts: contexts().map(([n]) => n), outputs: actual }, null, 0));
    });
    return;
  }
  const golden = existsSync(GOLDEN) ? JSON.parse(readFileSync(GOLDEN, 'utf8')) : null;
  it('golden exists', () => { expect(golden).not.toBeNull(); });
  it('same contexts', () => { expect(contexts().map(([n]) => n)).toEqual(golden.contexts); });
  it('same tag set', () => { expect(Object.keys(actual)).toEqual(Object.keys(golden.outputs)); });
  for (const tag of Object.keys(actual)) {
    it(`byte-identical: ${tag}`, () => {
      expect(actual[tag]).toEqual(golden.outputs[tag]);
    });
  }
});
