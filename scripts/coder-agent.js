#!/usr/bin/env node
'use strict';

/**
 * scripts/coder-agent.js
 *
 * Agent 2 — Sandbox Coder
 *
 * Monitors the `product_roadmap` collection in real-time and triggers
 * automated code generation when a task reaches the 'in_progress' status.
 *
 * Trigger conditions (both must be true):
 *   • status      === 'in_progress'
 *   • coderProcessed is false OR undefined  (prevents double-runs)
 *
 * Lifecycle for each matched task:
 *   1. Log the task details to the terminal (title, priority, estimatedHours, originalFeedback).
 *   2. Call generateCodePatch(taskData)  ← plug Claude API here later.
 *   3. Write coderProcessed: true to Firestore so the task is never picked up again.
 *
 * Required env vars (in .env.local):
 *   ANTHROPIC_API_KEY        — Anthropic API key
 *   FIREBASE_ADMIN_EMAIL     — Firebase user email with write access
 *   FIREBASE_ADMIN_PASSWORD  — Firebase user password
 *
 * Usage:
 *   node scripts/coder-agent.js
 *
 * Press Ctrl+C to stop.
 */

// ── Bootstrap ─────────────────────────────────────────────────────────────────
require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const fs      = require('fs');
const path    = require('path');
const Anthropic = require('@anthropic-ai/sdk').default ?? require('@anthropic-ai/sdk');

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

// ── Firebase config (shared with amit-loop.js) ────────────────────────────────
const FIREBASE_CONFIG = {
  apiKey:            'AIzaSyCezG55zVQEZWCEs-lHzx_yQldg-Ej2X60',
  authDomain:        'appout-1.firebaseapp.com',
  projectId:         'appout-1',
  storageBucket:     'appout-1.firebasestorage.app',
  messagingSenderId: '371293978848',
  appId:             '1:371293978848:web:c5281b7834ecd5398b1085',
};

const TASKS_COL      = 'product_roadmap';
const TRIGGER_STATUS = 'in_progress'; // kanban column that means "start coding"
const REPO_ROOT      = path.resolve(__dirname, '..');
const MAX_FILE_CHARS = 80_000; // ~20k tokens — safe Claude context budget per file

// ── Env validation ─────────────────────────────────────────────────────────────
const ANTHROPIC_API_KEY = (process.env.ANTHROPIC_API_KEY       ?? '').trim();
const FIREBASE_EMAIL    = (process.env.FIREBASE_ADMIN_EMAIL    ?? '').trim();
const FIREBASE_PASSWORD = (process.env.FIREBASE_ADMIN_PASSWORD ?? '').trim();

if (!ANTHROPIC_API_KEY) {
  console.error('\n❌  Missing ANTHROPIC_API_KEY in .env.local\n');
  process.exit(1);
}
if (!FIREBASE_EMAIL || !FIREBASE_PASSWORD) {
  console.error('\n❌  Missing FIREBASE_ADMIN_EMAIL or FIREBASE_ADMIN_PASSWORD in .env.local\n');
  process.exit(1);
}

// ── Anthropic client ───────────────────────────────────────────────────────────
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// ── Firebase init ──────────────────────────────────────────────────────────────
async function initFirebase() {
  const app = getApps().length === 0
    ? initializeApp(FIREBASE_CONFIG)
    : getApps()[0];

  await signInWithEmailAndPassword(getAuth(app), FIREBASE_EMAIL, FIREBASE_PASSWORD);
  console.log(`   ✓ Signed in as ${FIREBASE_EMAIL}\n`);
  return getFirestore(app);
}

// ── Tag → source file mapping ──────────────────────────────────────────────────
/**
 * Maps known kanban tags to the most relevant source files in this project.
 * Returns an ordered array of REPO_ROOT-relative paths — first match wins.
 * If a path resolves to a directory the agent picks the first .tsx/.ts file
 * found inside it (one level deep).
 *
 * @param {string[]} tags
 * @param {string}   title
 * @returns {string[]}  Absolute file paths that exist on disk.
 */
function resolveAffectedFiles(tags, title) {
  const tagMap = {
    'ממשק ריצה':       ['src/features/workout-engine/players/running/components'],
    'ממשק כוח':        ['src/features/workout-engine/players/strength/components'],
    'מבט על האימון':   ['src/features/profile/components/DashboardTab.tsx',
                        'src/app/profile/page.tsx'],
    'ניהול רשויות':    ['src/features/admin/components/authorities/AuthoritiesKanbanBoard.tsx',
                        'src/features/admin/components/authorities/AuthorityDetailDrawer.tsx'],
    'פאנל ניהול':      ['src/app/admin/page.tsx',
                        'src/app/admin/layout.tsx'],
    "פיצ'רים חדשים":  ['src/app/map/page.tsx'],
    'Onboarding':      ['src/features/user/onboarding',
                        'src/app/onboarding-new'],
    'Bug Fix':         [], // resolved via title keywords below
    'UI/UX':           ['src/components/ui'],
    'Performance':     ['src/lib/firebase.ts'],
    'Analytics':       ['src/features/admin/services/analytics.service.ts'],
    'Running Engine':  ['src/features/workout-engine'],
  };

  const candidates = [];

  // Collect paths from matched tags (preserve tag priority order)
  const tagList = Array.isArray(tags) ? tags : [];
  for (const tag of tagList) {
    const paths = tagMap[tag] ?? [];
    for (const p of paths) candidates.push(p);
  }

  // Fallback: profile or admin based on title keywords
  if (candidates.length === 0) {
    const t = (title ?? '').toLowerCase();
    if (t.includes('פרופיל') || t.includes('profile'))          candidates.push('src/app/profile/page.tsx');
    else if (t.includes('מפה') || t.includes('map'))            candidates.push('src/app/map/page.tsx');
    else if (t.includes('admin') || t.includes('ניהול'))        candidates.push('src/app/admin/page.tsx');
    else                                                          candidates.push('src/app/profile/page.tsx');
  }

  // Resolve each candidate to a concrete .tsx/.ts file
  const resolved = [];
  for (const rel of candidates) {
    const abs = path.join(REPO_ROOT, rel);
    if (!fs.existsSync(abs)) continue;

    const stat = fs.statSync(abs);
    if (stat.isFile()) {
      resolved.push(abs);
    } else if (stat.isDirectory()) {
      // Pick first .tsx or .ts file one level deep
      const entries = fs.readdirSync(abs).filter(f => /\.(tsx?|jsx?)$/.test(f)).sort();
      if (entries.length > 0) resolved.push(path.join(abs, entries[0]));
    }

    if (resolved.length >= 2) break; // cap at 2 files to stay within context budget
  }

  return [...new Set(resolved)]; // deduplicate
}

// ── Extract code block from Claude's response ──────────────────────────────────
/**
 * Strips the outermost markdown code fence from Claude's reply.
 * Handles: ```tsx, ```ts, ```jsx, ```js, ``` (plain), or fence-free source.
 *
 * @param {string} raw — Claude's raw response text.
 * @returns {string} — Clean source code, never containing fence markers.
 * @throws {Error} — If the response contains neither a code fence nor recognisable source.
 */
function extractCodeBlock(raw) {
  const match = raw.match(/```(?:tsx|ts|js|jsx)?\s*([\s\S]*?)\s*```/);
  if (match && match[1]) {
    return match[1].trim();
  }
  // No fences — accept if it looks like source code already
  if (raw.includes('"use client"') || raw.includes("'use client'") || raw.includes('import ')) {
    return raw.trim();
  }
  throw new Error('No valid code block found in Claude response');
}

// ── Detect create-file intent (Fix 3) ─────────────────────────────────────────
/**
 * Returns true if the task is asking for a NEW file rather than a fix to an
 * existing one. Matches common English and Hebrew intent keywords.
 *
 * @param {string} title
 * @param {string} description
 * @returns {boolean}
 */
function isCreateIntent(title, description) { // AGENT-FIX
  const text = ((title ?? '') + ' ' + (description ?? '')).toLowerCase(); // AGENT-FIX
  const keywords = [ // AGENT-FIX
    'add', 'create', 'new component', 'new file', 'fab', // AGENT-FIX
    'הוסף', 'צור', 'יצור', 'חדש', 'קומפוננטה חדשה', 'כפתור חדש', 'רכיב חדש', // AGENT-FIX
  ]; // AGENT-FIX
  return keywords.some(kw => text.includes(kw)); // AGENT-FIX
} // AGENT-FIX

/**
 * Parse Claude's create-mode response, which must start with a FILENAME: line
 * followed by a code block.
 *
 * @param {string} raw — Claude's raw response.
 * @returns {{ suggestedName: string | null, code: string }}
 */
function parseCreateResponse(raw) { // AGENT-FIX
  const lines = raw.split('\n'); // AGENT-FIX
  const filenameLine = lines.find(l => l.trimStart().startsWith('FILENAME:')); // AGENT-FIX
  const suggestedName = filenameLine // AGENT-FIX
    ? filenameLine.replace(/^.*FILENAME:\s*/i, '').trim() // AGENT-FIX
    : null; // AGENT-FIX
  const rawWithoutFilename = filenameLine // AGENT-FIX
    ? raw.replace(filenameLine, '') // AGENT-FIX
    : raw; // AGENT-FIX
  const code = extractCodeBlock(rawWithoutFilename); // AGENT-FIX
  return { suggestedName, code }; // AGENT-FIX
} // AGENT-FIX

// ── Code generation ────────────────────────────────────────────────────────────
/**
 * Sandbox Coder — full 5-step implementation.
 *
 * Step 1: Resolve the most relevant source file(s) from task tags + title.
 * Step 2: Read file contents from disk (guarded by MAX_FILE_CHARS).
 * Step 3: Call Claude claude-sonnet-4-6 with the code + task context.
 * Step 4: Extract the clean code block and overwrite the local file (backup kept).
 * Step 5: Write coderOutputStatus + patch note back to the Firestore task doc.
 *
 * Throws on any failure — the caller (processTask) rolls back coderProcessed.
 *
 * @param {import('firebase/firestore').Firestore} db
 * @param {string}                                 taskId
 * @param {Record<string, unknown>}                taskData
 */
async function generateCodePatch(db, taskId, taskData) {
  // ── Step 1: Identify affected files ─────────────────────────────────────────
  console.log('   📂 Step 1 — Resolving affected source files...');

  const tags       = Array.isArray(taskData.tags) ? taskData.tags : [];
  const title      = String(taskData.title ?? '');
  const createMode = isCreateIntent(title, String(taskData.description ?? '')); // AGENT-FIX
  const files      = resolveAffectedFiles(tags, title);

  if (files.length === 0) {
    throw new Error('No resolvable source files found for tags: ' + tags.join(', '));
  }
  if (createMode) console.log('   📂          → 🆕 CREATE MODE detected — will write a new file'); // AGENT-FIX
  console.log(`   📂          → Reference dir: ${files.map(f => path.relative(REPO_ROOT, f)).join(', ')}`);

  // ── Step 2: Read source file contents ───────────────────────────────────────
  console.log('   📖 Step 2 — Reading source files...');

  const fileContextBlocks = [];
  for (const absPath of files) {
    const relPath = path.relative(REPO_ROOT, absPath);
    let content   = fs.readFileSync(absPath, 'utf8');

    if (content.length > MAX_FILE_CHARS) {
      console.warn(`   ⚠️  ${relPath} is large (${content.length} chars) — truncating to ${MAX_FILE_CHARS}`);
      content = content.slice(0, MAX_FILE_CHARS) + '\n\n// ... [truncated by coder-agent] ...';
    }

    fileContextBlocks.push(`=== FILE: ${relPath} ===\n${content}\n=== END FILE ===`);
    console.log(`   📖          → Read ${relPath} (${content.length} chars)`);
  }

  // ── Step 3: Call Claude ──────────────────────────────────────────────────────
  console.log('   🤖 Step 3 — Sending to Claude (claude-sonnet-4-6)...');

  // AGENT-FIX: separate system prompt for create-mode vs edit-mode
  const systemPrompt = createMode // AGENT-FIX
    ? ( // AGENT-FIX: CREATE MODE prompt
        'You are an expert senior developer creating a NEW file for OUT-RUN, a Hebrew fitness PWA ' +
        '(Next.js 14, TypeScript, Tailwind CSS, Firebase).\n' +
        'Rules:\n' +
        '• On the very FIRST line of your response write exactly: FILENAME: <SuggestedComponentName.tsx>\n' +
        '• Then output the complete new file content inside a single markdown code block (```tsx ... ```).\n' +
        '• The component must be a complete, working React/TypeScript module.\n' +
        '• Follow RTL Hebrew conventions (dir="rtl"), use Tailwind CSS with the project design tokens, and Zustand where state is needed.\n' +
        '• No explanations, no extra text outside the FILENAME line and the code block.'
      ) // AGENT-FIX
    : ( // AGENT-FIX: EDIT MODE prompt (original)
        'You are an expert senior developer working on OUT-RUN, a Hebrew fitness PWA ' +
        '(Next.js 14, TypeScript, Tailwind CSS, Firebase). ' +
        'You will receive one or more source files and a task description from the product roadmap. ' +
        'Your job is to refactor or fix the code to resolve the issue described. ' +
        'Rules:\n' +
        '• Return ONLY the complete updated code for the first file listed.\n' +
        '• Wrap it in a single markdown code block (```tsx ... ```).\n' +
        '• No explanations, no comments about what you changed, no extra text outside the code block.\n' +
        '• Preserve ALL existing functionality — only change what is necessary to fix the reported issue.\n' +
        '• Keep Hebrew RTL conventions, Tailwind classes, and Zustand patterns intact.'
      ); // AGENT-FIX

  const userMsg = [
    `## Task: ${title}`,
    '',
    `**Description:**\n${taskData.description ?? ''}`,
    '',
    taskData.originalFeedback
      ? `**Original user quote:**\n"${taskData.originalFeedback}"`
      : '',
    '',
    `**Priority:** ${taskData.priority ?? '—'}`,
    '',
    createMode // AGENT-FIX
      ? '## Reference files (for style/import conventions only — create a NEW file, do not edit these):' // AGENT-FIX
      : '## Source files to refactor:', // AGENT-FIX
    '',
    fileContextBlocks.join('\n\n'),
  ].filter(Boolean).join('\n');

  const response = await anthropic.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 8192,
    system:     systemPrompt,
    messages:   [{ role: 'user', content: userMsg }],
  });

  const rawOutput = response.content[0]?.text?.trim() ?? '';
  if (!rawOutput) throw new Error('Claude returned an empty response');

  console.log(`   🤖          → Received ${rawOutput.length} chars from Claude`);

  // ── Step 4: Apply patch to disk ──────────────────────────────────────────────
  console.log('   🔧 Step 4 — Applying patch...');

  let targetFile; // AGENT-FIX: declared here so Step 5 can reference it
  let relTarget;  // AGENT-FIX

  if (createMode) { // AGENT-FIX: CREATE MODE — write a new file, never overwrite
    const { suggestedName, code: cleanCode } = parseCreateResponse(rawOutput); // AGENT-FIX

    // Target directory = directory of the first resolved reference file // AGENT-FIX
    const refDir = path.dirname(files[0]); // AGENT-FIX
    const fileName = suggestedName // AGENT-FIX
      ? suggestedName.replace(/[^a-zA-Z0-9א-ת._-]/g, '_') // AGENT-FIX: sanitise
      : `NewComponent_${Date.now()}.tsx`; // AGENT-FIX: safe fallback

    targetFile = path.join(refDir, fileName); // AGENT-FIX

    // Safety: never silently clobber an existing file // AGENT-FIX
    if (fs.existsSync(targetFile)) { // AGENT-FIX
      const ts = Date.now(); // AGENT-FIX
      targetFile = path.join(refDir, fileName.replace(/(\.[^.]+)$/, `_${ts}$1`)); // AGENT-FIX
      console.warn(`   ⚠️  File already existed — renamed to avoid overwrite`); // AGENT-FIX
    } // AGENT-FIX

    relTarget = path.relative(REPO_ROOT, targetFile); // AGENT-FIX
    fs.writeFileSync(targetFile, cleanCode, 'utf8'); // AGENT-FIX
    console.log(`   🔧          → Created new file: ${relTarget} (${cleanCode.length} chars)`); // AGENT-FIX

  } else { // AGENT-FIX: EDIT MODE — backup original then overwrite (original behaviour)
    targetFile       = files[0]; // AGENT-FIX
    relTarget        = path.relative(REPO_ROOT, targetFile); // AGENT-FIX
    const cleanCode  = extractCodeBlock(rawOutput); // AGENT-FIX
    const backupPath = targetFile + '.coder-backup'; // AGENT-FIX

    // Keep the original as a .coder-backup so the change is easily reversible
    fs.copyFileSync(targetFile, backupPath);
    fs.writeFileSync(targetFile, cleanCode, 'utf8');

    console.log(`   🔧          → Wrote ${cleanCode.length} chars to ${relTarget}`);
    console.log(`   🔧          → Original backed up to ${path.relative(REPO_ROOT, backupPath)}`);
  } // AGENT-FIX

  // ── Step 5: Write result back to Firestore ───────────────────────────────────
  console.log('   💾 Step 5 — Updating Firestore task document...');

  const patchNote = `[🤖 Coder] Successfully refactored ${relTarget}`;

  await updateDoc(doc(db, TASKS_COL, taskId), {
    status:            'ready_for_qa',   // promotes task → qa-agent.js listener picks it up
    coderOutputStatus: 'success',
    coderPatchedFile:  relTarget,
    coderCompletedAt:  serverTimestamp(),
    // Append a note to the description so it's visible in the admin kanban card
    description: (String(taskData.description ?? '') + `\n\n${patchNote}`).trim(),
  });

  console.log(`   💾          → Firestore updated (coderOutputStatus: 'success')`);
  console.log(`\n   ${patchNote}`);
}

// ── In-flight guard ────────────────────────────────────────────────────────────
// Prevents concurrent runs on the same task if onSnapshot fires rapidly.
const processing = new Set();

// ── Process a single matched task ─────────────────────────────────────────────
async function processTask(db, docSnap) {
  const taskId   = docSnap.id;
  const taskData = docSnap.data();

  // Client-side dedup check — Firestore can't combine inequality + equality
  // across different fields without a composite index.
  if (taskData.coderProcessed === true) return;

  // AGENT-FIX: Retry gate — if coderAttempts >= 3 escalate to needs_human instead of looping
  const currentAttempts = typeof taskData.coderAttempts === 'number' ? taskData.coderAttempts : 0; // AGENT-FIX
  if (currentAttempts >= 3) { // AGENT-FIX
    console.warn(`\n⚠️  [Coder Agent] Task "${taskData.title}" has failed ${currentAttempts} times. Escalating to 'needs_human'.`); // AGENT-FIX
    await updateDoc(doc(db, TASKS_COL, taskId), { // AGENT-FIX
      status:         'needs_human', // AGENT-FIX
      coderProcessed: true,          // AGENT-FIX: prevent any future agent pick-up
    }); // AGENT-FIX
    return; // AGENT-FIX
  } // AGENT-FIX

  // In-flight guard
  if (processing.has(taskId)) return;
  processing.add(taskId);

  try {
    // ── Terminal log ────────────────────────────────────────────────────────
    console.log('\n' + '─'.repeat(60));
    console.log(`[🤖 Coder Agent] Found task to execute: "${taskData.title}" (ID: ${taskId})`);
    console.log('─'.repeat(60));
    console.log(`   Priority       : ${taskData.priority ?? '—'}`);
    console.log(`   Estimated hours: ${taskData.estimatedHours != null ? `${taskData.estimatedHours}h` : '—'}`);
    console.log(`   Tags           : ${Array.isArray(taskData.tags) && taskData.tags.length ? taskData.tags.join(', ') : '—'}`);

    if (taskData.originalFeedback) {
      const quote = String(taskData.originalFeedback);
      const preview = quote.length > 200
        ? quote.slice(0, 200) + '…'
        : quote;
      console.log(`\n   🗣️  Original user quote:\n   "${preview}"`);
    }

    console.log('');

    // ── Mark as being processed BEFORE the async work ───────────────────────
    // This prevents a re-fire from the snapshot if the agent is slow.
    await updateDoc(doc(db, TASKS_COL, taskId), {
      coderProcessed:   true,
      coderPickedUpAt:  serverTimestamp(),
      coderAttempts:    currentAttempts + 1, // AGENT-FIX: increment attempt counter
    });

    // ── Code generation ─────────────────────────────────────────────────────
    await generateCodePatch(db, taskId, taskData);

    console.log(`\n✅ [Coder Agent] Task "${taskData.title}" picked up and marked processed.`);

  } catch (err) {
    console.error(`\n❌ [Coder Agent] Error processing task ${taskId}:`, err?.message ?? err);

    // Roll back the coderProcessed flag so the task can be retried on next run.
    try {
      await updateDoc(doc(db, TASKS_COL, taskId), {
        coderProcessed:  false,
        coderPickedUpAt: null,
      });
    } catch (rollbackErr) {
      console.error('   ⚠️  Rollback failed:', rollbackErr?.message ?? rollbackErr);
    }
  } finally {
    processing.delete(taskId);
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log('┌──────────────────────────────────────────────────────────┐');
  console.log('│  Agent 2 — Sandbox Coder  |  Listening for in_progress   │');
  console.log('└──────────────────────────────────────────────────────────┘\n');

  const db = await initFirebase();

  // Query: tasks in the 'in_progress' kanban column.
  // coderProcessed filtering is done client-side (see processTask) to avoid
  // needing a Firestore composite index on {status, coderProcessed}.
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
        // React to both newly-added tasks AND tasks that were just moved into
        // 'in_progress' via a drag-drop (which fires as 'modified').
        if (change.type === 'added' || change.type === 'modified') {
          processTask(db, change.doc).catch((err) =>
            console.error('[Coder Agent] Unhandled error in processTask:', err),
          );
        }
      });
    },
    (err) => {
      console.error('\n❌ [Coder Agent] Firestore listener error:', err?.message ?? err);

      // Attempt automatic reconnect after 5 seconds if listener drops.
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
    console.log('\n\n🛑 [Coder Agent] Stopping listener...');
    unsubscribe();
    process.exit(0);
  };
  process.on('SIGINT',  shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('❌ [Coder Agent] Fatal startup error:', err?.message ?? err);
  process.exit(1);
});
