import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import {
  CollectionDetailOutputSchema,
  CollectionItemOutputSchema,
  CollectionListItemOutputSchema,
  CollectionOutputSchema,
} from './collection.ts';

/** Normalize to JSON wire shape (Dates → ISO strings) before parsing. */
function wire<T>(payload: T): unknown {
  return JSON.parse(JSON.stringify(payload));
}

const collectionRow = {
  id: 'col-1',
  userId: 'user-1',
  name: 'My V60s',
  description: 'Best V60 recipes',
  visibility: 'public',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  deletedAt: null,
};

const miniAuthor = {
  username: 'barista',
  displayName: 'Barista',
  avatarUrl: null,
};

const recipeListItem = {
  id: 'recipe-1',
  slug: 'my-v60-recipe',
  title: 'My V60 Recipe',
  authorId: 'user-1',
  visibility: 'public',
  currentVersionId: null,
  likeCount: 5,
  commentCount: 2,
  forkCount: 0,
  forkedFromId: null,
  featured: false,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  deletedAt: null,
  author: { id: 'user-1', username: 'barista', displayName: 'Barista' },
};

const collectionItem = {
  id: 'item-1',
  collectionId: 'col-1',
  recipeId: 'recipe-1',
  sortOrder: 0,
  createdAt: '2024-01-01T00:00:00.000Z',
  recipe: recipeListItem,
};

describe('CollectionOutputSchema', () => {
  it('parses a collection row and round-trips', () => {
    const result = CollectionOutputSchema.safeParse(wire(collectionRow));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(wire(collectionRow));
  });
});

describe('CollectionListItemOutputSchema', () => {
  it('parses a list item with recipeCount and round-trips', () => {
    const payload = { ...collectionRow, recipeCount: 3 };
    const result = CollectionListItemOutputSchema.safeParse(wire(payload));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(wire(payload));
  });

  it('rejects a list item missing recipeCount', () => {
    const result = CollectionListItemOutputSchema.safeParse(wire(collectionRow));
    expect(result.success).toBe(false);
  });
});

describe('CollectionItemOutputSchema', () => {
  it('parses a collection item with nested recipe and round-trips', () => {
    const result = CollectionItemOutputSchema.safeParse(wire(collectionItem));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(wire(collectionItem));
  });

  it('rejects a collection item missing the recipe', () => {
    const { recipe: _recipe, ...rest } = collectionItem;
    const result = CollectionItemOutputSchema.safeParse(wire(rest));
    expect(result.success).toBe(false);
  });
});

describe('CollectionDetailOutputSchema', () => {
  it('parses a full detail payload with author, items, recipeCount and round-trips', () => {
    const payload = {
      ...collectionRow,
      author: miniAuthor,
      items: [collectionItem],
      recipeCount: 1,
    };
    const result = CollectionDetailOutputSchema.safeParse(wire(payload));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(wire(payload));
  });

  it('rejects a detail payload missing author', () => {
    const payload = {
      ...collectionRow,
      items: [],
      recipeCount: 0,
    };
    const result = CollectionDetailOutputSchema.safeParse(wire(payload));
    expect(result.success).toBe(false);
  });
});
