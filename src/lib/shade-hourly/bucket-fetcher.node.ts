/**
 * Node-only BytesFetcher over a Firebase Admin Storage bucket. Gunzips when
 * the gzip magic bytes are present (the hourly files are stored as plain
 * .bin.gz, no contentEncoding). Scripts and server routes only.
 */
import { gunzipSync } from 'zlib';
import type { BytesFetcher } from './loader';

export interface BytesBucketLike {
  file(path: string): { exists(): Promise<[boolean]>; download(): Promise<[Buffer]> };
}

export function bucketBytesFetcher(bucket: BytesBucketLike): BytesFetcher {
  return async (objectPath) => {
    const f = bucket.file(objectPath);
    const [exists] = await f.exists();
    if (!exists) return null;
    const [buf] = await f.download();
    const raw = buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf) : buf;
    return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  };
}
