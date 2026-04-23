'use client';

/**
 * useBunnyUploader — orchestrates the full TUS upload to Bunny.net.
 *
 * Flow:
 *   1. POST /api/admin/bunny/upload → get videoId + TUS endpoint + signature
 *   2. tus-js-client uploads chunks DIRECTLY to Bunny (no server relay)
 *   3. Poll GET /api/admin/bunny/status/{videoId} until status === 'finished'
 *   4. Resolve with the final ExternalVideo reference
 *
 * Cleanup: callers should `cancel()` the active upload on unmount.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as tus from 'tus-js-client';
import type { ExternalVideo } from '../../core/exercise.types';

export type UploadStatus =
  | 'idle'
  | 'creating'      // calling /api/admin/bunny/upload
  | 'uploading'    // TUS chunks streaming to Bunny
  | 'processing'   // Bunny encoding the video
  | 'done'
  | 'error';

export interface UploadState {
  status: UploadStatus;
  /** Upload progress (0-100). */
  progress: number;
  videoId?: string;
  errorMessage?: string;
}

interface BunnyUploadCreateResponse {
  videoId: string;
  tusUploadUrl: string;
  authorizationSignature: string;
  authorizationExpire: number;
  libraryId: string;
}

interface BunnyStatusResponse {
  videoId: string;
  status: 'queued' | 'processing' | 'encoding' | 'finished' | 'failed' | 'unknown';
  encodeProgress?: number;
  durationSeconds?: number;
  thumbnailUrl?: string;
}

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_DURATION_MS = 10 * 60 * 1000; // 10 minutes

export function useBunnyUploader() {
  const [state, setState] = useState<UploadState>({ status: 'idle', progress: 0 });
  const tusUploadRef = useRef<tus.Upload | null>(null);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  const reset = useCallback(() => {
    cancelledRef.current = false;
    setState({ status: 'idle', progress: 0 });
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    try {
      tusUploadRef.current?.abort();
    } catch {
      // ignore
    }
    tusUploadRef.current = null;
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
    setState({ status: 'idle', progress: 0 });
  }, []);

  // Cleanup on unmount.
  useEffect(() => () => cancel(), [cancel]);

  const upload = useCallback(
    async (
      file: File,
      options?: { title?: string },
    ): Promise<ExternalVideo> => {
      cancelledRef.current = false;
      setState({ status: 'creating', progress: 0 });

      // 1. Create the video slot on the server.
      const createRes = await fetch('/api/admin/bunny/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: options?.title ?? file.name,
        }),
      });

      if (!createRes.ok) {
        const body = await createRes.json().catch(() => ({}));
        const msg =
          body?.error ||
          (createRes.status === 503
            ? 'Bunny.net לא מוגדר עדיין. הוסף את מפתחות ה-API ל-.env.local.'
            : `שגיאה ביצירת הסרטון (${createRes.status})`);
        setState({ status: 'error', progress: 0, errorMessage: msg });
        throw new Error(msg);
      }

      const created = (await createRes.json()) as BunnyUploadCreateResponse;
      setState({ status: 'uploading', progress: 0, videoId: created.videoId });

      // 2. Direct TUS upload to Bunny (browser → Bunny CDN).
      await new Promise<void>((resolve, reject) => {
        const tusUpload = new tus.Upload(file, {
          endpoint: created.tusUploadUrl,
          retryDelays: [0, 3000, 5000, 10000, 20000],
          headers: {
            AuthorizationSignature: created.authorizationSignature,
            AuthorizationExpire: String(created.authorizationExpire),
            VideoId: created.videoId,
            LibraryId: created.libraryId,
          },
          metadata: {
            filetype: file.type || 'video/mp4',
            title: options?.title ?? file.name,
          },
          onError: (err) => {
            if (cancelledRef.current) return resolve();
            reject(err);
          },
          onProgress: (uploaded, total) => {
            if (cancelledRef.current) return;
            const pct = total > 0 ? Math.floor((uploaded / total) * 100) : 0;
            setState((s) => ({ ...s, status: 'uploading', progress: pct }));
          },
          onSuccess: () => resolve(),
        });
        tusUploadRef.current = tusUpload;
        tusUpload.start();
      }).catch((err) => {
        const msg = err instanceof Error ? err.message : 'TUS upload failed';
        setState({ status: 'error', progress: 0, errorMessage: msg });
        throw err;
      });

      tusUploadRef.current = null;
      if (cancelledRef.current) {
        throw new Error('Upload cancelled');
      }

      setState((s) => ({ ...s, status: 'processing', progress: 100 }));

      // 3. Poll encoding status.
      const finalStatus = await pollUntilFinished(created.videoId);

      if (cancelledRef.current) {
        throw new Error('Upload cancelled');
      }

      if (finalStatus.status !== 'finished') {
        const msg =
          finalStatus.status === 'failed'
            ? 'הקידוד נכשל ב-Bunny.net'
            : 'תם הזמן בהמתנה לקידוד הסרטון';
        setState({
          status: 'error',
          progress: 100,
          videoId: created.videoId,
          errorMessage: msg,
        });
        throw new Error(msg);
      }

      const result: ExternalVideo = {
        videoId: created.videoId,
        provider: 'bunny',
        thumbnailUrl: finalStatus.thumbnailUrl,
        durationSeconds: finalStatus.durationSeconds,
      };

      setState({
        status: 'done',
        progress: 100,
        videoId: created.videoId,
      });

      return result;
    },
    [],
  );

  /**
   * Poll Bunny status with a fixed interval until terminal state or timeout.
   * Stored in a ref-aware closure so cancel() can interrupt cleanly.
   */
  async function pollUntilFinished(videoId: string): Promise<BunnyStatusResponse> {
    const startedAt = Date.now();
    let last: BunnyStatusResponse | null = null;
    while (!cancelledRef.current && Date.now() - startedAt < POLL_MAX_DURATION_MS) {
      try {
        const res = await fetch(`/api/admin/bunny/status/${videoId}`, {
          cache: 'no-store',
        });
        if (res.ok) {
          last = (await res.json()) as BunnyStatusResponse;
          if (last.status === 'finished' || last.status === 'failed') {
            return last;
          }
        }
      } catch {
        // network blip — retry on next tick
      }
      await new Promise<void>((r) => {
        pollTimeoutRef.current = setTimeout(() => r(), POLL_INTERVAL_MS);
      });
    }
    return last ?? { videoId, status: 'unknown' };
  }

  return { state, upload, cancel, reset };
}
