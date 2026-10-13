import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { mintFeedToken, verifyFeedToken, isFeedTokenConfigured } from '../calendar-feed-token';

const SECRET = 'a'.repeat(32) + 'synthetic-test-secret';
const OTHER_SECRET = 'b'.repeat(40);
const UID = 'synthUser1234567890abcdefghij';

let saved: string | undefined;
beforeEach(() => {
  saved = process.env.CALENDAR_FEED_SECRET;
  process.env.CALENDAR_FEED_SECRET = SECRET;
});
afterEach(() => {
  if (saved === undefined) delete process.env.CALENDAR_FEED_SECRET;
  else process.env.CALENDAR_FEED_SECRET = saved;
});

describe('calendar-feed-token', () => {
  it('round-trips: mint then verify returns the uid', () => {
    const token = mintFeedToken(UID);
    expect(token).toMatch(new RegExp(`^${UID}\\.[A-Za-z0-9_-]{43}$`));
    expect(verifyFeedToken(token!)).toBe(UID);
  });

  it('mints deterministically for the same uid and secret', () => {
    expect(mintFeedToken(UID)).toBe(mintFeedToken(UID));
  });

  it('rejects a tampered MAC (last char flipped)', () => {
    const token = mintFeedToken(UID)!;
    const flipped = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A');
    expect(verifyFeedToken(flipped)).toBeNull();
  });

  it('rejects a swapped uid with the original MAC', () => {
    const mac = mintFeedToken(UID)!.split('.')[1];
    expect(verifyFeedToken(`otherUser1234567890.${mac}`)).toBeNull();
  });

  it('rejects an old v0 token (MAC over the bare uid, no version prefix)', () => {
    const v0 = createHmac('sha256', SECRET).update(UID).digest('base64url');
    expect(verifyFeedToken(`${UID}.${v0}`)).toBeNull();
  });

  it('rejects a token minted under a different secret', () => {
    const token = mintFeedToken(UID)!;
    process.env.CALENDAR_FEED_SECRET = OTHER_SECRET;
    expect(verifyFeedToken(token)).toBeNull();
  });

  it.each([
    ['empty', ''],
    ['no dot', UID],
    ['leading dot', `.${'A'.repeat(43)}`],
    ['empty mac', `${UID}.`],
    ['short mac', `${UID}.abc`],
    ['long mac', `${UID}.${'A'.repeat(44)}`],
    ['uid too short', `abc.${'A'.repeat(43)}`],
    ['uid has bad chars', `bad/uid/12345.${'A'.repeat(43)}`],
    ['uid has a dot', `a.b.cdefgh.${'A'.repeat(43)}`],
  ])('rejects malformed token: %s', (_label, token) => {
    expect(verifyFeedToken(token)).toBeNull();
  });

  it('splits on the LAST dot (uid containing a dot never verifies)', () => {
    const token = mintFeedToken(UID)!;
    expect(verifyFeedToken(`x.${token}`)).toBeNull();
  });

  it('refuses to mint for a malformed uid', () => {
    expect(mintFeedToken('short')).toBeNull();
    expect(mintFeedToken('has space in it')).toBeNull();
    expect(mintFeedToken('a'.repeat(129))).toBeNull();
    expect(mintFeedToken('')).toBeNull();
  });

  describe('fails closed on missing/short secret', () => {
    it('missing secret', () => {
      const token = mintFeedToken(UID)!;
      delete process.env.CALENDAR_FEED_SECRET;
      expect(isFeedTokenConfigured()).toBe(false);
      expect(mintFeedToken(UID)).toBeNull();
      expect(verifyFeedToken(token)).toBeNull();
    });

    it('empty secret', () => {
      process.env.CALENDAR_FEED_SECRET = '';
      expect(isFeedTokenConfigured()).toBe(false);
      expect(mintFeedToken(UID)).toBeNull();
    });

    it('secret shorter than 32 bytes', () => {
      process.env.CALENDAR_FEED_SECRET = 'x'.repeat(31);
      expect(isFeedTokenConfigured()).toBe(false);
      expect(mintFeedToken(UID)).toBeNull();
      expect(verifyFeedToken(`${UID}.${'A'.repeat(43)}`)).toBeNull();
    });

    it('exactly 32 bytes is accepted', () => {
      process.env.CALENDAR_FEED_SECRET = 'x'.repeat(32);
      expect(isFeedTokenConfigured()).toBe(true);
      expect(verifyFeedToken(mintFeedToken(UID)!)).toBe(UID);
    });
  });
});
