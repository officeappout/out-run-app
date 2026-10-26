/** YouTube / Vimeo url → iframe src (pure). Shared by the equipment drawer's v1 body and v2 hero. */

/**
 * Extract a YouTube or Vimeo video id from a free-form url so we can
 * render an `<iframe>` embed. Returns null when the url doesn't match
 * either provider — the caller falls back to an "open in external"
 * link instead.
 */
export function parseVideoEmbed(url: string | undefined): { src: string } | null {
  if (!url) return null;
  const yt = url.match(
    /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/,
  );
  if (yt) return { src: `https://www.youtube.com/embed/${yt[1]}` };
  const vimeo = url.match(/(?:vimeo\.com\/)(\d+)/);
  if (vimeo) return { src: `https://player.vimeo.com/video/${vimeo[1]}` };
  return null;
}
