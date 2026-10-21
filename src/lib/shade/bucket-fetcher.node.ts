/**
 * Node-only ShadeObjectFetcher over a Firebase Admin Storage bucket (scripts
 * and server routes; never import from client code). The city objects are
 * stored with `contentEncoding: gzip`, and `download()` may or may not have
 * decompressed them already depending on the client — gunzip only when the
 * gzip magic bytes are present.
 */
import { gunzipSync } from 'zlib';
import type { ShadeObjectFetcher } from './loader';

/** The two Bucket methods we use (structural, so tests need no firebase-admin). */
export interface ShadeBucketLike {
  file(path: string): { exists(): Promise<[boolean]>; download(): Promise<[Buffer]> };
}

export function bucketShadeFetcher(bucket: ShadeBucketLike): ShadeObjectFetcher {
  return async (objectPath) => {
    const f = bucket.file(objectPath);
    const [exists] = await f.exists();
    if (!exists) return null;
    const [buf] = await f.download();
    const raw = buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf) : buf;
    return JSON.parse(raw.toString('utf8'));
  };
}
