import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
(globalThis as any).React = require('react');
async function main() {
  const { generateHomeWorkoutTrio } = await import('../src/features/workout-engine/services/home-workout.service');
  const profile: any = {
    core: { name: 'trace', weight: 75, gender: 'male' },
    progression: {
      tracks: { push: { currentLevel: 6 }, pull: { currentLevel: 6 }, legs: { currentLevel: 6 }, core: { currentLevel: 6 } },
      activePrograms: [{ id: 'full_body', templateId: 'full_body', startDate: new Date().toISOString(), durationWeeks: 12, currentWeek: 1, focusDomains: ['full_body'] }],
    },
    equipment: { park: [] }, health: { injuries: [] }, lifestyle: {},
  };
  const realLog = console.log; const lines: string[] = [];
  console.log = (...a: any[]) => { lines.push(a.map(x => typeof x === 'string' ? x : '').join(' ')); };
  console.group = console.log; console.groupEnd = () => {}; console.warn = console.log;
  // EXACT StatsOverview dashboard shape: availableTime=60, no targetDifficulty
  await generateHomeWorkoutTrio({ userProfile: profile, testLocation: 'park', availableTime: 60 } as any);
  console.log = realLog;
  for (const l of lines) if (/volumeCap\] Bolt2|honouring/.test(l)) realLog(l.trim().slice(0, 110));
}
main().then(() => process.exit(0)).catch((e) => { console.error('FAILED:', e?.message); process.exit(1); });
