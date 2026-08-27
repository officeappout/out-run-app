import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// Pins the fix in complete-profile/route.ts: every field on users/{uid} is now
// decided independently — "always overwrite with what was just submitted" for
// core.name/gender/birthDate/ageGroup, "fill only if missing, never overwrite"
// for onboarding-progress metadata and the access-control/personalization
// defaults — instead of one binary new-vs-returning branch keyed off a single
// field's presence. Regression-proofs both directions of the bug that binary
// branch had:
//   - a returning user's core.affiliations/accessLevel must never be reset,
//     even when the client still sends the (now-ignored) isNewUser:true
//   - a genuinely new user whose doc was pre-seeded by a DIFFERENT writer
//     (e.g. /api/challenge/join, which sets core.name+gender but not
//     birthDate or onboardingStatus) must still get the missing scaffold
//
// No existing test touched this file before. Mocks the Admin SDK by hand,
// matching the onboarding-sync.service.test.ts convention (vi.hoisted
// mutable state + inline vi.mock factories) — there's no shared Firestore
// test-utils helper anywhere in this repo.

const state = vi.hoisted(() => ({
  EXISTING_DOC: undefined as Record<string, any> | undefined,
  writes: [] as Array<{ collection: string; data: Record<string, any> }>,
}));

vi.mock('server-only', () => ({}));

vi.mock('@/lib/firebase-admin', () => ({
  getAdminAuth: () => ({
    verifyIdToken: vi.fn(async () => ({ uid: 'test-uid' })),
  }),
  getAdminDb: () => ({
    collection: (collectionName: string) => ({
      doc: (_id: string) => ({
        __collection: collectionName,
        get: async () => ({
          exists: state.EXISTING_DOC !== undefined,
          data: () => state.EXISTING_DOC,
        }),
      }),
    }),
    batch: () => ({
      set: (ref: { __collection: string }, data: Record<string, any>) => {
        state.writes.push({ collection: ref.__collection, data });
      },
      commit: vi.fn(async () => undefined),
    }),
  }),
}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => 'SERVER_TS' },
}));

import { POST } from '../route';

function fakeRequest(body: Record<string, unknown>): NextRequest {
  return {
    headers: { get: (key: string) => (key === 'Authorization' ? 'Bearer faketoken' : null) },
    json: async () => body,
  } as unknown as NextRequest;
}

// A valid adult DOB — irrelevant to which branch fires, just needs to clear
// the >=14 age gate.
const VALID_DOB = { birthDay: 15, birthMonth: 5, birthYear: 1990 };

function usersWrite() {
  const write = state.writes.find((w) => w.collection === 'users');
  if (!write) throw new Error('no write to users collection was recorded');
  return write.data;
}

beforeEach(() => {
  state.EXISTING_DOC = undefined;
  state.writes = [];
});

describe('POST /api/user/complete-profile', () => {
  it('empty doc → full scaffold is written', async () => {
    state.EXISTING_DOC = undefined;

    const res = await POST(fakeRequest({ name: 'Dana', gender: 'female', ...VALID_DOB }));
    expect(res.status).toBe(200);

    const data = usersWrite();
    expect(data.onboardingPath).toBe('FULL_PROGRAM');
    expect(data.onboardingStatus).toBe('IN_PROGRESS');
    expect(data.onboardingStep).toBe('IDENTITY');
    expect(data.onboardingProgress).toBe(0);
    expect(data.core.name).toBe('Dana');
    expect(data.core.gender).toBe('female');
    expect(data.core.accessLevel).toBe(1);
    expect(data.core.affiliations).toEqual([]);
    expect(data.core.unlockedProgramIds).toEqual([]);
    expect(data.core.weight).toBe(0);
    expect(data.core.initialFitnessTier).toBe(1);
    expect(data.core.trackingMode).toBe('wellness');
    expect(data.core.mainGoal).toBe('healthy_lifestyle');
    expect(data.core.isVerified).toBe(false);
    // Doc didn't exist — createdAt must be set.
    expect(data.createdAt).toBe('SERVER_TS');
  });

  it('challenge-booth-shaped doc (name+gender, no birthDate/onboardingStatus) → scaffold is still written', async () => {
    // Exact shape written by /api/challenge/join/route.ts:69-80.
    state.EXISTING_DOC = {
      core: { name: 'Booth User', gender: 'female', ageGroup: 'adult', isAnonymous: true },
    };

    const res = await POST(fakeRequest({ name: 'Booth User', gender: 'female', ...VALID_DOB }));
    expect(res.status).toBe(200);

    const data = usersWrite();
    // Identity was NOT fully known (birthDate was missing) — the scaffold
    // must still get built, not skipped because core.name already existed.
    expect(data.onboardingPath).toBe('FULL_PROGRAM');
    expect(data.onboardingStatus).toBe('IN_PROGRESS');
    expect(data.onboardingStep).toBe('IDENTITY');
    expect(data.onboardingProgress).toBe(0);
    expect(data.core.name).toBe('Booth User');
    expect(data.core.birthDate).toBeInstanceOf(Date);
    expect(data.core.accessLevel).toBe(1);
    expect(data.core.affiliations).toEqual([]);
    // Doc already existed (from the challenge-join write) — createdAt must
    // NOT be reset.
    expect(data.createdAt).toBeUndefined();
  });

  it('full existing user, client still sends isNewUser:true → affiliations/accessLevel/etc. are untouched', async () => {
    state.EXISTING_DOC = {
      onboardingPath: 'FULL_PROGRAM',
      onboardingStatus: 'COMPLETED',
      onboardingStep: 'COMPLETED',
      onboardingProgress: 100,
      core: {
        name: 'David',
        gender: 'male',
        birthDate: new Date('1985-01-01'),
        ageGroup: 'adult',
        accessLevel: 3,
        affiliations: [{ type: 'city', id: 'tel-aviv' }],
        unlockedProgramIds: ['program-x'],
        weight: 80,
        initialFitnessTier: 2,
        trackingMode: 'performance',
        mainGoal: 'strength',
        isVerified: true,
      },
    };

    const res = await POST(fakeRequest({
      name: 'David', gender: 'male', ...VALID_DOB,
      // The client hasn't been changed by this fix — it may still send this.
      // The server must now ignore it entirely.
      isNewUser: true,
    }));
    expect(res.status).toBe(200);

    const data = usersWrite();
    // Identity was already fully known — the onboarding-progress scaffold
    // must NOT be touched (that's the original bug: onboardingStatus was
    // being reset to IN_PROGRESS for a returning user).
    expect(data.onboardingPath).toBeUndefined();
    expect(data.onboardingStatus).toBeUndefined();
    expect(data.onboardingStep).toBeUndefined();
    expect(data.onboardingProgress).toBeUndefined();
    // Access-control / personalization fields must be entirely absent from
    // the write payload — merge:true means "absent" is what protects them,
    // not a value that happens to match.
    expect(data.core).not.toHaveProperty('accessLevel');
    expect(data.core).not.toHaveProperty('affiliations');
    expect(data.core).not.toHaveProperty('unlockedProgramIds');
    expect(data.core).not.toHaveProperty('weight');
    expect(data.core).not.toHaveProperty('initialFitnessTier');
    expect(data.core).not.toHaveProperty('trackingMode');
    expect(data.core).not.toHaveProperty('mainGoal');
    expect(data.core).not.toHaveProperty('isVerified');
    // The identity fields themselves are still refreshed from this request.
    expect(data.core.name).toBe('David');
    expect(data.core.gender).toBe('male');
    expect(data.createdAt).toBeUndefined();
  });
});
