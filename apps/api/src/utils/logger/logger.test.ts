import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';

describe('Logger', () => {
  describe('module shape', () => {
    it('should export expected function names', () => {
      expect(typeof pino).toBeDefined();
      expect(typeof pino.default).toBe('function');
    });
  });
});

const pino = await import('pino');
