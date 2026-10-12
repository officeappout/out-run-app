import { withSentryConfig } from '@sentry/nextjs';

// Marketing site (the appout-website repo — a SEPARATE Next deployment) is
// served under /web of this domain via Next.js multi-zones. Set
// MARKETING_SITE_URL in the environment to that deployment's origin
// (e.g. https://appout-website.vercel.app). While it is UNSET, the /web redirect
// and the rewrite below are no-ops, so this changes nothing for the live app.
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
      // Marketing zone: bare /web → default locale (the marketing site serves
      // under basePath '/web' and its own middleware locale-gates to /web/he).
      // Added only when the zone is wired (MARKETING_SITE_URL set), so the live
      // app is untouched until then.
      ...(MARKETING_SITE_URL
        ? [{ source: '/web', destination: '/web/he', permanent: false }]
        : []),
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

// Only touches build-time source-map upload (via @sentry/nextjs's own webpack
// plugin entry) — does not touch the webpack `cache` settings axiom #13 bans
// touching. For Next.js < 15 (this project is 14.2) the SDK also sets
// `experimental.instrumentationHook: true` on the returned config itself —
// confirmed by reading node_modules/@sentry/nextjs's own source for the
// installed version, not assumed from docs — so no manual flag is needed here.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  // true: client source-map upload also covers React/Next.js runtime +
  // third-party (node_modules) chunks, not just this app's own pages/app
  // code — the app-code chunks are de-minified either way, this only
  // widens the vendor-chunk coverage. Worth it here: the WebView bundle
  // carries more first-party-adjacent vendor code than a typical web app
  // (Mapbox GL, Firebase client SDK, Capacitor bridge shims), so a crash
  // inside one of those is a real, not hypothetical, case. Costs build
  // time + upload size; revisit if that becomes a real problem.
  widenClientFileUpload: true,
});
