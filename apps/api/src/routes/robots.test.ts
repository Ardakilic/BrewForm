import '../test-setup.ts';
import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { Hono } from 'hono';
import robots, { buildRobotsTxt } from './robots.ts';

describe('Robots Route', () => {
  const app = new Hono();
  app.route('/robots.txt', robots);

  describe('buildRobotsTxt', () => {
    it('includes User-agent wildcard and Allow /', () => {
      const txt = buildRobotsTxt('https://brewform.cc');
      expect(txt).toContain('User-agent: *');
      expect(txt).toContain('Allow: /');
    });

    it('disallows authenticated/private paths', () => {
      const txt = buildRobotsTxt('https://brewform.cc');
      expect(txt).toContain('Disallow: /settings');
      expect(txt).toContain('Disallow: /admin');
      expect(txt).toContain('Disallow: /onboarding');
      expect(txt).toContain('Disallow: /setups');
      expect(txt).toContain('Disallow: /beans');
      expect(txt).toContain('Disallow: /equipment');
    });

    it('includes Sitemap URL derived from baseUrl', () => {
      const txt = buildRobotsTxt('https://brewform.cc');
      expect(txt).toContain('Sitemap: https://brewform.cc/api/v1/sitemap.xml');
    });

    it('strips trailing slash from baseUrl before building Sitemap URL', () => {
      const txt = buildRobotsTxt('https://brewform.cc/');
      expect(txt).toContain('Sitemap: https://brewform.cc/api/v1/sitemap.xml');
      expect(txt).not.toContain('Sitemap: https://brewform.cc//api/v1/sitemap.xml');
    });

    it('works with localhost URL for development', () => {
      const txt = buildRobotsTxt('http://localhost:8000');
      expect(txt).toContain('Sitemap: http://localhost:8000/api/v1/sitemap.xml');
    });
  });

  describe('GET /robots.txt', () => {
    it('returns 200 with text/plain content type', async () => {
      const res = await app.request('/robots.txt/');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/plain');
    });

    it('sets cache-control header', async () => {
      const res = await app.request('/robots.txt/');
      expect(res.headers.get('cache-control')).toContain('max-age=86400');
    });

    it('response body includes all disallow rules', async () => {
      const res = await app.request('/robots.txt/');
      const body = await res.text();
      expect(body).toContain('Disallow: /settings');
      expect(body).toContain('Disallow: /admin');
      expect(body).toContain('Disallow: /onboarding');
    });

    it('response body includes Sitemap directive', async () => {
      const res = await app.request('/robots.txt/');
      const body = await res.text();
      expect(body).toContain('Sitemap:');
      expect(body).toContain('/api/v1/sitemap.xml');
    });
  });
});