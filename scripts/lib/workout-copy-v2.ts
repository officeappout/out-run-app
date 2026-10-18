/**
 * titles-v2 content set — shared by scripts/import-workout-copy-v2.ts (writes)
 * and scripts/sweep-workout-copy-v2.ts (local scoring preview, no writes).
 * Pure: reads CSV files, builds rows exactly like the admin bulk upload.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  generateMetadataDocId,
  readMomentFields,
} from '../../src/features/workout-engine/services/workout-metadata-content-fields';

export const DEFAULT_CONTENT_DIR = path.resolve(process.cwd(), '../appout-website/training-audit/copy/titles-v2');

/**
 * The 16 `retag` rows of archive_list.csv, with concrete values. `expect` is the
 * live value the audit saw (17.10.2026 dump); a drift is reported and the row
 * is skipped rather than overwritten blind.
 * Judgment calls (flagged in the PR):
 *   - MA6i… "אימון קצר למרות הלילה" / eEVO… "אימון אנרגיה אחרי לילה קשוח" (no_sleep
 *     bundles): the moment is the MORNING after a bad night, not the night itself.
 *   - lOki… "…וסגרת את היום": unvocalized "סגרת" reads as either gender, so only
 *     location=park is applied and gender stays 'both'.
 */
export const RETAGS: Array<{ coll: 'titles' | 'descriptions'; id: string; expect: Record<string, unknown>; set: Record<string, unknown> }> = [
  { coll: 'titles', id: '1sUh9zQ51v05UX2jfNxq', expect: { timeOfDay: 'any' }, set: { timeOfDay: 'afternoon' } },
  { coll: 'titles', id: '3FT31PXAwe14rQ4srL4d', expect: { gender: 'both' }, set: { gender: 'male' } },
  { coll: 'titles', id: 'DeGSJkHvx4te1faguuFp', expect: { dayPeriod: undefined }, set: { dayPeriod: 'weekend' } },
  { coll: 'titles', id: 'EZWgECX3IiPbNQnmKRe7', expect: { gender: 'both' }, set: { gender: 'female' } },
  { coll: 'titles', id: 'JSNcXeFabpQOuyq7Z2hF', expect: { gender: 'both' }, set: { gender: 'male' } },
  { coll: 'titles', id: 'MA6iJ7BrNZRFqk0cRaIG', expect: { timeOfDay: 'any' }, set: { timeOfDay: 'morning' } },
  { coll: 'titles', id: 'VXz5XrIGQzhyd28LOwkC', expect: { gender: 'both' }, set: { gender: 'male' } },
  { coll: 'titles', id: 'VaqtX9RKbRD3K7f4KMAv', expect: { gender: 'both' }, set: { gender: 'male' } },
  { coll: 'titles', id: 'W6OjXDse688EnnMVvfa1', expect: { location: '' }, set: { location: 'park' } },
  { coll: 'titles', id: 'c6yIwwowX2N8W457VSvI', expect: { situation: undefined }, set: { situation: 'deload' } },
  { coll: 'titles', id: 'eEVODH3INx1IggPsmPjI', expect: { timeOfDay: 'any' }, set: { timeOfDay: 'morning' } },
  { coll: 'titles', id: 'mNaLohK4WLRZwEcuehRt', expect: { dayPeriod: undefined, situation: undefined }, set: { dayPeriod: 'start_of_week', situation: 'returning' } },
  { coll: 'titles', id: 'qVovhOwyanWVtRcc5VDx', expect: { gender: 'both' }, set: { gender: 'female' } },
  { coll: 'descriptions', id: '2zRaNeFlhoYbQJj02uta', expect: { gender: 'male' }, set: { gender: 'both' } },
  { coll: 'descriptions', id: 'Q1U4BxR1GsKxql4YKqCA', expect: { gender: 'male' }, set: { gender: 'both' } },
  { coll: 'descriptions', id: 'lOkiJRB9WY9Xx41Z2MiF', expect: { location: 'home' }, set: { location: 'park' } },
];

// ── CSV (RFC 4180: quoted fields, "" escapes, LF) ───────────────────────────
export function parseCsv(file: string): Record<string, string>[] {
  const text = fs.readFileSync(file, 'utf-8').replace(/^﻿/, '');
  const records: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(f => f !== '')) records.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); if (row.some(f => f !== '')) records.push(row); }
  const [header, ...rows] = records;
  return rows.map((r, idx) => {
    if (r.length !== header.length) throw new Error(`${path.basename(file)} row ${idx + 2}: ${r.length} fields, header has ${header.length}`);
    return Object.fromEntries(header.map((h, i) => [h.trim(), r[i]]));
  });
}

// ── Row builders — mirror bulk/page.tsx (titles / descriptions branches + applySharedFields) ──
function sharedFields(item: Record<string, string>, data: Record<string, unknown>, problems: string[]) {
  for (const k of ['sportType', 'motivationStyle', 'experienceLevel', 'progressRange', 'dayPeriod', 'programId', 'bundleId'] as const) {
    if (item[k]) data[k] = item[k];
  }
  if (item.minLevel) data.minLevel = parseInt(item.minLevel) || undefined;
  if (item.maxLevel) data.maxLevel = parseInt(item.maxLevel) || undefined;
  const m = readMomentFields(item);
  problems.push(...m.warnings);
  if (m.weather) data.weather = m.weather;
  if (m.situation) data.situation = m.situation;
  return m;
}

export function buildTitle(item: Record<string, string>, problems: string[]) {
  const data: Record<string, unknown> = {
    category: item.category || 'general',
    location: item.location || '',
    persona: item.persona || '',
    gender: item.gender || 'both',
    text: item.text || '',
  };
  const m = sharedFields(item, data, problems);
  data.timeOfDay = m.timeOfDay || 'any';
  if (!data.text) problems.push('empty text');
  const id = generateMetadataDocId(String(data.text), String(data.persona), String(data.bundleId ?? ''), String(data.gender));
  return { id, data };
}

export function buildDescription(item: Record<string, string>, problems: string[]) {
  const data: Record<string, unknown> = {
    location: item.location || 'home',
    persona: item.persona || '',
    gender: item.gender || 'both',
    description: item.description || '',
  };
  const m = sharedFields(item, data, problems);
  if (m.timeOfDay) data.timeOfDay = m.timeOfDay;
  if (!data.description) problems.push('empty description');
  const id = generateMetadataDocId(String(data.description), String(data.persona), String(data.bundleId ?? ''), String(data.gender));
  return { id, data };
}


/** Every v2 row (titles + descriptions) as Firestore-shaped rows with their doc ids. */
export function loadV2Rows(contentDir = DEFAULT_CONTENT_DIR) {
  const problems: string[] = [];
  const titles = parseCsv(path.join(contentDir, 'new_titles.csv')).map(item => ({ item, ...buildTitle(item, problems) }));
  const descriptions = parseCsv(path.join(contentDir, 'new_descriptions.csv')).map(item => ({ item, ...buildDescription(item, problems) }));
  return { titles, descriptions, problems };
}

/**
 * The live-row patches the import applies, keyed by doc id per collection:
 * archive rows → { archived: true }, the 16 retags → their field values.
 */
export function loadV2DocPatches(contentDir = DEFAULT_CONTENT_DIR) {
  const patches = { workoutTitles: {} as Record<string, Record<string, unknown>>, smartDescriptions: {} as Record<string, Record<string, unknown>> };
  for (const r of parseCsv(path.join(contentDir, 'archive_list.csv'))) {
    if (r.suggested_action !== 'archive') continue;
    const key = r.collection.endsWith('/titles') ? 'workoutTitles' : 'smartDescriptions';
    patches[key][r.doc_id] = { archived: true };
  }
  for (const r of RETAGS) {
    patches[r.coll === 'titles' ? 'workoutTitles' : 'smartDescriptions'][r.id] = { ...r.set };
  }
  return patches;
}
