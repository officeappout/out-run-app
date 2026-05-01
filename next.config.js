/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // מתעלם משגיאות ESLint בזמן הבנייה ב-Vercel
    ignoreDuringBuilds: true,
  },
  typescript: {
    // מתעלם משגיאות TypeScript בזמן הבנייה ב-Vercel
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'firebasestorage.googleapis.com' },
      { protocol: 'https', hostname: 'storage.googleapis.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
  webpack: (config, { dev }) => {
    if (dev) {
      config.cache = false;
    }
    return config;
  },
  // Admin routes are protected by export const dynamic = 'force-dynamic' on each page.
  // generateBuildId is intentionally omitted: Next.js derives a deterministic build ID
  // from file-content hashes, which makes browser chunk caching stable across deploys
  // where code hasn't changed. Using Date.now() here caused every deploy to invalidate
  // ALL cached chunks in the browser, triggering ChunkLoadError on active sessions.
};

export default nextConfig;