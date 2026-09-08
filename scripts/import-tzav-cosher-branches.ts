/**
 * scripts/import-tzav-cosher-branches.ts
 *
 * Imports the 13 צו כושר branches (scripts/data/tzav-cosher-branches.csv)
 * into community_groups + community_groups_reserve, persona-gated ('reserve').
 *
 * Writes through the REAL, unmodified admin panel service functions
 * (createGroup/updateGroup, src/features/admin/services/community.service.ts)
 * — signed in as David's own real admin account via a short-lived custom
 * token, exactly like every panel write. This is not a re-implementation:
 * it is the literal same code path, same Firestore rules check, same
 * AUDIENCE_SENSITIVE_FIELDS split — per David's explicit condition that a
 * second write path is exactly how a model goes out of sync (07.09.2026).
 *
 * Location precision (meetingLocation.precision, community.types.ts,
 * 08.09.2026): a branch with no real meeting point gets 'city' — a
 * city-center coordinate used ONLY so it sorts/filters into "nearby
 * groups" sanely; the app never shows a distance/travel-time/pin/navigate
 * for it (GroupCard/GroupDetailsDrawer). 'exact' means a real park or
 * geocoded street address. The exact/city split below for each of the 13
 * rows is the result of manual research this session (park-name matching
 * against our own `parks` collection, Mapbox geocoding attempts — most
 * failed or returned wrong-city noise, e.g. "מודיעין" alone resolving to
 * the unrelated "מודיעין עילית" — and a final fallback to our own
 * `authorities` collection's stored city coordinates, cross-checked
 * against Mapbox where both were available). It is NOT re-derived by this
 * script — hardcoded per row, reviewed by David before this file existed.
 *
 * tzav-tlv-sportek-sun is `status: existing` — already created by David
 * directly in the panel. This script NEVER creates or overwrites it —
 * only fetches and diffs it against the CSV row, reporting mismatches.
 *
 * SAFE BY DEFAULT: no flags = dry-run, zero writes, full report.
 * --confirm = actually creates the 11 new groups (12 non-existing rows,
 * minus none skipped) via createGroup(), and prints the existing-group
 * diff report (comparison only, never a write to that group).
 * Idempotent: re-running skips any row whose exact `id` already has a
 * matching community_groups doc created by a PRIOR run of this script
 * (tracked via a `importSourceId` field written on create — see below).
 */
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: '/Users/calisthenicsltd/Development/appout-1/.env.local' });
import * as admin from 'firebase-admin';
import { signInWithCustomToken } from 'firebase/auth';

function init() {
  if (admin.apps.length) return;
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
}

const ADMIN_UID = 'nX2AM2HJ79WulFZ2F7jGoA4kDhl1'; // David's own real admin account — same identity every panel write uses

// ── Day-of-week mapping — DISPLAYED in the dry-run so it can be verified,
// not just trusted. ScheduleSlot.dayOfWeek: 0-6, Sunday-Saturday
// (community.types.ts's own doc comment).
const DAY_MAP: Record<string, number> = {
  'ראשון': 0, 'שני': 1, 'שלישי': 2, 'רביעי': 3, 'חמישי': 4, 'שישי': 5, 'שבת': 6,
};

// ── Manually-researched location resolution per row (see file header). ──
type LocationResolution =
  | { precision: 'exact'; parkId: string; lat: number; lng: number; addressOverride?: string }
  | { precision: 'exact'; lat: number; lng: number; addressOverride: string } // geocoded address, no parkId
  | { precision: 'city'; lat: number; lng: number };

const LOCATION_RESOLUTION: Record<string, LocationResolution> = {
  'tzav-rehovot-sun': { precision: 'city', lat: 31.8948, lng: 34.8118 },
  'tzav-beer-sheva-sun': { precision: 'city', lat: 31.253, lng: 34.7915 },
  'tzav-kiryat-gat-sun': { precision: 'city', lat: 31.62839, lng: 34.79542 },
  'tzav-pardes-hana-mon': { precision: 'exact', lat: 32.481146, lng: 34.987223, addressOverride: 'נחילות 2, פרדס חנה-כרכור' },
  'tzav-tlv-frishman-mon': { precision: 'exact', parkId: 'iVAbiWjusg3TbXHtQMH7', lat: 32.081547934332846, lng: 34.76733994750661 },
  'tzav-herzliya-mon': { precision: 'city', lat: 32.1636, lng: 34.8443 },
  // David, 08.09.2026: "יבנה" is NOT מועצה אזורית חבל יבנה — the authority's
  // own record has no coordinate at all, this is a Mapbox fallback for the
  // nearby town. Acceptable ONLY because precision:'city' means we never
  // show a distance/travel-time built on it. DO NOT "upgrade" this to
  // 'exact' or start showing distance for this row without a real
  // coordinate for the council itself — that would turn an approximation
  // into a claimed fact, exactly the bug class this field exists to prevent.
  'tzav-hevel-yavne-tue': { precision: 'city', lat: 31.877283, lng: 34.73719 },
  'tzav-alumim-tue': { precision: 'city', lat: 31.45213, lng: 34.513715 },
  // Location varies week to week (location_note) — David's rule: never pin
  // one park even though "ספורטק - חיפה" is a real, matching park record.
  'tzav-haifa-tue': { precision: 'city', lat: 32.794, lng: 34.9896 },
  'tzav-jerusalem-wed': { precision: 'exact', parkId: 'oikhb3QdCVu8uVhD0l4I', lat: 31.780187006291378, lng: 35.20755330594489 },
  'tzav-modiin-wed': { precision: 'city', lat: 31.8966, lng: 35.0091 },
  'tzav-pardes-hana-fri': { precision: 'city', lat: 32.474815, lng: 34.9727 },
};

interface Row {
  id: string; name: string; city: string; parkId: string; address: string;
  day: string; time: string; durationMin: number; coordinator: string; phone: string;
  registrationLink: string; description: string; persona: string; imagePath: string;
  status: string; locationNote: string; importNote: string; lineNo: number;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQuotes = false; }
      else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { cells.push(cur); cur = ''; }
    else cur += ch;
  }
  cells.push(cur);
  return cells;
}

function loadRows(csvPath: string): Row[] {
  const raw = fs.readFileSync(csvPath, 'utf-8');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = parseCsvLine(lines[0]).map((h) => h.trim());
  const idx = (col: string) => {
    const i = header.indexOf(col);
    if (i === -1) throw new Error(`CSV missing column "${col}". Header: ${header.join(',')}`);
    return i;
  };
  const c = {
    id: idx('id'), name: idx('name'), city: idx('city'), parkId: idx('park_id'), address: idx('address'),
    day: idx('day'), time: idx('time'), duration: idx('duration_min'), coordinator: idx('coordinator'),
    phone: idx('phone'), link: idx('registration_link'), desc: idx('description'), persona: idx('persona'),
    image: idx('image_path'), status: idx('status'), note: idx('location_note'), importNote: idx('import_note'),
  };
  return lines.slice(1).map((line, i) => {
    const cells = parseCsvLine(line);
    return {
      id: cells[c.id]?.trim() ?? '',
      name: cells[c.name]?.trim() ?? '',
      city: cells[c.city]?.trim() ?? '',
      parkId: cells[c.parkId]?.trim() ?? '',
      address: cells[c.address]?.trim() ?? '',
      day: cells[c.day]?.trim() ?? '',
      time: cells[c.time]?.trim() ?? '',
      durationMin: Number(cells[c.duration]?.trim() ?? '60'),
      coordinator: cells[c.coordinator]?.trim() ?? '',
      phone: cells[c.phone]?.trim() ?? '',
      registrationLink: cells[c.link]?.trim() ?? '',
      description: cells[c.desc]?.trim() ?? '',
      persona: cells[c.persona]?.trim() ?? '',
      imagePath: cells[c.image]?.trim() ?? '',
      status: cells[c.status]?.trim() ?? '',
      locationNote: cells[c.note]?.trim() ?? '',
      importNote: cells[c.importNote]?.trim() ?? '',
      lineNo: i + 2,
    };
  });
}

function buildGroupPayload(row: Row) {
  const resolution = LOCATION_RESOLUTION[row.id];
  if (!resolution) throw new Error(`No LOCATION_RESOLUTION entry for row "${row.id}" — refusing to guess.`);

  const dayOfWeek = DAY_MAP[row.day];
  if (dayOfWeek === undefined) throw new Error(`Unrecognized day "${row.day}" for row "${row.id}"`);

  const meetingLocation: Record<string, unknown> = {
    precision: resolution.precision,
    location: { lat: resolution.lat, lng: resolution.lng },
    address: 'addressOverride' in resolution && resolution.addressOverride
      ? resolution.addressOverride
      : (resolution.precision === 'city' ? row.city : row.address),
  };
  if ('parkId' in resolution && resolution.parkId) meetingLocation.parkId = resolution.parkId;

  const scheduleSlots = [{
    dayOfWeek, time: row.time, frequency: 'weekly' as const, durationMinutes: row.durationMin,
  }];

  const isActive = row.status !== 'pending';

  const data: Record<string, unknown> = {
    authorityId: '',
    name: row.name,
    description: row.description || '',
    category: 'calisthenics' as const,
    isActive,
    currentParticipants: 0,
    createdBy: ADMIN_UID,
    isPublic: true,
    isOfficial: false,
    source: 'authority' as const,
    meetingLocation,
    scheduleSlots,
    registrationLink: row.registrationLink || undefined,
  };
  if (row.coordinator) data.leaderName = row.coordinator;
  if (row.phone) data.phone = row.phone;

  return { data, dayOfWeek, resolution };
}

async function main() {
  const confirm = process.argv.includes('--confirm');
  const csvPath = path.join(__dirname, 'data', 'tzav-cosher-branches.csv');
  const rows = loadRows(csvPath);
  console.log(`Loaded ${rows.length} rows.\n`);

  init();
  const adb = admin.firestore();

  // ── Existing-group comparison (report only, never written) ──────────
  const existingRow = rows.find((r) => r.status === 'existing');
  if (existingRow) {
    console.log('── EXISTING GROUP COMPARISON (tzav-tlv-sportek-sun) — report only ──────');
    const pubSnap = await adb.collection('community_groups').doc('HZBAz5d3UKEcs20R6EIC').get();
    const gatedSnap = await adb.collection('community_groups_reserve').doc('HZBAz5d3UKEcs20R6EIC').get();
    const pub = pubSnap.data() ?? {};
    const gated = gatedSnap.data() ?? {};
    const diffs: string[] = [];
    if (pub.name !== existingRow.name) diffs.push(`name: existing="${pub.name}" csv="${existingRow.name}"`);
    const csvCoordinator = existingRow.coordinator;
    if ((gated.leaderName ?? '') !== csvCoordinator) diffs.push(`leaderName/coordinator: existing="${gated.leaderName ?? '(none)'}" csv="${csvCoordinator}"`);
    if ((gated.phone ?? '') !== (existingRow.phone || '')) diffs.push(`phone: existing="${gated.phone ?? '(none)'}" csv="${existingRow.phone || '(empty)'}"`);
    if (gated.registrationLink !== existingRow.registrationLink) diffs.push(`registrationLink: existing="${gated.registrationLink}" csv="${existingRow.registrationLink}"`);
    const existingSlot = (gated.scheduleSlots ?? [])[0] ?? {};
    const expectedDay = DAY_MAP[existingRow.day];
    if (existingSlot.dayOfWeek !== expectedDay) diffs.push(`scheduleSlots[0].dayOfWeek: existing=${existingSlot.dayOfWeek} csv="${existingRow.day}"(=${expectedDay})`);
    if (existingSlot.time !== existingRow.time) diffs.push(`scheduleSlots[0].time: existing="${existingSlot.time}" csv="${existingRow.time}"`);
    if (existingSlot.durationMinutes !== existingRow.durationMin) diffs.push(`scheduleSlots[0].durationMinutes: existing=${existingSlot.durationMinutes} csv=${existingRow.durationMin}`);

    if (diffs.length === 0) {
      console.log('  ✅ No differences found.');
    } else {
      console.log(`  ⚠️  ${diffs.length} difference(s) found (NOT written — panel edit only):`);
      diffs.forEach((d) => console.log(`     - ${d}`));
    }
    console.log('');
  }

  // ── Rows to create ────────────────────────────────────────────────────
  const toCreate = rows.filter((r) => r.status !== 'existing');
  console.log(`── ${toCreate.length} ROWS TO CREATE ─────────────────────────────────────`);

  const results: { row: Row; alreadyImported: boolean; payload?: ReturnType<typeof buildGroupPayload> }[] = [];
  for (const row of toCreate) {
    // Idempotency check: has a PRIOR run of this script already created
    // this row (tracked by importSourceId, set on create below)?
    const existing = await adb.collection('community_groups').where('importSourceId', '==', row.id).limit(1).get();
    const alreadyImported = !existing.empty;
    let payload: ReturnType<typeof buildGroupPayload> | undefined;
    try {
      payload = buildGroupPayload(row);
    } catch (e) {
      console.log(`  🛑 ${row.id}: ${(e as Error).message}`);
      continue;
    }
    results.push({ row, alreadyImported, payload });

    console.log(`\n  ${alreadyImported ? '⏭️  SKIP (already imported)' : '➕ WILL CREATE'} — ${row.id}`);
    console.log(`     name: "${row.name}"`);
    console.log(`     day: "${row.day}" → dayOfWeek=${payload.dayOfWeek}, time=${row.time}, duration=${row.durationMin}min`);
    console.log(`     precision: ${payload.resolution.precision}${'parkId' in payload.resolution && payload.resolution.parkId ? `, parkId=${payload.resolution.parkId}` : ''}`);
    console.log(`     location: lat=${payload.resolution.lat}, lng=${payload.resolution.lng}`);
    console.log(`     address: "${payload.data.meetingLocation && (payload.data.meetingLocation as any).address}"`);
    console.log(`     coordinator: ${row.coordinator || '(none)'}  phone: ${row.phone || '(none, field omitted)'}`);
    console.log(`     isActive: ${payload.data.isActive}${row.status === 'pending' ? '  ← pending, hidden until reactivated' : ''}`);
    if (row.locationNote) console.log(`     location_note (must render on card): "${row.locationNote}"`);
    if (row.importNote) console.log(`     note: ${row.importNote}`);
  }

  const willCreate = results.filter((r) => !r.alreadyImported && r.payload).length;
  const willSkip = results.filter((r) => r.alreadyImported).length;
  const exactCount = results.filter((r) => !r.alreadyImported && r.payload?.resolution.precision === 'exact').length;
  const cityCount = results.filter((r) => !r.alreadyImported && r.payload?.resolution.precision === 'city').length;

  console.log(`\n── SUMMARY ───────────────────────────────────────────────`);
  console.log(`  Will create: ${willCreate}  (exact: ${exactCount}, city: ${cityCount})`);
  console.log(`  Already imported (skip): ${willSkip}`);
  console.log(`  Existing group (compared, not written): ${existingRow ? 1 : 0}`);

  if (!confirm) {
    console.log('\nDry run only — no writes performed. Re-run with --confirm to create.');
    return;
  }

  console.log('\n--confirm passed. Backing up current community_groups_reserve state before writing...');
  const backupDir = path.join(__dirname, '_backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const gatedBackupSnap = await adb.collection('community_groups_reserve').get();
  fs.writeFileSync(
    path.join(backupDir, `tzav-cosher-pre-import-${Date.now()}.json`),
    JSON.stringify(gatedBackupSnap.docs.map((d) => ({ id: d.id, ...d.data() })), null, 2),
  );

  const { auth, db } = await import('@/lib/firebase');
  const { createGroup } = await import('@/features/admin/services/community.service');
  const token = await admin.auth().createCustomToken(ADMIN_UID);
  await signInWithCustomToken(auth, token);
  console.log('Signed in as admin:', auth.currentUser?.uid);

  let created = 0;
  for (const { row, alreadyImported, payload } of results) {
    if (alreadyImported || !payload) continue;
    const groupId = await createGroup({ ...payload.data, importSourceId: row.id } as any, ['reserve']);
    console.log(`  ✅ created ${row.id} → community_groups/${groupId}`);
    created++;
  }

  await auth.signOut();
  console.log(`\nDone. ${created} groups created.`);

  const gatedAfter = await adb.collection('community_groups_reserve').count().get();
  console.log(`community_groups_reserve doc count after: ${gatedAfter.data().count} (was ${gatedBackupSnap.size} before this run)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
