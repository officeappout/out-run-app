/**
 * Client-side wrapper for the `previewNotificationContent` Cloud Function —
 * a read-only dry-run of the real push-content selection path (see
 * `functions/src/previewNotificationContent.ts`). Used exclusively by the
 * admin workout simulator's push preview panel.
 *
 * NOT deployed as of this commit — every call will fail until it's shipped
 * (`firebase deploy --only functions:previewNotificationContent`) or reached
 * via the local Functions emulator. Callers MUST render the returned error
 * honestly (e.g. "not deployed / unreachable") rather than falling back to
 * any fabricated content — that is the entire point of this tool existing.
 */

import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '@/lib/firebase';

export interface PreviewNotificationInput {
  triggerType: string;
  bundleIdPrefix?: string;
  persona?: string | null;
  dailyGoalBucket?: string;
  activityType?: string;
  previewUid?: string;
  vars?: Record<string, string | number | undefined>;
}

export interface NotificationCandidate {
  docId: string;
  text: string;
  bundleId?: string;
  persona?: string;
  isPicked: boolean;
}

export interface PreviewNotificationData {
  ok: true;
  resolvedPersona: string;
  matched: boolean;
  interpolatedText?: string;
  selectedDocId?: string;
  candidates: NotificationCandidate[];
}

export type PreviewNotificationResult =
  | { ok: true; data: PreviewNotificationData }
  | { ok: false; error: string };

export async function previewNotificationContent(
  input: PreviewNotificationInput,
): Promise<PreviewNotificationResult> {
  try {
    const functions = getFunctions(app, 'us-central1');
    const callable = httpsCallable<PreviewNotificationInput, PreviewNotificationData>(
      functions,
      'previewNotificationContent',
    );
    const { data } = await callable(input);
    return { ok: true, data };
  } catch (err: any) {
    // Deliberately surfaced, not swallowed — the admin panel must show
    // exactly why this failed (not-deployed, permission-denied, offline,
    // etc.) rather than silently falling back to anything.
    const message = err?.message || String(err);
    console.warn('[previewNotificationContent] call failed:', message);
    return { ok: false, error: message };
  }
}
