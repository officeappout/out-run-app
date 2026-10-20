'use client';

/**
 * useIsQaTester — true while the signed-in user is an AI tester (uid demo_qa_* + token claims
 * qa/demo; see ./qa-tester.ts). One module-level auth listener shared by every caller.
 *
 * Real users cost nothing: for a uid that is not demo_qa_* the answer is false straight from
 * the uid — the ID token is never decoded and nothing is read.
 */
import { useSyncExternalStore } from 'react';
import { onIdTokenChanged, type User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { isQaTesterIdentity, isQaTesterUid } from './qa-tester';

let current = false;
let started = false;
const listeners = new Set<() => void>();

function set(next: boolean) {
  if (next === current) return;
  current = next;
  listeners.forEach((l) => l());
}

async function evaluate(user: User | null) {
  if (!user || !isQaTesterUid(user.uid)) {
    set(false);
    return;
  }
  try {
    const res = await user.getIdTokenResult();
    set(isQaTesterIdentity(user.uid, res.claims as Record<string, unknown>));
  } catch {
    set(false);
  }
}

function start() {
  if (started || typeof window === 'undefined') return;
  started = true;
  onIdTokenChanged(auth, (u) => {
    void evaluate(u);
  });
}

function subscribe(cb: () => void) {
  start();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useIsQaTester(): boolean {
  return useSyncExternalStore(subscribe, () => current, () => false);
}
