#!/usr/bin/env npx tsx
/**
 * seed-push-library — fills the push library (the existing Notification
 * Manager collection, workoutMetadata/notifications/notifications) with the
 * rewritten push copy, and classifies the old rows for the owner.
 *
 *   npx tsx --env-file=.env.local scripts/seed-push-library.ts           # DRY RUN (default): reads only
 *   npx tsx --env-file=.env.local scripts/seed-push-library.ts --write   # apply
 *
 * Auth: FIREBASE_SERVICE_ACCOUNT_KEY (JSON) from .env.local, like the other
 * seed scripts. Nothing is written without --write.
 *
 * What it does
 *   1. Reads the whole collection and saves a JSON backup to
 *      scripts/_backups/ (gitignored) BEFORE anything else. --write refuses
 *      to continue if the backup can't be written.
 *   2. INSERTS one row per code default in the catalog
 *      (src/features/notifications/push-library/push-library.core.ts =
 *      title_after/body_after of training-audit/copy/push_copy.csv), doc id
 *      `lib_<pushType>_<n>`, with Firestore `create()` — a row that already
 *      exists is never overwritten (an admin may have edited it).
 *   3. ARCHIVES the original content-library rows the rewritten copy
 *      replaces (Daily_Goal / Future_Partner_Plan, no pushType yet):
 *      active:false, archived:true, archivedReason. Text untouched.
 *   4. CLASSIFIES the dormant Inactivity rows (never sent by any code):
 *        keep    → pushType 'retention_lapse', needsRewrite:true, active:false,
 *                  rewriteReasons[], persona → audience. Text NOT rewritten.
 *        archive → active:false, archived:true, archivedReason.
 *   5. Writes a CSV report of every classification to scripts/output/.
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
  PUSH_CATALOG_BY_TYPE,
  PUSH_LIBRARY_COLLECTION,
  extractVarTokens,
  legacyPushMapping,
  validatePushCopyDraft,
} from '../src/features/notifications/push-library/push-library.core';
import { normalizePersonaValue } from '../src/features/user/onboarding/services/persona-alias-map.service';

const WRITE = process.argv.includes('--write');
const ACTOR = 'seed-push-library';
const ROOT = path.resolve(__dirname, '..');

// ─── Dormant-row classification rules ─────────────────────────────────────────

/** Tags that are really broken gender slashes ("@בוא/י", "@את/ה") — fixable by rewording. */
const SLASH_ARTIFACT_TAGS = new Set(['@בוא', '@את', '@מוכן']);
/** Tags a rewrite can replace without changing the message (fixed number / renamed variable). */
const REWRITABLE_TAGS: Record<string, string> = {
  '@זמן_אימון': 'replace @זמן_אימון with a fixed number of minutes',
  '@ימי_אי_פעילות': 'rename @ימי_אי_פעילות to @ימים',
};
/** Addresses one gender while the row targets both. */
const GENDERED_WORDS = /(^|[\s,.])(אבא|אמא|לוחם|לוחמת)(?=[\s,.!?]|$)/;
/** Retention fills these. */
const RETENTION_VARS = new Set(PUSH_CATALOG_BY_TYPE.retention_lapse.vars as readonly string[]);

export interface Classification {
  id: string;
  persona: string;
  decision: 'keep' | 'archive';
  pushType: string;
  reasons: string[];
  text: string;
}

function normalizeText(t: string): string {
  return t.replace(/\s+/g, ' ').replace(/[.!?,]+$/g, '').trim();
}

/** Pure — exported for a dry check. Order of `rows` decides which duplicate is kept (first wins). */
export function classifyDormant(rows: Array<{ id: string; data: Record<string, unknown> }>): Classification[] {
  const seen = new Map<string, string>();
  return rows.map(({ id, data }) => {
    const text = typeof data.text === 'string' ? data.text : '';
    const persona = typeof data.persona === 'string' ? data.persona : '';
    const tokens = extractVarTokens(text);
    const unfillable = tokens.filter((t) => !RETENTION_VARS.has(t) && !SLASH_ARTIFACT_TAGS.has(t) && !(t in REWRITABLE_TAGS));
    const norm = normalizeText(text);
    const base = { id, persona, text, pushType: '' };

    if (/[A-Za-z]{2,}/.test(text)) return { ...base, decision: 'archive' as const, reasons: ['english text'] };
    if (seen.has(norm)) return { ...base, decision: 'archive' as const, reasons: [`duplicate of ${seen.get(norm)}`] };
    seen.set(norm, id);
    if (unfillable.length > 0) {
      return {
        ...base,
        decision: 'archive' as const,
        reasons: [`needs data the retention push doesn't have: ${unfillable.join(' ')}`],
      };
    }

    const reasons: string[] = ['needs a title (old rows had body only)'];
    if (tokens.some((t) => SLASH_ARTIFACT_TAGS.has(t)) || text.includes('/')) reasons.push('gender slash');
    if (GENDERED_WORDS.test(text)) reasons.push('gendered address (אבא/אמא/לוחם)');
    for (const t of tokens) if (REWRITABLE_TAGS[t]) reasons.push(REWRITABLE_TAGS[t]);
    const issues = validatePushCopyDraft({ pushType: 'retention_lapse', title: 'x', body: text, deepLink: 'home' });
    for (const i of issues) {
      if (/לוכסן|משתנה/.test(i.message)) continue; // already covered above
      if (/קו מפריד/.test(i.message)) reasons.push('em/en dash');
      else if (/אימוג/.test(i.message)) reasons.push('emoji');
      else if (/ארוכה/.test(i.message)) reasons.push('too long (>90)');
      else reasons.push(i.message);
    }
    return { ...base, decision: 'keep' as const, pushType: 'retention_lapse', reasons: Array.from(new Set(reasons)) };
  });
}

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!rawKey) {
    console.error('FIREBASE_SERVICE_ACCOUNT_KEY not set (run with --env-file=.env.local).');
    process.exit(1);
  }
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(rawKey) as admin.ServiceAccount) });
  }
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

  // 2. Inserts
  const inserts: Array<{ id: string; data: Record<string, unknown> }> = [];
  const insertSkipped: string[] = [];
  for (const entry of PUSH_CATALOG) {
    entry.defaults.forEach((d, i) => {
      const id = `lib_${entry.pushType}_${i}`;
      if (byId.has(id)) {
        insertSkipped.push(id);
        return;
      }
      inserts.push({
        id,
        data: {
          pushType: entry.pushType,
          lever: entry.lever,
          title: d.title,
          body: d.body,
          text: d.body,
          deepLink: entry.deepLinks[0],
          audience: d.audience ?? null,
          conditions: d.conditions ?? null,
          timeWindow: null,
          fallbackOnly: d.fallbackOnly === true,
          active: true,
          archived: false,
          needsRewrite: false,
          version: 1,
          bundleId: id,
          source: 'push_copy.csv (title_after/body_after)',
        },
      });
    });
  }

  // 3 + 4. Classify the rows that predate the library
  const unclassified = snap.docs.filter((d) => {
    const data = d.data();
    return !data.pushType && data.archived !== true;
  });
  const superseded = unclassified.filter((d) => legacyPushMapping(d.data()));
  const dormant = unclassified.filter((d) => !legacyPushMapping(d.data()) && d.data().triggerType === 'Inactivity');
  const otherUnclassified = unclassified.length - superseded.length - dormant.length;

  const supersededRows: Classification[] = superseded.map((d) => {
    const m = legacyPushMapping(d.data())!;
    return {
      id: d.id,
      persona: String(d.data().persona ?? ''),
      decision: 'archive',
      pushType: m.pushType,
      reasons: [`superseded by the rewritten ${m.pushType} copy (lib_${m.pushType}_*)`],
      text: String(d.data().text ?? ''),
    };
  });
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
    const n = inserts.filter((x) => x.data.pushType === entry.pushType).length;
    console.log(`      ${entry.pushType.padEnd(24)} ${n}`);
  }
  console.log(`  legacy rows in use → archive (superseded): ${supersededRows.length}`);
  console.log(`  dormant Inactivity rows: ${dormantRows.length} → keep (needs rewrite) ${keep.length}, archive ${archive.length}`);
  for (const [k, v] of Array.from(reasonCounts)) console.log(`      archive · ${k}: ${v}`);
  for (const [k, v] of Array.from(rewriteCounts)) console.log(`      keep · ${k}: ${v}`);
  if (otherUnclassified) console.log(`  other docs without pushType (untouched): ${otherUnclassified}`);
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
  console.log(`\nAPPLIED — created ${created}, updated ${updated}, skipped ${skipped}.\n`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
