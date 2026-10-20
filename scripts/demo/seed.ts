/**
 * scripts/demo/seed.ts — creates the closed demo world (PR 3 of agent-briefs/demo-users-design.md).
 *
 *   npx tsx scripts/demo/seed.ts --project <id> --dry-run                       # counts only, no write
 *   npx tsx scripts/demo/seed.ts --project <id> --emulator --confirm "צור את עולם הדמו"
 *   npx tsx scripts/demo/seed.ts --project appout-1 --confirm "צור את עולם הדמו"  # production (owner only)
 *
 * Options: --days <n> (history, default 60) · --rate <writes/s> (default 50 on production,
 * none on the emulator) · --no-leagues (skip the league aggregates).
 * See scripts/demo/README.md (Hebrew) for the owner's exact commands.
 */
import { HISTORY_DAYS, SEED_CONFIRM_PHRASE } from './lib/config';
import { runSeed } from './lib/seed-run';
import { closeDemoTarget, describeDemoTarget, loadEnvLocal, openDemoTarget, parseDemoArgs, requireConfirm } from './lib/target';

async function main() {
  const args = parseDemoArgs(process.argv.slice(2));
  await loadEnvLocal();
  if (!args.dryRun) requireConfirm(args, SEED_CONFIRM_PHRASE, 'זריעת עולם הדמו');
  const t = await openDemoTarget(args);
  console.log(`יעד: ${describeDemoTarget(t)}${args.dryRun ? ' — הרצה יבשה, בלי כתיבה' : ''}`);
  try {
    const days = args.values['--days'] ? Number(args.values['--days']) : HISTORY_DAYS;
    if (!Number.isInteger(days) || days < 1 || days > 120) throw new Error('--days חייב להיות 1–120');
    const rate = args.values['--rate'] ? Number(args.values['--rate']) : t.emulator ? null : 50;
    const report = await runSeed(t.db, {
      historyDays: days,
      ratePerSec: rate,
      applyLeagues: !args.flags.has('--no-leagues'),
      dryRun: args.dryRun,
      log: (s) => console.log(s),
    });
    console.log(`\n${report.dryRun ? 'היה נכתב' : 'נכתב'}: ${report.users} משתמשי דמו`);
    console.table(report.counts);
    if (report.leagues) console.log('ליגות:', report.leagues);
  } finally {
    await closeDemoTarget(t);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
