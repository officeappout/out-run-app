'use client';

/**
 * Temporary admin helper — get Firebase ID token for script use.
 * DELETE THIS PAGE after the fix-authority-coordinates script has run.
 */

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { getAuth } from 'firebase/auth';

export default function GetTokenPage() {
  const [token, setToken]   = useState('');
  const [status, setStatus] = useState('');

  async function fetchToken() {
    setStatus('Loading…');
    setToken('');
    try {
      const auth    = getAuth();
      const current = auth.currentUser;
      if (!current) {
        setStatus('❌  Not signed in — open the app first and sign in as admin.');
        return;
      }
      const idToken = await current.getIdToken(true);
      setToken(idToken);
      setStatus(`✅  Token for: ${current.email}`);
    } catch (err) {
      setStatus(`❌  Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function copyToken() {
    if (!token) return;
    await navigator.clipboard.writeText(token);
    setStatus(prev => prev + '  —  Copied!');
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-card p-8 w-full max-w-2xl space-y-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Admin — Get ID Token</h1>
          <p className="text-sm text-gray-500 mt-1">
            One-time helper for{' '}
            <code className="bg-gray-100 px-1 rounded text-xs">fix-authority-coordinates.ts</code>.
            Delete this page after use.
          </p>
        </div>

        <button
          onClick={fetchToken}
          className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-white font-medium hover:bg-blue-700 transition-colors"
        >
          Get My ID Token
        </button>

        {status && (
          <p className="text-sm font-medium text-gray-700">{status}</p>
        )}

        {token && (
          <div className="space-y-2">
            <textarea
              readOnly
              value={token}
              rows={6}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 p-3 font-mono text-xs text-gray-700 resize-none focus:outline-none"
            />
            <button
              onClick={copyToken}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Copy Token
            </button>
            <p className="text-xs text-gray-400">
              Paste as <code className="bg-gray-100 px-1 rounded">FIREBASE_ID_TOKEN=…</code> in{' '}
              <code className="bg-gray-100 px-1 rounded">.env.local</code>.
              Token expires in 1 hour.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
