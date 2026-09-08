/**
 * ONE unitId-generation function for every non-numbered unit, both write
 * paths — Task 1's import script AND Task 2's pending-unit approval flow
 * (05.09.2026, after a real production incident: bn_u_<hebrew-slug> IDs
 * silently never triggered onUnitWrite — Eventarc doesn't fire Firestore
 * document-write triggers for a document whose ID contains non-ASCII
 * characters. 5 real, already-imported battalions were invisible in search
 * with zero errors anywhere; found only by an end-to-end production test,
 * not by the emulator or by code review. See scripts/import-military-units.ts
 * and pending-unit.service.ts for the two call sites.
 *
 * A numbered unit (Task 1's file always has these) keeps the existing,
 * already-live, already-ASCII convention verbatim: <prefix>_<number>. A
 * nameless unit (Task 1's סיירות/חטמ״רים, or ANY Task 2 submission — a
 * soldier never has a real military designator number to give) gets
 * <prefix>_<hash> instead of embedding the raw name — deterministic (same
 * name+parent always hashes the same, so idempotency and the dedup-key
 * property from the original co_<parent>_<slug> design are unchanged),
 * parent-scoped where a real parent exists (battalion→orgId, company→
 * parentUnitId — extra collision safety Task 1's manually-reviewed numbered
 * IDs don't need but a live, unreviewed Task 2 submission does), and
 * ASCII-only by construction. The unit's real name is never lost — it's
 * already stored as its own field (name/proposedName); the ID never needed
 * to be human-readable, that was never an actual requirement.
 */

export type UnitLevel = 'brigade' | 'battalion' | 'company';

const PREFIX: Record<UnitLevel, string> = { brigade: 'bde', battalion: 'bn', company: 'co' };

// FNV-1a, 32-bit — deterministic, fast, ASCII-only output (base36). Not
// cryptographic; collision risk is negligible at the scale this ever runs
// at (dozens to low hundreds of nameless units) and buildUnitDoc's
// pre-write existence check (see its own doc comment) catches the
// astronomically unlikely case anyway rather than silently overwriting.
function hashToAscii(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

function normalizeForHash(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export interface ComputeUnitIdInput {
  level: UnitLevel;
  /** A real military designator number (Task 1's file) — omit entirely for
   *  a nameless unit; never guess or derive one. */
  displayNumber?: number | null;
  /** Real parent scope key: the brigade's orgId for a battalion, the
   *  battalion's real unitId for a company. Required for a nameless
   *  battalion/company; irrelevant for brigade (no parent to scope by). */
  parentScope?: string | null;
  /** Required when displayNumber is absent. */
  name?: string | null;
}

export function computeUnitId({ level, displayNumber, parentScope, name }: ComputeUnitIdInput): string {
  const prefix = PREFIX[level];

  if (displayNumber != null) {
    return `${prefix}_${displayNumber}`;
  }

  if (!name || !name.trim()) {
    throw new Error(`computeUnitId: name is required for a nameless ${level} (no displayNumber given)`);
  }
  const hash = hashToAscii(normalizeForHash(name));

  if (level === 'brigade') return `${prefix}_u_${hash}`;

  if (!parentScope) {
    throw new Error(`computeUnitId: parentScope is required for a nameless ${level}`);
  }
  return `${prefix}_${parentScope}_${hash}`;
}
