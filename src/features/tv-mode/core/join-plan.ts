import type { WideKey } from '@/messages/ns/wide';
import { checkNickname } from './nickname';
import { firstName } from './participants';
import type { TvJoinError } from './types';

/** Who is holding this phone: a real account, a guest (anonymous), or nobody yet. */
export type TvIdentity = 'account' | 'guest' | 'none';

export function identityOf(user: { isAnonymous: boolean } | null | undefined): TvIdentity {
  if (!user) return 'none';
  return user.isAnonymous ? 'guest' : 'account';
}

/** Errors the connect screen can show (repo errors + the ones decided before any network call). */
export type TvJoinUiError = TvJoinError | 'nick-empty' | 'nick-too-long' | 'nick-charset';

export type JoinPlan =
  | { ok: true; guest: boolean; name: string }
  | { ok: false; error: TvJoinUiError };

/**
 * What name goes on the shared screen. Accounts: first name from the profile (`fallbackName` when the
 * profile has none). Guests: the nickname they typed, checked by the same rules the server applies.
 * `none` (no auth yet) is treated like a guest — the hook signs in anonymously first.
 */
export function planJoin(args: { identity: TvIdentity; accountName: string; nickname: string; fallbackName: string }): JoinPlan {
  if (args.identity === 'account') return { ok: true, guest: false, name: firstName(args.accountName) || args.fallbackName };
  const nick = checkNickname(args.nickname);
  if (nick.ok) return { ok: true, guest: true, name: nick.value };
  return { ok: false, error: nick.reason === 'empty' ? 'nick-empty' : nick.reason === 'too-long' ? 'nick-too-long' : 'nick-charset' };
}

/**
 * Catalog key for a join error. `wantsHost`: the person came through ⋯ → "show on a big screen", so a
 * guest who hits a free session is told hosting needs an account (not "the host has not connected").
 */
export function joinErrorKey(error: TvJoinUiError, wantsHost: boolean): WideKey {
  switch (error) {
    case 'not-found':
      return 'pair.phone.error.notFound';
    case 'expired':
      return 'pair.phone.error.expired';
    case 'ended':
      return 'pair.phone.error.ended';
    case 'offline':
      return 'pair.phone.error.offline';
    case 'host-required':
      return wantsHost ? 'pair.phone.error.hostNeedsAccount' : 'pair.phone.error.hostRequired';
    case 'nick-empty':
    case 'invalid-nickname':
      return 'pair.join.error.empty';
    case 'nick-too-long':
      return 'pair.join.error.tooLong';
    case 'nick-charset':
      return 'pair.join.error.charset';
    default:
      return 'pair.phone.error.unknown';
  }
}
