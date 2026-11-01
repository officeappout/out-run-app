/**
 * Authority CRM split (security fix, 01.11.2026).
 *
 * authorities/{id} is world-readable (city lookups need name/type/parent…),
 * so OUT's sales CRM (staff contacts, meeting notes, tasks, quotes, Drive
 * links) lives in authorities/{id}/crm_private/main, readable by isAdmin()
 * only. Pure helpers here — no Firebase import — shared by the client
 * service, the Admin SDK readers/writers and the migration script.
 *
 * Read contract: the private doc wins per field; a field missing there falls
 * back to the legacy copy on the main doc (pre-migration data).
 * Write contract: every write of a CRM field writes the FULL value, derived
 * from the merged view, to crm_private/main — never to the main doc.
 */

export const AUTHORITY_CRM_FIELDS = ['contacts', 'activityLog', 'tasks', 'financials', 'documents'] as const;
export type AuthorityCrmField = (typeof AUTHORITY_CRM_FIELDS)[number];

export const CRM_PRIVATE_SUBCOLLECTION = 'crm_private';
export const CRM_PRIVATE_DOC_ID = 'main';

type Data = Record<string, unknown>;

export function isCrmField(key: string): key is AuthorityCrmField {
  return (AUTHORITY_CRM_FIELDS as readonly string[]).includes(key);
}

/** Split a write payload into the public main-doc part and the private CRM part. */
export function splitCrmFields<T extends Data>(data: T): { publicData: Data; crmData: Partial<Record<AuthorityCrmField, unknown>> } {
  const publicData: Data = {};
  const crmData: Partial<Record<AuthorityCrmField, unknown>> = {};
  for (const [k, v] of Object.entries(data)) {
    if (isCrmField(k)) crmData[k] = v;
    else publicData[k] = v;
  }
  return { publicData, crmData };
}

/** Only the CRM fields that are present (not undefined) on a doc. */
export function pickCrmFields(data: Data | null | undefined): Partial<Record<AuthorityCrmField, unknown>> {
  const out: Partial<Record<AuthorityCrmField, unknown>> = {};
  if (!data) return out;
  for (const f of AUTHORITY_CRM_FIELDS) if (data[f] !== undefined) out[f] = data[f];
  return out;
}

/** Main doc + private CRM doc → one view. Private wins per field; legacy main-doc copy is the fallback. */
export function mergeCrmFields<T extends Data>(main: T, crmPrivate: Data | null | undefined): T {
  if (!crmPrivate) return main;
  return { ...main, ...pickCrmFields(crmPrivate) };
}

/**
 * Migration plan for one authority: what to write to crm_private/main and
 * which legacy keys to delete from the main doc. A field already present in
 * the private doc is newer (writes go there first) and is never overwritten.
 */
export function planCrmMigration(main: Data, crmPrivate: Data | null | undefined): {
  toWrite: Partial<Record<AuthorityCrmField, unknown>>;
  toDelete: AuthorityCrmField[];
  keptPrivate: AuthorityCrmField[];
} {
  const legacy = pickCrmFields(main);
  const existing = pickCrmFields(crmPrivate);
  const toWrite: Partial<Record<AuthorityCrmField, unknown>> = {};
  const keptPrivate: AuthorityCrmField[] = [];
  for (const f of Object.keys(legacy) as AuthorityCrmField[]) {
    if (existing[f] !== undefined) keptPrivate.push(f);
    else toWrite[f] = legacy[f];
  }
  return { toWrite, toDelete: Object.keys(legacy) as AuthorityCrmField[], keptPrivate };
}
