// Marketing site (the appout-website repo — a SEPARATE Next deployment) is
// served under /web of this domain via Next.js multi-zones. Set
// MARKETING_SITE_URL in the environment to that deployment's origin
// (e.g. https://appout-website.vercel.app). While it is UNSET, the redirect and
// rewrite below are no-ops, so this changes nothing for the live app.
const MARKETING_SITE_URL = (process.env.MARKETING_SITE_URL || '').replace(/\/$/, '');

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'firebasestorage.googleapis.com' },
      { protocol: 'https', hostname: 'storage.googleapis.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      // Bunny CDN pull zones — Stream (vz-b17872ab-7a7.b-cdn.net: thumbnails +
      // play_*.mp4 posters) and Storage (appoutimages.b-cdn.net: images).
      // Wildcard covers both current zones and any future/renamed pull zone
      // (BUNNY_CDN_HOSTNAME is env-configurable), so no host can be missing.
      { protocol: 'https', hostname: '**.b-cdn.net' },
      // Bunny iframe embed host (used for embedded player URLs).
      { protocol: 'https', hostname: 'iframe.bunnycdn.com' },
    ],
  },
  async headers() {
    return [
      {
        source: '/.well-known/apple-app-site-association',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
      },
      {
        source: '/.well-known/assetlinks.json',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
      },
    ];
  },
  async redirects() {
    if (!MARKETING_SITE_URL) return [];
    return [
      // Bare marketing root → default locale (the marketing zone serves /web/he).
      { source: '/web', destination: '/web/he', permanent: false },
    ];
  },
  async rewrites() {
    if (!MARKETING_SITE_URL) return [];
    // Forward /web/* to the marketing deployment (which serves under basePath
    // '/web'), so outrun.co.il/web shows the marketing site. Add a new path here
    // the day a second micro-site needs its own zone.
    return [
      { source: '/web/:path*', destination: `${MARKETING_SITE_URL}/web/:path*` },
    ];
  },
};

export default nextConfig;
