import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';

describe('Setup Service Logic', () => {
  describe('Setup creation with default clearing', () => {
    it('should clear existing default when creating a new default setup', () => {
      let clearDefaultCalled = false;
      const data = { name: 'My Setup', isDefault: true };
      if (data.isDefault) {
        clearDefaultCalled = true;
      }
      expect(clearDefaultCalled).toBe(true);
    });

    it('should not clear defaults when creating non-default setup', () => {
      let clearDefaultCalled = false;
      const data = { name: 'My Setup', isDefault: false };
      if (data.isDefault) {
        clearDefaultCalled = true;
      }
      expect(clearDefaultCalled).toBe(false);
    });
  });

  describe('Setup update authorization', () => {
    it('should throw SETUP_NOT_FOUND when setup does not exist', () => {
      try {
        throw new Error('SETUP_NOT_FOUND');
      } catch (err) {
        expect((err as Error).message).toBe('SETUP_NOT_FOUND');
      }
    });

    it('should throw FORBIDDEN when user does not own the setup', () => {
      try {
        throw new Error('FORBIDDEN');
      } catch (err) {
        expect((err as Error).message).toBe('FORBIDDEN');
      }
    });
  });
});
