import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import {
  BREW_METHOD_EQUIPMENT_RULES,
  EQUIPMENT_TYPE_LABELS,
  EQUIPMENT_TYPES,
} from './brew-method-rules.ts';
import { BREW_METHODS } from './brew-methods.ts';

const VALID_BREW_METHODS = new Set(BREW_METHODS.map((m) => m.value));

describe('brew-method-rules consistency', () => {
  it('EQUIPMENT_TYPES has exactly 17 entries', () => {
    expect(EQUIPMENT_TYPES.length).toBe(17);
  });

  it('EQUIPMENT_TYPE_LABELS has a label for every type in EQUIPMENT_TYPES', () => {
    for (const type of EQUIPMENT_TYPES) {
      expect(EQUIPMENT_TYPE_LABELS[type]).toBeDefined();
      expect(typeof EQUIPMENT_TYPE_LABELS[type]).toBe('string');
      expect(EQUIPMENT_TYPE_LABELS[type].length).toBeGreaterThan(0);
    }
  });

  it('every brewMethod in BREW_METHOD_EQUIPMENT_RULES is a valid brew method', () => {
    for (const rule of BREW_METHOD_EQUIPMENT_RULES) {
      expect(VALID_BREW_METHODS.has(rule.brewMethod)).toBe(true);
    }
  });

  it('every equipmentType in BREW_METHOD_EQUIPMENT_RULES is a valid equipment type', () => {
    const validTypes = new Set(EQUIPMENT_TYPES);
    for (const rule of BREW_METHOD_EQUIPMENT_RULES) {
      expect(validTypes.has(rule.equipmentType)).toBe(true);
    }
  });

  it('no duplicate rules (same brewMethod + equipmentType pair)', () => {
    const seen = new Set<string>();
    for (const rule of BREW_METHOD_EQUIPMENT_RULES) {
      const key = `${rule.brewMethod}::${rule.equipmentType}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});
