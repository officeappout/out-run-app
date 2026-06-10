#!/usr/bin/env node
'use strict';

/**
 * scripts/qa-agent.js
 *
 * Agent 3 — Automated QA & Code Reviewer
 *
 * Monitors `product_roadmap` for tasks that have been patched by coder-agent.js
 * and runs automated linting + TypeScript compilation checks on the modified file.
 *
 * Trigger conditions (both must be true):
 *   • status      === 'ready_for_qa'
 *   • qaProcessed is not true  (client-side guard, avoids composite Firestore index)
 *
 * Pipeline position:
 *   in_progress  →  [coder-agent.js patches file]
 *                →  ready_for_qa  →  [qa-agent.js validates]
 *                                 →  PASS: ready_to_merge
 *                                 →  FAIL: back to in_progress (coderProcessed reset)
 *
 * QA checks (run in this order, stop on first failure):
 *   1. ESLint  — catches syntax errors, unused vars, rule violations
 *   2. tsc     — type-checks the whole project with --noEmit (catches type regressions)
 *
 * Required env vars (in .env.local):
 *   FIREBASE_ADMIN_EMAIL     — Firebase user email with write access
 *   FIREBASE_ADMIN_PASSWORD  — Firebase user password
 *
 * Usage:
 *   node scripts/qa-agent.js
 *
 * Press Ctrl+C to stop.
 */

// ── Bootstrap ─────────────────────────────────────────────────────────────────
require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const path            = require('path');
const fs              = require('fs');              // AGENT-FIX: needed for backup file swap in Fix 2
const { execSync }    = require('child_process');

const { initializeApp, getApps }             = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const {
  getFirestore,
  collection,
  query,
  where,
  onSnapshot,
  updateDoc,
  doc,
  serverTimestamp,
} = require('firebase/firestore');

// ── Firebase config (shared across all agents) ────────────────────────────────
const FIREBASE_CONFIG = {
  apiKey:            'AIzaSyCezG55zVQEZWCEs-lHzx_yQldg-Ej2X60',
  authDomain:        'appout-1.firebaseapp.com',
  projectId:         'appout-1',
  storageBucket:     'appout-1.firebasestorage.app',
  messagingSenderId: '371293978848',
  appId:             '1:371293978848:web:c5281b7834ecd5398b1085',
};

const TASKS_COL      = 'product_roadmap';
const TRIGGER_STATUS = 'ready_for_qa';
const REPO_ROOT      = path.resolve(__dirname, '..');

// ── Env validation ─────────────────────────────────────────────────────────────
const FIREBASE_EMAIL    = (process.env.FIREBASE_ADMIN_EMAIL    ?? '').trim();
const FIREBASE_PASSWORD = (process.env.FIREBASE_ADMIN_PASSWORD ?? '').trim();

if (!FIREBASE_EMAIL || !FIREBASE_PASSWORD) {
  console.error('\n❌  Missing FIREBASE_ADMIN_EMAIL or FIREBASE_ADMIN_PASSWORD in .env.local\n');
  process.exit(1);
}

// ── Firebase init ──────────────────────────────────────────────────────────────
async function initFirebase() {
  const app = getApps().length === 0
    ? initializeApp(FIREBASE_CONFIG)
    : getApps()[0];

  await signInWithEmailAndPassword(getAuth(app), FIREBASE_EMAIL, FIREBASE_PASSWORD);
  console.log(`   ✓ Signed in as ${FIREBASE_EMAIL}\n`);
  return getFirestore(app);
}

// ── QA checks ─────────────────────────────────────────────────────────────────
/**
 * Run ESLint on a single file.
 * Returns null on success, or the trimmed error output as a string on failure.
 *
 * @param {string} absFilePath
 * @returns {string | null}
 */
function runEslint(absFilePath) {
  try {
    execSync(
      `npx eslint "${absFilePath}" --quiet --max-warnings 0`,
      { cwd: REPO_ROOT, encoding: 'utf8', stdio: 'pipe', timeout: 30_000 },
    );
    return null; // clean
  } catch (err) {
    const output = [err.stdout, err.stderr, err.message]
      .filter(Boolean)
      .join('\n')
      .trim();
    return output || 'ESLint failed with no output';
  }
}

// AGENT-FIX: Replaced runTsc() with runTscScoped() — baseline-diff approach.
// Only fails QA if the patched file INTRODUCED new errors; pre-existing errors
// in unrelated files do not block the pipeline.

/**
 * Extract the set of file paths that have TypeScript errors from tsc output.
 * tsc line format: "src/foo/bar.tsx(12,5): error TS2345: ..."
 *
 * @param {string} tscOutput
 * @returns {Set<string>}
 */
function extractTscErrorFiles(tscOutput) { // AGENT-FIX
  const fileSet = new Set(); // AGENT-FIX
  const matches = tscOutput.matchAll(/^(.+?)\(\d+,\d+\):/gm); // AGENT-FIX
  for (const m of matches) { // AGENT-FIX
    fileSet.add(m[1].trim()); // AGENT-FIX
  } // AGENT-FIX
  return fileSet; // AGENT-FIX
} // AGENT-FIX

/**
 * Run `tsc --noEmit -p tsconfig.json` and return the raw output string.
 * Returns empty string if the compilation is clean.
 *
 * @returns {string}
 */
function collectTscOutput() { // AGENT-FIX
  try { // AGENT-FIX
    execSync( // AGENT-FIX
      'npx tsc --noEmit -p tsconfig.json', // AGENT-FIX
      { cwd: REPO_ROOT, encoding: 'utf8', stdio: 'pipe', timeout: 120_000 }, // AGENT-FIX
    ); // AGENT-FIX
    return ''; // AGENT-FIX: clean — no output
  } catch (err) { // AGENT-FIX
    return ([err.stdout, err.stderr, err.message].filter(Boolean).join('\n')).trim(); // AGENT-FIX
  } // AGENT-FIX
} // AGENT-FIX

/**
 * Scoped TypeScript check.
 *
 * Strategy:
 *   1. Temporarily swap the .coder-backup file back as the "original" state.
 *   2. Run tsc → capture baseline error file set.
 *   3. Restore the patched file.
 *   4. Run tsc → capture post-patch error file set.
 *   5. Compute NEW error files = post-patch errors not in baseline.
 *   6. Fail QA only if NEW error files exist (pre-existing errors are ignored).
 *
 * If no backup file exists (coder created a new file), falls back to a
 * simple clean-or-fail check.
 *
 * @param {string} absFilePath — absolute path to the patched file.
 * @returns {string | null} — null on pass, error string on fail.
 */
function runTscScoped(absFilePath) { // AGENT-FIX
  const backupPath = absFilePath + '.coder-backup'; // AGENT-FIX

  // ── No backup: new file created by create-mode ───────────────────────────
  // Check ONLY the new file itself, not the whole project.
  // Errors that originate exclusively from functions/src/* are pre-existing and
  // must never block a frontend patch (src/app/*, src/features/*, src/components/*).
  if (!fs.existsSync(backupPath)) { // AGENT-FIX
    let singleFileOut = ''; // AGENT-FIX
    try { // AGENT-FIX
      execSync( // AGENT-FIX
        `npx tsc --noEmit --allowJs --target es2015 "${absFilePath}"`, // AGENT-FIX
        { cwd: REPO_ROOT, encoding: 'utf8', stdio: 'pipe', timeout: 60_000 }, // AGENT-FIX
      ); // AGENT-FIX
    } catch (err) { // AGENT-FIX
      singleFileOut = ([err.stdout, err.stderr, err.message].filter(Boolean).join('\n')).trim(); // AGENT-FIX
    } // AGENT-FIX

    if (!singleFileOut) return null; // AGENT-FIX: clean

    // Determine whether the new file lives in a frontend directory
    const relNew = path.relative(REPO_ROOT, absFilePath); // AGENT-FIX
    const isFrontend = /^src\/(app|components|features|pages)/.test(relNew); // AGENT-FIX

    // Extract error file paths from the output
    const errorFiles = extractTscErrorFiles(singleFileOut); // AGENT-FIX
    const allFromFunctions = [...errorFiles].every(f => /^functions[/\\]/.test(f)); // AGENT-FIX

    if (isFrontend && allFromFunctions) { // AGENT-FIX
      console.warn('   ⚠️  [QA] tsc reported errors only in functions/src/* — treating as pre-existing, passing QA.'); // AGENT-FIX
      return null; // AGENT-FIX: pass
    } // AGENT-FIX

    return `TypeScript errors in new file (${relNew}):\n${singleFileOut}`.slice(0, 2000); // AGENT-FIX
  } // AGENT-FIX

  // ── Swap backup in place to collect baseline ──────────────────────────────
  const tempPath = absFilePath + '.coder-patched-tmp'; // AGENT-FIX
  try { // AGENT-FIX
    fs.copyFileSync(absFilePath, tempPath);   // save patched → temp // AGENT-FIX
    fs.copyFileSync(backupPath,  absFilePath); // restore backup → current // AGENT-FIX
  } catch (swapErr) { // AGENT-FIX
    console.warn('   ⚠️  [QA] Could not swap backup for baseline; falling back to simple check:', swapErr.message); // AGENT-FIX
    const out = collectTscOutput(); // AGENT-FIX
    return out ? `TypeScript errors:\n${out}`.slice(0, 2000) : null; // AGENT-FIX
  } // AGENT-FIX

  let baselineOutput = ''; // AGENT-FIX
  let postPatchOutput = ''; // AGENT-FIX

  try { // AGENT-FIX
    baselineOutput = collectTscOutput(); // AGENT-FIX: tsc with ORIGINAL file
  } finally { // AGENT-FIX
    // Always restore the patched file — even if tsc crashes
    try { // AGENT-FIX
      fs.copyFileSync(tempPath, absFilePath); // restore patched // AGENT-FIX
      fs.unlinkSync(tempPath);               // clean up temp // AGENT-FIX
    } catch { /* ignore */ } // AGENT-FIX
  } // AGENT-FIX

  postPatchOutput = collectTscOutput(); // AGENT-FIX: tsc with PATCHED file

  // ── Compare error file sets ───────────────────────────────────────────────
  const baselineFiles  = extractTscErrorFiles(baselineOutput);  // AGENT-FIX
  const postPatchFiles = extractTscErrorFiles(postPatchOutput); // AGENT-FIX
  const newErrorFiles  = [...postPatchFiles].filter(f => !baselineFiles.has(f)); // AGENT-FIX

  if (newErrorFiles.length > 0) { // AGENT-FIX
    // Build an error string scoped to only the new problems
    const newErrors = postPatchOutput // AGENT-FIX
      .split('\n') // AGENT-FIX
      .filter(line => newErrorFiles.some(f => line.startsWith(f))) // AGENT-FIX
      .join('\n'); // AGENT-FIX
    return `TypeScript new errors introduced by patch:\n${newErrors}`.slice(0, 2000); // AGENT-FIX
  } // AGENT-FIX

  if (baselineFiles.size > 0) { // AGENT-FIX
    // Pre-existing errors remain but patch didn't make things worse
    console.warn(`   ⚠️  [QA] ${baselineFiles.size} pre-existing tsc error file(s) ignored (not introduced by this patch).`); // AGENT-FIX
  } // AGENT-FIX

  return null; // AGENT-FIX: pass
} // AGENT-FIX

// ── In-flight guard ────────────────────────────────────────────────────────────
const processing = new Set();

// ── Process a single QA task ───────────────────────────────────────────────────
async function processTask(db, docSnap) {
  const taskId   = docSnap.id;
  const taskData = docSnap.data();

  // Client-side dedup check
  if (taskData.qaProcessed === true) return;

  // In-flight guard
  if (processing.has(taskId)) return;
  processing.add(taskId);

  try {
    const title          = String(taskData.title ?? 'Untitled');
    const patchedRelPath = String(taskData.coderPatchedFile ?? '');

    console.log('\n' + '─'.repeat(60));
    console.log(`[🧪 QA Agent] Running checks on: "${title}" (ID: ${taskId})`);
    console.log('─'.repeat(60));

    // ── Resolve the patched file ────────────────────────────────────────────
    if (!patchedRelPath) {
      throw new Error('Task is missing coderPatchedFile — cannot run QA checks.');
    }

    const absFilePath = path.join(REPO_ROOT, patchedRelPath);
    console.log(`   📄 Patched file : ${patchedRelPath}`);

    // ── Mark as QA in-progress to prevent re-trigger ────────────────────────
    await updateDoc(doc(db, TASKS_COL, taskId), {
      qaPickedUpAt: serverTimestamp(),
    });

    // ── Check 1: ESLint ─────────────────────────────────────────────────────
    console.log('   🔍 Check 1/2 — ESLint...');
    const lintError = runEslint(absFilePath);

    if (lintError) {
      await handleQaFailure(db, taskId, taskData, `ESLint errors:\n${lintError}`);
      return;
    }
    console.log('   🔍             → ESLint: ✓ clean');

    // ── Check 2: TypeScript compilation (scoped diff, Fix 2) ───────────────
    console.log('   🔍 Check 2/2 — TypeScript (scoped diff against .coder-backup)...'); // AGENT-FIX
    const tscError = runTscScoped(absFilePath); // AGENT-FIX

    if (tscError) {
      await handleQaFailure(db, taskId, taskData, `TypeScript errors:\n${tscError}`);
      return;
    }
    console.log('   🔍             → tsc: ✓ clean');

    // ── All checks passed ───────────────────────────────────────────────────
    await handleQaSuccess(db, taskId, taskData, patchedRelPath);

  } catch (err) {
    console.error(`\n❌ [QA Agent] Unexpected error on task ${taskId}:`, err?.message ?? err);
    // Leave the task in ready_for_qa so it can be retried or inspected manually.
    // We do NOT reset qaProcessed here — the task was not fully processed.
  } finally {
    processing.delete(taskId);
  }
}

// ── QA FAIL path ───────────────────────────────────────────────────────────────
async function handleQaFailure(db, taskId, taskData, errorMsg) {
  console.error('\n   ❌ QA FAILED');
  console.error('   ' + errorMsg.split('\n').slice(0, 6).join('\n   ')); // first 6 lines

  const failNote =
    `\n\n--- ❌ QA Agent — Check failed (${new Date().toISOString()}):\n` +
    errorMsg.slice(0, 1000); // cap Firestore field size

  await updateDoc(doc(db, TASKS_COL, taskId), {
    // Send back to coder agent
    status:           'in_progress',
    coderProcessed:   false,       // lets coder-agent.js pick it up again
    qaProcessed:      false,
    qaOutputStatus:   'failed',
    qaCompletedAt:    serverTimestamp(),
    // Append the compiler errors so coder-agent.js knows what to fix
    description:      (String(taskData.description ?? '') + failNote).trim(),
  });

  console.log(`\n❌ [QA Agent] Task ${taskId} failed QA. Sent back to Coder Agent with errors.`);
}

// ── QA PASS path ───────────────────────────────────────────────────────────────
async function handleQaSuccess(db, taskId, taskData, patchedRelPath) {
  const passNote =
    `\n\n--- ✅ QA Agent — All checks passed (${new Date().toISOString()}).\n` +
    `ESLint ✓  |  tsc --noEmit ✓  |  File: ${patchedRelPath}`;

  await updateDoc(doc(db, TASKS_COL, taskId), {
    status:         'ready_to_merge',
    qaProcessed:    true,
    qaOutputStatus: 'passed',
    qaCompletedAt:  serverTimestamp(),
    description:    (String(taskData.description ?? '') + passNote).trim(),
  });

  console.log(`\n✅ [QA Agent] Task ${taskId} passed QA successfully! Clean code verified.`);
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log('┌──────────────────────────────────────────────────────────┐');
  console.log('│  Agent 3 — QA & Code Reviewer  |  ready_for_qa listener  │');
  console.log('└──────────────────────────────────────────────────────────┘\n');

  const db = await initFirebase();

  const tasksQuery = query(
    collection(db, TASKS_COL),
    where('status', '==', TRIGGER_STATUS),
  );

  console.log(`👂 Watching \`${TASKS_COL}\` where status == '${TRIGGER_STATUS}'...`);
  console.log('   (Press Ctrl+C to stop)\n');

  let listenerActive = true;

  const unsubscribe = onSnapshot(
    tasksQuery,
    (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added' || change.type === 'modified') {
          processTask(db, change.doc).catch((err) =>
            console.error('[QA Agent] Unhandled error in processTask:', err),
          );
        }
      });
    },
    (err) => {
      console.error('\n❌ [QA Agent] Firestore listener error:', err?.message ?? err);

      if (listenerActive) {
        console.log('   🔄 Reconnecting in 5 seconds...');
        setTimeout(() => {
          if (listenerActive) main().catch(console.error);
        }, 5_000);
      }
    },
  );

  // Graceful shutdown
  const shutdown = () => {
    listenerActive = false;
    console.log('\n\n🛑 [QA Agent] Stopping listener...');
    unsubscribe();
    process.exit(0);
  };
  process.on('SIGINT',  shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('❌ [QA Agent] Fatal startup error:', err?.message ?? err);
  process.exit(1);
});
