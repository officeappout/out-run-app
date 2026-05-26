#!/usr/bin/env npx tsx
/**
 * clean-hash-domains.ts
 *
 * One-time cleanup: removes stale hash-keyed entries from progression.domains
 * and progression.tracks for all users.
 *
 * Background
 * ──────────
 * The admin panel previously wrote progression.domains using Firestore document
 * IDs (hashes like "JCac76p48XGZ5MVahLI2") as keys.  The progression engine
 * writes using semantic slug keys ("full_body", "push", "pull", …).  These
 * coexist as different map keys in the same Firestore map, causing StatsOverview
 * to pick up the wrong program when activePrograms is empty.
 *
 * What this script does
 * ─────────────────────
 * For every user document, it inspects progression.domains and progression.tracks.
 * Any key that looks like a Firestore hash (length > 15, no underscores) is
 * removed using FieldValue.delete().  Slug-keyed entries are left untouched.
 *
 * Usage
 * ─────
 *   npx tsx scripts/clean-hash-domains.ts --dry-run   # preview only
 *   npx tsx scripts/clean-hash-domains.ts             # execute writes
 *
 * Credentials are read from .env.local:
 *   FIREBASE_ADMIN_EMAIL    — e.g. david@appout.co.il
 *   FIREBASE_ADMIN_PASSWORD — admin password
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
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  updateDoc,
  deleteField,
} from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';

const firebaseConfig = {
  apiKey:            'AIzaSyCezG55zVQEZWCEs-lHzx_yQldg-Ej2X60',
  authDomain:        'appout-1.firebaseapp.com',
  projectId:         'appout-1',
  storageBucket:     'appout-1.firebasestorage.app',
  messagingSenderId: '371293978848',
  appId:             '1:371293978848:web:51fd36f9cbf4de5e2c28d9',
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db  = getFirestore(app);
const auth = getAuth(app);

const DRY_RUN = process.argv.includes('--dry-run');

/** Returns true when a map key looks like a Firestore auto-generated hash ID. */
function isHashKey(key: string): boolean {
  return key.length > 15 && !key.includes('_');
}

async function main() {
  const email    = process.env.FIREBASE_ADMIN_EMAIL;
  const password = process.env.FIREBASE_ADMIN_PASSWORD;

  if (!email || !password) {
    console.error('Missing FIREBASE_ADMIN_EMAIL or FIREBASE_ADMIN_PASSWORD in .env.local');
    process.exit(1);
  }

  console.log(`Signing in as ${email}…`);
  await signInWithEmailAndPassword(auth, email, password);
  console.log('Signed in.\n');

  if (DRY_RUN) {
    console.log('=== DRY RUN — no writes will be made ===\n');
  }

  const usersSnap = await getDocs(collection(db, 'users'));
  console.log(`Found ${usersSnap.size} user documents.\n`);

  let totalUsersPatched = 0;
  let totalKeysRemoved  = 0;

  for (const userDoc of usersSnap.docs) {
    const data = userDoc.data() as Record<string, any>;
    const progression = data.progression as Record<string, any> | undefined;
    if (!progression) continue;

    const domains = progression.domains as Record<string, unknown> | undefined;
    const tracks  = progression.tracks  as Record<string, unknown> | undefined;

    const updates: Record<string, unknown> = {};

    for (const key of Object.keys(domains ?? {})) {
      if (isHashKey(key)) {
        updates[`progression.domains.${key}`] = deleteField();
        totalKeysRemoved++;
      }
    }
    for (const key of Object.keys(tracks ?? {})) {
      if (isHashKey(key)) {
        updates[`progression.tracks.${key}`] = deleteField();
        totalKeysRemoved++;
      }
    }

    if (Object.keys(updates).length === 0) continue;

    const hashDomainKeys = Object.keys(updates).map(k => k.split('.').pop()).join(', ');
    console.log(`User ${userDoc.id}: removing hash keys [${hashDomainKeys}]`);

    if (!DRY_RUN) {
      await updateDoc(doc(db, 'users', userDoc.id), updates);
    }
    totalUsersPatched++;
  }

  console.log(`\n${ DRY_RUN ? '[DRY RUN] Would patch' : 'Patched' } ${totalUsersPatched} users, removed ${totalKeysRemoved} hash keys.`);

  await signOut(auth);
  console.log('Done.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
