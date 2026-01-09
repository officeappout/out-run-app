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
};

export default nextConfig;