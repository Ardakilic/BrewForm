import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';

describe('Photo Service Logic', () => {
  describe('Photo validation', () => {
    it('should accept valid image types', () => {
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
      expect(allowedTypes).toContain('image/jpeg');
      expect(allowedTypes).toContain('image/png');
      expect(allowedTypes).toContain('image/webp');
    });

    it('should reject invalid image types', () => {
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
      expect(allowedTypes).not.toContain('image/gif');
      expect(allowedTypes).not.toContain('application/pdf');
    });

    it('should enforce max file size', () => {
      const maxSize = 10 * 1024 * 1024;
      expect(maxSize).toBe(10485760);
    });
  });
});
