/**
 * tree-node-image-loading.ts — how a Skill Tree node photo is loaded.
 *
 * W4 (27.10.2026, pilot: "images on the progress screen load very slowly"):
 * node photos are Bunny thumbnails / Storage images at full source size
 * (often 1280px+) shown in an 88–104px card. Per host (checked live with
 * curl, 27.10.2026):
 *
 *   - Bunny Storage zone (appoutimages.b-cdn.net): Bunny Optimizer is ON —
 *     `?width=N` returns a resized image from Bunny's own edge (78KB → 12KB).
 *     Resized there, no extra hop.
 *   - Bunny Stream zone (vz-*.b-cdn.net, video thumbnails): Optimizer is OFF
 *     (`?width` ignored) AND the zone has a referrer allowlist — a request
 *     without an outrun.co.il Referer gets 403. Vercel's image optimizer
 *     fetches server-side with no Referer, so next/image would turn every
 *     Stream thumbnail into a placeholder. Kept as a plain <img> (the
 *     browser sends the page Referer), unchanged from before.
 *   - Firebase Storage / Google hosts: next/image (Vercel resizes + caches).
 *   - Anything else (local SVG placeholder, unknown host — next/image throws
 *     for a host missing from next.config.mjs remotePatterns): plain <img>.
 *
 * Keep NEXT_IMAGE_HOSTS a subset of next.config.mjs `images.remotePatterns`.
 */

const NEXT_IMAGE_HOSTS = [
  'firebasestorage.googleapis.com',
  'storage.googleapis.com',
  'lh3.googleusercontent.com',
  'images.unsplash.com',
];
const BUNNY_OPTIMIZER_HOSTS = ['appoutimages.b-cdn.net'];

/** The top nodes are on screen when the tree opens (base at the top, no initial scroll). */
export const PRIORITY_NODE_COUNT = 3;

/** Pixels requested per CSS pixel — covers 3× phone screens. */
const DEVICE_PIXEL_FACTOR = 3;

export type NodeImageMode = 'bunny-resize' | 'next-image' | 'plain';

function parseHttps(url: string | null | undefined): URL | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? parsed : null;
  } catch {
    return null; // relative path (local placeholder)
  }
}

export function nodeImageMode(url: string | null | undefined): NodeImageMode {
  const parsed = parseHttps(url);
  if (!parsed) return 'plain';
  if (BUNNY_OPTIMIZER_HOSTS.includes(parsed.hostname)) return 'bunny-resize';
  if (NEXT_IMAGE_HOSTS.includes(parsed.hostname)) return 'next-image';
  return 'plain';
}

/** Bunny Optimizer URL sized for a card of `cssSize` px (keeps any existing query). */
export function bunnyResizedUrl(url: string, cssSize: number): string {
  const parsed = new URL(url);
  parsed.searchParams.set('width', String(Math.round(cssSize * DEVICE_PIXEL_FACTOR)));
  return parsed.toString();
}

/** First visible nodes load eagerly with high priority; the rest stay lazy. */
export function isPriorityNode(nodeIndex: number): boolean {
  return nodeIndex >= 0 && nodeIndex < PRIORITY_NODE_COUNT;
}
