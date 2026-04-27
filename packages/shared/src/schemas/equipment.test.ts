import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { EquipmentCreateSchema, EquipmentUpdateSchema } from './equipment.ts';

describe('EquipmentCreateSchema', () => {
  it('should validate a valid equipment creation', () => {
    const result = EquipmentCreateSchema.safeParse({
      name: 'VST 18g Basket',
      type: 'basket',
      brand: 'VST',
    });
    expect(result.success).toBe(true);
  });

  it('should reject missing required name', () => {
    const result = EquipmentCreateSchema.safeParse({
      type: 'basket',
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid equipment type', () => {
    const result = EquipmentCreateSchema.safeParse({
      name: 'Test',
      type: 'invalid_type',
    });
    expect(result.success).toBe(false);
  });

  it('should accept all valid equipment types', () => {
    const types = [
      'portafilter',
      'basket',
      'puck_screen',
      'paper_filter',
      'tamper',
      'gooseneck_kettle',
      'mesh_filter',
      'cezve',
      'scale',
      'thermometer',
      'other',
    ];
    for (const type of types) {
      const result = EquipmentCreateSchema.safeParse({
        name: `Test ${type}`,
        type,
      });
      expect(result.success).toBe(true);
    }
  });

  it('should accept optional fields', () => {
    const result = EquipmentCreateSchema.safeParse({
      name: 'Precision Tamper',
      type: 'tamper',
      brand: 'Normcore',
      model: '58mm',
      description: 'A precision tamper for espresso',
    });
    expect(result.success).toBe(true);
  });

  it('should reject name exceeding 200 chars', () => {
    const result = EquipmentCreateSchema.safeParse({
      name: 'a'.repeat(201),
      type: 'basket',
    });
    expect(result.success).toBe(false);
  });
});

describe('EquipmentUpdateSchema', () => {
  it('should accept partial updates', () => {
    const result = EquipmentUpdateSchema.safeParse({
      name: 'Updated Name',
    });
    expect(result.success).toBe(true);
  });

  it('should accept empty object', () => {
    const result = EquipmentUpdateSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});
