import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { EQUIPMENT_TYPE_VALUES } from '../constants/equipment-types.ts';
import {
  EquipmentCreateSchema,
  EquipmentDeleteRequestSchema,
  EquipmentUpdateSchema,
} from './equipment.ts';

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
    for (const type of EQUIPMENT_TYPE_VALUES) {
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

describe('EquipmentDeleteRequestSchema', () => {
  it('should validate with reason', () => {
    const result = EquipmentDeleteRequestSchema.safeParse({
      reason: 'No longer needed',
    });
    expect(result.success).toBe(true);
  });

  it('should validate without reason (optional)', () => {
    const result = EquipmentDeleteRequestSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should validate reason up to 500 chars', () => {
    const result = EquipmentDeleteRequestSchema.safeParse({
      reason: 'a'.repeat(500),
    });
    expect(result.success).toBe(true);
  });

  it('should reject reason over 500 chars', () => {
    const result = EquipmentDeleteRequestSchema.safeParse({
      reason: 'a'.repeat(501),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('reason'))).toBe(true);
    }
  });
});
