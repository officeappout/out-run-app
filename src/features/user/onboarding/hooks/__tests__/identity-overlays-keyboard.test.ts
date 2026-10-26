import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

// Pilot M1: a `fixed` identity overlay must end at the keyboard (`kb-fit`), or with the
// keyboard controller on the form keeps its full height and the keyboard covers the field.
describe('identity overlays end at the keyboard (pilot M1)', () => {
  it.each([
    ['../useDeferredIdentity.tsx'],
    ['../../components/JITSetupModal.tsx'],
  ])('%s wraps IdentityProfileScreen in kb-fit', (file) => {
    const src = read(file);
    const at = src.indexOf('<IdentityProfileScreen');
    expect(at).toBeGreaterThan(-1);
    const wrapper = src.lastIndexOf('className="', at);
    expect(src.slice(wrapper, src.indexOf('"', wrapper + 11))).toContain('kb-fit');
  });
});
