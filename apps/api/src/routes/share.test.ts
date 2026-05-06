import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';

// Set required env vars before loading the route module (which parses config
// at the top level).
Deno.env.set('DATABASE_URL', 'postgresql://test:test@localhost:5432/test');
Deno.env.set('JWT_SECRET', 'a-very-long-secret-key-for-testing-12345');

const { OG_TEMPLATE, RECIPE_NOT_FOUND_HTML } = await import('../routes/share.ts');

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
});
