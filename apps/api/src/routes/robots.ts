import { Hono } from 'hono';
import { config } from '../config/index.ts';
import type { AppEnv } from '../types/hono.ts';

const robots = new Hono<AppEnv>();

robots.get('/', (c) => {
  const baseUrl = (config.PUBLIC_APP_URL || config.APP_URL).replace(/\/$/, '');

  const body = `User-agent: *
Allow: /

# Disallow authenticated/private areas
Disallow: /settings
Disallow: /admin
Disallow: /onboarding
Disallow: /setups
Disallow: /beans
Disallow: /equipment

# Sitemap location
Sitemap: ${baseUrl}/api/v1/sitemap.xml
`;

  return c.text(body, 200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'public, max-age=3600',
  });
});

export default robots;
