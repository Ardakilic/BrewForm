import '../test-setup.ts';
import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { Hono } from 'hono';
import share, { deps, OG_TEMPLATE, RECIPE_NOT_FOUND_HTML } from '../routes/share.ts';

describe('Share Route', () => {
  describe('OG_TEMPLATE', () => {
    const meta = {
      title: 'Test Recipe',
      description: 'A delicious coffee recipe',
      image: 'https://example.com/image.jpg',
      url: 'https://brewform.cc/share/test-recipe',
      siteName: 'BrewForm',
      slug: 'test-recipe',
    };

    it('should include og:title in response', () => {
      const html = OG_TEMPLATE(meta);
      expect(html).toContain('<meta property="og:title" content="Test Recipe">');
    });

    it('should include twitter:card in response', () => {
      const html = OG_TEMPLATE(meta);
      expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
    });

    it('should redirect humans to recipe page', () => {
      const html = OG_TEMPLATE(meta);
      expect(html).toContain('window.location.replace(\'/recipes/\' + "test-recipe");');
    });

    it('should escape </ sequences in the redirect slug', () => {
      const maliciousMeta = {
        ...meta,
        url: 'https://brewform.cc/share/foo</script>bar',
        slug: 'foo</script>bar',
      };
      const html = OG_TEMPLATE(maliciousMeta);
      const scriptMatch = html.match(
        /window\.location\.replace\('\/recipes\/\' \+ "([^"]+)"\)/,
      );
      expect(scriptMatch).not.toBeNull();
      expect(scriptMatch![1]).toContain('<\\/script>');
      expect(scriptMatch![1]).not.toContain('</script>');
    });

    it('should return HTML with image meta tags when image is provided', () => {
      const html = OG_TEMPLATE(meta);
      expect(html).toContain('<meta property="og:image" content="https://example.com/image.jpg">');
      expect(html).toContain('<meta name="twitter:image" content="https://example.com/image.jpg">');
    });

    it('should omit image meta tags when image is null', () => {
      const htmlNoImage = OG_TEMPLATE({ ...meta, image: null });
      expect(htmlNoImage).not.toContain('og:image');
      expect(htmlNoImage).not.toContain('twitter:image');
    });
  });

  describe('RECIPE_NOT_FOUND_HTML', () => {
    it('should be a valid 404 HTML string', () => {
      expect(RECIPE_NOT_FOUND_HTML).toContain('404');
      expect(RECIPE_NOT_FOUND_HTML).toContain('Recipe not found');
    });
  });

  describe('share route handler', () => {
    const app = new Hono();
    app.route('/share', share);

    const originalGetRecipeMeta = deps.getRecipeMeta;

    it('returns 404 with RECIPE_NOT_FOUND_HTML when visibility is not public', async () => {
      deps.getRecipeMeta = async (_slug: string) => ({
        id: '1',
        title: 'Private Recipe',
        slug: 'private-recipe',
        author: { username: 'chef', displayName: 'Chef' },
        visibility: 'private',
        likeCount: 0,
        commentCount: 0,
        createdAt: new Date(),
        productName: null,
        brewMethod: null,
        photoUrl: null,
      });

      const res = await app.request('/share/private-recipe');
      expect(res.status).toBe(404);
      const text = await res.text();
      expect(text).toBe(RECIPE_NOT_FOUND_HTML);

      deps.getRecipeMeta = originalGetRecipeMeta;
    });

    it('returns 404 with RECIPE_NOT_FOUND_HTML when getRecipeMeta throws RECIPE_NOT_FOUND', async () => {
      deps.getRecipeMeta = async (_slug: string) => {
        throw new Error('RECIPE_NOT_FOUND');
      };

      const res = await app.request('/share/missing-recipe');
      expect(res.status).toBe(404);
      const text = await res.text();
      expect(text).toBe(RECIPE_NOT_FOUND_HTML);

      deps.getRecipeMeta = originalGetRecipeMeta;
    });

    it('uses productName in description when present', async () => {
      deps.getRecipeMeta = async (_slug: string) => ({
        id: '1',
        title: 'V60 Recipe',
        slug: 'v60-recipe',
        author: { username: 'barista', displayName: 'Barista' },
        visibility: 'public',
        likeCount: 0,
        commentCount: 0,
        createdAt: new Date(),
        productName: 'Ethiopian Yirgacheffe',
        brewMethod: 'Pour Over',
        photoUrl: null,
      });

      const res = await app.request('/share/v60-recipe');
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain('<meta property="og:title" content="V60 Recipe">');
      expect(text).toContain('Pour Over recipe using Ethiopian Yirgacheffe');

      deps.getRecipeMeta = originalGetRecipeMeta;
    });

    it('falls back to author name when productName is absent', async () => {
      deps.getRecipeMeta = async (_slug: string) => ({
        id: '1',
        title: 'Espresso Recipe',
        slug: 'espresso-recipe',
        author: { username: 'barista', displayName: 'Pro Barista' },
        visibility: 'public',
        likeCount: 0,
        commentCount: 0,
        createdAt: new Date(),
        productName: null,
        brewMethod: 'Espresso',
        photoUrl: null,
      });

      const res = await app.request('/share/espresso-recipe');
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain('Espresso recipe by Pro Barista');

      deps.getRecipeMeta = originalGetRecipeMeta;
    });

    it('falls back to generic user when productName and author are absent', async () => {
      deps.getRecipeMeta = async (_slug: string) => ({
        id: '1',
        title: 'Cold Brew',
        slug: 'cold-brew',
        author: null,
        visibility: 'public',
        likeCount: 0,
        commentCount: 0,
        createdAt: new Date(),
        productName: null,
        brewMethod: null,
        photoUrl: null,
      });

      const res = await app.request('/share/cold-brew');
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain('Coffee recipe by BrewForm user');

      deps.getRecipeMeta = originalGetRecipeMeta;
    });
  });
});
