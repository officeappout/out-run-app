import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

// readFeatureFlagOnce (G8.2) — one-shot panel-flag read for plain services; must fail CLOSED.
const state = vi.hoisted(() => ({ doc: null as Record<string, unknown> | null, throws: false }));

vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: () => ({}),
  getDoc: vi.fn(async () => {
    if (state.throws) throw new Error('offline');
    return { exists: () => state.doc !== null, data: () => state.doc ?? undefined };
  }),
}));

import { readFeatureFlagOnce } from '../feature-flag-once';
import { FLAG_DEFS } from '@/hooks/feature-flag-defs';

beforeEach(() => {
  state.doc = null;
  state.throws = false;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('readFeatureFlagOnce', () => {
  it('returns the stored value', async () => {
    state.doc = { enable_no_auto_strength_level: true };
    expect(await readFeatureFlagOnce('enable_no_auto_strength_level')).toBe(true);
  });
  it('missing doc / missing key / non-boolean / read error → the fail-closed default (false)', async () => {
    expect(await readFeatureFlagOnce('enable_no_auto_strength_level')).toBe(false);
    state.doc = {};
    expect(await readFeatureFlagOnce('enable_no_auto_strength_level')).toBe(false);
    state.doc = { enable_no_auto_strength_level: 'yes' };
    expect(await readFeatureFlagOnce('enable_no_auto_strength_level')).toBe(false);
    state.throws = true;
    expect(await readFeatureFlagOnce('enable_no_auto_strength_level')).toBe(false);
  });
});

describe('enable_no_auto_strength_level wiring', () => {
  it('fail-closed flag def, panel toggle is the one switch', () => {
    expect(FLAG_DEFS.find((d) => d.firestoreKey === 'enable_no_auto_strength_level'))
      .toMatchObject({ key: 'enableNoAutoStrengthLevel', defaultValue: false, superAdminValue: false });
  });
  it('admin card exists and says to keep it off until the summary guard lands', () => {
    const page = readFileSync(fileURLToPath(new URL('../../app/admin/system-settings/page.tsx', import.meta.url)), 'utf8');
    expect(page).toContain("key: 'enable_no_auto_strength_level'");
    expect(page).toContain('להשאיר כבוי עד שמסך הסיכום');
  });
});
