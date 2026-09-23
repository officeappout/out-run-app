#!/usr/bin/env npx tsx
/**
 * scripts/backup-users-collection.ts
 *
 * Full read-only export of the production `users` collection to a local,
 * gitignored JSON file (scripts/_backups/ — see .gitignore), taken before
 * the test-account marking run (Stage 2 of the test-account identification
 * task). Read-only against Firestore: the only write anywhere in this
 * script is the local file at the very end.
 *
 * Usage:
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/backup-users-collection.ts
 */
import * as admin from 'firebase-admin';
import * as fs from 'node:fs';
import * as path from 'node:path';

const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!rawKey) {
  console.error('FIREBASE_SERVICE_ACCOUNT_KEY not set');
  process.exit(1);
}
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(rawKey)) });
}
const db = admin.firestore();

async function main() {
  console.log('Fetching users collection (production, read-only)...');
  const snap = await db.collection('users').get();
  console.log(`${snap.size} docs fetched.`);

  const backupData = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const backupDir = path.join(__dirname, '_backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const filePath = path.join(backupDir, `users-backup-${Date.now()}.json`);
  fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2));
  fs.chmodSync(filePath, 0o600);

  console.log(`\nBackup written: ${filePath}`);
  console.log(`Docs backed up: ${backupData.length}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
