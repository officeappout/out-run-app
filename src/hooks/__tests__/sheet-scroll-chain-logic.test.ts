import { describe, it, expect } from 'vitest';
import {
  CHAIN_FLICK_VELOCITY,
  chainOffset,
  fingerVelocity,
  nextChainAnchor,
  shouldChain,
  shouldCloseChain,
} from '../sheet-scroll-chain-logic';

describe('nextChainAnchor', () => {
  it('follows the finger while the content still scrolls', () => {
    expect(nextChainAnchor(100, 400, 250)).toBe(400);
  });
  it('freezes the anchor once the scroller is at the top', () => {
    expect(nextChainAnchor(100, 400, 0)).toBe(100);
  });
});

describe('a long scroll-up that ends at the top does not pull the sheet', () => {
  it('measures the pull from the moment scrollTop reached 0', () => {
    let anchor = 100;
    // finger travels 100 -> 500 while the content scrolls (scrollTop is read before the move applies)
    for (const [clientY, scrollTop] of [[200, 300], [350, 150], [500, 40]] as const) {
      anchor = nextChainAnchor(anchor, clientY, scrollTop);
    }
    // first move that sees scrollTop 0: the pull is only what the finger moved since
    anchor = nextChainAnchor(anchor, 510, 0);
    expect(510 - anchor).toBe(10);
    expect(chainOffset(510 - anchor, 0.65)).toBeLessThan(10);
  });
});

describe('shouldChain', () => {
  it('needs scrollTop 0 and a downward pull, unless already chaining', () => {
    expect(shouldChain(0, 5, false)).toBe(true);
    expect(shouldChain(10, 5, false)).toBe(false);
    expect(shouldChain(0, -5, false)).toBe(false);
    expect(shouldChain(10, -5, true)).toBe(true);
  });
});

describe('chainOffset', () => {
  it('applies resistance and never goes negative or NaN', () => {
    expect(chainOffset(100, 0.65)).toBeCloseTo(65);
    expect(chainOffset(-40, 0.65)).toBe(0);
    expect(chainOffset(NaN, 0.65)).toBe(0);
  });
});

describe('shouldCloseChain', () => {
  it('closes past the distance', () => {
    expect(shouldCloseChain(121, 0, 120)).toBe(true);
    expect(shouldCloseChain(119, 0, 120)).toBe(false);
  });
  it('closes on a short fast downward flick', () => {
    expect(shouldCloseChain(20, CHAIN_FLICK_VELOCITY + 1, 120)).toBe(true);
    expect(shouldCloseChain(20, CHAIN_FLICK_VELOCITY, 120)).toBe(false);
  });
  it('never closes on an upward flick', () => {
    expect(shouldCloseChain(20, -3000, 120)).toBe(false);
  });
});

describe('fingerVelocity', () => {
  it('is px/s, positive downward', () => {
    expect(fingerVelocity(0, 0, 10, 20)).toBe(500);
    expect(fingerVelocity(10, 0, 0, 20)).toBe(-500);
  });
  it('is 0 for a zero or negative interval', () => {
    expect(fingerVelocity(0, 5, 10, 5)).toBe(0);
    expect(fingerVelocity(0, 9, 10, 5)).toBe(0);
  });
});
