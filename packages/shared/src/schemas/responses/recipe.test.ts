import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import {
  FeedRecipeOutputSchema,
  RecipeRowSchema,
  RecipeVersionRowSchema,
  RecipeWithAuthorOutputSchema,
  RecipeWithVersionsOutputSchema,
} from './recipe.ts';

function wire<T>(payload: T): unknown {
  return JSON.parse(JSON.stringify(payload));
}

const recipeRow = {
  id: 'recipe-1',
  slug: 'my-pour-over',
  title: 'My Pour Over',
  authorId: 'user-1',
  visibility: 'public',
  currentVersionId: 'rv-1',
  likeCount: 12,
  commentCount: 3,
  forkCount: 1,
  forkedFromId: null,
  featured: false,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  updatedAt: new Date('2024-01-02T00:00:00.000Z'),
  deletedAt: null,
};

const versionRow = {
  id: 'rv-1',
  recipeId: 'recipe-1',
  versionNumber: 1,
  productName: 'Yirgacheffe',
  coffeeBrand: 'Acme',
  coffeeProcessing: 'washed',
  vendorId: null,
  roastDate: null,
  packageOpenDate: null,
  grindDate: null,
  brewDate: new Date('2024-01-01T08:00:00.000Z'),
  brewMethod: 'v60',
  drinkType: 'filter',
  brewerDetails: 'Hario V60-02',
  grinder: 'Comandante',
  grindSize: '24 clicks',
  groundWeightGrams: 15.5,
  extractionTimeSeconds: 150,
  extractionVolumeMl: 250,
  temperatureCelsius: 93.5,
  tds: '1.38',
  brewRatio: 16.6,
  flowRate: 1.7,
  preInfusionTimeSeconds: 30,
  beanId: null,
  coffeeVarietyId: null,
  coffeeVarietyName: null,
  personalNotes: null,
  preparationNotes: 'Bloom 45s',
  isFavourite: false,
  rating: 8,
  emojiTag: null,
  createdAt: new Date('2024-01-01T08:05:00.000Z'),
  versionPhotos: [
    {
      id: 'rvp-1',
      recipeVersionId: 'rv-1',
      photoId: 'photo-1',
      sortOrder: 0,
      photo: {
        id: 'photo-1',
        recipeId: 'recipe-1',
        url: 'https://cdn/p.jpg',
        thumbnailUrl: null,
        alt: null,
        sortOrder: 0,
        createdAt: new Date('2024-01-01T08:06:00.000Z'),
        deletedAt: null,
      },
    },
  ],
};

const miniAuthor = { username: 'barista', displayName: 'Barista', avatarUrl: null };

describe('RecipeRowSchema', () => {
  it('parses a full recipe row with count fields and round-trips', () => {
    const result = RecipeRowSchema.safeParse(wire(recipeRow));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(wire(recipeRow));
  });
});

describe('RecipeVersionRowSchema', () => {
  it('parses a version row with versionPhotos[] and round-trips', () => {
    const result = RecipeVersionRowSchema.safeParse(wire(versionRow));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(wire(versionRow));
  });
});

describe('RecipeWithAuthorOutputSchema', () => {
  it('parses a recipe + mini author (equipment recipes) and round-trips', () => {
    const payload = { ...recipeRow, author: miniAuthor };
    const result = RecipeWithAuthorOutputSchema.safeParse(wire(payload));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(wire(payload));
  });
});

describe('RecipeWithVersionsOutputSchema', () => {
  it('parses a recipe + author + versions[] (coffee-variety recipes) and round-trips', () => {
    const payload = { ...recipeRow, author: miniAuthor, versions: [versionRow] };
    const result = RecipeWithVersionsOutputSchema.safeParse(wire(payload));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(wire(payload));
  });
});

describe('FeedRecipeOutputSchema', () => {
  it('parses a feed recipe with the id/username/displayName author projection', () => {
    const payload = {
      ...recipeRow,
      author: { id: 'user-1', username: 'barista', displayName: null },
    };
    const result = FeedRecipeOutputSchema.safeParse(wire(payload));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(wire(payload));
  });
});
