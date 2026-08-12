import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
(globalThis as any).React = require('react');
async function main() {
  const { generateHomeWorkout } = await import('../src/features/workout-engine/services/home-workout.service');
  const profile: any = {
    core: { name: 'trace', weight: 75, gender: 'male' },
    progression: {
      tracks: { push: { currentLevel: 6 }, pull: { currentLevel: 6 }, legs: { currentLevel: 6 }, core: { currentLevel: 6 } },
      activePrograms: [{ id: 'push', templateId: 'push', startDate: new Date().toISOString(), durationWeeks: 12, currentWeek: 1, focusDomains: ['push'] }],
    },
    equipment: { park: [] }, health: { injuries: [] }, lifestyle: {},
  };
  const realLog = console.log; const lines: string[] = [];
  console.log = (...a: any[]) => { lines.push(a.map(x => typeof x === 'string' ? x : '').join(' ')); };
  console.group = console.log; console.groupEnd = () => {}; console.warn = console.log;
  // EXACT WorkoutBuilderSheet.handleGenerate shape for a single-domain push session:
  const r: any = await generateHomeWorkout({
    userProfile: profile, testLocation: 'park',
    availableTime: 15, difficulty: 2, targetDifficulty: 2,
    requiredDomains: ['push'], strictDomains: true, isManualOverride: true,
  } as any);
  console.log = realLog;
  for (const l of lines) if (/honouring|availableTime|volumeCap|TimeVolume|default|ceiling|Bolt2|strict|single/i.test(l)) realLog(l.trim().slice(0, 150));
  const w = r?.workout;
  const warm = w.exercises.filter((e: any) => e.exerciseRole === 'warmup').length;
  const cool = w.exercises.filter((e: any) => e.exerciseRole === 'cooldown').length;
  realLog(`PUSH-15 RESULT: est=${w.estimatedDuration}min sets=${w.totalPlannedSets} main=${w.exercises.length - warm - cool} warmup=${warm} cooldown=${cool}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error('FAILED:', e?.message); process.exit(1); });
