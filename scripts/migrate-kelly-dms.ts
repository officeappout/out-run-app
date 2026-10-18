/**
 * scripts/migrate-kelly-dms.ts — unified Kelly (phase 1): copy every user's old human Kelly DM
 * (chats/{[uid, 'system_kelly_coach'].sort().join('_')}/messages) into their unified
 * conversation (ai_coach_threads/{uid}/messages). Run BEFORE turning kelly_unified_v1 on.
 *
 *   npx tsx --env-file=.env.local scripts/migrate-kelly-dms.ts            # DRY RUN (default): reads only
 *   npx tsx --env-file=.env.local scripts/migrate-kelly-dms.ts --write    # apply
 *   options: --limit=N (chats), --uid=<uid> (one user)
 *
 * Credentials: FIREBASE_SERVICE_ACCOUNT_KEY (JSON) from .env.local.
 *
 * Safe to re-run (idempotent): target ids are `legacy_${oldMessageId}`, existing ones are
 * skipped, and the thread counters only move by what was actually written. Each copy carries
 * migratedFrom { chatId, messageId } — the onKellyThreadMessage push trigger never pushes those.
 * No expireAt (no TTL). The old chats are NOT touched (they stay as an archive). Writes are
 * batched (≤ 400 ops per batch). Output: counts and ids only, never message text.
 *
 * Mapping and the needsHuman rule: src/lib/ai/coach/kelly-dm-migration.ts.
 */
import * as admin from 'firebase-admin';
import { KELLY_UID } from '../src/features/social/services/kelly-welcome-bot.constants';
import { migrationWrites, planKellyDmMigration, userUidOfKellyChat, type LegacyDmMessage } from '../src/lib/ai/coach/kelly-dm-migration';

const WRITE = process.argv.includes('--write');
const LIMIT = Number(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? 0) || 0;
const ONLY_UID = process.argv.find((a) => a.startsWith('--uid='))?.split('=')[1] ?? null;
const BATCH_OPS = 400;

function init(): admin.firestore.Firestore {
  if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY missing (run with --env-file=.env.local)');
    const c = JSON.parse(raw);
    admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
  }
  return admin.firestore();
}

const msOf = (v: unknown): number =>
  v && typeof (v as { toMillis?: unknown }).toMillis === 'function' ? (v as admin.firestore.Timestamp).toMillis() : 0;

async function main() {
  const db = init();
  console.log(`[migrate-kelly-dms] mode=${WRITE ? 'WRITE' : 'DRY-RUN'}${LIMIT ? ` limit=${LIMIT}` : ''}${ONLY_UID ? ` uid=${ONLY_UID}` : ''}`);

  let q: admin.firestore.Query = db.collection('chats').where('participants', 'array-contains', KELLY_UID);
  if (LIMIT) q = q.limit(LIMIT);
  const chats = await q.get();

  const totals = {
    chats: chats.size,
    chatsWithMessages: 0,
    skippedNoUser: 0,
    legacyMessages: 0,
    toWrite: 0,
    alreadyMigrated: 0,
    bySource: { user: 0, human: 0 } as Record<string, number>,
    skippedHandoff: 0,
    skippedEmpty: 0,
    skippedWelcome: 0,
    threadsTouched: 0,
    threadsCreated: 0,
    wouldSetNeedsHuman: 0,
    userDocMissing: 0,
    written: 0,
  };
  const needsHumanUids: string[] = [];

  let batch = db.batch();
  let ops = 0;
  const flush = async () => {
    if (WRITE && ops > 0) await batch.commit();
    batch = db.batch();
    ops = 0;
  };

  for (const chat of chats.docs) {
    const data = chat.data();
    const uid = userUidOfKellyChat(chat.id, data.participants as string[] | undefined, KELLY_UID);
    if (!uid || (ONLY_UID && uid !== ONLY_UID)) {
      if (!uid) totals.skippedNoUser += 1;
      continue;
    }

    const msgs = await chat.ref.collection('messages').get();
    if (msgs.empty) continue;
    totals.chatsWithMessages += 1;
    totals.legacyMessages += msgs.size;

    const raw: LegacyDmMessage[] = msgs.docs.map((d) => {
      const x = d.data();
      return {
        id: d.id,
        senderUid: typeof x.senderUid === 'string' ? x.senderUid : '',
        senderName: typeof x.senderName === 'string' ? x.senderName : undefined,
        text: typeof x.text === 'string' ? x.text : '',
        sentAtMs: msOf(x.sentAt) || msOf(data.createdAt) || 0,
        type: typeof x.type === 'string' ? x.type : undefined,
        source: typeof x.source === 'string' ? x.source : undefined,
      };
    });
    const plan = planKellyDmMigration(chat.id, uid, KELLY_UID, raw);
    totals.skippedHandoff += plan.skipped.handoff;
    totals.skippedEmpty += plan.skipped.empty;
    totals.skippedWelcome += plan.skipped.welcome;

    const threadRef = db.collection('ai_coach_threads').doc(uid);
    const [threadSnap, userSnap, existing] = await Promise.all([
      threadRef.get(),
      db.collection('users').doc(uid).get(),
      plan.messages.length
        ? db.getAll(...plan.messages.map((m) => threadRef.collection('messages').doc(m.id)))
        : Promise.resolve([] as admin.firestore.DocumentSnapshot[]),
    ]);
    if (!userSnap.exists) totals.userDocMissing += 1;
    const t = threadSnap.exists ? (threadSnap.data() ?? {}) : {};
    const existingIds = new Set(existing.filter((s) => s.exists).map((s) => s.id));
    totals.alreadyMigrated += existingIds.size;

    const { toWrite, thread } = migrationWrites(plan, existingIds, {
      lastMessageAtMs: msOf(t.lastMessageAt),
      lastHumanReplyAtMs: msOf(t.lastHumanReplyAt),
      needsHuman: t.needsHuman === true,
      raisedNeedsHumanAtMs: msOf(t.kellyDmMigration?.needsHumanAt),
    });
    if (!thread) continue;
    totals.toWrite += toWrite.length;
    for (const m of toWrite) totals.bySource[m.source] = (totals.bySource[m.source] ?? 0) + 1;
    totals.threadsTouched += 1;
    if (!threadSnap.exists) totals.threadsCreated += 1;
    if (thread.setNeedsHuman) {
      totals.wouldSetNeedsHuman += 1;
      needsHumanUids.push(uid);
    }

    for (const m of toWrite) {
      batch.set(threadRef.collection('messages').doc(m.id), {
        role: m.role,
        source: m.source,
        text: m.text,
        cards: [],
        ...(m.senderName ? { senderName: m.senderName } : {}),
        createdAt: admin.firestore.Timestamp.fromMillis(m.createdAtMs),
        migratedFrom: m.migratedFrom,
      });
      ops += 1;
      if (ops >= BATCH_OPS) await flush();
    }
    const T = admin.firestore.Timestamp;
    batch.set(
      threadRef,
      {
        ...(thread.messageCountIncrement ? { messageCount: admin.firestore.FieldValue.increment(thread.messageCountIncrement) } : {}),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        ...(thread.lastMessageAtMs ? { lastMessageAt: T.fromMillis(thread.lastMessageAtMs), lastMessagePreview: thread.lastMessagePreview } : {}),
        ...(thread.lastHumanReplyAtMs ? { lastHumanReplyAt: T.fromMillis(thread.lastHumanReplyAtMs) } : {}),
        ...(thread.setNeedsHuman
          ? {
              needsHuman: true,
              needsHumanAt: T.fromMillis(thread.setNeedsHuman.atMs),
              ...(thread.setNeedsHuman.summary ? { needsHumanSummary: thread.setNeedsHuman.summary } : {}),
            }
          : {}),
        kellyDmMigration: {
          chatId: chat.id,
          lastRunAt: admin.firestore.FieldValue.serverTimestamp(),
          copied: admin.firestore.FieldValue.increment(toWrite.length),
          ...(thread.setNeedsHuman ? { needsHumanAt: T.fromMillis(thread.setNeedsHuman.atMs) } : {}),
        },
      },
      { merge: true },
    );
    ops += 1;
    if (ops >= BATCH_OPS) await flush();
    if (WRITE) totals.written += toWrite.length;
  }
  await flush();

  console.log(JSON.stringify(totals, null, 2));
  console.log(`needsHuman uids (${needsHumanUids.length}): ${needsHumanUids.join(', ')}`);
  if (!WRITE) console.log('DRY-RUN: nothing was written. Re-run with --write to apply.');
}

main().catch((err) => {
  console.error('[migrate-kelly-dms] failed', err);
  process.exit(1);
});
