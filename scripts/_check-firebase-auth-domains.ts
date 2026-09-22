/**
 * READ-ONLY check: is the Vercel preview domain in Firebase Auth's
 * "Authorized domains" list? Uses the Identity Toolkit Admin API's config
 * endpoint (GET only — no write call made anywhere in this script).
 * Run: npx tsx scripts/_check-firebase-auth-domains.ts
 */
import * as dotenv from 'dotenv'; dotenv.config({ path: '.env.local' }); dotenv.config();
import { JWT } from 'google-auth-library';

async function main() {
  const creds = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  const client = new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  const { token } = await client.getAccessToken();
  if (!token) throw new Error('no access token obtained');

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/admin/v2/projects/${creds.project_id}/config`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    console.error(`❌ Identity Toolkit config fetch failed: ${res.status} ${res.statusText}`);
    console.error(await res.text());
    process.exitCode = 1;
    return;
  }
  const data = await res.json();
  const domains: string[] = data.authorizedDomains ?? [];
  console.log(`Project: ${creds.project_id}`);
  console.log(`Authorized domains (${domains.length}):`);
  for (const d of domains) console.log(`  - ${d}`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
