import { TOGETHER_CONFIG } from './config';

/**
 * Synced 3-2-1. The host writes `startAt` as a SERVER timestamp (now + lead).
 * Every device converts it to its own clock with an offset learnt from a
 * server-stamped write of its own, so a phone whose clock is 40 s off still
 * hits "go" within a round-trip of the others.
 */

/**
 * offset = serverClock − localClock. A server-stamped write left at
 * `sentLocalMs` and was read back at `recvLocalMs`; the stamp is assumed to
 * have landed mid-flight.
 */
export function estimateClockOffset(serverMs: number, sentLocalMs: number, recvLocalMs: number): number {
  const mid = sentLocalMs + Math.max(0, recvLocalMs - sentLocalMs) / 2;
  return serverMs - mid;
}

/** Keep the sample with the shortest round-trip — it carries the least error. */
export function betterOffset(
  best: { offsetMs: number; rttMs: number } | null,
  serverMs: number,
  sentLocalMs: number,
  recvLocalMs: number,
): { offsetMs: number; rttMs: number } {
  const rttMs = Math.max(0, recvLocalMs - sentLocalMs);
  const offsetMs = estimateClockOffset(serverMs, sentLocalMs, recvLocalMs);
  return best && best.rttMs <= rttMs ? best : { offsetMs, rttMs };
}

/** The start instant (server ms) the host should publish. */
export function planStartAt(serverNowMs: number, leadMs: number = TOGETHER_CONFIG.countdownLeadMs): number {
  return serverNowMs + leadMs + TOGETHER_CONFIG.countdownSeconds * 1000;
}

export type CountdownView =
  | { phase: 'waiting' }
  /** 3, 2, 1 — `msToNext` until the digit changes. */
  | { phase: 'counting'; digit: number; msToNext: number }
  | { phase: 'go' };

/** What to show now, given the server start instant and our clock offset. */
export function countdownAt(startAtServerMs: number | null, localNowMs: number, offsetMs: number): CountdownView {
  if (startAtServerMs == null) return { phase: 'waiting' };
  const remaining = startAtServerMs - (localNowMs + offsetMs);
  if (remaining <= 0) return { phase: 'go' };
  const total = TOGETHER_CONFIG.countdownSeconds * 1000;
  // Before the digits begin (the lead) we show the first digit, held.
  if (remaining > total) return { phase: 'counting', digit: TOGETHER_CONFIG.countdownSeconds, msToNext: remaining - total + 1000 };
  const digit = Math.ceil(remaining / 1000);
  return { phase: 'counting', digit, msToNext: remaining - (digit - 1) * 1000 };
}
