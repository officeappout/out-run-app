import { describe, expect, it } from 'vitest';
import { bunnyResizedUrl, isPriorityNode, nodeImageMode, PRIORITY_NODE_COUNT } from '../tree-node-image-loading';

describe('nodeImageMode', () => {
  it('Bunny Storage zone (Optimizer on) → resized at Bunny', () => {
    expect(nodeImageMode('https://appoutimages.b-cdn.net/x.jpg')).toBe('bunny-resize');
  });

  it('Bunny Stream thumbnails stay plain (referrer allowlist blocks the Vercel optimizer)', () => {
    expect(nodeImageMode('https://vz-b17872ab-7a7.b-cdn.net/abc/thumbnail.jpg')).toBe('plain');
  });

  it('Firebase / Google Storage → next/image', () => {
    expect(nodeImageMode('https://firebasestorage.googleapis.com/v0/b/x/o/y.jpg?alt=media')).toBe('next-image');
    expect(nodeImageMode('https://storage.googleapis.com/bucket/y.png')).toBe('next-image');
  });

  it('unknown hosts, http, placeholder, empty and malformed → plain', () => {
    expect(nodeImageMode('https://example.com/x.jpg')).toBe('plain');
    expect(nodeImageMode('https://appoutimages.b-cdn.net.evil.com/x.jpg')).toBe('plain');
    expect(nodeImageMode('http://appoutimages.b-cdn.net/x.jpg')).toBe('plain');
    expect(nodeImageMode('/images/park-placeholder.svg')).toBe('plain');
    expect(nodeImageMode('')).toBe('plain');
    expect(nodeImageMode(null)).toBe('plain');
    expect(nodeImageMode(undefined)).toBe('plain');
    expect(nodeImageMode('not a url')).toBe('plain');
  });
});

describe('bunnyResizedUrl', () => {
  it('requests 3× the card size', () => {
    expect(bunnyResizedUrl('https://appoutimages.b-cdn.net/a/b.jpg', 104)).toBe('https://appoutimages.b-cdn.net/a/b.jpg?width=312');
  });

  it('keeps an existing query and replaces an existing width', () => {
    expect(bunnyResizedUrl('https://appoutimages.b-cdn.net/a.jpg?v=2&width=1000', 88)).toBe('https://appoutimages.b-cdn.net/a.jpg?v=2&width=264');
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
