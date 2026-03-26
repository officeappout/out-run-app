'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="he" dir="rtl">
      <body>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'system-ui' }}>
          <h2 style={{ marginBottom: 16 }}>משהו השתבש</h2>
          <button
            onClick={() => reset()}
            style={{ padding: '12px 24px', borderRadius: 12, background: '#00B4FF', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer' }}
          >
            נסו שוב
          </button>
        </div>
      </body>
    </html>
  );
}
