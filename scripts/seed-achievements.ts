#!/usr/bin/env npx tsx
/**
 * seed-achievements.ts
 *
 * Seeds the Firestore `achievements` collection using the Firebase Web SDK
 * (same SDK the app uses) — no service account required.
 *
 * Authentication: signs in as the root admin via email/password.
 * The Firestore rules grant full write access to david@appout.co.il
 * via the `isRootAdmin()` helper, so no elevated SDK token is needed.
 *
 * Credentials are read from .env.local (or environment variables):
 *   FIREBASE_ADMIN_EMAIL    — e.g. david@appout.co.il
 *   FIREBASE_ADMIN_PASSWORD — admin password
 *
 * Usage
 * ─────
 *   npx tsx scripts/seed-achievements.ts --dry-run    # preview (no writes)
 *   npx tsx scripts/seed-achievements.ts              # execute
 *
 * Idempotent: uses setDoc with merge:true, so re-running is safe.
 */

// Load .env.local before anything else so credentials are available.
// We parse it inline — no dotenv dependency required.
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const envPath = resolve(__dirname, '../.env.local');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (key && !(key in process.env)) process.env[key] = val;
  }
}

import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { ACHIEVEMENT_DEFINITIONS } from '../src/features/user/progression/config/achievement-definitions';

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const firebaseConfig = {
  apiKey:            'AIzaSyCezG55zVQEZWCEs-lHzx_yQldg-Ej2X60',
  authDomain:        'appout-1.firebaseapp.com',
  projectId:         'appout-1',
  storageBucket:     'appout-1.firebasestorage.app',
  messagingSenderId: '371293978848',
  appId:             '1:371293978848:web:c5281b7834ecd5398b1085',
};

const DRY_RUN = process.argv.includes('--dry-run');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getCredentials(): { email: string; password: string } {
  // Priority: CLI flags > env vars from .env.local
  const args = process.argv.slice(2);
  const flagEmail    = args.find((a) => a.startsWith('--email='))?.split('=')[1];
  const flagPassword = args.find((a) => a.startsWith('--password='))?.split('=')[1];

  const email    = flagEmail    ?? process.env.FIREBASE_ADMIN_EMAIL?.trim();
  const password = flagPassword ?? process.env.FIREBASE_ADMIN_PASSWORD?.trim();

  if (!email || !password) {
    console.error(
      '❌  Missing credentials.\n\n' +
      '    Option A — pass as CLI flags:\n' +
      '      npx tsx scripts/seed-achievements.ts --email=david@appout.co.il --password=YOUR_PASS\n\n' +
      '    Option B — set in .env.local:\n' +
      '      FIREBASE_ADMIN_EMAIL=david@appout.co.il\n' +
      '      FIREBASE_ADMIN_PASSWORD=YOUR_PASS',
    );
    process.exit(1);
  }

  return { email, password };
}

// ─────────────────────────────────────────────────────────────────────────────
// Seed
// ─────────────────────────────────────────────────────────────────────────────

async function seed() {
  const { email, password } = getCredentials();

  // Init Firebase Web SDK
  const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  const auth = getAuth(app);
  const db   = getFirestore(app);

  console.log(`\n🔐 Signing in as ${email}…`);
  try {
    await signInWithEmailAndPassword(auth, email, password);
    console.log('   ✅ Signed in.\n');
  } catch (e: any) {
    const msg = e.message ?? String(e);
    console.error('❌  Sign-in failed:', msg);
    if (msg.includes('invalid-credential') || msg.includes('wrong-password') || msg.includes('user-not-found')) {
      console.error(
        '\n   💡 The password in .env.local may be outdated.\n' +
        '   Pass the correct password directly:\n' +
        '      npx tsx scripts/seed-achievements.ts --email=david@appout.co.il --password=YOUR_REAL_PASS\n',
      );
    }
    process.exit(1);
  }

  console.log(`🏆 Seeding ${ACHIEVEMENT_DEFINITIONS.length} achievements…`);
  if (DRY_RUN) console.log('   ⚠️  DRY RUN — no writes will be executed.\n');

  let written = 0;

  for (const def of ACHIEVEMENT_DEFINITIONS) {
    // Strip the client-only `emoji` field from Firestore docs.
    // All other fields are stored so admins can update iconUrl via console.
    const payload: Record<string, unknown> = {
      id:             def.id,
      name_he:        def.name_he,
      description_he: def.description_he,
      category:       def.category,
      type:           def.type,
      iconUrl:        def.iconUrl,
    };

    if (def.type === 'one_time') {
      if (def.condition) payload.condition = def.condition;
      payload.xp = def.xp ?? 0;
    } else if (def.type === 'tiered' && def.tiers) {
      payload.tiers = def.tiers;
    }

    if (DRY_RUN) {
      console.log(`   📝 [DRY] achievements/${def.id}`);
      console.log(`      ${JSON.stringify(payload, null, 2).replace(/\n/g, '\n      ')}`);
    } else {
      try {
        await setDoc(doc(db, 'achievements', def.id), payload, { merge: true });
        console.log(`   ✅ achievements/${def.id}`);
        written++;
      } catch (e: any) {
        console.error(`   ❌ Failed to write achievements/${def.id}:`, e.message ?? e);
      }
    }
  }

  await signOut(auth);

  if (DRY_RUN) {
    console.log(`\n🔍 Dry-run complete — ${ACHIEVEMENT_DEFINITIONS.length} docs previewed (nothing written).`);
  } else {
    console.log(`\n✅ Done — ${written}/${ACHIEVEMENT_DEFINITIONS.length} achievements seeded to Firestore.`);
  }
}

seed().catch((err) => {
  console.error('❌  Seed failed:', err);
  process.exit(1);
});
