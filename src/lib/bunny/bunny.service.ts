/**
 * Bunny.net Stream — Server-only API wrapper.
 *
 * NEVER import this module from client components. The `server-only` guard
 * below makes the build fail if it is ever bundled for the browser.
 *
 * Responsibilities:
 *   - Create video "slots" in the Bunny library (returns videoId + TUS upload URL)
 *   - Poll encoding status
 *   - Delete videos when an exercise asset is replaced or removed
 *
 * Auth:
 *   `Authorization: <BUNNY_API_KEY>` (sent on every request)
 *
 * Docs: https://docs.bunny.net/reference/video_createvideo
 */

import 'server-only';
import {
  BUNNY_API_BASE_URL,
  BUNNY_TUS_ENDPOINT,
  buildBunnyThumbnailUrl,
} from './bunny.config';

// ──────────────────────────────────────────────────────────────────────────
// Server-only env access — these are read lazily so the module loads even
// when keys are missing (Phase 5 ships before live credentials are issued).
// ──────────────────────────────────────────────────────────────────────────

function getServerConfig(): { apiKey: string; libraryId: string } {
  // .trim() defends against trailing whitespace, CR/LF, or quoted values
  // accidentally pasted into .env.local — very common cause of 401s where
  // the dashboard copy includes invisible characters.
  const apiKey    = (process.env.BUNNY_API_KEY    ?? '').trim();
  const libraryId = (process.env.BUNNY_LIBRARY_ID ?? '').trim();
  return { apiKey, libraryId };
}

/**
 * Mask an API key for safe logging — keeps first 4 + last 4 chars, hides
 * the middle. e.g. "afab2463-da1b-48c5-8cb7-fcbee48848a9" → "afab…48a9".
 * Also reports the length so you can tell at a glance if it's UUID-shaped.
 */
function maskKey(key: string): string {
  if (!key) return '<empty>';
  if (key.length <= 8) return `<${key.length}chars>`;
  return `${key.slice(0, 4)}…${key.slice(-4)} (len=${key.length})`;
}

export class BunnyConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BunnyConfigError';
  }
}

export class BunnyApiError extends Error {
  status: number;
  /** Raw response body from Bunny — preserved for diagnostic surfacing. */
  upstreamBody: string;
  /** Endpoint that was called when the error occurred. */
  endpoint: string;
  constructor(message: string, status: number, upstreamBody = '', endpoint = '') {
    super(message);
    this.name = 'BunnyApiError';
    this.status = status;
    this.upstreamBody = upstreamBody;
    this.endpoint = endpoint;
  }
}

function assertConfigured(): { apiKey: string; libraryId: string } {
  const cfg = getServerConfig();
  if (!cfg.apiKey || !cfg.libraryId) {
    throw new BunnyConfigError(
      'Bunny.net is not configured. Set BUNNY_API_KEY and BUNNY_LIBRARY_ID in .env.local.',
    );
  }
  // One-line config trace per call — helps debug 401s without leaking secrets.
  // Logs: library ID, masked key (first 4 + last 4), and key length.
  // Expected for current credentials: libraryId=640043 key=afab…48a9 (len=36).
  // eslint-disable-next-line no-console
  console.log(`[Bunny Config] libraryId=${cfg.libraryId} key=${maskKey(cfg.apiKey)}`);
  return cfg;
}

// ──────────────────────────────────────────────────────────────────────────
// Public types
// ──────────────────────────────────────────────────────────────────────────

export interface BunnyCreateVideoResult {
  videoId: string;
  /** TUS endpoint the browser should POST chunks to. */
  tusUploadUrl: string;
  /** Auth header the browser must send to TUS (signed, time-limited). */
  authorizationSignature: string;
  /** Expiration timestamp for the signature (UNIX seconds). */
  authorizationExpire: number;
  /** Library this video lives in (echoed for the client). */
  libraryId: string;
}

export type BunnyEncodingStatus =
  | 'queued'
  | 'processing'
  | 'encoding'
  | 'finished'
  | 'failed'
  | 'unknown';

export interface BunnyVideoStatus {
  videoId: string;
  status: BunnyEncodingStatus;
  /** 0–100. Reported by Bunny once encoding starts. */
  encodeProgress?: number;
  /** Seconds, available after `finished`. */
  durationSeconds?: number;
  thumbnailUrl?: string;
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

/**
 * Bunny encoding status enum (https://docs.bunny.net/reference/video_getvideo).
 *  0 = Queued, 1 = Processing, 2 = Encoding,
 *  3 = Finished, 4 = Resolution finished, 5 = Failed,
 *  6 = PresignedUploadStarted, 7 = PresignedUploadFinished
 */
function mapBunnyStatus(raw: number): BunnyEncodingStatus {
  switch (raw) {
    case 0:
      return 'queued';
    case 1:
      return 'processing';
    case 2:
      return 'encoding';
    case 3:
    case 4:
      return 'finished';
    case 5:
      return 'failed';
    case 6:
    case 7:
      return 'processing';
    default:
      return 'unknown';
  }
}

/**
 * Build the TUS authorization signature Bunny expects.
 * `sha256(libraryId + apiKey + expirationTime + videoId)` per
 * https://docs.bunny.net/reference/tus-resumable-uploads
 */
async function buildTusSignature(
  libraryId: string,
  apiKey: string,
  expirationUnix: number,
  videoId: string,
): Promise<string> {
  const message = `${libraryId}${apiKey}${expirationUnix}${videoId}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ──────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────

/**
 * Create a new video record in the Bunny library and return everything the
 * browser needs to perform a direct TUS upload.
 *
 * Two-step flow on Bunny's side:
 *   1. POST /library/{id}/videos  → returns the video GUID
 *   2. Build TUS auth signature   → browser uses it for chunked upload
 */
export async function createBunnyVideo(
  title: string,
): Promise<BunnyCreateVideoResult> {
  const { apiKey, libraryId } = assertConfigured();

  const endpoint = `POST ${BUNNY_API_BASE_URL}/library/${libraryId}/videos`;
  const res = await fetch(`${BUNNY_API_BASE_URL}/library/${libraryId}/videos`, {
    method: 'POST',
    headers: {
      AccessKey: apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ title }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    // eslint-disable-next-line no-console
    console.error(`[Bunny] ${endpoint} → ${res.status}\n  body: ${body || '<empty>'}`);
    throw new BunnyApiError(
      `createBunnyVideo failed: ${res.status} ${body}`,
      res.status,
      body,
      endpoint,
    );
  }

  const json = (await res.json()) as { guid: string };
  const videoId = json.guid;

  // Signature valid for 24h — plenty for any single upload session.
  const authorizationExpire = Math.floor(Date.now() / 1000) + 60 * 60 * 24;
  const authorizationSignature = await buildTusSignature(
    libraryId,
    apiKey,
    authorizationExpire,
    videoId,
  );

  return {
    videoId,
    tusUploadUrl: BUNNY_TUS_ENDPOINT,
    authorizationSignature,
    authorizationExpire,
    libraryId,
  };
}

/** Get the encoding status for a single video. */
export async function getBunnyVideoStatus(
  videoId: string,
): Promise<BunnyVideoStatus> {
  const { apiKey, libraryId } = assertConfigured();

  const res = await fetch(
    `${BUNNY_API_BASE_URL}/library/${libraryId}/videos/${videoId}`,
    {
      method: 'GET',
      headers: { AccessKey: apiKey, Accept: 'application/json' },
      cache: 'no-store',
    },
  );

  if (res.status === 404) {
    return { videoId, status: 'unknown' };
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const endpoint = `GET ${BUNNY_API_BASE_URL}/library/${libraryId}/videos/${videoId}`;
    // eslint-disable-next-line no-console
    console.error(`[Bunny] ${endpoint} → ${res.status}\n  body: ${body || '<empty>'}`);
    throw new BunnyApiError(
      `getBunnyVideoStatus failed: ${res.status} ${body}`,
      res.status,
      body,
      endpoint,
    );
  }

  const json = (await res.json()) as {
    status: number;
    encodeProgress?: number;
    length?: number;
  };

  const status = mapBunnyStatus(json.status);
  return {
    videoId,
    status,
    encodeProgress: json.encodeProgress,
    durationSeconds: status === 'finished' ? json.length : undefined,
    thumbnailUrl: status === 'finished' ? buildBunnyThumbnailUrl(videoId) : undefined,
  };
}

/** Hard-delete a video from the Bunny library. */
export async function deleteBunnyVideo(videoId: string): Promise<void> {
  const { apiKey, libraryId } = assertConfigured();

  const res = await fetch(
    `${BUNNY_API_BASE_URL}/library/${libraryId}/videos/${videoId}`,
    {
      method: 'DELETE',
      headers: { AccessKey: apiKey, Accept: 'application/json' },
    },
  );

  if (!res.ok && res.status !== 404) {
    const body = await res.text().catch(() => '');
    throw new BunnyApiError(
      `deleteBunnyVideo failed: ${res.status} ${body}`,
      res.status,
    );
  }
}
