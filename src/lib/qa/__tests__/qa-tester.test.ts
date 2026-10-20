import { describe, it, expect } from 'vitest';
import { checkQaSigninToken, decodeJwtPayload, isQaTesterIdentity, tokenFromHash } from '../qa-tester';

const b64u = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (payload: unknown) => `${b64u({ alg: 'RS256' })}.${b64u(payload)}.sig`;
const ON = { enable_demo_users: true, enable_ai_testers: true };
const NOW = 1_800_000_000;
const good = { uid: 'demo_qa_walker58', claims: { demo: true, qa: true, run: 'r1' }, exp: NOW + 3600 };

describe('checkQaSigninToken', () => {
  it('accepts a tester token while both switches are on', () => {
    expect(checkQaSigninToken(jwt(good), ON, NOW)).toEqual({ ok: true, uid: 'demo_qa_walker58' });
  });
  it('refuses a real or seeded uid even with the claims', () => {
    expect(checkQaSigninToken(jwt({ ...good, uid: 'abc123' }), ON, NOW)).toEqual({ ok: false, reason: 'not_tester' });
    expect(checkQaSigninToken(jwt({ ...good, uid: 'demo_tlv01' }), ON, NOW)).toEqual({ ok: false, reason: 'not_tester' });
  });
  it('refuses a tester uid without the qa + demo claims', () => {
    expect(checkQaSigninToken(jwt({ ...good, claims: { demo: true } }), ON, NOW)).toEqual({ ok: false, reason: 'not_tester' });
    expect(checkQaSigninToken(jwt({ ...good, claims: undefined }), ON, NOW)).toEqual({ ok: false, reason: 'not_tester' });
  });
  it('refuses while a switch is off', () => {
    expect(checkQaSigninToken(jwt(good), { enable_demo_users: true }, NOW)).toEqual({ ok: false, reason: 'switch_off' });
    expect(checkQaSigninToken(jwt(good), null, NOW)).toEqual({ ok: false, reason: 'switch_off' });
  });
  it('refuses missing, malformed and expired tokens', () => {
    expect(checkQaSigninToken(null, ON, NOW)).toEqual({ ok: false, reason: 'no_token' });
    expect(checkQaSigninToken('nope', ON, NOW)).toEqual({ ok: false, reason: 'malformed' });
    expect(checkQaSigninToken(jwt({ ...good, exp: NOW - 1 }), ON, NOW)).toEqual({ ok: false, reason: 'expired' });
  });
});

describe('helpers', () => {
  it('reads the token from the fragment only', () => {
    expect(tokenFromHash('#t=a.b.c')).toBe('a.b.c');
    expect(tokenFromHash('')).toBeNull();
    expect(tokenFromHash('#t=<script>')).toBeNull();
  });
  it('decodes payloads, null on junk', () => {
    expect(decodeJwtPayload(jwt({ a: 1 }))).toEqual({ a: 1 });
    expect(decodeJwtPayload('a.b')).toBeNull();
    expect(decodeJwtPayload(`x.${Buffer.from('[1]').toString('base64url')}.y`)).toBeNull();
  });
  it('identity needs uid + both claims', () => {
    expect(isQaTesterIdentity('demo_qa_abc', { qa: true, demo: true })).toBe(true);
    expect(isQaTesterIdentity('demo_qa_abc', { qa: true })).toBe(false);
    expect(isQaTesterIdentity('user1', { qa: true, demo: true })).toBe(false);
  });
});
