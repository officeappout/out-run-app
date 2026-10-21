#!/usr/bin/env npx tsx
/**
 * seed-push-library — fills the push library (the existing Notification
 * Manager collection, workoutMetadata/notifications/notifications) with the
 * rewritten push copy, and classifies the old rows for the owner.
 *
 *   npx tsx scripts/seed-push-library.ts           # DRY RUN (default): reads only
 *   npx tsx scripts/seed-push-library.ts --write   # apply
 *
 * Auth (either):
 *   - Application Default Credentials — no key file needed:
 *       gcloud auth application-default login
 *     (project: GOOGLE_CLOUD_PROJECT / GCLOUD_PROJECT, else 'appout-1');
 *   - or FIREBASE_SERVICE_ACCOUNT_KEY (JSON) from .env.local
 *     (`npx tsx --env-file=.env.local scripts/seed-push-library.ts`), which wins when set.
 * Nothing is written without --write.
 *
 * What it does
 *   1. Reads the whole collection and saves a JSON backup to
 *      scripts/_backups/ (gitignored) BEFORE anything else. --write refuses
 *      to continue if the backup can't be written.
 *   2. INSERTS one row per code default in the catalog
 *      (src/features/notifications/push-library/push-library.core.ts =
 *      title_after/body_after of training-audit/copy/push_copy.csv), doc id
 *      `lib_<pushType>_<n>`, with Firestore `create()` — a row that already
 *      exists is never overwritten (an admin may have edited it). Gendered
 *      defaults carry gender / subjectGender and a shared pairId
 *      (`lib_<pushType>_pair_<name>`), so the panel shows them as a pair.
 *   3. ARCHIVES the 18 original content-library rows the rewritten copy
 *      replaces (Daily_Goal / Future_Partner_Plan, no pushType yet; most of
 *      them carry slashes, em dashes or emoji and are already skipped at
 *      send time): active:false, archived:true, archivedReason. Text untouched.
 *   4. CLASSIFIES the dormant Inactivity rows (never sent by any code):
 *        keep    → pushType 'retention_lapse', needsRewrite:true, active:false,
 *                  rewriteReasons[], persona → audience, gender for rows
 *                  that address one gender. Text NOT rewritten.
 *        archive → active:false, archived:true, archivedReason.
 *   5. Writes a CSV report of every classification to scripts/output/.
 *   6. PATCHES conditions onto rows seeded before their default gained one
 *      (21.10.2026: retention "the park" rows → track strength; drop-off
 *      "נשאר רק עוד צעד" rows → stage near_end) — only rows still carrying
 *      the default's exact text and no conditions (seedConditionPatches).
 *
 * The classification itself is pure and unit-tested:
 * src/features/notifications/push-library/push-library.seed-classify.ts.
 *
 * Safety (the seed-hybrid-slot-flags lesson, CLAUDE.md): rows are read first
 * and only rows that are still unclassified (no pushType, not archived) are
 * touched; every update is conditioned on the doc's updateTime from that
 * read, so a row an admin changed in between is skipped, not overwritten.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as admin from 'firebase-admin';
import {
  PUSH_CATALOG,
  PUSH_LIBRARY_COLLECTION,
  legacyPushMapping,
} from '../src/features/notifications/push-library/push-library.core';
import {
  classifyDormant,
  classifyLegacyInUse,
  seedConditionPatches,
  seedInsertRows,
  type Classification,
} from '../src/features/notifications/push-library/push-library.seed-classify';
import { normalizePersonaValue } from '../src/features/user/onboarding/services/persona-alias-map.service';

const WRITE = process.argv.includes('--write');
const ACTOR = 'seed-push-library';
const ROOT = path.resolve(__dirname, '..');

const DEFAULT_PROJECT_ID = 'appout-1';

/**
 * The service-account key when FIREBASE_SERVICE_ACCOUNT_KEY is set, else
 * Application Default Credentials (`gcloud auth application-default login`).
 * Exported for tests.
 */
export function firebaseInitOptions(env: NodeJS.ProcessEnv): admin.AppOptions {
  const rawKey = env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (rawKey) return { credential: admin.credential.cert(JSON.parse(rawKey) as admin.ServiceAccount) };
  const projectId = env.GOOGLE_CLOUD_PROJECT || env.GCLOUD_PROJECT || DEFAULT_PROJECT_ID;
  console.log(`No FIREBASE_SERVICE_ACCOUNT_KEY — using application default credentials (project ${projectId}).`);
  return { credential: admin.credential.applicationDefault(), projectId };
}

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!admin.apps.length) admin.initializeApp(firebaseInitOptions(process.env));
  const db = admin.firestore();
  const col = db.collection(PUSH_LIBRARY_COLLECTION);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');

  console.log(`\n── seed-push-library ── ${WRITE ? 'WRITE' : 'DRY RUN (no writes)'} ── ${PUSH_LIBRARY_COLLECTION}\n`);

  // 1. Read + backup
  const snap = await col.get();
  console.log(`Read ${snap.size} doc(s).`);
  const backupDir = path.join(ROOT, 'scripts/_backups');
  const backupPath = path.join(backupDir, `push-library-notifications-${stamp}.json`);
  try {
    fs.mkdirSync(backupDir, { recursive: true });
    fs.writeFileSync(
      backupPath,
      JSON.stringify(snap.docs.map((d) => ({ id: d.id, updateTime: d.updateTime.toDate().toISOString(), data: d.data() })), null, 2),
    );
    console.log(`Backup: ${path.relative(ROOT, backupPath)}`);
  } catch (err) {
    console.error('Backup failed:', err);
    if (WRITE) process.exit(1);
  }

  const byId = new Map(snap.docs.map((d) => [d.id, d]));

  // 2. Inserts (code defaults incl. the gendered pairs; an existing row is never overwritten)
  const inserts = seedInsertRows().filter((r) => !byId.has(r.id));
  const insertSkipped = seedInsertRows().filter((r) => byId.has(r.id)).map((r) => r.id);

  // 6. Condition patches on already-seeded default rows (admin-edited rows untouched)
  const conditionPatches = seedConditionPatches(snap.docs.map((d) => ({ id: d.id, data: d.data() })));

  // 3 + 4. Classify the rows that predate the library
  const unclassified = snap.docs.filter((d) => {
    const data = d.data();
    return !data.pushType && data.archived !== true;
  });
  const superseded = unclassified.filter((d) => legacyPushMapping(d.data()));
  const dormant = unclassified.filter((d) => !legacyPushMapping(d.data()) && d.data().triggerType === 'Inactivity');
  const otherUnclassified = unclassified.length - superseded.length - dormant.length;

  const supersededRows: Classification[] = classifyLegacyInUse(superseded.map((d) => ({ id: d.id, data: d.data() })));
  const dormantRows = classifyDormant(
    [...dormant].sort((a, b) => a.id.localeCompare(b.id)).map((d) => ({ id: d.id, data: d.data() })),
  );

  // 5. Report
  const report = [...supersededRows.map((r) => ({ ...r, group: 'in use (legacy)' })), ...dormantRows.map((r) => ({ ...r, group: 'dormant' }))];
  const outDir = path.join(ROOT, 'scripts/output');
  fs.mkdirSync(outDir, { recursive: true });
  const reportPath = path.join(outDir, `push-library-classification-${stamp}.csv`);
  fs.writeFileSync(
    reportPath,
    '﻿' +
      ['doc_id,group,persona,decision,pushType,reasons,text', ...report.map((r) =>
        [r.id, r.group, r.persona, r.decision, r.pushType, r.reasons.join('; '), r.text].map(csvCell).join(','),
      )].join('\n'),
  );

  const keep = dormantRows.filter((r) => r.decision === 'keep');
  const archive = dormantRows.filter((r) => r.decision === 'archive');
  const reasonCounts = new Map<string, number>();
  for (const r of archive) {
    const key = r.reasons[0].startsWith('duplicate') ? 'duplicate' : r.reasons[0].startsWith('needs data') ? "needs data the retention push doesn't have" : r.reasons[0];
    reasonCounts.set(key, (reasonCounts.get(key) ?? 0) + 1);
  }
  const rewriteCounts = new Map<string, number>();
  for (const r of keep) for (const reason of r.reasons) rewriteCounts.set(reason, (rewriteCounts.get(reason) ?? 0) + 1);

  console.log('\nSUMMARY');
  console.log(`  new library rows to insert : ${inserts.length} (${PUSH_CATALOG.length} pushTypes)` + (insertSkipped.length ? `, ${insertSkipped.length} already exist (left as is)` : ''));
  for (const entry of PUSH_CATALOG) {
    const rows = inserts.filter((x) => x.data.pushType === entry.pushType);
    const gendered = rows.filter((x) => x.data.gender !== 'both' || x.data.subjectGender !== 'any').length;
    console.log(`      ${entry.pushType.padEnd(24)} ${String(rows.length).padStart(2)}` + (gendered ? `  (${gendered} gendered: ${gendered / 2} male/female pairs)` : ''));
  }
  const brokenCounts = new Map<string, number>();
  for (const r of supersededRows) for (const reason of r.reasons.slice(1)) brokenCounts.set(reason, (brokenCounts.get(reason) ?? 0) + 1);
  console.log(`  legacy rows in use → archive (superseded): ${supersededRows.length}` + ` (${supersededRows.filter((r) => r.reasons.length > 1).length} break the write rules today, skipped at send time)`);
  for (const [k, v] of Array.from(brokenCounts)) console.log(`      ${k}: ${v}`);
  console.log(`  dormant Inactivity rows: ${dormantRows.length} → keep (needs rewrite) ${keep.length}, archive ${archive.length}`);
  for (const [k, v] of Array.from(reasonCounts)) console.log(`      archive · ${k}: ${v}`);
  for (const [k, v] of Array.from(rewriteCounts)) console.log(`      keep · ${k}: ${v}`);
  if (otherUnclassified) console.log(`  other docs without pushType (untouched): ${otherUnclassified}`);
  console.log(`  condition patches on seeded rows: ${conditionPatches.length}`);
  for (const p of conditionPatches) console.log(`      ${p.id} → ${JSON.stringify(p.conditions)}`);
  console.log(`  report: ${path.relative(ROOT, reportPath)}`);

  if (!WRITE) {
    console.log('\nDRY RUN — nothing written. Re-run with --write to apply.\n');
    return;
  }

  // ── Apply ──
  const now = admin.firestore.FieldValue.serverTimestamp();
  let created = 0;
  let updated = 0;
  let skipped = 0;
  for (const ins of inserts) {
    try {
      await col.doc(ins.id).create({ ...ins.data, createdAt: now, updatedAt: now, createdBy: ACTOR, updatedBy: ACTOR });
      created++;
    } catch (err: any) {
      if (err?.code === 6) skipped++;
      else throw err;
    }
  }
  const applyUpdate = async (id: string, data: Record<string, unknown>) => {
    const docSnap = byId.get(id)!;
    try {
      await col.doc(id).update({ ...data, updatedAt: now, updatedBy: ACTOR }, { lastUpdateTime: docSnap.updateTime });
      updated++;
    } catch (err: any) {
      if (err?.code === 9) {
        skipped++; // changed since we read it — leave the admin's version alone
        console.warn(`  skipped ${id}: changed since read`);
      } else throw err;
    }
  };
  for (const r of supersededRows) {
    await applyUpdate(r.id, { active: false, archived: true, archivedReason: r.reasons[0], archivedAt: now, archivedBy: ACTOR });
  }
  for (const r of dormantRows) {
    if (r.decision === 'keep') {
      const canonical = normalizePersonaValue(r.persona);
      const persona = canonical && canonical !== 'generic' ? [canonical] : null;
      await applyUpdate(r.id, {
        pushType: r.pushType,
        lever: 'routine',
        title: '',
        body: r.text,
        deepLink: 'home',
        audience: persona ? { persona } : null,
        gender: r.gender ?? 'both',
        subjectGender: 'any',
        active: false,
        archived: false,
        needsRewrite: true,
        rewriteReasons: r.reasons,
        version: 1,
      });
    } else {
      await applyUpdate(r.id, { active: false, archived: true, archivedReason: r.reasons.join('; '), archivedAt: now, archivedBy: ACTOR });
    }
  }
  for (const p of conditionPatches) {
    await applyUpdate(p.id, { conditions: p.conditions });
  }
  console.log(`\nAPPLIED — created ${created}, updated ${updated}, skipped ${skipped}.\n`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
