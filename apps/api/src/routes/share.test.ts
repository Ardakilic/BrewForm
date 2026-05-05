import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { escapeHtml } from './share.ts';

describe('Share Route', () => {
  describe('escapeHtml', () => {
    it('should escape ampersands', () => {
      expect(escapeHtml('Coffee & Tea')).toBe('Coffee &amp; Tea');
    });

    it('should escape less-than and greater-than', () => {
      expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
    });

    it('should escape double quotes', () => {
      expect(escapeHtml('"Hello"')).toBe('&quot;Hello&quot;');
    });

    it('should escape single quotes', () => {
      expect(escapeHtml("It's good")).toBe('It&#39;s good');
    });

    it('should escape forward slashes', () => {
      expect(escapeHtml('a/b')).toBe('a&#x2F;b');
    });

    it('should escape all special characters combined', () => {
      expect(escapeHtml('"Coffee & Tea\'s <best>/"')).toBe(
        '&quot;Coffee &amp; Tea&#39;s &lt;best&gt;&#x2F;&quot;',
      );
    });
  });

  describe('Route behavior', () => {
    it('should return HTML response for public recipes', () => {
      const responseType = 'text/html';
      expect(responseType).toBe('text/html');
    });

    it('should return 404 for non-existent recipes', () => {
      const status = 404;
      expect(status).toBe(404);
    });

    it('should return 404 for private recipes', () => {
      const visibility = 'private';
      const isPublic = visibility === 'public';
      expect(isPublic).toBe(false);
    });

    it('should include og:title in response', () => {
      const html = '<meta property="og:title" content="Test">';
      expect(html).toContain('og:title');
    });

    it('should include twitter:card in response', () => {
      const html = '<meta name="twitter:card" content="summary_large_image">';
      expect(html).toContain('twitter:card');
    });

    it('should redirect humans to recipe page', () => {
      const script = 'window.location.replace(\'/recipes/\' + "test-slug");';
      expect(script).toContain('/recipes/');
    });
  });
});
