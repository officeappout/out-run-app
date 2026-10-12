import * as Sentry from '@sentry/nextjs';
import { NO_PII_DATA_COLLECTION, sentryBeforeSend, sentryEnvironment } from '@/lib/sentry-shared';

// No NEXT_RUNTIME branch needed: Next.js bundles this file once per runtime
// (node, edge), and @sentry/nextjs's package.json `exports` map resolves
// `@sentry/nextjs` to a different build per bundle target — the same
// `Sentry.init` call below already initializes the right one.
export async function register() {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: sentryEnvironment(),
    tracesSampleRate: 0,
    dataCollection: NO_PII_DATA_COLLECTION,
    beforeSend: sentryBeforeSend,
  });
}

export const onRequestError = Sentry.captureRequestError;
