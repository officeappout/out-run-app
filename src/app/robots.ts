import type { MetadataRoute } from 'next';

/**
 * Root robots.txt for outrun.co.il (crawlers only read it at the domain root). The marketing site
 * lives at /web and publishes its own sitemap there (appout-website app/sitemap.ts). Private app
 * surfaces (admin, portals, APIs, debug, QA) are kept out of the index.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/authority-portal', '/api', '/debug', '/qa', '/booth', '/tv'],
    },
    sitemap: 'https://outrun.co.il/web/sitemap.xml',
  };
}
