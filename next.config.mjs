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
};

export default nextConfig;
