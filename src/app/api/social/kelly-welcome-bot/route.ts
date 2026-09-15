/**
 * /api/social/kelly-welcome-bot — server-side seed of the one-time Kelly welcome DM
 *
 * POST { source: 'onboarding' | 'catchup' } — caller's own uid comes from
 * the verified token, never the body.
 *
 * source gates the go-live cutoff (David, 15.09.2026): self-heal via the
 * catchup path must only apply to users who registered from go-live
 * onward — every pre-existing test account with a completed onboarding
 * would otherwise get a welcome message the next time it hits home.
 * 'onboarding' never needs this check (a user reaching COMPLETED via that
 * path is by definition registering right now); 'catchup' compares the
 * caller's users/{uid}.createdAt (the canonical registration timestamp —
 * see user.types.ts's own comment on that field, set once via
 * serverTimestamp() on first doc creation, never overwritten) against
 * GO_LIVE_AT below and no-ops for anyone who registered earlier. This
 * lives here, not in the client hook, specifically so the cutoff is one
 * server-side, auditable value instead of a client-trusted decision.
 *
 * GO_LIVE_AT below is set to the actual merge moment, rounded later
 * rather than earlier — see that constant's own comment for why the
 * rounding direction isn't arbitrary.
 *
 * Moved server-side (10.09.2026, David) after two independent Firestore rule
 * blockers made the original client-side version (kelly-welcome-bot.service.ts's
 * old triggerKellyWelcomeBot) unable to ever succeed:
 *   1. DM creation requires get(users/{participant}).core.ageGroup == 'adult'
 *      for BOTH participants — users/system_kelly_coach never existed, so
 *      that get() failed to evaluate.
 *   2. Message creation requires request.auth.uid == senderUid — Kelly's
 *      message is written with senderUid: KELLY_UID, but the acting caller
 *      is the real logged-in user, never Kelly.
 * Admin SDK bypasses Firestore Security Rules entirely, so neither check
 * applies here — there is no need for users/system_kelly_coach to exist at
 * all with this approach; a "system bot" writing in its own name is not
 * something a client-enforced rule can express safely regardless.
 *
 * Two call sites, same idempotent endpoint (not two code paths — the
 * transactional flag check below is what makes calling this twice safe):
 *   - onboarding-sync.service.ts, the moment onboardingStatus first reaches
 *     COMPLETED (primary trigger, fire-and-forget).
 *   - useKellyWelcomeBotCatchup.ts, once per login session on the home
 *     screen (catch-up trigger) — closes the gap where a client-initiated
 *     call can simply be missed (app closed mid-request, network drop)
 *     with no way for the primary trigger to know it failed. A
 *     Firestore write-trigger on users/{uid} was considered and rejected:
 *     that document already has one trigger (userPublicSync) whose own
 *     comment warns against adding a second — an XP write fires on every
 *     workout, so a second per-write trigger would run tens of thousands
 *     of times a day to check one flag that flips once per user, ever.
 *
 * Everything below — the flag check, the chat doc, the message doc — is
 * one Firestore transaction: either all of it lands, or none of it does.
 * Splitting the flag flip from the writes (as the original client version
 * did, flipping it last) is exactly what made a race between the two call
 * sites above possible (both read the flag as false before either writes)
 * — the read-check-and-flip must be inside the same transaction as the
 * writes it's guarding, not a separate step after them.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { KELLY_UID, KELLY_NAME, buildKellyWelcomeMessage } from '@/features/social/services/kelly-welcome-bot.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Set to the actual merge moment (15.09.2026), rounded LATER rather than
// earlier per David's own reasoning: the risk is asymmetric. Too early =
// a pre-existing test account gets "welcome" via catchup, exactly what
// this gate exists to prevent. Too late = a genuinely new user only
// loses the catchup safety net for a window — the primary 'onboarding'
// trigger is exempt from this check entirely, so they still get the
// message through that path regardless.
// 2026-09-15T12:00:00Z == 15:00 Israel time (IDT, UTC+3) — ~45 minutes
// after the actual merge, specifically to round later than earlier.
const GO_LIVE_AT = new Date('2026-09-15T12:00:00Z');

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization') ?? '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) {
      return NextResponse.json({ error: 'Missing auth token' }, { status: 401 });
    }

    let uid: string;
    try {
      const decoded = await getAdminAuth().verifyIdToken(idToken, true);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { source } = body as { source?: string };
    if (source !== 'onboarding' && source !== 'catchup') {
      return NextResponse.json({ error: "source must be 'onboarding' or 'catchup'" }, { status: 400 });
    }

    const db = getAdminDb();
    const userRef = db.collection('users').doc(uid);
    // Deterministic id — same convention as chat.service.ts's makeChatId
    // ([uid1, uid2].sort().join('_')) so this resolves to the same doc a
    // real client-SDK getOrCreateChat(uid, KELLY_UID) call would find.
    const chatId = [uid, KELLY_UID].sort().join('_');
    const chatRef = db.collection('chats').doc(chatId);

    const result = await db.runTransaction(async (tx) => {
      // Both reads before any write — required for Firestore transactions,
      // and also what makes the flag check + chat-existence check atomic
      // with the writes they gate.
      const [userSnap, chatSnap] = await Promise.all([tx.get(userRef), tx.get(chatRef)]);

      if (!userSnap.exists) {
        return { sent: false, reason: 'user-not-found' as const };
      }

      const userData = userSnap.data()!;
      if (userData.hasWelcomeBotTriggered === true) {
        return { sent: false, reason: 'already-triggered' as const };
      }

      // Defensive backstop, not just a UX check: this endpoint is
      // authenticated and any logged-in user can call it on themselves at
      // any time, regardless of what the client hooks normally gate this
      // on. Calling it before onboarding completes would send a nameless
      // greeting AND permanently flip hasWelcomeBotTriggered — the real
      // welcome message could then never arrive. One check protects an
      // otherwise-irreversible outcome.
      if (userData.onboardingStatus !== 'COMPLETED') {
        return { sent: false, reason: 'onboarding-not-complete' as const };
      }

      // Go-live cutoff — 'onboarding' never needs this (registering right
      // now, by definition); 'catchup' must not resurrect pre-existing
      // accounts. Missing createdAt (shouldn't happen for a COMPLETED
      // account, but fail closed rather than assume eligible) is treated
      // as "before go-live".
      if (source === 'catchup') {
        const createdAt = userData.createdAt?.toDate?.() as Date | undefined;
        if (!createdAt || createdAt < GO_LIVE_AT) {
          return { sent: false, reason: 'registered-before-go-live' as const };
        }
      }

      // Chat existing here would mean a prior attempt got partway before
      // this transactional version existed — defensive, not expected in
      // practice (the old client path could never successfully create it,
      // per the two blockers above). Flip the flag without re-sending
      // rather than risk a duplicate greeting.
      if (chatSnap.exists) {
        tx.update(userRef, { hasWelcomeBotTriggered: true });
        return { sent: false, reason: 'chat-already-existed' as const };
      }

      const name: string = userData.core?.name ?? '';
      const gender: 'male' | 'female' | 'other' | undefined = userData.core?.gender;
      const message = buildKellyWelcomeMessage(name, gender);
      const messageRef = chatRef.collection('messages').doc();

      // Chat doc is created WITH the first message's effects already
      // applied (lastMessage/lastMessageAt/lastSenderId/unreadCount) —
      // one write instead of chat.service.ts's original create-then-
      // update pair, since this chat never exists before this moment.
      tx.set(chatRef, {
        participants: [uid, KELLY_UID],
        participantNames: { [uid]: name || 'משתמש', [KELLY_UID]: KELLY_NAME },
        lastMessage: message,
        lastMessageAt: FieldValue.serverTimestamp(),
        lastSenderId: KELLY_UID,
        unreadCount: { [uid]: 1, [KELLY_UID]: 0 },
        createdAt: FieldValue.serverTimestamp(),
        type: 'dm',
      });

      tx.set(messageRef, {
        senderUid: KELLY_UID,
        senderName: KELLY_NAME,
        text: message,
        sentAt: FieldValue.serverTimestamp(),
        readBy: [KELLY_UID],
        type: 'text',
      });

      tx.update(userRef, { hasWelcomeBotTriggered: true });

      return { sent: true as const };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[kelly-welcome-bot] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
