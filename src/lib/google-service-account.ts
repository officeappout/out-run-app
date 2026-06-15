/**
 * google-service-account.ts
 *
 * Builds Google API clients (Gmail + Drive) using domain-wide delegation.
 * Uses JWT directly — GoogleAuth with `credentials` does NOT forward
 * `subject` for impersonation, which causes "insufficient authentication scopes".
 *
 * Credential resolution (in priority order):
 *   1. GOOGLE_SERVICE_ACCOUNT_KEY env var — base64-encoded JSON (Vercel/production)
 *   2. GMAIL_SERVICE_ACCOUNT_KEY_PATH env var — path to JSON key file (local dev)
 *
 * googleapis and google-auth-library are loaded via dynamic import() — NOT at
 * the top level. Static imports hang Next.js webpack compilation on this machine.
 *
 * ⚠️  Google Workspace Admin Console must have these scopes authorized for the SA:
 *     https://mail.google.com/  (or gmail.modify + gmail.compose)
 *     https://www.googleapis.com/auth/drive
 */
import 'server-only';

import * as fs from 'fs';
import * as path from 'path';

// Scopes requested by the CRM agent
const GMAIL_MODIFY_SCOPE  = 'https://www.googleapis.com/auth/gmail.modify';   // read + labels + drafts
const GMAIL_COMPOSE_SCOPE = 'https://www.googleapis.com/auth/gmail.compose';  // draft creation
const DRIVE_SCOPE         = 'https://www.googleapis.com/auth/drive';

const GMAIL_SCOPES    = [GMAIL_MODIFY_SCOPE, GMAIL_COMPOSE_SCOPE];
const DRIVE_SCOPES    = [DRIVE_SCOPE];
const COMBINED_SCOPES = [GMAIL_MODIFY_SCOPE, GMAIL_COMPOSE_SCOPE, DRIVE_SCOPE];

// ─── Key resolution ──────────────────────────────────────────────────────────

interface SAKey {
  client_email: string;
  private_key: string;
}

function resolveKey(): SAKey {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (b64) {
    return JSON.parse(Buffer.from(b64, 'base64').toString('utf8')) as SAKey;
  }

  const rel = process.env.GMAIL_SERVICE_ACCOUNT_KEY_PATH;
  if (rel) {
    return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8')) as SAKey;
  }

  throw new Error(
    'No service-account credentials. ' +
    'Set GOOGLE_SERVICE_ACCOUNT_KEY (base64 JSON) in production, ' +
    'or GMAIL_SERVICE_ACCOUNT_KEY_PATH for local dev.'
  );
}

// ─── JWT factory — explicit subject + scopes for domain-wide delegation ───────

async function makeJWT(scopes: string[], subject: string) {
  const { JWT } = await import('google-auth-library');
  const { client_email, private_key } = resolveKey();
  return new JWT({ email: client_email, key: private_key, scopes, subject });
}

// ─── Client factories ─────────────────────────────────────────────────────────

export async function getGmailClient(subjectEmail: string) {
  const { google } = await import('googleapis');
  return google.gmail({ version: 'v1', auth: await makeJWT(GMAIL_SCOPES, subjectEmail) });
}

export async function getDriveClient(subjectEmail: string) {
  const { google } = await import('googleapis');
  return google.drive({ version: 'v3', auth: await makeJWT(DRIVE_SCOPES, subjectEmail) });
}

/** Combined Gmail+Drive client (CRM agent: read Gmail + label + draft + write Drive) */
export async function getCombinedClient(subjectEmail: string) {
  const { google } = await import('googleapis');
  const auth = await makeJWT(COMBINED_SCOPES, subjectEmail);
  return {
    gmail: google.gmail({ version: 'v1', auth }),
    drive: google.drive({ version: 'v3', auth }),
  };
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const PRIMARY_MAILBOX   = 'david@appout.co.il';
export const SECONDARY_MAILBOX = 'office@appout.co.il';
export const TERTIARY_MAILBOX  = 'matan.danan@appout.co.il';
export const ALL_MAILBOXES     = [PRIMARY_MAILBOX, SECONDARY_MAILBOX, TERTIARY_MAILBOX] as const;

export const AUTHORITIES_ROOT_FOLDER_ID  = '1buQ0KkzWl2007iHFzaO3sDsgZpVW4E3t';
export const TRANSCRIPTS_INBOX_FOLDER_ID = process.env.TRANSCRIPTS_INBOX_FOLDER_ID ?? '';
