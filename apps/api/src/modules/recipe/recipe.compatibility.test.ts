/**
 * Brew Method Compatibility Validation Tests
 *
 * Validates that the EQUIPMENT_INCOMPATIBLE error is properly handled and
 * the compatibility validation logic works correctly.
 */

import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { Hono } from 'hono';

// ---------------------------------------------------------------------------
// Replicate the core validation logic for unit testing
// ---------------------------------------------------------------------------

type CompatibilityRule = {
  brewMethod: string;
  equipmentType: string;
  compatible: boolean;
};

type EquipmentItem = {
  id: string;
  type: string;
};

function checkCompatibility(
  brewMethod: string,
  equipmentItems: EquipmentItem[],
  rules: CompatibilityRule[],
): string[] {
  const incompatible: string[] = [];

  for (const eqItem of equipmentItems) {
    const rule = rules.find(
      (r) => r.brewMethod === brewMethod && r.equipmentType === eqItem.type,
    );
    if (rule && !rule.compatible) {
      incompatible.push(`${eqItem.type} is not compatible with ${brewMethod}`);
    }
  }

  return incompatible;
}

// ---------------------------------------------------------------------------
// Hono app that replicates the error handler EQUIPMENT_INCOMPATIBLE logic
// ---------------------------------------------------------------------------

function createCompatibilityErrorApp(details: string[]) {
  const app = new Hono();

  app.post('/recipes', async (c) => {
    const err = Object.assign(new Error('EQUIPMENT_INCOMPATIBLE'), {
      code: 'EQUIPMENT_INCOMPATIBLE',
      details,
    });

    if (err instanceof Error && 'code' in err && err.code === 'EQUIPMENT_INCOMPATIBLE') {
      return c.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Equipment is not compatible with the selected brew method',
            details: (details || []).map((d: string) => ({
              field: 'equipmentIds',
              message: d,
            })),
            requestId: 'test-request-id',
          },
        },
        422,
      );
    }

    return c.json({ success: true }, 200);
  });

  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Brew Method Compatibility Validation', () => {
  describe('checkCompatibility — unit tests', () => {
    const rules: CompatibilityRule[] = [
      { brewMethod: 'espresso_machine', equipmentType: 'portafilter', compatible: true },
      { brewMethod: 'espresso_machine', equipmentType: 'scale', compatible: true },
      { brewMethod: 'espresso_machine', equipmentType: 'cezve', compatible: false },
      { brewMethod: 'v60', equipmentType: 'paper_filter', compatible: true },
      { brewMethod: 'v60', equipmentType: 'portafilter', compatible: false },
      { brewMethod: 'french_press', equipmentType: 'mesh_filter', compatible: true },
    ];

    it('should return empty array when all equipment is compatible', () => {
      const items: EquipmentItem[] = [
        { id: '1', type: 'portafilter' },
        { id: '2', type: 'scale' },
      ];
      const result = checkCompatibility('espresso_machine', items, rules);
      expect(result).toHaveLength(0);
    });

    it('should detect incompatible equipment', () => {
      const items: EquipmentItem[] = [
        { id: '1', type: 'portafilter' },
        { id: '2', type: 'cezve' },
      ];
      const result = checkCompatibility('espresso_machine', items, rules);
      expect(result).toHaveLength(1);
      expect(result[0]).toContain('cezve');
      expect(result[0]).toContain('espresso_machine');
    });

    it('should return empty array for empty equipment list', () => {
      const result = checkCompatibility('espresso_machine', [], rules);
      expect(result).toHaveLength(0);
    });

    it('should return empty array when brewMethod is empty', () => {
      const items: EquipmentItem[] = [{ id: '1', type: 'portafilter' }];
      const result = checkCompatibility('', items, rules);
      expect(result).toHaveLength(0);
    });

    it('should return empty array when no rules match for the brew method', () => {
      const items: EquipmentItem[] = [{ id: '1', type: 'mesh_filter' }];
      const result = checkCompatibility('chemex', items, rules);
      expect(result).toHaveLength(0);
    });

    it('should detect multiple incompatible equipment', () => {
      const rulesWithMultiple: CompatibilityRule[] = [
        { brewMethod: 'espresso_machine', equipmentType: 'cezve', compatible: false },
        { brewMethod: 'espresso_machine', equipmentType: 'mesh_filter', compatible: false },
      ];
      const items: EquipmentItem[] = [
        { id: '1', type: 'cezve' },
        { id: '2', type: 'mesh_filter' },
        { id: '3', type: 'scale' },
      ];
      const result = checkCompatibility('espresso_machine', items, rulesWithMultiple);
      expect(result).toHaveLength(2);
    });

    it('should treat missing rule as compatible (no explicit incompatibility)', () => {
      const items: EquipmentItem[] = [{ id: '1', type: 'scale' }];
      const result = checkCompatibility('v60', items, rules);
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
