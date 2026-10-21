/**
 * Process-wide hourly-shade and lighting loaders for API routes (warm
 * serverless instances reuse each city's index). Read-only, Admin SDK:
 * gs://<project>.firebasestorage.app/shade/hourly/v1 and lighting/v1 —
 * private objects, no storage.rules change.
 */
import 'server-only';
import { getApps } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { getAdminDb } from '@/lib/firebase-admin';
import { createHourlyShadeLoader, type HourlyShadeLoader } from '@/lib/shade-hourly/loader';
import { bucketBytesFetcher } from '@/lib/shade-hourly/bucket-fetcher.node';
import { createLightingLoader, type LightingLoader } from '@/lib/lighting/loader';
import { bucketShadeFetcher } from '@/lib/shade/bucket-fetcher.node';

let hourly: HourlyShadeLoader | null = null;
let lighting: LightingLoader | null = null;

function bucket() {
  getAdminDb(); // initialises the default Admin app
  const app = getApps()[0];
  const projectId = app?.options?.projectId ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'appout-1';
  return getStorage(app).bucket(`${projectId}.firebasestorage.app`);
}

export function getServerHourlyShadeLoader(): HourlyShadeLoader {
  if (!hourly) hourly = createHourlyShadeLoader(bucketBytesFetcher(bucket()), (s) => console.log(s));
  return hourly;
}

export function getServerLightingLoader(): LightingLoader {
  if (!lighting) lighting = createLightingLoader(bucketShadeFetcher(bucket()), (s) => console.log(s));
  return lighting;
}
