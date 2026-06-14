import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { PhotoOutputSchema } from './photo.ts';

function wire<T>(payload: T): unknown {
  return JSON.parse(JSON.stringify(payload));
}

describe('PhotoOutputSchema', () => {
  it('parses a representative photo row and round-trips', () => {
    const payload = {
      id: 'photo-1',
      recipeId: 'recipe-1',
      url: 'https://cdn/p.jpg',
      thumbnailUrl: 'https://cdn/p-thumb.jpg',
      alt: 'A pour over',
      sortOrder: 0,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      deletedAt: null,
    };
    const result = PhotoOutputSchema.safeParse(wire(payload));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(wire(payload));
  });

  it('rejects a non-integer sortOrder', () => {
    const payload = {
      id: 'photo-1',
      recipeId: 'recipe-1',
      url: 'https://cdn/p.jpg',
      thumbnailUrl: null,
      alt: null,
      sortOrder: 1.5,
      createdAt: '2024-01-01T00:00:00.000Z',
      deletedAt: null,
    };
    expect(PhotoOutputSchema.safeParse(payload).success).toBe(false);
  });
});
