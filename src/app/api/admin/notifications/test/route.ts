import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import * as admin from 'firebase-admin';

// Test message per channel — realistic samples with [טסט] suffix
const TEST_MESSAGES: Record<string, { title: string; body: string }> = {
  progression:       { title: '🏅 עלית לרמה 5! [טסט]',              body: 'המשיכו כך — כל אימון מקדם אתכם!' },
  retention:         { title: '💪 דוד, 7 ימים בלי אימון [טסט]',      body: 'הגוף שלך מחכה לך. אפילו 15 דקות ישנו את מצב הרוח שלך.' },
  training_reminder: { title: '📅 אימון כוח ב-09:00 [טסט]',          body: 'האימון שלך מחכה — פתח את האפליקציה ותתחיל.' },
  social:            { title: 'ברוך הבא לקבוצה! [טסט]',              body: 'הקבוצה מחכה לך. פתח את האפליקציה לראות.' },
  encouragement:     { title: '💪 הודעת עידוד [טסט]',                 body: 'שומרים על הרצף — ביחד.' },
  chat:              { title: 'הודעה חדשה מדוד [טסט]',               body: 'פתח את הצ\'אט לקריאה.' },
};

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  let channel: string;
  let uid: string;
  let customTitle = '';
  let customBody = '';
  let customDeepLink = '';
  try {
    const body = await request.json() as {
      channel?: unknown; uid?: unknown; title?: unknown; body?: unknown; deepLink?: unknown;
    };
    channel = String(body.channel ?? '');
    uid = String(body.uid ?? '');
    customTitle = typeof body.title === 'string' ? body.title.trim() : '';
    customBody = typeof body.body === 'string' ? body.body.trim() : '';
    customDeepLink = typeof body.deepLink === 'string' ? body.deepLink.trim() : '';
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!channel || !uid) {
    return NextResponse.json({ error: 'channel and uid are required' }, { status: 400 });
  }

  // Custom title+body (targeted single-user send from the manual modal) overrides
  // the fixed per-channel sample; fall back to TEST_MESSAGES for "send test to me".
  const msg = customTitle && customBody
    ? { title: customTitle, body: customBody }
    : TEST_MESSAGES[channel];
  if (!msg) {
    return NextResponse.json({ error: `Unknown channel: ${channel}` }, { status: 400 });
  }

  const db = getAdminDb();

  // Fetch FCM tokens for the target user
  let tokens: string[];
  try {
    const snap = await db.collection('users').doc(uid).get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    const data = snap.data() as Record<string, unknown>;
    const raw = data?.fcmTokens;
    tokens = Array.isArray(raw) ? raw.filter((t): t is string => typeof t === 'string' && t.length > 0) : [];
  } catch (err) {
    console.error('[notifications/test] user fetch failed', err);
    return NextResponse.json({ error: 'Firestore error' }, { status: 500 });
  }

  if (tokens.length === 0) {
    return NextResponse.json({ delivered: 0, reason: 'No FCM tokens registered for this user' });
  }

  // Send directly via Admin SDK FCM (bypass rate-cap / quiet-hours for test)
  try {
    const response = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: { title: msg.title, body: msg.body },
      data: { channel, triggerType: 'AdminTest', deepLink: customDeepLink || '/' },
      apns: { payload: { aps: { sound: 'default', badge: 1 } } },
      android: { priority: 'high', notification: { sound: 'default' } },
    });

    const delivered = response.responses.filter((r) => r.success).length;
    const failed    = response.responses.filter((r) => !r.success).length;

    return NextResponse.json({ delivered, failed, tokens: tokens.length });
  } catch (err) {
    console.error('[notifications/test] FCM send failed', err);
    return NextResponse.json({ error: 'FCM error' }, { status: 500 });
  }
}
