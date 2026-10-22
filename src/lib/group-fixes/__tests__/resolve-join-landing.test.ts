import { describe, it, expect } from 'vitest';
import { resolveJoinLanding } from '@/lib/resolveJoinLanding';

describe('resolveJoinLanding (P1-7)', () => {
  it('opens the group page by id on /home, celebration by default', () => {
    expect(resolveJoinLanding('g 1')).toBe('/home?openGroupDrawer=g%201&joined=true');
    expect(resolveJoinLanding('g1', { category: 'running' })).toBe('/home?openGroupDrawer=g1&joined=true');
  });
  it('joined:false opens the drawer directly (session / push links)', () => {
    expect(resolveJoinLanding('g1', { joined: false })).toBe('/home?openGroupDrawer=g1');
  });
});
