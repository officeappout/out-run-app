#!/usr/bin/env npx tsx
/**
 * scripts/export-notification-corpus.ts
 *
 * One-time export — reads every document from the branding notification
 * corpus and writes them to:
 *   scripts/corpus/notification-corpus.json
 *   scripts/corpus/notification-corpus.csv
 *
 * Usage:
 *   npx tsx scripts/export-notification-corpus.ts
 *
 * Requires:
 *   FIREBASE_SERVICE_ACCOUNT_KEY env var (JSON string of the service account)
 *
 * Columns extracted:
 *   id · channel · triggerType · persona · gender · psychologicalTrigger
 *   daysInactive · title · body · text · variables
 *
 * "variables" — comma-separated list of @-tags found in any text field,
 * e.g. "@שם,@ימים_ללא_אימון".
 *
 * "channel" — mapped from triggerType to the push.service taxonomy:
 *   Inactivity / Habit_Maintenance  → retention
 *   Scheduled                       → training_reminder
 *   Location_Based / Proximity      → community
 *   League_Overtake                 → progression
 *   Social_Matchmaking / Future_Partner_Plan / Community_Group_New → social
 */

import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

// ─── Auth ─────────────────────────────────────────────────────────────────────

const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!rawKey) {
  console.error('❌  FIREBASE_SERVICE_ACCOUNT_KEY env var not set.');
  process.exit(1);
}
const key = JSON.parse(rawKey);
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
}
const db = admin.firestore();

// ─── Channel mapping ──────────────────────────────────────────────────────────

const TRIGGER_TO_CHANNEL: Record<string, string> = {
  Inactivity: 'retention',
  Habit_Maintenance: 'retention',
  Scheduled: 'training_reminder',
  Location_Based: 'community',
  Proximity: 'community',
  League_Overtake: 'progression',
  Social_Matchmaking: 'social',
  Future_Partner_Plan: 'social',
  Community_Group_New: 'social',
};

// ─── @ variable extractor ─────────────────────────────────────────────────────

/** Extract all @-tags from a Hebrew/ASCII string. */
function extractVars(text: string | undefined): string[] {
  if (!text) return [];
  const matches = text.match(/@[א-ת_\w]+/g);
  if (!matches) return [];
  const seen: Record<string, boolean> = {};
  return matches.filter((m) => { if (seen[m]) return false; seen[m] = true; return true; });
}

// ─── CSV helpers ──────────────────────────────────────────────────────────────

function csvEscape(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

const CSV_HEADERS = [
  'id', 'channel', 'triggerType', 'persona', 'gender',
  'psychologicalTrigger', 'daysInactive', 'title', 'body', 'text',
  'variables', 'clickCount', 'completionRate',
];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  console.log('📖  Reading workoutMetadata/notifications/notifications …');

  const snap = await db
    .collection('workoutMetadata')
    .doc('notifications')
    .collection('notifications')
    .get();

  console.log(`   ${snap.size} documents found\n`);

  if (snap.size === 0) {
    console.error('⚠️   Collection is empty — is the collection path correct?');
    console.error('    Path attempted: workoutMetadata/notifications/notifications');
    process.exit(1);
  }

  // ── Build rows ─────────────────────────────────────────────────────────────
  const rows: Record<string, unknown>[] = [];

  for (const docSnap of snap.docs) {
    const d = docSnap.data() as Record<string, unknown>;

    // Collect all text-ish fields that might contain @ variables
    const allText = [d.text, d.title, d.body, d.subText]
      .filter(Boolean)
      .join(' ');
    const variables = extractVars(allText as string).join(',');

    const triggerType = String(d.triggerType ?? '');
    const channel = TRIGGER_TO_CHANNEL[triggerType] ?? 'unknown';

    rows.push({
      id: docSnap.id,
      channel,
      triggerType,
      persona: d.persona ?? '',
      gender: d.gender ?? '',
      psychologicalTrigger: d.psychologicalTrigger ?? '',
      daysInactive: d.daysInactive ?? '',
      title: d.title ?? '',
      body: d.body ?? '',
      text: d.text ?? '',
      variables,
      clickCount: d.clickCount ?? '',
      completionRate: d.completionRate ?? '',
      // Keep the raw doc for JSON
      _raw: d,
    });
  }

  // ── Sort: channel → triggerType → persona ──────────────────────────────────
  rows.sort((a, b) => {
    const ch = String(a.channel).localeCompare(String(b.channel));
    if (ch !== 0) return ch;
    const tt = String(a.triggerType).localeCompare(String(b.triggerType));
    if (tt !== 0) return tt;
    return String(a.persona).localeCompare(String(b.persona));
  });

  const outDir = path.join(process.cwd(), 'scripts', 'corpus');
  fs.mkdirSync(outDir, { recursive: true });

  // ── Write JSON ─────────────────────────────────────────────────────────────
  const jsonPath = path.join(outDir, 'notification-corpus.json');
  const jsonData = rows.map(({ _raw, ...rest }) => ({
    ...rest,
    ...(typeof _raw === 'object' ? _raw : {}),
  }));
  fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2), 'utf8');
  console.log(`✅  JSON written → ${jsonPath}`);

  // ── Write CSV ──────────────────────────────────────────────────────────────
  const csvPath = path.join(outDir, 'notification-corpus.csv');
  const csvLines: string[] = [CSV_HEADERS.join(',')];

  for (const row of rows) {
    const line = CSV_HEADERS.map((h) => csvEscape(row[h as keyof typeof row])).join(',');
    csvLines.push(line);
  }
  fs.writeFileSync(csvPath, '﻿' + csvLines.join('\r\n'), 'utf8'); // BOM for Excel
  console.log(`✅  CSV written  → ${csvPath}`);

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n── Breakdown by channel ────────────────────────');
  const byCh: Record<string, number> = {};
  rows.forEach((r) => {
    const ch = String(r.channel);
    byCh[ch] = (byCh[ch] ?? 0) + 1;
  });
  Object.entries(byCh).sort().forEach(([ch, n]) => console.log(`   ${ch.padEnd(20)} ${n}`));

  console.log('\n── Breakdown by triggerType ────────────────────');
  const byTT: Record<string, number> = {};
  rows.forEach((r) => {
    const tt = String(r.triggerType);
    byTT[tt] = (byTT[tt] ?? 0) + 1;
  });
  Object.entries(byTT).sort().forEach(([tt, n]) => console.log(`   ${tt.padEnd(26)} ${n}`));

  console.log('\n── Variables used ──────────────────────────────');
  const varCount: Record<string, number> = {};
  rows.forEach((r) => {
    String(r.variables).split(',').filter(Boolean).forEach((v) => {
      varCount[v] = (varCount[v] ?? 0) + 1;
    });
  });
  Object.entries(varCount).sort((a, b) => b[1] - a[1]).forEach(
    ([v, n]) => console.log(`   ${v.padEnd(20)} ${n} messages`),
  );

  console.log(`\n📦  Total: ${rows.length} messages exported`);
}

run().catch((err) => {
  console.error('💥 ', err);
  process.exit(1);
});
