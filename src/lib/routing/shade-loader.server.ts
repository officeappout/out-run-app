/**
 * Process-wide shade loader for API routes (warm serverless instances reuse
 * the per-city index). Reads gs://<project>.firebasestorage.app/shade/technion/v1
 * through the Admin SDK — the objects stay private (no storage.rules change).
 */
import 'server-only';
import { getApps } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { getAdminDb } from '@/lib/firebase-admin';
import { createShadeLoader, type ShadeLoader } from '@/lib/shade/loader';
import { bucketShadeFetcher } from '@/lib/shade/bucket-fetcher.node';

let loader: ShadeLoader | null = null;

export function getServerShadeLoader(): ShadeLoader {
  if (loader) return loader;
  getAdminDb(); // initialises the default Admin app
  const app = getApps()[0];
  const projectId = app?.options?.projectId ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'appout-1';
  const bucket = getStorage(app).bucket(`${projectId}.firebasestorage.app`);
  loader = createShadeLoader(bucketShadeFetcher(bucket), (s) => console.log(s));
  return loader;
}
