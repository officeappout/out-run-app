import * as Sentry from '@sentry/nextjs';
import { NO_PII_DATA_COLLECTION, sentryBeforeSend, sentryEnvironment } from '@/lib/sentry-shared';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: sentryEnvironment(),
  tracesSampleRate: 0,
  dataCollection: NO_PII_DATA_COLLECTION,
  beforeSend: sentryBeforeSend,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
