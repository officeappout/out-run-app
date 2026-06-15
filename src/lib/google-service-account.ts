/**
 * google-service-account.ts
 *
 * Shared factory for Google API clients (Gmail + Drive) using the
 * gmail-reader-agent service account with domain-wide delegation.
 *
 * The service account key lives at secrets/gmail-service-account.json
 * and is referenced by GMAIL_SERVICE_ACCOUNT_KEY_PATH in .env.local.
 *
 * Must only be imported by server-side code (API routes / Server Actions).
 */
/**
 * googleapis and google-auth-library are loaded via dynamic import() inside
 * each function — NOT at the top level. Static top-level imports of googleapis
 * hang on this machine during Next.js webpack compilation (the package takes
 * many seconds to initialize), which freezes the dev server at "Starting...".
 */
import 'server-only';

import * as fs from 'fs';
import * as path from 'path';

const GMAIL_SCOPE  = 'https://www.googleapis.com/auth/gmail.readonly';
const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive',
];
const COMBINED_SCOPES = [GMAIL_SCOPE, ...DRIVE_SCOPES];

function getKeyPath(): string {
  const rel = process.env.GMAIL_SERVICE_ACCOUNT_KEY_PATH;
  if (!rel) throw new Error('GMAIL_SERVICE_ACCOUNT_KEY_PATH not set');
  // Resolve relative to project root (process.cwd() in Next.js)
  return path.resolve(process.cwd(), rel);
}

export async function getGmailClient(subjectEmail: string) {
  const { google } = await import('googleapis');
  const { GoogleAuth } = await import('google-auth-library');
  const auth = new GoogleAuth({
    keyFile: getKeyPath(),
    scopes: [GMAIL_SCOPE],
    clientOptions: { subject: subjectEmail },
  });
  return google.gmail({ version: 'v1', auth: await auth.getClient() as any });
}

export async function getDriveClient(subjectEmail: string) {
  const { google } = await import('googleapis');
  const { GoogleAuth } = await import('google-auth-library');
  const auth = new GoogleAuth({
    keyFile: getKeyPath(),
    scopes: DRIVE_SCOPES,
    clientOptions: { subject: subjectEmail },
  });
  return google.drive({ version: 'v3', auth: await auth.getClient() as any });
}

/** Drive client with both Gmail+Drive scopes (needed for backfill: read Gmail + write Drive) */
export async function getCombinedClient(subjectEmail: string) {
  const { google } = await import('googleapis');
  const { GoogleAuth } = await import('google-auth-library');
  const auth = new GoogleAuth({
    keyFile: getKeyPath(),
    scopes: COMBINED_SCOPES,
    clientOptions: { subject: subjectEmail },
  });
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
