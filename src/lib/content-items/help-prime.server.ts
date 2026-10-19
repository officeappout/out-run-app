/**
 * Server side of the help loader: refresh lib/app-help/loader's synced copy from site_content
 * (at most once per 5 minutes per instance) before Kelly answers. Never throws — a failure keeps
 * whatever the loader already has (the last good copy, or the code entries).
 */
import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import { helpQAFromItem, setRemoteHelpEntries } from '@/lib/app-help/loader';
import { listContentItems } from './store.server';
import { isQaItem } from './types';

const TTL_MS = 5 * 60 * 1000;
const RETRY_MS = 60 * 1000;
let nextAt = 0;
let inflight: Promise<void> | null = null;

export function primeHelpEntries(db: Firestore, now = Date.now()): Promise<void> {
  if (now < nextAt) return Promise.resolve();
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const items = await listContentItems(db, { type: 'help', locale: 'he', status: 'published' });
      // reachable: content → the synced copy, empty → the code fallback
      setRemoteHelpEntries(items.filter(isQaItem).map(helpQAFromItem));
      nextAt = now + TTL_MS;
    } catch (err) {
      console.warn('[help-prime] site_content unreachable, keeping the current help entries', err);
      nextAt = now + RETRY_MS;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Tests only. */
export function __resetHelpPrime(): void {
  nextAt = 0;
  inflight = null;
}
