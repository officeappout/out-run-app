import { TV_LOST_AFTER_MS } from './constants';
import { isExpired } from './expiry';
import type { TvSession } from './types';

export type TvScreen = 'waiting' | 'lobby' | 'live' | 'lost' | 'ended' | 'expired';

/**
 * Which TV screen to show. `serverNowMs` is the TV's best estimate of the server clock.
 * "lost" only exists once a workout is live: before that a quiet phone is just a phone.
 */
export function deriveTvScreen(session: TvSession | null, serverNowMs: number): TvScreen {
  if (!session) return 'waiting';
  if (session.status === 'ended') return 'ended';
  if (isExpired(session.expiresAtMs, serverNowMs)) return 'expired';
  if (session.status === 'waiting' || !session.hostUid) return 'waiting';
  if (session.status === 'live') {
    const beat = session.hostBeatAtMs;
    if (beat != null && serverNowMs - beat > TV_LOST_AFTER_MS) return 'lost';
    return 'live';
  }
  return 'lobby';
}

/** Host phone side: its link to the screen is "lost" when it is offline or the session is gone. */
export function phoneLinkState(args: { online: boolean; session: TvSession | null; nowMs: number }): 'ok' | 'lost' | 'over' {
  const { online, session, nowMs } = args;
  if (!session || session.status === 'ended' || isExpired(session.expiresAtMs, nowMs)) return 'over';
  return online ? 'ok' : 'lost';
}
