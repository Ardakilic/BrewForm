import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import {
  EquipmentDeleteRequestOutputSchema,
  EquipmentDeleteRequestResponseSchema,
  EquipmentOutputSchema,
  EquipmentRecipesResponseSchema,
} from './equipment.ts';

function wire<T>(payload: T): unknown {
  return JSON.parse(JSON.stringify(payload));
}

const equipmentRow = {
  id: 'eq-1',
  name: 'Hario V60',
  type: 'dripper',
  brand: 'Hario',
  model: 'VDC-02',
  description: null,
  createdBy: null,
  isSystem: true,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  deletedAt: null,
};

const deleteRequestRow = {
  id: 'edr-1',
  equipmentId: 'eq-1',
  requestedById: 'user-1',
  reason: 'Duplicate entry',
  status: 'pending',
  reviewedById: null,
  reviewedAt: null,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  deletedAt: null,
};

const recipeWithAuthor = {
  id: 'recipe-1',
  slug: 'my-pour-over',
  title: 'My Pour Over',
  authorId: 'user-1',
  visibility: 'public',
  currentVersionId: 'rv-1',
  likeCount: 0,
  commentCount: 0,
  forkCount: 0,
  forkedFromId: null,
  featured: false,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  deletedAt: null,
  author: { username: 'barista', displayName: null, avatarUrl: null },
};

describe('EquipmentOutputSchema', () => {
  it('parses a full equipment row and round-trips', () => {
    const result = EquipmentOutputSchema.safeParse(wire(equipmentRow));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(wire(equipmentRow));
  });
});

describe('EquipmentDeleteRequestOutputSchema', () => {
  it('parses a delete-request row and round-trips', () => {
    const result = EquipmentDeleteRequestOutputSchema.safeParse(wire(deleteRequestRow));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(wire(deleteRequestRow));
  });
});

describe('EquipmentDeleteRequestResponseSchema (bespoke, no meta)', () => {
  it('parses { success, data } with no meta wrapper', () => {
    const payload = { success: true as const, data: deleteRequestRow };
    const result = EquipmentDeleteRequestResponseSchema.safeParse(wire(payload));
    expect(result.success).toBe(true);
  });

  it('rejects when a meta wrapper is present-but-data-missing shape is malformed', () => {
    const payload = { success: true, data: { id: 'edr-1' } };
    expect(EquipmentDeleteRequestResponseSchema.safeParse(payload).success).toBe(false);
  });
});

describe('EquipmentRecipesResponseSchema (bespoke, total instead of meta)', () => {
  it('parses { success, data[], total } with no meta wrapper', () => {
    const payload = { success: true as const, data: [recipeWithAuthor], total: 1 };
    const result = EquipmentRecipesResponseSchema.safeParse(wire(payload));
    expect(result.success).toBe(true);
  });

  it('rejects a non-integer total', () => {
    const payload = { success: true, data: [], total: 1.5 };
    expect(EquipmentRecipesResponseSchema.safeParse(payload).success).toBe(false);
  });
});
