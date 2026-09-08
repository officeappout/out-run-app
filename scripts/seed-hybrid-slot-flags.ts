#!/usr/bin/env npx tsx
/**
 * seed-hybrid-slot-flags.ts
 *
 * One-time seed for the 3 new hybrid-slot map flags on system_config/feature_flags
 * (wave 1, 08.09.2026) — enable_hybrid_slots / enable_full_park_workout /
 * enable_route_stops. These replace the compile-time constants HYBRID_SLOTS_ENABLED /
 * HYBRID_FULL_PARK_WORKOUT_ENABLED / MAP_ROUTE_STOPS_V1, all `true` in production today.
 *
 * MUST run BEFORE the code that reads these flags at runtime (useFeatureFlags.ts) is
 * deployed. useFeatureFlags already fails OPEN (defaults to `true`) for these 3 specific
 * keys when they're missing from the document, so a missed/late run does NOT hide the
 * features — but this script is what makes the document's state match reality explicitly,
 * so the admin panel (system-settings) shows the real, intentional value instead of a
 * fallback the panel can't distinguish from "not yet decided".
 *
 * Uses the Firebase Web SDK (same SDK the app uses) — no service account required.
 * Firestore rules grant `system_config/{docId}` write to isRootAdmin()/isAdmin().
 *
 * Usage
 * ─────
 *   npx tsx scripts/seed-hybrid-slot-flags.ts --dry-run    # preview (no writes)
 *   npx tsx scripts/seed-hybrid-slot-flags.ts              # execute
 *
 * Idempotent: uses setDoc with merge:true — safe to re-run, never touches any other
 * field already on the document (enable_running_programs, enable_community_feed,
 * enable_leagues, maintenance_mode).
 */

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
import { getFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';

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

const PAYLOAD = {
  enable_hybrid_slots: true,
  enable_full_park_workout: true,
  enable_route_stops: true,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getCredentials(): { email: string; password: string } {
  const args = process.argv.slice(2);
  const flagEmail    = args.find((a) => a.startsWith('--email='))?.split('=')[1];
  const flagPassword = args.find((a) => a.startsWith('--password='))?.split('=')[1];

  const email    = flagEmail    ?? process.env.FIREBASE_ADMIN_EMAIL?.trim();
  const password = flagPassword ?? process.env.FIREBASE_ADMIN_PASSWORD?.trim();

  if (!email || !password) {
    console.error(
      '❌  Missing credentials.\n\n' +
      '    Option A — pass as CLI flags:\n' +
      '      npx tsx scripts/seed-hybrid-slot-flags.ts --email=david@appout.co.il --password=YOUR_PASS\n\n' +
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
        '      npx tsx scripts/seed-hybrid-slot-flags.ts --email=david@appout.co.il --password=YOUR_REAL_PASS\n',
      );
    }
    process.exit(1);
  }

  console.log('🗺️  Seeding system_config/feature_flags with:');
  console.log(`   ${JSON.stringify(PAYLOAD, null, 2).replace(/\n/g, '\n   ')}`);

  if (DRY_RUN) {
    console.log('\n🔍 Dry-run — nothing written.');
  } else {
    await setDoc(
      doc(db, 'system_config', 'feature_flags'),
      { ...PAYLOAD, updated_at: serverTimestamp(), updated_by: 'seed-hybrid-slot-flags-script' },
      { merge: true },
    );
    console.log('\n✅ Done — system_config/feature_flags updated.');
  }

  await signOut(auth);
}

seed().catch((err) => {
  console.error('❌  Seed failed:', err);
  process.exit(1);
});
