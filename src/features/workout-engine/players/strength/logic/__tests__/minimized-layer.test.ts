import { describe, it, expect } from 'vitest';
import { keepActiveMounted } from '../minimized-layer';

describe('keepActiveMounted (pilot M20)', () => {
  it('never unmounts the active view; hides it while minimized', () => {
    expect(keepActiveMounted(true)).toEqual({ mounted: true, className: 'hidden' });
    expect(keepActiveMounted(false).mounted).toBe(true);
    expect(keepActiveMounted(false).className).toContain('h-full');
  });
});
