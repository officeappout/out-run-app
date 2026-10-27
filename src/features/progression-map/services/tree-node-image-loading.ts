/**
 * tree-node-image-loading.ts — how a Skill Tree node photo is loaded.
 *
 * W4 (27.10.2026, pilot: "images on the progress screen load very slowly"):
 * node photos are Bunny thumbnails / Storage images at full source size
 * (often 1280px+) shown in an 88–104px card. Routing them through
 * next/image serves a resized WebP instead, but next/image throws at render
 * for a host missing from next.config.mjs `images.remotePatterns` — and
 * resolveTreeNodeImage accepts a method image from ANY host. So only URLs
 * on a configured host go through the optimizer; everything else (the local
 * SVG placeholder, an unknown host) keeps the plain <img>.
 *
 * Keep OPTIMIZABLE_HOSTS in sync with next.config.mjs `images.remotePatterns`.
 */

const OPTIMIZABLE_HOSTS = [
  'firebasestorage.googleapis.com',
  'storage.googleapis.com',
  'lh3.googleusercontent.com',
  'images.unsplash.com',
];
const OPTIMIZABLE_HOST_SUFFIXES = ['.b-cdn.net'];

/** The top nodes are on screen when the tree opens (base at the top, no initial scroll). */
export const PRIORITY_NODE_COUNT = 3;

export function isOptimizableNodeImage(url: string | null | undefined): boolean {
  if (!url) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false; // relative path (local placeholder) — plain <img>
  }
  if (parsed.protocol !== 'https:') return false;
  const host = parsed.hostname;
  return OPTIMIZABLE_HOSTS.includes(host) || OPTIMIZABLE_HOST_SUFFIXES.some((s) => host.endsWith(s));
}

/** First visible nodes load eagerly with high priority; the rest stay lazy. */
export function isPriorityNode(nodeIndex: number): boolean {
  return nodeIndex >= 0 && nodeIndex < PRIORITY_NODE_COUNT;
}
