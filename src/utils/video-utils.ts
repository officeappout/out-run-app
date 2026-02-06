/**
 * Utilities for parsing and extracting video IDs from URLs
 */

export interface VideoInfo {
  platform: 'youtube' | 'vimeo' | null;
  videoId: string | null;
  embedUrl: string | null;
  thumbnailUrl: string | null;
}

/**
 * Extract YouTube video ID from various URL formats
 */
function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/v\/([^&\n?#]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Extract Vimeo video ID from URL
 */
function extractVimeoId(url: string): string | null {
  const patterns = [
    /vimeo\.com\/(\d+)/,
    /player\.vimeo\.com\/video\/(\d+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Parse video URL and extract platform, ID, and embed URLs
 */
export function parseVideoUrl(url: string): VideoInfo {
  if (!url || typeof url !== 'string') {
    return { platform: null, videoId: null, embedUrl: null, thumbnailUrl: null };
  }

  const trimmedUrl = url.trim();

  // Try YouTube
  const youtubeId = extractYouTubeId(trimmedUrl);
  if (youtubeId) {
    return {
      platform: 'youtube',
      videoId: youtubeId,
      embedUrl: `https://www.youtube.com/embed/${youtubeId}`,
      thumbnailUrl: `https://img.youtube.com/vi/${youtubeId}/maxresdefault.jpg`,
    };
  }

  // Try Vimeo
  const vimeoId = extractVimeoId(trimmedUrl);
  if (vimeoId) {
    return {
      platform: 'vimeo',
      videoId: vimeoId,
      embedUrl: `https://player.vimeo.com/video/${vimeoId}`,
      thumbnailUrl: null, // Vimeo requires API call for thumbnail
    };
  }

  return { platform: null, videoId: null, embedUrl: null, thumbnailUrl: null };
}

/**
 * Validate hex color code
 */
export function isValidHexColor(color: string): boolean {
  if (!color) return false;
  const hexPattern = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
  return hexPattern.test(color);
}
