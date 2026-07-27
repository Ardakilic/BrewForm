import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import {
  CollectionDetailOutputSchema,
  CollectionItemOutputSchema,
  CollectionItemRecipeOutputSchema,
  CollectionListItemOutputSchema,
  CollectionOutputSchema,
  PublicCollectionListItemOutputSchema,
  RecipeCollectionsOutputSchema,
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
  brewMethod: 'v60',
  drinkType: 'filter',
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

  it('parses a list item with containsRecipe true and round-trips', () => {
    const payload = { ...collectionRow, recipeCount: 3, containsRecipe: true };
    const result = CollectionListItemOutputSchema.safeParse(wire(payload));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(wire(payload));
  });

  it('parses a list item with containsRecipe false and round-trips', () => {
    const payload = { ...collectionRow, recipeCount: 3, containsRecipe: false };
    const result = CollectionListItemOutputSchema.safeParse(wire(payload));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(wire(payload));
  });

  it('parses a list item without containsRecipe (optional)', () => {
    const payload = { ...collectionRow, recipeCount: 3 };
    const result = CollectionListItemOutputSchema.safeParse(wire(payload));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.containsRecipe).toBeUndefined();
  });

  it('rejects a non-boolean containsRecipe', () => {
    const payload = { ...collectionRow, recipeCount: 3, containsRecipe: 'yes' };
    const result = CollectionListItemOutputSchema.safeParse(wire(payload));
    expect(result.success).toBe(false);
  });
});

describe('CollectionItemRecipeOutputSchema', () => {
  it('parses a recipe with brewMethod and drinkType', () => {
    const result = CollectionItemRecipeOutputSchema.safeParse(wire(recipeListItem));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.brewMethod).toBe('v60');
      expect(result.data.drinkType).toBe('filter');
    }
  });

  it('accepts null brewMethod and drinkType', () => {
    const payload = { ...recipeListItem, brewMethod: null, drinkType: null };
    const result = CollectionItemRecipeOutputSchema.safeParse(wire(payload));
    expect(result.success).toBe(true);
  });

  it('rejects a recipe missing brewMethod', () => {
    const { brewMethod: _bm, ...rest } = recipeListItem;
    const result = CollectionItemRecipeOutputSchema.safeParse(wire(rest));
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

  it('rejects a collection item whose recipe is missing brewMethod', () => {
    const { brewMethod: _bm, ...recipeNoBrew } = recipeListItem;
    const badItem = { ...collectionItem, recipe: recipeNoBrew };
    const result = CollectionItemOutputSchema.safeParse(wire(badItem));
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

describe('PublicCollectionListItemOutputSchema', () => {
  it('parses a list item with author and recipeCount', () => {
    const payload = { ...collectionRow, recipeCount: 3, author: miniAuthor };
    const result = PublicCollectionListItemOutputSchema.safeParse(wire(payload));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(wire(payload));
  });

  it('rejects a list item missing author', () => {
    const payload = { ...collectionRow, recipeCount: 3 };
    const result = PublicCollectionListItemOutputSchema.safeParse(wire(payload));
    expect(result.success).toBe(false);
  });
});

describe('RecipeCollectionsOutputSchema', () => {
  it('parses an array of minimal recipe-collection items', () => {
    const payload = [
      { id: 'col-1', name: 'My V60s', visibility: 'public', userId: 'user-1' },
      { id: 'col-2', name: 'Draft picks', visibility: 'draft', userId: 'user-2' },
    ];
    const result = RecipeCollectionsOutputSchema.safeParse(wire(payload));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(payload);
  });

  it('parses an empty array', () => {
    const result = RecipeCollectionsOutputSchema.safeParse([]);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual([]);
  });

  it('rejects an item missing userId', () => {
    const payload = [{ id: 'col-1', name: 'My V60s', visibility: 'public' }];
    const result = RecipeCollectionsOutputSchema.safeParse(wire(payload));
    expect(result.success).toBe(false);
  });

  it('rejects an item with an invalid visibility', () => {
    const payload = [{ id: 'col-1', name: 'My V60s', visibility: 'secret', userId: 'user-1' }];
    const result = RecipeCollectionsOutputSchema.safeParse(wire(payload));
    expect(result.success).toBe(false);
  });
});
