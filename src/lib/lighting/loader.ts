/**
 * Lighting city files (`lighting/v1/<city>.json.gz`) with a per-process
 * cache. Fetcher injected (same JSON fetcher as the Technion shade:
 * shade/bucket-fetcher.node.ts). Missing / unreadable ⇒ null.
 */
import type { ShadeObjectFetcher } from '../shade/loader';
import { technionCityForName } from '../shade/loader';
import { lightingObjectPath } from './constants';
import { parseLightingFile } from './file';
import { buildLitIndex, type LitIndex } from './route-lighting';

export interface LightingLoader {
  indexFor(slug: string): Promise<LitIndex | null>;
  indexForName(name: string | null | undefined): Promise<{ city: string; index: LitIndex } | null>;
}

export function createLightingLoader(fetchObject: ShadeObjectFetcher, log: (s: string) => void = () => {}): LightingLoader {
  const cache = new Map<string, Promise<LitIndex | null>>();
  const indexFor = (slug: string) => {
    let p = cache.get(slug);
    if (!p) {
      p = (async () => {
        try {
          const body = await fetchObject(lightingObjectPath(slug));
          if (!body) return null;
          const file = parseLightingFile(body);
          log(`[lighting] ${slug}: ${file.pieces.length} pieces indexed`);
          return buildLitIndex(file);
        } catch (e) {
          log(`[lighting] ${slug}: not loaded (${(e as Error).message})`);
          return null;
        }
      })();
      cache.set(slug, p);
    }
    return p;
  };
  return {
    indexFor,
    async indexForName(name) {
      const slug = technionCityForName(name) ?? (name && /^[a-z-]+$/.test(name) ? name : null);
      if (!slug) return null;
      const index = await indexFor(slug);
      return index ? { city: slug, index } : null;
    },
  };
}
