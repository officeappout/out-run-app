'use client';

/**
 * AI tester sign-in. The custom token arrives in the URL FRAGMENT (#t=…), so it never reaches
 * a server log or the history (the fragment is wiped before anything else happens).
 *
 * Signs in only when ALL hold (checkQaSigninToken + the checks below):
 *   - the token's uid is demo_qa_* and its claims carry qa + demo;
 *   - enable_demo_users && enable_ai_testers (stored values, read once);
 *   - nobody else is signed in on this device (a real user who opens such a link stays signed in
 *     as themselves);
 *   - after sign-in, the ID token really carries the tester claims (else sign out at once).
 * The outcome is exposed as data-qa-signin="ok" | "refused:<reason>" for the runner.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { signInWithCustomToken, signOut } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { checkQaSigninToken, isQaTesterIdentity, isQaTesterUid, tokenFromHash } from '@/lib/qa/qa-tester';

type State = { kind: 'working' } | { kind: 'ok' } | { kind: 'refused'; reason: string };

export default function QaSigninClient() {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: 'working' });

  useEffect(() => {
    let cancelled = false;
    const token = tokenFromHash(window.location.hash);
    // Wipe the fragment first — the token must not linger in the address bar or history.
    window.history.replaceState(null, '', window.location.pathname);

    const refuse = (reason: string) => {
      if (!cancelled) setState({ kind: 'refused', reason });
    };

    (async () => {
      let flagsRaw: Record<string, unknown> | undefined;
      try {
        flagsRaw = (await getDoc(doc(db, 'system_config', 'feature_flags'))).data();
      } catch {
        return refuse('flags_unreadable');
      }
      const check = checkQaSigninToken(token, flagsRaw, Math.floor(Date.now() / 1000));
      if (!check.ok) return refuse(check.reason);

      await auth.authStateReady();
      const existing = auth.currentUser;
      if (existing && !isQaTesterUid(existing.uid)) return refuse('other_user_signed_in');

      try {
        const cred = await signInWithCustomToken(auth, token as string);
        const res = await cred.user.getIdTokenResult();
        if (cred.user.uid !== check.uid || !isQaTesterIdentity(cred.user.uid, res.claims as Record<string, unknown>)) {
          await signOut(auth);
          return refuse('claims_mismatch');
        }
      } catch {
        return refuse('sign_in_failed');
      }
      if (cancelled) return;
      setState({ kind: 'ok' });
      router.replace('/');
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const status = state.kind === 'refused' ? `refused:${state.reason}` : state.kind;
  return (
    <main
      dir="rtl"
      data-qa-signin={status}
      className="grid min-h-[100dvh] place-items-center bg-v2-surface px-6 text-center"
    >
      <div className="rounded-v2-card bg-white p-6 shadow-v2-card">
        <p className="text-[17px] font-black text-v2-ink">
          {state.kind === 'refused' ? 'הכניסה נדחתה' : 'מתחבר…'}
        </p>
        {state.kind === 'refused' && (
          <p className="mt-2 text-[13px] font-bold text-v2-muted">הדף הזה מיועד לבודקים אוטומטיים בלבד.</p>
        )}
      </div>
    </main>
  );
}
