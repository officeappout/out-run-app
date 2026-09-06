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
    return [
      {
        // src/app/onboarding-dynamic/ (distinct from src/app/onboarding-new/dynamic/)
        // was removed — it rendered HealthDeclarationStep with no gate against
        // an already-accepted declaration, and had zero in-app navigators
        // (router.push/<Link>/redirect) pointing to it, only a bare,
        // unauthenticated URL, reachable e.g. from browser history.
        //
        // Destination is /gateway, not /onboarding-new/profile — a static
        // redirect can't condition on who's actually landing here, but
        // /gateway can and does: its own onAuthStateChange listener
        // (src/app/gateway/page.tsx:117-178) reads onboardingStatus/Step and
        // routes a completed user straight to /home, an in-progress user to
        // their exact next step, and leaves a signed-out/doc-less visitor on
        // the picker UI — verified for all four cases before choosing this.
        // /onboarding-new/profile would have thrown an already-onboarded
        // user (the actual case that surfaced this route) back into
        // onboarding from scratch — trading one bug for another.
        source: '/onboarding-dynamic',
        destination: '/gateway',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
