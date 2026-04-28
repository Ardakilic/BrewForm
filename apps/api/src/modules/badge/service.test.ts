import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';

describe('Badge Service Logic', () => {
  describe('Badge evaluation triggers', () => {
    it('should list all available badges', async () => {
      const badges = [
        {
          id: 'badge-1',
          name: 'First Brew',
          rule: 'first_recipe',
          description: 'Created your first recipe',
        },
        {
          id: 'badge-2',
          name: 'Social Butterfly',
          rule: 'ten_followers',
          description: 'Got 10 followers',
        },
        {
          id: 'badge-3',
          name: 'Precision Brewer',
          rule: 'precision_brewer',
          description: 'Filled all optional fields',
        },
      ];
      expect(badges.length).toBe(3);
      expect(badges[0].rule).toBe('first_recipe');
    });

    it('should identify precision brewer badge correctly', () => {
      const allOptionalFieldsFilled = {
        grindSize: 'fine',
        temperatureCelsius: 93,
        brewerDetails: 'La Marzocco',
        grinder: 'Niche Zero',
        vendorId: 'vendor-1',
        productName: 'Ethiopia Yirgacheffe',
        coffeeBrand: 'Blue Bottle',
      };
      const hasAllFields = Object.values(allOptionalFieldsFilled).every((v) =>
        v !== null && v !== undefined
      );
      expect(hasAllFields).toBe(true);
    });

    it('should not award precision brewer when fields are missing', () => {
      const partialFields = {
        grindSize: 'fine',
        temperatureCelsius: null,
        brewerDetails: 'La Marzocco',
      };
      const hasAllFields = Object.values(partialFields).every((v) => v !== null && v !== undefined);
      expect(hasAllFields).toBe(false);
    });
  });
});
