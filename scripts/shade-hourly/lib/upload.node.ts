/**
 * Upload local objects to the project's default Storage bucket — the
 * `--apply` path of the hourly shade / lighting builds. Never runs unless the
 * caller passes --apply --project <id> AND the operator types YES.
 * Storage only: no Firestore, no rules. Objects stay private (Admin SDK reads).
 * Credentials: FIREBASE_SERVICE_ACCOUNT_KEY from the main checkout's
 * .env.local; --project must equal the key's project_id.
 */
import * as readline from 'readline';

const ENV_PATH = '/Users/calisthenicsltd/Development/appout-1/.env.local';

export interface UploadObject {
  objectPath: string;
  body: Buffer;
  contentType: string;
  contentEncoding?: 'gzip';
  metadata: Record<string, string>;
}

export async function confirmYes(prompt: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => rl.question(prompt, resolve));
  rl.close();
  return answer.trim() === 'YES';
}

export async function uploadObjects(project: string, objects: UploadObject[], overwrite: boolean): Promise<void> {
  const dotenv = await import('dotenv');
  dotenv.config({ path: ENV_PATH });
  const admin = (await import('firebase-admin')).default;
  const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '{}');
  if (!key?.project_id) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY missing');
  if (key.project_id !== project) throw new Error(`--project ${project} does not match the service account's project_id (${key.project_id}) — refusing.`);
  const bucketName = `${project}.firebasestorage.app`;
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key), projectId: project, storageBucket: bucketName });
  const bucket = admin.storage().bucket(bucketName);
  for (const o of objects) {
    const file = bucket.file(o.objectPath);
    const [exists] = await file.exists();
    if (exists && !overwrite) {
      console.log(`  exists, kept (add --overwrite to replace): ${o.objectPath}`);
      continue;
    }
    await file.save(o.body, {
      resumable: false,
      contentType: o.contentType,
      metadata: {
        contentType: o.contentType,
        ...(o.contentEncoding ? { contentEncoding: o.contentEncoding } : {}),
        cacheControl: 'private, max-age=3600',
        metadata: o.metadata,
      },
    });
    console.log(`  ${exists ? 'overwrote' : 'uploaded'}: gs://${bucketName}/${o.objectPath}`);
  }
}
