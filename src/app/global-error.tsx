'use client';

import { useEffect } from 'react';

/**
 * Root-level error boundary for the Next.js App Router.
 *
 * ChunkLoadError / ChunkLoadError timeout: these errors happen when the
 * browser has cached an old HTML page (with old chunk hashes) but the
 * server has already moved to a new deployment (new chunk hashes). Calling
 * `reset()` just retries the same failed render — the chunk still doesn't
 * exist. The only correct recovery is a hard reload so the browser fetches
 * the new HTML and new chunks from the current deployment.
 *
 * Any other error shows the normal "try again" UI.
 */
function isChunkLoadError(error: Error): boolean {
  return (
    error.name === 'ChunkLoadError' ||
    error.message.includes('Loading chunk') ||
    error.message.includes('ChunkLoadError') ||
    error.message.includes('Loading CSS chunk') ||
    error.message.includes('Unexpected token')
  );
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (isChunkLoadError(error)) {
      // Hard-reload fetches fresh HTML + fresh chunks from the current deploy.
      // Avoid an infinite reload loop by checking a session flag.
      const key = 'chunk_error_reload';
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1');
        window.location.reload();
      }
    }
  }, [error]);

  return (
    <html lang="he" dir="rtl">
      <body>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            fontFamily: 'system-ui',
            gap: 16,
          }}
        >
          <h2 style={{ marginBottom: 8 }}>משהו השתבש</h2>
          {isChunkLoadError(error) ? (
            <p style={{ color: '#64748b', fontSize: 14, textAlign: 'center', maxWidth: 320 }}>
              גרסה חדשה של האפליקציה זמינה. רענן את הדף כדי להמשיך.
            </p>
          ) : null}
          <button
            onClick={() => {
              sessionStorage.removeItem('chunk_error_reload');
              isChunkLoadError(error) ? window.location.reload() : reset();
            }}
            style={{
              padding: '12px 24px',
              borderRadius: 12,
              background: '#00B4FF',
              color: '#fff',
              border: 'none',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {isChunkLoadError(error) ? 'רענן עמוד' : 'נסו שוב'}
          </button>
        </div>
      </body>
    </html>
  );
}
