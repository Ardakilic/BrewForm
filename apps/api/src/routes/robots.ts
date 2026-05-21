import { Hono } from 'hono';
import { config } from '../config/index.ts';
import type { AppEnv } from '../types/hono.ts';

const robots = new Hono<AppEnv>();

export function buildRobotsTxt(baseUrl: string): string {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
  return `User-agent: *
Allow: /

# Disallow authenticated/private areas
Disallow: /settings
Disallow: /admin
Disallow: /onboarding
Disallow: /setups
Disallow: /beans
Disallow: /equipment

Sitemap: ${normalizedBaseUrl}/api/v1/sitemap.xml
`;
}

robots.get('/', (c) => {
  const baseUrl = config.PUBLIC_APP_URL || config.APP_URL;
  const body = buildRobotsTxt(baseUrl);
  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
});

export default robots;