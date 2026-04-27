import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';

describe('Logger', () => {
  describe('createLogger', () => {
    it('should export createLogger and logger functions', async () => {
      const mod = await import('./index.ts');
      expect(typeof mod.createLogger).toBe('function');
      expect(typeof mod.logger).toBe('object');
    });
  });
});