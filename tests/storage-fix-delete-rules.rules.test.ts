/**
 * LAYER-1 STORAGE FIX — explicit delete rules (write-layer-4 audit,
 * 11.10.2026). storage.rules only. NO DEPLOY — separate deploy David
 * runs himself (`firebase deploy --only storage`).
 *
 * Confirmed empirically (real Storage emulator, real upload then
 * deleteObject, BEFORE this fix) that none of profiles/contribution-photos/
 * health-declarations/communities ever actually permitted an owner to
 * delete their own file — every owner-write rule referencing
 * isImage()/isPdf()/isImageSize()/isPdfSize() reads request.resource,
 * which is null on a delete operation, so those checks evaluate false,
 * denying delete unconditionally regardless of who's asking. Confirmed
 * live impact: Step3Photo.tsx's contribution-wizard "retake photo" step
 * silently swallows this exact failure, orphaning a Storage object every
 * time a real user retakes a photo mid-wizard.
 *
 * This fix adds explicit delete rules: owner-only for profiles/
 * contribution-photos (no content-type check needed — there's no
 * request.resource to validate on delete), admin-or-owner for
 * communities (matching its existing write rule's shape), and an
 * EXPLICIT `if false` for health-declarations — preserving the 7-year
 * Legal Hold retention requirement on purpose, not by the same accident
 * that protected it before this fix.
 *
 * Deliberately one FRESH initializeTestEnvironment()+cleanup() PER test
 * case, not one shared environment for the whole file — this project's
 * own vitest.config.ts documents the Firebase Storage emulator as
 * unreliable in this environment "across two attempts", and a shared-
 * environment version of this exact file reproduced that: the first 2
 * suites (profiles, contribution-photos) passed clean, then suite 3
 * (communities) hit storage/retry-limit-exceeded and suite 4
 * (health-declarations) inherited the now-corrupted shared environment
 * and failed too. A fresh environment per case (matching the one
 * standalone probe that already worked reliably, twice, during this
 * same audit) avoids whatever connection state accumulates across many
 * sequential authenticated-context switches on one shared connection.
 *
 * Run: isolated Storage emulator on 127.0.0.1:9199 — start with:
 *   firebase emulators:start --only storage --config firebase-storage-audit.json --project appout-1-storage-audit-test
 */
import { describe, it, expect } from 'vitest';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { ref, uploadBytes, deleteObject } from 'firebase/storage';

const PROJECT_ID = 'appout-1-storage-audit-test';
const rules = readFileSync('storage.rules', 'utf8');

const IMAGE_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const PDF_BYTES = new TextEncoder().encode('%PDF-1.4\n%%EOF');

async function withFreshEnv(fn: (env: Awaited<ReturnType<typeof initializeTestEnvironment>>) => Promise<void>) {
  const env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    storage: { rules, host: '127.0.0.1', port: 9199 },
  });
  try {
    await fn(env);
  } finally {
    await env.cleanup();
  }
}

describe('storage-fix-delete-rules — profiles/{uid}', () => {
  it('[CONTROL] owner deletes their own profile photo → ALLOWED', async () => {
    await withFreshEnv(async (env) => {
      const path = 'profiles/ownerUid/avatar.jpg';
      await env.withSecurityRulesDisabled(async (ctx) => {
        await uploadBytes(ref(ctx.storage(), path), IMAGE_BYTES, { contentType: 'image/jpeg' });
      });
      const ctx = env.authenticatedContext('ownerUid');
      await assertSucceeds(deleteObject(ref(ctx.storage(), path)));
    });
  }, 30_000);

  it('[DENY] a different user tries to delete someone else\'s profile photo → DENIED', async () => {
    await withFreshEnv(async (env) => {
      const path = 'profiles/victimUid/avatar.jpg';
      await env.withSecurityRulesDisabled(async (ctx) => {
        await uploadBytes(ref(ctx.storage(), path), IMAGE_BYTES, { contentType: 'image/jpeg' });
      });
      const ctx = env.authenticatedContext('attackerUid');
      await assertFails(deleteObject(ref(ctx.storage(), path)));
    });
  }, 30_000);
});

describe('storage-fix-delete-rules — contribution-photos/{uid} (the real Step3Photo.tsx bug)', () => {
  it('[CONTROL] owner deletes their own contribution photo → ALLOWED', async () => {
    await withFreshEnv(async (env) => {
      const path = 'contribution-photos/ownerUid/123_photo.jpg';
      await env.withSecurityRulesDisabled(async (ctx) => {
        await uploadBytes(ref(ctx.storage(), path), IMAGE_BYTES, { contentType: 'image/jpeg' });
      });
      const ctx = env.authenticatedContext('ownerUid');
      await assertSucceeds(deleteObject(ref(ctx.storage(), path)));
    });
  }, 30_000);

  it('[DENY] a different user tries to delete someone else\'s contribution photo → DENIED', async () => {
    await withFreshEnv(async (env) => {
      const path = 'contribution-photos/victimUid/123_photo.jpg';
      await env.withSecurityRulesDisabled(async (ctx) => {
        await uploadBytes(ref(ctx.storage(), path), IMAGE_BYTES, { contentType: 'image/jpeg' });
      });
      const ctx = env.authenticatedContext('attackerUid');
      await assertFails(deleteObject(ref(ctx.storage(), path)));
    });
  }, 30_000);
});

describe('storage-fix-delete-rules — communities/{uid} (admin-or-owner shape)', () => {
  it('[CONTROL] owner deletes their own community image → ALLOWED', async () => {
    await withFreshEnv(async (env) => {
      const path = 'communities/ownerUid/logo.jpg';
      await env.withSecurityRulesDisabled(async (ctx) => {
        await uploadBytes(ref(ctx.storage(), path), IMAGE_BYTES, { contentType: 'image/jpeg' });
      });
      const ctx = env.authenticatedContext('ownerUid');
      await assertSucceeds(deleteObject(ref(ctx.storage(), path)));
    });
  }, 30_000);

  it('[DENY] a different user tries to delete someone else\'s community image → DENIED', async () => {
    await withFreshEnv(async (env) => {
      const path = 'communities/victimUid/logo.jpg';
      await env.withSecurityRulesDisabled(async (ctx) => {
        await uploadBytes(ref(ctx.storage(), path), IMAGE_BYTES, { contentType: 'image/jpeg' });
      });
      const ctx = env.authenticatedContext('attackerUid');
      await assertFails(deleteObject(ref(ctx.storage(), path)));
    });
  }, 30_000);
});

describe('storage-fix-delete-rules — health-declarations/{uid} (explicit deny, preserves Legal Hold retention)', () => {
  it('[DENY] the OWNER themselves tries to delete their own signed health declaration → DENIED (explicit, on purpose — 7-year Legal Hold)', async () => {
    await withFreshEnv(async (env) => {
      const path = 'health-declarations/ownerUid/declaration.pdf';
      await env.withSecurityRulesDisabled(async (ctx) => {
        await uploadBytes(ref(ctx.storage(), path), PDF_BYTES, { contentType: 'application/pdf' });
      });
      const ctx = env.authenticatedContext('ownerUid');
      await assertFails(deleteObject(ref(ctx.storage(), path)));
    });
  }, 30_000);
});
