/**
 * parent-bleed-audit.ts — root-causes the "parent-flavored content winning
 * for non-parent personas" pattern surfaced in the curated sample.
 *
 * For each of the 140 unique (persona × time × location) home-content
 * combinations (push trigger type is irrelevant here — home content doesn't
 * vary by it, so the 560-row grid's 4x trigger axis is redundant for this
 * question), re-derives the EXACT context generateHomeWorkoutTrio actually
 * used (workout.metadataCtx, the real snapshot — not a guess) and calls
 * resolveWorkoutMetadataWithCandidates with it to see every candidate that
 * competed for the title, each with its own real score AND its own
 * row.persona tag (newly exposed, additive, in workout-metadata.service.ts).
 *
 * This answers, with real numbers instead of inference:
 *   1. Does the winning parent-tagged row have a genuinely high score, or
 *      does it simply tie/beat a thin (or absent) field of persona-matching
 *      alternatives?
 *   2. Is there a same-persona-tagged candidate present at all that LOST to
 *      the parent-tagged row — and if so, by how much?
 *
 * Read-only. No writes. Reuses scenario-sweep.ts's exported runHomeCell —
 * not a re-implementation.
 */
import { writeFileSync } from 'node:fs';
import { runHomeCell, TIME_PRESETS, loadAndApplyContentOverlay } from './scenario-sweep';
import { resolveWorkoutMetadataWithCandidates, detectDayPeriod, type WorkoutMetadataContext } from '@/features/workout-engine/services/workout-metadata.service';
import type { PersonaId } from '@/types/persona.types';
import type { ExecutionLocation } from '@/features/content/exercises/core/exercise.types';

const PERSONAS: PersonaId[] = ['parent', 'student', 'pupil', 'office_worker', 'military', 'vatikim', 'pro_athlete'];
const LOCATIONS: ExecutionLocation[] = ['park', 'home', 'street', 'gym', 'office'];

interface AuditRow {
  personaId: PersonaId;
  timeKey: string;
  location: ExecutionLocation;
  title: string;
  description: string;
  logicCue: string;
  winningBundleId: string | undefined;
  winningCandidatePersona: string; // row.persona of the candidate that actually won
  winningScore: number;
  classification: 'exact-match' | 'parent-bleed' | 'other-persona-bleed' | 'generic-or-untagged';
  candidateCount: number;
  personaTaggedCandidateExists: boolean; // does a candidate tagged for the REQUESTED persona exist at all?
  bestPersonaTaggedScore: number | null; // its score, if it exists
  scoreGapVsWinner: number | null; // winningScore - bestPersonaTaggedScore (null if no such candidate)
}

async function main() {
  const rows: AuditRow[] = [];

  for (const personaId of PERSONAS) {
    for (const time of TIME_PRESETS) {
      for (const location of LOCATIONS) {
        const home = await runHomeCell(personaId, time, location);
        const snapshot = home.metadataCtx;
        if (!snapshot) continue;

        const previewNow = new Date();
        previewNow.setHours(time.hour, 0, 0, 0);

        const ctx: WorkoutMetadataContext = {
          persona: (snapshot.persona as WorkoutMetadataContext['persona']) ?? null,
          timeOfDay: time.timeOfDay,
          gender: snapshot.gender,
          category: snapshot.category,
          categoryLabel: snapshot.categoryLabel,
          difficulty: snapshot.difficulty,
          dominantMuscle: snapshot.dominantMuscle,
          experienceLevel: snapshot.experienceLevel,
          sportType: snapshot.sportType,
          motivationStyle: snapshot.motivationStyle,
          currentProgram: snapshot.currentProgram,
          location,
          daysInactive: 0,
          isStudying: location === 'library',
          dayPeriod: detectDayPeriod(),
          previewNow,
        };

        const result = await resolveWorkoutMetadataWithCandidates(ctx);
        const candidates = result.titleCandidates;
        const picked = candidates.find(c => c.isPicked) ?? candidates.find(c => c.text === home.homeTitle);

        if (!picked) {
          // No candidates at all (or the trio's own fallback title, never touched Firestore) — skip, not a scoring question.
          continue;
        }

        const winningPersona = picked.persona || '(untagged/generic)';
        const requestedPersonaStr = String(personaId);

        let classification: AuditRow['classification'];
        if (winningPersona === requestedPersonaStr) classification = 'exact-match';
        else if (winningPersona === 'parent' && requestedPersonaStr !== 'parent') classification = 'parent-bleed';
        else if (winningPersona === '(untagged/generic)' || winningPersona === 'any' || winningPersona === 'none' || winningPersona === 'generic') classification = 'generic-or-untagged';
        else classification = 'other-persona-bleed';

        const sameRequestedPersonaCandidates = candidates.filter(c => c.persona === requestedPersonaStr);
        const bestPersonaTagged = sameRequestedPersonaCandidates.length > 0
          ? Math.max(...sameRequestedPersonaCandidates.map(c => c.score))
          : null;

        rows.push({
          personaId,
          timeKey: time.key,
          location,
          title: picked.text,
          description: home.homeDescription,
          logicCue: (home as any).logicCue ?? '',
          winningBundleId: picked.bundleId,
          winningCandidatePersona: winningPersona,
          winningScore: picked.score,
          classification,
          candidateCount: candidates.length,
          personaTaggedCandidateExists: sameRequestedPersonaCandidates.length > 0,
          bestPersonaTaggedScore: bestPersonaTagged,
          scoreGapVsWinner: bestPersonaTagged !== null ? picked.score - bestPersonaTagged : null,
        });
      }
    }
    console.log(`  ... ${personaId} done`);
  }

  writeFileSync('/tmp/parent-bleed-audit.json', JSON.stringify(rows, null, 2));

  // ── Aggregate per persona ──
  console.log('\n════════ Per-persona classification ════════');
  for (const personaId of PERSONAS) {
    const personaRows = rows.filter(r => r.personaId === personaId);
    const byClass = new Map<string, number>();
    for (const r of personaRows) byClass.set(r.classification, (byClass.get(r.classification) ?? 0) + 1);
    console.log(
      `${personaId} (${personaRows.length} rows): ` +
      Array.from(byClass.entries()).map(([k, v]) => `${k}=${v}`).join(', '),
    );
  }

  // ── Thin-inventory check: for parent-bleed rows, did a same-persona candidate even exist? ──
  const parentBleedRows = rows.filter(r => r.classification === 'parent-bleed');
  const bleedWithAlternative = parentBleedRows.filter(r => r.personaTaggedCandidateExists);
  const bleedWithoutAlternative = parentBleedRows.filter(r => !r.personaTaggedCandidateExists);
  console.log(`\nparent-bleed rows: ${parentBleedRows.length}`);
  console.log(`  - with a same-persona candidate that LOST anyway: ${bleedWithAlternative.length}`);
  console.log(`  - with NO same-persona candidate at all (thin inventory): ${bleedWithoutAlternative.length}`);

  if (bleedWithAlternative.length > 0) {
    console.log('\n  Examples where a same-persona candidate existed but lost to a parent-tagged row:');
    for (const r of bleedWithAlternative.slice(0, 10)) {
      console.log(
        `    ${r.personaId}/${r.timeKey}/${r.location}: winner score=${r.winningScore} (parent-tagged) ` +
        `vs best ${r.personaId}-tagged score=${r.bestPersonaTaggedScore} (gap=${r.scoreGapVsWinner})`,
      );
    }
  }

  // ── Example winning rows for personas of interest (e.g. when verifying an overlay) ──
  const EXAMPLE_PERSONAS: PersonaId[] = ['student', 'pupil', 'pro_athlete'];
  for (const personaId of EXAMPLE_PERSONAS) {
    const exact = rows.filter(r => r.personaId === personaId && r.classification === 'exact-match');
    console.log(`\n  ── ${personaId}: ${exact.length}/${rows.filter(r => r.personaId === personaId).length} exact-match — example winning bundles ──`);
    for (const r of exact.slice(0, 3)) {
      console.log(`    [${r.timeKey}/${r.location}] score=${r.winningScore} bundleId=${r.winningBundleId ?? '(none)'}`);
      console.log(`      title:       "${r.title}"`);
      console.log(`      description: "${r.description}"`);
      console.log(`      logicCue:    "${r.logicCue}"`);
    }
  }

  console.log(`\nWrote full data -> /tmp/parent-bleed-audit.json`);
  process.exit(0);
}

// CONTENT_OVERLAY_FILE (optional env var): same mechanism as scenario-sweep.ts
// — comma-separated path(s) to draft-content JSON to inject in-memory before
// running, so this audit's exact-match classification reflects the draft
// content too. Zero Firestore writes; unset by default, so normal runs are
// unaffected.
const overlayFile = process.env.CONTENT_OVERLAY_FILE;
if (overlayFile) loadAndApplyContentOverlay(overlayFile.split(',').map(p => p.trim()));

main().catch(e => { console.error('CRASHED:', e?.stack || e); process.exit(1); });
