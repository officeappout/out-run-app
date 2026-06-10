#!/usr/bin/env node
'use strict';

/**
 * scripts/amit-loop.js
 *
 * Amit R&D Autonomous Loop — Firestore Listener → Claude Analysis → Kanban
 *
 * Listens to the `user_feedback` collection for new documents.
 * For every new (unconverted) feedback item:
 *   1. Sends content to Claude (claude-3-5-haiku) for structured analysis.
 *   2. Checks `product_roadmap` for a duplicate (by originalFeedbackId).
 *   3. Creates a new kanban task in `product_roadmap` with:
 *        source: 'user_feedback'
 *        status: 'feedback_inbox'  ← isolated AI intake lane, before 'backlog'
 *        originalFeedbackId: <feedbackDocId>
 *        title: AI-generated Hebrew task title
 *        description: AI-generated technical explanation
 *        priority: decided by Claude (high / medium / low)
 *        estimatedHours: AI estimate of engineering effort
 *        tags: identified by Claude from content
 *   4. Marks the feedback doc isConverted: true + sets convertedTaskId.
 *
 * Required env vars (in .env.local):
 *   ANTHROPIC_API_KEY        — Anthropic API key
 *   FIREBASE_ADMIN_EMAIL     — Firebase user email (admin role)
 *   FIREBASE_ADMIN_PASSWORD  — Firebase user password
 *
 * Usage:
 *   node scripts/amit-loop.js
 *
 * Press Ctrl+C to stop the listener.
 */

// ── Bootstrap ─────────────────────────────────────────────────────────────────
require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const Anthropic = require('@anthropic-ai/sdk').default ?? require('@anthropic-ai/sdk');

const { initializeApp, getApps }              = require('firebase/app');
const { getAuth, signInWithEmailAndPassword }  = require('firebase/auth');
const {
  getFirestore,
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  getDocs,
  doc,
  serverTimestamp,
} = require('firebase/firestore');

// ── Firebase config ────────────────────────────────────────────────────────────
const FIREBASE_CONFIG = {
  apiKey:            'AIzaSyCezG55zVQEZWCEs-lHzx_yQldg-Ej2X60',
  authDomain:        'appout-1.firebaseapp.com',
  projectId:         'appout-1',
  storageBucket:     'appout-1.firebasestorage.app',
  messagingSenderId: '371293978848',
  appId:             '1:371293978848:web:c5281b7834ecd5398b1085',
};

const TASKS_COL    = 'product_roadmap';
const FEEDBACK_COL = 'user_feedback';

// Valid values mirrored from product-roadmap.types.ts
// Note: 'critical' is intentionally excluded — AI routes only to low/medium/high.
// Humans escalate to critical manually in the kanban.
const VALID_PRIORITIES = ['high', 'medium', 'low'];
const VALID_TAGS = [
  'ממשק ריצה',
  'ממשק כוח',
  'מבט על האימון',
  'ניהול רשויות',
  'פאנל ניהול',
  "פיצ'רים חדשים",
  'Onboarding',
  'Bug Fix',
  'UI/UX',
  'Performance',
  'Analytics',
  'Running Engine',
];

// ── Env validation ─────────────────────────────────────────────────────────────
const ANTHROPIC_API_KEY   = (process.env.ANTHROPIC_API_KEY       ?? '').trim();
const FIREBASE_EMAIL      = (process.env.FIREBASE_ADMIN_EMAIL    ?? '').trim();
const FIREBASE_PASSWORD   = (process.env.FIREBASE_ADMIN_PASSWORD ?? '').trim();

if (!ANTHROPIC_API_KEY) {
  console.error('\n❌  Missing ANTHROPIC_API_KEY in .env.local\n');
  process.exit(1);
}
if (!FIREBASE_EMAIL || !FIREBASE_PASSWORD) {
  console.error('\n❌  Missing FIREBASE_ADMIN_EMAIL or FIREBASE_ADMIN_PASSWORD in .env.local\n');
  process.exit(1);
}

// ── Clients ────────────────────────────────────────────────────────────────────
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// ── Claude analysis ────────────────────────────────────────────────────────────
/**
 * Ask Claude to classify a feedback item and return structured JSON.
 * @param {string} content
 * @returns {Promise<{
 *   title: string,
 *   description: string,
 *   priority: string,
 *   estimatedHours: number | null,
 *   tags: string[]
 * }>}
 */
async function analyzeWithClaude(content) {
  const systemPrompt = `You are a senior product manager and tech lead for OUT-RUN — a Hebrew fitness app (Next.js + Firebase + React Native).
Analyze the user feedback and return a JSON object with EXACTLY these fields:

- title: short task title in Hebrew (max 60 chars), reflecting the core request
- description: technical explanation in Hebrew (2-4 sentences) — describe WHAT needs to change and WHY, not just what the user said
- priority: exactly one of: high, medium, low — based on user impact and urgency (do NOT use "critical")
- estimatedHours: integer number of engineering hours to implement this change (be realistic — UI tweaks: 1-4h, new features: 8-40h, complex backend: 20-80h)
- tags: array of 1-3 matching tags chosen ONLY from this list: ${VALID_TAGS.join(', ')}
  (return empty array [] if none match)

Rules:
- Return ONLY valid JSON. No markdown fences, no explanation, no extra text.
- All Hebrew text must be grammatically correct and professional.
- estimatedHours must be a positive integer, never null or a string.`;

  const userMsg = `User feedback to analyze:\n"${content}"`;

  const response = await anthropic.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 500,
    messages:   [{ role: 'user', content: userMsg }],
    system:     systemPrompt,
  });

  const raw = response.content[0]?.text?.trim() ?? '{}';

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn('   ⚠️  Claude returned non-JSON, using safe defaults. Raw:', raw);
    parsed = {};
  }

  // ── Validate and sanitise each field ──────────────────────────────────────
  const hours = Number(parsed.estimatedHours);
  const estimatedHours = Number.isInteger(hours) && hours > 0 && hours <= 500
    ? hours
    : null;

  return {
    title:          typeof parsed.title       === 'string' ? parsed.title.slice(0, 120)         : `משוב: ${content.slice(0, 50)}`,
    description:    typeof parsed.description === 'string' ? parsed.description                  : content,
    priority:       VALID_PRIORITIES.includes(parsed.priority) ? parsed.priority                 : 'medium',
    estimatedHours,
    tags:           Array.isArray(parsed.tags) ? parsed.tags.filter(t => VALID_TAGS.includes(t)) : [],
  };
}

// ── Deduplication ──────────────────────────────────────────────────────────────
/**
 * Check whether a task already exists for this feedback document.
 * Uses originalFeedbackId field to avoid double-processing.
 * @param {import('firebase/firestore').Firestore} db
 * @param {string} feedbackId
 * @returns {Promise<boolean>}
 */
async function taskExistsForFeedback(db, feedbackId) {
  const q = query(
    collection(db, TASKS_COL),
    where('originalFeedbackId', '==', feedbackId),
  );
  const snap = await getDocs(q);
  return !snap.empty;
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

// ── Process one feedback doc ───────────────────────────────────────────────────
const processing = new Set(); // in-flight guard — avoid duplicate concurrent runs

async function processFeedback(db, docSnap) {
  const feedbackId = docSnap.id;
  const data       = docSnap.data();
  const content    = (data.content ?? '').trim();

  if (!content) return;

  // In-flight guard
  if (processing.has(feedbackId)) return;
  processing.add(feedbackId);

  try {
    console.log(`\n📥 New feedback received: "${content.slice(0, 120)}${content.length > 120 ? '…' : ''}"`);

    // ── Dedup check ──────────────────────────────────────────────────────────
    const exists = await taskExistsForFeedback(db, feedbackId);
    if (exists) {
      console.log(`   ↩️  Task already exists for feedback ${feedbackId} — skipping.`);
      return;
    }

    // ── Claude analysis ──────────────────────────────────────────────────────
    console.log('🤖 Analyzing with Claude...');
    const { title, description, priority, estimatedHours, tags } = await analyzeWithClaude(content);

    // ── Create task in product_roadmap ───────────────────────────────────────
    // Append the verbatim user quote to the description so it is visible
    // in any view that only shows the description field (e.g. list view).
    const fullDescription = description
      + `\n\n--- 🗣️ ציטוט מקורי של המשתמש:\n${content}`;

    const taskPayload = {
      title,
      description:        fullDescription,
      source:             'user',          // maps to TaskSource; closest to user feedback
      status:             'feedback_inbox', // isolated AI intake lane — admin promotes to backlog manually
      priority,
      estimatedHours,                      // pre-filled by AI — maps to RoadmapTaskForm estimatedHours field
      tags,
      originalFeedback:   content,         // verbatim user quote — displayed read-only in admin modal
      originalFeedbackId: feedbackId,      // traceability back to source doc
      feedbackId,                          // also set standard feedbackId for FeedbackPanel UI
      createdByName:      'Amit Loop (AI)',
      createdAt:          serverTimestamp(),
      updatedAt:          serverTimestamp(),
    };

    const taskRef = await addDoc(collection(db, TASKS_COL), taskPayload);
    const hoursLabel = estimatedHours != null ? ` ~${estimatedHours}h` : '';
    console.log(`✅ Task created: "${title}" [${priority}${hoursLabel}] (ID: ${taskRef.id})`);

    // ── Mark feedback as converted ───────────────────────────────────────────
    await updateDoc(doc(db, FEEDBACK_COL, feedbackId), {
      isConverted:     true,
      convertedTaskId: taskRef.id,
    });

  } catch (err) {
    console.error(`   ❌ Error processing feedback ${feedbackId}:`, err?.message ?? err);
  } finally {
    processing.delete(feedbackId);
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log('┌─────────────────────────────────────────────────────┐');
  console.log('│  Amit R&D Loop — Feedback → Kanban Autonomous Agent  │');
  console.log('└─────────────────────────────────────────────────────┘\n');

  const db = await initFirebase();

  // Listen only to unconverted feedback docs
  const feedbackQuery = query(
    collection(db, FEEDBACK_COL),
    where('isConverted', '==', false),
  );

  console.log('👂 Listening for new user_feedback documents...');
  console.log('   (Press Ctrl+C to stop)\n');

  // onSnapshot fires immediately with all currently-matching docs,
  // then for every subsequent add/change. We handle 'added' only.
  const unsubscribe = onSnapshot(
    feedbackQuery,
    (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          processFeedback(db, change.doc).catch((err) =>
            console.error('Unhandled error in processFeedback:', err),
          );
        }
      });
    },
    (err) => {
      console.error('❌ Firestore listener error:', err?.message ?? err);
    },
  );

  // Graceful shutdown
  const shutdown = () => {
    console.log('\n\n🛑 Stopping listener...');
    unsubscribe();
    process.exit(0);
  };
  process.on('SIGINT',  shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('❌ Fatal error:', err?.message ?? err);
  process.exit(1);
});
