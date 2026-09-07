/**
 * scenario-sweep-sample.ts — pulls FULL, untruncated data for a small,
 * targeted set of scenarios, for hand-curation into a human-readable sample
 * (the main sweep's report truncates description/push text for table
 * readability at 560 rows; this doesn't need to).
 *
 * Reuses scenario-sweep.ts's own exported functions (runHomeCell,
 * runPushCell, checkCoherence, initNotificationApi, TIME_PRESETS) — not a
 * re-implementation, same real engine calls.
 */
import { writeFileSync } from 'node:fs';
import {
  runHomeCell,
  runPushCell,
  checkCoherence,
  initNotificationApi,
  TIME_PRESETS,
} from './scenario-sweep';
import type { PersonaId } from '@/types/persona.types';
import type { ExecutionLocation } from '@/features/content/exercises/core/exercise.types';

const PERSONAS: PersonaId[] = ['parent', 'student', 'vatikim', 'pro_athlete', 'office_worker'];
const TIMES = TIME_PRESETS.filter(t => t.key === 'morning' || t.key === 'evening');
const LOCATIONS: ExecutionLocation[] = ['park', 'home'];
const TRIGGERS = ['Daily_Goal', 'Inactivity'];

async function main() {
  await initNotificationApi();
  const rows = [];
  for (const personaId of PERSONAS) {
    for (const time of TIMES) {
      for (const location of LOCATIONS) {
        for (const triggerType of TRIGGERS) {
          const [home, push] = await Promise.all([
            runHomeCell(personaId, time, location),
            runPushCell(personaId, time.key, location, triggerType),
          ]);
          const base = { personaId, timeKey: time.key, location, triggerType, ...home, ...push };
          rows.push({ ...base, flags: checkCoherence(base) });
        }
      }
    }
  }
  writeFileSync('/tmp/scenario-sample-raw.json', JSON.stringify(rows, null, 2));
  console.log(`wrote ${rows.length} full-text rows -> /tmp/scenario-sample-raw.json`);
  process.exit(0);
}

main().catch(e => { console.error('CRASHED:', e?.stack || e); process.exit(1); });
