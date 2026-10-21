/**
 * scripts/city-inventory/lib/apply.node.ts — the ONLY write path of the
 * inventory run (RC4 I1; David runs it, never an agent).
 *
 * Guard rails (enforced here):
 *   - explicit `--apply --project <id> --authority <authorityId>`; production
 *     only as `--project appout-1` with a matching service-account key
 *     (openTarget), otherwise the Firestore emulator (FIRESTORE_EMULATOR_HOST);
 *   - the authority resolved for the run must equal `--authority`;
 *   - `TARGET:` is printed first, then a typed "YES" is required;
 *   - writes go through the I0 store only: `city_inventory/{authorityId}` +
 *     `runs/{runId}` in one batch (all-or-nothing). Nothing else is touched.
 */
import { writeCityInventory, type CityInventoryInput, type InventoryDb } from '../../../src/lib/city-inventory';
import { confirmTypedYes, describeTarget, validateApplyFlags, type ApplyFlags, type Target } from '../../trails/lib/trails-apply.node';

export function applyFlagErrors(flags: ApplyFlags, resolvedAuthorityId: string): string[] {
  const errs = validateApplyFlags(flags);
  if (flags.authority && flags.authority !== resolvedAuthorityId) {
    errs.push(`--authority ${flags.authority} does not match the run's authority ${resolvedAuthorityId}`);
  }
  return errs;
}

export async function applyInventory(target: Target, inv: CityInventoryInput, confirm = confirmTypedYes, log = console.log): Promise<boolean> {
  log(`\nTARGET: ${describeTarget(target)}`);
  log(`  write city_inventory/${inv.authorityId} + city_inventory/${inv.authorityId}/runs/${inv.snapshot.runId} (one batch)`);
  log(`  ${inv.city}: readiness ${inv.readiness.level} ${inv.readiness.score}/100, OSM ${inv.snapshot.osmPbfDate}`);
  const ok = await confirm(`\nType YES to write 2 doc(s) to ${describeTarget(target)}: `);
  if (!ok) {
    log('Not confirmed — nothing was written.');
    return false;
  }
  const { FieldValue } = await import('firebase-admin/firestore');
  await writeCityInventory(target.db as unknown as InventoryDb, inv, FieldValue.serverTimestamp());
  log(`Written: city_inventory/${inv.authorityId} (+ run ${inv.snapshot.runId}).`);
  return true;
}
