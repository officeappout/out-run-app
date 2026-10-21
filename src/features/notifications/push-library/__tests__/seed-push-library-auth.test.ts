/** scripts/seed-push-library.ts — works without a key file (application default credentials). */
import { describe, it, expect, vi } from 'vitest';

vi.mock('firebase-admin', () => ({
  default: {},
  apps: [],
  credential: {
    cert: (k: unknown) => ({ kind: 'cert', k }),
    applicationDefault: () => ({ kind: 'adc' }),
  },
}));

import { firebaseInitOptions } from '../../../../../scripts/seed-push-library';

describe('seed-push-library auth', () => {
  it('no FIREBASE_SERVICE_ACCOUNT_KEY → application default credentials on appout-1', () => {
    const o = firebaseInitOptions({} as NodeJS.ProcessEnv);
    expect(o.credential).toEqual({ kind: 'adc' });
    expect(o.projectId).toBe('appout-1');
    expect(firebaseInitOptions({ GOOGLE_CLOUD_PROJECT: 'p2' } as unknown as NodeJS.ProcessEnv).projectId).toBe('p2');
  });

  it('a key in the env wins', () => {
    const o = firebaseInitOptions({ FIREBASE_SERVICE_ACCOUNT_KEY: '{"project_id":"x"}' } as unknown as NodeJS.ProcessEnv);
    expect(o.credential).toEqual({ kind: 'cert', k: { project_id: 'x' } });
  });
});
