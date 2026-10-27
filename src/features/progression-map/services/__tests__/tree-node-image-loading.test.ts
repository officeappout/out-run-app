import { describe, expect, it } from 'vitest';
import { isOptimizableNodeImage, isPriorityNode, PRIORITY_NODE_COUNT } from '../tree-node-image-loading';

describe('isOptimizableNodeImage', () => {
  it('accepts hosts configured in next.config remotePatterns', () => {
    expect(isOptimizableNodeImage('https://vz-b17872ab-7a7.b-cdn.net/abc/thumbnail.jpg')).toBe(true);
    expect(isOptimizableNodeImage('https://appoutimages.b-cdn.net/x.jpg')).toBe(true);
    expect(isOptimizableNodeImage('https://firebasestorage.googleapis.com/v0/b/x/o/y.jpg?alt=media')).toBe(true);
    expect(isOptimizableNodeImage('https://storage.googleapis.com/bucket/y.png')).toBe(true);
  });

  it('rejects unknown hosts (next/image would throw for them)', () => {
    expect(isOptimizableNodeImage('https://example.com/x.jpg')).toBe(false);
    expect(isOptimizableNodeImage('https://b-cdn.net.evil.com/x.jpg')).toBe(false);
    expect(isOptimizableNodeImage('http://appoutimages.b-cdn.net/x.jpg')).toBe(false);
  });

  it('rejects the local placeholder, empty and malformed values', () => {
    expect(isOptimizableNodeImage('/images/park-placeholder.svg')).toBe(false);
    expect(isOptimizableNodeImage('')).toBe(false);
    expect(isOptimizableNodeImage(null)).toBe(false);
    expect(isOptimizableNodeImage(undefined)).toBe(false);
    expect(isOptimizableNodeImage('not a url')).toBe(false);
  });
});

describe('isPriorityNode', () => {
  it('only the first visible nodes get priority', () => {
    for (let i = 0; i < PRIORITY_NODE_COUNT; i++) expect(isPriorityNode(i)).toBe(true);
    expect(isPriorityNode(PRIORITY_NODE_COUNT)).toBe(false);
    expect(isPriorityNode(10)).toBe(false);
    expect(isPriorityNode(-1)).toBe(false);
  });
});
