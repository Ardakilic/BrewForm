/**
 * Unit tests for the version-diff schemas in `responses/recipe.ts`:
 * VersionDiffOutputSchema, DiffFieldSchema, DiffStatusSchema,
 * VersionMetaSchema, and ListDiffSchema.
 */
import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { VersionDiffOutputSchema } from './responses/recipe.ts';

function validPayload() {
  return {
    version1: { id: 'v-1', versionNumber: 1, brewDate: '2024-01-01' },
    version2: { id: 'v-2', versionNumber: 2, brewDate: '2024-02-01' },
    fields: [
      { field: 'brewMethod', value1: 'v60', value2: 'aeropress', status: 'modified' },
      { field: 'ratio', value1: 16, value2: 15, status: 'modified' },
      { field: 'grindSize', value1: null, value2: 'medium', status: 'added' },
    ],
    tasteNotes: { added: ['floral'], removed: [], unchanged: ['chocolate'] },
    equipment: { added: [], removed: ['scale'], unchanged: ['kettle'] },
  };
}

describe('VersionDiffOutputSchema', () => {
  it('parses a complete valid payload', () => {
    const result = VersionDiffOutputSchema.safeParse(validPayload());
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(validPayload());
  });

  it('rejects an invalid diff status enum value', () => {
    const payload = validPayload();
    payload.fields[0].status = 'changed';
    expect(VersionDiffOutputSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects when the fields array is missing', () => {
    const { fields: _omit, ...rest } = validPayload();
    expect(VersionDiffOutputSchema.safeParse(rest).success).toBe(false);
  });
});
