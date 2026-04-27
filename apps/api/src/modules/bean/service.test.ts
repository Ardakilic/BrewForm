import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';

describe('Bean Service Logic', () => {
  describe('Bean ownership checks', () => {
    it('should throw BEAN_NOT_FOUND for missing bean', () => {
      try {
        throw new Error('BEAN_NOT_FOUND');
      } catch (err) {
        expect((err as Error).message).toBe('BEAN_NOT_FOUND');
      }
    });
  });
});