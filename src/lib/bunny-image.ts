/**
 * Appends Bunny Optimizer `?width=W` to a CDN URL.
 * Only affects URLs served from our Bunny pull zone (b-cdn.net).
 * Requires "Bunny Optimizer" to be enabled on the pull zone in the Bunny dashboard.
 *
 * Widths by context (2× for retina):
 *   map marker / list thumbnail  → 80
 *   park card hero               → 400
 *   equipment card / brand icon  → 200
 *   equipment hero               → 720
 *   park detail hero             → 800
 */
export function bunnyImg(url: string | null | undefined, width: number): string {
  if (!url) return '';
  if (!url.includes('b-cdn.net')) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}width=${width}`;
}
