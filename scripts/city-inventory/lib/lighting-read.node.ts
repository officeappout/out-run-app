/**
 * The city's lighting/v1 file for the inventory's lighting layer — from a
 * local file (--lighting-file=<path>) or read-only from Storage
 * (`lighting/v1/<city>.json.gz`). Missing ⇒ null ⇒ the layer keeps the OSM
 * `lit` tag coverage. Never writes anything.
 */
import * as fs from 'fs';
import { gunzipSync } from 'zlib';
import type { App } from 'firebase-admin/app';
import { buildLitIndex, lightingObjectPath, parseLightingFile, type LightingCityFile } from '../../../src/lib/lighting';
import type { LayerSource, RunLighting } from '../../../src/lib/city-inventory';
import { bucketShadeFetcher, type ShadeBucketLike } from '../../../src/lib/shade/bucket-fetcher.node';
import { technionCityForName } from '../../../src/lib/shade/loader';

export interface LoadedLighting extends RunLighting {
  file: LightingCityFile;
  /** Source keys still waiting for written licence approval. */
  pendingKeys: string[];
}

function toRun(file: LightingCityFile): LoadedLighting {
  const sources: LayerSource[] = file.sources.map((s) => ({ key: s.key, license: s.licence, attribution: s.attribution, snapshotDate: s.snapshotDate, count: s.count }));
  return { index: buildLitIndex(file), sources, file, pendingKeys: file.sources.filter((s) => s.status === 'pending_licence').map((s) => s.key) };
}

export function loadLightingFromFile(p: string): LoadedLighting {
  const buf = fs.readFileSync(p);
  const raw = buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf) : buf;
  return toRun(parseLightingFile(JSON.parse(raw.toString('utf8'))));
}

export async function loadLightingFromStorage(app: App, projectId: string, authorityName: string, log = console.log): Promise<LoadedLighting | null> {
  const slug = technionCityForName(authorityName);
  if (!slug) return null;
  const { getStorage } = await import('firebase-admin/storage');
  const bucket = getStorage(app).bucket(`${projectId}.firebasestorage.app`) as unknown as ShadeBucketLike;
  const body = await bucketShadeFetcher(bucket)(lightingObjectPath(slug));
  if (!body) {
    log(`[lighting] ${lightingObjectPath(slug)}: not in Storage — lighting stays OSM lit-tag coverage`);
    return null;
  }
  return toRun(parseLightingFile(body));
}
