/**
 * Cloud Function: onAuthorityWrite
 *
 * Triggers on any create/update/delete of authorities/{authorityId}.
 * Phase 3a (02.09.2026, docs/research/military-persona-unified-architecture.md
 * §3a) of the military-persona work: for military authorities only, this
 * keeps two things in sync from the authority's `name` field:
 *   1. `armType`/`statusCategory` — real fields on the authority doc itself,
 *      extracted from the parenthetical suffix of the brigade name (e.g.
 *      `"חטיבה 11 (חי"ר - מילואים)"` -> armType="חי"ר", statusCategory="מילואים").
 *   2. A brigade-level entry in `unitDirectory` (the read-only public
 *      search index — see onUnitWrite.ts's header comment for the full
 *      rationale) denormalizing name + those two fields.
 *
 * Non-military authorities, or ones missing a name, are skipped outright
 * (and any stale unitDirectory entry is removed) rather than published
 * with guessed/empty values — this collection is publicly readable, so
 * garbage-in must not become garbage-visible.
 */

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// Mirrors authorityTypeToTenantType()'s precedence
// (src/features/admin/config/tenantLabels.ts:178-186) — hand-duplicated
// here because functions/src cannot import from src/ (separate tsconfig
// root, same cross-project boundary as persona-alias-map.service.ts).
// Three inconsistent vertical-tagging fields exist in production
// (docs/research/military-persona-unified-architecture.md §9 finding #4)
// — this checks all of them in the same order the client-side helper
// does, rather than inventing a new classification rule.
function isMilitaryAuthority(data: Record<string, unknown>): boolean {
  const tenantType = typeof data.tenantType === 'string' ? data.tenantType : null;
  if (tenantType) return tenantType === 'military';

  const vertical = typeof data.vertical === 'string' ? data.vertical : null;
  if (vertical) return vertical === 'military';

  const type = typeof data.type === 'string' ? data.type.toLowerCase() : '';
  return (
    type === 'military' ||
    type === 'military_unit' ||
    type.includes('military') ||
    type.includes('army') ||
    type.includes('צבא')
  );
}

// Starting set observed in live production brigade names — not exhaustive.
// A statusCategory value outside this set is still stored (real data isn't
// discarded), but the backfill script's dry-run output flags it separately
// for human review rather than silently guessing it must be an armType.
const STATUS_VALUES = new Set(['סדיר', 'מילואים', 'מרחבית']);

export interface ExtractedArmStatus {
  armType: string | null;
  statusCategory: string | null;
}

/**
 * Extracts armType/statusCategory from a brigade name's trailing
 * parenthetical, e.g. `"חטיבה 11 (חי"ר - מילואים)"`. Handles the real
 * ambiguous shapes seen in production: a single-part parenthetical
 * (`"(אש)"` — could be an arm type with no stated status), and names with
 * no parenthetical at all (pre-cleanup legacy names).
 */
export function extractArmAndStatus(name: string): ExtractedArmStatus {
  const trimmed = name.trim();

  // Last top-level parenthetical group, not the first — defensive against
  // a hypothetical name containing an earlier unrelated paren.
  const match = trimmed.match(/\(([^()]+)\)\s*$/);
  if (!match) return { armType: null, statusCategory: null };

  // Normalize dash variants before splitting: real data uses " - ", but
  // don't assume it — also accept en-dash and Hebrew maqaf.
  const normalized = match[1].replace(/[–־]/g, '-');
  const parts = normalized
    .split(/\s*-\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (parts.length >= 2) {
    return { armType: parts[0], statusCategory: parts[1] };
  }
  if (parts.length === 1) {
    // Ambiguous single-part case: check the known status vocabulary
    // FIRST — the reverse (a status-only paren with no arm stated) is
    // equally plausible and must classify the other way.
    if (STATUS_VALUES.has(parts[0])) {
      return { armType: null, statusCategory: parts[0] };
    }
    return { armType: parts[0], statusCategory: null };
  }
  return { armType: null, statusCategory: null };
}

export const onAuthorityWrite = onDocumentWritten(
  'authorities/{authorityId}',
  async (event) => {
    const { authorityId } = event.params;
    const afterExists = event.data?.after?.exists ?? false;

    if (!afterExists) {
      await db.collection('unitDirectory').doc(authorityId).delete().catch(() => {});
      logger.info(`[onAuthorityWrite] Deleted unitDirectory entry ${authorityId} (authority deleted)`);
      return;
    }

    const data = event.data!.after.data() as Record<string, unknown>;
    const name = typeof data.name === 'string' ? data.name.trim() : '';

    if (!isMilitaryAuthority(data) || !name) {
      // Not military, or reclassified/renamed to blank — remove any
      // stale entry rather than leave a wrong one behind.
      await db.collection('unitDirectory').doc(authorityId).delete().catch(() => {});
      return;
    }

    const { armType, statusCategory } = extractArmAndStatus(name);

    // Idempotency guard — this function writes back to the same document
    // it triggers on. Compare against existing values first; skip if
    // unchanged, or this retriggers forever. Same guard class as
    // `alreadyMigrated` in scripts/_migrate-brigade-810-dedup.ts.
    const armTypeUnchanged = (data.armType ?? null) === armType;
    const statusCategoryUnchanged = (data.statusCategory ?? null) === statusCategory;

    if (!armTypeUnchanged || !statusCategoryUnchanged) {
      await db.collection('authorities').doc(authorityId).update({
        armType,
        statusCategory,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      logger.info(`[onAuthorityWrite] Updated armType/statusCategory for ${authorityId}: ${armType} / ${statusCategory}`);
    }

    // serviceType (regular/reserve/mixed) is a SEPARATE field from the
    // name-derived armType/statusCategory above — it's set explicitly at
    // creation (unit-import, Phase 6c) and never derived/overwritten here,
    // so it survives every future onAuthorityWrite retrigger untouched.
    const serviceType = typeof data.serviceType === 'string' ? data.serviceType : null;

    // Unit icons (05.09.2026, officer-approved insignia) — brigades reuse
    // the EXISTING logoUrl field (same one city logos already use), synced
    // into unitDirectory as the unified `iconUrl` name every display
    // surface reads, regardless of whether the source was a brigade's
    // logoUrl or a unit's own iconUrl (see onUnitWrite.ts's own copy).
    const iconUrl = typeof data.logoUrl === 'string' ? data.logoUrl : null;

    await db.collection('unitDirectory').doc(authorityId).set({
      name,
      parentId: null,
      level: 'brigade',
      orgId: authorityId,
      unitId: null,
      armType,
      statusCategory,
      serviceType,
      iconUrl,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    logger.info(`[onAuthorityWrite] Synced unitDirectory entry ${authorityId}`);
  },
);
