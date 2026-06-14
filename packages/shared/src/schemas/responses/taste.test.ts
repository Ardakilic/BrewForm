import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { TasteNoteNodeOutputSchema, TasteNoteOutputSchema } from './taste.ts';

function wire<T>(payload: T): unknown {
  return JSON.parse(JSON.stringify(payload));
}

const flatNote = {
  id: 'tn-1',
  name: 'Fruity',
  parentId: null,
  color: '#ff0000',
  definition: 'Fruit-forward notes',
  depth: 0,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  deletedAt: null,
};

describe('TasteNoteOutputSchema', () => {
  it('parses a flat taste-note row and round-trips', () => {
    const result = TasteNoteOutputSchema.safeParse(wire(flatNote));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(wire(flatNote));
  });
});

describe('TasteNoteNodeOutputSchema (recursive hierarchy)', () => {
  it('parses a nested hierarchy node with children[] and round-trips', () => {
    const node = {
      ...flatNote,
      children: [
        {
          id: 'tn-2',
          name: 'Berry',
          parentId: 'tn-1',
          color: null,
          definition: null,
          depth: 1,
          createdAt: new Date('2024-01-01T00:00:00.000Z'),
          deletedAt: null,
          children: [
            {
              id: 'tn-3',
              name: 'Blueberry',
              parentId: 'tn-2',
              color: null,
              definition: null,
              depth: 2,
              createdAt: new Date('2024-01-01T00:00:00.000Z'),
              deletedAt: null,
              children: [],
            },
          ],
        },
      ],
    };
    const result = TasteNoteNodeOutputSchema.safeParse(wire(node));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(wire(node));
  });

  it('rejects a node missing the children array', () => {
    expect(TasteNoteNodeOutputSchema.safeParse(wire(flatNote)).success).toBe(false);
  });
});
