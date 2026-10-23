import { TV_NICKNAME_MAX } from './constants';

/**
 * Guest nickname rules. The SAME pattern is in docs/tv-mode/tv-sessions.rules.proposal (RE2):
 * letters, marks, digits and ` . _ ' -`, no leading / trailing space, 1..TV_NICKNAME_MAX characters.
 */
// Built with the RegExp constructor: the /u literal flag is a TS1501 error under this repo's tsconfig target (typecheck gate).
export const NICKNAME_PATTERN = new RegExp("^[\\p{L}\\p{M}\\p{N}._'-]([\\p{L}\\p{M}\\p{N} ._'-]*[\\p{L}\\p{M}\\p{N}._'-])?$", 'u');

export type NicknameCheck =
  | { ok: true; value: string }
  | { ok: false; reason: 'empty' | 'too-long' | 'charset' };

/** Trim and squeeze inner whitespace runs to one space. */
export function normalizeNickname(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

export function checkNickname(raw: string): NicknameCheck {
  const value = normalizeNickname(raw);
  if (!value) return { ok: false, reason: 'empty' };
  if (Array.from(value).length > TV_NICKNAME_MAX) return { ok: false, reason: 'too-long' };
  if (!NICKNAME_PATTERN.test(value)) return { ok: false, reason: 'charset' };
  return { ok: true, value };
}
