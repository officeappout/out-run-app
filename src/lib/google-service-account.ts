/**
 * google-service-account.ts
 *
 * Credential resolution (in priority order):
 *   1. GOOGLE_SERVICE_ACCOUNT_KEY env var — base64-encoded JSON (Vercel/production)
 *   2. GMAIL_SERVICE_ACCOUNT_KEY_PATH env var — path to key file (local dev)
 *
 * googleapis and google-auth-library are loaded via dynamic import() inside
 * each function — NOT at the top level. Static top-level imports hang the
 * Next.js webpack compilation on this machine.
 */
import 'server-only';

import * as path from 'path';

const GMAIL_SCOPE    = 'https://www.googleapis.com/auth/gmail.readonly';
const DRIVE_SCOPES   = ['https://www.googleapis.com/auth/drive'];
const COMBINED_SCOPES = [GMAIL_SCOPE, ...DRIVE_SCOPES];

/**
 * Returns GoogleAuth constructor options for the given scopes + impersonation subject.
 * Prefers the base64 env var (production) over a local key file (dev).
 */
function authOptions(scopes: string[], subject: string): Record<string, unknown> {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (b64) {
    const json = Buffer.from(b64, 'base64').toString('utf8');
    const credentials = JSON.parse(json);
    return { credentials, scopes, clientOptions: { subject } };
  }

  const rel = process.env.GMAIL_SERVICE_ACCOUNT_KEY_PATH;
  if (rel) {
    return { keyFile: path.resolve(process.cwd(), rel), scopes, clientOptions: { subject } };
  }

  throw new Error(
    'No service-account credentials found. ' +
    'Set GOOGLE_SERVICE_ACCOUNT_KEY (base64 JSON) in production, ' +
    'or GMAIL_SERVICE_ACCOUNT_KEY_PATH for local dev.'
  );
}

export async function getGmailClient(subjectEmail: string) {
  const { google } = await import('googleapis');
  const { GoogleAuth } = await import('google-auth-library');
  const auth = new GoogleAuth(authOptions([GMAIL_SCOPE], subjectEmail) as any);
  return google.gmail({ version: 'v1', auth: await auth.getClient() as any });
}

export async function getDriveClient(subjectEmail: string) {
  const { google } = await import('googleapis');
  const { GoogleAuth } = await import('google-auth-library');
  const auth = new GoogleAuth(authOptions(DRIVE_SCOPES, subjectEmail) as any);
  return google.drive({ version: 'v3', auth: await auth.getClient() as any });
}

/** Drive client with both Gmail+Drive scopes (needed for backfill: read Gmail + write Drive) */
export async function getCombinedClient(subjectEmail: string) {
  const { google } = await import('googleapis');
  const { GoogleAuth } = await import('google-auth-library');
  const auth = new GoogleAuth(authOptions(COMBINED_SCOPES, subjectEmail) as any);
  const client = await auth.getClient() as any;
  return {
    gmail: google.gmail({ version: 'v1', auth: client }),
    drive: google.drive({ version: 'v3', auth: client }),
  };
}

/** Mailboxes to search during backfill — all three are checked */
export const PRIMARY_MAILBOX   = 'david@appout.co.il';
export const SECONDARY_MAILBOX = 'office@appout.co.il';
export const TERTIARY_MAILBOX  = 'matan.danan@appout.co.il';

/** All mailboxes ordered by search priority */
export const ALL_MAILBOXES = [PRIMARY_MAILBOX, SECONDARY_MAILBOX, TERTIARY_MAILBOX] as const;

/** Root folder for all authority documents in the Shared Drive */
export const AUTHORITIES_ROOT_FOLDER_ID = '1buQ0KkzWl2007iHFzaO3sDsgZpVW4E3t';

/** Inbox folder where raw transcripts are dropped (set TRANSCRIPTS_INBOX_FOLDER_ID in env) */
export const TRANSCRIPTS_INBOX_FOLDER_ID = process.env.TRANSCRIPTS_INBOX_FOLDER_ID ?? '';
