/**
 * scripts/trails/seed-emulator-authority.ts — EMULATOR ONLY helper for the
 * owner's rehearsal of `--apply`: creates one `authorities/<id>` doc so the
 * name lookup has something to resolve. Refuses to run without
 * FIRESTORE_EMULATOR_HOST (it can never touch production).
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8089 npx tsx scripts/trails/seed-emulator-authority.ts --project trails-rehearsal --id emu_shaar_hanegev --name "שער הנגב"
 */
import { flagValue, openTarget } from './lib/trails-apply.node';

async function main() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('FIRESTORE_EMULATOR_HOST is not set — this helper only writes to the emulator.');
  const argv = process.argv.slice(2);
  const project = flagValue(argv, 'project');
  const id = flagValue(argv, 'id');
  const name = flagValue(argv, 'name');
  if (!project || !id || !name) throw new Error('usage: --project <emulatorProject> --id <authorityId> --name <authority name>');
  if (project === 'appout-1') throw new Error('use a rehearsal project id, not appout-1, on the emulator');
  const t = await openTarget(project);
  await t.db.collection('authorities').doc(id).set({ name, seededFor: 'trails-apply-rehearsal' });
  console.log(`emulator ${t.emulator} / ${project}: authorities/${id} = "${name}"`);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
