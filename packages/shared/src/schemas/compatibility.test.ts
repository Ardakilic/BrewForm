import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import {
  BrewMethodCompatibilityCreateSchema,
  BrewMethodCompatibilityUpdateSchema,
} from './compatibility.ts';

describe('BrewMethodCompatibilityCreateSchema', () => {
  it('should validate valid data', () => {
    const result = BrewMethodCompatibilityCreateSchema.safeParse({
      brewMethod: 'espresso_machine',
      equipmentType: 'espresso_machine',
      compatible: true,
    });
    expect(result.success).toBe(true);
  });

  it('should validate with compatible false', () => {
    const result = BrewMethodCompatibilityCreateSchema.safeParse({
      brewMethod: 'v60',
      equipmentType: 'grinder',
      compatible: false,
    });
    expect(result.success).toBe(true);
  });

  it('should accept all valid brew methods', () => {
    const brewMethods = [
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
    ];
    for (const brewMethod of brewMethods) {
      const result = BrewMethodCompatibilityCreateSchema.safeParse({
        brewMethod,
        equipmentType: 'grinder',
        compatible: true,
      });
      expect(result.success).toBe(true);
    }
  });

  it('should accept all valid equipment types', () => {
    const equipmentTypes = [
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
    ];
    for (const equipmentType of equipmentTypes) {
      const result = BrewMethodCompatibilityCreateSchema.safeParse({
        brewMethod: 'espresso_machine',
        equipmentType,
        compatible: true,
      });
      expect(result.success).toBe(true);
    }
  });

  it('should reject invalid brew method', () => {
    const result = BrewMethodCompatibilityCreateSchema.safeParse({
      brewMethod: 'invalid_method',
      equipmentType: 'grinder',
      compatible: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('brewMethod'))).toBe(true);
    }
  });

  it('should reject invalid equipment type', () => {
    const result = BrewMethodCompatibilityCreateSchema.safeParse({
      brewMethod: 'espresso_machine',
      equipmentType: 'invalid_type',
      compatible: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('equipmentType'))).toBe(true);
    }
  });

  it('should reject missing compatible field', () => {
    const result = BrewMethodCompatibilityCreateSchema.safeParse({
      brewMethod: 'espresso_machine',
      equipmentType: 'grinder',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('compatible'))).toBe(true);
    }
  });

  it('should reject missing brew method', () => {
    const result = BrewMethodCompatibilityCreateSchema.safeParse({
      equipmentType: 'grinder',
      compatible: true,
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing equipment type', () => {
    const result = BrewMethodCompatibilityCreateSchema.safeParse({
      brewMethod: 'espresso_machine',
      compatible: true,
    });
    expect(result.success).toBe(false);
  });
});

describe('BrewMethodCompatibilityUpdateSchema', () => {
  it('should validate with compatible true', () => {
    const result = BrewMethodCompatibilityUpdateSchema.safeParse({
      compatible: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.compatible).toBe(true);
    }
  });

  it('should validate with compatible false', () => {
    const result = BrewMethodCompatibilityUpdateSchema.safeParse({
      compatible: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.compatible).toBe(false);
    }
  });

  it('should reject missing compatible', () => {
    const result = BrewMethodCompatibilityUpdateSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('should reject non-boolean compatible', () => {
    const result = BrewMethodCompatibilityUpdateSchema.safeParse({
      compatible: 'yes',
    });
    expect(result.success).toBe(false);
  });
});
