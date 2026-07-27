/**
 * Brew Method Compatibility Validation Tests
 *
 * Validates that the EQUIPMENT_INCOMPATIBLE error is properly handled and
 * the compatibility validation logic works correctly.
 */

import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { Hono } from 'hono';
import {
  checkEquipmentCompatibility,
  type CompatibilityCheckItem,
  type CompatibilityRule,
} from './service.ts';
import { errorHandler } from '../../middleware/errorHandler.ts';

// ---------------------------------------------------------------------------
// Hono app that uses the real error handler for EQUIPMENT_INCOMPATIBLE
// ---------------------------------------------------------------------------

function createCompatibilityErrorApp(details: string[]) {
  const app = new Hono().onError(errorHandler);

  app.post('/recipes', (_c) => {
    const err = Object.assign(new Error('EQUIPMENT_INCOMPATIBLE'), {
      code: 'EQUIPMENT_INCOMPATIBLE',
      details,
    });
    throw err;
  });

  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Brew Method Compatibility Validation', () => {
  describe('checkEquipmentCompatibility — unit tests', () => {
    const rules: CompatibilityRule[] = [
      { brewMethod: 'espresso_machine', equipmentType: 'portafilter', compatible: true },
      { brewMethod: 'espresso_machine', equipmentType: 'scale_accessory', compatible: true },
      { brewMethod: 'espresso_machine', equipmentType: 'cezve', compatible: false },
      { brewMethod: 'v60', equipmentType: 'paper_filter', compatible: true },
      { brewMethod: 'v60', equipmentType: 'portafilter', compatible: false },
      { brewMethod: 'french_press', equipmentType: 'mesh_filter', compatible: true },
    ];

    it('should return empty array when all equipment is compatible', () => {
      const items: CompatibilityCheckItem[] = [
        { id: '1', type: 'portafilter' },
        { id: '2', type: 'scale_accessory' },
      ];
      const result = checkEquipmentCompatibility(items, 'espresso_machine', rules);
      expect(result).toHaveLength(0);
    });

    it('should detect incompatible equipment', () => {
      const items: CompatibilityCheckItem[] = [
        { id: '1', type: 'portafilter' },
        { id: '2', type: 'cezve' },
      ];
      const result = checkEquipmentCompatibility(items, 'espresso_machine', rules);
      expect(result).toHaveLength(1);
      expect(result[0]).toContain('cezve');
      expect(result[0]).toContain('espresso_machine');
    });

    it('should return empty array for empty equipment list', () => {
      const result = checkEquipmentCompatibility([], 'espresso_machine', rules);
      expect(result).toHaveLength(0);
    });

    it('should return empty array when brewMethod is empty', () => {
      const items: CompatibilityCheckItem[] = [{ id: '1', type: 'portafilter' }];
      const result = checkEquipmentCompatibility(items, '', rules);
      expect(result).toHaveLength(0);
    });

    it('should return empty array when no rules match for the brew method', () => {
      const items: CompatibilityCheckItem[] = [{ id: '1', type: 'mesh_filter' }];
      const result = checkEquipmentCompatibility(items, 'chemex', rules);
      expect(result).toHaveLength(0);
    });

    it('should detect multiple incompatible equipment', () => {
      const rulesWithMultiple: CompatibilityRule[] = [
        { brewMethod: 'espresso_machine', equipmentType: 'cezve', compatible: false },
        { brewMethod: 'espresso_machine', equipmentType: 'mesh_filter', compatible: false },
      ];
      const items: CompatibilityCheckItem[] = [
        { id: '1', type: 'cezve' },
        { id: '2', type: 'mesh_filter' },
        { id: '3', type: 'scale_accessory' },
      ];
      const result = checkEquipmentCompatibility(items, 'espresso_machine', rulesWithMultiple);
      expect(result).toHaveLength(2);
    });

    it('should treat missing rule as compatible (no explicit incompatibility)', () => {
      const items: CompatibilityCheckItem[] = [{ id: '1', type: 'scale_accessory' }];
      const result = checkEquipmentCompatibility(items, 'v60', rules);
      expect(result).toHaveLength(0);
    });
  });

  describe('Error handler — EQUIPMENT_INCOMPATIBLE', () => {
    it('should return 422 with VALIDATION_ERROR code', async () => {
      const app = createCompatibilityErrorApp([
        'cezve is not compatible with espresso_machine',
      ]);

      const res = await app.request('/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brewMethod: 'espresso_machine', equipmentIds: ['eq-1'] }),
      });

      expect(res.status).toBe(422);
      const body = await res.json() as {
        success: boolean;
        error: { code: string; message: string; details: unknown[] };
      };
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toBe(
        'Equipment is not compatible with the selected brew method',
      );
    });

    it('should include details in the error response', async () => {
      const details = [
        'cezve is not compatible with espresso_machine',
        'portafilter is not compatible with v60',
      ];
      const app = createCompatibilityErrorApp(details);

      const res = await app.request('/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brewMethod: 'v60', equipmentIds: ['eq-1', 'eq-2'] }),
      });

      expect(res.status).toBe(422);
      const body = await res.json() as {
        success: boolean;
        error: { details: Array<{ field: string; message: string }> };
      };
      expect(body.error.details).toHaveLength(2);
      expect(body.error.details[0].field).toBe('equipmentIds');
      expect(body.error.details[0].message).toBe(details[0]);
      expect(body.error.details[1].field).toBe('equipmentIds');
      expect(body.error.details[1].message).toBe(details[1]);
    });

    it('should handle empty details array gracefully', async () => {
      const app = createCompatibilityErrorApp([]);

      const res = await app.request('/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brewMethod: 'espresso_machine', equipmentIds: [] }),
      });

      expect(res.status).toBe(422);
      const body = await res.json() as {
        success: boolean;
        error: { details: unknown[] };
      };
      expect(body.error.details).toHaveLength(0);
    });
  });
});
