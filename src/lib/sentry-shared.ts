/**
 * Shared Sentry config — used by both `src/instrumentation-client.ts` (browser)
 * and `src/instrumentation.ts` (node + edge, via @sentry/nextjs's package.json
 * export conditions resolving `@sentry/nextjs` to a different build per runtime).
 *
 * Kept in one file on purpose: a PII scrub duplicated across client/server/edge
 * is exactly the "fixed on one side, not its mirror" bug class this repo has
 * hit before (see memory: one-sided-mirror-case-pattern) — one copy means it
 * can't drift out of sync between runtimes.
 */
import type { ErrorEvent, EventHint } from '@sentry/nextjs';

// Deploy-rollover noise, not a bug — src/app/global-error.tsx auto-reloads
// the page on exactly this pattern instead of showing an error. Single source
// of truth for the pattern list: global-error.tsx imports `isChunkLoadError`
// from here rather than keeping its own copy, so the two can't drift apart.
const CHUNK_LOAD_ERROR_PATTERNS = [
  'Loading chunk',
  'ChunkLoadError',
  'Loading CSS chunk',
  'Unexpected token',
];

export function sentryEnvironment(): string {
  return process.env.VERCEL_ENV || process.env.NODE_ENV || 'development';
}

/**
 * `sendDefaultPii` was removed in SDK v11 (confirmed against the installed
 * version — it's not in @sentry/core's Options type at all, `tsc` catches
 * any reintroduction) and replaced by `dataCollection`, whose unset default
 * is now "collect everything" — the OPPOSITE of the old unset default. This
 * is the explicit, no-PII baseline David asked for: no IP (via `userInfo`/
 * `httpHeaders`), no cookies, no request/response bodies, no query params,
 * no stack-frame local-variable values (a real PII vector — e.g. a variable
 * holding a user's email at the point an error throws).
 */
export const NO_PII_DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  stackFrameVariables: false,
  databaseQueryData: false,
  queues: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
};

export function isChunkLoadError(error: Pick<Error, 'name' | 'message'>): boolean {
  return (
    error.name === 'ChunkLoadError' ||
    CHUNK_LOAD_ERROR_PATTERNS.some((pattern) => error.message.includes(pattern))
  );
}

function isKnownNoise(message: string | undefined): boolean {
  if (!message) return false;
  return isChunkLoadError({ name: '', message });
}

/**
 * beforeSend: drop known-noise events, then scrub anything that could carry
 * PII beyond what `NO_PII_DATA_COLLECTION` already withholds — defense in
 * depth, not reliance on a single layer. David's rule (see
 * src/lib/signupFailureLog.ts): we want to know what broke, not who hit it.
 */
export function sentryBeforeSend(event: ErrorEvent, _hint: EventHint): ErrorEvent | null {
  const message = event.exception?.values?.[0]?.value ?? event.message;
  if (isKnownNoise(message)) return null;

  delete event.user;
  if (event.request) {
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.data;
    if (event.request.url) {
      event.request.url = event.request.url.split('?')[0];
    }
  }

  return event;
}
