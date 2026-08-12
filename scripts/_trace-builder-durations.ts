import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
(globalThis as any).React = require('react');
async function main() {
  const { generateHomeWorkout } = await import('../src/features/workout-engine/services/home-workout.service');
  const profile: any = {
    core: { name: 'trace', weight: 75, gender: 'male' },
    progression: {
      tracks: { push: { currentLevel: 6 }, pull: { currentLevel: 6 }, legs: { currentLevel: 6 }, core: { currentLevel: 6 } },
      activePrograms: [{ id: 'full_body', templateId: 'full_body', startDate: new Date().toISOString(), durationWeeks: 12, currentWeek: 1, focusDomains: ['full_body'] }],
    },
    equipment: { park: [] }, health: { injuries: [] }, lifestyle: {},
  };
  const realLog = console.log;
  for (const t of [15, 30, 45, 60]) {
    const lines: string[] = [];
    console.log = (...a: any[]) => { lines.push(a.map(x => typeof x === 'string' ? x : '').join(' ')); };
    console.group = console.log; console.groupEnd = () => {}; console.warn = console.log;
    // EXACT WorkoutBuilderSheet.handleGenerate shape (no chips):
    const r: any = await generateHomeWorkout({
      userProfile: profile, testLocation: 'park',
      availableTime: t, difficulty: 2, targetDifficulty: 2, isManualOverride: true,
    } as any);
    console.log = realLog;
    const honour = lines.find(l => l.includes('honouring requested'));
    const cap = lines.find(l => l.includes('volumeCap] Bolt2'));
    const w = r?.workout;
    realLog(`REQUEST ${t}min → est=${w.estimatedDuration}min sets=${w.totalPlannedSets} ex=${w.exercises.length}`);
    if (honour) realLog(`   ${honour.trim().slice(0, 100)}`);
    if (cap) realLog(`   ${cap.trim().slice(0, 100)}`);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error('FAILED:', e?.message); process.exit(1); });
