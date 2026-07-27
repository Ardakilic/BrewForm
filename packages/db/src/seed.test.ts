import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import {
  badgeSeedData,
  beanSeedData,
  brewMethodCompatibilityRules,
  equipmentSeedData,
  hashPassword,
  recipeSeedData,
  setupSeedData,
  socialSeedData,
  userSeedData,
  vendorSeedData,
} from './seed-users-recipes.ts';
import { equipmentCatalogSeedData } from './seed-equipment-catalog.ts';
import { coffeeVarietySeedData } from './seed-coffee-varieties.ts';

const scaaPath = new URL('../../../files/scaa-2.json', import.meta.url);
const scaaData = JSON.parse(await Deno.readTextFile(scaaPath));

// deno-lint-ignore no-explicit-any -- test mock array
function collectScaaNames(data: any[]): Set<string> {
  const names = new Set<string>();
  for (const item of data) {
    names.add(item.name);
    if (item.children) {
      for (const child of item.children) {
        names.add(child.name);
        if (child.children) {
          for (const grandChild of child.children) {
            names.add(grandChild.name);
          }
        }
      }
    }
  }
  return names;
}

const scaaNames = collectScaaNames(scaaData.data);

describe('Seed Data Integrity', () => {
  describe('Password hashing', () => {
    it('should produce a non-empty hashed password', () => {
      const hash = hashPassword('test123');
      expect(hash).toBeTruthy();
      expect(hash.length).toBeGreaterThan(20);
    });
  });

  describe('User data', () => {
    it('should have unique emails', () => {
      const emails = userSeedData.map((u) => u.email);
      expect(new Set(emails).size).toBe(emails.length);
    });

    it('should have unique usernames', () => {
      const usernames = userSeedData.map((u) => u.username);
      expect(new Set(usernames).size).toBe(usernames.length);
    });

    it('should have valid preference themes', () => {
      const validThemes = new Set(['light', 'dark', 'coffee']);
      for (const user of userSeedData) {
        expect(validThemes.has(user.preferences.theme)).toBe(true);
      }
    });

    it('should have valid preference unit systems', () => {
      const validUnits = new Set(['metric', 'imperial']);
      for (const user of userSeedData) {
        expect(validUnits.has(user.preferences.unitSystem)).toBe(true);
      }
    });
  });

  describe('Badge data', () => {
    it('should have unique badge rules', () => {
      const rules = badgeSeedData.map((b) => b.rule);
      expect(new Set(rules).size).toBe(rules.length);
    });

    it('should have positive thresholds', () => {
      for (const badge of badgeSeedData) {
        expect(badge.threshold).toBeGreaterThan(0);
      }
    });
  });

  describe('Vendor data', () => {
    it('should have unique vendor names', () => {
      const names = vendorSeedData.map((v) => v.name);
      expect(new Set(names).size).toBe(names.length);
    });
  });

  describe('Equipment data', () => {
    it('should have unique equipment names', () => {
      const names = equipmentSeedData.map((e) => e.name);
      expect(new Set(names).size).toBe(names.length);
    });

    it('should reference existing users as creators', () => {
      const validUsernames = new Set(userSeedData.map((u) => u.username));
      for (const equip of equipmentSeedData) {
        expect(validUsernames.has(equip.createdByUsername)).toBe(true);
      }
    });

    it('should have valid equipment types', () => {
      const validTypes = new Set([
        'espresso_machine',
        'grinder',
        'pour_over_brewer',
        'immersion_brewer',
        'kettle',
        'milk_tool',
        'scale_accessory',
        'roaster',
        'portafilter',
        'basket',
        'puck_screen',
        'paper_filter',
        'tamper',
        'mesh_filter',
        'cezve',
        'thermometer',
        'other',
      ]);
      for (const equip of equipmentSeedData) {
        expect(validTypes.has(equip.type)).toBe(true);
      }
    });
  });

  describe('Bean data', () => {
    it('should reference existing users', () => {
      const validUsernames = new Set(userSeedData.map((u) => u.username));
      for (const bean of beanSeedData) {
        expect(validUsernames.has(bean.userUsername)).toBe(true);
      }
    });

    it('should reference existing vendors', () => {
      const validVendors = new Set(vendorSeedData.map((v) => v.name));
      for (const bean of beanSeedData) {
        expect(validVendors.has(bean.vendorName)).toBe(true);
      }
    });
  });

  describe('Recipe data', () => {
    it('should have unique slugs', () => {
      const slugs = recipeSeedData.map((r) => r.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
    });

    it('should have unique titles', () => {
      const titles = recipeSeedData.map((r) => r.title);
      expect(new Set(titles).size).toBe(titles.length);
    });

    it('should reference existing users as authors', () => {
      const validUsernames = new Set(userSeedData.map((u) => u.username));
      for (const recipe of recipeSeedData) {
        expect(validUsernames.has(recipe.authorUsername)).toBe(true);
      }
    });

    it('should have valid visibility values', () => {
      const validVisibilities = new Set(['draft', 'private', 'unlisted', 'public']);
      for (const recipe of recipeSeedData) {
        expect(validVisibilities.has(recipe.visibility)).toBe(true);
      }
    });

    it('should have valid brew methods', () => {
      const validMethods = new Set([
        'espresso_machine',
        'v60',
        'french_press',
        'aeropress',
        'turkish_coffee',
        'drip_coffee',
        'chemex',
        'kalita_wave',
        'moka_pot',
        'cold_brew',
        'siphon',
      ]);
      for (const recipe of recipeSeedData) {
        expect(validMethods.has(recipe.version.brewMethod)).toBe(true);
      }
    });

    it('should have valid drink types', () => {
      const validDrinks = new Set([
        'espresso',
        'americano',
        'flat_white',
        'latte',
        'cappuccino',
        'cortado',
        'macchiato',
        'turkish_coffee',
        'pour_over',
        'cold_brew',
        'french_press',
      ]);
      for (const recipe of recipeSeedData) {
        expect(validDrinks.has(recipe.version.drinkType)).toBe(true);
      }
    });

    it('should have valid emoji tags', () => {
      const validEmojis = new Set([
        'fire',
        'rocket',
        'thumbsup',
        'neutral',
        'thumbsdown',
        'nauseated',
      ]);
      for (const recipe of recipeSeedData) {
        expect(validEmojis.has(recipe.version.emojiTag)).toBe(true);
      }
    });

    it('should have ratings between 1 and 10', () => {
      for (const recipe of recipeSeedData) {
        expect(recipe.version.rating).toBeGreaterThanOrEqual(1);
        expect(recipe.version.rating).toBeLessThanOrEqual(10);
      }
    });

    it('should reference existing vendors in versions', () => {
      const validVendors = new Set(vendorSeedData.map((v) => v.name));
      for (const recipe of recipeSeedData) {
        expect(validVendors.has(recipe.version.vendorName)).toBe(true);
      }
    });

    it('should reference existing equipment by name', () => {
      const validEquipment = new Set([
        ...equipmentSeedData.map((e) => e.name),
        ...equipmentCatalogSeedData.map((e) => e.name),
      ]);
      for (const recipe of recipeSeedData) {
        for (const equipName of recipe.equipmentNames) {
          expect(validEquipment.has(equipName)).toBe(true);
        }
      }
    });

    it('should reference valid SCAA taste note names', () => {
      for (const recipe of recipeSeedData) {
        if (!recipe.tasteNotes) continue;
        for (const note of recipe.tasteNotes) {
          expect(scaaNames.has(note.name)).toBe(true);
        }
      }
    });

    it('should have taste note intensities between 1 and 5', () => {
      for (const recipe of recipeSeedData) {
        if (!recipe.tasteNotes) continue;
        for (const note of recipe.tasteNotes) {
          expect(note.intensity).toBeGreaterThanOrEqual(1);
          expect(note.intensity).toBeLessThanOrEqual(5);
        }
      }
    });

    it('should have valid additional preparation types when present', () => {
      const validTypes = new Set(['milk', 'water', 'syrup', 'spice', 'other']);
      for (const recipe of recipeSeedData) {
        if (!recipe.additionalPreparations) continue;
        for (const prep of recipe.additionalPreparations) {
          expect(validTypes.has(prep.type)).toBe(true);
        }
      }
    });

    it('should have at least one photo per recipe', () => {
      for (const recipe of recipeSeedData) {
        expect(recipe.photos).toBeTruthy();
        expect(recipe.photos.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Brew method compatibility rules', () => {
    it('should have valid brew methods', () => {
      const validMethods = new Set([
        'espresso_machine',
        'v60',
        'french_press',
        'aeropress',
        'turkish_coffee',
        'drip_coffee',
        'chemex',
        'kalita_wave',
        'moka_pot',
        'cold_brew',
        'siphon',
      ]);
      for (const rule of brewMethodCompatibilityRules) {
        expect(validMethods.has(rule.brewMethod)).toBe(true);
      }
    });

    it('should have valid equipment types', () => {
      const validTypes = new Set([
        'espresso_machine',
        'grinder',
        'pour_over_brewer',
        'immersion_brewer',
        'kettle',
        'milk_tool',
        'scale_accessory',
        'roaster',
        'portafilter',
        'basket',
        'puck_screen',
        'paper_filter',
        'tamper',
        'mesh_filter',
        'cezve',
        'thermometer',
        'other',
      ]);
      for (const rule of brewMethodCompatibilityRules) {
        expect(validTypes.has(rule.equipmentType)).toBe(true);
      }
    });
  });

  describe('Social data', () => {
    it('should reference existing users in follows', () => {
      const validUsernames = new Set(userSeedData.map((u) => u.username));
      for (const follow of socialSeedData.follows) {
        expect(validUsernames.has(follow.followerUsername)).toBe(true);
        expect(validUsernames.has(follow.followingUsername)).toBe(true);
      }
    });

    it('should not have self-follows', () => {
      for (const follow of socialSeedData.follows) {
        expect(follow.followerUsername).not.toBe(follow.followingUsername);
      }
    });

    it('should reference existing users and recipes in likes', () => {
      const validUsernames = new Set(userSeedData.map((u) => u.username));
      const validSlugs = new Set(recipeSeedData.map((r) => r.slug));
      for (const like of socialSeedData.likes) {
        expect(validUsernames.has(like.userUsername)).toBe(true);
        expect(validSlugs.has(like.recipeSlug)).toBe(true);
      }
    });

    it('should reference existing users and recipes in favourites', () => {
      const validUsernames = new Set(userSeedData.map((u) => u.username));
      const validSlugs = new Set(recipeSeedData.map((r) => r.slug));
      for (const fav of socialSeedData.favourites) {
        expect(validUsernames.has(fav.userUsername)).toBe(true);
        expect(validSlugs.has(fav.recipeSlug)).toBe(true);
      }
    });

    it('should reference existing users and recipes in ratings', () => {
      const validUsernames = new Set(userSeedData.map((u) => u.username));
      const validSlugs = new Set(recipeSeedData.map((r) => r.slug));
      for (const rating of socialSeedData.ratings) {
        expect(validUsernames.has(rating.userUsername)).toBe(true);
        expect(validSlugs.has(rating.recipeSlug)).toBe(true);
        expect(rating.rating).toBeGreaterThanOrEqual(1);
        expect(rating.rating).toBeLessThanOrEqual(10);
      }
    });

    it('should reference existing users and recipes in comments', () => {
      const validUsernames = new Set(userSeedData.map((u) => u.username));
      const validSlugs = new Set(recipeSeedData.map((r) => r.slug));
      for (const comment of socialSeedData.comments) {
        expect(validSlugs.has(comment.recipeSlug)).toBe(true);
        expect(validUsernames.has(comment.authorUsername)).toBe(true);
        for (const reply of comment.replies) {
          expect(validUsernames.has(reply.authorUsername)).toBe(true);
        }
      }
    });

    it('should reference valid badge rules', () => {
      const validRules = new Set(badgeSeedData.map((b) => b.rule));
      for (const badge of socialSeedData.badges) {
        // deno-lint-ignore no-explicit-any -- test cast
        expect(validRules.has(badge.badgeRule as any)).toBe(true);
      }
    });
  });

  describe('Setup data', () => {
    it('should reference existing users', () => {
      const validUsernames = new Set(userSeedData.map((u) => u.username));
      for (const setup of setupSeedData) {
        expect(validUsernames.has(setup.userUsername)).toBe(true);
      }
    });

    it('should reference existing equipment when specified', () => {
      const validEquipment = new Set(equipmentSeedData.map((e) => e.name));
      for (const setup of setupSeedData) {
        for (const equipName of setup.equipmentNames) {
          expect(validEquipment.has(equipName)).toBe(true);
        }
      }
    });
  });

  describe('SCAA coverage', () => {
    it('should include all taste notes referenced in seed data', () => {
      const referencedNotes = new Set<string>();
      for (const recipe of recipeSeedData) {
        if (!recipe.tasteNotes) continue;
        for (const note of recipe.tasteNotes) {
          referencedNotes.add(note.name);
        }
      }
      for (const name of referencedNotes) {
        expect(scaaNames.has(name)).toBe(true);
      }
    });
  });

  describe('Equipment catalog data', () => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

    it('should have 378 entries', () => {
      expect(equipmentCatalogSeedData).toHaveLength(378);
    });

    it('should have all entries with isSystem: true', () => {
      for (const entry of equipmentCatalogSeedData) {
        expect(entry.isSystem).toBe(true);
      }
    });

    it('should have valid UUID format for all IDs', () => {
      for (const entry of equipmentCatalogSeedData) {
        expect(uuidRegex.test(entry.id)).toBe(true);
      }
    });
  });

  describe('Coffee variety data', () => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    const validCategories = new Set(['variety', 'processing', 'market_name']);

    it('should have 98 entries', () => {
      expect(coffeeVarietySeedData).toHaveLength(98);
    });

    it('should have valid categories for all entries', () => {
      for (const entry of coffeeVarietySeedData) {
        expect(validCategories.has(entry.category)).toBe(true);
      }
    });

    it('should have valid UUID format for all IDs', () => {
      for (const entry of coffeeVarietySeedData) {
        expect(uuidRegex.test(entry.id)).toBe(true);
      }
    });
  });
});
