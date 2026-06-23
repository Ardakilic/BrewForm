// Feature: complete-openapi-docs, Property 9: Every Output Schema accepts a representative service payload
//
// For any entity Output Schema (including every distinct returned variant —
// taste hierarchy node vs flat note; user self vs row vs public; comment raw vs
// with-author vs with-replies; recipe with-author vs with-versions vs feed),
// parsing a representative payload that populates every field the corresponding
// service returns — scalar columns, joined objects, related-entity arrays,
// count fields, and boolean flags — succeeds with zero validation errors and
// yields parsed output equal to the input.
//
// Validates: Requirements 7.1, 7.2, 7.3, 12.4
import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import type { z } from 'zod';
import fc from 'npm:fast-check';

import { AuthorRefSchema, MessageResponseSchema, RecipeAuthorMiniSchema } from './_shared.ts';
import { BeanOutputSchema } from './bean.ts';
import { BadgeOutputSchema, UserBadgeOutputSchema } from './badge.ts';
import { VendorOutputSchema } from './vendor.ts';
import { PhotoOutputSchema } from './photo.ts';
import { ReportOutputSchema } from './report.ts';
import { SetupOutputSchema } from './setup.ts';
import { UserPreferencesOutputSchema } from './preference.ts';
import {
  FollowerListItemOutputSchema,
  FollowingListItemOutputSchema,
  FollowOutputSchema,
} from './follow.ts';
import { CoffeeVarietyOutputSchema } from './coffee-variety.ts';
import {
  EquipmentDeleteRequestOutputSchema,
  EquipmentDeleteRequestResponseSchema,
  EquipmentOutputSchema,
  EquipmentRecipesResponseSchema,
} from './equipment.ts';
import {
  FeedRecipeOutputSchema,
  RecipeDetailOutputSchema,
  RecipeRowSchema,
  RecipeVersionRowSchema,
  RecipeWithAuthorOutputSchema,
  RecipeWithVersionsOutputSchema,
} from './recipe.ts';
import {
  CommentOutputSchema,
  CommentWithAuthorOutputSchema,
  CommentWithRepliesOutputSchema,
} from './comment.ts';
import { TasteNoteNodeOutputSchema, TasteNoteOutputSchema } from './taste.ts';
import { PublicUserOutputSchema, SelfUserOutputSchema, UserRowOutputSchema } from './user.ts';

// ---------------------------------------------------------------------------
// Reusable building-block arbitraries — JSON-serializable values matching the
// wire shape (timestamps are strings, nullable columns may be null).
// ---------------------------------------------------------------------------
const str = fc.string();
const nstr = fc.option(fc.string(), { nil: null });
const bool = fc.boolean();
const int = fc.integer();
const nint = fc.option(fc.integer(), { nil: null });
const num = fc.double({ noNaN: true, noDefaultInfinity: true });
const nnum = fc.option(num, { nil: null });
const ts = fc.date({ noInvalidDate: true }).map((d) => d.toISOString());
const nStrArr = fc.option(fc.array(fc.string()), { nil: null });

const beanArb = fc.record({
  id: str,
  name: str,
  brand: nstr,
  vendorId: nstr,
  roaster: nstr,
  roastLevel: nstr,
  processing: nstr,
  origin: nstr,
  userId: str,
  createdAt: ts,
  updatedAt: ts,
  deletedAt: fc.option(ts, { nil: null }),
});

const badgeArb = fc.record({
  id: str,
  name: str,
  icon: str,
  description: str,
  rule: str,
  threshold: int,
  createdAt: ts,
  updatedAt: ts,
});

const userBadgeArb = fc.record({
  id: str,
  userId: str,
  badgeId: str,
  awardedAt: ts,
  badge: fc.option(
    fc.record({
      id: str,
      name: str,
      icon: str,
      description: str,
      rule: str,
      threshold: int,
    }),
    { nil: null },
  ),
});

const vendorArb = fc.record({
  id: str,
  name: str,
  website: nstr,
  description: nstr,
  createdBy: nstr,
  createdAt: ts,
  updatedAt: ts,
  deletedAt: fc.option(ts, { nil: null }),
});

const photoArb = fc.record({
  id: str,
  recipeId: str,
  url: str,
  thumbnailUrl: nstr,
  alt: nstr,
  sortOrder: int,
  createdAt: ts,
  deletedAt: fc.option(ts, { nil: null }),
});

const reportArb = fc.record({
  id: str,
  reporterId: str,
  entityType: str,
  entityId: str,
  reason: str,
  status: str,
  resolvedAt: fc.option(ts, { nil: null }),
  resolvedBy: nstr,
  createdAt: ts,
  updatedAt: ts,
});

const setupArb = fc.record({
  id: str,
  name: str,
  userId: str,
  brewerDetails: nstr,
  grinder: nstr,
  portafilterId: nstr,
  basketId: nstr,
  puckScreenId: nstr,
  paperFilterId: nstr,
  tamperId: nstr,
  isDefault: bool,
  createdAt: ts,
  updatedAt: ts,
  deletedAt: fc.option(ts, { nil: null }),
});

const preferencesArb = fc.record({
  id: str,
  userId: str,
  unitSystem: str,
  temperatureUnit: str,
  theme: str,
  locale: str,
  timezone: str,
  dateFormat: str,
  newFollower: bool,
  recipeLiked: bool,
  recipeCommented: bool,
  followedUserPosted: bool,
  createdAt: ts,
  updatedAt: ts,
});

const followArb = fc.record({
  id: str,
  followerId: str,
  followingId: str,
  createdAt: ts,
});

const followProfileArb = fc.record({
  id: str,
  username: str,
  displayName: nstr,
  avatarUrl: nstr,
  bio: nstr,
});

const followerListItemArb = fc.record({
  id: str,
  followerId: str,
  followingId: str,
  createdAt: ts,
  follower: followProfileArb,
});

const followingListItemArb = fc.record({
  id: str,
  followerId: str,
  followingId: str,
  createdAt: ts,
  following: followProfileArb,
});

const coffeeVarietyArb = fc.record({
  id: str,
  name: str,
  category: str,
  species: nstr,
  origin: nstr,
  spread: nstr,
  altitudeRangeM: nstr,
  cupProfile: nstr,
  body: nstr,
  acidity: nstr,
  caffeinePct: nstr,
  processingCompatibility: nStrArr,
  diseaseResistance: nstr,
  yield: nstr,
  plantSize: nstr,
  notes: nstr,
  subVarieties: nStrArr,
  fermentation: nstr,
  dryingTimeDays: nstr,
  dryingMethod: nstr,
  mucilageRetentionPct: nstr,
  priceRange: nstr,
  processing: nstr,
  typeLabel: nstr,
  notableFarms: nStrArr,
  notableRegions: nStrArr,
  regionalVariants: nStrArr,
  globalSharePct: nstr,
  isSystem: bool,
  createdBy: nstr,
  createdAt: ts,
  updatedAt: ts,
  deletedAt: fc.option(ts, { nil: null }),
});

const equipmentArb = fc.record({
  id: str,
  name: str,
  type: str,
  brand: nstr,
  model: nstr,
  description: nstr,
  createdBy: nstr,
  isSystem: bool,
  createdAt: ts,
  updatedAt: ts,
  deletedAt: fc.option(ts, { nil: null }),
});

const equipmentDeleteRequestArb = fc.record({
  id: str,
  equipmentId: str,
  requestedById: str,
  reason: nstr,
  status: str,
  reviewedById: nstr,
  reviewedAt: fc.option(ts, { nil: null }),
  createdAt: ts,
  deletedAt: fc.option(ts, { nil: null }),
});

const equipmentDeleteRequestResponseArb = fc.record({
  success: fc.constant(true as const),
  data: equipmentDeleteRequestArb,
});

const recipeRowArb = fc.record({
  id: str,
  slug: str,
  title: str,
  authorId: str,
  visibility: str,
  currentVersionId: nstr,
  likeCount: int,
  commentCount: int,
  forkCount: int,
  forkedFromId: nstr,
  featured: bool,
  createdAt: ts,
  updatedAt: ts,
  deletedAt: fc.option(ts, { nil: null }),
});

const miniAuthorArb = fc.record({
  username: str,
  displayName: nstr,
  avatarUrl: nstr,
});

const recipeWithAuthorArb = fc.record({
  id: str,
  slug: str,
  title: str,
  authorId: str,
  visibility: str,
  currentVersionId: nstr,
  likeCount: int,
  commentCount: int,
  forkCount: int,
  forkedFromId: nstr,
  featured: bool,
  createdAt: ts,
  updatedAt: ts,
  deletedAt: fc.option(ts, { nil: null }),
  author: miniAuthorArb,
});

const versionPhotoArb = fc.record({
  id: str,
  recipeVersionId: str,
  photoId: str,
  sortOrder: int,
  photo: photoArb,
});

const recipeVersionArb = fc.record({
  id: str,
  recipeId: str,
  versionNumber: int,
  productName: nstr,
  coffeeBrand: nstr,
  coffeeProcessing: nstr,
  vendorId: nstr,
  roastDate: nstr,
  packageOpenDate: nstr,
  grindDate: nstr,
  brewDate: ts,
  brewMethod: str,
  drinkType: str,
  brewerDetails: nstr,
  grinder: nstr,
  grindSize: nstr,
  groundWeightGrams: nnum,
  extractionTimeSeconds: nint,
  extractionVolumeMl: nnum,
  temperatureCelsius: nnum,
  tds: nstr,
  brewRatio: nnum,
  flowRate: nnum,
  preInfusionTimeSeconds: nint,
  beanId: nstr,
  coffeeVarietyId: nstr,
  coffeeVarietyName: nstr,
  personalNotes: nstr,
  preparationNotes: str,
  isFavourite: bool,
  rating: nint,
  emojiTag: nstr,
  createdAt: ts,
  versionPhotos: fc.array(versionPhotoArb),
});

const recipeWithVersionsArb = recipeWithAuthorArb.chain((base) =>
  fc.array(recipeVersionArb).map((versions) => ({ ...base, versions }))
);

const feedRecipeArb = recipeRowArb.chain((base) =>
  fc.record({ id: str, username: str, displayName: nstr }).map((author) => ({ ...base, author }))
);

const authorRefArb = fc.option(
  fc.record({ id: str, username: str, displayName: nstr, avatarUrl: nstr }),
  { nil: null },
);

const commentArb = fc.record({
  id: str,
  recipeId: str,
  authorId: str,
  content: str,
  parentCommentId: nstr,
  createdAt: ts,
  updatedAt: ts,
  deletedAt: fc.option(ts, { nil: null }),
});

const commentWithAuthorArb = fc.record({
  id: str,
  recipeId: str,
  authorId: str,
  content: str,
  parentCommentId: nstr,
  createdAt: ts,
  updatedAt: ts,
  deletedAt: fc.option(ts, { nil: null }),
  author: authorRefArb,
});

const commentWithRepliesArb = commentWithAuthorArb.chain((base) =>
  fc.array(commentWithAuthorArb).map((replies) => ({ ...base, replies }))
);

const tasteNoteArb = fc.record({
  id: str,
  name: str,
  parentId: nstr,
  color: nstr,
  definition: nstr,
  depth: int,
  createdAt: ts,
  deletedAt: fc.option(ts, { nil: null }),
});

// Recursive taste-note node (bounded depth via fc.letrec).
const { tasteNoteNode } = fc.letrec<{ tasteNoteNode: unknown }>((tie) => ({
  tasteNoteNode: fc.record({
    id: str,
    name: str,
    parentId: nstr,
    color: nstr,
    definition: nstr,
    depth: int,
    createdAt: ts,
    deletedAt: fc.option(ts, { nil: null }),
    children: fc.oneof(
      { depthSize: 'small' },
      fc.constant([]),
      fc.array(tie('tasteNoteNode'), { maxLength: 3 }),
    ),
  }),
}));

const detailAuthorArb = fc.record({
  id: str,
  username: str,
  displayName: nstr,
  avatarUrl: nstr,
});

const detailTasteNoteArb = fc.record({
  id: str,
  recipeVersionId: str,
  tasteNoteId: str,
  intensity: int,
  tasteNote: tasteNoteArb,
});

const detailEquipmentArb = fc.record({
  id: str,
  recipeVersionId: str,
  equipmentId: str,
  equipment: equipmentArb,
});

const detailAdditionalPreparationArb = fc.record({
  id: str,
  recipeVersionId: str,
  name: str,
  type: str,
  inputAmount: str,
  preparationType: str,
  sortOrder: int,
});

const detailBeanArb = fc.option(
  fc.record({ origin: nstr, roaster: nstr, roastLevel: nstr }),
  { nil: null },
);

const detailVersionArb = recipeVersionArb.chain((base) =>
  fc
    .record({
      tasteNotes: fc.array(detailTasteNoteArb),
      equipment: fc.array(detailEquipmentArb),
      additionalPreparations: fc.array(detailAdditionalPreparationArb),
      bean: detailBeanArb,
    })
    .map((extra) => ({ ...base, ...extra }))
);

const forkedFromArb = fc.option(
  fc.record({ id: str, slug: str, title: str }),
  { nil: null },
);

const recipeDetailArb = recipeRowArb.chain((base) =>
  fc
    .record({
      author: detailAuthorArb,
      versions: fc.array(detailVersionArb),
      photos: fc.array(photoArb),
      forkedFrom: forkedFromArb,
    })
    .map((extra) => ({ ...base, ...extra }))
);

const userBaseArb = {
  id: str,
  email: str,
  emailVerifiedAt: fc.option(ts, { nil: null }),
  username: str,
  displayName: nstr,
  avatarUrl: nstr,
  bio: nstr,
  onboardingCompleted: bool,
  isAdmin: bool,
  isBanned: bool,
  createdAt: ts,
  updatedAt: ts,
  deletedAt: fc.option(ts, { nil: null }),
};

const userRowArb = fc.record({ ...userBaseArb });

const selfPreferencesArb = fc.option(
  fc.record({
    unitSystem: str,
    temperatureUnit: str,
    theme: str,
    locale: str,
    timezone: str,
    dateFormat: str,
    emailNotifications: fc.record({
      newFollower: bool,
      recipeLiked: bool,
      recipeCommented: bool,
      followedUserPosted: bool,
    }),
  }),
  { nil: null },
);

const selfUserArb = fc.record({
  ...userBaseArb,
  preferences: selfPreferencesArb,
  recipeCount: int,
  followerCount: int,
  followingCount: int,
});

const { email: _omitEmail, ...userBaseNoEmail } = userBaseArb;
const publicUserArb = fc.record({
  ...userBaseNoEmail,
  recipeCount: int,
  followerCount: int,
  followingCount: int,
  recipes: fc.array(fc.record({
    id: str,
    slug: str,
    title: str,
    likeCount: int,
    commentCount: int,
    createdAt: ts,
    currentVersion: fc.option(
      fc.record({ brewMethod: str, drinkType: str }),
      { nil: null },
    ),
  })),
  badges: fc.constant([]),
  isFollowing: bool,
});

const messageArb = fc.record({ message: str });
const authorRefCaseArb = authorRefArb;
const recipeAuthorMiniArb = miniAuthorArb;

// ---------------------------------------------------------------------------
// Cases — one per Output Schema / distinct variant.
// ---------------------------------------------------------------------------
// deno-lint-ignore no-explicit-any
const cases: Array<{ name: string; schema: z.ZodType<any>; arb: fc.Arbitrary<unknown> }> = [
  { name: 'MessageResponseSchema', schema: MessageResponseSchema, arb: messageArb },
  { name: 'AuthorRefSchema', schema: AuthorRefSchema, arb: authorRefCaseArb },
  { name: 'RecipeAuthorMiniSchema', schema: RecipeAuthorMiniSchema, arb: recipeAuthorMiniArb },
  { name: 'BeanOutputSchema', schema: BeanOutputSchema, arb: beanArb },
  { name: 'BadgeOutputSchema', schema: BadgeOutputSchema, arb: badgeArb },
  { name: 'UserBadgeOutputSchema', schema: UserBadgeOutputSchema, arb: userBadgeArb },
  { name: 'VendorOutputSchema', schema: VendorOutputSchema, arb: vendorArb },
  { name: 'PhotoOutputSchema', schema: PhotoOutputSchema, arb: photoArb },
  { name: 'ReportOutputSchema', schema: ReportOutputSchema, arb: reportArb },
  { name: 'SetupOutputSchema', schema: SetupOutputSchema, arb: setupArb },
  { name: 'UserPreferencesOutputSchema', schema: UserPreferencesOutputSchema, arb: preferencesArb },
  { name: 'FollowOutputSchema', schema: FollowOutputSchema, arb: followArb },
  {
    name: 'FollowerListItemOutputSchema',
    schema: FollowerListItemOutputSchema,
    arb: followerListItemArb,
  },
  {
    name: 'FollowingListItemOutputSchema',
    schema: FollowingListItemOutputSchema,
    arb: followingListItemArb,
  },
  { name: 'CoffeeVarietyOutputSchema', schema: CoffeeVarietyOutputSchema, arb: coffeeVarietyArb },
  { name: 'EquipmentOutputSchema', schema: EquipmentOutputSchema, arb: equipmentArb },
  {
    name: 'EquipmentDeleteRequestOutputSchema',
    schema: EquipmentDeleteRequestOutputSchema,
    arb: equipmentDeleteRequestArb,
  },
  {
    name: 'EquipmentDeleteRequestResponseSchema',
    schema: EquipmentDeleteRequestResponseSchema,
    arb: equipmentDeleteRequestResponseArb,
  },
  { name: 'RecipeRowSchema', schema: RecipeRowSchema, arb: recipeRowArb },
  {
    name: 'RecipeWithAuthorOutputSchema',
    schema: RecipeWithAuthorOutputSchema,
    arb: recipeWithAuthorArb,
  },
  { name: 'RecipeVersionRowSchema', schema: RecipeVersionRowSchema, arb: recipeVersionArb },
  {
    name: 'RecipeWithVersionsOutputSchema',
    schema: RecipeWithVersionsOutputSchema,
    arb: recipeWithVersionsArb,
  },
  { name: 'FeedRecipeOutputSchema', schema: FeedRecipeOutputSchema, arb: feedRecipeArb },
  { name: 'RecipeDetailOutputSchema', schema: RecipeDetailOutputSchema, arb: recipeDetailArb },
  {
    name: 'EquipmentRecipesResponseSchema',
    schema: EquipmentRecipesResponseSchema,
    arb: fc.record({
      success: fc.constant(true as const),
      data: fc.array(recipeWithAuthorArb),
      total: int,
    }),
  },
  { name: 'CommentOutputSchema', schema: CommentOutputSchema, arb: commentArb },
  {
    name: 'CommentWithAuthorOutputSchema',
    schema: CommentWithAuthorOutputSchema,
    arb: commentWithAuthorArb,
  },
  {
    name: 'CommentWithRepliesOutputSchema',
    schema: CommentWithRepliesOutputSchema,
    arb: commentWithRepliesArb,
  },
  { name: 'TasteNoteOutputSchema', schema: TasteNoteOutputSchema, arb: tasteNoteArb },
  { name: 'TasteNoteNodeOutputSchema', schema: TasteNoteNodeOutputSchema, arb: tasteNoteNode },
  { name: 'UserRowOutputSchema', schema: UserRowOutputSchema, arb: userRowArb },
  { name: 'SelfUserOutputSchema', schema: SelfUserOutputSchema, arb: selfUserArb },
  { name: 'PublicUserOutputSchema', schema: PublicUserOutputSchema, arb: publicUserArb },
];

describe('Property 9: every Output Schema accepts a representative generated payload', () => {
  for (const { name, schema, arb } of cases) {
    it(`${name} parses and round-trips representative payloads`, () => {
      fc.assert(
        fc.property(arb, (payload) => {
          const result = schema.safeParse(payload);
          expect(result.success).toBe(true);
          if (result.success) {
            expect(result.data).toEqual(payload);
          }
        }),
        { numRuns: 100 },
      );
    });
  }
});
