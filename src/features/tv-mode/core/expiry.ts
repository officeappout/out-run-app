import { TV_SESSION_TTL_MS } from './constants';

export function expiresAtFor(nowMs: number): number {
  return nowMs + TV_SESSION_TTL_MS;
}

export function isExpired(expiresAtMs: number, nowMs: number): boolean {
  return nowMs >= expiresAtMs;
}

export function remainingMs(expiresAtMs: number, nowMs: number): number {
  return Math.max(0, expiresAtMs - nowMs);
}

/** Whole hours for the "valid for N hours" note (rounded up, at least 1 while it lives). */
export function remainingHours(expiresAtMs: number, nowMs: number): number {
  const left = remainingMs(expiresAtMs, nowMs);
  return left === 0 ? 0 : Math.max(1, Math.ceil(left / 3_600_000));
}
