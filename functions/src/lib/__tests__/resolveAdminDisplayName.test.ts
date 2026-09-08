import { describe, it, expect } from 'vitest';
import { resolveAdminDisplayName } from '../resolveAdminDisplayName';

/**
 * SPEC-02 F-06: logAuditAction used to trust `data.adminName` straight
 * from the client — a malicious admin could act under their own real
 * (unforgeable) adminId while claiming an arbitrary adminName, e.g.
 * someone else's real name. This proves the fix: no matter what a
 * caller's payload claims, the resolved name only ever comes from the
 * caller's OWN profile (or a safe server-side fallback) — never from a
 * parameter through which a forged name could pass.
 */

function mockReader(docs: Record<string, Record<string, unknown> | undefined>) {
  return {
    doc(path: string) {
      return {
        async get() {
          const data = docs[path];
          return { exists: data !== undefined, data: () => data };
        },
      };
    },
  };
}

describe('resolveAdminDisplayName', () => {
  it("resolves the real display name from the caller's own users/{uid}.core.name", () => {
    const db = mockReader({ 'users/u1': { core: { name: 'דוד שחר' } } });
    expect(resolveAdminDisplayName(db, 'u1', 'david@appout.co.il')).resolves.toBe('דוד שחר');
  });

  it('falls back to the token email when core.name is missing', () => {
    const db = mockReader({ 'users/u1': { core: {} } });
    expect(resolveAdminDisplayName(db, 'u1', 'david@appout.co.il')).resolves.toBe('david@appout.co.il');
  });

  it('falls back to uid when there is no profile and no token email', () => {
    const db = mockReader({});
    expect(resolveAdminDisplayName(db, 'ghost-uid', undefined)).resolves.toBe('ghost-uid');
  });

  it("F-06 fix: an attacker cannot claim someone else's name — the function has no parameter through which a forged name could pass, only a uid to look up server-side", async () => {
    const db = mockReader({
      'users/attacker': { core: { name: 'Attacker Real Name' } },
      'users/victim': { core: { name: 'David Shahar' } },
    });
    // No matter what a forged `data.adminName: 'David Shahar'` request
    // payload might have claimed, resolving by the ATTACKER's own uid
    // only ever returns the attacker's own profile name.
    const result = await resolveAdminDisplayName(db, 'attacker', 'attacker@appout.co.il');
    expect(result).toBe('Attacker Real Name');
    expect(result).not.toBe('David Shahar');
  });
});
